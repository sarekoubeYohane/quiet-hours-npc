import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { url, server, store, load, requests, setModelResponder } from './browser-fixture.mjs';
import { launchBrowser, outputPath } from './browser-runtime.mjs';

// Only external NPC/adjudication replies and clock are fixtures. The rendered
// WorldApp, route handlers, activity lifecycle, effects and SQLite are real.
process.env.BROWSER_ARTIFACT_DIR ||= resolve('docs/verification/assets/natural-changes');
await mkdir(process.env.BROWSER_ARTIFACT_DIR, { recursive: true });
const world = load('world').seedWorld();
world.minute = 0;
world.characters.forEach(character => { character.control = { mode: 'taken-over' }; });
world.characters.find(character => character.id === 'owner').control = { mode: 'autonomous' };
world.adjudication = { provider: 'openai', model: 'fixture-natural' };
world.playerBudget = { calls: 100, tokens: 1000000 };
world.objects = [{ id: 'natural-cup', source: 'known-cup', label: '自然變化測試杯', region: 'cafe-front', holder: 'owner', owner: 'owner', revision: 1, state: { temperature: 'warm' }, stateTransitions: { temperature: ['warm', 'hot', 'cool'] }, lifecycle: 'active', kind: 'utensil', knownTo: ['owner'], allowedTo: ['owner'] }];
store.install(world);
const rest = { type: 'rest', target: '', content: '安靜休息一會', purpose: '休息', mood: '平靜', durationMinutes: 15, timeIntent: { kind: 'open-ended', maxMinutes: null }, intents: [] };
let decision = { ...rest, type: 'propose', target: 'natural-cup', content: '觀察這只杯子並確認外在溫度的變化', purpose: '處理眼前物件', timeIntent: { kind: 'completion', maxMinutes: null } };
let candidate = { status: 'accepted', completionMinutes: 15, effects: [
  { kind: 'state', objectId: 'natural-cup', expectedRevision: 1, key: 'temperature', value: 'hot' },
  { kind: 'schedule-natural', version: 1, delayMinutes: 15, conditions: [{ kind: 'state-condition', version: 1, target: { type: 'object', id: 'natural-cup' }, state: [{ key: 'temperature', value: 'hot' }] }], effects: [{ target: { type: 'object', id: 'natural-cup' }, exposure: 'public', changes: [{ key: 'temperature', from: 'hot', value: 'cool' }] }], reason: '熱杯在室內靜置後逐漸冷卻' },
], stages: [], branches: null, check: null, routine: null };
let npc = 0, adjudication = 0;
setModelResponder(request => {
  const input = JSON.parse(request.messages[1].content);
  assert.doesNotMatch(JSON.stringify(input), /operationEvidence|fixture-key/);
  let value;
  if (input.contractVersion === 'world-adjudication.v1') { adjudication++; value = candidate; }
  else { npc++; value = decision; }
  return Response.json({ usage: { prompt_tokens: 30, completion_tokens: 10 }, choices: [{ message: { content: JSON.stringify(value) } }] });
});
let browser;
const snapshots = [];
try {
  browser = await launchBrowser();
  const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: 1440, height: 1050 } });
  await page.addInitScript(instant => { Date.now = () => instant; }, Date.parse('2026-10-15T16:00:00Z'));
  const nav = name => page.getByRole('navigation', { name: '觀察室分頁' }).getByRole('button', { name, exact: true }).click();
  const read = async id => {
    const result = await page.request.get(url + '/api/world' + (id ? '?operationId=' + encodeURIComponent(id) : ''));
    assert.equal(result.status(), 200);
    return result.json();
  };
  const advance = async name => {
    const clock = await (await page.request.post(url + '/__fixture', { data: { advanceMs: 1000 } })).json();
    await page.evaluate(now => { Date.now = () => now; }, clock.now);
    await nav('觀察');
    const pending = page.waitForResponse(result => result.url().endsWith('/api/world') && result.request().method() === 'POST' && JSON.parse(result.request().postData()).operation === 'advance');
    await page.getByRole('button', { name: '下一回合', exact: true }).click();
    const result = await pending;
    assert.equal(result.status(), 200, (await result.json()).error);
    await page.waitForFunction(() => document.querySelector('.advance-button')?.textContent.trim() === '下一回合');
    const request = requests.filter(value => value.operation === 'advance').at(-1);
    const saved = await read(request.operationId);
    assert.deepEqual(store.snapshot().naturalChanges, saved.world.naturalChanges);
    snapshots.push({ name, world: { minute: saved.world.minute, objects: saved.world.objects, naturalChanges: saved.world.naturalChanges }, evidence: saved.operation.evidence });
    return saved;
  };
  await page.request.post(url + '/api/world', { data: { operation: 'set-model-key', mode: 'openai', key: 'fixture-key' } });
  await page.goto(url);
  await nav('設定');
  await page.getByRole('combobox', { name: '決策方式', exact: true }).click();
  await page.getByRole('option', { name: 'OpenAI 直連', exact: true }).click();
  let saved = await advance('hot-state-and-pending-cooling');
  assert.equal(saved.world.objects[0].state.temperature, 'hot');
  assert.equal(saved.world.naturalChanges[0].dueAt, 30);
  await nav('分析');
  const status = page.getByRole('region', { name: '日常規則與成果', exact: true });
  await status.waitFor();
  assert.match(await status.innerText(), /temperature.*hot/);
  assert.match(await status.innerText(), /自然變化.*待執行/s);
  await status.screenshot({ path: outputPath('pending-cooling.png') });
  await page.reload();
  await nav('設定');
  await page.getByRole('combobox', { name: '決策方式', exact: true }).click();
  await page.getByRole('option', { name: 'OpenAI 直連', exact: true }).click();
  decision = rest;
  saved = await advance('cooling-executed-without-adjudication');
  assert.equal(saved.world.objects[0].state.temperature, 'cool');
  assert.equal(saved.world.naturalChanges[0].status, 'executed');
  assert.deepEqual({ npc, adjudication }, { npc: 2, adjudication: 1 });
  await nav('分析');
  assert.match(await status.innerText(), /temperature.*cool/);
  assert.match(await status.innerText(), /自然變化.*已執行/s);
  await status.screenshot({ path: outputPath('cooling-executed.png') });
  const before = { version: saved.version, world: saved.world, counts: { npc, adjudication } };
  const replay = saved.operation.evidence.replay;
  const evidencePanel=page.getByRole('region',{name:'操作驗收證據',exact:true});
  const replayed=page.waitForResponse(result=>result.url().endsWith('/api/world')&&result.request().method()==='POST'&&JSON.parse(result.request().postData()).operationId===replay.operationId);
  await evidencePanel.getByRole('button',{name:'重送同一操作（不新增回合）',exact:true}).click();
  assert.equal((await replayed).status(),200);
  const after = await read(replay.operationId);
  assert.equal(after.version, before.version);
  assert.deepEqual(after.world, before.world);
  assert.deepEqual({ npc, adjudication }, before.counts);
  const accepted=effects=>({status:'accepted',completionMinutes:15,effects,stages:[],branches:null,check:null,routine:null});
  const environment={type:'environment',id:'cafe-front'};
  decision={...rest,type:'propose',target:'cafe-front',content:'處理桌面上的水滴並等待乾燥',purpose:'處理眼前狀況',timeIntent:{kind:'completion',maxMinutes:null}};
  candidate=accepted([
    {kind:'change-state',version:1,access:'physical',target:environment,expectedRevision:0,changes:[{key:'table.surface',from:null,value:'濕潤'}],exposure:'public',reason:'形成可見水滴'},
    {kind:'schedule-natural',version:1,delayMinutes:15,conditions:[{kind:'state-condition',version:1,target:environment,state:[{key:'table.surface',value:'濕潤'}]}],effects:[{target:environment,changes:[{key:'table.surface',from:'濕潤',value:'已乾燥'}],exposure:'public'}],reason:'已確認的水滴自然乾燥'},
  ]);
  saved=await advance('environment-wet-and-pending-drying');
  assert.equal(saved.world.scene.external['cafe-front'].state['table.surface'],'濕潤');
  decision=rest;
  saved=await advance('environment-dried-on-world-time');
  assert.equal(saved.world.scene.external['cafe-front'].state['table.surface'],'已乾燥');
  await nav('分析');
  assert.match(await status.innerText(),/table.surface.*已乾燥/);
  await status.screenshot({path:outputPath('environment-dried.png')});
  const target={type:'object',id:'natural-cup'};
  const state=(revision,from,value)=>({kind:'change-state',version:1,access:'authorized',target,expectedRevision:revision,changes:[{key:'temperature',from,value}],exposure:'public',reason:'調整杯子溫度'});
  decision={...rest,type:'propose',target:'natural-cup',content:'處理杯溫並確認後續冷卻',purpose:'處理眼前物件',timeIntent:{kind:'completion',maxMinutes:null}};
  candidate=accepted([state(3,'cool','hot'),{kind:'schedule-natural',version:1,delayMinutes:45,conditions:[{kind:'state-condition',version:1,target,state:[{key:'temperature',value:'hot'}]}],effects:[{target,changes:[{key:'temperature',from:'hot',value:'cool'}],exposure:'public'}],reason:'應在必要條件中斷時失效'}]);
  saved=await advance('confirmed-cooling-before-condition-break');
  candidate=accepted([state(4,'hot','cool')]);
  saved=await advance('condition-broken-permanently');
  assert.equal(saved.world.naturalChanges.at(-1).status,'invalidated');
  candidate=accepted([state(5,'cool','hot')]);
  saved=await advance('condition-restored-without-revival');
  decision=rest;
  saved=await advance('original-due-time-does-not-revive-cooling');
  assert.equal(saved.world.objects[0].state.temperature,'hot');
  assert.equal(saved.world.naturalChanges.at(-1).status,'invalidated');
  await nav('分析');
  assert.match(await status.innerText(),/條件已失效/);
  assert.match(await status.innerText(),/temperature.*hot/);
  await status.screenshot({path:outputPath('condition-invalidated.png')});
  assert.deepEqual({npc,adjudication},{npc:8,adjudication:5});
  await writeFile(outputPath('browser-evidence.json'), JSON.stringify({ fixture: true, paidModelCalls: 0, counts: { npc, adjudication }, snapshots }, null, 2));
  console.log(JSON.stringify({ passed: true, fixture: true, counts: { npc, adjudication }, snapshots: snapshots.length }));
} finally { await browser?.close(); server.close(); }
