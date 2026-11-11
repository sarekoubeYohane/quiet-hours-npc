/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { writeFile } = require('node:fs/promises');
const { configuredWorld } = require('./fixtures/world-configuration.cjs');
const build = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, name + '.cjs'));

const needs = values => ({ version: 1, activatedAt: 1260, updatedAt: 1265, values, assessed: { hunger: 0, thirst: 0, fatigue: 0, sleep: 0 }, dropped: 0,
  history: [{ minute: 1265, reason: '五分鐘時段', before: { ...values, hunger: values.hunger - 2 }, after: values }] });
function observedWorld() {
  const world = configuredWorld();
  world.minute = 1265; world.turn = 1;
  world.characters[0].needs = needs({ hunger: 72, thirst: 20, fatigue: 15, sleep: 90 });
  world.characters[0].mood = '有點煩躁';
  world.events = [
    { id: 'e1', time: 1265, actor: 'river', kind: 'attempt', text: '澄 試著修好卡住的窗戶。', audience: ['river'],
      resolution: { system: 'd100-v2', attributeVersion: 2, threshold: 60, roll: 37, modifier: 0, dc: 12, total: 0, outcome: 'success' },
      perception: [{ characterId: 'cedar', status: 'noticed', observations: [], reason: '隔著門聽見動靜',
        resolution: { roll: 5, modifier: 2, dc: 12, total: -5, outcome: 'mixed' } }] },
    { id: 'e2', time: 1265, actor: 'cedar', kind: 'say', text: '杉 說：「需要幫忙嗎？」', audience: ['river', 'cedar'] },
  ];
  return world;
}

test('the observation log derives rolls and state changes without touching the world', () => {
  const { observationLog, latestNeedChange } = build('observation-log');
  const world = observedWorld();
  world.characters[1].mentalEnergy = { version: 1, policy: { kind: 'formal', maximum: 70 }, value: 46, activatedAt: 1260, updatedAt: 1265, dropped: 0, history: [
    { kind: 'natural', groupId: 'g1', from: 1260, minute: 1265, reason: '', before: 50, after: 46, awakeMinutes: 5,
      draws: [{ source: 'awake', die: 6, face: 4, rawDelta: -4 }] }] };
  const before = JSON.stringify(world);
  const rounds = observationLog(world);
  assert.equal(JSON.stringify(world), before);
  assert.equal(rounds.length, 1);
  const [attempt, say] = rounds[0].entries;
  assert.equal(attempt.kind, 'd100 判定');
  assert.deepEqual(attempt.rolls.map(roll => [roll.context, roll.who, roll.dice, roll.result]), [
    ['行動檢定', '澄', 'd100 37 ／ 門檻 60', '成功'], ['感知', '杉', 'D20 5+2 對 DC 12', '部分成功']]);
  assert.equal(say.kind, '說話');
  const mental = rounds[0].entries.find(entry => entry.source === 'mental');
  assert.match(mental.text, /精神電量 50 → 46（−4）/);
  assert.deepEqual(mental.rolls.map(roll => [roll.dice, roll.result]), [['d6 骰出 4', '−4']]);
  assert.match(rounds[0].entries.find(entry => entry.source === 'needs').text, /飢餓 \+2/);
  assert.equal(latestNeedChange(world.characters[0]).hunger, 2);
});

test('the observation page shows everyone\'s needs and who rolled what', async () => {
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
  const output = path.join(process.env.QUIET_HOURS_TEST_BUILD, 'observation-log-app.cjs');
  await writeFile(output, code);
  const WorldApp = require(output).default;
  const { GET } = build('route');
  build('store').install(observedWorld());
  const fetch = global.fetch;
  global.fetch = url => GET(new Request(new URL(url, 'https://test.invalid')));
  const root = createRoot(document.body.appendChild(document.createElement('div')));
  try {
    await React.act(async () => root.render(React.createElement(WorldApp, {
      signInPath: '/login', displayName: 'fixture', environment: { caption: 'fixture', builtAtLabel: 'unknown' },
    })));
    const board = document.querySelector('[aria-label="人物狀態"]');
    assert.ok(board);
    const river = board.querySelector('[data-status-character="river"]');
    assert.match(river.textContent, /澄/);
    assert.match(river.textContent, /河畔工作室 · 接待室/);
    assert.match(river.textContent, /有點煩躁/);
    assert.equal(river.querySelector('[aria-label="澄 飢餓"]').getAttribute('aria-valuenow'), '72');
    assert.ok(river.querySelector('.meter-need.stage-2 [aria-label="澄 飢餓"]'), 'need colour follows the engine stage');
    assert.ok(river.querySelector('.meter-need.stage-3 [aria-label="澄 睡眠需求"]'));
    assert.match(board.querySelector('[data-status-character="cedar"]').textContent, /精神電量.*尚未啟用/);

    const log = document.querySelector('[aria-label="回合紀錄"]');
    const entries = [...log.querySelectorAll('[data-log-source="event"]')];
    assert.equal(entries.length, 2);
    assert.match(entries[0].textContent, /澄.*d100 判定.*試著修好卡住的窗戶/);
    assert.deepEqual([...entries[0].querySelectorAll('[data-roll]')].map(chip => chip.textContent),
      ['行動檢定 · 澄d100 37 ／ 門檻 60成功', '感知 · 杉D20 5+2 對 DC 12部分成功']);
    assert.match(log.textContent, /飢餓 \+2/);

    const scope = label => [...log.querySelectorAll('[aria-label="紀錄類型"] button')].find(button => button.textContent === label);
    await React.act(async () => scope('只看擲骰').click());
    assert.equal(log.querySelectorAll('[data-log-source]').length, 1);
    await React.act(async () => scope('全部').click());
    await React.act(async () => board.querySelector('[data-status-character="cedar"] button').click());
    assert.match(document.querySelector('[aria-label="角色近況"]').textContent, /杉/);
    assert.equal((await (await GET()).json()).world.turn, 1);
  } finally {
    await React.act(async () => root.unmount());
    global.fetch = fetch;
    await window.happyDOM.close();
  }
});
