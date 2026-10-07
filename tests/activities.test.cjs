const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fromBuild = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, `${name}.cjs`));
const { seedWorld, record, resolve } = fromBuild('world');
const { advanceActivities, currentUsage, canContinue, BudgetExceeded } = fromBuild('activities');
const { aiDecision } = fromBuild('models');
const { POST } = fromBuild('route');
const store = fromBuild('store');
const options = (decide, extras = {}) => ({ minutes: 15, mode: 'openai', modelKey: 'openai:test', limits: { calls: 120, tokens: 500000 }, decide, ...extras });
const restful = async (w, c, usage) => { usage({ inputTokens: 100, outputTokens: 20 }); return { action: { type: 'rest' }, durationMinutes: 90 }; };

test('90-minute activities reuse five later rounds without calls or duplicate memories', async () => {
  const world = seedWorld(); let calls = 0;
  const opts = options(async (...args) => { calls++; return restful(...args); });
  await advanceActivities(world, opts);
  const memories = world.characters.map(c => c.memories.length);
  for (let i = 0; i < 5; i++) await advanceActivities(world, opts);
  assert.equal(calls, 3); assert.equal(world.turn, 6);
  assert.equal(world.aiUsage.savedDecisions, 15);
  assert.deepEqual(world.characters.map(c => c.memories.length), memories);
  await advanceActivities(world, opts); assert.equal(calls, 6);
});

test('an intervention interrupts only its recipient and is consumed by the next action', async () => {
  const world = seedWorld(); const called = [];
  const opts = options(async (w, c, u) => { called.push(c.id); return restful(w, c, u); });
  await advanceActivities(world, opts); called.length = 0;
  record(world, 'observer', '先休息吧', 'intervention', ['vera']);
  await advanceActivities(world, opts);
  assert.deepEqual(called, ['vera']); called.length = 0;
  await advanceActivities(world, opts); assert.deepEqual(called, []);
});

test('private thoughts do not interrupt another NPC; messages affect only the recipient', async () => {
  const world = seedWorld(); await advanceActivities(world, options(restful));
  const vera = world.characters.find(c => c.id === 'vera');
  const cass = world.characters.find(c => c.id === 'cass');
  record(world, 'kris', '私密想法', 'reflect', ['kris']);
  assert.equal(canContinue(world, cass, 'openai:test'), true);
  assert.equal(canContinue(world, vera, 'openai:test'), true);
  resolve(world, cass, { type: 'message', target: 'vera', content: '晚安' });
  assert.equal(canContinue(world, vera, 'openai:test'), false);
  assert.equal(canContinue(world, world.characters.find(c => c.id === 'kris'), 'openai:test'), true);
});

test('a witnessed departure interrupts an activity and changing models invalidates plans', async () => {
  const world = seedWorld(); await advanceActivities(world, options(restful));
  const kris = world.characters.find(c => c.id === 'kris');
  resolve(world, world.characters.find(c => c.id === 'cass'), { type: 'move', target: 'cafe' });
  assert.equal(canContinue(world, kris, 'openai:test'), false);
  assert.equal(canContinue(world, world.characters.find(c => c.id === 'vera'), 'openai:other'), false);
});

test('budget prevents new requests, survives a reload, and resets its hourly window', async () => {
  const world = seedWorld(); const now = Date.now(); let calls = 0;
  const opts = options(async (...args) => { calls++; return restful(...args); }, { now, limits: { calls: 3, tokens: 30000 } });
  await advanceActivities(world, opts);
  const reloaded = JSON.parse(JSON.stringify(world));
  await assert.rejects(advanceActivities(reloaded, opts), BudgetExceeded);
  assert.equal(calls, 3); assert.equal(reloaded.turn, 1);
  const fresh = currentUsage(reloaded, now + 3600001);
  assert.equal(fresh.calls, 0); assert.equal(fresh.totalCalls, 3);
});

test('API failure rolls back a partial round but persists attempts and reported tokens', async () => {
  const world = seedWorld(); store.install(world); const originalFetch = global.fetch; let calls = 0;
  global.fetch = async () => ++calls === 1 ? Response.json({ usage: { prompt_tokens: 100, completion_tokens: 20 }, choices: [{ message: { content: JSON.stringify({ type: 'rest', target: '', content: '', mood: '平靜', durationMinutes: 90 }) } }] }) : new Response('', { status: 429 });
  try {
    const response = await POST(new Request('https://test.invalid/api/world', { method: 'POST', headers: { origin: 'https://test.invalid' }, body: JSON.stringify({ operation: 'advance', minutes: 15, mode: 'openai', model: 'gpt-6-luna', key: 'unit-test-key' }) }));
    assert.equal(response.status, 502);
    const saved = store.snapshot();
    assert.equal(saved.minute, world.minute); assert.equal(saved.turn, 0);
    assert.deepEqual(saved.characters, world.characters); assert.deepEqual(saved.events, world.events);
    assert.equal(saved.aiUsage.calls, 2); assert.equal(saved.aiUsage.unknownCalls, 1);
    assert.equal(saved.aiUsage.inputTokens, 100); assert.equal(saved.aiUsage.outputTokens, 20);
    assert.equal(JSON.stringify(saved).includes('unit-test-key'), false);
  } finally { global.fetch = originalFetch; }
});

test('API persists a completed round and rejects origin mismatch before requesting AI', async () => {
  store.install(seedWorld()); const originalFetch = global.fetch; let calls = 0;
  global.fetch = async () => { calls++; return Response.json({ usage: { prompt_tokens: 10, completion_tokens: 5 }, choices: [{ message: { content: JSON.stringify({ type: 'rest', durationMinutes: 90 }) } }] }); };
  const request = origin => new Request('https://test.invalid/api/world', { method: 'POST', headers: { origin }, body: JSON.stringify({ operation: 'advance', minutes: 15, mode: 'openai', model: 'gpt-6-luna', key: 'unit-test-key', limits: { calls: 3, tokens: 30000 } }) });
  try {
    assert.equal((await POST(request('https://other.invalid'))).status, 403); assert.equal(calls, 0);
    const first = await POST(request('https://test.invalid')); assert.equal(first.status, 200);
    assert.equal((await first.json()).limitReached, true); assert.equal(store.snapshot().turn, 1);
    const second = await POST(request('https://test.invalid')); assert.equal(second.status, 429);
    assert.equal(calls, 3); assert.equal(store.snapshot().turn, 1);
  } finally { global.fetch = originalFetch; }
});

test('model payload includes only recent memories and reports usage even with invalid JSON', async () => {
  const world = seedWorld(); const character = world.characters[0];
  character.memories = Array.from({ length: 80 }, (_, i) => ({ time: i, text: `memory-${i}` }));
  let payload, tokens;
  const fakeFetch = async (url, init) => { payload = JSON.parse(init.body); return Response.json({ usage: { prompt_tokens: 42, completion_tokens: 8 }, choices: [{ message: { content: 'invalid JSON' } }] }); };
  await assert.rejects(aiDecision(world, character, 'unit-test-key', 'gpt-6-luna', 'openai', fakeFetch, usage => tokens = usage));
  assert.equal(JSON.parse(payload.messages[1].content).self.memories.length, 12);
  assert.equal(payload.response_format.json_schema.strict, true);
  assert.deepEqual(tokens, { inputTokens: 42, outputTokens: 8 });
});
