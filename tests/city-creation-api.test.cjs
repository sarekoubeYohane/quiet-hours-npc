/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const load = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, name + '.cjs'));
const route = load('route');
const people = load('character-templates-route');
const places = load('scene-templates-route');
const store = load('store');
const auth = load('auth');
const { blankCharacterTemplateFields } = load('character-templates');
const { seedWorld } = load('world');
const { fixtureDecision } = require('./pursuit-fixture.cjs');

const origin = 'https://test.invalid';
const send = (api, body) => api.POST(new Request(origin, {
  method: 'POST', headers: { origin, 'X-World-Time-Policy': 'round-v1' }, body: JSON.stringify(body),
}));
const id = () => Date.now() + ':' + crypto.randomUUID();
const response = async (result, status) => {
  const body = await result.json();
  assert.equal(result.status, status, JSON.stringify(body));
  return body;
};
const read = async () => response(await route.GET(), 200);

test('the saved city preview starts one isolated world with two new people and distinct copies of a scene', async () => {
  const legacy = seedWorld();
  legacy.aiUsage = {windowStartedAt:Date.now(),calls:2,inputTokens:60,outputTokens:15,unknownCalls:0,totalCalls:2,totalInputTokens:60,totalOutputTokens:15,totalUnknownCalls:0,savedDecisions:1};
  legacy.adjudication = { provider: 'openai', model: 'gpt-6.1-sol' };
  legacy.events[0].text = '舊世界獨有歷史';
  store.install(legacy);
  const original = await read();
  const fields = (name, background) => ({ ...blankCharacterTemplateFields(), name, personality: '安靜', appearance: '短髮', directions: '整理工作室', background });
  const first = (await response(await send(people, {id:crypto.randomUUID(),version:0,fields:fields('澄','河邊長大')}), 200)).template;
  const second = (await response(await send(people, {id:crypto.randomUUID(),version:0,fields:fields('杉','私人背景杉')}), 200)).template;
  const scene = (await response(await send(places, {
    name:'住宅', note:'小庭院', rooms:[{id:'front',name:'客廳'},{id:'bedroom',name:'臥室'}],
    connections:[{id:'door',name:'房門',rooms:['front','bedroom']}],
    objects:[{id:'lamp',name:'台燈',roomId:'front',state:{電源:'關閉'}}],
  }), 201)).template;
  const city = {
    places: [
      {id:'north', templateId:scene.id, version:1, name:'北屋'},
      {id:'south', templateId:scene.id, version:1, name:'南屋'},
    ],
    characters: [
      {templateId:first.id,version:1,placeId:'north',roomId:'front',homeId:'north'},
      {templateId:second.id,version:1,placeId:'north',roomId:'bedroom',homeId:'north'},
    ],
  };
  const scope = { operationScope:original.operationScope, worldContext:original.world.contextId, expectedVersion:original.version };
  const invalid = structuredClone(city);
  invalid.characters[1].roomId = '';
  const incomplete = await response(await send(route, { ...scope, operation:'preview-city', mode:'demo', city:invalid }), 200);
  assert.match(incomplete.preview.issues.join(' '), /杉.*起始/);
  await response(await send(route, { ...scope, operation:'start-city', operationId:id(), mode:'demo', city:invalid }), 400);
  const previewed = await response(await send(route, { ...scope, operation:'preview-city', mode:'demo', city }), 200);
  assert.deepEqual(previewed.preview.issues, []);
  assert.deepEqual(previewed.preview.places.map(place=>place.name), ['北屋','南屋']);
  assert.deepEqual(previewed.preview.characters.map(actor=>actor.name), ['澄','杉']);
  assert.equal((await read()).world.turn, original.world.turn);
  assert.equal((await read()).version, original.version);
  await response(await send(route, { ...scope, expectedVersion:99, operation:'start-city', operationId:id(), mode:'demo', city }), 409);

  const start = { ...scope, operation:'start-city', operationId:id(), mode:'demo', city };
  store.throwAfterNextSave();
  const started = await response(await send(route, start), 200);
  const replayed = await response(await send(route, start), 200);
  assert.equal(replayed.version, started.version);
  assert.equal(replayed.world.contextId, started.world.contextId);
  const { world } = await read();
  assert.deepEqual(world.characters.map(actor=>actor.name), ['澄','杉']);
  assert.equal(world.characters[0].personality, '安靜');
  assert.deepEqual(world.characters[0].profile, first.fields);
  assert.equal(world.characters[0].location, world.characters[1].location);
  assert.notEqual(world.characters[0].region, world.characters[1].region);
  assert.deepEqual(world.configuration.locations.map(place=>place.name), ['北屋','南屋']);
  assert.equal(new Set(world.objects.map(object=>object.id)).size, 2);
  assert.equal(world.aiUsage.totalCalls, 2);
  assert.doesNotMatch(JSON.stringify(world), /舊世界獨有歷史/);
  assert.match(store.archivedWorld(), /舊世界獨有歷史/);
  await response(await send(route, {operation:'set-model-key',mode:'openai',key:'controlled'}), 200);

  const transport = global.fetch;
  const inputs = [];
  global.fetch = async (_url, request) => {
    const input = JSON.parse(JSON.parse(request.body).messages[1].content);
    if (input.contractVersion === 'npc-decision.v3') inputs.push(input);
    const lamp = world.objects.find(object=>object.region===world.characters[0].region);
    const model = input.contractVersion === 'world-adjudication.v1'
      ? {status:'accepted',completionMinutes:15,effects:[{kind:'change-state',target:{type:'object',id:lamp.id},expectedRevision:1,version:1,changes:[{key:'電源',from:'關閉',value:'開啟'}],exposure:'public',access:'physical',reason:'按開關會點亮台燈'}],check:null,stages:[]}
      : fixtureDecision(input, input.self.name==='澄'
        ? {type:'propose',target:lamp.id,content:'按下台燈開關',purpose:'照明',timeIntent:{kind:'completion',maxMinutes:null}}
        : {type:'rest',target:'',content:''});
    return Response.json({usage:{prompt_tokens:10,completion_tokens:5},choices:[{message:{content:JSON.stringify(model)}}]});
  };
  try {
    await response(await send(route, {operation:'advance',worldContext:world.contextId,operationId:id(),mode:'openai',model:'gpt-6.1-sol',minutes:15}), 200);
  } finally {
    global.fetch = transport;
  }
  const after = (await read()).world;
  assert.equal(after.turn, 1);
  assert.deepEqual(after.characters.map(actor=>actor.name), ['澄','杉']);
  assert.deepEqual(after.objects.filter(object=>object.label==='台燈').map(object=>object.state.電源), ['開啟','關閉']);
  assert.doesNotMatch(JSON.stringify(inputs.find(input=>input.self.name==='澄')), /私人背景杉|南屋|舊世界獨有歷史/);
  assert.match(JSON.stringify(inputs.find(input=>input.self.name==='澄')), /河邊長大/);
  const savedTemplates = await response(await places.GET(), 200);
  assert.equal(savedTemplates.templates.find(template=>template.id===scene.id).objects[0].state.電源, '關閉');
  store.installForOwner('other-owner', seedWorld());
  auth.setUserId('other-owner');
  try {
    const other = await read();
    const forbidden = await response(await send(route,{operation:'preview-city',mode:'demo',expectedVersion:other.version,city}), 200);
    assert.match(forbidden.preview.issues.join(' '), /範本/);
    assert.equal(other.world.configuration, undefined);
  } finally {
    auth.setUserId('test-owner');
  }
});
test('the actual app previews and confirms editable opening associations with two custom people', async () => {
  const initial = seedWorld();
  initial.adjudication = {provider:'openai',model:'gpt-6.1-sol'};
  store.install(initial);
  await response(await send(route,{operation:'set-model-key',mode:'openai',key:'controlled-ui-association'}),200);
  for (const name of ['澄', '杉']) {
    await response(await send(people,{id:crypto.randomUUID(),version:0,fields:{...blankCharacterTemplateFields(),name,personality:'安靜',startLocation:name==='澄'?'自己的臥室':''}}), 200);
  }
  const { Window } = await import('happy-dom');
  const window = new Window({ url:origin });
  for (const name of [...Object.getOwnPropertyNames(window).filter(name=>/^(HTML|SVG|Event|CustomEvent|ShadowRoot)/.test(name)),
    'window','document','navigator','HTMLElement','Element','Node','DocumentFragment','MutationObserver','ResizeObserver','getComputedStyle','sessionStorage','requestAnimationFrame','cancelAnimationFrame']) {
    Object.defineProperty(globalThis,name,{configurable:true,value:typeof window[name]==='function'&&['getComputedStyle','requestAnimationFrame','cancelAnimationFrame'].includes(name)?window[name].bind(window):window[name]});
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const React = require('react');
  const { createRoot } = require('react-dom/client');
  const esbuild = require(require.resolve('esbuild',{paths:[require.resolve('vite')]}));
  const { outputFiles } = await esbuild.build({entryPoints:['components/world-app.tsx'],bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',alias:{'@':process.cwd()},external:['react','react/*','react-dom','react-dom/*']});
  const compiled = {exports:{}};
  new Function('require','module','exports',outputFiles[0].text)(require,compiled,compiled.exports);
  const WorldApp = compiled.exports.default;
  const nativeFetch = global.fetch;
  global.fetch = (url, options) => {
    if (String(url).startsWith('https://api.openai.com/')) {
      const input = JSON.parse(JSON.parse(options.body).messages[1].content);
      const actor = input.people.find(item=>item.name==='杉');
      const [north,south] = input.places;
      return Promise.resolve(Response.json({usage:{prompt_tokens:4,completion_tokens:2},choices:[{message:{content:JSON.stringify({
        updates:[
          {kind:'owned',from:actor.id,to:south.id,room:'',quote:'杉擁有河畔南屋'},
          {kind:'work',from:actor.id,to:north.id,room:'',quote:'杉在河畔北屋工作'},
        ],
      })}}]}));
    }
    const handler = {'/api/world':route,'/api/character-templates':people,'/api/scene-templates':places}[new URL(url,origin).pathname];
    assert.ok(handler, url);
    if (options?.method==='POST') return handler.POST(new Request(origin + url,{...options,headers:{...options.headers,origin}}));
    return handler.GET(new Request(origin + url, options));
  };
  const root = createRoot(document.body.appendChild(document.createElement('div')));
  const button = text => [...document.querySelectorAll('button')].find(item=>item.textContent.trim()===text);
  const click = async text => {
    assert.ok(button(text), text);
    await React.act(async()=>button(text).click());
  };
  const fill = async (label,value) => {
    const element = document.querySelector('[aria-label="'+label+'"]');
    assert.ok(element, label);
    const select = element instanceof window.HTMLSelectElement;
    const proto = select?window.HTMLSelectElement.prototype:element instanceof window.HTMLTextAreaElement?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;
    await React.act(async()=>{
      Object.getOwnPropertyDescriptor(proto,'value').set.call(element,value);
      element.dispatchEvent(new window.Event(select?'change':'input',{bubbles:true}));
    });
  };
  try {
    await React.act(async()=>root.render(React.createElement(WorldApp,{signInPath:'/login',displayName:'fixture',environment:{caption:'fixture',builtAtLabel:'unknown'}})));
    await click('建立城市');
    await fill('住宅數量','2');
    await fill('場所 1 名稱','河畔北屋');
    await fill('場所 2 名稱','河畔南屋');
    for(const name of ['澄','杉']){
      const checkbox=document.querySelector('[aria-label="選用'+name+'"]');
      assert.ok(checkbox);
      await React.act(async()=>checkbox.click());
    }
    const home=document.querySelector('[aria-label="澄的住處"]');
    await fill('澄的住處',home.options[1].value);
    const location=document.querySelector('[aria-label="杉的起始場所"]');
    await fill('杉的起始場所',location.options[1].value);
    const room=document.querySelector('[aria-label="杉的起始房間"]');
    await fill('杉的起始房間',room.options[2].value);
    await fill('自然語言開局關聯','杉擁有河畔南屋，杉在河畔北屋工作。');
    await click('用 AI 整理開局關聯');
    assert.equal(document.querySelector('[aria-label="杉擁有河畔南屋"]').checked,true);
    assert.equal(document.querySelector('[aria-label="杉工作於河畔北屋"]').checked,true);
    await click('新增背景人物');
    await fill('背景人物 1 姓名','老師');
    await click('新增人物關聯');
    const from = document.querySelector('[aria-label="關聯 1 人物"]');
    const to = document.querySelector('[aria-label="關聯 1 對象"]');
    await fill('關聯 1 人物',from.options[1].value);
    await fill('關聯 1 對象',to.options[to.options.length-1].value);
    await fill('關聯 1 描述','教我修鐘');
    await click('預覽城市');
    assert.equal(button('開始世界').disabled,false);
    assert.match(document.querySelector('[aria-label="城市預覽"]').textContent,/河畔北屋.*河畔南屋/);
    assert.equal((await read()).world.turn,0);
    await fill('場所 2 名稱','林間南屋');
    await fill('澄的住處',home.options[2].value);
    assert.equal(button('開始世界').disabled,true);
    await click('預覽城市');
    await click('開始世界');
    const { world } = await read();
    assert.deepEqual(world.characters.map(actor=>actor.name),['澄','杉']);
    assert.deepEqual(world.configuration.locations.map(place=>place.name),['河畔北屋','林間南屋']);
    assert.equal(world.characters[0].location,world.configuration.locations[1].id);
    assert.equal(world.characters[1].location,world.configuration.locations[0].id);
    assert.deepEqual(world.configuration.ownerships[world.characters[1].id],[world.configuration.locations[1].id]);
    assert.deepEqual(world.configuration.workplaces[world.characters[1].id],[world.configuration.locations[0].id]);
    assert.equal(world.configuration.backgroundPeople[0].name,'老師');
    assert.match(document.querySelector('[aria-label="世界像素地圖"]').textContent,/台燈.*關閉/);
  } finally {
    await React.act(async()=>root.unmount());
    global.fetch=nativeFetch;
    await window.happyDOM.close();
  }
});

test('opening associations separate home, ownership, work, an explicit start and private directed relationships', async () => {
  const initial = seedWorld();
  initial.adjudication = { provider: 'openai', model: 'gpt-6.1-sol' };
  store.install(initial);
  const fields = (name, startLocation, background = '') => ({...blankCharacterTemplateFields(), name, startLocation, background});
  const first = (await response(await send(people,{id:crypto.randomUUID(),version:0,fields:fields('澄','自己的臥室')}),200)).template;
  const second = (await response(await send(people,{id:crypto.randomUUID(),version:0,fields:fields('杉','工作的店裡','只有杉知道的背景')}),200)).template;
  const third = (await response(await send(people,{id:crypto.randomUUID(),version:0,fields:fields('樹','工作的店裡')}),200)).template;
  const shared = (await response(await places.GET(),200)).templates.find(place=>place.name==='住宅');
  const shop = (await response(await send(places, {
    name:'書店', note:'', rooms:[{id:'front',name:'前台'}], connections:[], objects:[],
  }),201)).template;
  const original = await read();
  const scope = { operationScope:original.operationScope, worldContext:original.world.contextId, expectedVersion:original.version };
  const city = {
    places: [
      {id:'north',templateId:shared.id,version:shared.version,name:'北屋'},
      {id:'south',templateId:shared.id,version:shared.version,name:'南屋'},
      {id:'shop',templateId:shop.id,version:shop.version,name:'隱密書店'},
      {id:'park',templateId:shop.id,version:shop.version,name:'公園'},
    ],
    characters:[
      {templateId:first.id,version:first.version,placeId:'',roomId:'',homeId:'north'},
      {templateId:second.id,version:second.version,placeId:'park',roomId:'front',homeId:'north',ownedPlaceIds:['shop'],workDescription:'以前在沒有選入的礦場工作。'},
      {templateId:third.id,version:third.version,placeId:'',roomId:'',workplaceIds:['shop']},
    ],
    backgroundPeople:[{id:'mentor',name:'老師'}],
    relationships:[
      {from:first.id,to:'mentor',targetType:'background',description:'教我修鐘'},
      {from:first.id,to:second.id,targetType:'character',description:'共享一段舊旅程'},
      {from:second.id,to:first.id,targetType:'character',description:'只有杉知道的交情'},
    ],
  };
  const preview = async draft => (await response(await send(route,{...scope,operation:'preview-city',mode:'demo',city:draft}),200)).preview;
  const invalid = structuredClone(city);
  delete invalid.characters[0].homeId;
  assert.match((await preview(invalid)).issues.join(' '),/澄.*起始/);
  await response(await send(route,{...scope,operation:'start-city',operationId:id(),mode:'demo',city:invalid}),400);
  const before = await preview(city);
  assert.deepEqual(before.issues,[]);
  assert.deepEqual(before.characters.map(actor=>[actor.place,actor.room]),[['北屋','臥室'],['公園','前台'],['隱密書店','前台']]);
  assert.equal(before.characters[1].home,'北屋');
  city.characters[0].homeId = 'south';
  const after = await preview(city);
  assert.deepEqual(after.characters.map(actor=>[actor.place,actor.room]),[['南屋','臥室'],['公園','前台'],['隱密書店','前台']]);
  assert.equal((await read()).world.minute, original.world.minute);

  await response(await send(route,{...scope,operation:'start-city',operationId:id(),mode:'demo',city}),200);
  const {world} = await read();
  const [cheng,shan,shu] = world.characters;
  assert.deepEqual(world.characters.map(actor=>actor.name),['澄','杉','樹']);
  assert.equal(world.configuration.residences[cheng.id], 'place:south');
  assert.equal(world.configuration.residences[shan.id], 'place:north');
  assert.equal(world.configuration.bedrooms[cheng.id], cheng.region);
  assert.deepEqual(world.configuration.ownerships,{[shan.id]:['place:shop']});
  assert.deepEqual(world.configuration.workplaces,{[shu.id]:['place:shop']});
  assert.deepEqual(world.configuration.backgroundPeople,[{id:'background:mentor',name:'老師'}]);
  assert.equal(cheng.relationships[shan.id],'共享一段舊旅程');
  assert.equal(cheng.relationships['background:mentor'],'教我修鐘');

  await response(await send(route,{operation:'set-model-key',mode:'openai',key:'controlled-association'}),200);
  const originalFetch = global.fetch;
  const inputs = [];
  global.fetch = async (_url, request) => {
    const input = JSON.parse(JSON.parse(request.body).messages[1].content);
    inputs.push(input);
    return Response.json({usage:{prompt_tokens:3,completion_tokens:2},choices:[{message:{content:JSON.stringify(fixtureDecision(input,{type:'rest',target:'',content:''}))}}]});
  };
  try {
    await response(await send(route,{operation:'advance',worldContext:world.contextId,operationId:id(),mode:'openai',model:'gpt-6.1-sol',minutes:15}),200);
  } finally {
    global.fetch = originalFetch;
  }
  assert.equal(inputs.length,3);
  const input = inputs.find(item=>item.self.name==='澄');
  assert.match(JSON.stringify(input),/共享一段舊旅程|教我修鐘/);
  assert.match(JSON.stringify(input),/老師/);
  assert.doesNotMatch(JSON.stringify(input),/只有杉知道|隱密書店/);
  const worker = inputs.find(item=>item.self.name==='樹');
  assert.doesNotMatch(JSON.stringify(worker),/老師|教我修鐘/);
  assert.deepEqual(worker.self.openingPlaces,{owned:[],work:[{id:'place:shop',name:'隱密書店'}]});
});

test('metered opening suggestions bind only evidenced associations to selected instances and leave explicit fields intact', async () => {
  const initial = seedWorld();
  initial.adjudication = { provider:'openai', model:'gpt-6.1-sol' };
  store.install(initial);
  const actor = (await response(await send(people,{id:crypto.randomUUID(),version:0,
    fields:{...blankCharacterTemplateFields(),name:'澄',startLocation:'自己的臥室',background:'目前在書店工作。'},
  }),200)).template;
  const shared = (await response(await places.GET(),200)).templates.find(place=>place.name==='住宅');
  const shop = (await response(await send(places,{name:'書店',note:'',rooms:[{id:'front',name:'前台'}],connections:[],objects:[]}),201)).template;
  await response(await send(route,{operation:'set-model-key',mode:'openai',key:'controlled-association'}),200);
  const before = await read();
  const city = {
    places:[
      {id:'home',templateId:shared.id,version:shared.version,name:'舊住宅'},
      {id:'a',templateId:shop.id,version:shop.version,name:'甲店'},
      {id:'b',templateId:shop.id,version:shop.version,name:'乙店'},
    ],
    characters:[{templateId:actor.id,version:actor.version,placeId:'',roomId:'',homeId:'home'}],
  };
  const operation = {
    operation:'suggest-opening-relationships', operationId:id(), mode:'demo', city,
    expectedVersion:before.version, operationScope:before.operationScope, worldContext:before.world.contextId,
    openingDescription:'澄認識老師，他教澄修鐘。',
  };
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async (_url, request) => {
    calls++;
    const input = JSON.parse(JSON.parse(request.body).messages[1].content);
    assert.match(JSON.stringify(input),/目前在書店工作/);
    assert.match(JSON.stringify(input),/甲店.*乙店/);
    assert.doesNotMatch(JSON.stringify(input),/Vera|Kris|Cass/);
    const binding = (kind, from, to, quote, room = '') => ({kind,from,to,room,quote});
    const candidate = [
      binding('home',actor.id,'a','目前在書店工作。'),
      binding('work',actor.id,'missing','目前在書店工作。'),
      binding('work',actor.id,'b','目前在書店工作。'),
      binding('owned',actor.id,'a','虛構她擁有甲店'),
      binding('background','','老師','澄認識老師，他教澄修鐘。'),
      binding('relationship',actor.id,'老師','澄認識老師，他教澄修鐘。'),
    ];
    return Response.json({usage:{prompt_tokens:10,completion_tokens:3},choices:[{message:{content:JSON.stringify({updates:candidate})}}]});
  };
  try {
    const generated = await response(await send(route,operation),200);
    const result = generated.suggestedOpening;
    assert.equal(result.characters[0].homeId,'home');
    assert.equal(result.characters[0].placeId,'');
    assert.deepEqual(result.characters[0].workplaceIds,['b']);
    assert.equal(result.characters[0].ownedPlaceIds,undefined);
    assert.deepEqual(result.places,city.places);
    assert.equal(result.backgroundPeople[0].name,'老師');
    assert.equal(result.relationships[0].to,result.backgroundPeople[0].id);
    assert.deepEqual((await response(await send(route,operation),200)).suggestedOpening,result);
    assert.equal(calls,1);
    const after = await read();
    assert.equal(after.world.aiUsage.totalCalls,1);
    assert.equal(after.world.aiUsage.totalInputTokens,10);
    assert.equal(after.world.minute,before.world.minute);
    assert.deepEqual(after.world.characters,before.world.characters);
    const preview = await response(await send(route,{...operation,operation:'preview-city',expectedVersion:after.version,city:result}),200);
    assert.deepEqual(preview.preview.issues,[]);
    assert.deepEqual(preview.preview.characters[0].workplaces,['乙店']);
  } finally {
    global.fetch = originalFetch;
  }
});
