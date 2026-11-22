export const providerNames = {
  openai: 'OpenAI', openrouter: 'OpenRouter', deepseek: 'DeepSeek',
  gemini: 'Google Gemini', anthropic: 'Anthropic Claude',
} as const;
export type ModelProvider = keyof typeof providerNames;
export const modelProviders = Object.keys(providerNames) as ModelProvider[];
export type CatalogModel = { id: string; name: string };
export function isModelProvider(value: unknown): value is ModelProvider {
  return typeof value === 'string' && Object.hasOwn(providerNames, value);
}
// Saved operations use "ai" for OpenRouter. Keep that identity on replay.
export function modelMode(provider: ModelProvider) {
  return provider === 'openrouter' ? 'ai' : provider;
}
export function providerForMode(mode: unknown): ModelProvider {
  if (mode === 'ai') return 'openrouter';
  if (isModelProvider(mode)) return mode;
  throw Error('請選擇模型服務。');
}
export function validModelId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 120 && !/[\s\x00-\x1f\x7f]/.test(value);
}
