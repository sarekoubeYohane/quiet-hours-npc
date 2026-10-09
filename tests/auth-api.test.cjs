/* eslint-disable @typescript-eslint/no-require-imports -- Node tests load a temporary transpiled build. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const root = process.env.QUIET_HOURS_AUTH_BUILD;
const load = name => require(join(root, name + '.cjs'));
const fixture = load('fixture');
const headers = load('headers');
const world = load('app/api/world/route');
function reset() {
  fixture.reset(); fixture.migrate(readFileSync(join(root, 'migrations.sql'), 'utf8'));
  Object.assign(fixture.env, { APP_ENV: 'local', AUTH_ORIGIN: 'http://localhost:5173', GITHUB_CLIENT_ID: 'local-client', GITHUB_CLIENT_SECRET: 'test-only-client-secret', SESSION_SECRET: 'test-only-signing-secret-at-least-32-characters', GITHUB_ALLOWED_IDS: '123' });
  headers.set(new Headers());
}
test('world API rejects self-reported identity headers and offers GitHub sign-in', async () => {
  reset();
  headers.set(new Headers({ 'oai-authenticated-user-id': '123', 'oai-authenticated-user-email': 'attacker@example.test' }));
  const response = await world.GET();
  assert.equal(response.status, 401);
  assert.equal((await response.json()).signInRequired, true);
});

const origin = 'http://localhost:5173';
const authRequest = (path, cookie = '', init = {}) => new Request(origin + path, { ...init, headers: { cookie, ...init.headers } });
function cookies(response) { return response.headers.getSetCookie().map(value => value.split(';')[0]).join('; '); }
async function signIn(user = { id: 123, login: 'owner' }) {
  const start = await load('app/api/auth/github/route').GET(authRequest('/api/auth/github'));
  assert.equal(start.status, 302);
  const redirect = new URL(start.headers.get('location'));
  assert.equal(redirect.origin, 'https://github.com');
  assert.equal(redirect.searchParams.get('client_id'), 'local-client');
  assert.equal(redirect.searchParams.get('redirect_uri'), origin + '/api/auth/github/callback');
  assert.equal(redirect.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(redirect.searchParams.get('scope'), '');
  const originalFetch = global.fetch;
  global.fetch = async url => String(url) === 'https://github.com/login/oauth/access_token'
    ? Response.json({ access_token: 'test-only-github-token', expires_in: 28800, refresh_token: 'not-persisted' })
    : Response.json(user);
  try {
    return await load('app/api/auth/github/callback/route').GET(authRequest('/api/auth/github/callback?code=test-code&state=' + redirect.searchParams.get('state'), cookies(start)));
  } finally { global.fetch = originalFetch; }
}
test('GitHub login grants the invited user a private world and logout revokes the copied cookie', async () => {
  reset();
  const callback = await signIn();
  assert.equal(callback.status, 303);
  const cookie = cookies(callback);
  headers.set(new Headers({ cookie }));
  assert.equal((await world.GET()).status, 200);
  const logout = await load('app/api/auth/logout/route').POST(authRequest('/api/auth/logout', cookie, { method: 'POST', headers: { origin } }));
  assert.equal(logout.status, 303);
  assert.equal((await world.GET()).status, 401);
});

test('uninvited GitHub accounts receive 403 and no session cookie', async () => {
  reset();
  const response = await signIn({ id: 456, login: 'visitor' });
  assert.equal(response.status, 403);
  assert.match((await response.json()).error, /尚未受邀/);
  assert.ok(!cookies(response).includes('qh_session='));
  assert.equal((await world.GET()).status, 401);
});

test('invalid, missing and duplicate session cookies cannot read or mutate a world', async () => {
  reset();
  const valid = cookies(await signIn()).split('; ')[0];
  for (const cookie of ['', 'qh_session=forged', valid.slice(0, -1) + (valid.endsWith('A') ? 'B' : 'A'), valid + '; ' + valid]) {
    headers.set(new Headers({ cookie }));
    assert.equal((await world.GET()).status, 401);
    assert.equal((await world.POST(authRequest('/api/world', cookie, { method: 'POST', headers: { origin }, body: JSON.stringify({ operation: 'advance', mode: 'demo', minutes: 15 }) }))).status, 401);
  }
});

test('two invited accounts get separate worlds keyed by stable GitHub id, not login name', async () => {
  reset(); fixture.env.GITHUB_ALLOWED_IDS = '123,456';
  const first = cookies(await signIn());
  headers.set(new Headers({ cookie: first }));
  const advanced = await world.POST(authRequest('/api/world', first, { method: 'POST', headers: { origin }, body: JSON.stringify({ operation: 'advance', mode: 'demo', minutes: 15 }) }));
  assert.equal(advanced.status, 200);
  assert.equal((await advanced.json()).world.turn, 1);
  const second = cookies(await signIn({ id: 456, login: 'owner' }));
  headers.set(new Headers({ cookie: second }));
  assert.equal((await (await world.GET()).json()).world.turn, 0);
  const renamed = cookies(await signIn({ id: 123, login: 'new-name' }));
  headers.set(new Headers({ cookie: renamed }));
  assert.equal((await (await world.GET()).json()).world.turn, 1);
});

test('session expires at 24 hours and removing an invitation revokes access', async () => {
  reset();
  const now = Date.now;
  const base = now();
  Date.now = () => base;
  try {
    const cookie = cookies(await signIn());
    headers.set(new Headers({ cookie }));
    fixture.env.GITHUB_ALLOWED_IDS = '';
    assert.equal((await world.GET()).status, 401);
    fixture.env.GITHUB_ALLOWED_IDS = '123';
    Date.now = () => base + 24 * 60 * 60 * 1000 - 1;
    assert.equal((await world.GET()).status, 200);
    Date.now = () => base + 24 * 60 * 60 * 1000;
    assert.equal((await world.GET()).status, 401);
  } finally { Date.now = now; }
});

test('OAuth callback rejects mismatched browser state, missing code and replay', async () => {
  reset();
  const start = await load('app/api/auth/github/route').GET(authRequest('/api/auth/github'));
  const state = new URL(start.headers.get('location')).searchParams.get('state');
  const callback = load('app/api/auth/github/callback/route');
  const original = global.fetch;
  global.fetch = async () => { throw Error('provider-token-should-not-appear'); };
  try {
    const path = '/api/auth/github/callback?state=' + state + '&code=x';
    assert.equal((await callback.GET(authRequest(path, 'qh_oauth_state=wrong'))).status, 400);
    assert.equal((await callback.GET(authRequest('/api/auth/github/callback?state=' + state, cookies(start)))).status, 400);
    const failure = await callback.GET(authRequest(path, cookies(start)));
    assert.equal(failure.status, 503);
    assert.ok(!(await failure.text()).includes('provider-token'));
    assert.equal((await callback.GET(authRequest(path, cookies(start)))).status, 400);
  } finally { global.fetch = original; }
});

test('OAuth state expires at ten minutes', async () => {
  reset(); const now = Date.now, base = now(); Date.now = () => base;
  try {
    const start = await load('app/api/auth/github/route').GET(authRequest('/api/auth/github'));
    const state = new URL(start.headers.get('location')).searchParams.get('state');
    Date.now = () => base + 10 * 60 * 1000;
    assert.equal((await load('app/api/auth/github/callback/route').GET(authRequest('/api/auth/github/callback?code=x&state=' + state, cookies(start)))).status, 400);
  } finally { Date.now = now; }
});

test('OAuth and logout refuse wrong origins; foreign-origin cookie signatures do not authenticate', async () => {
  reset();
  const first = cookies(await signIn());
  const start = load('app/api/auth/github/route');
  assert.equal((await start.GET(new Request('https://other.test/api/auth/github'))).status, 403);
  assert.equal((await start.GET(authRequest('/api/auth/github', '', { headers: { 'sec-fetch-site': 'cross-site' } }))).status, 403);
  const logout = load('app/api/auth/logout/route');
  assert.equal((await logout.POST(authRequest('/api/auth/logout', first, { method: 'POST', headers: { origin: 'https://attacker.test' } }))).status, 403);
  headers.set(new Headers({ cookie: first }));
  assert.equal((await world.GET()).status, 200);
  fixture.env.AUTH_ORIGIN = 'https://test.example.test'; fixture.env.APP_ENV = 'test';
  assert.equal((await world.GET()).status, 401);
});

test('production login cookies are Secure and no secret is returned to the browser', async () => {
  reset(); fixture.env.AUTH_ORIGIN = 'https://test.example.test'; fixture.env.APP_ENV = 'test';
  const response = await load('app/api/auth/github/route').GET(new Request('https://test.example.test/api/auth/github'));
  assert.equal(response.status, 302);
  assert.match(response.headers.get('set-cookie'), /HttpOnly; SameSite=Lax; Max-Age=600; Secure/);
  assert.ok(!response.headers.get('location').includes(fixture.env.GITHUB_CLIENT_SECRET));
  delete fixture.env.SESSION_SECRET;
  assert.equal((await load('app/api/auth/github/route').GET(new Request('https://test.example.test/api/auth/github'))).status, 503);
});
