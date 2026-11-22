import { validModelId, type CatalogModel, type ModelProvider } from './model-providers';

const services = {
  openai: { list: 'https://api.openai.com/v1/models', chat: 'https://api.openai.com/v1/chat/completions' },
  openrouter: { list: 'https://openrouter.ai/api/v1/models/user', chat: 'https://openrouter.ai/api/v1/chat/completions' },
  deepseek: { list: 'https://api.deepseek.com/models', chat: 'https://api.deepseek.com/chat/completions' },
  gemini: { list: 'https://generativelanguage.googleapis.com/v1beta/models', chat: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions' },
  anthropic: { list: 'https://api.anthropic.com/v1/models', chat: 'https://api.anthropic.com/v1/messages' },
};
export function chatEndpoint(provider: ModelProvider) { return services[provider].chat; }
export function providerHeaders(provider: ModelProvider, key: string, list = false): Record<string, string> {
  if (provider === 'anthropic') return { 'x-api-key': key, 'anthropic-version': '2023-06-01' };
  if (list && provider === 'gemini') return { 'x-goog-api-key': key };
  return { Authorization: 'Bearer ' + key };
}
type ModelEntry = {
  id?: string; name?: string; displayName?: string; display_name?: string;
  supportedGenerationMethods?: string[]; architecture?: { output_modalities?: string[] };
};
type ModelPage = {
  data?: ModelEntry[]; models?: ModelEntry[]; has_more?: boolean; last_id?: string; nextPageToken?: string;
};
// OpenAI's list identifies models by ID and omits endpoint capabilities.
// Keep new text models discoverable while excluding documented specialist endpoints.
function supportsTextChat(provider: ModelProvider, id: string, entry: ModelEntry) {
  if (entry.architecture?.output_modalities && !entry.architecture.output_modalities.includes('text')) return false;
  if (provider === 'gemini') return !!entry.supportedGenerationMethods?.includes('generateContent') && !/(?:^|-)(?:image|tts|live|native-audio)(?:-|$)/i.test(id);
  if (provider === 'openai') return !/^(?:text-embedding-|text-moderation-|omni-moderation-|dall-e-|gpt-image-|chatgpt-image-|whisper-|tts-|sora-|babbage-|davinci-|computer-use-|codex-mini-latest$)|(?:^|-)(?:realtime|transcribe|tts|deep-research|instruct)(?:-|$)/i.test(id);
  return true;
}
export class CatalogError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
export async function listProviderModels(provider: ModelProvider, key: string, signal: AbortSignal) {
  const url = new URL(services[provider].list);
  const models = new Map<string, CatalogModel>();
  const cursors = new Set<string>();
  for (;;) {
    const response = await fetch(url, { headers: providerHeaders(provider, key, true), redirect: 'manual', signal, cache: 'no-store' });
    if (!response.ok) {
      if (provider === 'anthropic' && response.status === 400) throw new CatalogError('Claude 拒絕這次查詢，請確認使用已綁定工作區的 API Key。', 400);
      const denied = response.status === 401 || response.status === 403;
      throw new CatalogError(denied ? '供應商拒絕這把 Key，請確認服務和讀取模型的權限。' : response.status === 429 ? '供應商暫時限流，請稍後重新查詢。' : '供應商暫時無法列出模型，請重新查詢。', denied ? 403 : response.status === 429 ? 429 : 502);
    }
    const page: ModelPage = await response.json();
    const entries = provider === 'gemini' ? page.models : page.data;
    if (!Array.isArray(entries)) throw new CatalogError('供應商回傳的模型清單格式無法辨識。', 502);
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;
      const id = provider === 'gemini' ? entry.name?.replace(/^models\//, '') : entry.id;
      if (!validModelId(id) || id.includes(key) || !supportsTextChat(provider, id, entry)) continue;
      const label = entry.displayName || entry.display_name || entry.name || id;
      models.set(id, { id, name: typeof label === 'string' && !label.includes(key) ? label.slice(0, 180) : id });
    }
    const cursor = provider === 'gemini' ? page.nextPageToken : provider === 'anthropic' && page.has_more ? page.last_id : undefined;
    if (!cursor && !(provider === 'anthropic' && page.has_more)) break;
    if (typeof cursor !== 'string' || !cursor || cursors.has(cursor) || cursors.size >= 100) throw new CatalogError('供應商的模型清單分頁未完成，請重新查詢。', 502);
    cursors.add(cursor);
    url.searchParams.set(provider === 'gemini' ? 'pageToken' : 'after_id', cursor);
  }
  return [...models.values()].sort((a, b) => a.name.localeCompare(b.name));
}
