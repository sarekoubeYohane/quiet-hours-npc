/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const load = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD,name+'.cjs'));
const { seedWorld } = load('world');
const { blankCharacterTemplateFields } = load('character-templates');
const route = load('route');
const characters = load('character-templates-route');
const store = load('store');
const { fixtureDecision } = require('./pursuit-fixture.cjs');
const {installHistoricalCity}=require('./historical-city-fixture.cjs');
const origin = 'https://test.invalid';
const operationId = () => Date.now()+':'+crypto.randomUUID();
const post = (api, body) => api.POST(new Request(origin+'/api/world',{
  method:'POST',headers:{origin,'X-World-Time-Policy':'round-v1'},body:JSON.stringify(body),
}));
const read = async () => (await route.GET()).json();
async function expect(result, status) {
  const body=await result.json();
  assert.equal(result.status,status,body.error);
  return body;
}

async function mountScene() {
  const {Window}=await import('happy-dom');
  const window=new Window({url:origin});
  for(const name of ['window','document','navigator','Event','HTMLElement','Node','MutationObserver']){
    Object.defineProperty(globalThis,name,{configurable:true,value:window[name]});
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const React=require('react');
  const {createRoot}=require('react-dom/client');
  const esbuild=require(require.resolve('esbuild',{paths:[require.resolve('vite')]}));
  const {outputFiles}=await esbuild.build({entryPoints:['components/pixel-world.tsx'],bundle:true,write:false,
    platform:'node',format:'cjs',jsx:'automatic',alias:{'@':process.cwd()},external:['react','react/*','react-dom','react-dom/*']});
  const compiled={exports:{}};
  new Function('require','module','exports',outputFiles[0].text)(require,compiled,compiled.exports);
  const root=createRoot(document.body.appendChild(document.createElement('div')));
  return {
    render: world=>React.act(async()=>root.render(React.createElement(compiled.exports.default,{
      world,selected:'',onSelect:()=>{},onPlayingChange:()=>{},
    }))),
    select: async id=>{
      const picker=document.querySelector('[aria-label="觀看場所"]');
      assert.ok(picker,'the actual observation scene can switch places');
      await React.act(async()=>{
        Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set.call(picker,id);
        picker.dispatchEvent(new window.Event('change',{bubbles:true}));
      });
    },
    close:async()=>{
      await React.act(async()=>root.unmount());
      await window.happyDOM.close();
    },
  };
}

test('a saved journey occupies world time, survives replay and arrives with the same carried phone', async () => {
  const legacy=seedWorld();
  legacy.adjudication={provider:'openai',model:'gpt-6.1-sol'};
  store.install(legacy);
  await read();
  const create=async name=>(await expect(await post(characters,{
    id:crypto.randomUUID(),version:0,fields:{...blankCharacterTemplateFields(),name},
  }),200)).template;
  const traveler=await create('雨槐');
  const witness=await create('枕溪');
  const selected=['origin','destination','blocked'].map((id,index)=>({
    id,templateId:'default-residence',version:1,name:['起步屋','抵達屋','隔絕屋'][index],
  }));
  const city={
    places:selected,
    characters:[
      {templateId:traveler.id,version:traveler.version,placeId:'origin',roomId:'living-room'},
      {templateId:witness.id,version:witness.version,placeId:'destination',roomId:'living-room'},
    ],
    finalization:{spaces:[],walks:[{places:['origin','destination'],minutes:35},{places:['destination','blocked'],minutes:null}]},
  };
  const started=await installHistoricalCity(city);
  const context=started.world.contextId;
  await expect(await post(route,{operation:'set-model-key',mode:'openai',key:'controlled'}),200);
  const nativeFetch=global.fetch;
  const inputs=[];
  let witnessRounds=0;
  global.fetch=async (_url,request)=>{
    const input=JSON.parse(JSON.parse(request.body).messages[1].content);
    inputs.push(input);
    const action=input.self.name==='雨槐'
      ? {type:'move',target:'place:destination',content:''}
            : ++witnessRounds===2
        ? {type:'message',target:'npc:1',content:'在抵達後再回覆。'}
        : {type:'move',target:'place:blocked',content:''};
    return Response.json({usage:{prompt_tokens:9,completion_tokens:5},choices:[{message:{content:JSON.stringify(fixtureDecision(input,action))}}]});
  };
  const ui=await mountScene();
  const advance=()=>({operation:'advance',operationId:operationId(),worldContext:context,mode:'openai',model:'gpt-6.1-sol',minutes:5,timeContract:'five-minute-v1'});
  try {
    const beforeView=await read();
    await ui.render(beforeView.world);
    await ui.select('place:destination');
    let scene=document.querySelector('[aria-label="目前觀看場所"]');
    assert.match(scene.textContent,/枕溪/);
    assert.doesNotMatch(scene.textContent,/雨槐/);
    assert.equal((await read()).version,beforeView.version);
    assert.equal((await read()).world.minute,beforeView.world.minute);
    const first=advance();
    const departed=await expect(await post(route,first),200);
    const firstRead=await read();
    const moving=firstRead.world.characters.find(actor=>actor.name==='雨槐');
    assert.equal(moving.location,'place:origin','the destination is reached only after the saved walk duration');
    assert.equal(moving.plan.journey.location,'place:destination');
    assert.equal(moving.plan.until-started.world.minute,40);
    assert.match(moving.activity,/前往抵達屋/);
    await ui.render(firstRead.world);
    scene=document.querySelector('[aria-label="目前觀看場所"]');
    assert.doesNotMatch(scene.textContent,/雨槐/);
    assert.match(document.querySelector('[aria-label="移動途中"]').textContent,/雨槐.*前往抵達屋/);
    await ui.select('place:origin');
    assert.doesNotMatch(document.querySelector('[aria-label="目前觀看場所"]').textContent,/雨槐/);
    await ui.select('place:destination');
    const phone=firstRead.world.objects.find(object=>object.kind==='phone'&&object.holder===moving.id);
    assert.ok(phone);
    assert.notEqual(phone.region,'place:origin:room:living-room');
    assert.notEqual(phone.region,'place:destination:room:living-room');

    const replay=await expect(await post(route,first),200);
    assert.equal(replay.version,departed.version);
    assert.deepEqual(replay.world.characters.find(actor=>actor.id===moving.id).plan,moving.plan);

    for(let step=0;step<5;step++)await expect(await post(route,advance()),200);
    const midpoint=await read();
    assert.equal(midpoint.world.characters.find(actor=>actor.id===moving.id).plan.until,moving.plan.until);
    assert.equal(midpoint.world.characters.find(actor=>actor.name==='枕溪').location,'place:destination');
    assert.match(midpoint.world.phones.devices.find(device=>device.objectId===phone.id).inbox[0].text,/抵達後/);
    assert.equal(midpoint.world.events.find(event=>event.kind==='phone-notification').audience.includes('npc:2'),false);
    for(let step=0;step<2;step++)await expect(await post(route,advance()),200);
    const finished=await read();
    const arrived=finished.world.characters.find(actor=>actor.id===moving.id);
    assert.equal(arrived.location,'place:destination');
    assert.equal(arrived.plan,undefined);
    await ui.render(finished.world);
    scene=document.querySelector('[aria-label="目前觀看場所"]');
    assert.match(scene.textContent,/客廳.*雨槐/);
    assert.match(scene.textContent,/台燈.*關閉/);
    assert.equal(document.querySelector('[aria-label="移動途中"]'),null);
    assert.equal(finished.world.objects.find(object=>object.id===phone.id).region,arrived.region);
    assert.equal(finished.world.objects.find(object=>object.id===phone.id).holder,arrived.id);
    assert.equal(finished.world.minute-started.world.minute,40);
    assert.equal(finished.world.events.filter(event=>event.kind==='move'&&event.actor===arrived.id).length,1);
    assert.equal(finished.world.events.find(event=>event.kind==='move'&&event.actor===arrived.id).entryPermission.allowed,true);
    assert.equal(inputs.filter(input=>input.self.name==='雨槐').length,1);
    const priorArrival=inputs.filter(input=>input.self.name==='枕溪'&&input.visiblePeople.every(person=>person.name!=='雨槐'));
    assert.ok(priorArrival.length>=2);
    assert.ok(priorArrival.every(input=>!JSON.stringify(input).includes(phone.id)));
  } finally {
    global.fetch=nativeFetch;
    await ui.close();
  }
});
