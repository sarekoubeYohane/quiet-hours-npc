/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const build = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, `${name}.cjs`));
const { POST, GET } = build('route');
const store = build('store');
const { seedWorld, normalizeWorld } = build('world');
const request = body => new Request('https://test.invalid/api/world', { method: 'POST', headers: { origin: 'https://test.invalid' }, body: JSON.stringify(body) });
const advance = () => POST(request({ operation: 'advance', operationId: `${Date.now()}:${crypto.randomUUID()}`, mode: 'openai', model: 'gpt-6-luna', minutes: 15, limits: { calls: 120, tokens: 500000 } }));
test('failed provider requests consume daily quota without advancing the world', async () => {
  store.install(seedWorld());
  await POST(request({ operation: 'set-model-key', mode: 'openai', key: 'test-key' }));
  const original = global.fetch;
  global.fetch = async () => { throw Error('provider unavailable'); };
  try {
    assert.equal((await advance()).status, 502);
    const result = await (await GET()).json();
    assert.equal(result.world.turn, 0);
    assert.equal(result.dailyUsage.used, 1);
    assert.equal(result.dailyUsage.remaining, 143);
    assert.equal(result.dailyUsage.reserved, 0);
  } finally { global.fetch = original; }
});

test('the 144 hard limit survives world replacement, key changes and a fresh login', async () => {
  store.install(seedWorld());
  await POST(request({ operation: 'set-model-key', mode: 'openai', key: 'test-key' }));
  const original = global.fetch, clock = Date.now;
  let now = Date.parse('2026-10-12T01:00:00Z'); Date.now = () => now;
  let sent = 0;
  global.fetch = async () => { sent++; throw Error('provider unavailable'); };
  try {
    // One-character fixture exercises the final available request at the API boundary.
    const one = normalizeWorld(seedWorld()); one.characters = one.characters.filter(c => c.id === 'owner');
    store.replaceWorld(one);
    for (let i = 0; i < 144; i++) {
      now++;
      if (i === 100) { now += 3600001; store.replaceWorld(one); }
      assert.equal((await advance()).status, 502);
    }
    store.replaceWorld(one);
    await POST(request({ operation: 'set-model-key', mode: 'openai', key: 'replacement-key' }));
    build('auth').setUserId(null);
    assert.equal((await GET()).status, 401);
    build('auth').setUserId('test-owner');
    const refused = await advance();
    assert.equal(refused.status, 429);
    assert.equal((await refused.json()).dailyLimitReached, true);
    const result = await (await GET()).json();
    assert.equal(result.dailyUsage.used, 144);
    assert.equal(result.dailyUsage.remaining, 0);
    assert.equal(sent, 144);
  } finally { global.fetch = original; Date.now = clock; build('auth').setUserId('test-owner'); }
});

test('requests across Taipei midnight use their dispatch date and release unused reservations', async () => {
  const original = global.fetch, clock = Date.now;
  let now = Date.parse('2026-10-12T15:59:59Z'); Date.now = () => now;
  store.install(seedWorld());
  await POST(request({ operation: 'set-model-key', mode: 'openai', key: 'test-key' }));
  let sent = 0;
  global.fetch = async () => {
    sent++;
    if (sent === 1) now += 2000;
    return Response.json({ choices: [{ message: { content: JSON.stringify({ type: 'rest', target: '', content: '', mood: '', durationMinutes: 15, intents: [] }) } }] });
  };
  try {
    assert.equal((await advance()).status, 200);
    let result = await (await GET()).json();
    assert.equal(result.dailyUsage.day, '2026-10-13');
    assert.equal(result.dailyUsage.used, 3);
    assert.equal(result.dailyUsage.reserved, 0);
    now -= 2000;
    result = await (await GET()).json();
    assert.equal(result.dailyUsage.day, '2026-10-12');
    assert.equal(result.dailyUsage.used, 1);
    assert.equal(result.dailyUsage.reserved, 0);
  } finally { global.fetch = original; Date.now = clock; }
});

test('an ambiguous world save cannot erase daily attempts, and replay cannot count twice', async () => {
  store.install(seedWorld());
  await POST(request({ operation: 'set-model-key', mode: 'openai', key: 'test-key' }));
  store.throwBeforeNextSave();
  const original = global.fetch;
  global.fetch = async () => { throw new DOMException('provider timeout', 'TimeoutError'); };
  const body = { operation: 'advance', operationId: `${Date.now()}:${crypto.randomUUID()}`, mode: 'openai', model: 'gpt-6-luna', minutes: 15 };
  try {
    assert.equal((await POST(request(body))).status, 502);
    assert.equal((await POST(request(body))).status, 502);
    const result = await (await GET()).json();
    assert.equal(result.world.turn, 0);
    assert.equal(result.dailyUsage.used, 1);
    assert.equal(result.dailyUsage.reserved, 0);
  } finally { global.fetch = original; }
});

test('independent environment worlds share atomic reservations and never exceed 144', async () => {
  const original = global.fetch, clock = Date.now;
  let now = Date.parse('2026-10-12T01:00:00Z'); Date.now = () => now;
  store.install(seedWorld());
  await POST(request({ operation: 'set-model-key', mode: 'openai', key: 'test-key' }));
  const one = normalizeWorld(seedWorld()); one.characters = one.characters.filter(c => c.id === 'owner');
  store.replaceWorld(one);
  let sent = 0, release, enter;
  const gate = new Promise(resolve => { release = resolve; });
  const bothStarted = new Promise(resolve => { enter = resolve; });
  global.fetch = async () => { sent++; throw Error('failure'); };
  try {
    for (let i = 0; i < 136; i++) {
      now++;
      if (i === 100) { now += 3600001; store.replaceWorld(one); }
      assert.equal((await advance()).status, 502);
    }
    store.replaceWorld(seedWorld());
    global.fetch = async () => {
      sent++;
      if (sent === 138) enter();
      await gate;
      return Response.json({ choices: [{ message: { content: JSON.stringify({ type: 'rest', target: '', content: '', mood: '', durationMinutes: 15, intents: [] }) } }] });
    };
    const first = advance();
    const second = store.inOtherEnvironment(seedWorld(), advance);
    await bothStarted;
    const during = await (await GET()).json();
    assert.equal(during.dailyUsage.used, 138);
    assert.equal(during.dailyUsage.reserved, 6);
    assert.equal(during.dailyUsage.remaining, 0);
    const third = await store.inOtherEnvironment(seedWorld(), advance);
    assert.equal(third.status, 429);
    release();
    assert.equal((await first).status, 200);
    assert.equal((await second).status, 200);
    const result = await (await GET()).json();
    assert.equal(result.dailyUsage.used, 144);
    assert.equal(result.dailyUsage.reserved, 0);
    assert.equal(sent, 144);
  } finally { release(); global.fetch = original; Date.now = clock; }
});

test('a missing ledger blocks model dispatch while rule mode remains usable', async () => {
  store.install(seedWorld());
  await POST(request({ operation: 'set-model-key', mode: 'openai', key: 'test-key' }));
  const env = build('cloudflare-workers').env, ledger = env.USAGE_DB, original = global.fetch;
  let sent = 0;
  global.fetch = async () => { sent++; throw Error('must not dispatch'); };
  delete env.USAGE_DB;
  try {
    assert.equal((await advance()).status, 502);
    const result = await (await GET()).json();
    assert.equal(result.dailyUsage, null);
    assert.equal(result.world.turn, 0);
    assert.equal(sent, 0);
    const demo = await POST(request({ operation: 'advance', operationId: `${Date.now()}:${crypto.randomUUID()}`, mode: 'demo', minutes: 15 }));
    assert.equal(demo.status, 200);
  } finally { env.USAGE_DB = ledger; global.fetch = original; }
});

test('hourly refusal releases the daily reservation without counting an unsent request', async () => {
  store.install(seedWorld());
  await POST(request({ operation: 'set-model-key', mode: 'openai', key: 'test-key' }));
  const response = await POST(request({ operation: 'advance', operationId: `${Date.now()}:${crypto.randomUUID()}`, mode: 'openai', model: 'gpt-6-luna', minutes: 15, limits: { calls: 3, tokens: 1000 } }));
  assert.equal(response.status, 429);
  const result = await (await GET()).json();
  assert.equal(result.dailyUsage.used, 0);
  assert.equal(result.dailyUsage.reserved, 0);
  assert.equal(result.dailyUsage.remaining, 144);
});

test('SQL queued beyond lease expiry never consumes a released reservation or sends a model request', async () => {
  const original = global.fetch, clock = Date.now;
  let now = Date.parse('2026-10-12T01:00:00Z'); Date.now = () => now;
  store.install(seedWorld());
  await POST(request({ operation: 'set-model-key', mode: 'openai', key: 'test-key' }));
  store.delayNextUsageDispatch({ before: () => { now += 130000; } });
  let sent = 0; global.fetch = async () => { sent++; throw Error('must not send'); };
  try {
    assert.equal((await advance()).status, 502);
    const result = await (await GET()).json();
    assert.equal(result.dailyUsage.used, 0);
    assert.equal(result.dailyUsage.reserved, 0);
    assert.equal(result.dailyUsage.remaining, 144);
    assert.equal(sent, 0);
  } finally { global.fetch = original; Date.now = clock; }
});

test('a quota write acknowledged after midnight is refunded and reserved on the actual dispatch day', async () => {
  const original = global.fetch, clock = Date.now;
  let now = Date.parse('2026-10-12T15:59:59Z'); Date.now = () => now;
  store.install(seedWorld());
  await POST(request({ operation: 'set-model-key', mode: 'openai', key: 'test-key' }));
  store.delayNextUsageDispatch({ after: () => { now += 2000; } });
  global.fetch = async () => { throw Error('provider failure'); };
  try {
    assert.equal((await advance()).status, 502);
    let result = await (await GET()).json();
    assert.equal(result.dailyUsage.day, '2026-10-13');
    assert.equal(result.dailyUsage.used, 1);
    assert.equal(result.dailyUsage.reserved, 0);
    now -= 2000;
    result = await (await GET()).json();
    assert.equal(result.dailyUsage.day, '2026-10-12');
    assert.equal(result.dailyUsage.used, 0);
    assert.equal(result.dailyUsage.reserved, 0);
  } finally { global.fetch = original; Date.now = clock; }
});
