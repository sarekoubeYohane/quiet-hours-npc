/* eslint-disable @typescript-eslint/no-require-imports -- Streaming transport at the provider seam, and the round it serves. */
// Every provider reply is streamed. These doubles replay both wire formats (OpenAI-compatible
// chat completions for openai/openrouter/deepseek/gemini, and Anthropic Messages events) and the
// waits between their pieces; nothing leaves the machine.
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path');
const load = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, `${name}.cjs`));
const { requestModel, modelRequestBody } = load('model-adapter');
const { providerReasoning } = load('provider-api');
const { roundTimePolicy } = load('round-time-policy');

const messages = [{ role: 'system', content: '規則' }, { role: 'user', content: '{}' }];
const encoder = new TextEncoder();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const limits = { firstByteMs: 150, idleMs: 100 };
const candidate = '{"type":"wait","reason":"等水開"}';

// A provider double: each piece is [delayBeforeMs, text]. `end` closes the body; otherwise it stalls.
function sse(pieces, { end = true, contentType = 'text/event-stream', status = 200, headersAfterMs = 0 } = {}) {
  let cancelled = false;
  const body = new ReadableStream({
    async start(controller) {
      for (const [delay, text] of pieces) { await sleep(delay); if (cancelled) return; controller.enqueue(encoder.encode(text)); }
      if (end) controller.close();
    },
    cancel() { cancelled = true; },
  });
  return async (_url, init) => {
    if (headersAfterMs) await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, headersAfterMs);
      init.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(init.signal.reason); }, { once: true });
    });
    return new Response(body, { status, headers: { 'content-type': contentType } });
  };
}
const chunk = value => `data: ${JSON.stringify(value)}\n\n`;
const delta = (d, extra = {}) => chunk({ id: 'c1', model: 'm', choices: [{ index: 0, delta: d, finish_reason: null }], ...extra });
const finish = reason => chunk({ id: 'c1', model: 'm', choices: [{ index: 0, delta: {}, finish_reason: reason }] });
const usageChunk = chunk({ id: 'c1', model: 'm', choices: [], usage: { prompt_tokens: 120, completion_tokens: 30, prompt_tokens_details: { cached_tokens: 100 } } });
const done = 'data: [DONE]\n\n';
const event = (name, value) => `event: ${name}\ndata: ${JSON.stringify({ type: name, ...value })}\n\n`;
const messageStart = event('message_start', { message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-test', content: [], stop_reason: null, usage: { input_tokens: 20, cache_read_input_tokens: 100, cache_creation_input_tokens: 0, output_tokens: 1 } } });
const blockStart = (index, type) => event('content_block_start', { index, content_block: type === 'text' ? { type: 'text', text: '' } : { type: 'thinking', thinking: '' } });
const textDelta = (text, index = 0) => event('content_block_delta', { index, delta: { type: 'text_delta', text } });
const thinkingDelta = (thinking, index = 0) => event('content_block_delta', { index, delta: { type: 'thinking_delta', thinking } });
const blockStop = index => event('content_block_stop', { index });
const messageDelta = (usage = { output_tokens: 30 }) => event('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage });
const messageStop = event('message_stop', {});
const ping = event('ping', {});

// Node unreferences AbortSignal.timeout timers; a stalled double would otherwise let the event loop
// drain before the wait fires. A Worker request keeps itself alive, so the test holds the loop open.
async function held(work) { const keep = setInterval(() => {}, 1000); try { return await work; } finally { clearInterval(keep); } }
async function call(provider, fetcher, extra = {}) {
  const observed = [], usage = [];
  const run = requestModel({ provider, model: 'test-model', key: 'fixture-key' }, messages, { type: 'object' }, {
    signal: AbortSignal.timeout(5000), fetcher, observer: e => { observed.push(e); }, onUsage: tokens => { usage.push(tokens); },
    waitLimits: limits, label: '白芷的 NPC 決策', ...extra,
  });
  return held(run).then(raw => ({ raw, observed, usage }), error => ({ error, observed, usage }));
}
const response = observed => observed.find(e => e.kind === 'response');
const failure = observed => observed.find(e => e.kind === 'failure');

test('every provider request asks for a stream; OpenAI-compatible services also ask for usage in the last chunk', () => {
  for (const provider of ['openai', 'deepseek', 'gemini']) {
    const request = JSON.parse(modelRequestBody({ provider, model: 'm' }, messages, { type: 'object' }));
    assert.equal(request.stream, true, provider);
    assert.deepEqual(request.stream_options, { include_usage: true }, provider);
  }
  const openrouter = JSON.parse(modelRequestBody({ provider: 'openrouter', model: 'm' }, messages, { type: 'object' }));
  assert.equal(openrouter.stream, true);
  assert.equal(Object.hasOwn(openrouter, 'stream_options'), false, 'OpenRouter always reports usage; the option is deprecated');
  const anthropic = JSON.parse(modelRequestBody({ provider: 'anthropic', model: 'm' }, messages, { type: 'object' }));
  assert.equal(anthropic.stream, true);
  assert.equal(Object.hasOwn(anthropic, 'stream_options'), false);
  const openai = JSON.parse(modelRequestBody({ provider: 'openai', model: 'gpt-6-luna' }, messages, { type: 'object' }));
  assert.equal(openai.response_format.type, 'json_schema', 'strict structured output is still requested while streaming');
});

const openaiCompatible = [
  { name: 'openai', provider: 'openai' },
  { name: 'anthropic', provider: 'anthropic' },
];

test('OpenAI-compatible stream: pieces are joined, usage in the last chunk is accounted once, and the assembled reply is traced', async () => {
  const pieces = [[0, delta({ role: 'assistant', content: '' })], ...['{"type":"wait",', '"reason":"等', '水開"}'].map(text => [10, delta({ content: text })]), [5, finish('stop')], [5, usageChunk], [5, done]];
  const { raw, observed, usage, error } = await call('openai', sse(pieces));
  assert.equal(error, undefined, error?.message);
  assert.equal(raw, candidate);
  assert.deepEqual(usage, [{ inputTokens: 120, outputTokens: 30, cachedInputTokens: 100 }]);
  const received = response(observed);
  const body = JSON.parse(received.responseBody);
  assert.equal(body.choices[0].message.content, candidate);
  assert.equal(body.choices[0].finish_reason, 'stop');
  assert.deepEqual(body.usage, { prompt_tokens: 120, completion_tokens: 30, prompt_tokens_details: { cached_tokens: 100 } });
  assert.equal(received.stream.assembled, true, 'the trace says the reply was assembled from a stream');
  assert.ok(received.stream.firstChunkAt <= received.stream.firstContentAt && received.stream.firstContentAt <= received.stream.lastChunkAt);
  assert.equal(received.stream.chunks, pieces.length);
  assert.equal(observed.find(e => e.kind === 'candidate').raw, candidate);
});

test('Anthropic stream: text deltas are joined and input usage from message_start merges with output usage from message_delta', async () => {
  const pieces = [[0, messageStart], [5, blockStart(0, 'text')], ...['{"type":"wait",', '"reason":"等', '水開"}'].map(text => [10, textDelta(text)]), [5, blockStop(0)], [5, messageDelta()], [5, messageStop]];
  const { raw, observed, usage, error } = await call('anthropic', sse(pieces));
  assert.equal(error, undefined, error?.message);
  assert.equal(raw, candidate);
  assert.deepEqual(usage, [{ inputTokens: 120, outputTokens: 30, cachedInputTokens: 100 }]);
  const body = JSON.parse(response(observed).responseBody);
  assert.deepEqual(body.content, [{ type: 'text', text: candidate }]);
  assert.equal(body.stop_reason, 'end_turn');
  assert.equal(body.usage.input_tokens, 20);
  assert.equal(body.usage.output_tokens, 30);
  assert.equal(response(observed).stream.assembled, true);
});

for (const { name, provider } of openaiCompatible) {
  const opening = provider === 'anthropic' ? [[0, messageStart], [0, blockStart(0, 'text')]] : [[0, delta({ role: 'assistant', content: '' })]];
  const text = value => provider === 'anthropic' ? textDelta(value) : delta({ content: value });
  const closing = provider === 'anthropic' ? [[5, blockStop(0)], [5, messageDelta()], [5, messageStop]] : [[5, finish('stop')], [5, usageChunk], [5, done]];

  test(`${name}: no data at all within the first-response limit is a first-response timeout naming the task, the wait and what arrived`, async () => {
    const { error, observed, usage } = await call(provider, sse([], { end: false }));
    assert.equal(error?.name, 'TimeoutError');
    assert.equal(error.wait, 'first-byte');
    assert.match(error.message, /白芷的 NPC 決策/);
    assert.match(error.message, /首段回應逾時/);
    assert.match(error.message, /0\.\d+ 秒|0 秒/);
    assert.match(error.message, /尚未收到任何內容/);
    assert.equal(usage.length, 0);
    assert.equal(failure(observed).failure, 'timeout');
    assert.equal(failure(observed).stream.firstChunkAt, undefined);
    assert.doesNotMatch(error.message, /fixture-key/);
  });

  test(`${name}: headers that never come are bounded by the same first-response limit`, async () => {
    const { error } = await call(provider, sse([], { headersAfterMs: 2000 }));
    assert.equal(error?.wait, 'first-byte');
    assert.match(error.message, /尚未收到 HTTP 回應/);
  });

  test(`${name}: a stall after some content is an idle timeout that reports the received amount`, async () => {
    const { error, observed, usage } = await call(provider, sse([...opening, [10, text('{"type":"wa')]], { end: false }));
    assert.equal(error?.wait, 'idle');
    assert.match(error.message, /白芷的 NPC 決策閒置逾時/);
    assert.match(error.message, /已收到正文 11 字/);
    assert.equal(usage.length, 0, 'a partial stream is unknown usage, never zero');
    const failed = failure(observed);
    assert.equal(failed.failure, 'timeout');
    assert.ok(failed.stream.firstChunkAt && failed.stream.lastChunkAt >= failed.stream.firstChunkAt);
    assert.equal(observed.some(e => e.kind === 'usage'), false);
  });

  test(`${name}: a body that ends before the reply is complete is a broken stream, not a candidate`, async () => {
    const { error, observed, usage } = await call(provider, sse([...opening, [5, text('{"type":"wa')]]));
    assert.match(error?.message || '', /串流中斷/);
    assert.match(error.message, /已收到正文 11 字/);
    assert.equal(usage.length, 0);
    assert.equal(failure(observed).failure, 'response-body');
    assert.equal(observed.some(e => e.kind === 'candidate'), false);
  });

  test(`${name}: a complete stream without usage still returns the reply and leaves usage unknown`, async () => {
    const noUsage = provider === 'anthropic'
      ? [[0, event('message_start', { message: { id: 'msg_1', model: 'm', content: [], usage: null } })], [0, blockStart(0, 'text')], [5, text(candidate)], [5, blockStop(0)], [5, event('message_delta', { delta: { stop_reason: 'end_turn' } })], [5, messageStop]]
      : [...opening, [5, text(candidate)], [5, finish('stop')], [5, done]];
    const { raw, usage, observed, error } = await call(provider, sse(noUsage));
    assert.equal(error, undefined, error?.message);
    assert.equal(raw, candidate);
    assert.equal(usage.length, 0);
    assert.equal(response(observed).usage, undefined);
  });

  test(`${name}: thinking pieces arrive before the reply and keep the stream alive past the idle limit`, async () => {
    const thinking = provider === 'anthropic'
      ? [[0, messageStart], [0, blockStart(0, 'thinking')], ...Array.from({ length: 6 }, () => [50, thinkingDelta('想一下。')]), [5, blockStop(0)], [5, blockStart(1, 'text')], [5, textDelta(candidate, 1)], [5, blockStop(1)], [5, messageDelta()], [5, messageStop]]
      : [[0, delta({ role: 'assistant', content: null, reasoning_content: '' })], ...Array.from({ length: 6 }, () => [50, delta({ reasoning_content: '想一下。' })]), [5, delta({ content: candidate })], [5, finish('stop')], [5, usageChunk], [5, done]];
    const { raw, observed, error } = await call(provider, sse(thinking));
    assert.equal(error, undefined, error?.message);
    assert.equal(raw, candidate, 'thinking never becomes the candidate');
    const received = response(observed);
    assert.ok(received.stream.firstChunkAt < received.stream.firstContentAt, 'first data arrived before the first reply text');
    assert.ok(received.stream.lastChunkAt - received.stream.firstChunkAt > limits.idleMs, 'the whole stream outlasted one idle limit');
    if (provider === 'anthropic') assert.equal(JSON.parse(received.responseBody).content.find(b => b.type === 'thinking').thinking, '想一下。'.repeat(6));
    else assert.equal(providerReasoning(received.responseBody), '想一下。'.repeat(6));
  });

  test(`${name}: keepalive signals between pieces count as activity and are not content`, async () => {
    const keepalive = provider === 'anthropic' ? ping : ': OPENROUTER PROCESSING\n\n';
    const pieces = [...opening, [5, text('{"type":"wait",')], ...Array.from({ length: 5 }, () => [50, keepalive]), [5, text('"reason":"等水開"}')], ...closing];
    const { raw, observed, error } = await call(provider === 'anthropic' ? 'anthropic' : 'openrouter', sse(pieces));
    assert.equal(error, undefined, error?.message);
    assert.equal(raw, candidate);
    assert.doesNotMatch(response(observed).responseBody, /OPENROUTER PROCESSING|"ping"/);
  });

  test(`${name}: a provider error inside the stream is reported with its message`, async () => {
    const failing = provider === 'anthropic'
      ? [[0, messageStart], [5, event('error', { error: { type: 'overloaded_error', message: 'Overloaded' } })]]
      : [...opening, [5, chunk({ error: { code: 502, message: 'Upstream provider unavailable' } })]];
    const { error, usage } = await call(provider, sse(failing));
    assert.match(error?.message || '', /模型服務在串流途中回報錯誤/);
    assert.match(error.message, provider === 'anthropic' ? /overloaded_error.*Overloaded/ : /502.*Upstream provider unavailable/);
    assert.equal(usage.length, 0);
  });
}

test('a refusal or length stop delivered through the stream keeps its original meaning', async () => {
  const refused = await call('openai', sse([[0, delta({ role: 'assistant', content: null, refusal: '不能協助' })], [5, finish('stop')], [5, done]]));
  assert.match(refused.error?.message || '', /模型未接受這次場景請求/);
  const cut = await call('openai', sse([[0, delta({ content: '{"type":' })], [5, finish('length')], [5, done]]));
  assert.match(cut.error?.message || '', /超過長度限制/);
  const anthropicCut = await call('anthropic', sse([[0, messageStart], [0, blockStart(0, 'text')], [5, textDelta('{"type":')], [5, event('message_delta', { delta: { stop_reason: 'max_tokens' }, usage: { output_tokens: 9 } })], [5, messageStop]]));
  assert.match(anthropicCut.error?.message || '', /超過長度限制/);
});

test('a JSON reply from a provider that ignored the stream flag is still read whole', async () => {
  const fetcher = async () => Response.json({ usage: { prompt_tokens: 3, completion_tokens: 4 }, choices: [{ finish_reason: 'stop', message: { content: candidate } }] });
  const { raw, usage, observed } = await call('openai', fetcher);
  assert.equal(raw, candidate);
  assert.deepEqual(usage, [{ inputTokens: 3, outputTokens: 4 }]);
  assert.equal(response(observed).stream.assembled, false);
});

test('the default limits come from the round time policy, and a call is otherwise bounded only by its own signal', () => {
  assert.equal(typeof roundTimePolicy.modelFirstByteMs, 'number');
  assert.equal(typeof roundTimePolicy.modelIdleMs, 'number');
  assert.ok(roundTimePolicy.modelIdleMs <= roundTimePolicy.modelFirstByteMs);
  assert.equal(Object.hasOwn(roundTimePolicy, 'modelMs'), false, 'no fixed total per call');
});

test('stream arrival times survive when an oversized trace keeps receipts only', () => {
  const { omitDecisionTraceContent } = load('decision-traces');
  const trace = { operationId: 'op', requestId: 'r', operation: 'advance', baseVersion: 1, contextId: 'c', outcome: 'committed', schemaVersion: 1, acceptedAt: 1, lastKnownStage: 'x', steps: [], gaps: [], redacted: false,
    dispatches: [{ sequence: 1, task: 'npc', fetchStartedAt: 10, headersReceivedAt: 12, firstChunkAt: 13, firstContentAt: 14, lastChunkAt: 30, streamChunks: 900, responseAssembledFromStream: true, responseBody: 'x'.repeat(100) }] };
  const kept = omitDecisionTraceContent(trace, 'single-record-limit').dispatches[0];
  assert.equal(kept.responseBody, undefined);
  for (const key of ['firstChunkAt', 'firstContentAt', 'lastChunkAt', 'streamChunks']) assert.equal(kept[key], trace.dispatches[0][key], key);
  assert.equal(kept.responseAssembledFromStream, true);
});

// ---- The round: a stalled stream rolls back with a readable reason, and its usage stays unknown.
const { scenario } = require('./routine-program-fixture.cjs');
const store = load('store');
const { GET } = load('route');
const query = async id => (await (await GET(new Request('https://test.invalid/api/world?operationScope=test-owner&operationId=' + encodeURIComponent(id)))).json());
const { fixturePursuitDecision } = require('./pursuit-fixture.cjs');

test('a stalled NPC stream rolls back the round, names the actor and wait on screen, and its usage stays unknown in both ledgers', async () => {
  const s = await scenario();
  const original = AbortSignal.timeout;
  // Shrink only the transport's own wait limits; the round window keeps its real length.
  AbortSignal.timeout = ms => original(ms === roundTimePolicy.modelIdleMs ? 80 : ms === roundTimePolicy.modelFirstByteMs ? 150 : ms);
  let sent = 0;
  try {
    const before = await s.read();
    const actor = before.characters[0];
    global.fetch = async (_url, init) => {
      sent++;
      const input = JSON.parse(JSON.parse(init.body).messages[1].content);
      const reply = JSON.stringify(fixturePursuitDecision(input, { type: 'wait', mood: '平靜', durationMinutes: 15, intents: [] })).slice(0, 40);
      return sse([[0, delta({ role: 'assistant', content: '' })], [5, delta({ content: reply })]], { end: false })(_url, init);
    };
    const operationId = Date.now() + ':' + crypto.randomUUID();
    const r = await held(s.post({ operation: 'advance', minutes: 15, operationId }));
    const body = await r.json();
    assert.equal(r.status, 502);
    assert.equal(sent, 1, 'no automatic retry');
    assert.match(body.error, /^模型回應逾時，本回合沒有推進。/);
    assert.match(body.error, new RegExp(`${actor.name}的 NPC 決策閒置逾時`));
    assert.match(body.error, /已收到正文 40 字/);
    assert.doesNotMatch(body.error, /fixture-key/);
    const saved = await query(operationId);
    assert.equal(saved.world.turn, before.turn, 'the round rolled back');
    assert.equal(saved.world.aiUsage.totalCalls, 1);
    assert.equal(saved.world.aiUsage.totalUnknownCalls, 1, 'a stalled stream is unknown usage, not zero');
    assert.equal(saved.world.aiUsage.totalInputTokens, 0);
    assert.equal(saved.accountPlayer.usage.totalCalls, 1);
    assert.equal(saved.accountPlayer.usage.totalUnknownCalls, 1);
    const phases = (await store.database().prepare('SELECT phase FROM player_dispatches').bind().all()).results.map(row => row.phase);
    assert.deepEqual(phases, ['unknown']);
    const dispatch = saved.decisionTrace.dispatches[0];
    assert.equal(dispatch.usage, undefined, 'recovery must not settle the dispatch from a partial stream');
    assert.equal(dispatch.failure.kind, 'timeout');
    assert.equal(dispatch.responseAssembledFromStream, true);
    assert.ok(dispatch.firstChunkAt >= dispatch.fetchStartedAt && dispatch.lastChunkAt >= dispatch.firstChunkAt);
    // Reading the account again (which runs recovery) keeps the call unknown.
    const again = await query(operationId);
    assert.equal(again.accountPlayer.usage.totalUnknownCalls, 1);
    // A call budget still counts the unknown call: the next paid dispatch is refused before sending.
    await s.post({ operation: 'set-budget', limits: { calls: 1, tokens: null } });
    const next = await s.post({ operation: 'advance', minutes: 15 });
    assert.equal(next.status, 429);
    assert.equal(sent, 1);
  } finally { AbortSignal.timeout = original; s.restore(); }
});
