import { requestModel, type ModelMessage, type ModelObserver, type ModelService } from './model-adapter';
import type { TokenUsage } from './activities';

/**
 * 模型傳輸 interface（#411）：模型任務 module 往下唯一認得的 seam。
 * 收服務設定、訊息與回覆契約，回傳回覆文字與用量。
 * 兩個 adapter：`streamingTransport`（正式的串流傳輸）與 `scripted-model.ts` 的腳本模型（測試）。
 */
export type ModelTransportRequest = {
  service: ModelService; messages: ModelMessage[];
  /** 回覆契約（JSON schema）。 */
  contract: object; maxOutputTokens: number;
  /** 任務名稱與顯示名稱；顯示名稱用在逾時等錯誤訊息。 */
  task: string; label: string; actorId?: string;
  /** 這項模型任務的第幾次派送，從 1 起算。 */
  attempt: number; requestId: string; signal: AbortSignal;
};
export type ModelTransportHooks = {
  /** 決策實錄與操作證據的觀察者。 */
  observer?: ModelObserver;
  /** 送出前的最後一關（帳號帳本的派送預留）；拋錯代表這次沒有送出。 */
  beforeSend?: (requestId: string, signal: AbortSignal) => Promise<void>;
  /** 請求實際送出時通知一次。 */
  onSent: () => void;
  /** 得知用量時通知一次。回覆之後被拒收（例如超過長度）時仍會通知，已付用量才不會漏記。 */
  onUsage?: (tokens: TokenUsage) => void | Promise<void>;
  /** 無論成敗，這次派送結束時通知一次。 */
  onSettled?: () => Promise<void>;
};
export type ModelTransportReply = { text: string; usage?: TokenUsage };
export type ModelTransport = { send(request: ModelTransportRequest, hooks: ModelTransportHooks): Promise<ModelTransportReply> };

/** 正式的串流傳輸：`model-adapter.ts` 的 `requestModel`。 */
export const streamingTransport: ModelTransport = {
  async send(request, hooks) {
    let usage: TokenUsage | undefined;
    const text = await requestModel(request.service, request.messages, request.contract, {
      signal: request.signal, label: request.label, requestId: request.requestId, maxOutputTokens: request.maxOutputTokens,
      observer: hooks.observer, beforeDispatch: hooks.beforeSend ? (id, signal) => hooks.beforeSend!(id ?? request.requestId, signal) : undefined, onSettled: hooks.onSettled,
      fetcher: (url, init) => { init?.signal?.throwIfAborted(); hooks.onSent(); return fetch(url, init); },
      onUsage: async tokens => { usage = tokens; await hooks.onUsage?.(tokens); },
    });
    return { text, usage };
  },
};
