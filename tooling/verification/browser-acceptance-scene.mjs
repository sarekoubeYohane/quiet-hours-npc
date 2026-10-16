import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { url, server, store, load, requests, modelRequests, setModelResponder } from './browser-fixture.mjs';
import { launchBrowser, outputPath } from './browser-runtime.mjs';

process.env.BROWSER_ARTIFACT_DIR ||= resolve('docs/verification/assets/acceptance-scene');
await mkdir(process.env.BROWSER_ARTIFACT_DIR, { recursive: true });
const original = load('world').seedWorld();
original.turn = 123; original.minute = 3105;
load('world').record(original, 'observer', 'ORIGINAL-STORY-ONLY', 'intervention', ['cass']);
original.adjudication = { provider: 'openai', model: 'fixture-adjudicator' };
original.playerBudget = { calls: 120, tokens: 1000000 };
store.install(original);
const rest = { type: 'rest', target: '', content: '', mood: '平靜', durationMinutes: 90, intents: [] };
const proposal = target => ({ type: 'propose', target, content: '依當下條件處理餐點或杯子', purpose: '生活驗收', mood: '平靜', durationMinutes: 15, intents: [] });
const completion = value => Response.json({ usage: { prompt_tokens: 30, completion_tokens: 10 }, choices: [{ message: { content: JSON.stringify(value) } }] });
let actor = 'cass', choice = proposal('acceptance-meal');
let candidate = { status: 'accepted', effects: [{ kind: 'materialize', supplyId: 'acceptance-meal', expectedRemaining: 1 }], check: null };
setModelResponder(request => {
  assert.doesNotMatch(JSON.stringify(request), /ORIGINAL-STORY-ONLY/);
  const input = JSON.parse(request.messages[1].content);
  return completion(input.contractVersion === 'world-adjudication.v1' ? candidate : input.self.id === actor ? choice : rest);
});

let browser;
try {
  browser = await launchBrowser();
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(String(error)));
  await context.addInitScript(instant => { Date.now = () => instant; }, Date.parse('2026-10-15T16:00:00Z'));
  const nav = name => page.getByRole('navigation', { name: '觀察室分頁' }).getByRole('button', { name, exact: true }).click();
  const read = async () => (await (await page.request.get(url + '/api/world')).json()).world;
  let wallClock = Date.parse('2026-10-15T16:00:00Z');
  const operation = async (button, name) => {
    wallClock = (await (await page.request.post(url + '/__fixture', { data: { advanceMs: 1000 } })).json()).now;
    await page.evaluate(instant => { Date.now = () => instant; }, wallClock);
    const response = page.waitForResponse(r => r.url().endsWith('/api/world') && r.request().method() === 'POST' && JSON.parse(r.request().postData()).operation === name);
    await button.click(); const result = await response;
    assert.equal(result.status(), 200, await result.text());
    await page.waitForFunction(() => document.querySelector('.advance-button')?.textContent.trim() === '下一回合');
    return read();
  };
  const advance = () => operation(page.getByRole('button', { name: '下一回合', exact: true }), 'advance');
  const wake = async person => {
    await nav('觀察');
    await page.getByRole('region', { name: '角色近況', exact: true }).getByRole('button', { name: person, exact: true }).click();
    await page.getByLabel('你想說的話或發生的事', { exact: true }).fill('可以留意一下這邊嗎？下一步由你決定。');
    await operation(page.getByRole('button', { name: '加入事件', exact: true }), 'intervene');
  };
  const chooseAI = async () => {
    await nav('設定');
    await page.getByRole('combobox', { name: '決策方式', exact: true }).click();
    await page.getByRole('option', { name: 'OpenAI 直連', exact: true }).click();
    await page.getByRole('combobox', { name: 'OpenAI 模型', exact: true }).click();
    await page.getByRole('option', { name: 'GPT-6.1 Sol', exact: true }).click();
    await nav('觀察');
  };
  const setEffects = effects => { candidate = { status: 'accepted', effects, check: null }; };
  try {
    await page.request.post(url + '/api/world', { data: { operation: 'set-model-key', mode: 'openai', key: 'fixture-key' } });
    await page.goto(url); await nav('設定');
    await page.getByRole('button', { name: '進入最小驗收場景', exact: true }).click();
    await page.getByRole('button', { name: '取消', exact: true }).click();
    assert.equal((await read()).turn, 123); assert.equal(modelRequests.length, 0);
    const other = await context.newPage(); await other.goto(url);
    await other.getByRole('button', { name: '下一回合', exact: true }).waitFor();
    await page.getByRole('button', { name: '進入最小驗收場景', exact: true }).click();
    let world = await operation(page.getByRole('button', { name: '確認進入驗收', exact: true }), 'enter-acceptance');
    assert.equal(world.turn, 0); assert.equal(world.supplies[0].remaining, 1);
    assert.doesNotMatch(JSON.stringify(world), /ORIGINAL-STORY-ONLY/);
    assert.equal(modelRequests.length, 0);
    await other.evaluate(instant => { Date.now = () => instant; }, wallClock - 2000);
    await other.getByLabel('你想說的話或發生的事', { exact: true }).fill('OLD-TAB-MUST-NOT-APPLY');
    await other.getByRole('button', { name: '加入事件', exact: true }).click();
    await other.getByRole('alert').waitFor();
    assert.match(await other.getByRole('alert').innerText(), /場景已切換/);
    assert.equal(await other.getByRole('button', { name: '重試未完成操作', exact: true }).count(), 0);
    assert.doesNotMatch(JSON.stringify(await read()), /OLD-TAB-MUST-NOT-APPLY/);
    await other.close();
    console.log('PASS entry/cancel, no paid calls, backup privacy, stale-tab recovery');

    await chooseAI(); await advance();
    choice = proposal('acceptance-meal:1'); setEffects([{ kind: 'consume', objectId: 'acceptance-meal:1', expectedRevision: 1 }]);
    world = await advance();
    assert.equal(world.objects.find(o => o.id === 'acceptance-meal:1').lifecycle, 'consumed');
    assert.equal(world.supplies[0].remaining, 0); assert.equal(world.aiUsage.totalCalls, 7);
    const contextId = world.contextId; await page.reload(); await chooseAI();
    assert.equal((await read()).contextId, contextId);
    assert.equal((await read()).objects.find(o => o.id === 'acceptance-meal:1').lifecycle, 'consumed');
    console.log('PASS acquire/eat through real app and persisted object after reload');

    actor = 'owner'; choice = proposal('acceptance-cup');
    setEffects([{ kind: 'grant', targetId: 'acceptance-cup', recipient: 'vera' }]); await wake('店主'); await advance();
    actor = 'vera'; choice = proposal('acceptance-cup');
    setEffects([{ kind: 'transfer', objectId: 'acceptance-cup', expectedRevision: 1, toHolder: 'vera', toRegion: 'cafe-front' }]); await wake('Vera'); await advance();
    choice = { ...rest, type: 'move', target: 'kris-home', durationMinutes: 15 }; await wake('Vera'); await advance();
    choice = proposal('acceptance-cup'); setEffects([{ kind: 'state', objectId: 'acceptance-cup', expectedRevision: 3, key: 'clean', value: 'no' }]); await wake('Vera'); await advance();
    setEffects([{ kind: 'state', objectId: 'acceptance-cup', expectedRevision: 4, key: 'clean', value: 'yes' }]); await wake('Vera'); await advance();
    choice = { ...rest, type: 'move', target: 'cafe', durationMinutes: 15 }; await wake('Vera'); await advance();
    choice = proposal('acceptance-cup'); setEffects([{ kind: 'transfer', objectId: 'acceptance-cup', expectedRevision: 6, toHolder: null, toRegion: 'cafe-front' }]); await wake('Vera'); world = await advance();
    assert.equal(world.objects[0].id, 'acceptance-cup'); assert.equal(world.objects[0].owner, 'owner');
    assert.equal(world.objects[0].holder, null); assert.equal(world.objects[0].revision, 7); assert.equal(world.objects[0].state.clean, 'yes');
    console.log('PASS autonomous grant, borrow/carry/wash/return keeps same cup');

    choice = { ...proposal('acceptance-cup'), durationMinutes: 60 };
    candidate = { status: 'accepted', effects: [], check: null, stages: [
      { afterMinutes: 30, preconditions: [{ objectId: 'acceptance-cup', revision: 7, region: 'cafe-front', holder: null, state: { contents: 'empty' } }], effects: [{ kind: 'state', objectId: 'acceptance-cup', expectedRevision: 7, key: 'contents', value: 'water' }] },
      { afterMinutes: 60, preconditions: [{ objectId: 'acceptance-cup', revision: 8, region: 'cafe-front', holder: null, state: { contents: 'water' } }], effects: [{ kind: 'state', objectId: 'acceptance-cup', expectedRevision: 8, key: 'contents', value: 'tea' }] },
    ] };
    await wake('Vera'); world = await advance(); assert.equal(world.objects[0].state.contents, 'empty');
    world = await advance(); assert.equal(world.objects[0].state.contents, 'water');
    await page.getByText('供應、物件與活動階段', { exact: true }).click();
    const status = page.getByRole('region', { name: '驗收場景狀態', exact: true });
    assert.match(await status.innerText(), /已完成 1／2 階段/);
    assert.match(await status.getByRole('article', { name: '驗收杯子物件', exact: true }).innerText(), /已加水/);
    await page.screenshot({ path: outputPath('desktop-water.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    await page.screenshot({ path: outputPath('mobile-water.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    choice = rest; await wake('Vera'); await advance(); world = await advance();
    assert.equal(world.objects[0].state.contents, 'water'); assert.equal(world.objects[0].revision, 8);
    assert.equal(world.characters.find(c => c.id === 'vera').plan.phases, undefined);
    console.log('PASS intermediate water, phase status, desktop/mobile, interruption retains water');

    const calls = world.aiUsage.totalCalls;
    await nav('設定'); await page.getByRole('button', { name: '結束驗收並返回原世界', exact: true }).click();
    await page.getByRole('button', { name: '取消', exact: true }).click(); assert.equal((await read()).acceptance.id, 'daily-life-v1');
    await page.getByRole('button', { name: '結束驗收並返回原世界', exact: true }).click();
    world = await operation(page.getByRole('button', { name: '確認結束驗收', exact: true }), 'exit-acceptance');
    assert.equal(world.turn, 123); assert.equal(world.minute, 3105);
    assert.deepEqual(world.characters, original.characters); assert.deepEqual(world.events, original.events);
    assert.equal(world.acceptance, undefined); assert.equal(world.objects, undefined); assert.equal(world.aiUsage.totalCalls, calls);
    await page.reload(); await nav('觀察');
    assert.equal((await read()).turn, 123); assert.equal((await read()).aiUsage.totalCalls, calls);
    assert.equal(await page.getByRole('button', { name: '開始自動', exact: true }).count(), 1);
    assert.ok(requests.filter(r => r.operation === 'advance').every(r => typeof r.worldContext === 'string'));
    assert.deepEqual(errors, []);
    console.log('PASS return/cancel/reload restores original story, paid usage retained, no pageerror');
  } finally { await context.close(); }
} finally { await browser?.close(); server.close(); }
