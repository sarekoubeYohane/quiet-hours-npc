/* eslint-disable @typescript-eslint/no-require-imports -- Public setup and effect contracts with model transport fixture. */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=name=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,`${name}.cjs`));
const {configuredWorld}=require('./fixtures/world-configuration.cjs');
const {prepareOpeningResources}=load('opening-resources');
const {commitActivityPhase}=load('world-effects');
const {activateBodyNeeds}=load('needs');
const {routineOffer}=load('routine-rules');
const world=()=>{const w=structuredClone(configuredWorld());w.configuration.privateRooms={loft:'river'};w.configuration.access={lobby:{rule:'public',allowedActorIds:[]},loft:{rule:'residents',allowedActorIds:['river']}};w.objects=[{id:'bed',source:'bed',label:'床',region:'loft',holder:null,owner:'world',revision:1,state:{},lifecycle:'active',kind:'furnishing',knownTo:['river'],allowedTo:[]}];activateBodyNeeds(w);return w;};
const provision=(kind,region='lobby',allowedTo=['river'])=>({kind,region,label:kind==='water'?'可直接飲用的瓶裝水':'可直接食用的三明治',portions:4,responsible:'river',allowedTo,reason:'住戶備妥並允許取用的日常物資'});
const reply=()=>({supplies:[provision('water'),provision('food')],furnishingGrants:[{objectId:'bed',allowedTo:['river'],reason:'住戶自己的床'}],unavailable:[]});
const prepare=(w,value=reply())=>prepareOpeningResources(w,'供應直接可吃喝的物資',{provider:'openai',model:'fixture',key:'fixture'},{signal:AbortSignal.timeout(5000),fetcher:async()=>Response.json({choices:[{message:{content:JSON.stringify(value)}}]})});

test('opening provisions are actual finite servings and ingestion relieves needs, without setup advancing time or assigning actions',async()=>{
 const w=world(),before=structuredClone(w);await prepare(w);assert.equal(w.turn,0);assert.equal(w.minute,1260);assert.deepEqual(w.characters,before.characters);assert.deepEqual(w.events,[]);assert.deepEqual(w.objects[0].allowedTo,['river']);
 const c=w.characters[0];assert.ok(routineOffer(w,c,{type:'propose',content:'準備飲水',purpose:'解渴'}));
 for(const supply of w.supplies){assert.equal(supply.consumable,true);assert.ok(supply.knownTo.includes(c.id));assert.ok(supply.allowedTo.includes(c.id));const key=supply.kind==='drink'?'thirst':'hunger';const prior=c.needs.values[key];commitActivityPhase(w,c,{afterMinutes:0,preconditions:[],effects:[{kind:'materialize',supplyId:supply.id,expectedRemaining:4}]},0);const object=w.objects.find(o=>o.source===supply.id);assert.equal(object.holder,c.id);commitActivityPhase(w,c,{afterMinutes:0,preconditions:[],effects:[{kind:'ingest',version:1,objectId:object.id,expectedRevision:1,hungerRelief:key==='hunger'?15:0,thirstRelief:key==='thirst'?15:0}]},1);assert.equal(c.needs.values[key],prior-15);assert.equal(w.objects.find(o=>o.id===object.id).lifecycle,'consumed');assert.equal(w.supplies.find(s=>s.id===supply.id).remaining,3);}
});

test('invalid private-room permissions reject the whole proposal, and occupied rooms do not confer routine rights',async()=>{
 const w=world(),before=structuredClone(w),r=reply();r.supplies.push(provision('water','loft',['cedar']));await assert.rejects(prepare(w,r));assert.deepEqual(w,before);assert.equal(routineOffer(w,w.characters[1],{type:'propose',content:'準備飲水'}),null);
});

test('existing finite stock, including exhausted stock, cannot be silently replaced by opening provisions',async()=>{
 const w=world();w.supplies=[{id:'empty',region:'lobby',kind:'drink',consumable:true,label:'飲水',owner:'river',remaining:0,initialState:{},knownTo:['river'],allowedTo:['river']}];const before=structuredClone(w);await assert.rejects(prepare(w));assert.deepEqual(w,before);
});

test('preparation is only available once at turn zero and cannot rewrite a running save',async()=>{
 const w=world();await prepare(w);const before=structuredClone(w);await assert.rejects(prepare(w));assert.deepEqual(w,before);const running=world();running.turn=1;await assert.rejects(prepare(running));
});

test('API preparation persists only in the selected save, replays without another call, and leaves a sibling save unchanged',async()=>{
 const {POST,GET}=load('route'),store=load('store');store.install(load('world').seedWorld());
 const sceneResponse=await load('scene-templates-route').POST(new Request('https://test.invalid/api/scene-templates',{method:'POST',headers:{origin:'https://test.invalid'},body:JSON.stringify({accountScope:'account-operations:test-owner',id:crypto.randomUUID(),version:0,name:'住宅',note:'住戶日常起居',rooms:[{id:'front',name:'客廳'}],connections:[],objects:[]})}));
 assert.equal(sceneResponse.status,201);const scene=(await sceneResponse.json()).template,create=require('./create-world-via-opening.cjs');
 const original=await create({load,name:'原存檔',scene,characterPlacement:{homeId:'home'}}),target=await create({load,name:'生活測試',scene,characterPlacement:{homeId:'home'}});
 const url=id=>'https://test.invalid/api/world?save='+id+'&owner=test-owner';
 const read=async id=>(await(await GET(new Request(url(id)))).json());
 const untouched=(await read(original.input.id)).world;let current=await read(target.input.id);const before=structuredClone(current.world);
 const post=b=>POST(new Request(url(target.input.id),{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationScope:current.operationScope,worldContext:before.contextId,operationId:Date.now()+':'+crypto.randomUUID(),mode:'demo',...b})}));
 assert.equal((await post({operation:'set-adjudication',adjudication:{provider:'openai',model:'gpt-6.1-sol'}})).status,200);current=await read(target.input.id);
 const operation={operation:'prepare-opening-resources',resourceRequest:'飲水和簡餐',expectedVersion:current.version,operationId:Date.now()+':'+crypto.randomUUID()};
 const prior=global.fetch;let calls=0;global.fetch=async(_url,init)=>{calls++;const input=JSON.parse(JSON.parse(init.body).messages[1].content);assert.equal(input.contractVersion,'opening-resources.v1');const actor=input.actors[0];const value={supplies:['water','food'].map(kind=>({...provision(kind,actor.region,[actor.id]),responsible:actor.id})),furnishingGrants:[],unavailable:[]};return Response.json({usage:{prompt_tokens:20,completion_tokens:10},choices:[{message:{content:JSON.stringify(value)}}]});};
 try{
  let result=await post(operation);assert.equal(result.status,200,await result.clone().text());let state=(await result.json()).world;assert.equal(state.turn,0);assert.equal(state.minute,1260);assert.deepEqual(state.characters,before.characters);assert.deepEqual(state.events,before.events);assert.equal(state.supplies.length,2);
  result=await post(operation);assert.equal(result.status,200,await result.clone().text());assert.equal(calls,1);const sibling=(await read(original.input.id)).world;delete sibling.aiUsage;delete untouched.aiUsage;assert.deepEqual(sibling,untouched);
  result=await post({...operation,operationId:Date.now()+':'+crypto.randomUUID()});assert.equal(result.status,409);assert.equal(calls,1);
 }finally{global.fetch=prior;}
});

test('prepared food and water pass real AI action adjudication, consume stock, and reduce needs after a saved round',async()=>{
 const {POST,GET}=load('route'),store=load('store'),{fixtureDecision}=require('./pursuit-fixture.cjs');
 const w=world();w.characters=w.characters.slice(0,1);w.contextId='ingestion-fixture';load('world').normalizeWorld(w);await prepare(w);store.install(w);
 const post=b=>POST(new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationScope:'test-owner',worldContext:w.contextId,operationId:Date.now()+':'+crypto.randomUUID(),mode:'openai',model:'gpt-6-luna',...b})}));
 await post({operation:'set-model-key',key:'fixture-key'});const prior=global.fetch;
 try{for(const supply of w.supplies){
  const key=supply.kind==='drink'?'thirst':'hunger',before=(await(await GET()).json()).world.characters[0].needs.values[key];
  global.fetch=async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);const value=input.contractVersion==='world-adjudication.v1'?{status:'accepted',effects:[{kind:'materialize',supplyId:supply.id,expectedRemaining:4},{kind:'ingest',version:1,objectId:supply.id+':4',expectedRevision:1,hungerRelief:key==='hunger'?15:0,thirstRelief:key==='thirst'?15:0}],stages:[],check:null,routine:null,completionMinutes:15}:{type:'propose',target:supply.id,content:'取用並吃喝這份備妥的物資',purpose:key==='hunger'?'進食':'解渴',mood:'平靜',durationMinutes:15,intents:[],timeIntent:{kind:'completion',maxMinutes:null}};return Response.json({usage:{prompt_tokens:20,completion_tokens:10},choices:[{message:{content:JSON.stringify(fixtureDecision(input,value))}}]});};
  const operation={operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()};const response=await post(operation);assert.equal(response.status,200,await response.clone().text());const state=(await(await GET()).json()).world;
  assert.equal(state.supplies.find(s=>s.id===supply.id).remaining,3);assert.equal(state.objects.find(o=>o.source===supply.id).lifecycle,'consumed');assert.equal(state.characters[0].needs.values[key],before-15+(key==='hunger'?.75:1.5));await post(operation);assert.deepEqual((await(await GET()).json()).world.characters[0].needs,state.characters[0].needs);
 }}finally{global.fetch=prior;}
});

test('remembered opening resources do not reveal another resident inventory or remote current stock',async()=>{
 const w=world();await prepare(w);const {openingResourcesForActor}=load('opening-resource-knowledge');w.supplies[0].remaining=0;const known=openingResourcesForActor(w,'river');assert.equal(known.supplies.length,2);assert.equal('remaining' in known.supplies[0],false);assert.deepEqual(openingResourcesForActor(w,'cedar').supplies,[]);
});

test('a newly confirmed custom opening registers the resident routine purpose without inventing supplies on read',async()=>{
 const store=load('store');store.install(load('world').seedWorld());
 const response=await load('scene-templates-route').POST(new Request('https://test.invalid/api/scene-templates',{method:'POST',headers:{origin:'https://test.invalid'},body:JSON.stringify({accountScope:'account-operations:test-owner',id:crypto.randomUUID(),version:0,name:'日常住宅',note:'住戶日常起居',rooms:[{id:'front',name:'客廳'}],connections:[],objects:[]})}));
 assert.equal(response.status,201,await response.clone().text());const scene=(await response.json()).template;
 const result=await require('./create-world-via-opening.cjs')({load,name:'獨立生活測試',scene,characterPlacement:{homeId:'home'}});
 const saved=await(await load('route').GET(new Request('https://test.invalid/api/world?save='+result.input.id+'&owner=test-owner'))).json(),w=saved.world;
 assert.equal(w.turn,0);assert.equal(w.routinePlaces[0].purpose,'custom');assert.deepEqual(w.routinePlaces[0].operators,[w.characters[0].id]);assert.match(w.routinePlaces[0].description,/日常起居/);assert.equal(w.supplies,undefined);
 assert.ok(routineOffer(w,w.characters[0],{type:'propose',content:'準備飲用水',purpose:'解渴'}));
});

test('occlusion and disconnected rooms cannot be approved as immediately usable provisions',async()=>{
 for(const block of [w=>w.scene.occluded=['loft'],w=>w.configuration.doors=[]]){
  const w=world();block(w);const before=structuredClone(w),r=reply();r.supplies=[provision('water','loft')];await assert.rejects(prepare(w,r));assert.deepEqual(w,before);
 }
});

test('finite source subjects and assigned bedrooms remain authoritative across generic kinds and shared residences',async()=>{
 const empty=world();empty.supplies=[{id:'empty-water',region:'loft',kind:'water',finiteScope:{version:1,coverage:'location',subject:'飲水'},owner:'river',remaining:0,initialState:{},knownTo:['river'],allowedTo:['river']}];await assert.rejects(prepare(empty));
 const shared=world();delete shared.configuration.privateRooms;shared.configuration.bedrooms={river:'loft'};shared.configuration.residences.cedar='studio';shared.configuration.access.loft={rule:'public',allowedActorIds:[]};const r=reply();r.supplies.push(provision('water','loft',['cedar']));await assert.rejects(prepare(shared,r));
});

test('furnishing rights also require visibility and runtime adjudication receives the responsible actor roles',async()=>{
 const hidden=world();hidden.scene.occluded=['loft'];const r=reply();r.supplies=[];await assert.rejects(prepare(hidden,r));
 const w=world();await prepare(w);const offer=routineOffer(w,w.characters[0],{type:'propose',content:'備餐'});assert.deepEqual(offer.place.actorRoles,['resident']);assert.deepEqual(offer.place.responsibleActors[0].roles,['resident']);
});
