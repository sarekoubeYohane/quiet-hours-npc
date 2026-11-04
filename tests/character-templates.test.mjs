import '../tooling/verification/no-network.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';

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

async function fixture() {
  const context = { owner: 'account-a', env: {} };
  const route = await loadEntry('app/api/character-templates/route.ts', context);
  const db = new DatabaseSync(':memory:');
  db.exec(await readFile('drizzle/0006_character_templates.sql', 'utf8'));
  context.env.DB = {
    prepare(sql) {
      return { bind(...values) {
        const statement = db.prepare(sql);
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
          async run() { return { meta: { changes: Number(statement.run(...values).changes) } }; },
        };
      } };
    },
  };
  async function request(payload, origin = 'https://test.invalid') {
    const url = 'https://test.invalid/api/character-templates';
    const response = payload === undefined ? await route.GET() : await route.POST(new Request(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(payload),
    }));
    return { status: response.status, body: await response.json() };
  }
  return { db, context, request };
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
  const { db, request } = await fixture();
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
    await click('保存人物範本');
    await click('新建人物');
    await fill('name', '庭冬');
    await fill('startLocation', '自己的臥室');
    await click('保存人物範本');
    await click('柳生');
    assert.equal(window.document.querySelector('[name="personality"]').value, '安靜');
    assert.equal(window.document.querySelector('[name="background"]').value, '');
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
