import '../tooling/verification/no-network.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { readFile, readdir } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const esbuild = require(require.resolve('esbuild', { paths: [require.resolve('vite')] }));

async function loadEntry(entry, context) {
  const { outputFiles } = await esbuild.build({
    entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'cjs',
    jsx: 'automatic', alias: { '@': process.cwd() }, external: ['react', 'react/*', 'react-dom', 'react-dom/*'],
    plugins: [{
      name: 'cloudflare-and-session-boundaries',
      setup(build) {
        build.onResolve({ filter: /^(cloudflare:workers|@\/lib\/auth)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
        build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({
          contents: args.path === 'cloudflare:workers'
            ? 'export const env = context.env;'
            : 'export const getGitHubUser = async () => context.owner ? { userId: context.owner } : null;',
        }));
      },
    }],
  });
  const compiled = { exports: {} };
  new Function('module', 'exports', 'require', 'context', outputFiles[0].text)(compiled, compiled.exports, require, context);
  return compiled.exports;
}

async function fixture({ withWorld = false } = {}) {
  const context = { owner: 'account-a', env: { APP_ENV: 'local', AUTH_ORIGIN: 'https://test.invalid', MODEL_KEY_ENCRYPTION_SECRET: 'ab'.repeat(32) } };
  const route = await loadEntry('app/api/character-templates/route.ts', context);
  const db = new DatabaseSync(':memory:');
  const worldRoute = withWorld && await loadEntry('app/api/world/route.ts', context);
  const settingsRoute = withWorld && await loadEntry('app/api/model-settings/route.ts', context);
  const migrations = withWorld ? (await readdir('drizzle')).filter(name => name.endsWith('.sql')).sort() : ['0006_character_templates.sql'];
  for (const name of migrations) db.exec(await readFile('drizzle/' + name, 'utf8'));
  context.env.DB = {
    prepare(sql) {
      // Each bind creates an independent closure; subsequent binds cannot
      // replace values already captured by another statement in a batch.
      return { bind(...values) {
        const statement = db.prepare(sql.replaceAll("CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)", String(Date.now())));
        return {
          async all() { return { results: statement.all(...values) }; },
          async first() {
            const fault = sql.includes('RETURNING') ? context.writeFault : undefined;
            if (fault) context.writeFault = undefined;
            if (fault === 'before') throw Error('unavailable before write');
            const result = statement.get(...values) ?? null;
            if (fault === 'after') throw Error('unavailable after write');
            return result;
          },
          execute() { return { meta: { changes: Number(statement.run(...values).changes) } }; },
          async run() { return this.execute(); },
        };
      } };
    },
    async batch(statements) {
      // Keep the whole SQLite transaction synchronous so ordinary queries
      // cannot observe or join partially executed writes.
      db.exec('BEGIN IMMEDIATE');
      try { const results=statements.map(statement=>statement.execute());db.exec('COMMIT');return results; }
      catch(error) { db.exec('ROLLBACK');throw error; }
    },
  };
  async function request(payload, origin = 'https://test.invalid') {
    const url = 'https://test.invalid/api/character-templates';
    const response = payload === undefined ? await route.GET() : await route.POST(new Request(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(payload),
    }));
    return { status: response.status, body: await response.json() };
  }
  async function worldRequest(payload) {
    const url = 'https://test.invalid/api/world?workspace=account';
    const current = await worldRoute.GET(new Request(url));
    if (payload === undefined) return current;
    const scope = await current.json();
    assert.equal(current.status,200,JSON.stringify(scope));
    return worldRoute.POST(new Request(url, {
      method: 'POST', headers: { Origin: 'https://test.invalid', 'X-World-Time-Policy': 'round-v1' },
      body: JSON.stringify({ operationId: Date.now() + ':' + crypto.randomUUID(), mode: 'demo', operationScope: scope.operationScope, worldContext: scope.world.contextId, ...payload }),
    }));
  }
  return { db, context, request, worldRequest, settingsRequest:()=>settingsRoute.GET(new Request('https://test.invalid/api/model-settings')) };
}

test('two new characters persist privately, presets are read-only, and updates cannot erase newer data', async () => {
  const { db, context, request } = await fixture();
  try {
    const { body: original } = await request();
    assert.ok(original.presets.some(template => template.fields.name === 'Vera'));
    assert.deepEqual(original.templates, []);

    const fields = {
      name: '柳生', appearance: '灰綠外套', personality: '安靜', abilities: '木工\n修鐘',
      background: '', initialMemories: '剛搬來', beliefs: '答應的事要做到',
      preferences: '茉莉茶', directions: '修好老鐘', startLocation: '自己的臥室',
    };
    const id = crypto.randomUUID();
    const created = await request({ id, version: 0, fields });
    assert.equal(created.status, 200);
    assert.deepEqual(created.body.template.fields, fields);
    const replay = await request({ id, version: 0, fields });
    assert.deepEqual(replay, created);
    const second = await request({ id: crypto.randomUUID(), version: 0, fields: { ...fields, name: '庭冬', personality: '  很直接  ' } });
    assert.equal(second.status, 200);
    assert.equal(second.body.template.fields.personality, '  很直接  ');

    const editedFields = { ...fields, background: '在河畔學徒三年。' };
    const edit = { id, version: created.body.template.version, fields: editedFields };
    assert.equal((await request(edit, 'https://another.invalid')).status, 403);
    context.writeFault = 'before';
    assert.equal((await request(edit)).status, 503);
    assert.deepEqual((await request()).body.templates.find(template => template.id === id), created.body.template);
    context.writeFault = 'after';
    assert.equal((await request(edit)).status, 503);
    const edited = await request(edit);
    assert.equal(edited.body.template.version, created.body.template.version + 1);
    assert.equal(edited.status, 200);
    assert.equal((await request({ id, version: created.body.template.version, fields })).status, 409);
    assert.equal((await request({ id: original.presets[0].id, version: 1, fields })).status, 400);

    const copy = await request({ id: crypto.randomUUID(), version: 0, fields: { ...original.presets[0].fields, name: '私有改版' } });
    assert.equal(copy.status, 200);
    const { body: saved } = await request();
    assert.deepEqual(saved.presets, original.presets);
    assert.deepEqual(saved.templates.find(template => template.id === id), edited.body.template);
    assert.equal(saved.templates.length, 3);

    context.owner = 'account-b';
    assert.deepEqual((await request()).body.templates, []);
    assert.equal((await request({ id, version: edited.body.template.version, fields })).status, 409);
    context.owner = null;
    assert.equal((await request()).status, 401);
  } finally {
    db.close();
  }
});

test('the editor creates, edits, and reopens two custom characters through the real save route', async () => {
  const { db, request, worldRequest, settingsRequest } = await fixture({ withWorld: true });
  const key = 'test-editor-provider-key';
  assert.equal((await worldRequest({ operation: 'set-model-key', mode: 'openai', key })).status, 200);
  assert.equal((await worldRequest({ operation: 'set-adjudication', adjudication: { provider: 'openai', model: 'gpt-6.1-sol' } })).status, 200);
  let candidate = '{bad reply';
  let paidCalls = 0;
  const { Window } = await import('happy-dom');
  const window = new Window({ url: 'https://test.invalid' });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'Event']) {
    Object.defineProperty(globalThis, key, { configurable: true, value: window[key] });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const React = require('react');
  const { createRoot } = require('react-dom/client');
  const root = createRoot(window.document.body.appendChild(window.document.createElement('div')));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith('https://api.openai.com/')) {
      assert.equal(options.headers.Authorization, 'Bearer ' + key);
      assert.match(JSON.parse(options.body).messages.at(-1).content, /出生在河邊/);
      paidCalls++;
      return Response.json({ usage: { prompt_tokens: 5, completion_tokens: 3 }, choices: [{ message: { content: candidate } }] });
    }
    if (url === '/api/model-settings') return settingsRequest();
    if (url === '/api/world?workspace=account') return worldRequest(options?.body ? JSON.parse(options.body) : undefined);
    assert.equal(url, '/api/character-templates');
    const result = await request(options?.body ? JSON.parse(options.body) : undefined);
    return Response.json(result.body, { status: result.status });
  };

  function button(name) {
    const element = [...window.document.querySelectorAll('button')].find(candidate => candidate.textContent === name);
    assert.ok(element, 'missing button ' + name);
    return element;
  }
  async function click(name) {
    await React.act(async () => button(name).click());
  }
  async function fill(field, value) {
    const element = window.document.querySelector('[name="' + field + '"]');
    assert.ok(element, 'missing field ' + field);
    const prototype = element instanceof window.HTMLInputElement ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype;
    await React.act(async () => {
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
      element.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
  }

  try {
    const Editor = (await loadEntry('components/character-template-editor.tsx', {})).default;
    await React.act(async () => root.render(React.createElement(Editor)));
    await click('新建人物');
    await fill('name', '柳生');
    await fill('personality', '安靜');
    await fill('preferences', '沒有');
    await fill('characterDescription', '她出生在河邊，喜歡研究時鐘。');
    await click('用 AI 生成空白欄位');
    assert.match(window.document.querySelector('[role="alert"]').textContent, /原設定已保留/);
    assert.equal(window.document.querySelector('[name="personality"]').value, '安靜');
    assert.equal(window.document.querySelector('[name="background"]').value, '');

    candidate = JSON.stringify({ personality: '擴寫安靜', preferences: '咖啡', background: '在河畔學修鐘。' });
    await click('用 AI 生成空白欄位');
    assert.equal(window.document.querySelector('[name="background"]').value, '在河畔學修鐘。');
    assert.equal(window.document.querySelector('[name="personality"]').value, '安靜');
    assert.equal(window.document.querySelector('[name="preferences"]').value, '沒有');
    assert.deepEqual((await request()).body.templates, []);
    assert.equal(paidCalls, 2);
    await fill('background', '在河畔跟外公學修鐘。');
    await click('保存人物範本');
    await click('新建人物');
    await fill('name', '庭冬');
    await fill('startLocation', '自己的臥室');
    await click('保存人物範本');
    await click('柳生');
    assert.equal(window.document.querySelector('[name="personality"]').value, '安靜');
    assert.equal(window.document.querySelector('[name="background"]').value, '在河畔跟外公學修鐘。');
    await fill('appearance', '灰綠外套');
    await click('保存人物範本');

    await React.act(async () => root.render(React.createElement(Editor, { key: 'reload' })));
    await click('庭冬');
    assert.equal(window.document.querySelector('[name="startLocation"]').value, '自己的臥室');
    await click('柳生');
    assert.equal(window.document.querySelector('[name="appearance"]').value, '灰綠外套');
    assert.equal(window.document.querySelector('[name="personality"]').value, '安靜');

    await click('使用 Vera 範本');
    await fill('name', 'Vera 的私有版本');
    await click('保存人物範本');
    const { body } = await request();
    assert.ok(body.presets.some(item => item.fields.name === 'Vera'));
    assert.ok(body.templates.some(item => item.fields.name === 'Vera 的私有版本'));
  } finally {
    await React.act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    db.close();
    await window.happyDOM.close();
  }
});

test('the editor D1 fixture preserves bound values and atomic rollback visibility',async()=>{
 const {db,context}=await fixture();
 try{
  db.exec('CREATE TABLE fixture_atomic (id TEXT PRIMARY KEY,value TEXT NOT NULL)');const d1=context.env.DB;
  const prepared=d1.prepare('INSERT INTO fixture_atomic(id,value) VALUES (?,?)'),first=prepared.bind('a','first'),second=prepared.bind('b','second');
  await d1.batch([first,second]);
  assert.deepEqual((await d1.prepare('SELECT id,value FROM fixture_atomic ORDER BY id').bind().all()).results.map(row=>({...row})),[{id:'a',value:'first'},{id:'b',value:'second'}]);
  const failed=d1.batch([d1.prepare('UPDATE fixture_atomic SET value=? WHERE id=?').bind('partial','a'),d1.prepare('INSERT INTO fixture_atomic(id,value) VALUES (?,?)').bind('a','duplicate')]);
  const read=d1.prepare('SELECT value FROM fixture_atomic WHERE id=?').bind('a').first();await assert.rejects(failed,/UNIQUE/);assert.equal((await read).value,'first');
  await d1.prepare('UPDATE fixture_atomic SET value=? WHERE id=?').bind('after rollback','b').run();assert.equal((await d1.prepare('SELECT value FROM fixture_atomic WHERE id=?').bind('b').first()).value,'after rollback');
 }finally{db.close();}
});
