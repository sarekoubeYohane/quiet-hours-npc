import { modelRequestBody, type ModelMessage, type ModelObservation } from './model-adapter';
import { awaitSignal, checkSignal, signalTiming } from './round-time-policy';
import type { TokenUsage } from './activities';
import type { ModelTransport } from './model-transport';

/** 腳本看得到的一次派送：任務本身，不含 Key，也不是供應商的請求格式。 */
export type ScriptedDispatch = {
  task: string; label: string; actorId?: string; provider: string; model: string;
  messages: ModelMessage[];
  /** 最後一則 user 訊息解析後的 JSON；不是 JSON 時為 undefined。 */
  input: unknown;
  contract: object; maxOutputTokens: number; attempt: number;
};
/** `reply` 是物件時以 JSON 送回，是字串時原樣當回覆文字；沒給 `usage` 代表供應商沒回報用量。 */
export type ScriptedReply = { reply: unknown; usage?: TokenUsage };

/**
 * 腳本模型：模型傳輸 interface 的測試用 adapter（#411、#413）。
 * 測試以它安排「這項模型任務回覆什麼」，不經 fetch。只能由伺服器端經 world route 的第二個參數帶入。
 * 決策實錄收到的送出內容，是正式傳輸會送出的同一份 request body。
 */
export function scriptedModel(script: (dispatch: ScriptedDispatch) => ScriptedReply | Promise<ScriptedReply>): ModelTransport & { dispatches: ScriptedDispatch[] } {
  const dispatches: ScriptedDispatch[] = [];
  return {
    dispatches,
    async send(request, hooks) {
      const { signal, requestId } = request;
      // 與正式傳輸相同：實錄失敗不改變模型任務的行為。
      const observe = async (event: ModelObservation) => { try { await hooks.observer?.(event); } catch { /* evidence only */ } };
      try {
        const requestBody = modelRequestBody(request.service, request.messages, request.contract, { maxOutputTokens: request.maxOutputTokens });
        checkSignal(signal);
        await awaitSignal(observe({ kind: 'prepared', requestId, requestBody, timing: signalTiming(signal) }), signal);
        if (hooks.beforeSend) await awaitSignal(hooks.beforeSend(requestId, signal), signal);
        checkSignal(signal);
        let input: unknown;
        try { input = JSON.parse(request.messages.findLast(message => message.role === 'user')?.content ?? ''); } catch { /* 不是 JSON 的訊息 */ }
        const dispatch: ScriptedDispatch = {
          task: request.task, label: request.label, actorId: request.actorId, provider: request.service.provider, model: request.service.model,
          messages: structuredClone(request.messages), input, contract: request.contract, maxOutputTokens: request.maxOutputTokens, attempt: request.attempt,
        };
        void observe({ kind: 'fetch-start', at: Date.now() });
        hooks.onSent();
        dispatches.push(dispatch);
        await awaitSignal(observe({ kind: 'dispatch', requestId, requestBody }), signal);
        const scripted = await awaitSignal(Promise.resolve(script(dispatch)), signal);
        const text = typeof scripted.reply === 'string' ? scripted.reply : JSON.stringify(scripted.reply);
        const at = Date.now();
        const observed = observe({ kind: 'response', responseBody: JSON.stringify({ scripted: true, content: text, ...(scripted.usage ? { usage: scripted.usage } : {}) }), httpStatus: 200, at, usage: scripted.usage });
        // 與正式傳輸相同：先開始結算用量，再等實錄寫完。
        const accounted = scripted.usage ? Promise.resolve(hooks.onUsage?.(scripted.usage)) : Promise.resolve();
        accounted.catch(() => {});
        await observed;
        await accounted;
        if (scripted.usage) await awaitSignal(observe({ kind: 'usage', usage: scripted.usage, at }), signal);
        await awaitSignal(observe({ kind: 'candidate', raw: text }), signal);
        checkSignal(signal);
        return { text, usage: scripted.usage };
      } finally { await hooks.onSettled?.(); }
    },
  };
}
