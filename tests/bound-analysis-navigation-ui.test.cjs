/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { writeFile } = require('node:fs/promises');
const { configuredWorld } = require('./fixtures/world-configuration.cjs');
const build = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, name + '.cjs'));

test('returning from inline analysis through shared navigation preserves the world and URL', async () => {
  const { Window } = await import('happy-dom');
  const window = new Window({ url: 'https://test.invalid/observe?save=navigation-fixture' });
  for (const name of [...Object.getOwnPropertyNames(window).filter(name => /^(HTML|SVG|Event|CustomEvent|ShadowRoot)/.test(name)), 'window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'DocumentFragment',
    'MutationObserver', 'ResizeObserver', 'getComputedStyle', 'history', 'sessionStorage', 'requestAnimationFrame', 'cancelAnimationFrame']) {
    Object.defineProperty(globalThis, name, { configurable: true, value: typeof window[name] === 'function' && ['getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'].includes(name)
      ? window[name].bind(window) : window[name] });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const React = require('react');
  const { createRoot } = require('react-dom/client');
  const esbuild = require(require.resolve('esbuild', { paths: [require.resolve('vite')] }));
  const { outputFiles } = await esbuild.build({
    entryPoints: ['components/world-app.tsx'], bundle: true, write: false, platform: 'node', format: 'cjs',
    plugins:[{name:'next-browser-boundary',setup(build){build.onResolve({filter:/^next\/(navigation|link)$/},args=>({path:args.path,namespace:'next-browser-boundary'}));build.onLoad({filter:/.*/,namespace:'next-browser-boundary'},args=>({contents:args.path.endsWith('link')?"import React from 'react';export default function Link(p){return React.createElement('a',p)}":"export function usePathname(){return '/observe'};export function useRouter(){return {push(){}}}",loader:'js'}));}}], jsx: 'automatic', alias: { '@': process.cwd() }, external: ['react', 'react/*', 'react-dom', 'react-dom/*'],
  });
  const code = outputFiles[0].text.replace(/require\("(react(?:-dom)?(?:\/[^" ]+)?)"\)/g, (_, name) => 'require(' + JSON.stringify(require.resolve(name)) + ')');
  const output = path.join(process.env.QUIET_HOURS_TEST_BUILD, 'bound-analysis-navigation-app.cjs');
  await writeFile(output, code);
  const WorldApp = require(output).default;
  const { GET } = build('route');
  build('store').install(configuredWorld());
  const fetch = global.fetch;
  global.fetch = (url, options) => { assert.ok(!options?.method || options.method==='GET', 'analysis navigation is read-only'); return GET(); };
  const root = createRoot(document.body.appendChild(document.createElement('div')));
  try {
    await React.act(async () => root.render(React.createElement(WorldApp, {
      saveId:'navigation-fixture', signInPath: '/login', displayName: 'fixture', environment: { caption: 'fixture', builtAtLabel: 'unknown' },
    })));
    const visible=selector=>[...document.querySelectorAll(selector)].filter(e=>!e.closest('[hidden]'));
    const click=async label=>{const button=visible('button').find(b=>b.textContent.trim()===label);assert.ok(button,label);await React.act(async()=>button.click());};
    await click('查看角色分析');
    assert.ok(visible('section[aria-label="人物分析"]').length);
    const observation=visible('a').find(a=>a.textContent==='觀察');
    await React.act(async()=>observation.click());
    assert.equal(visible('section[aria-label="人物分析"]').length,0,'top observation link must exit inline analysis even when its href was already current');
    assert.ok(visible('[aria-label="角色近況"]').length);
    await click('查看角色分析');
    assert.equal(new URL(window.location.href).searchParams.get('view'),'analysis','reload must reopen the displayed view');
    assert.equal((await (await GET()).json()).world.turn,0);
  } finally {
    await React.act(async () => root.unmount());
    global.fetch = fetch;
    await window.happyDOM.close();
  }
});
