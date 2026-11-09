/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const load = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD,name+'.cjs'));
const { seedWorld } = load('world');
const { blankCharacterTemplateFields } = load('character-templates');
const route = load('route');
const characters = load('character-templates-route');
const scenes = load('scene-templates-route');
const store = load('store');
const { fixtureDecision } = require('./pursuit-fixture.cjs');
const {installHistoricalCity}=require('./historical-city-fixture.cjs');
const origin = 'https://test.invalid';
const operationId = () => Date.now()+':'+crypto.randomUUID();
const post = (api, body) => api.POST(new Request(origin+'/api/world',{
  method:'POST',headers:{origin,'X-World-Time-Policy':'round-v1'},body:JSON.stringify(api === scenes ? {id:crypto.randomUUID(),version:0,...body} : body),
}));
const read = async () => (await route.GET()).json();
async function expect(result, status) {
  const body=await result.json();
  assert.equal(result.status,status,body.error);
  return body;
}

async function mountProfile() {
  const {Window}=await import('happy-dom');
  const window=new Window({url:origin});
  for(const name of ['window','document','navigator','Event','HTMLElement','Node','MutationObserver']){
    Object.defineProperty(globalThis,name,{configurable:true,value:window[name]});
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const React=require('react');
  const {createRoot}=require('react-dom/client');
  const esbuild=require(require.resolve('esbuild',{paths:[require.resolve('vite')]}));
  const {outputFiles}=await esbuild.build({entryPoints:['components/character-profile.tsx'],bundle:true,write:false,
    platform:'node',format:'cjs',jsx:'automatic',alias:{'@':process.cwd()},external:['react','react/*','react-dom','react-dom/*']});
  const compiled={exports:{}};
  new Function('require','module','exports',outputFiles[0].text)(require,compiled,compiled.exports);
  const root=createRoot(document.body.appendChild(document.createElement('div')));
  return {
    render: (world,actorId)=>React.act(async()=>root.render(React.createElement(compiled.exports.default,{
      world,character:world.characters.find(actor=>actor.id===actorId),onBack:()=>{},onInteract:()=>{},onAnalysis:()=>{},
    }))),
    map:async()=>{
      const panel=document.querySelector('[aria-label="手機地圖讀取紀錄"]');
      assert.ok(panel,'the actual character profile exposes the phone map reading history');
      if(!panel.open)await React.act(async()=>panel.querySelector('summary').click());
      assert.equal(panel.open,true);
      return panel;
    },
    close:async()=>{
      await React.act(async()=>root.unmount());
      await window.happyDOM.close();
    },
  };
}

test('an existing historical city phone read supplies only public map knowledge to the reader and persists on the same device', async () => {
  const legacy=seedWorld();
  legacy.adjudication={provider:'openai',model:'gpt-6.1-sol'};
  store.install(legacy);
  await read();
  const create=async name=>(await expect(await post(characters,{
    id:crypto.randomUUID(),version:0,fields:{...blankCharacterTemplateFields(),name},
  }),200)).template;
  const reader=await create('瑤芷');
  const neighbor=await create('落杉');
  const secret=(await expect(await post(scenes,{
    name:'密室範本',note:'切勿加入地圖的私密描述',access:{building:'private',rooms:{}},
    rooms:[{id:'hidden-room',name:'地下研究室'}],connections:[],
    objects:[{id:'hidden-object',name:'不能外洩的手稿',roomId:'hidden-room',state:{}}],
  }),201)).template;
  const city={
    places:[
      {id:'origin',templateId:'default-residence',version:1,name:'白橋廣場'},
      {id:'station',templateId:'default-residence',version:1,name:'遠岸書店'},
      {id:'blocked',templateId:'default-residence',version:1,name:'未讀觀景台'},
      {id:'secret',templateId:secret.id,version:secret.version,name:'暗號宅邸'},
    ],
    characters:[reader,neighbor].map(person=>({templateId:person.id,version:person.version,placeId:'origin',roomId:'living-room'})),
    finalization:{spaces:[],walks:[
      {places:['origin','station'],minutes:15},
      {places:['origin','secret'],minutes:5},
      {places:['origin','blocked'],minutes:null},
    ]},
  };
  const started=await installHistoricalCity(city);
  const context=started.world.contextId;
  await expect(await post(route,{operation:'set-model-key',mode:'openai',key:'controlled-map'}),200);
  await expect(await post(route,{operation:'set-budget',operationId:operationId(),worldContext:context,mode:'demo',limits:{calls:40,tokens:10000}}),200);
  const nativeFetch=global.fetch;
  let step=0;
  const inputs=[];
  let phoneId;
  global.fetch=async (_url,request)=>{
    const {messages}=JSON.parse(request.body);
    const input=JSON.parse(messages[1].content);
    let candidate;
    if(input.contractVersion==='world-adjudication.v1'){
      const phone=input.objects.find(item=>item.id===phoneId);
      candidate={status:'accepted',completionMinutes:15,effects:[{
        kind:'change-state',version:1,target:{type:'object',id:phone.id},expectedRevision:phone.revision,
        changes:[{key:'condition',from:'sound',value:'broken'}],exposure:'public',access:'physical',reason:'摔破自己手中的手機',
      }],check:null,stages:[]};
    }else{
      inputs.push({step,input});
      let action={type:'rest',target:'',content:''};
      if(input.self.name==='瑤芷'){
        if(step===0)phoneId=input.phones[0].objectId;
        if(step===1||step===5)action={type:'phone',target:phoneId,content:JSON.stringify({collection:'map',operation:'read',offset:0})};
        if(step===2)action={type:'move',target:'place:station',content:''};
        if(step===3)action={type:'propose',target:phoneId,content:'摔破手中的手機',purpose:'讓裝置不再運作',timeIntent:{kind:'completion',maxMinutes:null}};
      }
      candidate=fixtureDecision(input,action);
    }
    return Response.json({usage:{prompt_tokens:9,completion_tokens:5},choices:[{message:{content:JSON.stringify(candidate)}}]});
  };
  const ui=await mountProfile();
  const advance=()=>({operation:'advance',operationId:operationId(),worldContext:context,mode:'openai',model:'gpt-6.1-sol',minutes:5,timeContract:'five-minute-v1'});
  const completePeriod=async()=>{let result;for(let part=0;part<4;part++)result=await expect(await post(route,advance()),200);return result;};
  try {
    await completePeriod();
    assert.ok(phoneId);
    const original=await read();
    assert.equal(original.world.phones.devices.find(device=>device.objectId===phoneId).mapReads,undefined);
    await ui.render(original.world,'npc:1');
    assert.match((await ui.map()).textContent,/尚未查閱/);
    assert.equal((await read()).version,original.version);
    assert.equal((await read()).world.phones.devices.find(device=>device.objectId===phoneId).mapReads,undefined);
    step=1;
    let reading=advance(),opened=await expect(await post(route,reading),200);
    // Replay the operation that actually completes the read, not its earlier start.
    for(let part=0;part<3;part++){reading=advance();opened=await expect(await post(route,reading),200);}
    const stored=(await read()).world;
    const entry=stored.phones.devices.find(device=>device.objectId===phoneId).mapReads[0];
    assert.equal(entry.actorId,'npc:1');
    assert.equal(entry.place.name,'白橋廣場');
    assert.deepEqual(entry.roads,[{id:'place:station',name:'遠岸書店',minutes:15}]);
    await ui.render(stored,'npc:1');
    assert.match((await ui.map()).textContent,/白橋廣場.*遠岸書店.*15/);
    assert.doesNotMatch((await ui.map()).textContent,/暗號宅邸|未讀觀景台|地下研究室/);
    await ui.render(stored,'npc:2');
    assert.match((await ui.map()).textContent,/尚未查閱/);
    const replayed=await expect(await post(route,reading),200);
    assert.equal(replayed.version,opened.version);
    assert.deepEqual(replayed.world.phones.devices.find(device=>device.objectId===phoneId).mapReads,[entry]);

    step=2;
    await completePeriod();
    assert.equal((await read()).world.characters.find(person=>person.name==='瑤芷').location,'place:station');
    const payload=(turn,name)=>JSON.stringify(inputs.find(item=>item.step===turn&&item.input.self.name===name).input);
    assert.doesNotMatch(payload(0,'瑤芷'),/遠岸書店|暗號宅邸/);
    assert.doesNotMatch(payload(1,'瑤芷'),/遠岸書店|暗號宅邸/);
    assert.match(payload(2,'瑤芷'),/遠岸書店/);
    assert.match(payload(2,'瑤芷'),/place:station/);
    assert.doesNotMatch(payload(2,'落杉'),/遠岸書店|place:station/);
    for(const {input} of inputs)assert.doesNotMatch(JSON.stringify(input),/暗號宅邸|地下研究室|不能外洩的手稿|切勿加入地圖的私密描述|未讀觀景台/);

    step=3;
    await completePeriod();
    step=4;
    await completePeriod();
    const after=(await read()).world;
    assert.equal(after.objects.find(object=>object.id===phoneId).state.condition,'broken');
    assert.deepEqual(after.objects.filter(object=>object.kind==='phone'&&object.owner==='npc:1').map(object=>object.id),[phoneId]);
    assert.doesNotMatch(payload(4,'瑤芷'),/"objectId":"phone:npc:1:/);
    assert.deepEqual(after.phones.devices.find(device=>device.objectId===phoneId).mapReads,[entry]);
    step=5;
    await expect(await post(route,advance()),502);
    const rejected=(await read()).world;
    assert.equal(rejected.turn,after.turn);
    assert.deepEqual(rejected.phones.devices.find(device=>device.objectId===phoneId).mapReads,[entry]);
    assert.deepEqual(rejected.objects.filter(object=>object.kind==='phone'&&object.owner==='npc:1').map(object=>object.id),[phoneId]);
  } finally {
    global.fetch=nativeFetch;
    await ui.close();
  }
});
