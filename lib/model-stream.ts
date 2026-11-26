// Receives a provider reply piece by piece under two waits instead of one fixed total:
// - first response: from sending the request until any data (headers alone do not count);
// - idle: between two consecutive pieces once data has started.
// Thinking pieces and provider keepalives count as activity. A reply that keeps arriving is never
// cut for its total length; the caller's signal (the round's remaining work window) still bounds it.
// Timers use AbortSignal.timeout so the round's controlled clocks in tests govern them as well.
import type { ModelProvider } from './model-providers';
import { signalExpired } from './round-time-policy';
import { sseFramer, streamAssembly, StreamFormatError, StreamProviderError } from './model-stream-parse';

export type WaitLimits = { firstByteMs: number; idleMs: number };
export type StreamTiming = {
  /** True when the reply was assembled from a stream rather than read as one JSON body. */
  assembled: boolean;
  fetchStartedAt: number;
  headersAt?: number;
  /** First piece of any kind, including keepalives. */
  firstChunkAt?: number;
  /** First piece that carried reply text or thinking. */
  firstContentAt?: number;
  lastChunkAt?: number;
  chunks: number;
  contentChars: number;
  reasoningChars: number;
};
export type ModelWait = 'first-byte' | 'idle' | 'work-window';

const seconds = (ms: number) => `${Math.max(0, ms / 1000).toFixed(1)} 秒`;
function received(timing: StreamTiming) {
  if (!timing.chunks) return '尚未收到任何內容';
  return `已收到正文 ${timing.contentChars} 字、思考內容 ${timing.reasoningChars} 字，共 ${timing.chunks} 段`;
}

/** The provider went quiet. Named TimeoutError so round handling keeps treating it as a timeout. */
export class ModelResponseTimeout extends Error {
  override name = 'TimeoutError';
  constructor(readonly wait: ModelWait, readonly label: string, readonly timing: StreamTiming, readonly limitMs: number, now = Date.now()) {
    const elapsed = now - timing.fetchStartedAt;
    super(wait === 'first-byte'
      ? `${label}首段回應逾時：送出後 ${seconds(limitMs)}內沒有收到任何資料（${timing.headersAt ? '已收到 HTTP 回應，' : '尚未收到 HTTP 回應，'}${received(timing)}）。`
      : wait === 'idle'
        ? `${label}閒置逾時：已 ${seconds(limitMs)}沒有新資料，送出後第 ${seconds(elapsed)}中止（${received(timing)}）。`
        : `${label}在本回合工作窗口用完時中止：送出後已等待 ${seconds(elapsed)}（${received(timing)}）。`);
  }
}
/** The body ended, or the provider reported an error, before the reply was complete. */
export class ModelStreamFailure extends Error {
  constructor(readonly failure: 'interrupted' | 'provider-error' | 'format', message: string, readonly timing: StreamTiming) { super(message); }
}

type Phase = { wait: 'first-byte' | 'idle'; limitMs: number; signal: AbortSignal };
/** Waits for `work` unless the current phase or the caller's signal ends first. */
function within<T>(work: Promise<T>, phase: Phase, outer: AbortSignal, timeout: (wait: ModelWait, limitMs: number) => Error): Promise<T> {
  return new Promise((resolve, reject) => {
    const onPhase = () => reject(timeout(phase.wait, phase.limitMs));
    const onOuter = () => reject(timeout('work-window', 0));
    const cleanup = () => { phase.signal.removeEventListener('abort', onPhase); outer.removeEventListener('abort', onOuter); };
    if (signalExpired(outer)) { work.catch(() => {}); onOuter(); return; }
    if (phase.signal.aborted) { work.catch(() => {}); onPhase(); return; }
    phase.signal.addEventListener('abort', onPhase, { once: true });
    outer.addEventListener('abort', onOuter, { once: true });
    work.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(signalExpired(outer) ? timeout('work-window', 0) : error); });
  });
}

/** Assembles a complete SSE text at once; used only for late evidence. */
function assembleText(provider: ModelProvider, text: string): string {
  const assembly = streamAssembly(provider);
  try { const framer = sseFramer(event => { assembly.accept(event); }, () => {}); framer.push(text); framer.end(); } catch { return text; }
  return JSON.stringify(assembly.body());
}
export type StreamedReply = { response: Response; body: string; timing: StreamTiming };

/**
 * Sends the request and reads the whole reply. `send` receives the signal to pass to fetch; it
 * aborts when either wait or the caller's signal ends, so the connection is released.
 */
export async function receiveModelReply(provider: ModelProvider, send: (signal: AbortSignal) => Promise<Response>, options: {
  signal: AbortSignal; limits: WaitLimits; label: string; onHeaders?: (response: Response) => void | Promise<void>;
  /** A reply whose headers arrived only after the wait ended (a provider ignoring abort): evidence only. */
  onLate?: (reply: StreamedReply) => void;
}): Promise<StreamedReply> {
  const { signal: outer, limits, label } = options;
  const local = new AbortController();
  const timing: StreamTiming = { assembled: false, fetchStartedAt: Date.now(), chunks: 0, contentChars: 0, reasoningChars: 0 };
  const timeout = (wait: ModelWait, limitMs: number) => {
    const error = new ModelResponseTimeout(wait, label, { ...timing }, limitMs);
    local.abort(error);
    return error;
  };
  let phase: Phase = { wait: 'first-byte', limitMs: limits.firstByteMs, signal: AbortSignal.timeout(limits.firstByteMs) };
  const sent = send(AbortSignal.any([outer, local.signal]));
  let response: Response;
  try { response = await within(sent, phase, outer, timeout); }
  catch (error) {
    if (options.onLate) sent.then(async late => {
      const body = await late.text();
      const streamed = (late.headers.get('content-type') || '').toLowerCase().includes('text/event-stream');
      options.onLate!({ response: late, body: streamed ? assembleText(provider, body) : body, timing: { ...timing, assembled: streamed } });
    }).catch(() => {});
    throw error;
  }
  timing.headersAt = Date.now();
  await options.onHeaders?.(response);
  const streamed = (response.headers.get('content-type') || '').toLowerCase().includes('text/event-stream') && response.ok;
  timing.assembled = streamed;
  const assembly = streamAssembly(provider);
  let failure: Error | undefined;
  const framer = sseFramer(event => {
    if (failure) return;
    try { if (assembly.accept(event)) timing.firstContentAt ??= Date.now(); }
    catch (error) { failure = error instanceof Error ? error : Error(String(error)); }
  }, () => { /* A keepalive comment; its arrival already counted as a piece. */ });
  const decoder = new TextDecoder();
  let raw = '';
  const reader = response.body?.getReader();
  // Returns false when the stream reported a failure and reading should stop.
  const accept = (value: Uint8Array) => {
    const now = Date.now();
    timing.firstChunkAt ??= now;
    timing.lastChunkAt = now;
    timing.chunks++;
    const text = decoder.decode(value, { stream: true });
    if (!streamed) { raw += text; return true; }
    framer.push(text);
    timing.contentChars = assembly.contentChars;
    timing.reasoningChars = assembly.reasoningChars;
    return !failure;
  };
  let pending: Promise<ReadableStreamReadResult<Uint8Array>> | undefined;
  try {
    for (;;) {
      if (!reader) break;
      pending = reader.read();
      const piece = await within(pending, phase, outer, timeout);
      pending = undefined;
      if (piece.done || !accept(piece.value)) break;
      // Until reply text or thinking appears, the first-response deadline still holds: a role-only
      // chunk followed by silent reasoning is not cut short by the idle wait. Keepalives may extend it.
      const firstLeft = timing.firstContentAt ? 0 : limits.firstByteMs - (Date.now() - timing.fetchStartedAt);
      const limitMs = Math.max(limits.idleMs, firstLeft);
      phase = { wait: 'idle', limitMs, signal: AbortSignal.timeout(limitMs) };
    }
  } catch (error) {
    // The round's window ended while the reply was still arriving. Keep reading it as evidence only,
    // like a reply that arrives after the round stopped; a provider that went quiet is cut off.
    if (error instanceof ModelResponseTimeout && error.wait === 'work-window' && options.onLate && reader) {
      const late = options.onLate;
      void (async () => {
        let piece = pending ? await pending : await reader.read();
        while (!piece.done && accept(piece.value)) piece = await reader.read();
        const tail = decoder.decode();
        if (streamed) { framer.push(tail); framer.end(); }
        late({ response, body: streamed ? JSON.stringify(assembly.body()) : raw + tail, timing: { ...timing } });
      })().catch(() => {});
    } else reader?.cancel().catch(() => {});
    throw error;
  }
  if (failure) reader?.cancel().catch(() => {});
  const tail = decoder.decode();
  if (!streamed) return { response, body: raw + tail, timing };
  if (!failure) { framer.push(tail); framer.end(); }
  timing.contentChars = assembly.contentChars;
  timing.reasoningChars = assembly.reasoningChars;
  if (failure instanceof StreamProviderError) {
    throw new ModelStreamFailure('provider-error', `模型服務在串流途中回報錯誤，本回合沒有推進：${label}收到「${failure.providerCode} ${failure.providerMessage}」`.trim().slice(0, 400) + `（${received(timing)}）。`, timing);
  }
  if (failure instanceof StreamFormatError) throw new ModelStreamFailure('format', `模型服務的串流資料無法解析，本回合沒有推進：${label}${failure.message}（${received(timing)}）。`, timing);
  if (failure) throw failure;
  if (!assembly.complete) throw new ModelStreamFailure('interrupted', `模型回覆串流中斷，本回合沒有推進：${label}的連線在回覆完成前結束（${received(timing)}）。`, timing);
  return { response, body: JSON.stringify(assembly.body()), timing };
}
