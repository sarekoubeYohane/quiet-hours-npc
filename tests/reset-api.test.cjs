/* eslint-disable @typescript-eslint/no-require-imports -- Node tests load a temporary transpiled build. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const root = process.env.QUIET_HOURS_AUTH_BUILD;
const load = name => require(join(root, name + '.cjs'));
const fixture = load('fixture'), headers = load('headers'), world = load('app/api/world/route');
const { seedWorld } = load('lib/world');
const origin = 'http://localhost:5173';
const cookies = response => response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
const request = (path, cookie = '', init = {}) => new Request(origin + path, { ...init, headers: { cookie, ...init.headers } });
const operationId = () => `${Date.now()}:${crypto.randomUUID()}`;
function freshDatabase() {
  fixture.reset(); fixture.migrate(readFileSync(join(root, 'migrations.sql'), 'utf8'));
  Object.assign(fixture.env, { APP_ENV: 'local', AUTH_ORIGIN: origin, GITHUB_CLIENT_ID: 'local-client', GITHUB_CLIENT_SECRET: 'test-only-client-secret', SESSION_SECRET: 'test-only-signing-secret-at-least-32-characters', GITHUB_ALLOWED_IDS: '123,456', MODEL_KEY_ENCRYPTION_SECRET: 'ab'.repeat(32) });
  headers.set(new Headers());
}
async function signIn(id = 123) {
  const start = await load('app/api/auth/github/route').GET(request('/api/auth/github'));
  const state = new URL(start.headers.get('location')).searchParams.get('state');
  const original = global.fetch;
  global.fetch = async url => String(url).includes('/login/oauth/access_token') ? Response.json({ access_token: 'fake-github-token' }) : Response.json({ id, login: 'owner' + id });
  try { return cookies(await load('app/api/auth/github/callback/route').GET(request('/api/auth/github/callback?code=fake&state=' + state, cookies(start)))); }
  finally { global.fetch = original; }
}
function post(cookie, body) {
  headers.set(new Headers({ cookie }));
  return world.POST(request('/api/world', cookie, { method: 'POST', headers: { origin }, body: JSON.stringify({ mode: 'demo', operationId: operationId(), ...body }) }));
}
async function read(cookie) {
  headers.set(new Headers({ cookie }));
  const response = await world.GET();
  assert.equal(response.status, 200);
  return response.json();
}
const advance = (cookie, body = {}) => post(cookie, { operation: 'advance', minutes: 15, ...body });
const resetWorld = (cookie, body = {}) => post(cookie, { operation: 'reset', ...body });
const modelReply = () => Response.json({ usage: { prompt_tokens: 10, completion_tokens: 5 }, choices: [{ message: { content: JSON.stringify({ type: 'rest', target: '', content: '休息一下', mood: '平靜', durationMinutes: 60, intents: [] }) } }] });
const paidAdvance = async (cookie, fetcher = async () => modelReply()) => {
  const original = global.fetch; global.fetch = fetcher;
  try { return await advance(cookie, { mode: 'openai', model: 'gpt-6-luna' }); } finally { global.fetch = original; }
};

test('reset returns the signed-in world to the initial seed, keeps the version moving forward, and GET reads the same fresh world', async () => {
  freshDatabase();
  const cookie = await signIn();
  assert.equal((await advance(cookie)).status, 200);
  assert.equal((await advance(cookie, { minutes: 30 })).status, 200);
  assert.equal((await post(cookie, { operation: 'intervene', target: 'cass', text: '咖啡館明天有活動。' })).status, 200);
  assert.equal((await post(cookie, { operation: 'takeover' })).status, 200);
  const before = await read(cookie);
  assert.equal(before.world.turn, 2);
  assert.equal(before.world.characters.find(c => c.id === 'owner').control.mode, 'taken-over');
  const response = await resetWorld(cookie);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.operationSettled, true);
  assert.equal(result.version, before.version + 1);
  assert.deepEqual(result.world, { ...seedWorld(), aiUsage: before.world.aiUsage });
  const after = await read(cookie);
  assert.equal(after.version, before.version + 1);
  assert.deepEqual(after.world, result.world);
  assert.equal(after.world.events.length, 1);
  assert.equal(after.world.events[0].id, 'opening');
  assert.equal(after.world.characters.find(c => c.id === 'owner').control.mode, 'autonomous');
  // The fresh world keeps working: the next round is the first one again.
  assert.equal((await (await advance(cookie)).json()).world.turn, 1);
});

test('reset keeps hourly AI usage statistics while discarding characters, events and memories', async () => {
  freshDatabase();
  const cookie = await signIn();
  assert.equal((await post(cookie, { operation: 'set-model-key', mode: 'openai', key: 'test-only-model-key-never-real' })).status, 200);
  assert.equal((await paidAdvance(cookie)).status, 200);
  const before = await read(cookie);
  assert.equal(before.world.aiUsage.totalCalls, 4);
  assert.equal(before.world.aiUsage.calls, 4);
  assert.ok(before.world.characters[0].memories.length > seedWorld().characters[0].memories.length);
  // Continuing the planned 60-minute rests saves decisions in the old story; the fresh story starts from zero.
  assert.equal((await paidAdvance(cookie, async () => { throw Error('continuations must not call the model'); })).status, 200);
  assert.equal((await read(cookie)).world.aiUsage.savedDecisions, 4);
  const result = await (await resetWorld(cookie)).json();
  assert.deepEqual(result.world.aiUsage, { ...before.world.aiUsage, savedDecisions: 0 });
  assert.deepEqual(result.world.characters, seedWorld().characters);
  const after = await read(cookie);
  assert.deepEqual(after.world.aiUsage, { ...before.world.aiUsage, savedDecisions: 0 });
  assert.equal(after.world.turn, 0);
  // Hourly limits still count the earlier calls: a 3-call ceiling is already spent.
  assert.equal((await post(cookie, { operation: 'set-budget', limits: { calls: 3, tokens: 30000 } })).status, 200);
  const blocked = await post(cookie, { operation: 'advance', minutes: 15, mode: 'openai', model: 'gpt-6-luna', limits: { calls: 3, tokens: 30000 } });
  assert.equal(blocked.status, 429);
  assert.equal((await blocked.json()).limitReached, true);
});

test('reset only touches the signed-in account in this environment; another invited account keeps its world and version', async () => {
  freshDatabase();
  const first = await signIn(123), second = await signIn(456);
  assert.equal((await advance(first)).status, 200);
  assert.equal((await advance(second)).status, 200);
  assert.equal((await advance(second)).status, 200);
  const otherBefore = await read(second);
  assert.equal(otherBefore.world.turn, 2);
  assert.equal((await resetWorld(first)).status, 200);
  assert.equal((await read(first)).world.turn, 0);
  const otherAfter = await read(second);
  assert.equal(otherAfter.version, otherBefore.version);
  assert.deepEqual(otherAfter.world, otherBefore.world);
});

test('replaying the same reset operation returns the stored result without resetting the world again', async () => {
  freshDatabase();
  const cookie = await signIn();
  assert.equal((await advance(cookie)).status, 200);
  const body = { operation: 'reset', operationId: operationId() };
  const first = await (await post(cookie, body)).json();
  assert.equal(first.world.turn, 0);
  assert.equal((await advance(cookie)).status, 200);
  const latest = await read(cookie);
  assert.equal(latest.world.turn, 1);
  const replay = await post(cookie, body);
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), first);
  const after = await read(cookie);
  assert.equal(after.version, latest.version);
  assert.deepEqual(after.world, latest.world);
});

test('reset waits while another page holds the world lease and never leaves a half-reset world', async () => {
  freshDatabase();
  const cookie = await signIn();
  assert.equal((await post(cookie, { operation: 'set-model-key', mode: 'openai', key: 'test-only-model-key-never-real' })).status, 200);
  const original = global.fetch;
  let release, entered; const ready = new Promise(r => entered = r), gate = new Promise(r => release = r);
  let calls = 0;
  global.fetch = async () => { calls++; entered(); await gate; return modelReply(); };
  try {
    const running = advance(cookie, { mode: 'openai', model: 'gpt-6-luna' });
    await ready;
    const waiting = await resetWorld(cookie);
    assert.equal(waiting.status, 409);
    assert.equal((await waiting.json()).retryable, true);
    release();
    assert.equal((await running).status, 200);
  } finally { global.fetch = original; }
  const advanced = await read(cookie);
  assert.equal(advanced.world.turn, 1);
  assert.equal(calls, 4);
  const result = await (await resetWorld(cookie)).json();
  assert.equal(result.world.turn, 0);
  assert.deepEqual(result.world.aiUsage, advanced.world.aiUsage);
  assert.equal(result.version, advanced.version + 1);
});

test('a world saved by an older program version loads with compatible defaults and can be reset without a migration', async () => {
  freshDatabase();
  const cookie = await signIn();
  assert.equal((await read(cookie)).world.turn, 0);
  // Shape saved before intents, perception, operations and the cafe owner existed.
  const legacy = { minute: 1500, turn: 16, lastMode: 'demo', characters: seedWorld().characters.filter(c => c.id !== 'owner').map(({ id, name, color, location, mood, personality, goal, activity, relationships, memories }) => ({ id, name, color, location, mood, personality, goal, activity, relationships, memories: [...memories, { time: 1500, text: '舊版本保存的記憶。' }] })), events: [{ id: 'opening', time: 1260, actor: 'world', text: '舊版本開場。', kind: 'opening', audience: ['cass'] }] };
  await fixture.env.DB.prepare('UPDATE worlds SET state = ?, version = 7').bind(JSON.stringify(legacy)).run();
  const loaded = await read(cookie);
  assert.equal(loaded.version, 7);
  assert.equal(loaded.world.turn, 16);
  assert.ok(loaded.world.characters.some(c => c.id === 'owner'));
  assert.equal(loaded.world.characters[0].memories.at(-1).text, '舊版本保存的記憶。');
  const response = await resetWorld(cookie);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.version, 8);
  assert.deepEqual(result.world, seedWorld());
  const after = await read(cookie);
  assert.deepEqual({ ...after.world, aiUsage: undefined }, { ...seedWorld(), aiUsage: undefined });
  assert.equal(after.world.aiUsage.totalCalls, 0);
});

test('reset is a journaled mutation: it needs an operation identifier and the current account scope', async () => {
  freshDatabase();
  const cookie = await signIn();
  headers.set(new Headers({ cookie }));
  const missing = await world.POST(request('/api/world', cookie, { method: 'POST', headers: { origin }, body: JSON.stringify({ mode: 'demo', operation: 'reset' }) }));
  assert.equal(missing.status, 400);
  const foreign = await resetWorld(cookie, { operationScope: 'github:999' });
  assert.equal(foreign.status, 409);
  assert.equal((await foreign.json()).scopeMismatch, true);
  assert.equal((await read(cookie)).version, 0);
});

test('an operation issued before the reset cannot be applied to the fresh world; settled results still replay', async () => {
  freshDatabase();
  const cookie = await signIn();
  const earlier = { operation: 'intervene', target: 'cass', text: '舊故事裡的一句話。', operationId: operationId() };
  const settled = { operation: 'advance', minutes: 15, operationId: operationId() };
  const settledResult = await (await post(cookie, settled)).json();
  await new Promise(resolve => setTimeout(resolve, 2));
  assert.equal((await resetWorld(cookie)).status, 200);
  const stale = await post(cookie, earlier);
  assert.equal(stale.status, 410);
  assert.equal((await stale.json()).operationExpired, true);
  const after = await read(cookie);
  assert.equal(after.world.events.length, 1);
  assert.equal(after.world.turn, 0);
  const replay = await post(cookie, settled);
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), settledResult);
  assert.equal((await read(cookie)).world.turn, 0);
  // New intentions after the reset work as usual.
  assert.equal((await post(cookie, { operation: 'intervene', target: 'cass', text: '新故事的第一句話。' })).status, 200);
});
