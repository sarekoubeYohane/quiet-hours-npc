import type { ModelKeyStatus } from './model-keys';
import { directModels } from './direct-models';
export type ModelChoice = { provider: 'openai' | 'openrouter'; model: string };
export type ModelRoles = { npc?: ModelChoice; adjudication?: ModelChoice };
export type ModelPreference = { mode: 'inherit' } | { mode: 'custom'; models: ModelRoles };
export type ModelSettingsView = {
  accountScope:string;
  version: number; preference: ModelPreference; effective: ModelRoles;
  accountVersion: number; accountModels: ModelRoles;
  source: 'account' | 'save' | 'legacy' | 'missing';
  modelKeys: ModelKeyStatus; modelKeyStorageAvailable: boolean;
};
export const modelSourceLabel = { account: '帳號預設', save: '存檔自訂', legacy: '既有模型設定', missing: '尚未設定' };
export function modelRoleReady(view: ModelSettingsView, role: keyof ModelRoles) {
  const choice = view.effective[role];
  return !!(choice?.model.trim() && view.modelKeys[choice.provider]?.configured && (view.modelKeys[choice.provider].expiresAt ?? 0) > Date.now());
}
export function readModelPreference(value: unknown, allowInherit: boolean): ModelPreference | undefined {
  if (!value || typeof value !== 'object') return;
  const input = value as Record<string, unknown>;
  if (input.mode === 'inherit') return allowInherit && Object.keys(input).every(key => ['mode', 'version'].includes(key)) ? { mode: 'inherit' } : undefined;
  if (input.mode !== 'custom' || !input.models || typeof input.models !== 'object' || Object.keys(input).some(key => !['mode', 'models', 'version'].includes(key))) return;
  const models = input.models as Record<string, unknown>;
  if (Object.keys(models).some(key => !['npc', 'adjudication'].includes(key))) return;
  const accepted: ModelRoles = {};
  for (const role of ['npc', 'adjudication'] as const) {
    const choice = models[role];
    if (!choice || typeof choice !== 'object') return;
    const candidate = choice as Record<string, unknown>;
    if (!['openai', 'openrouter'].includes(String(candidate.provider)) || typeof candidate.model !== 'string' || !candidate.model.trim() || candidate.model.length > 120 || /[\x00-\x1f\x7f]/.test(candidate.model) || Object.keys(candidate).some(key => !['provider', 'model'].includes(key))) return;
    if (role === 'npc' && candidate.provider === 'openai' && !directModels.includes(candidate.model.trim())) return;
    accepted[role] = { provider: candidate.provider as ModelChoice['provider'], model: candidate.model.trim() };
  }
  return { mode: 'custom', models: accepted };
}
