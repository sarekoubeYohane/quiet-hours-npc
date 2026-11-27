import { env } from 'cloudflare:workers';
import { accountUsage, BudgetExceeded, budgetReached, currentUsage } from './activities';
import { beginCost } from './costs';
import { readModelKey } from './model-keys';
import { playerAccount } from './player-account-budget';
import { recallBudgetDatabase, reserveRecallDispatch } from './recall-services';
import { traceWorld, type OperationContext } from './host-runtime';
import { streamingTransport } from './model-transport';
import { formatRepairEnabled, type ModelMessage, type ModelObservation } from './model-adapter';
import type { ModelProvider } from './model-providers';
import type { AIUsage, Character } from './world';
import type { DispatchKind } from './costs';

/**
 * 對回覆的判定，三種結果（#411）：有效（附結果）、不合契約（附原因）、要求續答（附接續的訊息）。
 * 要不要重問、續答那一次怎麼派送，都由模型任務 module 決定，判定不必知道。
 */
export type ReplyVerdict<T> = { valid: true; value: T } | {
  /** 要求續答：`followUp` 回傳接續的內容（訊息、回覆契約與判定）；module 在下一次派送送出前才呼叫它。能續答幾次由判定自己把關。 */
  valid: false; followUp: () => ModelTaskContent<T>;
} | {
  valid: false; reason: string;
  /** 要原樣拋出的錯誤（保留錯誤類別）；沒給就以 `reason` 拋出。 */
  error?: Error;
  /** 要留在決策實錄的失敗紀錄；有給時先確認租約、留下紀錄，再重問或拋出。 */
  failure?: Extract<ModelObservation, { kind: 'failure' }>;
};
/** 一項模型任務要問什麼、怎樣的回覆算有效。 */
export type ModelTaskContent<T> = {
  messages: ModelMessage[];
  /** 回覆契約（JSON schema）。 */
  contract: object;
  /** 輸出 token 上限；沒給時用模型傳輸的預設。 */
  maxOutputTokens?: number;
  /** 回想啟用時的寬鬆回覆格式、DeepSeek 的 thinking；只有 NPC 自主決策會給。 */
  allowRecall?: boolean; allowThinking?: boolean;
  /** 這次派送的顯示名稱；沒給時用任務的顯示名稱。 */
  label?: string;
  judge: (reply: string) => ReplyVerdict<T> | Promise<ReplyVerdict<T>>;
  /**
   * 格式修正（#411）：有給、且建置開啟格式修正時，第一份回覆不合契約會重問一次。
   * 重問時在原訊息後接上模型自己的原回覆（最多 `echoLimit` 字元）與 `instruct(原因)` 回傳的修正說明；
   * `instruct` 只在 module 決定重問時呼叫一次。沒給的任務不重問。
   * `next`：重問的內容要由任務自己重組時給（NPC 自主決策每次派送都重新收斂輸入）；收到要接上的兩則訊息，回傳重問的內容。
   */
  repair?: { echoLimit: number; instruct: (reason: string) => string; next?: (turns: ModelMessage[]) => ModelTaskContent<T> };
};
/** 回覆到最後仍不合契約、判定又沒有附錯誤物件時拋出；訊息是不合契約的原因，另帶最後一份回覆原文。 */
export class ReplyRefused extends Error { constructor(reason: string, readonly reply: string) { super(reason); } }
type ModelTaskIdentity = {
  /** 任務名稱，例如 `opening-resources`；也用在派送的請求身分。 */
  name: string;
  /** 私有決策實錄只留收據，不保存送出內容與回覆（人物卡判讀的回覆不落地）。 */
  receiptOnly?: boolean;
  /** 對象人物；有對象人物的任務另留操作證據，請求身分也帶上人物。 */
  actor?: Character;
  /** 帳本分類；沒給時是裁定類（製作工作與世界裁定）。 */
  kind?: DispatchKind;
  /** 每次派送的請求身分；沒給時由操作身分、對象人物與任務名稱組成。 */
  requestId?: () => string;
  /** 這項任務問哪個模型；沒給時用世界的裁定模型。 */
  service?: { provider: ModelProvider; model: string };
  /** 顯示名稱，用在逾時等錯誤訊息；沒給時用製作工作的名稱。 */
  label?: string;
  /** 每次派送的派送預留 key；沒給時由操作身分與任務名稱組成。 */
  reservation?: () => string;
};
/** 一項模型任務：呼叫端只說明要問什麼、怎樣的回覆算有效。 */
export type ModelTask<T> = ModelTaskIdentity & ModelTaskContent<T>;
/**
 * 內容要等到送出前才組得出來的模型任務：先給名稱，其餘在確認預算、租約與派送預留之後才組。
 * `build` 收到這次派送讀到的 Key，只供判定遮罩與檢查回覆有沒有洩漏 Key。
 */
export type DeferredModelTask<T> = ModelTaskIdentity & { build: (dispatch: { key: string }) => ModelTaskContent<T> };
/** 製作工作的顯示名稱，用在逾時等錯誤訊息與腳本模型。 */
const setupTaskLabels: Record<string, string> = { 'opening-resources': '開局備料', 'opening-road-repair': '補路建議', 'opening-arrangement': 'AI 開局整理', 'card-assessment': '人物卡判讀', 'character-generation': '人物欄位補寫', 'opening-relationships': '開局關係整理' };
export const setupTaskLabel = (name: string) => setupTaskLabels[name] ?? `製作工作（${name}）`;

/**
 * 模型任務 module（#411）。一項模型任務是一段可能包含多次派送的對話：
 * 每次派送前確認預算與租約、取得派送預留，送出時計次並開始計費，回覆的用量結算到帳號帳本與世界內用量，
 * 並留下決策實錄（寫入受工作期限約束）。格式修正與續答的迴圈只在這裡：每項任務最多重問一次，只在開啟格式修正的建置；
 * 判定要求續答時，接續的那一次照同樣的順序再派送。
 * 承接全部製作工作、世界裁定、接管後感受與 NPC 自主決策；帳本分類沒指定時沿用裁定類。往下只認模型傳輸 interface。
 * `roundUsage`：推進回合沿用回合開始時取得的世界內用量；沒給時在這裡取得當前用量。
 */
export function modelTasks(ctx: OperationContext, roundUsage?: () => AIUsage) {
  const { accountId, id, operationId, world, accountPlayer, trace, services, verifyLease, workWait, modelSignal, dispatchModel } = ctx;
  const transport = services?.modelTransport ?? streamingTransport;
  // 製作工作在這裡取得當前用量；推進回合由呼叫端給。
  const current = roundUsage ? undefined : world.aiUsage = currentUsage(world);
  const usageNow = roundUsage ?? (() => current!);
  return async function runModelTask<T>(task: ModelTask<T> | DeferredModelTask<T>): Promise<T> {
    const { name, actor } = task;
    let content: ModelTaskContent<T> | undefined, repaired = false;
    // 下一次派送的內容：在確認預算、租約、派送預留並讀到 Key 之後才組。
    let next: ((key: string) => ModelTaskContent<T>) | undefined = key => 'build' in task ? task.build({ key }) : task;
    for (let attempt = 1; ; attempt++) {
      if (budgetReached((await playerAccount(accountId)).usage, (await playerAccount(accountId)).limits)) throw new BudgetExceeded();
      await verifyLease();
      const reservation = task.reservation?.() ?? id + ':' + operationId + ':' + name + (attempt > 1 ? ':' + attempt : '');
      if (env.RECALL_ENABLED === 'true' && (await workWait(reserveRecallDispatch(
        recallBudgetDatabase(), accountId, 'chat', reservation, 1, { ownerMonthly: 0, accountMonthly: 0 }, 'player',
      ))).replayed) throw Error('付費請求結果不明，禁止重送。');
      const config = task.service ?? world.adjudication!, kind = task.kind ?? 'adjudication', usage = usageNow();
      const key = await workWait(readModelKey(accountId, config.provider));
      await verifyLease();
      const price = accountPlayer.prices.find(value => value.provider === config.provider && value.model === config.model);
      let reportCost: ReturnType<typeof beginCost> | undefined;
      const dispatch = dispatchModel(kind, world, actor, config.provider, config.model, key, { evidence: !!actor, withinWorkDeadline: true, traceContent: !task.receiptOnly });
      if (next) { content = next(key); next = undefined; }
      const sending: ModelTaskContent<T> = content!;
      const requestId = task.requestId?.() ?? (actor ? `${operationId}:${actor.id}:${name}:${crypto.randomUUID()}` : operationId + ':' + name + (attempt > 1 ? ':' + attempt : ''));
      const reply = await transport.send(
        { service: { ...config, key }, messages: sending.messages, contract: sending.contract, maxOutputTokens: sending.maxOutputTokens, allowRecall: sending.allowRecall, allowThinking: sending.allowThinking, task: name, label: sending.label ?? task.label ?? setupTaskLabel(name), actorId: actor?.id, attempt, requestId, signal: modelSignal() },
        {
          observer: dispatch.observer,
          beforeSend: dispatch.beforeDispatch,
          // 請求實際送出時才計次：世界內用量加一，並開始這次派送的費用紀錄。
          onSent: () => {
            dispatch.sent();
            traceWorld(trace, 'model-dispatch');
            usage.calls++; usage.totalCalls++; usage.unknownCalls++; usage.totalUnknownCalls++;
            reportCost = beginCost(usage, config.provider, config.model, price, kind);
          },
          onUsage: dispatch.reportUsage(tokens => accountUsage(usage, tokens), tokens => reportCost?.(tokens)),
          onSettled: dispatch.onSettled,
        },
      );
      const verdict = await sending.judge(reply.text);
      if (verdict.valid) { await verifyLease(); return verdict.value; }
      // 要求續答：接續的那一次回到迴圈開頭，照同樣的順序確認預算、租約與派送預留。
      if ('followUp' in verdict) { const followUp = verdict.followUp; next = () => followUp(); continue; }
      // 可修正的失敗只重問一次；其餘照舊拋出（判定附了錯誤物件就原樣拋出）。
      const repair = repaired || !formatRepairEnabled() ? undefined : sending.repair;
      // 重問前先確認租約：租約已失效時不留下修正的紀錄。留不成失敗紀錄時，仍照原本的判定失敗處理。
      if (verdict.failure || repair) await verifyLease();
      if (verdict.failure) { try { await dispatch.observer?.(verdict.failure); } catch { /* evidence only */ } }
      if (!repair) throw verdict.error ?? new ReplyRefused(verdict.reason, reply.text);
      repaired = true;
      const turns: ModelMessage[] = [{ role: 'assistant', content: reply.text.slice(0, repair.echoLimit) }, { role: 'user', content: repair.instruct(verdict.reason) }];
      next = () => repair.next ? repair.next(turns) : { ...sending, messages: [...sending.messages, ...turns] };
    }
  };
}
