import '../tooling/verification/no-network.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { Window } from 'happy-dom';

const require = createRequire(import.meta.url);
const { build } = require(require.resolve('esbuild', { paths: [require.resolve('vite')] }));
let owner = 'producer';
let storageUnavailable = false;
let loseSaveResponse = false;
const origin = 'https://test.invalid';
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(await readFile('drizzle/0007_scene_templates.sql', 'utf8'));
const database = {
  prepare(sql) {
    if (storageUnavailable) throw Error('fixture storage unavailable');
    return { bind(...params) {
      return {
        async all() { return { results: sqlite.prepare(sql).all(...params) }; },
        async first() {
          const row = sqlite.prepare(sql).get(...params) ?? null;
          if (loseSaveResponse && /^(INSERT|UPDATE) /.test(sql)) {
            loseSaveResponse = false;
            throw Error('fixture lost committed response');
          }
          return row;
        },
      };
    } };
  },
};
const boundary = { auth: { getGitHubUser: async () => owner ? { userId: owner } : null }, store: { database: () => database } };

async function load(entry, external = []) {
  const result = await build({
    entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'cjs', logLevel: 'silent',
    jsx: 'automatic', alias: { '@': process.cwd() }, external,
    plugins: [{ name: 'sqlite-and-auth', setup(builder) {
      builder.onResolve({ filter: /^@\/lib\/(auth|store)$/ }, ({ path }) => ({ path, external: true }));
    } }],
  });
  const compiled = { exports: {} };
  const localRequire = id => id.startsWith('@/lib/') ? boundary[id.split('/').at(-1)] : require(id);
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(localRequire, compiled, compiled.exports);
  return compiled.exports;
}

const route = await load('app/api/scene-templates/route.ts');
const send = (method, body, requestOrigin = origin) => {
  assert.equal(typeof route[method], 'function', 'the application exposes the scene templates API');
  return route[method](new Request(origin + '/api/scene-templates', {
    method,
    ...(body ? { headers: { 'content-type': 'application/json', origin: requestOrigin }, body: JSON.stringify({accountScope:'account-operations:'+owner,...body}) } : {}),
  }));
};

test('retrying a scene create or edit across a save failure preserves identity and increments only once', async () => {
  const body = {id:crypto.randomUUID(),version:0,name:'可重送場所',note:'',
    rooms:[{id:'first',name:'前室'},{id:'back',name:'後室'}],
    connections:[{id:'door',name:'房門',rooms:['first','back'],state:'closed'}],objects:[]};
  for (const version of [0,1]) {
    const request = {...body,version,name:version ? '編輯後的場所' : body.name};
    storageUnavailable = true;
    try { assert.equal((await send('POST',request)).status,503); }
    finally { storageUnavailable = false; }
    const before = (await (await send('GET')).json()).templates.find(item=>item.id===body.id);
    assert.equal(before?.version,version||undefined);
    loseSaveResponse = true;
    assert.equal((await send('POST',request)).status,503);
    const replay = await send('POST',request);
    assert.equal(replay.status,version ? 200 : 201);
    const saved = (await replay.json()).template;
    assert.deepEqual(saved,{...request,version:version+1,shared:false});
    const list = (await (await send('GET')).json()).templates.filter(item=>item.id===body.id);
    assert.deepEqual(list,[saved]);
    assert.equal((await send('POST',{...request,name:'競爭寫入'})).status,409);
  }
});

test('scene templates save rooms, connections and every explicitly listed object and can be reloaded', async () => {
  const body = {
    name: '河畔住宅', note: '面向河流',
    rooms: [{ id: 'front', name: '客廳' }, { id: 'bedroom', name: '臥室' }],
    connections: [{ id: 'entry', name: '臥室門', rooms: ['front', 'bedroom'] }],
    objects: [
      { id: 'bed', name: '床', roomId: 'bedroom', state: {} },
      { id: 'table', name: '小桌', roomId: 'front', state: {} },
      { id: 'lamp', name: '台燈', roomId: 'front', state: { 電源: '關閉' } },
    ],
  };
  const created = await send('POST', {...body,id:crypto.randomUUID(),version:0});
  assert.equal(created.status, 201, await created.clone().text());
  const { template } = await created.json();
  const list = await (await send('GET')).json();
  assert.deepEqual(list.templates.find(({id}) => id === template.id), { ...body, id: template.id, version: 1, shared: false });
});

test('the actual editor saves, reopens and changes a multi-room scene template', async () => {
  const window = new Window({ url: origin });
  for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Event', 'MouseEvent', 'Node']) {
    Object.defineProperty(globalThis, name, { configurable: true, value: window[name] });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const React = require('react');
  const { createRoot } = require('react-dom/client');
  const { default: SceneTemplateEditor } = await load('components/scene-template-editor.tsx', ['react', 'react/*']);
  assert.equal(typeof SceneTemplateEditor, 'function', 'the application exposes the scene template editor');
  const root = createRoot(document.body.appendChild(document.createElement('main')));
  const fetch = globalThis.fetch;
  globalThis.fetch = (url, init) => {
    assert.equal(url, '/api/scene-templates');
    return send(init?.method ?? 'GET', init?.body && JSON.parse(init.body));
  };
  const click = async text => {
    const button = [...document.querySelectorAll('button')].find(item => item.textContent === text);
    assert.ok(button, text);
    await React.act(async () => button.click());
  };
  const enter = async (label, value) => {
    const input = document.querySelector('[aria-label="' + label + '"]');
    assert.ok(input, label);
    const prototype = input instanceof window.HTMLSelectElement ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
    await React.act(async () => {
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, value);
      input.dispatchEvent(new window.Event(input instanceof window.HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
    });
  };
  try {
    await React.act(async () => root.render(React.createElement(SceneTemplateEditor)));
    await click('新增場景範本');
    await enter('場所名稱', '雨巷書房');
    await enter('房間 1 名稱', '閱覽室');
    await click('新增房間');
    await enter('房間 2 名稱', '儲物室');
    await enter('建築預設進出權限', 'residents');
    await enter('房間 2 進出權限', 'workers');
    await click('新增連接');
    await enter('連接 1 名稱', '儲物門');
    await enter('連接 1 初始通行狀態', 'blocked');
    await click('新增文字物件');
    await enter('物件 1 名稱', '木椅');
    await click('新增狀態');
    await enter('物件 1 狀態 1 名稱', '材質');
    await enter('物件 1 狀態 1 值', '橡木');
    await click('保存場景範本');
    assert.match(document.body.textContent, /場景範本已保存/);
    await click('重新讀取場景範本');
    await click('雨巷書房');
    assert.equal(document.querySelector('[aria-label="房間 2 名稱"]').value, '儲物室');
    assert.equal(document.querySelector('[aria-label="連接 1 初始通行狀態"]').value, 'blocked');
    assert.equal(document.querySelector('[aria-label="建築預設進出權限"]').value, 'residents');
    assert.equal(document.querySelector('[aria-label="房間 2 進出權限"]').value, 'workers');
    assert.equal(document.querySelector('[aria-label="物件 1 名稱"]').value, '木椅');
    assert.equal(document.querySelector('[aria-label="物件 1 狀態 1 值"]').value, '橡木');
    await enter('物件 1 名稱', '木桌');
    await click('保存場景範本');
    await click('重新讀取場景範本');
    await click('雨巷書房');
    assert.equal(document.querySelector('[aria-label="物件 1 名稱"]').value, '木桌');
    assert.ok(document.querySelector('[aria-label="預設場景美術"]'));
  } finally {
    await React.act(async () => root.unmount());
    globalThis.fetch = fetch;
    await window.happyDOM.close();
  }
});

test('rejected and failed edits preserve the saved template and its account scope', async () => {
  const shared = (await (await send('GET')).json()).templates.find(template => template.shared);
  assert.ok(shared);
  const { id: sharedId, version: sharedVersion, shared: isShared, ...draft } = shared;
  assert.equal(isShared, true);
  assert.equal((await send('POST', { ...draft, id: sharedId, version: sharedVersion })).status, 409);
  const created = await send('POST', { ...draft, name: '製作者的私有副本',id:crypto.randomUUID(),version:0 });
  assert.equal(created.status, 201);
  const { template } = await created.json();
  const { shared: privateFlag, ...update } = template;
  assert.equal(privateFlag, false);

  assert.equal((await send('POST', { ...update, rooms: [update.rooms[0]] })).status, 400);
  assert.equal((await send('POST', { ...update, name: '外部來源' }, 'https://elsewhere.invalid')).status, 403);
  storageUnavailable = true;
  try {
    assert.equal((await send('POST', { ...update, name: '無法保存的內容' })).status, 503);
  } finally {
    storageUnavailable = false;
  }
  assert.deepEqual((await (await send('GET')).json()).templates.find(({ id }) => id === template.id), template);
  assert.equal((await send('POST', { ...update, name: '保存新版本' })).status, 200);
  assert.equal((await send('POST', { ...update, name: '舊版本覆寫' })).status, 409);
  assert.equal((await (await send('GET')).json()).templates.find(({ id }) => id === template.id).name, '保存新版本');

  try {
    owner = 'another-producer';
    const other = (await (await send('GET')).json()).templates;
    assert.deepEqual(other, [shared]);
    assert.equal((await send('POST', { ...update, version: 2, name: '跨帳號覆寫' })).status, 409);
    owner = null;
    assert.equal((await send('GET')).status, 401);
    assert.equal((await send('POST', draft)).status, 401);
  } finally {
    owner = 'producer';
  }
});
