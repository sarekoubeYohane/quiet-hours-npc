/* eslint-disable @typescript-eslint/no-require-imports -- Node test fixtures load the temporary CommonJS build. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const build = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, `${name}.cjs`));
const { GET } = build('environment-route');
const workers = build('cloudflare-workers');
const reset = () => { delete workers.env.APP_ENV; delete globalThis.__GIT_COMMIT__; };

test('the environment API reports the environment the Worker runs in and the commit it was built from', async () => {
  reset(); workers.env.APP_ENV = 'test'; globalThis.__GIT_COMMIT__ = 'abc1234';
  try {
    const response = await GET();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { name: 'test', label: '測試站', commit: 'abc1234', caption: '測試站 · 版本 abc1234' });
  } finally { reset(); }
});

test('without an environment var or a build-time commit the API answers unknown instead of omitting fields', async () => {
  reset();
  assert.deepEqual(await (await GET()).json(), { name: 'unknown', label: 'unknown', commit: 'unknown', caption: 'unknown · 版本 unknown' });
  globalThis.__GIT_COMMIT__ = null; // git was unavailable at build time
  try { assert.equal((await (await GET()).json()).commit, 'unknown'); } finally { reset(); }
});

test('environment names map to the observer-facing labels and unknown names pass through', () => {
  const { environmentLabel } = build('environment');
  assert.equal(environmentLabel('local'), '本機');
  assert.equal(environmentLabel('test'), '測試站');
  assert.equal(environmentLabel('production'), '正式站');
  assert.equal(environmentLabel('staging-2'), 'staging-2');
});
