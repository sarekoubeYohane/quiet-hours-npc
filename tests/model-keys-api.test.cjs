/* eslint-disable @typescript-eslint/no-require-imports -- Tests use a temporary transpiled Worker. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const root = process.env.QUIET_HOURS_AUTH_BUILD;
const load = name => require(join(root, name + '.cjs'));
const fixture = load('fixture'), headers = load('headers'), world = load('app/api/world/route');
const origin = 'http://localhost:5173';
const fakeKey = 'test-only-model-key-never-real';
const cookies = response => response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
const request = (path, cookie = '', init = {}) => new Request(fixture.env.AUTH_ORIGIN + path, { ...init, headers: { cookie, ...init.headers } });
function reset() {
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
async function post(cookie, body, originHeader = fixture.env.AUTH_ORIGIN) {
  headers.set(new Headers({ cookie }));
  return world.POST(request('/api/world', cookie, { method: 'POST', headers: { origin: originHeader }, body: JSON.stringify(body) }));
}
async function status(cookie) {
  headers.set(new Headers({ cookie }));
  const response = await world.GET();
  assert.equal(response.status, 200);
  return response.json();
}
const save = (cookie, mode = 'openai', key = fakeKey) => post(cookie, { operation: 'set-model-key', mode, key });
const advance = cookie => post(cookie, { operation: 'advance', mode: 'openai', minutes: 15, model: 'gpt-6-luna' });
const modelReply = () => Response.json({ usage: { prompt_tokens: 10, completion_tokens: 5 }, choices: [{ message: { content: JSON.stringify({ type: 'rest', target: '', content: '休息一下', mood: '平靜', durationMinutes: 60, intents: [] }) } }] });

test('a key saved in one login is usable in a second login of the same account without transmitting the key again', async () => {
  reset();
  const first = await signIn(), second = await signIn();
  const response = await save(first);
  assert.equal(response.status, 200);
  assert.ok(!(await response.text()).includes(fakeKey));
  const metadata = await status(second);
  assert.equal(metadata.modelKeys.openai.configured, true);
  assert.ok(!JSON.stringify(metadata).includes(fakeKey));
  const original = global.fetch;
  global.fetch = async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(init.headers.Authorization, 'Bearer ' + fakeKey);
    assert.ok(!init.body.includes(fakeKey));
    return modelReply();
  };
  try { assert.equal((await advance(second)).status, 200); }
  finally { global.fetch = original; }
});

test('logout revokes only that login; another login can use the key until an explicit clear', async () => {
  reset();
  const first = await signIn(), second = await signIn();
  await save(first);
  await load('app/api/auth/logout/route').POST(request('/api/auth/logout', first, { method: 'POST', headers: { origin } }));
  assert.equal((await post(first, { operation: 'clear-model-key', mode: 'openai' })).status, 401);
  assert.equal((await status(second)).modelKeys.openai.configured, true);
  const original = global.fetch;
  global.fetch = async () => modelReply();
  try { assert.equal((await advance(second)).status, 200); }
  finally { global.fetch = original; }
  assert.equal((await post(second, { operation: 'clear-model-key', mode: 'openai' })).status, 200);
  assert.equal((await status(await signIn())).modelKeys.openai.configured, false);
  assert.equal((await advance(second)).status, 400);
});

test('key expires at 24 hours independently of newer sessions; reads never extend its lifetime', async () => {
  reset(); const originalNow = Date.now, base = originalNow(); Date.now = () => base;
  try {
    const first = await signIn();
    await save(first);
    const expiresAt = (await status(first)).modelKeys.openai.expiresAt;
    assert.equal(expiresAt, base + 86400000);
    Date.now = () => base + 3600000;
    const second = await signIn();
    Date.now = () => expiresAt - 1;
    assert.equal((await status(second)).modelKeys.openai.expiresAt, expiresAt);
    Date.now = () => expiresAt;
    assert.equal((await status(second)).modelKeys.openai.configured, false);
    const original = global.fetch;
    global.fetch = async () => { throw Error('expired-key-must-not-dispatch'); };
    try {
      assert.equal((await advance(second)).status, 400);
      assert.equal((await status(second)).world.turn, 0);
      assert.equal((await post(second, { operation: 'advance', mode: 'demo', minutes: 15 })).status, 200);
    } finally { global.fetch = original; }
  } finally { Date.now = originalNow; }
});

test('keys are isolated by account, provider, environment and origin', async () => {
  reset(); const first = await signIn(); await save(first);
  assert.equal((await status(first)).modelKeys.openrouter.configured, false);
  const other = await signIn(456);
  assert.equal((await status(other)).modelKeys.openai.configured, false);
  assert.equal((await advance(other)).status, 400);
  assert.equal((await post(other, { operation: 'clear-model-key', mode: 'openai' })).status, 200);
  assert.equal((await status(first)).modelKeys.openai.configured, true);
  fixture.env.APP_ENV = 'test'; fixture.env.AUTH_ORIGIN = 'https://test.example.test';
  assert.equal((await status(await signIn())).modelKeys.openai.configured, false);
  fixture.env.APP_ENV = 'local'; fixture.env.AUTH_ORIGIN = 'http://localhost:5174';
  const differentOrigin = await signIn();
  assert.equal((await status(differentOrigin)).modelKeys.openai.configured, false);
  fixture.env.AUTH_ORIGIN = origin;
  assert.equal((await status(first)).modelKeys.openai.configured, true);
});

test('saving and clearing require an authenticated same-origin request and valid provider/key', async () => {
  reset(); const cookie = await signIn();
  assert.equal((await save('')).status, 401);
  assert.equal((await post(cookie, { operation: 'set-model-key', mode: 'openai', key: fakeKey }, 'https://foreign.test')).status, 403);
  for (const key of ['', 'abc\ndef', 'a'.repeat(4097), null]) assert.equal((await save(cookie, 'openai', key)).status, 400);
  assert.equal((await save(cookie, 'demo')).status, 400);
  await save(cookie);
  assert.equal((await post(cookie, { operation: 'clear-model-key', mode: 'openai' }, 'https://foreign.test')).status, 403);
  assert.equal((await status(cookie)).modelKeys.openai.configured, true);
  assert.equal((await post(cookie, { operation: 'advance', mode: 'openai', minutes: 15, model: 'gpt-6-luna', key: fakeKey })).status, 400);
});

test('a missing encryption secret disables key saving while the demo remains usable', async () => {
  reset(); const cookie = await signIn(); delete fixture.env.MODEL_KEY_ENCRYPTION_SECRET;
  assert.equal((await status(cookie)).modelKeyStorageAvailable, false);
  assert.equal((await save(cookie)).status, 503);
  assert.equal((await advance(cookie)).status, 503);
  assert.equal((await post(cookie, { operation: 'advance', mode: 'demo', minutes: 15 })).status, 200);
});

test('provider exceptions cannot disclose the key in errors, world state or logs', async () => {
  reset(); const cookie = await signIn(); await save(cookie);
  const original = global.fetch, originalError = console.error;
  const logs = []; console.error = (...args) => logs.push(args);
  global.fetch = async () => { throw Error('provider-network-failure: ' + fakeKey); };
  try {
    const response = await advance(cookie);
    assert.equal(response.status, 502);
    assert.ok(!(await response.text()).includes(fakeKey));
    assert.ok(!JSON.stringify(await status(cookie)).includes(fakeKey));
    assert.ok(!JSON.stringify(logs).includes(fakeKey));
  } finally { global.fetch = original; console.error = originalError; }
});

test('clearing a key during a round stops later dispatches and retains only already-sent usage', async () => {
  reset(); const cookie = await signIn(); await save(cookie);
  const original = global.fetch; let calls = 0;
  global.fetch = async () => {
    calls++;
    assert.equal((await post(cookie, { operation: 'clear-model-key', mode: 'openai' })).status, 200);
    return modelReply();
  };
  try {
    const response = await advance(cookie);
    assert.equal(response.status, 502);
    const body = await response.json();
    assert.equal(calls, 1);
    assert.equal(body.world.turn, 0);
    assert.equal(body.world.aiUsage.totalCalls, 1);
    assert.equal(body.world.aiUsage.totalInputTokens, 10);
  } finally { global.fetch = original; }
});

test('malformed configuration JSON never echoes submitted key fragments', async () => {
  reset(); const cookie = await signIn(); headers.set(new Headers({ cookie }));
  const response = await world.POST(request('/api/world', cookie, { method: 'POST', headers: { origin }, body: '{"key":"' + fakeKey + '",oops}' }));
  assert.equal(response.status, 400);
  assert.ok(!(await response.text()).includes(fakeKey));
});

test('replacement starts a new 24-hour lifetime and OpenRouter uses its own saved key', async () => {
  reset(); const now = Date.now, base = now(); Date.now = () => base;
  try {
    const cookie = await signIn(); await save(cookie);
    Date.now = () => base + 3600000;
    await save(cookie, 'openai', 'replacement-fake-key');
    await save(cookie, 'ai', 'router-fake-key');
    assert.equal((await status(cookie)).modelKeys.openai.expiresAt, base + 3600000 + 86400000);
    await post(cookie, { operation: 'clear-model-key', mode: 'openai' });
    const original = global.fetch;
    global.fetch = async (url, init) => {
      assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
      assert.equal(init.headers.Authorization, 'Bearer router-fake-key');
      return modelReply();
    };
    try { assert.equal((await post(cookie, { operation: 'advance', mode: 'ai', minutes: 15, model: 'fixture/model' })).status, 200); }
    finally { global.fetch = original; }
  } finally { Date.now = now; }
});

test('expiry between provider dispatches stops new calls without counting an unsent attempt', async () => {
  reset(); const now = Date.now, base = now(); Date.now = () => base;
  const original = global.fetch;
  try {
    const cookie = await signIn(); await save(cookie);
    Date.now = () => base + 3600000;
    const newerLogin = await signIn(); let calls = 0;
    global.fetch = async () => { calls++; Date.now = () => base + 86400000; return modelReply(); };
    const response = await advance(newerLogin);
    assert.equal(response.status, 502);
    const body = await response.json();
    assert.equal(calls, 1); assert.equal(body.world.turn, 0);
    assert.equal(body.world.aiUsage.totalCalls, 1);
  } finally { Date.now = now; global.fetch = original; }
});

test('provider JSON errors and sensitive model output never enter responses or world records', async () => {
  const sensitive = JSON.stringify({ type: 'rest', content: fakeKey, target: '', mood: '', durationMinutes: 60, intents: [] });
  for (const reply of [() => new Response(fakeKey + ' invalid JSON'), () => Response.json({ choices: [{ message: { content: sensitive } }] }), () => Response.json({ choices: [{ message: { content: sensitive.replace('test-', '\\u0074est-') } }] })]) {
    reset(); const cookie = await signIn(); await save(cookie);
    const original = global.fetch; global.fetch = async () => reply();
    try {
      const response = await advance(cookie);
      assert.equal(response.status, 502);
      assert.ok(!(await response.text()).includes(fakeKey));
      assert.ok(!JSON.stringify(await status(cookie)).includes(fakeKey));
    } finally { global.fetch = original; }
  }
});
