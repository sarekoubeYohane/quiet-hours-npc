import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';

// Use the same Miniflare/workerd dependency as the pinned Wrangler toolchain.
const { Miniflare } = createRequire(import.meta.resolve('wrangler'))('miniflare');
const source = await readFile(new URL('../lib/auth.ts', import.meta.url), 'utf8');
const authModule = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext },
}).outputText
  .replace(/import \{ headers \} from 'next\/headers';/, 'const headers = async () => new Headers();')
  .replace(/import \{ database \} from '\.\/store';/, `
    // SQL behavior is covered by auth-api.test.cjs; this test exercises Workers Request semantics.
    let verifier;
    const database = () => ({ prepare(sql) {
      let values;
      const statement = {
        bind(...args) { values = args; return statement; },
        async run() { if (sql.startsWith('INSERT INTO oauth_attempts')) verifier = values[1]; },
        async first() { return { verifier }; },
      };
      return statement;
    } });
  `);

test('OAuth requests work in Workers and reject token/identity redirects without following them', async () => {
  const mf = new Miniflare({
    cf: false,
    compatibilityDate: '2026-05-15',
    compatibilityFlags: ['nodejs_compat'],
    bindings: {
      APP_ENV: 'production', AUTH_ORIGIN: 'https://auth.example.test',
      GITHUB_CLIENT_ID: 'fixture-client', GITHUB_CLIENT_SECRET: 'fixture-secret',
      SESSION_SECRET: 'fixture-signing-secret-at-least-32-characters', GITHUB_ALLOWED_IDS: '123',
    },
    modules: [
      { type: 'ESModule', path: 'worker.js', contents: `
        import { startGitHubLogin, finishGitHubLogin } from './auth.js';
        export default { async fetch(request) {
          const scenario = new URL(request.url).pathname;
          const calls = [], redirects = [];
          // Only the HTTP response boundary is mocked. Construct each real Workers Request
          // with the application's options before returning a deterministic fixture response.
          globalThis.fetch = async (input, init) => {
            const upstream = new Request(input, init);
            calls.push(new URL(upstream.url).pathname);
            redirects.push(upstream.redirect);
            const token = upstream.url === 'https://github.com/login/oauth/access_token';
            if ((token && scenario === '/token-redirect') || (!token && scenario === '/identity-redirect')) {
              return new Response('redirect fixture', { status: 302, headers: { Location: 'https://untrusted.example.test' } });
            }
            return Response.json(token ? { access_token: 'fixture-token' } : { id: 123, login: 'fixture-user' });
          };
          const start = await startGitHubLogin(new Request('https://auth.example.test/api/auth/github'));
          const state = new URL(start.headers.get('Location')).searchParams.get('state');
          const callback = await finishGitHubLogin(new Request(
            'https://auth.example.test/api/auth/github/callback?code=fixture-code&state=' + state,
            { headers: { Cookie: start.headers.get('Set-Cookie').split(';')[0] } }
          ));
          return Response.json({ status: callback.status, calls, redirects,
            session: callback.headers.get('Set-Cookie').includes('qh_session='),
            code: callback.status === 503 ? (await callback.json()).code : null });
        } };
      ` },
      { type: 'ESModule', path: 'auth.js', contents: authModule },
    ],
  });
  try {
    const success = await (await mf.dispatchFetch('https://auth.example.test/success')).json();
    assert.equal(success.status, 303);
    assert.equal(success.session, true);
    assert.deepEqual(success.redirects, ['manual', 'manual']);
    for (const [scenario, code, calls] of [
      ['token-redirect', 'AUTH_TOKEN_EXCHANGE', ['/login/oauth/access_token']],
      ['identity-redirect', 'AUTH_IDENTITY', ['/login/oauth/access_token', '/user']],
    ]) {
      const failure = await (await mf.dispatchFetch('https://auth.example.test/' + scenario)).json();
      assert.equal(failure.status, 503);
      assert.equal(failure.code, code);
      assert.equal(failure.session, false);
      assert.deepEqual(failure.calls, calls);
      assert.ok(failure.redirects.every(value => value === 'manual'));
    }
  } finally { await mf.dispose(); }
});
