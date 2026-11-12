import assert from 'node:assert/strict';
import { configuredWorld } from '../../tests/fixtures/world-configuration.cjs';
import { fixtureDecision } from '../../tests/pursuit-fixture.cjs';
import { url, server, store, load, modelRequests, setModelResponder } from './browser-fixture.mjs';
import { launchBrowser } from './browser-runtime.mjs';

const world = configuredWorld();
world.characters.length = 1;
world.contextId = 'observed-activities-310';
store.install(world);

let browser;
try {
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => console.error(error));
  const tick = async () => (await (await page.request.post(url + '/__fixture', { data: { advanceMs: 1000 } })).json()).now;
  await page.addInitScript(now => { Date.now = () => now; }, await tick());
  await page.route('**/api/world', async route => {
    if (route.request().method() === 'POST') await page.evaluate(now => { Date.now = () => now; }, await tick());
    await route.continue();
  });
  const clickOperation = async (name, operation) => {
    const button = page.getByRole('button', { name, exact: true });
    await button.waitFor();
    assert.equal(await button.isEnabled(), true, await page.locator('body').innerText());
    const [response] = await Promise.all([
      page.waitForResponse(response => response.url().endsWith('/api/world') &&
        response.request().method() === 'POST' && response.request().postDataJSON().operation === operation),
      button.click(),
    ]);
    assert.equal(response.status(), 200, await response.text());
  };
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('[aria-label="人物狀態"]').waitFor().catch(async error => {
    throw new Error(await page.locator('body').innerText(), { cause: error });
  });
  const button = page.getByRole('button', { name: '下一回合', exact: true });
  assert.equal(await button.isEnabled(), true, await page.locator('body').innerText());
  await clickOperation('下一回合', 'advance');
  await page.reload();
  const saved = (await (await page.request.get(url + '/api/world')).json()).world;
  assert.equal(saved.minute, world.minute + 5);
  for (const label of ['回合紀錄', '人物狀態', '目前觀看場所']) {
    const area = page.locator(`[aria-label="${label}"]`);
    await area.waitFor();
    assert.match(await area.innerText(), /(?:開始|正在).*休息/, label);
  }
  if (process.env.BROWSER_ARTIFACT_DIR) {
    await page.screenshot({ path: process.env.BROWSER_ARTIFACT_DIR + '/activity-start.png', fullPage: true });
  }

  const workshop = structuredClone(world);
  workshop.objects = [{ id: 'table', label: '小桌', source: 'fixture', region: 'lobby', holder: null, owner: 'river',
    revision: 1, state: { surface: 'cluttered', temperature: 'warm' }, lifecycle: 'active', kind: 'utensil',
    knownTo: ['river'], allowedTo: ['river'], stateTransitions: { surface: ['cluttered', 'tidy', 'clean'], temperature: ['warm', 'cool'] } }];
  store.install(workshop);
  const read = async () => (await (await page.request.get(url + '/api/world')).json());
  const post = async (body, expected = 200) => {
    const operationId = (await tick()) + ':' + crypto.randomUUID();
    const response = await page.request.post(url + '/api/world', {
      headers: { 'X-World-Time-Policy': 'round-v1' },
      data: { operationId, operationScope: (await read()).operationScope, worldContext: world.contextId,
        mode: 'openai', model: 'gpt-6.1-sol', ...body },
    });
    const result = await response.json();
    assert.equal(response.status(), expected, result.error);
    return result;
  };
  await post({ operation: 'set-model-key', key: 'isolated-observation-310-key' });
  const settingsUrl = url + '/api/model-settings?save=legacy';
  const settings = await (await page.request.get(settingsUrl)).json();
  const model = { provider: 'openai', model: 'gpt-6.1-sol' };
  const configured = await page.request.post(settingsUrl, { data: {
    accountScope: settings.accountScope, version: settings.version, mode: 'custom',
    models: { npc: model, adjudication: model },
  } });
  assert.equal(configured.status(), 200, await configured.text());
  const enableAi = async () => {
    const ready = await read();
    assert.ok(ready.modelSettings.effective.npc, JSON.stringify(ready.modelSettings.effective));
    assert.ok(ready.modelSettings.effective.adjudication);
    assert.ok(ready.modelKeys.openai.expiresAt > await page.evaluate(() => Date.now()));
    assert.ok(ready.world.adjudication);
    const nav = page.getByRole('navigation', { name: '觀察室分頁' });
    await nav.getByRole('button', { name: '設定', exact: true }).click();
    await page.getByText(/模型生效來源：存檔自訂/).waitFor();
    await page.getByRole('button', { name: '使用 AI 模式', exact: true }).click();
    await nav.getByRole('button', { name: '觀察', exact: true }).click();
  };
  const proposal = { type: 'propose', target: 'table', content: '整理並擦拭小桌，希望桌面完全乾淨',
    purpose: '桌面完全乾淨', mood: '平靜', durationMinutes: 30, intents: [],
    timeIntent: { kind: 'completion', maxMinutes: null } };
  const state = (expectedRevision, value) => ({ kind: 'state', objectId: 'table', expectedRevision, key: 'surface', value });
  let judgment = 'accepted';
  let maxMinutes = null;
  let choice = proposal;
  let failLater = false;
  const tableTarget = { type: 'object', id: 'table' };
  const cooling = {
    kind: 'schedule-natural', version: 1, delayMinutes: 15,
    conditions: [{ kind: 'state-condition', version: 1, target: tableTarget, state: [{ key: 'surface', value: 'tidy' }] }],
    effects: [{ target: tableTarget, exposure: 'public', changes: [{ key: 'temperature', from: 'warm', value: 'cool' }] }],
    reason: '桌面自然冷卻',
  };
  setModelResponder(request => {
    const input = JSON.parse(request.messages[1].content);
    const reply = input.contractVersion === 'world-adjudication.v1'
      ? judgment === 'denied' ? { status: 'denied', effects: [], stages: [], check: null } :
      { status: 'accepted', resumable: true, effects: [], stages: [
        { afterMinutes: 15, preconditions: [], effects: [state(1, 'tidy'), ...(failLater ? [cooling] : [])] },
        { afterMinutes: failLater ? 45 : 30, preconditions: [], effects: [state(2, 'clean')] },
      ], activityIdentity: { version: 1, key: 'wipe-table', label: '整理並擦拭小桌' }, check: null, completionMinutes: failLater ? 45 : 30 }
      : fixtureDecision(input, { ...choice, ...(input.self.id === 'cedar' && choice.type === 'propose' ? { target: 'table-2' } : {}),
        timeIntent: { ...choice.timeIntent, maxMinutes } });
    return Response.json({ usage: { prompt_tokens: 1, completion_tokens: 1 },
      choices: [{ message: { content: JSON.stringify(reply) } }] });
  });
  const step = { operation: 'advance', timeContract: 'five-minute-v1', minutes: 5 };
  const log = page.locator('[aria-label="回合紀錄"]');
  const reloadLog = async () => {
    await page.reload();
    await log.getByRole('button', { name: '行動與事件', exact: true }).click();
    return log.innerText();
  };
  await page.reload();
  await enableAi();
  await clickOperation('下一回合', 'advance');
  const start = await reloadLog();
  assert.match(start, /開始.*整理並擦拭小桌/);
  assert.doesNotMatch(start, /完全乾淨|surface=clean/);
  assert.equal((await read()).world.objects[0].state.surface, 'cluttered');
  const count = async () => log.locator('[data-log-source="event"]').count();
  const startCount = await count();
  await post(step);
  await reloadLog();
  assert.equal(await count(), startCount, 'pure continuation adds no visible event');
  await post(step);
  await post(step);
  assert.match(await reloadLog(), /小桌：surface=tidy/);
  assert.equal(await count(), startCount + 1);
  assert.equal((await read()).world.objects[0].state.surface, 'tidy');
  assert.match(await page.locator('.status-activity').innerText(), /正在.*整理並擦拭小桌/);
  if (process.env.BROWSER_ARTIFACT_DIR) {
    await page.screenshot({ path: process.env.BROWSER_ARTIFACT_DIR + '/activity-progress.png', fullPage: true });
  }
  for (let i = 0; i < 3; i++) await post(step);
  assert.match(await reloadLog(), /整理並擦拭小桌.*已完成.*surface=clean/);
  assert.equal((await read()).world.objects[0].state.surface, 'clean');
  assert.equal(modelRequests.length, 2, 'read and ordinary progress dispatch no models');
  assert.match(await log.innerText(), /開始.*整理並擦拭小桌/);

  judgment = 'denied';
  const deniedRows = log.locator('[data-log-source="event"]').filter({ hasText: /未能開始.*整理並擦拭小桌/ });
  await post(step);
  await reloadLog();
  assert.equal(await deniedRows.count(), 1);
  assert.doesNotMatch(await deniedRows.innerText(), /：|原因|完全乾淨/);
  const operationId = (await tick()) + ':' + crypto.randomUUID();
  await post({ ...step, operationId });
  await reloadLog();
  assert.equal(await deniedRows.count(), 2, 'a fresh attempt is visible even with identical text');
  const beforeReplay = modelRequests.length;
  await post({ ...step, operationId });
  await reloadLog();
  assert.equal(await deniedRows.count(), 2);
  assert.equal(modelRequests.length, beforeReplay);

  store.install(workshop);
  await post({ operation: 'set-model-key', key: 'isolated-observation-310-key' });
  judgment = 'accepted';
  maxMinutes = 15;
  await post(step);
  await reloadLog();
  assert.equal(await deniedRows.count(), 1);
  assert.match(await deniedRows.innerText(), /需要 30 分鐘.*投入上限 15 分鐘/);
  assert.equal((await read()).world.objects[0].state.surface, 'cluttered');

  store.install(workshop);
  await post({ operation: 'set-model-key', key: 'isolated-observation-310-key' });
  maxMinutes = null;
  const intervene = () => post({ operation: 'intervene', target: 'river', text: '請自行決定是否繼續。' });
  await post(step);
  const original = (await read()).world.characters[0].plan.startedAt;
  await intervene();
  choice = { ...proposal, type: 'continue', target: '', content: '' };
  await post(step);
  assert.doesNotMatch(await reloadLog(), /決定繼續原本的活動|已停止|已完成/);
  const reassessed = (await read()).world;
  assert.equal(reassessed.characters[0].plan.startedAt, original);
  assert.ok(reassessed.events.some(event => /決定繼續原本的活動/.test(event.text)), 'the original continuation event is preserved');
  assert.ok(reassessed.characters[0].shortTerm.some(memory => /開始進行這項活動/.test(memory.text)));
  await post(step);
  await post(step);
  await intervene();
  choice = { ...proposal, type: 'pause', target: '', content: '' };
  await post(step);
  const pausedLog = await reloadLog();
  assert.match(pausedLog, /已暫停.*整理並擦拭小桌/);
  assert.match(pausedLog, /surface=tidy/);
  assert.doesNotMatch(pausedLog, /surface=clean/);
  let paused = (await read()).world.characters[0].pausedActivity;
  assert.ok(paused);
  const nextInput = JSON.parse(modelRequests.at(-1).messages[1].content);
  assert.match(JSON.stringify(nextInput), /小桌：surface=tidy/);
  assert.doesNotMatch(JSON.stringify(nextInput), /activityObservation|observedActivity|有進展，活動尚未完成/);
  choice = { ...proposal, type: 'resume', target: paused.id, content: '' };
  await post(step);
  assert.match(await reloadLog(), /已恢復.*整理並擦拭小桌/);
  assert.match(await page.locator('.status-activity').innerText(), /正在.*整理並擦拭小桌/);
  await intervene();
  choice = { ...proposal, type: 'pause', target: '', content: '' };
  await post(step);
  paused = (await read()).world.characters[0].pausedActivity;
  assert.ok(paused);
  choice = { ...proposal, type: 'abandon', target: paused.id, content: '' };
  await post(step);
  assert.match(await reloadLog(), /已停止.*整理並擦拭小桌/);
  assert.equal((await read()).world.objects[0].state.surface, 'tidy');

  store.install(workshop);
  await post({ operation: 'set-model-key', key: 'isolated-observation-310-key' });
  choice = proposal;
  const faultId = (await tick()) + ':' + crypto.randomUUID();
  store.throwBeforeNextSave();
  await post({ ...step, operationId: faultId }, 502);
  assert.doesNotMatch(await reloadLog(), /整理並擦拭小桌/);
  assert.equal((await read()).world.objects[0].state.surface, 'cluttered');
  const afterFault = modelRequests.length;
  await post({ ...step, operationId: faultId }, 502);
  assert.equal(modelRequests.length, afterFault);
  const lostId = (await tick()) + ':' + crypto.randomUUID();
  store.throwAfterNextSave();
  await post({ ...step, operationId: lostId });
  assert.match(await reloadLog(), /開始.*整理並擦拭小桌/);
  const afterLost = modelRequests.length;
  await post({ ...step, operationId: lostId });
  await reloadLog();
  assert.equal(await log.locator('[data-log-source="event"]').filter({ hasText: /開始.*整理並擦拭小桌/ }).count(), 1);
  assert.equal(modelRequests.length, afterLost);

  store.install(workshop);
  await post({ operation: 'set-model-key', key: 'isolated-observation-310-key' });
  failLater = true;
  for (let i = 0; i < 10; i++) await post(step);
  const failed = await reloadLog();
  assert.match(failed, /整理並擦拭小桌.*執行後未能完成/);
  assert.match(failed, /surface=tidy/);
  assert.doesNotMatch(failed, /未能開始|surface=clean/);
  assert.equal((await read()).world.objects[0].state.surface, 'tidy');

  const twins = structuredClone(workshop);
  twins.characters.push({ ...configuredWorld().characters[1], region: 'lobby' });
  twins.objects.push({ ...twins.objects[0], id: 'table-2', owner: 'cedar', knownTo: ['cedar'], allowedTo: ['cedar'] });
  twins.scene.doors['loft-door'] = 'open';
  store.install(twins);
  await post({ operation: 'set-model-key', key: 'isolated-observation-310-key' });
  judgment = 'denied';
  await post(step);
  await reloadLog();
  for (const [actor, ordinal] of [['river', 1], ['cedar', 2]]) {
    const row = log.locator(`[data-log-actor="${actor}"]`).filter({ hasText: /未能開始/ });
    assert.match(await row.innerText(), new RegExp(`小桌 · 第 ${ordinal} 件`));
  }
  choice = { ...proposal, type: 'door', target: 'loft-door', content: 'open' };
  await post(step);
  assert.match(await reloadLog(), /未能開始.*打開閣樓門.*門已是指定狀態/);

  const blockedTravel = structuredClone(workshop);
  blockedTravel.characters[0].region = 'loft';
  store.install(blockedTravel);
  await post({ operation: 'set-model-key', key: 'isolated-observation-310-key' });
  choice = { ...proposal, type: 'move', target: 'annex', content: '' };
  await post(step);
  assert.match(await reloadLog(), /未能開始.*前往保密別館.*請先打開通往出口的門/);
  assert.equal((await read()).world.characters[0].region, 'loft');

  const controlled = load('world').seedWorld();
  controlled.contextId = world.contextId;
  controlled.characters = controlled.characters.filter(character => character.id === 'owner');
  controlled.events = [{ id: 'legacy-start', time: controlled.minute, actor: 'owner', kind: 'activity-start', audience: ['owner'],
    text: '店主 開始進行已選活動，完整結果尚未發生。' },
  { id: 'linked-start', time: controlled.minute, actor: 'owner', kind: 'activity-start', audience: ['owner'],
    text: '店主 開始進行已選活動，完整結果尚未發生。' }];
  controlled.characters[0].habitEvidence = [{
    id: 'linked-start', eventId: 'linked-start', version: 1, time: controlled.minute, location: 'cafe',
    started: true, activityKey: 'rest:', activityLabel: '休息',
  }];
  store.install(controlled);
  assert.match(await reloadLog(), /開始進行已選活動.*活動內容未記錄/);
  assert.match(await log.innerText(), /開始.*休息/);
  await clickOperation('暫時接管店主', 'takeover');
  await clickOperation('單次指定下一行動', 'direct');
  await clickOperation('下一回合', 'advance');
  assert.match(await reloadLog(), /開始.*休息/);
  assert.match(await page.locator('.status-activity').innerText(), /正在.*休息/);
  await clickOperation('交還控制權', 'return-control');
  const stoppedLog = await reloadLog();
  assert.match(stoppedLog, /開始.*休息[\s\S]*已停止.*休息/);
  await clickOperation('暫時接管店主', 'takeover');
  await clickOperation('單次指定下一行動', 'direct');
  await clickOperation('下一回合', 'advance');
  for (let i = 0; i < 12; i++) await post({ ...step, mode: 'demo' });
  assert.match(await reloadLog(), /休息.*活動時段已結束/);
  assert.doesNotMatch(await log.innerText(), /休息.*已完成/);
  assert.match(await log.innerText(), /開始進行已選活動.*活動內容未記錄/);

  const cafe = structuredClone(controlled);
  cafe.events = [];
  store.install(cafe);
  await post({ operation: 'set-model-key', key: 'isolated-observation-310-key' });
  let beverage = '泡一杯普通茶';
  const beforeRoutine = modelRequests.length;
  setModelResponder(request => {
    const input = JSON.parse(request.messages[1].content);
    const reply = input.contractVersion === 'world-adjudication.v1' ? {
      status: 'accepted', effects: [], stages: [], check: null,
      routine: { family: 'cafe-service', version: 1, operation: 'tea', subject: '茶',
        timings: ['tea', 'coffee', 'food', 'drink', 'wash', 'return'].map(operation => ({ operation, minutes: 30 })) },
    } : fixtureDecision(input, { ...proposal, target: 'cafe', content: beverage, purpose: '飲用' });
    return Response.json({ usage: { prompt_tokens: 1, completion_tokens: 1 }, choices: [{ message: { content: JSON.stringify(reply) } }] });
  });
  await page.reload();
  await enableAi();
  await clickOperation('下一回合', 'advance');
  for (let i = 0; i < 6; i++) await post(step);
  assert.ok((await read()).world.objects.some(object => object.state.beverage === 'tea'));
  beverage = '準備一杯咖啡';
  await page.reload();
  await enableAi();
  await clickOperation('下一回合', 'advance');
  assert.match(await reloadLog(), /開始.*準備一杯咖啡/);
  assert.match(await page.locator('.status-activity').innerText(), /正在.*準備一杯咖啡/);
  assert.match(await page.locator('.pixel-locations').innerText(), /正在.*準備一杯咖啡/);
  assert.ok(!(await read()).world.objects.some(object => object.state.beverage === 'coffee'));
  assert.equal(modelRequests.length - beforeRoutine, 3, 'coffee reused the saved routine without adjudication');
  if (process.env.BROWSER_ARTIFACT_DIR) {
    await page.screenshot({ path: process.env.BROWSER_ARTIFACT_DIR + '/activity-routine-reuse.png', fullPage: true });
  }
  console.log('PASS #310 Chromium: activity display, phases, attempts, pause, control, replay and routine reuse; no paid models.');
} finally {
  await browser?.close();
  server.close();
}
