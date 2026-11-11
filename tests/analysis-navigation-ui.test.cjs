/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { writeFile } = require('node:fs/promises');
const { configuredWorld } = require('./fixtures/world-configuration.cjs');
const build = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, name + '.cjs'));

test('analysis navigation preserves the selected character without advancing the world', async () => {
  const { Window } = await import('happy-dom');
  const window = new Window({ url: 'https://test.invalid' });
  for (const name of [...Object.getOwnPropertyNames(window).filter(name => /^(HTML|SVG|Event|CustomEvent|ShadowRoot)/.test(name)), 'window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'DocumentFragment',
    'MutationObserver', 'ResizeObserver', 'getComputedStyle', 'sessionStorage', 'requestAnimationFrame', 'cancelAnimationFrame']) {
    Object.defineProperty(globalThis, name, { configurable: true, value: typeof window[name] === 'function' && ['getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'].includes(name)
      ? window[name].bind(window) : window[name] });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const React = require('react');
  const { createRoot } = require('react-dom/client');
  const esbuild = require(require.resolve('esbuild', { paths: [require.resolve('vite')] }));
  const { outputFiles } = await esbuild.build({
    entryPoints: ['components/world-app.tsx'], bundle: true, write: false, platform: 'node', format: 'cjs',
    jsx: 'automatic', alias: { '@': process.cwd() }, external: ['react', 'react/*', 'react-dom', 'react-dom/*'],
  });
  const code = outputFiles[0].text.replace(/require\("(react(?:-dom)?(?:\/[^" ]+)?)"\)/g, (_, name) => 'require(' + JSON.stringify(require.resolve(name)) + ')');
  const output = path.join(process.env.QUIET_HOURS_TEST_BUILD, 'analysis-navigation-app.cjs');
  await writeFile(output, code);
  const WorldApp = require(output).default;
  const { GET } = build('route');
  build('store').install(configuredWorld());
  const fetch = global.fetch;
  global.fetch = (url, options) => { assert.ok(!options?.method || options.method==='GET', 'analysis navigation is read-only'); return GET(new Request(new URL(url, 'https://test.invalid'))); };
  const root = createRoot(document.body.appendChild(document.createElement('div')));
  try {
    await React.act(async () => root.render(React.createElement(WorldApp, {
      signInPath: '/login', displayName: 'fixture', environment: { caption: 'fixture', builtAtLabel: 'unknown' },
    })));
    const map = document.querySelector('[aria-label="世界像素地圖"]');
    assert.ok(map);
    assert.match(map.textContent, /河畔工作室/);
    assert.match(map.textContent, /保密別館/);
    assert.doesNotMatch(map.textContent, /Kris 的住處|Vera 的房間|街角咖啡館/);
    const inLoft = [...map.querySelectorAll('button')].find(button => /杉.*閣樓/.test(button.textContent));
    assert.ok(inLoft, 'the configured room and its occupant are shown');
    await React.act(async () => inLoft.click());
    const profile = [...document.querySelectorAll('button')].find(button => button.textContent === '人物檔案');
    assert.ok(profile);
    await React.act(async () => profile.click());
    const panel = document.querySelector('[aria-label="人物檔案"]');
    assert.match(panel.textContent, /河畔工作室 · 閣樓/);
    const click = async label => {
      const button=[...document.querySelectorAll('button')].find(b=>(b.getAttribute('aria-label')||b.textContent.trim())===label && !b.closest('[hidden]'));
      assert.ok(button, label); await React.act(async()=>button.click());
    };
    await click('查看角色分析');
    const visible = selector => [...document.querySelectorAll(selector)].filter(e=>!e.closest('[hidden]'));
    assert.equal(visible('[aria-label="已發生費用估算"]').length,0);
    assert.equal(visible('[aria-label="操作驗收證據"]').length,0);
    assert.match(visible('section[aria-label="人物分析"]')[0].textContent,/杉/);
    await click('追求與生活');
    assert.ok(visible('[aria-label="分層追求"]').length);
    await click('記憶與信念');
    assert.ok(visible('[aria-label="杉 的記憶與信念"]').length);
    await click('世界紀錄');
    await click('日常與物件');
    assert.ok(visible('[aria-label="日常規則與成果"]').length);
    await click('用量與費用');
    assert.equal(visible('[aria-label="已發生費用估算"]').length,1);
    await click('操作追溯');
    assert.equal(visible('[aria-label="操作驗收證據"]').length,1);
    await click('人物分析');
    assert.match(visible('section[aria-label="人物分析"]')[0].textContent,/杉/);
    await click('觀察');
    await click('規則模式 · 運行設定');
    await click('開始自動');
    await click('關閉運行設定');
    await click('人物檔案');
    assert.ok(visible('button').some(b=>b.textContent.trim()==='暫停自動'),'pause stays reachable from a character profile');
    await click('暫停自動');
    assert.equal((await (await GET()).json()).world.turn,0);
  } finally {
    await React.act(async () => root.unmount());
    global.fetch = fetch;
    await window.happyDOM.close();
  }
});
