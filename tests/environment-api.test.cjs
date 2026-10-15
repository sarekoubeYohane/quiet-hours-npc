/* eslint-disable @typescript-eslint/no-require-imports -- Node test fixtures load the temporary CommonJS build. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const build = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, `${name}.cjs`));
const { GET } = build('environment-route');
const workers = build('cloudflare-workers');
const reset = () => { delete workers.env.APP_ENV; delete globalThis.__GIT_COMMIT__; delete globalThis.__BUILT_AT__; };

test('the environment API reports the environment the Worker runs in, the commit and the time it was built', async () => {
  reset(); workers.env.APP_ENV = 'test'; globalThis.__GIT_COMMIT__ = 'abc1234'; globalThis.__BUILT_AT__ = '2026-10-12T08:00:00.000Z';
  try {
    const response = await GET();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { name: 'test', label: '測試站', commit: 'abc1234', builtAt: '2026-10-12T08:00:00.000Z', builtAtLabel: '2026-10-12 16:00 台北', caption: '測試站 · 版本 abc1234' });
  } finally { reset(); }
});

test('without an environment var or a build-time commit the API answers unknown instead of omitting fields', async () => {
  reset();
  assert.deepEqual(await (await GET()).json(), { name: 'unknown', label: 'unknown', commit: 'unknown', builtAt: 'unknown', builtAtLabel: 'unknown', caption: 'unknown · 版本 unknown' });
  globalThis.__GIT_COMMIT__ = null; // git was unavailable at build time
  try { assert.equal((await (await GET()).json()).commit, 'unknown'); } finally { reset(); }
});

test('build times are labelled in Asia/Taipei without Intl, crossing the day boundary correctly', () => {
  const { taipeiLabel } = build('environment');
  assert.equal(taipeiLabel('2026-10-12T16:30:00.000Z'), '2026-10-13 00:30 台北');
  assert.equal(taipeiLabel('not a date'), 'unknown');
});

test('environment names map to the observer-facing labels and unknown names pass through', () => {
  const { environmentLabel } = build('environment');
  assert.equal(environmentLabel('local'), '本機');
  assert.equal(environmentLabel('test'), '測試站');
  assert.equal(environmentLabel('production'), '正式站');
  assert.equal(environmentLabel('staging-2'), 'staging-2');
});
