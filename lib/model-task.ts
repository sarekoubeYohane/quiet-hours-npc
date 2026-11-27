import { env } from 'cloudflare:workers';
import { accountUsage, BudgetExceeded, budgetReached, currentUsage } from './activities';
import { beginCost } from './costs';
import { readModelKey } from './model-keys';
import { playerAccount } from './player-account-budget';
import { recallBudgetDatabase, reserveRecallDispatch } from './recall-services';
import { traceWorld, type OperationContext } from './host-runtime';
import { streamingTransport } from './model-transport';
import type { ModelMessage } from './model-adapter';

/** 對回覆的判定：有效（附結果），或不合契約（附原因）。要求續答隨回想續答改走 module 時加入（#411）。 */
export type ReplyVerdict<T> = { valid: true; value: T } | { valid: false; reason: string };
/** 一項模型任務：呼叫端只說明要問什麼、怎樣的回覆算有效。 */
export type ModelTask<T> = {
  /** 任務名稱，例如 `opening-resources`；也用在派送的請求身分。 */
  name: string;
  messages: ModelMessage[];
  /** 回覆契約（JSON schema）。 */
  contract: object;
  maxOutputTokens: number;
  judge: (reply: string) => ReplyVerdict<T>;
};
/** 內容要等到送出前才組得出來的模型任務：先給名稱，其餘在確認預算、租約與派送預留之後才組。 */
export type DeferredModelTask<T> = { name: string; build: () => Omit<ModelTask<T>, 'name'> };
/** 製作工作的顯示名稱，用在逾時等錯誤訊息與腳本模型。 */
const setupTaskLabels: Record<string, string> = { 'opening-resources': '開局備料', 'opening-road-repair': '補路建議', 'opening-arrangement': 'AI 開局整理', 'card-assessment': '人物卡判讀', 'character-generation': '人物欄位補寫', 'opening-relationships': '開局關係整理' };
export const setupTaskLabel = (name: string) => setupTaskLabels[name] ?? `製作工作（${name}）`;

/**
 * 模型任務 module（#411）。每次派送前確認預算與租約、取得派送預留，
 * 送出時計次並開始計費，回覆的用量結算到帳號帳本與世界內用量，並留下決策實錄。
 * 目前承接製作工作；帳本分類沿用裁定類。往下只認模型傳輸 interface。
 */
export function modelTasks(ctx: OperationContext) {
  const { accountId, id, operationId, world, accountPlayer, trace, services, verifyLease, workWait, modelSignal, dispatchModel } = ctx;
  const transport = services?.modelTransport ?? streamingTransport;
  return async function runModelTask<T>(task: ModelTask<T> | DeferredModelTask<T>): Promise<T> {
    const config = world.adjudication!;
    const usage = world.aiUsage = currentUsage(world);
    if (budgetReached((await playerAccount(accountId)).usage, (await playerAccount(accountId)).limits)) throw new BudgetExceeded();
    await verifyLease();
    const { name } = task;
    if (env.RECALL_ENABLED === 'true' && (await workWait(reserveRecallDispatch(
      recallBudgetDatabase(), accountId, 'chat', id + ':' + operationId + ':' + name, 1, { ownerMonthly: 0, accountMonthly: 0 }, 'player',
    ))).replayed) throw Error('付費請求結果不明，禁止重送。');
    const key = await workWait(readModelKey(accountId, config.provider));
    await verifyLease();
    const price = accountPlayer.prices.find(value => value.provider === config.provider && value.model === config.model);
    let reportCost: ReturnType<typeof beginCost> | undefined;
    const dispatch = dispatchModel('adjudication', world, undefined, config.provider, config.model, key, { evidence: false, withinWorkDeadline: false, traceContent: true });
    const { messages, contract, maxOutputTokens, judge } = 'build' in task ? task.build() : task;
    const reply = await transport.send(
      { service: { ...config, key }, messages, contract, maxOutputTokens, task: name, label: setupTaskLabel(name), attempt: 1, requestId: operationId + ':' + name, signal: modelSignal() },
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
    await verifyLease();
    const verdict = judge(reply.text);
    if (!verdict.valid) throw Error(verdict.reason);
    return verdict.value;
  };
}
