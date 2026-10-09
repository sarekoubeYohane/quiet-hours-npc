/* eslint-disable @typescript-eslint/no-require-imports -- Fixtures load the temporary CommonJS build. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const build = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, `${name}.cjs`));
const { seedWorld } = build('world');
const { GET, POST } = build('route');
const store = build('store');
const request = body => new Request('https://test.invalid/api/world', { method: 'POST', headers: { origin: 'https://test.invalid' }, body: JSON.stringify({ mode: 'openai', ...body }) });
const advance = async mode => { await POST(request({ operation: 'set-model-key', mode: 'openai', key: 'unit-test-key' })); return POST(request({ operation: 'advance', mode: mode || 'openai', minutes: 15, model: 'gpt-6-luna', limits: { calls: 120, tokens: 500000 } })) };
const read = async () => (await (await GET()).json());
const usage = windowStartedAt => ({ windowStartedAt, calls: 5, inputTokens: 150, outputTokens: 100, unknownCalls: 1, totalCalls: 20, totalInputTokens: 600, totalOutputTokens: 400, totalUnknownCalls: 2, savedDecisions: 7 });
const withModel = async (run, failAt = 0) => {
  const original = global.fetch; let calls = 0;
  global.fetch = async () => {
    if (++calls === failAt) throw Error('provider unavailable');
    return Response.json({ usage: { prompt_tokens: 30, completion_tokens: 20 }, choices: [{ message: { content: JSON.stringify({ type: 'rest', target: '', content: '', mood: '', durationMinutes: 15, intents: [] }) } }] });
  };
  try { await run(); } finally { global.fetch = original; }
};

test('conflict adds only this request paid deltas to the newer world and preserves its lease and decision savings', async () => {
  const world = seedWorld(); world.aiUsage = usage(Date.now()); store.install(world);
  const newer = structuredClone(world); newer.minute = 1440; newer.turn = 12; newer.lastMode = 'concurrent';
  newer.characters[0].activity = '另一個回合已保存的活動';
  newer.aiUsage = { ...world.aiUsage, calls: 8, inputTokens: 240, outputTokens: 160, unknownCalls: 3, totalCalls: 60, totalInputTokens: 1800, totalOutputTokens: 1200, totalUnknownCalls: 4, savedDecisions: 18 };
  store.conflictOnNextSave(newer, { version: 10, lockedUntil: Date.now() + 240000 });
  await withModel(async () => {
    assert.equal((await advance()).status, 502);
    const saved = await read();
    assert.deepEqual(saved.world.characters, newer.characters); assert.deepEqual(saved.world.events, newer.events);
    assert.equal(saved.world.minute, 1440); assert.equal(saved.world.turn, 12); assert.equal(saved.world.lastMode, 'concurrent');
    assert.deepEqual(saved.world.aiUsage, { ...newer.aiUsage, calls: 12, inputTokens: 360, outputTokens: 240, totalCalls: 64, totalInputTokens: 1920, totalOutputTokens: 1280 });
    assert.equal(saved.version, 11);
    // A newer writer's lease is still held, as observed through the public API.
    assert.equal((await POST(request({ operation: 'takeover' }))).status, 409);
  });
});

test('failed model round plus final conflict retains only attempts actually made and known tokens', async () => {
  const world = seedWorld(); store.install(world); store.conflictOnNextSave();
  await withModel(async () => {
    assert.equal((await advance()).status, 502);
    const saved = (await read()).world;
    assert.deepEqual(saved.characters, world.characters); assert.deepEqual(saved.events, world.events);
    assert.equal(saved.turn, 0); assert.equal(saved.minute, 1260);
    assert.equal(saved.aiUsage.calls, 2); assert.equal(saved.aiUsage.totalCalls, 2);
    assert.equal(saved.aiUsage.inputTokens, 30); assert.equal(saved.aiUsage.outputTokens, 20);
    assert.equal(saved.aiUsage.totalInputTokens, 30); assert.equal(saved.aiUsage.totalOutputTokens, 20);
    assert.equal(saved.aiUsage.unknownCalls, 1); assert.equal(saved.aiUsage.totalUnknownCalls, 1);
    assert.equal(saved.aiUsage.savedDecisions, 0);
  }, 2);
});

test('ordinary save counts each paid decision once and ambiguous commit outcome is never blindly replayed', async () => {
  for (const uncertain of [false, true]) {
    store.install(seedWorld()); if (uncertain) store.throwAfterNextSave();
    await withModel(async () => {
      assert.equal((await advance()).status, uncertain ? 502 : 200);
      const saved = await read();
      assert.equal(saved.world.turn, 1); assert.equal(saved.version, 1);
      assert.equal(saved.world.aiUsage.totalCalls, 4); assert.equal(saved.world.aiUsage.totalInputTokens, 120);
      assert.equal(saved.world.aiUsage.totalOutputTokens, 80); assert.equal(saved.world.aiUsage.totalUnknownCalls, 0);
    });
  }
});

test('demo conflict adds no accounting and never changes a concurrently committed world', async () => {
  const world = seedWorld(); store.install(world);
  const newer = structuredClone(world); newer.turn = 9; newer.aiUsage = usage(Date.now());
  store.conflictOnNextSave(newer, { version: 10 });
  assert.equal((await advance('demo')).status, 502);
  const saved = await read(); assert.deepEqual(saved.world, newer); assert.equal(saved.version, 10);
});

test('older request adds lifetime usage without replacing or charging a newer hourly window', async () => {
  const world = seedWorld(); world.aiUsage = usage(Date.now() - 1000); store.install(world);
  const newer = structuredClone(world); newer.aiUsage = { ...usage(Date.now()), calls: 2, inputTokens: 60, outputTokens: 40, unknownCalls: 0, totalCalls: 80 };
  store.conflictOnNextSave(newer);
  await withModel(async () => {
    assert.equal((await advance()).status, 502);
    const saved = (await read()).world;
    assert.deepEqual(saved.aiUsage, { ...newer.aiUsage, totalCalls: 84, totalInputTokens: 720, totalOutputTokens: 480 });
  });
});

test('newer request establishes its hourly window while adding lifetime usage to an older saved window', async () => {
  const world = seedWorld(); world.aiUsage = usage(Date.now() - 3600001); store.install(world);
  const newer = structuredClone(world); newer.aiUsage.totalCalls = 80;
  store.conflictOnNextSave(newer);
  await withModel(async () => {
    assert.equal((await advance()).status, 502);
    const saved = (await read()).world;
    assert.ok(saved.aiUsage.windowStartedAt > world.aiUsage.windowStartedAt);
    assert.deepEqual({ ...saved.aiUsage, windowStartedAt: 0 }, { ...newer.aiUsage, windowStartedAt: 0, calls: 4, inputTokens: 120, outputTokens: 80, unknownCalls: 0, totalCalls: 84, totalInputTokens: 720, totalOutputTokens: 480 });
  });
});

test('recovery cannot charge or release a different owner world', async () => {
  store.install(seedWorld()); const foreign = seedWorld(); foreign.aiUsage = usage(Date.now()); foreign.turn = 22;
  store.conflictOnNextSave(foreign, { owner: 'another-owner', version: 10, lockedUntil: Date.now() + 240000 });
  const auth = build('auth');
  await withModel(async () => {
    assert.equal((await advance()).status, 502);
    auth.setUserId('another-owner');
    try {
      const saved = await read(); assert.deepEqual(saved.world, foreign); assert.equal(saved.version, 10);
      assert.equal((await POST(request({ operation: 'takeover' }))).status, 409);
    } finally { auth.setUserId('test-owner'); }
  });
});

