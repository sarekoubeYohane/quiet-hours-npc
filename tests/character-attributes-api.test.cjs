/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict'),test=require('node:test'),path=require('node:path');
const load=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
const route=load('route'),store=load('store'),{seedWorld}=load('world');
const op=()=>Date.now()+':'+crypto.randomUUID();
const read=async()=> (await route.GET()).json();
const send=async body=>{const r=await route.POST(new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({mode:'demo',operationId:op(),...body})}));return {status:r.status,body:await r.json()};};
const setup={attributes:{strength:{min:1,max:2},endurance:{value:4},dexterity:{value:3},perception:{value:2}},expertise:[{scope:'髮飾設計',modifier:10}],senses:[{scope:'hearing',modifier:-10}]};
test('owner explicitly forms stable background-bounded attributes through world API, SQLite read and original-operation replay',async()=>{
 store.install(seedWorld());const before=await read();assert.equal(before.world.characters[0].attributes,undefined);
 const random=Math.random;let draws=0;Math.random=()=>{draws++;return .8;};
 try {const payload={operation:'adopt-character-attributes',operationId:op(),operationScope:before.operationScope,expectedVersion:before.version,worldContext:before.world.contextId,target:'cass',characterSetup:setup};
 const r=await send(payload);assert.equal(r.status,200,JSON.stringify(r.body));const c=r.body.world.characters.find(c=>c.id==='cass');
 assert.deepEqual(c.attributes.values,{strength:2,endurance:4,dexterity:3,perception:2});assert.deepEqual(c.attributes.expertise,setup.expertise);assert.equal(c.mentalEnergy,undefined);assert.equal(c.control,undefined);
 const saved=(await read()).world.characters.find(c=>c.id==='cass');assert.deepEqual(saved.attributes,c.attributes);const sampled=draws;
 assert.equal((await send(payload)).status,200);assert.equal(draws,sampled);assert.deepEqual((await read()).world.characters.find(c=>c.id==='cass').attributes,c.attributes);
 }finally{Math.random=random;}
});
test('invalid background, duplicate authorities and stale adoption never sample or mutate',async()=>{
 for(const characterSetup of [{attributes:{strength:{value:4,min:1,max:2}}},{attributes:{strength:{min:5,max:2}}},{attributes:{dexterity:{value:1.5}}},{expertise:[{scope:'設計',modifier:10},{scope:'設計',modifier:-10}]},{senses:[{scope:'hearing',modifier:5}]}]){
  store.install(seedWorld());const before=await read();const r=await send({operation:'adopt-character-attributes',operationScope:before.operationScope,expectedVersion:before.version,worldContext:before.world.contextId,target:'cass',characterSetup});assert.equal(r.status,400);assert.deepEqual((await read()).world.characters,before.world.characters);
 }
 store.install(seedWorld());const before=await read();const stale=await send({operation:'adopt-character-attributes',operationScope:before.operationScope,expectedVersion:99,worldContext:before.world.contextId,target:'cass',characterSetup:{}});assert.equal(stale.status,409);assert.equal(stale.body.operationSettled,true);
});
test('all nine ordinary two-d3 outcomes and restricted distribution preserve the approved frequencies',async()=>{
 const random=Math.random;try{
 const outcomes=[];
 for(let a=0;a<3;a++)for(let b=0;b<3;b++){
  store.install(seedWorld());const before=await read();const draws=[(a+.1)/3,(b+.1)/3];Math.random=()=>draws.shift()??.5;
  const r=await send({operation:'adopt-character-attributes',operationScope:before.operationScope,expectedVersion:before.version,worldContext:before.world.contextId,target:'cass',characterSetup:{attributes:{endurance:{value:3},dexterity:{value:3},perception:{value:3}}}});assert.equal(r.status,200);outcomes.push(r.body.world.characters.find(c=>c.id==='cass').attributes.values.strength);
 }
 assert.deepEqual(outcomes,[1,2,3,2,3,4,3,4,5]);
 for(const [sample,expected] of [[0,1],[.333333,1],[1/3,2],[.99999,2]]){
 store.install(seedWorld());const before=await read();Math.random=()=>sample;
 const r=await send({operation:'adopt-character-attributes',operationScope:before.operationScope,expectedVersion:before.version,worldContext:before.world.contextId,target:'cass',characterSetup:setup});assert.equal(r.body.world.characters.find(c=>c.id==='cass').attributes.values.strength,expected);
 }
 }finally{Math.random=random;}
});
test('save-before, lost-response and CAS failures never leave partial or rerolled character data',async()=>{
 for(const fault of ['before','after','conflict']){
  const initial=seedWorld();initial.characters.find(c=>c.id==='cass').mentalEnergy={version:1,policy:{version:1,kind:'test',id:'existing',initial:40,maximum:80,awakePerHour:0,regulationCost:5,lowAt:5},value:40,activatedAt:initial.minute,updatedAt:initial.minute,history:[],dropped:0};store.install(initial);const before=await read();
  if(fault==='before')store.throwBeforeNextSave();if(fault==='after')store.throwAfterNextSave();if(fault==='conflict')store.conflictOnNextSave();
  const payload={operation:'adopt-character-attributes',operationId:op(),operationScope:before.operationScope,expectedVersion:before.version,worldContext:before.world.contextId,target:'cass',characterSetup:setup};
  const r=await send(payload);if(fault!=='after')assert.notEqual(r.status,200);const committed=(await read()).world;
  const actor=committed.characters.find(c=>c.id==='cass');assert.equal(!!actor.attributes,fault==='after');assert.deepEqual(actor.mentalEnergy,initial.characters.find(c=>c.id==='cass').mentalEnergy);
  const random=Math.random;Math.random=()=>{throw Error('replay must not sample');};try{await send(payload);assert.deepEqual((await read()).world.characters.find(c=>c.id==='cass').attributes,actor.attributes);}finally{Math.random=random;}
 }
});
test('start-city forms once after preview alongside formal energy, while old reads remain missing',async()=>{
 store.install(seedWorld());const before=await read();const scenes=load('scene-templates-route'),people=load('character-templates-route');
 const api=async(api,body)=>{const r=await api.POST(new Request('https://test.invalid',{method:'POST',headers:{origin:'https://test.invalid'},body:JSON.stringify(body)}));assert.ok(r.status<300,await r.clone().text());return r.json();};
 const person=(await api(people,{id:crypto.randomUUID(),version:0,fields:{...load('character-templates').blankCharacterTemplateFields(),name:'定衡',background:'力量較弱'}})).template;
 const scene=(await api(scenes,{id:crypto.randomUUID(),version:0,name:'屋',note:'',rooms:[{id:'front',name:'室'}],objects:[],connections:[]})).template;
 const city={places:[{id:'one',templateId:scene.id,version:1,name:'屋'}],characters:[{templateId:person.id,version:1,placeId:'one',roomId:'front',characterSetup:setup}]};
 const context={operationScope:before.operationScope,expectedVersion:before.version,worldContext:before.world.contextId};
 const random=Math.random;let count=0;Math.random=()=>{count++;return 0;};try{
 const preview=await send({...context,operation:'preview-city',city});assert.equal(preview.status,200);assert.equal(count,0);
 const payload={...context,operation:'start-city',operationId:op(),city};const r=await send(payload);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.world.characters[0].attributes.values.strength,1);assert.equal(r.body.world.characters[0].mentalEnergy.policy.kind,'formal');const n=count;
 assert.equal((await send(payload)).status,200);assert.equal(count,n);assert.deepEqual((await read()).world.characters[0].attributes,r.body.world.characters[0].attributes);
 const advanced=await send({operation:'advance',worldContext:r.body.world.contextId,minutes:5,timeContract:'five-minute-v1'});assert.equal(advanced.status,200,JSON.stringify(advanced.body));assert.equal(advanced.body.world.turn,1);assert.deepEqual(advanced.body.world.characters[0].attributes,r.body.world.characters[0].attributes);
 }finally{Math.random=random;}
});
test('file SQLite close/reopen preserves formation and does not resample the committed original operation',async()=>{
 const {mkdtemp,rm}=require('node:fs/promises'),{tmpdir}=require('node:os');
 const {createRuntime}=await import('../tooling/experiments/pursuit-runtime-228.mjs');
 const directory=await mkdtemp(path.join(tmpdir(),'character-275-')),databasePath=path.join(directory,'world.sqlite');let runtime;
 try{
 runtime=await createRuntime({databasePath});const before=await(await runtime.get()).json();const payload={mode:'demo',operation:'adopt-character-attributes',operationId:op(),operationScope:before.operationScope,expectedVersion:before.version,worldContext:before.world.contextId,target:'cass',characterSetup:setup};
 const response=await runtime.post(payload);assert.equal(response.status,200,await response.clone().text());const formed=(await response.json()).world.characters.find(c=>c.id==='cass').attributes;await runtime.close();runtime=undefined;
 runtime=await createRuntime({databasePath});assert.deepEqual((await(await runtime.get()).json()).world.characters.find(c=>c.id==='cass').attributes,formed);
 const random=Math.random;Math.random=()=>{throw Error('reopen replay must not draw');};try{assert.equal((await runtime.post(payload)).status,200);}finally{Math.random=random;}
 assert.deepEqual((await(await runtime.get()).json()).world.characters.find(c=>c.id==='cass').attributes,formed);
 }finally{await runtime?.close();await rm(directory,{recursive:true,force:true});}
});
