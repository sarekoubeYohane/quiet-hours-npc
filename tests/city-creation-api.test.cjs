/* eslint-disable @typescript-eslint/no-require-imports */
const { originalWorldInput, originalAccountInput } = require('./original-scope-fixture.cjs');

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

const {installHistoricalCity}=require('./historical-city-fixture.cjs');
const origin = 'https://test.invalid';
const send = (api, body) => api.POST(new Request(origin, {
  method: 'POST', headers: { origin, 'X-World-Time-Policy': 'round-v1' }, body: JSON.stringify(api === route ? originalWorldInput(api === places ? {id:crypto.randomUUID(),version:0,...body} : body, 'test-owner') : originalAccountInput(api === places ? {id:crypto.randomUUID(),version:0,...body} : body, 'account-operations:test-owner')),
}));
const id = () => Date.now() + ':' + crypto.randomUUID();
const response = async (result, status) => {
  const body = await result.json();
  assert.equal(result.status, status, JSON.stringify(body));
  return body;
};
const read = async () => response(await route.GET(), 200);

test('a historical manual city retains closed and blocked connections and does not invent an instant route', async () => {
  const initial = seedWorld();
  initial.adjudication = {provider:'openai',model:'gpt-6.1-sol'};
  store.install(initial);
  const original = await read();
  const person = (await response(await send(people,{id:crypto.randomUUID(),version:0,fields:{...blankCharacterTemplateFields(),name:'青石'}}),200)).template;
  const scene = (await response(await send(places,{id:crypto.randomUUID(),version:0,name:'三室屋',note:'',
    rooms:[{id:'front',name:'客廳'},{id:'private',name:'私室'},{id:'sealed',name:'封閉房間'}],
    connections:[
      {id:'private-door',name:'私人門',rooms:['front','private'],state:'closed'},
      {id:'sealed-door',name:'封閉通道',rooms:['front','sealed'],state:'blocked'},
    ],objects:[],
  }),201)).template;
  const city = {places:['one','two'].map(placeId=>({id:placeId,templateId:scene.id,version:1,name:placeId})),
    characters:[{templateId:person.id,version:1,placeId:'one',roomId:'front'}]};
  const scope = {operationScope:original.operationScope,worldContext:original.world.contextId,expectedVersion:original.version};
  const preview = (await response(await send(route,{...scope,operation:'preview-city',mode:'demo',city}),200)).preview;
  assert.deepEqual(preview.places[0].connections.map(connection=>connection.state),['closed','blocked']);
  const {world} = await installHistoricalCity(city);
  const stored = (await read()).world;
  assert.deepEqual(stored.configuration.walks,[]);
  assert.equal(stored.scene.doors['place:one:door:private-door'],'closed');
  assert.deepEqual(stored.configuration.blockedRoomConnections[0],['place:one:room:front','place:one:room:sealed']);
  assert.equal(stored.scene.doors['place:one:door:sealed-door'],undefined);
  await response(await send(route,{operation:'set-model-key',mode:'openai',key:'controlled'}),200);
  const transport = global.fetch;
  let attempts = 0;
  global.fetch = async (_url, request) => {
    const input = JSON.parse(JSON.parse(request.body).messages[1].content);
    attempts++;
    return Response.json({usage:{prompt_tokens:10,completion_tokens:5},choices:[{message:{content:JSON.stringify(
      fixtureDecision(input,{type:'move',target:'place:two',content:''}),
    )}}]});
  };
  try {
    await response(await send(route,{operation:'advance',operationId:id(),worldContext:world.contextId,mode:'openai',model:'gpt-6.1-sol',minutes:5,timeContract:'five-minute-v1'}),200);
    assert.equal(attempts,1);
    assert.equal((await read()).world.characters[0].location,'place:one');
  } finally { global.fetch = transport; }
});

test('historical city setup retains capacity for the phones needed by the first round', async () => {
  store.install(seedWorld());
  const original = await read();
  const templates = [];
  for (const name of ['丁楊','翁柳']) {
    templates.push((await response(await send(people,{id:crypto.randomUUID(),version:0,fields:{...blankCharacterTemplateFields(),name}}),200)).template);
  }
  const createScene = async count => (await response(await send(places,{id:crypto.randomUUID(),version:0,name:'器材室',note:'',
    rooms:[{id:'front',name:'前室'}],connections:[],objects:Array.from({length:count},(_,index)=>({
      id:'item-'+index,name:'器材 '+index,roomId:'front',state:{},
    })),
  }),201)).template;
  const room = await createScene(73);
  const smaller = await createScene(72);
  const city = {places:Array.from({length:7},(_,index)=>({id:'hall-'+index,templateId:room.id,version:1,name:'場所 '+index})),
    characters:templates.map((person,index)=>({templateId:person.id,version:1,placeId:'hall-'+index,roomId:'front'}))};
  const scope = {operationScope:original.operationScope,worldContext:original.world.contextId,expectedVersion:original.version};
  const preview = async () => (await response(await send(route,{...scope,operation:'preview-city',mode:'demo',city}),200)).preview;
  assert.match((await preview()).issues.join(' '),/容量/);
  await response(await send(route,{...scope,operation:'start-city',operationId:id(),mode:'demo',city}),409);
  city.places.at(-1).templateId = smaller.id;
  assert.deepEqual((await preview()).issues,[]);
  const {world} = await installHistoricalCity(city);
  const round = await response(await send(route,{operation:'advance',operationId:id(),worldContext:world.contextId,mode:'demo',minutes:5,timeContract:'five-minute-v1'}),200);
  assert.equal(round.world.turn,1);
  assert.equal(round.world.objects.length,512);
  assert.equal(round.world.objects.filter(object=>object.kind==='phone').length,2);
});

test('in a historical city, opening an unidentified door keeps its private name out of the actor and witness decision payloads', async () => {
  const initial = seedWorld();
  initial.adjudication = {provider:'openai',model:'gpt-6.1-sol'};
  store.install(initial);
  await read();
  const templates = [];
  for (const name of ['岑一','岑二','岑三']) {
    templates.push((await response(await send(people,{id:crypto.randomUUID(),version:0,fields:{...blankCharacterTemplateFields(),name}}),200)).template);
  }
  const scene = (await response(await send(places,{id:crypto.randomUUID(),version:0,name:'會客處',note:'',
    rooms:[{id:'front',name:'客廳'},{id:'private',name:'受限密室'}],
    access:{building:'public',rooms:{private:'private'}},
    connections:[{id:'door',name:'密室的專名門',rooms:['front','private'],state:'closed'}],objects:[],
  }),201)).template;
  const city = {places:[{id:'house',templateId:scene.id,version:1,name:'會客處'}],
    characters:templates.map((person,index)=>({templateId:person.id,version:1,placeId:'house',roomId:index===2?'private':'front'}))};
  const {world} = await installHistoricalCity(city);
  await response(await send(route,{operation:'set-model-key',mode:'openai',key:'controlled'}),200);
  const transport = global.fetch;
  let opening = true;
  const prompts = [];
  global.fetch = async (_url, request) => {
    const input = JSON.parse(JSON.parse(request.body).messages[1].content);
    prompts.push(input);
    const action = opening && input.self.name==='岑一'
      ? {type:'door',target:'place:house:door:door',content:'open'}
      : {type:'rest',target:'',content:''};
    return Response.json({usage:{prompt_tokens:10,completion_tokens:5},choices:[{message:{content:JSON.stringify(fixtureDecision(input,action))}}]});
  };
  try {
    const next = () => send(route,{operation:'advance',operationId:id(),worldContext:world.contextId,mode:'openai',model:'gpt-6.1-sol',minutes:5,timeContract:'five-minute-v1'});
    await response(await next(),200);
    opening = false;
    for(let step=0;step<3;step++)await response(await next(),200);
    const stored = (await read()).world;
    assert.match(stored.events.find(event=>event.kind==='door').text,/密室的專名門/);
    for (const name of ['岑一','岑二']) {
      const decision = prompts.findLast(input=>input.self.name===name);
      assert.doesNotMatch(JSON.stringify(decision),/密室的專名門|受限密室/);
      assert.match(JSON.stringify(decision),/一扇門/);
    }
  } finally { global.fetch = transport; }
});

test('retired start-city preserves the old world; a historical city fixture retains life with two new people and distinct copies of a scene', async () => {
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
  await response(await send(route, { ...scope, operation:'start-city', operationId:id(), mode:'demo', city:invalid }), 409);
  const previewed = await response(await send(route, { ...scope, operation:'preview-city', mode:'demo', city }), 200);
  assert.deepEqual(previewed.preview.issues, []);
  assert.deepEqual(previewed.preview.places.map(place=>place.name), ['北屋','南屋']);
  assert.deepEqual(previewed.preview.characters.map(actor=>actor.name), ['澄','杉']);
  assert.equal((await read()).world.turn, original.world.turn);
  assert.equal((await read()).version, original.version);
  await response(await send(route, { ...scope, expectedVersion:99, operation:'start-city', operationId:id(), mode:'demo', city }), 409);

  const start = { ...scope, operation:'start-city', operationId:id(), mode:'demo', city };
  await response(await send(route,start),409);
  // The remaining assertions exercise an already saved pre-#281 city, not a new opening.
  await installHistoricalCity(city);
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
  assert.equal(store.archivedWorld(),undefined); // No new overwrite/backup operation ran.
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
    for(let step=0;step<4;step++)await response(await send(route, {operation:'advance',worldContext:world.contextId,operationId:id(),mode:'openai',model:'gpt-6.1-sol',minutes:5,timeContract:'five-minute-v1'}), 200);
  } finally {
    global.fetch = transport;
  }
  const after = (await read()).world;
  assert.equal(after.turn, 4);
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
    const forbidden = await response(await send(route,{operationScope:other.operationScope,operation:'preview-city',mode:'demo',expectedVersion:other.version,city}), 200);
    assert.match(forbidden.preview.issues.join(' '), /範本/);
    assert.equal(other.world.configuration, undefined);
  } finally {
    auth.setUserId('test-owner');
  }
});
test('observation no longer exposes the retired in-place city editor', async () => {
  store.install(seedWorld());
  const { Window } = await import('happy-dom');
  const window = new Window({ url:origin });
  for (const name of [...Object.getOwnPropertyNames(window).filter(name=>/^(HTML|SVG|Event|CustomEvent|ShadowRoot)/.test(name)),
    'window','document','navigator','self','HTMLElement','Element','Node','DocumentFragment','MutationObserver','ResizeObserver','getComputedStyle','sessionStorage','requestAnimationFrame','cancelAnimationFrame']) {
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
  const originalFetch=global.fetch;global.fetch=()=>route.GET();const root=createRoot(document.body.appendChild(document.createElement('div')));
  try{await React.act(async()=>root.render(React.createElement(WorldApp,{signInPath:'/login',displayName:'fixture',saveId:'legacy',accountScope:'test-owner',environment:{caption:'fixture',builtAtLabel:'unknown'}})));assert.equal([...document.querySelectorAll('button')].some(button=>button.textContent==='建立城市'),false);assert.ok([...document.querySelectorAll('a')].some(link=>link.getAttribute('href')==='/new'));}finally{await React.act(async()=>root.unmount());global.fetch=originalFetch;await window.happyDOM.close();}
});

test('historical opening associations separate home, ownership, work, an explicit start and private directed relationships', async () => {
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
  await response(await send(route,{...scope,operation:'start-city',operationId:id(),mode:'demo',city:invalid}),409);
  const before = await preview(city);
  assert.deepEqual(before.issues,[]);
  assert.deepEqual(before.characters.map(actor=>[actor.place,actor.room]),[['北屋','臥室'],['公園','前台'],['隱密書店','前台']]);
  assert.equal(before.characters[1].home,'北屋');
  city.characters[0].homeId = 'south';
  const after = await preview(city);
  assert.deepEqual(after.characters.map(actor=>[actor.place,actor.room]),[['南屋','臥室'],['公園','前台'],['隱密書店','前台']]);
  assert.equal((await read()).world.minute, original.world.minute);

  await installHistoricalCity(city);
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
    await response(await send(route,{operation:'advance',worldContext:world.contextId,operationId:id(),mode:'openai',model:'gpt-6.1-sol',minutes:5,timeContract:'five-minute-v1'}),200);
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

test('legacy city initialization scopes NPC drafts and preserves a historical finalized arrangement without a round', async () => {
  const initial = seedWorld();
  initial.adjudication = {provider:'openai',model:'gpt-6.1-sol'};
  store.install(initial);
  const fields = (name, background) => ({...blankCharacterTemplateFields(),name,background,startLocation:'自己的臥室'});
  const first = (await response(await send(people,{id:crypto.randomUUID(),version:0,fields:fields('澄','澄的個人背景')}),200)).template;
  const second = (await response(await send(people,{id:crypto.randomUUID(),version:0,fields:fields('杉','杉的個人背景')}),200)).template;
  const house = (await response(await send(places,{
    name:'住宅組合', note:'原有住宅備註',
    rooms:[{id:'front',name:'客廳'},{id:'room-a',name:'澄的私人房間'},{id:'room-b',name:'杉的私人房間'}],
    connections:[{id:'original',name:'原有門',rooms:['front','room-a'],state:'closed'}],
    objects:[{id:'lamp',roomId:'front',name:'台燈',state:{電源:'關閉'}},{id:'secret',roomId:'room-b',name:'杉的秘密物件',state:{}}],
  }),201)).template;
  const other = (await response(await places.GET(),200)).templates.find(place=>place.name==='住宅');
  await response(await send(route,{operation:'set-model-key',mode:'openai',key:'controlled-city-init'}),200);
  const before = await read();
  const city = {
    places:[
      {id:'home',templateId:house.id,version:house.version,name:'共住住宅'},
      {id:'north',templateId:other.id,version:other.version,name:'北屋'},
      {id:'south',templateId:other.id,version:other.version,name:'南屋'},
    ],
    characters:[
      {templateId:first.id,version:first.version,placeId:'',roomId:'',homeId:'home',homeRoomId:'room-a'},
      {templateId:second.id,version:second.version,placeId:'',roomId:'',homeId:'home',homeRoomId:'room-b'},
    ],
    finalization:{
      spaces:[{placeId:'home',rooms:[],objects:[],connections:[{id:'manual-block',name:'指定不通行',rooms:['room-a','room-b'],state:'blocked'}]}],
      walks:[{places:['home','south'],minutes:null},{places:['north','south'],minutes:35}],
    },
  };
  const operation = {operation:'initialize-city',operationId:id(),mode:'demo',city,
    expectedVersion:before.version,operationScope:before.operationScope,worldContext:before.world.contextId};
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (_url, request) => {
    const input = JSON.parse(JSON.parse(request.body).messages[1].content);
    calls.push(input);
    const object = (roomId,name,state=[],placeId='home') => ({placeId,roomId,name,state});
    let candidate;
    if (input.stage==='npc-city-description') {
      assert.deepEqual(input.places.map(place=>place.id),['home']);
      const own = input.person.name==='澄';
      assert.doesNotMatch(JSON.stringify(input),own?/杉的私人房間|杉的秘密物件|杉的個人背景/:/澄的私人房間|澄的個人背景/);
      candidate = {rooms:[{placeId:'home',id:'shared-room',name:'共用工作區',private:false}],objects:[
        object('front','小桌',[{key:'顏色',value:own?'淺色':'深色'}]),
        object('front','台燈',[{key:'電源',value:'開啟'}]),
        object('shared-room','工具箱'),
        object(own?'room-a':'room-b',own?'澄的書':'杉的床'),
        object(own?'room-b':'room-a','企圖寫入他人的房間'),
        object('front','城市外物品',[],'unselected'),
      ]};
    } else {
      assert.equal(input.stage,'heavenly-city-finalization');
      const table = input.generated.spaces.find(space=>space.placeId==='home').objects.find(item=>item.name==='小桌');
      const workroom = input.generated.spaces.find(space=>space.placeId==='home').rooms.find(room=>room.name==='共用工作區');
      candidate = {spaces:[{
        placeId:'home',
        rooms:[],
        objects:[{id:table.id,roomId:'front',name:'小桌',state:[{key:'顏色',value:'深色'}]}],
        connections:[
          {id:'front-b',name:'通往杉房間的門',rooms:['front','room-b'],state:'closed'},
          {id:'front-workroom',name:'通往共用工作區',rooms:['front',workroom.id],state:'open'},
          {id:'changed',name:'覆蓋原門',rooms:['front','room-a'],state:'blocked'},
          {id:'breach',name:'覆蓋明示不通行',rooms:['room-a','room-b'],state:'open'},
        ],
      }],walks:[
        {places:['home','north'],minutes:45},
        {places:['home','south'],minutes:5},
        {places:['north','south'],minutes:5},
        {places:['home','unselected'],minutes:1},
      ]};
    }
    return Response.json({usage:{prompt_tokens:5,completion_tokens:3},choices:[{message:{content:JSON.stringify(candidate)}}]});
  };
  try {
    store.throwAfterNextSave();
    const finalized = await response(await send(route,operation),200);
    assert.equal(calls.length,3);
    assert.deepEqual((await response(await send(route,operation),200)).finalizedCity,finalized.finalizedCity);
    assert.equal(calls.length,3);
    const after = await read();
    assert.equal(after.world.minute,before.world.minute);
    assert.equal(after.world.turn,before.world.turn);
    assert.deepEqual(after.world.characters,before.world.characters);
    assert.equal(after.world.aiUsage.totalCalls,3);
    await response(await send(route,{operation:'set-budget',operationId:id(),mode:'demo',limits:{calls:5,tokens:null}}),200);
    const budgeted = await read();
    const capped = await response(await send(route,{...operation,operationId:id(),expectedVersion:budgeted.version}),429);
    assert.equal(capped.finalizedCity,undefined);
    assert.deepEqual(calls.slice(3).map(input=>input.stage),['npc-city-description','npc-city-description']);
    const latest = await read();
    assert.equal(latest.world.aiUsage.totalCalls,5);
    assert.deepEqual(latest.world.characters,before.world.characters);
    const approved = finalized.finalizedCity;
    const generated = approved.finalization.spaces.find(space=>space.placeId==='home');
    assert.deepEqual(generated.objects.map(item=>item.name).sort(),['小桌','工具箱','杉的床','澄的書'].sort());
    assert.equal(generated.objects.find(item=>item.name==='小桌').state.顏色,'深色');
    generated.objects.find(item=>item.name==='小桌').name = '最後確認的小桌';
    const previewed = await response(await send(route,{...operation,operation:'preview-city',city:approved,expectedVersion:latest.version}),200);
    assert.deepEqual(previewed.preview.issues,[]);
    assert.match(JSON.stringify(previewed.preview),/最後確認的小桌/);
    await installHistoricalCity(approved);
    const {world} = await read();
    assert.deepEqual(world.characters.map(actor=>actor.name),['澄','杉']);
    assert.notEqual(world.characters[0].region,world.characters[1].region);
    assert.deepEqual(world.events,[]);
    assert.equal(world.objects.filter(item=>item.label==='最後確認的小桌').length,1);
    assert.equal(world.objects.find(item=>item.label==='台燈').state.電源,'關閉');
    assert.equal(world.objects.find(item=>item.label==='杉的床').region,world.characters[1].region);
    assert.equal(world.configuration.regions.filter(room=>room.name==='共用工作區').length,1);
    assert.equal(world.configuration.locations.length,3);
    assert.ok(world.configuration.doors.some(door=>door.name==='原有門'));
    assert.equal(world.scene.doors['place:home:door:original'],'closed');
    assert.ok(world.configuration.doors.some(door=>door.name==='通往杉房間的門'&&world.scene.doors[door.id]==='closed'));
    assert.deepEqual(world.configuration.blockedRoomConnections,[['place:home:room:room-a','place:home:room:room-b']]);
    assert.deepEqual(world.configuration.walks,[
      {locations:['place:home','place:south'],minutes:null},
      {locations:['place:north','place:south'],minutes:35},
      {locations:['place:home','place:north'],minutes:45},
    ]);
    assert.equal(calls.length,5);
    assert.deepEqual((await response(await places.GET(),200)).templates.find(item=>item.id===house.id),house);
  } finally {
    global.fetch = originalFetch;
  }
});

test('historical opening familiarity is built from the edited final city and remains actor-private in the next actual model calls', async () => {
  const initial = seedWorld();
  initial.adjudication={provider:'openai',model:'gpt-6.1-sol'};
  store.install(initial);
  const fields = (name,background) => ({...blankCharacterTemplateFields(),name,personality:'安靜',background,startLocation:'自己的臥室'});
  const cheng = (await response(await send(people,{id:crypto.randomUUID(),version:0,fields:fields('澄','澄自己的設定')}),200)).template;
  const shan = (await response(await send(people,{id:crypto.randomUUID(),version:0,fields:fields('杉','杉的私密人物資料')}),200)).template;
  const home = (await response(await send(places,{
    name:'親友住宅',note:'',rooms:[{id:'common',name:'公共客廳'},{id:'bedroom',name:'臥室'},{id:'vault',name:'保密收藏室'}],
    connections:[{id:'secret-door',name:'收藏室專用門',rooms:['bedroom','vault']}],
    objects:[{id:'private',name:'不可預知的私物',roomId:'vault',state:{}},
      {id:'hidden-drawer',name:'未發現的抽屜物件',roomId:'common',state:{},hidden:true}],
    access:{building:'residents',rooms:{vault:'private'}},
  }),201)).template;
  const park = (await response(await send(places,{name:'公園',note:'',rooms:[{id:'entrance',name:'公園入口'}],connections:[],objects:[]}),201)).template;
  await response(await send(route,{operation:'set-model-key',mode:'openai',key:'controlled-opening-knowledge'}),200);
  const before = await read();
  const city = {
    places:[
      {id:'old',templateId:home.id,version:home.version,name:'舊住處'},
      {id:'new',templateId:home.id,version:home.version,name:'新住處'},
      {id:'park',templateId:park.id,version:park.version,name:'明示公園'},
    ],
    characters:[
      {templateId:cheng.id,version:cheng.version,placeId:'',roomId:'',homeId:'old',homeRoomId:'bedroom'},
      {templateId:shan.id,version:shan.version,placeId:'park',roomId:'entrance',homeId:'old'},
    ],
    accessGrants:[
      {placeId:'old',characterTemplateId:cheng.id},
      {placeId:'old',roomId:'vault',characterTemplateId:cheng.id},
    ],
  };
  const requests = [];
  const originalFetch = global.fetch;
  global.fetch = async (_url, request) => {
    const input = JSON.parse(JSON.parse(request.body).messages[1].content);
    requests.push(input);
    let reply;
    if (input.stage==='npc-city-description') {
      assert.doesNotMatch(JSON.stringify(input),/未發現的抽屜物件|不可預知的私物|保密收藏室/);
      const marker = input.person.name==='澄'?'澄的候選顏色':'杉的候選顏色';
      reply = {rooms:[],objects:[{placeId:'old',roomId:'common',name:'舊屋共用鐘',state:[{key:'顏色',value:marker}]}]};
    } else if (input.stage==='heavenly-city-finalization') {
      const clock = input.generated.spaces.find(space=>space.placeId==='old').objects[0];
      reply={spaces:[{placeId:'old',rooms:[],connections:[],objects:[
        {id:clock.id,roomId:clock.roomId,name:clock.name,state:[{key:'顏色',value:'確認後的銅色'}]},
      ]}],walks:[]};
    } else {
      reply=fixtureDecision(input,{type:'rest',target:'',content:''});
    }
    return Response.json({usage:{prompt_tokens:6,completion_tokens:4},choices:[{message:{content:JSON.stringify(reply)}}]});
  };
  try {
    const scope = {operationScope:before.operationScope,worldContext:before.world.contextId};
    const setup = { ...scope,expectedVersion:before.version,operation:'initialize-city',operationId:id(),mode:'demo',city };
    const generated = await response(await send(route,setup),200);
    assert.equal(requests.length,3);
    assert.deepEqual((await read()).world.events,before.world.events);
    const draft = generated.finalizedCity;
    draft.finalization.spaces.push({placeId:'new',rooms:[],connections:[],objects:[
      {id:'basket',name:'新居定稿提籃',roomId:'common',state:{位置:'窗邊'}},
      {id:'secret-note',name:'新居隱藏筆記',roomId:'bedroom',state:{},hidden:true},
    ]});
    const preview = async value => (await response(await send(route,{
      ...scope,operation:'preview-city',mode:'demo',expectedVersion:generated.version,city:value,
    }),200)).preview;
    const old = await preview(draft);
    assert.deepEqual(old.issues,[]);
    assert.match(JSON.stringify(old.characters[0].openingKnowledge),/舊屋共用鐘/);
    assert.match(JSON.stringify(old.characters[1].openingKnowledge),/舊屋共用鐘/);

    draft.characters[0].homeId='new';
    const edited = await preview(draft);
    assert.deepEqual(edited.issues,[]);
    assert.equal(edited.characters[0].place,'新住處');
    assert.equal(edited.characters[1].place,'明示公園');
    assert.match(JSON.stringify(edited.characters[0].openingKnowledge),/新居定稿提籃/);
    assert.doesNotMatch(JSON.stringify(edited.characters[0].openingKnowledge),/舊屋共用鐘|保密收藏室|不可預知的私物|新居隱藏筆記/);
    assert.deepEqual(edited.characters[1].openingKnowledge,old.characters[1].openingKnowledge);
    assert.equal(requests.length,3);

    await installHistoricalCity(draft);
    const {world} = await read();
    const [first,second] = world.characters;
    assert.deepEqual(world.characters.map(actor=>actor.name),['澄','杉']);
    assert.equal(first.location,'place:new');
    assert.equal(second.location,'place:park');
    assert.deepEqual(world.events,[]);
    assert.ok(world.configuration.access['place:old:room:vault'].allowedActorIds.includes(first.id));
    assert.ok(!world.configuration.access['place:new:room:vault'].allowedActorIds.includes(first.id));
    assert.equal(world.objects.find(item=>item.label==='舊屋共用鐘').state.顏色,'確認後的銅色');
    assert.deepEqual(world.objects.find(item=>item.label==='新居隱藏筆記').knownTo,[]);

    await response(await send(route,{operation:'advance',worldContext:world.contextId,operationId:id(),mode:'openai',model:'gpt-6.1-sol',minutes:5,timeContract:'five-minute-v1'}),200);
    const decisions = requests.filter(input=>input.contractVersion==='npc-decision.v3');
    assert.equal(decisions.length,2);
    const firstInput = JSON.stringify(decisions.find(input=>input.self.name==='澄'));
    const secondInput = JSON.stringify(decisions.find(input=>input.self.name==='杉'));
    assert.match(firstInput,/新居定稿提籃/);
    assert.match(secondInput,/舊屋共用鐘.*確認後的銅色/);
    assert.ok(decisions.find(input=>input.self.name==='澄').scene.exits.some(exit=>exit.name==='一扇門'&&!exit.destination));
    assert.doesNotMatch(firstInput,/舊屋共用鐘|杉的私密人物資料|保密收藏室|收藏室專用門|不可預知的私物|候選顏色|新居隱藏筆記|未發現的抽屜物件/);
    assert.doesNotMatch(secondInput,/新居定稿提籃|澄自己的設定|保密收藏室|不可預知的私物|候選顏色|未發現的抽屜物件/);
    assert.equal((await read()).world.turn,1);
  } finally {
    global.fetch = originalFetch;
  }
});
test('a historical settled start-city receipt replays before the retired-operation guard without rewriting the current world',async()=>{
 store.install(seedWorld());const original=await read(),operationId=id(),payload={operation:'start-city',operationId,operationScope:original.operationScope,worldContext:original.world.contextId,expectedVersion:original.version,mode:'demo',city:{places:[],characters:[]}};
 const receipt={status:200,body:{world:original.world,version:original.version,compatibilityReceipt:'historical-start'}};
 // Explicit pre-upgrade receipt fixture, never a new city installation.
 await store.database().prepare('UPDATE worlds SET operations=? WHERE owner=?').bind(JSON.stringify({floor:0,results:{[operationId]:receipt}}),'test-owner').run();
 const before=store.snapshot(),replayed=await response(await send(route,payload),200);assert.equal(replayed.compatibilityReceipt,'historical-start');assert.equal(replayed.operationSettled,true);assert.deepEqual(store.snapshot(),before);assert.equal((await read()).version,original.version);
 await response(await send(route,{...payload,operationId:id()}),409);assert.deepEqual(store.snapshot(),before);
});
