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
test('the actual app previews and confirms two independently named places and two custom people', async () => {
  store.install(seedWorld());
  for (const name of ['澄', '杉']) {
    await response(await send(people,{id:crypto.randomUUID(),version:0,fields:{...blankCharacterTemplateFields(),name,personality:'安靜'}}), 200);
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
    const proto = select?window.HTMLSelectElement.prototype:window.HTMLInputElement.prototype;
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
    for(const [name,index] of [['澄',0],['杉',1]]){
      const checkbox=document.querySelector('[aria-label="選用'+name+'"]');
      assert.ok(checkbox);
      await React.act(async()=>checkbox.click());
      const location=document.querySelector('[aria-label="'+name+'的起始場所"]');
      await fill(name+'的起始場所',location.options[1].value);
      const room=document.querySelector('[aria-label="'+name+'的起始房間"]');
      await fill(name+'的起始房間',room.options[index+1].value);
    }
    await click('預覽城市');
    assert.equal(button('開始世界').disabled,false);
    assert.match(document.querySelector('[aria-label="城市預覽"]').textContent,/河畔北屋.*河畔南屋/);
    assert.equal((await read()).world.turn,0);
    await fill('場所 2 名稱','林間南屋');
    assert.equal(button('開始世界').disabled,true);
    await click('預覽城市');
    await click('開始世界');
    const { world } = await read();
    assert.deepEqual(world.characters.map(actor=>actor.name),['澄','杉']);
    assert.deepEqual(world.configuration.locations.map(place=>place.name),['河畔北屋','林間南屋']);
    assert.match(document.querySelector('[aria-label="世界像素地圖"]').textContent,/台燈.*關閉/);
  } finally {
    await React.act(async()=>root.unmount());
    global.fetch=nativeFetch;
    await window.happyDOM.close();
  }
});
