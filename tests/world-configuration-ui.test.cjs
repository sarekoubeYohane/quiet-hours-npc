/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { writeFile } = require('node:fs/promises');
const { configuredWorld } = require('./fixtures/world-configuration.cjs');
const build = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, name + '.cjs'));

test('the app shows the configured places and opens the selected character profile with its room name', async () => {
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
  const output = path.join(process.env.QUIET_HOURS_TEST_BUILD, 'configured-app.cjs');
  await writeFile(output, code);
  const WorldApp = require(output).default;
  const { GET } = build('route');
  build('store').install(configuredWorld());
  const fetch = global.fetch;
  global.fetch = url => GET(new Request(new URL(url, 'https://test.invalid')));
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
    assert.equal((await (await GET()).json()).world.turn, 0);
  } finally {
    await React.act(async () => root.unmount());
    global.fetch = fetch;
    await window.happyDOM.close();
  }
});
