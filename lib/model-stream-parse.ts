// Pure parsing for streamed provider replies. Two wire formats exist: the OpenAI-compatible chat
// completion chunks (OpenAI, OpenRouter, DeepSeek, Gemini's OpenAI endpoint) and Anthropic
// Messages events. Both are assembled into the same body a non-streamed reply would have, so the
// adapter's existing parsing, usage and validation run unchanged. JSON inside the reply is never
// parsed while it is still arriving.
import type { ModelProvider } from './model-providers';

export type SseEvent = { event?: string; data: string };

/** Splits Server-Sent Events. Comment lines (": ...") are provider keepalives. */
export function sseFramer(onEvent: (event: SseEvent) => void, onComment: () => void) {
  let buffer = '', data: string[] = [], name: string | undefined;
  const dispatch = () => {
    if (data.length) onEvent({ event: name, data: data.join('\n') });
    data = []; name = undefined;
  };
  return {
    push(text: string) {
      buffer += text;
      for (let index = buffer.indexOf('\n'); index >= 0; index = buffer.indexOf('\n')) {
        const line = buffer.slice(0, index).replace(/\r$/, '');
        buffer = buffer.slice(index + 1);
        if (line === '') dispatch();
        else if (line.startsWith(':')) onComment();
        else {
          const colon = line.indexOf(':');
          const field = colon < 0 ? line : line.slice(0, colon);
          const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
          if (field === 'data') data.push(value);
          else if (field === 'event') name = value;
        }
      }
    },
    /** A final event without its blank line still counts once the body has ended. */
    end() { if (buffer.trim()) this.push('\n'); dispatch(); },
  };
}

/** A provider reported an error inside an otherwise successful (HTTP 200) stream. */
export class StreamProviderError extends Error {
  constructor(readonly providerCode: string, readonly providerMessage: string) { super(`${providerCode} ${providerMessage}`.trim()); }
}
/** A stream event that is not valid JSON for its format. */
export class StreamFormatError extends Error {}

export type StreamAssembly = {
  /** Applies one event. Returns true when it carried reply text or thinking. */
  accept(event: SseEvent): boolean;
  readonly complete: boolean;
  readonly contentChars: number;
  readonly reasoningChars: number;
  /** The reply as the same provider would have returned it without streaming. */
  body(): Record<string, unknown>;
};

const chars = (text: string) => [...text].length;
const record = (value: unknown): Record<string, unknown> | undefined => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const text = (value: unknown) => typeof value === 'string' ? value : '';
function parse(data: string): Record<string, unknown> {
  let value: unknown;
  try { value = JSON.parse(data); } catch { throw new StreamFormatError('串流資料不是有效的 JSON。'); }
  const item = record(value);
  if (!item) throw new StreamFormatError('串流資料不是 JSON 物件。');
  return item;
}
function providerError(value: unknown): StreamProviderError {
  const error = record(value);
  const code = error?.code ?? error?.type ?? '';
  const message = typeof error?.message === 'string' ? error.message : typeof value === 'string' ? value : '';
  return new StreamProviderError(String(code), message);
}

function openAiCompatible(): StreamAssembly {
  let id: unknown, model: unknown, created: unknown, content = '', reasoning = '', refusal = '', finish: unknown, usage: Record<string, unknown> | undefined, done = false, sawContent = false;
  return {
    accept({ data }) {
      if (data.trim() === '[DONE]') { done = true; return false; }
      const chunk = parse(data);
      if (chunk.error !== undefined && chunk.error !== null) throw providerError(chunk.error);
      id ??= chunk.id; model ??= chunk.model; created ??= chunk.created;
      if (record(chunk.usage)) usage = record(chunk.usage);
      const choice = record(Array.isArray(chunk.choices) ? chunk.choices[0] : undefined);
      const delta = record(choice?.delta);
      const before = content.length + reasoning.length + refusal.length;
      content += text(delta?.content);
      // DeepSeek names the thinking field reasoning_content; OpenRouter names it reasoning.
      reasoning += text(delta?.reasoning_content) || text(delta?.reasoning);
      refusal += text(delta?.refusal);
      if (choice?.finish_reason !== undefined && choice.finish_reason !== null) finish = choice.finish_reason;
      const carried = content.length + reasoning.length + refusal.length > before;
      if (carried) sawContent = true;
      return carried;
    },
    get complete() { return done || finish !== undefined; },
    get contentChars() { return chars(content); },
    get reasoningChars() { return chars(reasoning); },
    body() {
      return {
        ...(id === undefined ? {} : { id }), object: 'chat.completion', ...(created === undefined ? {} : { created }), ...(model === undefined ? {} : { model }),
        choices: [{ index: 0, message: { role: 'assistant', content: sawContent || !refusal ? content : null, ...(reasoning ? { reasoning_content: reasoning } : {}), ...(refusal ? { refusal } : {}) }, finish_reason: finish ?? null }],
        ...(usage ? { usage } : {}),
      };
    },
  };
}

type Block = { type: string; text?: string; thinking?: string };
function anthropic(): StreamAssembly {
  let id: unknown, model: unknown, stop: unknown, stopSequence: unknown, usage: Record<string, unknown> | undefined, done = false;
  const blocks: Block[] = [];
  const block = (index: unknown, type = 'text') => {
    const at = typeof index === 'number' && index >= 0 && index < 256 ? index : blocks.length;
    return blocks[at] ??= type === 'thinking' ? { type, thinking: '' } : { type, text: '' };
  };
  const total = (type: 'text' | 'thinking') => blocks.reduce((n, b) => n + chars(b?.[type] ?? ''), 0);
  return {
    accept({ event, data }) {
      const item = parse(data);
      const type = typeof item.type === 'string' ? item.type : event;
      if (type === 'error') throw providerError(item.error);
      if (type === 'message_start') {
        const message = record(item.message);
        id = message?.id; model = message?.model;
        if (record(message?.usage)) usage = { ...record(message!.usage) };
        return false;
      }
      if (type === 'content_block_start') { const start = record(item.content_block); block(item.index, text(start?.type) || 'text'); return false; }
      if (type === 'content_block_delta') {
        const delta = record(item.delta);
        if (delta?.type === 'text_delta' && text(delta.text)) { const b = block(item.index); b.text = (b.text ?? '') + text(delta.text); return true; }
        if (delta?.type === 'thinking_delta' && text(delta.thinking)) { const b = block(item.index, 'thinking'); b.thinking = (b.thinking ?? '') + text(delta.thinking); return true; }
        return false;
      }
      if (type === 'message_delta') {
        const delta = record(item.delta);
        if (delta?.stop_reason !== undefined && delta.stop_reason !== null) stop = delta.stop_reason;
        if (delta?.stop_sequence !== undefined) stopSequence = delta.stop_sequence;
        // message_start carries input and cache usage; message_delta carries the final, cumulative
        // output count (and may repeat input fields). Later values win field by field.
        const later = record(item.usage);
        if (later) usage = { ...(usage ?? {}), ...Object.fromEntries(Object.entries(later).filter(([, value]) => value !== null && value !== undefined)) };
        return false;
      }
      if (type === 'message_stop') done = true;
      return false;
    },
    get complete() { return done || stop !== undefined; },
    get contentChars() { return total('text'); },
    get reasoningChars() { return total('thinking'); },
    body() {
      return {
        ...(id === undefined ? {} : { id }), type: 'message', role: 'assistant', ...(model === undefined ? {} : { model }),
        content: blocks.filter(Boolean).map(b => b.type === 'thinking' ? { type: 'thinking', thinking: b.thinking ?? '' } : { type: b.type, text: b.text ?? '' }),
        stop_reason: stop ?? null, ...(stopSequence === undefined ? {} : { stop_sequence: stopSequence }), ...(usage ? { usage } : {}),
      };
    },
  };
}

export function streamAssembly(provider: ModelProvider): StreamAssembly {
  return provider === 'anthropic' ? anthropic() : openAiCompatible();
}
