import { env } from 'cloudflare:workers';
import { accountUsage, BudgetExceeded, budgetReached, currentUsage } from './activities';
import { beginCost } from './costs';
import { readModelKey } from './model-keys';
import { playerAccount } from './player-account-budget';
import { recallBudgetDatabase, reserveRecallDispatch } from './recall-services';
import { traceWorld, type OperationContext } from './host-runtime';
import { streamingTransport } from './model-transport';
import { formatRepairEnabled, type ModelMessage } from './model-adapter';
import type { AIUsage, Character } from './world';

/**
 * 對回覆的判定：有效（附結果），或不合契約（附原因）。要不要重問由模型任務 module 決定，判定不必知道。
 * 要求續答隨回想續答改走 module 時加入（#411）。
 */
export type ReplyVerdict<T> = { valid: true; value: T } | { valid: false; reason: string; /** 要原樣拋出的錯誤（保留錯誤類別）；沒給就以 `reason` 拋出。 */ error?: Error };
/** 一項模型任務要問什麼、怎樣的回覆算有效。 */
export type ModelTaskContent<T> = {
  messages: ModelMessage[];
  /** 回覆契約（JSON schema）。 */
  contract: object;
  /** 輸出 token 上限；沒給時用模型傳輸的預設。 */
  maxOutputTokens?: number;
  judge: (reply: string) => ReplyVerdict<T>;
  /**
   * 格式修正（#411）：有給、且建置開啟格式修正時，第一份回覆不合契約會重問一次。
   * 重問時在原訊息後接上模型自己的原回覆（最多 `echoLimit` 字元）與 `instruct(原因)` 回傳的修正說明；
   * `instruct` 只在 module 決定重問時呼叫一次。沒給的任務不重問。
   */
  repair?: { echoLimit: number; instruct: (reason: string) => string };
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
  /** 顯示名稱，用在逾時等錯誤訊息；沒給時用製作工作的名稱。 */
  label?: string;
  /** 每次派送的派送預留 key；沒給時由操作身分與任務名稱組成。 */
  reservation?: () => string;
};
/** 一項模型任務：呼叫端只說明要問什麼、怎樣的回覆算有效。 */
export type ModelTask<T> = ModelTaskIdentity & ModelTaskContent<T>;
/** 內容要等到送出前才組得出來的模型任務：先給名稱，其餘在確認預算、租約與派送預留之後才組。 */
export type DeferredModelTask<T> = ModelTaskIdentity & { build: () => ModelTaskContent<T> };
/** 製作工作的顯示名稱，用在逾時等錯誤訊息與腳本模型。 */
const setupTaskLabels: Record<string, string> = { 'opening-resources': '開局備料', 'opening-road-repair': '補路建議', 'opening-arrangement': 'AI 開局整理', 'card-assessment': '人物卡判讀', 'character-generation': '人物欄位補寫', 'opening-relationships': '開局關係整理' };
export const setupTaskLabel = (name: string) => setupTaskLabels[name] ?? `製作工作（${name}）`;

/**
 * 模型任務 module（#411）。一項模型任務是一段可能包含多次派送的對話：
 * 每次派送前確認預算與租約、取得派送預留，送出時計次並開始計費，回覆的用量結算到帳號帳本與世界內用量，
 * 並留下決策實錄（寫入受工作期限約束）。格式修正的迴圈只在這裡：每項任務最多重問一次，只在開啟格式修正的建置。
 * 目前承接全部製作工作與世界裁定；帳本分類沿用裁定類。往下只認模型傳輸 interface。
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
    let content: ModelTaskContent<T> | undefined, messages: ModelMessage[] = [];
    for (let attempt = 1; ; attempt++) {
      if (budgetReached((await playerAccount(accountId)).usage, (await playerAccount(accountId)).limits)) throw new BudgetExceeded();
      await verifyLease();
      const reservation = task.reservation?.() ?? id + ':' + operationId + ':' + name + (attempt > 1 ? ':' + attempt : '');
      if (env.RECALL_ENABLED === 'true' && (await workWait(reserveRecallDispatch(
        recallBudgetDatabase(), accountId, 'chat', reservation, 1, { ownerMonthly: 0, accountMonthly: 0 }, 'player',
      ))).replayed) throw Error('付費請求結果不明，禁止重送。');
      const config = world.adjudication!, usage = usageNow();
      const key = await workWait(readModelKey(accountId, config.provider));
      await verifyLease();
      const price = accountPlayer.prices.find(value => value.provider === config.provider && value.model === config.model);
      let reportCost: ReturnType<typeof beginCost> | undefined;
      const dispatch = dispatchModel('adjudication', world, actor, config.provider, config.model, key, { evidence: !!actor, withinWorkDeadline: true, traceContent: !task.receiptOnly });
      if (!content) { content = 'build' in task ? task.build() : task; messages = content.messages; }
      const requestId = actor ? `${operationId}:${actor.id}:${name}:${crypto.randomUUID()}` : operationId + ':' + name + (attempt > 1 ? ':' + attempt : '');
      const reply = await transport.send(
        { service: { ...config, key }, messages, contract: content.contract, maxOutputTokens: content.maxOutputTokens, task: name, label: task.label ?? setupTaskLabel(name), actorId: actor?.id, attempt, requestId, signal: modelSignal() },
        {
          observer: dispatch.observer,
          beforeSend: dispatch.beforeDispatch,
          // 請求實際送出時才計次：世界內用量加一，並開始這次派送的費用紀錄。
          onSent: () => {
            dispatch.sent();
            traceWorld(trace, 'model-dispatch');
            usage.calls++; usage.totalCalls++; usage.unknownCalls++; usage.totalUnknownCalls++;
            reportCost = beginCost(usage, config.provider, config.model, price, 'adjudication');
          },
          onUsage: dispatch.reportUsage(tokens => accountUsage(usage, tokens), tokens => reportCost?.(tokens)),
          onSettled: dispatch.onSettled,
        },
      );
      const verdict = content.judge(reply.text);
      if (verdict.valid) { await verifyLease(); return verdict.value; }
      // 可修正的失敗只重問一次；其餘照舊拋出（判定附了錯誤物件就原樣拋出）。
      if (attempt > 1 || !content.repair || !formatRepairEnabled()) throw verdict.error ?? new ReplyRefused(verdict.reason, reply.text);
      // 重問前先確認租約：租約已失效時不留下修正的紀錄。
      await verifyLease();
      messages = [...content.messages, { role: 'assistant', content: reply.text.slice(0, content.repair.echoLimit) }, { role: 'user', content: content.repair.instruct(verdict.reason) }];
    }
  };
}
