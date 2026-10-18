import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { createHash } from 'node:crypto';

const { Miniflare } = createRequire(import.meta.resolve('wrangler'))('miniflare');
const modules = [];
for (const name of ['routine-materials', 'routine-obstacles', 'routine-rules', 'acceptance-scene', 'world-effects', 'adjudication', 'model-adapter', 'costs', 'cognition', 'recall', 'recall-services', 'memory', 'world', 'attention', 'perception', 'false-perception', 'd20', 'habits', 'activities', 'models', 'model-keys', 'playbook', 'store', 'auth', 'world-api']) {
  const source = await readFile(name === 'world-api' ? 'app/api/world/route.ts' : `lib/${name}.ts`, 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } }).outputText
    .replace(/import \{ headers \} from 'next\/headers';/, 'const headers = async () => globalThis.requestHeaders;')
    .replace(/(['"])(?:@\/lib\/|\.\/)([\w-]+)\1/g, "'./$2.js'");
  modules.push({ type: 'ESModule', path: name + '.js', contents: code });
}

test('world API encrypts keys, rejects damaged ciphertext and round-trips large acceptance backups in real Workers/D1', async () => {
  const mf = new Miniflare({
    outboundService: async () => { throw Error('External network blocked by local test fixture'); },
    cf: false, compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'],
    bindings: { APP_ENV: 'local', AUTH_ORIGIN: 'http://localhost:5173', GITHUB_CLIENT_ID: 'fixture-client', GITHUB_CLIENT_SECRET: 'fixture-secret', SESSION_SECRET: 'fixture-signing-secret-at-least-32-characters', GITHUB_ALLOWED_IDS: '123', MODEL_KEY_ENCRYPTION_SECRET: 'ab'.repeat(32) },
    d1Databases: ['DB'],
    modules: [{ type: 'ESModule', path: 'worker.js', contents: `
      import { startGitHubLogin, finishGitHubLogin } from './auth.js';
      import { GET, POST } from './world-api.js';
      export default { async fetch(request) {
        globalThis.requestHeaders = request.headers;
        globalThis.fetch = async (input, init) => {
          const upstream = new Request(input, init);
          if (upstream.url.includes('/login/oauth/access_token')) return Response.json({ access_token: 'fake-github-token' });
          if (upstream.url === 'https://api.github.com/user') return Response.json({ id: 123, login: 'fixture-user' });
          if (upstream.redirect !== 'manual') throw Error('Provider redirects must not be followed');
          return Response.json({ usage: { prompt_tokens: 10, completion_tokens: 5 }, choices: [{ message: { content: JSON.stringify({ type: 'rest', target: '', content: '', mood: '', durationMinutes: 60, intents: [] }) } }] });
        };
        const path = new URL(request.url).pathname;
        if (path === '/api/auth/github') return startGitHubLogin(request);
        if (path === '/api/auth/github/callback') return finishGitHubLogin(request);
        if (path === '/api/world') return request.method === 'POST' ? POST(request) : GET();
        return new Response('Missing', { status: 404 });
      } };
    ` }, ...modules],
  });
  try {
    const db = await mf.getD1Database('DB');
    for (const file of (await readdir('drizzle')).filter(name => name.endsWith('.sql')).sort()) {
      const sql = await readFile('drizzle/' + file, 'utf8');
      for (const statement of sql.split(';').map(value => value.replace(/--> statement-breakpoint/g, '').trim()).filter(Boolean)) await db.prepare(statement).run();
    }
    const origin = 'http://localhost:5173';
    const signIn = async () => {
      const start = await mf.dispatchFetch(origin + '/api/auth/github', { redirect: 'manual' });
      const state = new URL(start.headers.get('location')).searchParams.get('state');
      const callback = await mf.dispatchFetch(origin + '/api/auth/github/callback?code=fake&state=' + state, { redirect: 'manual', headers: { cookie: start.headers.get('set-cookie').split(';')[0] } });
      assert.equal(callback.status, 303);
      return callback.headers.getSetCookie().find(value => value.startsWith('qh_session=')).split(';')[0];
    };
    const first = await signIn(), second = await signIn();
    const post = body => mf.dispatchFetch(origin + '/api/world', { method: 'POST', headers: { origin, cookie: first }, body: JSON.stringify({ operationId: `${Date.now()}:${crypto.randomUUID()}`, ...body }) });
    const fakeKey = 'worker-fixture-key-never-real';
    const saved = await post({ operation: 'set-model-key', mode: 'openai', key: fakeKey });
    assert.equal(saved.status, 200);
    assert.ok(!(await saved.text()).includes(fakeKey));
    const storage = await db.prepare('SELECT * FROM account_model_keys').all();
    assert.equal(storage.results.length, 1);
    assert.ok(!JSON.stringify(storage).includes(fakeKey));
    assert.ok(!JSON.stringify(storage).includes('ab'.repeat(32)));
    const status = await mf.dispatchFetch(origin + '/api/world', { headers: { cookie: second } });
    assert.equal((await status.json()).modelKeys.openai.configured, true);
    assert.equal((await post({ operation: 'set-adjudication', mode: 'demo', adjudication: { provider: 'openai', model: 'gpt-6-luna' } })).status, 200);
    const advance = () => post({ operation: 'advance', mode: 'openai', minutes: 15, model: 'gpt-6-luna' });
    assert.equal((await advance()).status, 200);
    await db.prepare("UPDATE account_model_keys SET expires_at = expires_at + 1").run();
    const damaged = await advance();
    assert.equal(damaged.status, 503);
    assert.ok(!(await damaged.text()).includes(fakeKey));
    // Setup through the D1 fixture; all round-trip assertions use the actual world API.
    const before = (await (await mf.dispatchFetch(origin + '/api/world', { headers: { cookie: first } })).json()).world;
    before.turn = 123; before.minute = 3105;
    before.events[0].text = Array.from({ length: 6000 }, (_, n) => `${createHash('sha256').update(String(n)).digest('hex')}：完整保存原世界記憶與對話。☕🌙`).join('\n');
    assert.ok(Buffer.byteLength(JSON.stringify(before)) > 512 * 1024);
    await db.prepare('UPDATE worlds SET state = ?, operations = ?').bind(JSON.stringify(before), '{"floor":0,"results":{}}').run();
    const entered = await post({ operation: 'enter-acceptance', mode: 'demo' });
    assert.equal(entered.status, 200, (await entered.clone().json()).error);
    const scene = (await entered.json()).world;
    assert.deepEqual(scene.acceptance, { id: 'daily-life-v1' });
    assert.ok(!JSON.stringify(scene).includes('完整保存原世界記憶與對話'));
    const reloaded = (await (await mf.dispatchFetch(origin + '/api/world', { headers: { cookie: second } })).json()).world;
    assert.equal(reloaded.contextId, scene.contextId);
    const exited = await post({ operation: 'exit-acceptance', mode: 'demo', worldContext: reloaded.contextId });
    assert.equal(exited.status, 200, (await exited.clone().json()).error);
    const restored = (await exited.json()).world;
    assert.equal(restored.turn, 123); assert.equal(restored.minute, 3105);
    assert.deepEqual(restored.events, before.events); assert.deepEqual(restored.characters, before.characters);
    assert.equal(restored.aiUsage.totalCalls, before.aiUsage.totalCalls);
    const finalRead = (await (await mf.dispatchFetch(origin + '/api/world', { headers: { cookie: second } })).json()).world;
    assert.deepEqual(finalRead.events, before.events);
  } finally { await mf.dispose(); }
});
