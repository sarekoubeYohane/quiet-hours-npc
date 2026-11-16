import { confirmOpening } from '../tooling/verification/opening-journey.mjs';
import '../tooling/verification/no-network.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Window } from 'happy-dom';
import { characterApiFixture } from './support/character-api-fixture.mjs';

const require = createRequire(import.meta.url);
const window = new Window({ url: 'https://test.invalid/character-templates' });
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLSelectElement', 'Element', 'Node', 'Event', 'MouseEvent', 'DocumentFragment', 'MutationObserver', 'history', 'sessionStorage', 'requestAnimationFrame', 'cancelAnimationFrame'])
 Object.defineProperty(globalThis, name, { configurable: true, value: ['requestAnimationFrame', 'cancelAnimationFrame'].includes(name) ? window[name].bind(window) : window[name] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import('react'); const { createRoot } = await import('react-dom/client');
const esbuild = require(require.resolve('esbuild', { paths: [require.resolve('vite')] }));
async function component(path) {
 const directory = await mkdtemp(join(tmpdir(), 'example-ui-'));
 const result = await esbuild.build({ entryPoints: [path], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', alias: { '@': process.cwd() }, external: ['react', 'react/*', 'react-dom', 'react-dom/*'] });
 const code = result.outputFiles[0].text.replace(/require\("(react(?:-dom)?(?:\/[^" ]+)?)"\)/g, (_, name) => `require(${JSON.stringify(require.resolve(name))})`);
 const output = join(directory, 'ui.cjs'); await writeFile(output, code);
 return { Component: require(output).default, close: () => rm(directory, { recursive: true, force: true }) };
}
const settle = async check => { for (let i = 0; i < 150; i++) { await React.act(async () => { await new Promise(r => setTimeout(r, 5)); }); if (check()) return; } assert.fail(document.body.textContent); };
const artwork = { Cass: 'cass', Vera: 'vera', Kris: 'kris', 店主: 'owner' };

async function exampleWorld() {
 const f = await characterApiFixture();
 const cards = (await f.read(f.routes.cards, '/api/character-cards')).body.cards, scenes = (await f.read(f.routes.scenes, '/api/scene-templates')).body.templates;
 const scene = name => scenes.find(item => item.shared && item.name === name), card = name => cards.find(item => item.fields.name === name);
 const place = (id, name) => ({ id, templateId: scene(name).id, version: scene(name).version, name });
 const person = (name, placeId, roomName) => ({ templateId: card(name).id, version: card(name).version, placeId, roomId: scene({ 'kris-home': 'Kris 的住處', 'vera-home': 'Vera 的房間', cafe: '街角咖啡館' }[placeId]).rooms.find(room => room.name === roomName).id });
 const city = { places: [place('kris-home', 'Kris 的住處'), place('vera-home', 'Vera 的房間'), place('cafe', '街角咖啡館')],
  characters: [person('Cass', 'kris-home', '室內'), person('Vera', 'vera-home', '室內'), person('Kris', 'kris-home', '室內'), person('店主', 'cafe', '前台')] };
 const apiRequest = async (path, payload) => { const route = path === '/api/saves' ? f.routes.saves : f.routes.openings; return payload !== undefined ? f.post(route, payload, path) : f.read(route, path); };
 const { saved } = await confirmOpening(apiRequest, { name: '街角咖啡館', city });
 return { f, world: (await f.worldRequest(undefined, saved.save.id)).body.world };
}

test('範例人物在人物檔案與地圖顯示原本的角色圖', async () => {
 const { f, world } = await exampleWorld();
 const profile = await component('components/character-profile.tsx'), map = await component('components/pixel-world.tsx');
 const root = createRoot(document.body.appendChild(document.createElement('div')));
 try {
  for (const character of world.characters) {
   await React.act(async () => root.render(React.createElement(profile.Component, { world, character, onBack() {}, onInteract() {}, onAnalysis() {} })));
   const image = document.querySelector('[aria-label="人物檔案"] img');
   assert.ok(image, character.name + ' 應顯示角色圖而不是名字首字');
   assert.equal(image.getAttribute('src'), `/characters/${artwork[character.name]}/portrait.webp`);
  }
  await React.act(async () => root.render(React.createElement(map.Component, { world, selected: '', onSelect() {}, onPlayingChange() {} })));
  const shown = new Map();
  const picker = document.querySelector('[aria-label="觀看場所"]');
  for (const option of [...picker.querySelectorAll('option')]) {
   await React.act(async () => { picker.value = option.value; picker.dispatchEvent(new window.Event('change', { bubbles: true })); });
   for (const button of document.querySelectorAll('[aria-label="目前觀看場所"] button')) {
    const name = button.querySelector('strong')?.textContent, image = button.querySelector('[data-asset-use="pixel"] img');
    if (name) shown.set(name, image?.getAttribute('src'));
   }
  }
  assert.deepEqual(Object.fromEntries(shown), Object.fromEntries(Object.entries(artwork).map(([name, key]) => [name, `/characters/${key}/idle.png`])));
 } finally { await React.act(async () => root.unmount()); await profile.close(); await map.close(); f.db.close(); }
});

test('人物庫中的範例人物卡沒有修改或刪除的操作', async () => {
 const f = await characterApiFixture();
 const library = await component('components/example-character-cards.tsx');
 const originalFetch = globalThis.fetch;
 globalThis.fetch = async url => f.routes.cards.GET(new Request(new URL(String(url), 'https://test.invalid')));
 const root = createRoot(document.body.appendChild(document.createElement('div')));
 try {
  await React.act(async () => root.render(React.createElement(library.Component, { originalAccountScope: 'account-operations:' + f.context.owner })));
  await settle(() => document.querySelectorAll('[aria-label="範例人物卡"] article').length === 4);
  const section = document.querySelector('[aria-label="範例人物卡"]');
  for (const name of Object.keys(artwork)) assert.match(section.textContent, new RegExp(name));
  const controls = [...section.querySelectorAll('button, a, input, textarea, select')].map(element => element.textContent + (element.getAttribute('aria-label') ?? ''));
  assert.equal(controls.filter(text => /修改|編輯|刪除|保存/.test(text)).length, 0, controls.join('、'));
 } finally { await React.act(async () => root.unmount()); globalThis.fetch = originalFetch; await library.close(); f.db.close(); await window.happyDOM.abort(); }
});
