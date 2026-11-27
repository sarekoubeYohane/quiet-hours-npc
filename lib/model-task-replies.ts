import { requestModel, type ModelService } from './model-adapter';
import type { ModelTaskContent, ReplyVerdict } from './model-task';

/**
 * 把「不合契約就拋錯」的解讀函式包成模型任務的判定（#414）。
 * 錯誤的類別與訊息原樣交給模型任務 module 拋出，各製作工作原本的檢查與錯誤訊息不變。
 */
export const judgeBy = <T>(read: (reply: string) => T) => (reply: string): ReplyVerdict<T> => {
  try { return { valid: true, value: read(reply) }; }
  catch (error) { return error instanceof Error ? { valid: false, reason: error.message, error } : { valid: false, reason: String(error) }; }
};

/** 不經模型任務 module、直接呼叫模型傳輸的舊入口共用；只剩量測腳本使用（#411 第 5 段收尾）。 */
export async function askDirectly<T>(task: ModelTaskContent<T>, service: ModelService, options: Parameters<typeof requestModel>[3]): Promise<T> {
  const verdict = await task.judge(await requestModel(service, task.messages, task.contract, { ...options, maxOutputTokens: task.maxOutputTokens }));
  if (verdict.valid) return verdict.value;
  // 舊入口只問一次；製作工作的判定不會要求續答。
  throw 'reason' in verdict ? verdict.error ?? Error(verdict.reason) : Error('舊入口不支援續答。');
}
