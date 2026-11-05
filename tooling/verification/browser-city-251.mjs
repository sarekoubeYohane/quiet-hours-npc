import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {launchBrowser} from './browser-runtime.mjs';

process.env.FIXTURE_CITY_EDITORS = '1';
const {url, server, load, store, requests, setModelResponder} = await import('./browser-fixture.mjs');
const {fixtureDecision} = createRequire(import.meta.url)('../../tests/pursuit-fixture.cjs');
const complete = value => Response.json({
  usage:{prompt_tokens:10,completion_tokens:5}, choices:[{message:{content:JSON.stringify(value)}}],
});
const actorName = '孟澄';
const neighborName = '秋杉';
const northName = '北岸工作室';
const southName = '南岸讀書室';
const hidden = '隱藏的手稿';
const originalObject = '手作台燈';
const sharedObject = '採用的共享杯';
const phases = [];
const decisions = [];
const descriptions = [];
let phase = 'map';
let phoneId, targetPlace;
setModelResponder(request => {
  const input = JSON.parse(request.messages[1].content);
  if (input.blank) {
    assert.equal(input.filled.personality,'安靜');
    assert.equal(input.filled.abilities,'沒有');
    assert.ok(input.blank.includes('background'));
    assert.ok(!input.blank.includes('personality'));
    return complete({personality:'擅自擴寫',abilities:'擅自改寫',background:'河岸長大'});
  }
  if (input.stage === 'npc-city-description') {
    descriptions.push(input);
    const north = input.places.find(place => place.name === northName);
    assert.ok(north);
    assert.doesNotMatch(JSON.stringify(input),new RegExp(hidden));
    return complete({rooms:[{placeId:north.id,id:'own',name:'臥室',private:true}],
      objects:[{placeId:north.id,roomId:north.rooms[0].id,name:'共享杯',state:[]}]});
  }
  if (input.stage === 'heavenly-city-finalization') {
    const north = input.places.find(place => place.name === northName);
    const south = input.places.find(place => place.name === southName);
    targetPlace = 'place:'+south.id;
    return complete({spaces:[],walks:[{places:[north.id,south.id],minutes:35}]});
  }
  if (input.people && input.places && input.description) {
    const actor = input.people.find(person => person.name === neighborName);
    const north = input.places.find(place => place.name === northName);
    return complete({updates:[{kind:'work',from:actor.id,to:north.id,room:'',quote:neighborName+'在'+northName+'工作'}]});
  }
  if (input.contractVersion === 'world-adjudication.v1') {
    const object = input.objects.find(item => item.id === input.action.target);
    assert.equal(object.label, originalObject);
    assert.equal(input.action.content,'用自己的方法按亮台燈');
    return complete({status:'accepted',completionMinutes:15,stages:[],check:null,effects:[{
      kind:'change-state',target:{type:'object',id:object.id},expectedRevision:object.revision,version:1,
      changes:[{key:'電源',from:'關閉',value:'開啟'}],exposure:'public',access:'physical',reason:'按亮台燈',
    }]});
  }
  assert.equal(input.contractVersion,'npc-decision.v3');
  decisions.push({phase,input});
  assert.doesNotMatch(JSON.stringify(input),new RegExp(hidden+'|擅自擴寫|allowedActorIds'));
  let action = {type:'rest',target:'',content:''};
  if (input.self.name === actorName) {
    if (phase === 'map') {
      assert.doesNotMatch(JSON.stringify(input),new RegExp(southName));
      assert.ok(input.activityHints.some(hint => hint.kind === 'object'));
      phoneId = input.phones[0].objectId;
      action = {type:'phone',target:phoneId,content:JSON.stringify({collection:'map',operation:'read',offset:0})};
    } else if (phase === 'free') {
      assert.match(JSON.stringify(input),new RegExp(southName));
      const lamp = input.objects.find(item => item.label === originalObject);
      action = {type:'propose',target:lamp.id,content:'用自己的方法按亮台燈',purpose:'照明',timeIntent:{kind:'completion',maxMinutes:null}};
    } else if (phase === 'walk') {
      action = {type:'move',target:targetPlace,content:''};
    }
  } else if (phase === 'free') assert.doesNotMatch(JSON.stringify(input),new RegExp(southName));
  return complete(fixtureDecision(input,action));
});

let browser;
try {
  browser = await launchBrowser();
  const page = await browser.newPage({viewport:{width:1280,height:1000},reducedMotion:'reduce'});
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.route('**/*', request => new URL(request.request().url()).origin === url ? request.continue() : request.abort());
  const clock = await (await page.request.get(url+'/__fixture')).json();
  await page.addInitScript(now => { Date.now = () => now; },clock.now);
  page.setDefaultTimeout(15000);
  const button = name => page.getByRole('button',{name,exact:true});
  const click = name => button(name).click();
  const field = name => page.getByLabel(name,{exact:true});
  const fill = (name,value) => field(name).fill(value);
  const select = (name,label) => field(name).selectOption({label});
  const read = async (path = '/api/world') => {
    const result = await page.request.get(url+path);
    assert.equal(result.status(),200,await result.text());
    return result.json();
  };
  const send = async (data,status = 200) => {
    const result = await page.request.post(url+'/api/world',{headers:{'X-World-Time-Policy':'round-v1'},data});
    assert.equal(result.status(),status,await result.text());
    return result.json();
  };
  const submit = async (name,path,status,operation) => {
    const pending = page.waitForResponse(response => response.url() === url+path &&
      response.request().method() === 'POST' && (!operation || response.request().postDataJSON().operation === operation));
    await click(name);
    const response = await pending;
    assert.equal(response.status(),status,await response.text());
    return response.json();
  };
  const id = () => clock.now+':'+crypto.randomUUID();
  const setup = await read();
  const base = {mode:'demo',worldContext:setup.world.contextId,operationScope:setup.operationScope};
  const model = 'gpt-6.1-sol';
  await send({operation:'set-model-key',mode:'openai',key:'local-controlled-251'});
  await send({...base,operation:'set-adjudication',operationId:id(),adjudication:{provider:'openai',model}});
  await send({...base,operation:'set-budget',operationId:id(),limits:{calls:40,tokens:10000}});

  await page.goto(url+'/character-templates');
  for (const name of [actorName,neighborName]) {
    await click('新建人物');
    await page.locator('[name=name]').fill(name);
    await page.locator('[name=personality]').fill('安靜');
    await page.locator('[name=abilities]').fill('沒有');
    if (name === actorName) {
      await page.locator('[name=characterDescription]').fill('保留已填欄位，只補背景');
      await submit('用 AI 生成空白欄位','/api/world',200,'generate-character-template');
      await page.waitForFunction(() => document.querySelector('[name=background]').value === '河岸長大');
      assert.equal(await page.locator('[name=personality]').inputValue(),'安靜');
      assert.equal(await page.locator('[name=abilities]').inputValue(),'沒有');
    }
    await submit('保存人物範本','/api/character-templates',200);
  }
  const people = await read('/api/character-templates');
  assert.deepEqual(people.templates.map(item => item.fields.name).sort(),[actorName,neighborName].sort());
  phases.push('人物編輯、生成、保存重讀');

  await page.goto(url+'/scene-templates');
  await click('新增場景範本');
  await fill('場所名稱','岸邊屋');
  await fill('房間 1 名稱','客廳');
  await click('新增文字物件');
  await fill('物件 1 名稱',originalObject);
  await click('新增狀態');
  await fill('物件 1 狀態 1 名稱','電源');
  await fill('物件 1 狀態 1 值','關閉');
  await click('新增文字物件');
  await fill('物件 2 名稱',hidden);
  await page.getByRole('checkbox',{name:'開局不讓人物知道此物件'}).nth(1).check();
  await submit('保存場景範本','/api/scene-templates',201);
  const templates = await read('/api/scene-templates');
  const template = templates.templates.find(item => item.name === '岸邊屋');
  assert.equal(template.objects[0].state.電源,'關閉');
  phases.push('場景編輯、隱藏物件、保存重讀');

  await page.goto(url);
  await click('建立城市');
  await select('岸邊屋數量','2');
  await fill('場所 1 名稱',northName);
  await fill('場所 2 名稱',southName);
  for (const name of [actorName,neighborName]) {
    await field('選用'+name).check();
    await select(name+'的住處',northName);
    await select(name+'的起始場所',northName);
    await select(name+'的起始房間','客廳');
  }
  await field(neighborName+'擁有'+northName).check();
  await fill('自然語言開局關聯',neighborName+'在'+northName+'工作');
  await submit('用 AI 整理開局關聯','/api/world',200,'suggest-opening-relationships');
  await page.waitForFunction(label => document.querySelector('[aria-label="'+label+'"]').checked,neighborName+'工作於'+northName);
  await select('授權人物',actorName);
  await select('授權場所',southName);
  await click('新增個別授權');
  const before = await read();
  await submit('初始化場所','/api/world',200,'initialize-city');
  await field(northName+'物件 1 名稱').waitFor();
  await fill(northName+'物件 1 名稱',sharedObject);
  await submit('預覽城市','/api/world',200,'preview-city');
  assert.match(await page.getByLabel('有效進出權限').innerText(),new RegExp(southName+'.*'+actorName));
  assert.equal((await read()).world.minute,before.world.minute);
  assert.equal((await read()).world.turn,before.world.turn);
  assert.equal(descriptions.length,2);
  phases.push('同住、獨立角色關聯、授權、初始化定稿與修改');

  store.throwBeforeNextSave();
  const rejected = page.waitForResponse(response => response.url() === url+'/api/world' &&
    response.request().method() === 'POST' && response.request().postDataJSON().operation === 'start-city');
  await click('開始世界');
  assert.notEqual((await rejected).status(),200);
  const failedStart = requests.findLast(item => item.operation === 'start-city');
  assert.equal((await read()).world.configuration,undefined);
  const current = await read();
  await send({...failedStart,operationId:id(),expectedVersion:current.version+1},409);
  store.throwAfterNextSave();
  const started = await send({...failedStart,operationId:id(),expectedVersion:current.version});
  const replay = await send(requests.findLast(item => item.operation === 'start-city'));
  assert.equal(replay.version,started.version);
  const saved = await read();
  assert.deepEqual(saved.world.characters.map(item => item.name),[actorName,neighborName]);
  assert.deepEqual(saved.world.configuration.locations.map(item => item.name),[northName,southName]);
  assert.equal(saved.world.objects.filter(item => item.label === sharedObject).length,1);
  assert.equal(saved.world.objects.filter(item => item.label === originalObject).length,2);
  assert.equal(saved.world.aiUsage.totalCalls,5);
  assert.equal(saved.world.turn,0);
  assert.equal(saved.world.characters[0].profile.personality,'安靜');
  assert.equal(saved.world.characters[0].profile.background,'河岸長大');
  const auth = load('auth');
  auth.setUserId('isolated-251');
  store.installForOwner('isolated-251',load('world').seedWorld());
  try {
    assert.equal((await read()).world.configuration,undefined);
    assert.deepEqual((await read('/api/character-templates')).templates,[]);
    assert.ok(!(await read('/api/scene-templates')).templates.some(item => item.id === template.id));
  } finally { auth.setUserId('test-owner'); }
  phases.push('開始操作保存前後故障、重送、衝突、用量與帳號隔離');

  await page.reload();
  const map = page.getByRole('region',{name:'世界像素地圖'});
  await map.waitFor();
  const advance = async () => {
    const response = await page.request.post(url+'/__fixture',{data:{advanceMs:1000}});
    clock.now = (await response.json()).now;
    return send({operation:'advance',operationId:id(),worldContext:saved.world.contextId,mode:'openai',model,minutes:15});
  };
  await advance();
  const readMap = (await read()).world.phones.devices.find(device => device.objectId === phoneId).mapReads;
  assert.ok(readMap.some(entry => entry.roads.some(road => road.name === southName)));
  phase = 'free';
  await advance();
  let active = (await read()).world;
  assert.deepEqual(active.objects.filter(item => item.label === originalObject).map(item => item.state.電源),['開啟','關閉']);
  assert.equal((await read('/api/scene-templates')).templates.find(item => item.id === template.id).objects[0].state.電源,'關閉');
  phase = 'walk';
  await advance();
  phase = 'arrival';
  await page.reload();
  await map.waitFor();
  await map.getByText(new RegExp('前往.*'+southName)).waitFor();
  await select('觀看場所',southName);
  assert.doesNotMatch(await map.getByLabel('目前觀看場所').innerText(),new RegExp(actorName));
  await advance();
  await advance();
  active = (await read()).world;
  const arrived = active.characters.find(item => item.name === actorName);
  assert.equal(arrived.location,targetPlace);
  assert.equal(active.objects.find(item => item.id === phoneId).region,arrived.region);
  assert.deepEqual(active.characters.map(item => item.name),[actorName,neighborName]);
  await page.reload();
  await select('觀看場所',southName);
  assert.match(await map.getByLabel('目前觀看場所').innerText(),new RegExp(actorName));
  assert.ok(decisions.some(item => item.phase === 'free' && item.input.self.name === actorName));
  assert.deepEqual(errors,[]);
  phases.push('真正地圖讀取、可知活動提示與自由方法、途中與抵達、持有物重讀');
  console.log(JSON.stringify({phases,decisionRequests:decisions.length,initializationDescriptions:descriptions.length,
    savedRoster:active.characters.map(item => item.name),totalCalls:active.aiUsage.totalCalls},null,2));
} finally {
  await browser?.close();
  server.close();
}
