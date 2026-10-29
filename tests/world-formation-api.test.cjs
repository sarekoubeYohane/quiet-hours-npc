/* eslint-disable @typescript-eslint/no-require-imports */
const {fixtureDecision}=require('./pursuit-fixture.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {nonPhoneObjects}=require('./fixtures/non-phone-objects.cjs');
const load=name=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,name+'.cjs'));
const {GET,POST}=load('route'),store=load('store'),{seedWorld}=load('world');
const read=async()=> (await (await GET()).json()).world;
const req=body=>new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({mode:'openai',model:'gpt-6-luna',operationId:Date.now()+':'+crypto.randomUUID(),...body})});
const completion=(value,_fixtureInput)=>Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(fixtureDecision(_fixtureInput,value))}}]});
const proposal=(target='cake')=>({type:'propose',target,content:'將這個蛋糕切成四份，先保留作一組',purpose:'整理食物',mood:'平靜',durationMinutes:15,timeIntent:{kind:'completion',maxMinutes:null},intents:[]});
const accepted=effects=>({status:'accepted',effects,stages:[],branches:null,check:null,completionMinutes:15,routine:null});
const fixture=()=>{
 const w=seedWorld();w.characters=[w.characters[0],w.characters.find(c=>c.id==='owner')];w.characters[1].control={mode:'taken-over'};w.adjudication={provider:'openai',model:'fixture-world'};w.playerBudget={calls:120,tokens:1000000};
 w.objects=[{id:'cake',source:'last-cake',label:'最後一個蛋糕',region:'kris-home-main',holder:'cass',owner:'cass',revision:1,state:{},lifecycle:'active',kind:'food',knownTo:['cass'],allowedTo:['cass']}];
 w.supplies=[{id:'last-cake',label:'最後一個蛋糕',region:'kris-home-main',remaining:0,owner:'cass',knownTo:['cass'],allowedTo:['cass'],kind:'food',initialState:{}}];return w;
};
const partition=()=>({kind:'form',version:1,access:'authorized',operation:'partition',inputs:[{objectId:'cake',expectedRevision:1,quantity:{amount:1,unit:'item'},disposition:'consumed'}],outputs:[{id:'cake-pieces',label:'切成四份的蛋糕',kind:'food',consumable:true,quantity:{amount:4,unit:'piece'},state:[]}],reason:'原蛋糕已切開；四份尚無重要差異，先整體追蹤。'});
async function setup(world=fixture()){
 store.install(world);assert.equal((await POST(req({operation:'set-model-key',key:'fixture-key'}))).status,200);
 const requests=[];let candidate=accepted([partition()]),decision=proposal(),npc=0,adjudication=0;const previous=global.fetch;
 global.fetch=async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);requests.push(input);if(input.contractVersion==='world-adjudication.v1'){adjudication++;return completion(candidate,JSON.parse(JSON.parse(init.body).messages[1].content));}npc++;return completion(decision,JSON.parse(JSON.parse(init.body).messages[1].content));};
 return {requests,choose:(next,action=proposal())=>{candidate=next;decision=action;},counts:()=>({npc,adjudication}),restore:()=>{global.fetch=previous;}};
}
async function advance(extra={}){const response=await POST(req({operation:'advance',minutes:15,...extra}));assert.equal(response.status,200,await response.clone().text());return read();}

test('partition records an aggregate immediately and separating one portion preserves the remaining quantity and provenance',async()=>{
 const s=await setup();try{
  let saved=await advance();assert.equal(saved.objects.find(o=>o.id==='cake').lifecycle,'consumed');
  const aggregate=saved.objects.find(o=>o.id==='cake-pieces');assert.deepEqual(aggregate.quantity,{amount:4,unit:'piece'});assert.equal(aggregate.sources[0].id,'cake');assert.equal(aggregate.formation.operation,'partition');
  s.choose(accepted([{kind:'separate',version:1,access:'authorized',objectId:aggregate.id,expectedRevision:aggregate.revision,quantity:{amount:1,unit:'piece'},outputId:'cake-piece-one',reason:'其中一份現在需要獨立拿取。'}]),proposal(aggregate.id));
  const id=Date.now()+':'+crypto.randomUUID();saved=await advance({operationId:id});
  assert.deepEqual(saved.objects.find(o=>o.id==='cake-pieces').quantity,{amount:3,unit:'piece'});assert.deepEqual(saved.objects.find(o=>o.id==='cake-piece-one').quantity,{amount:1,unit:'piece'});
  const before=structuredClone(saved),counts=s.counts();await advance({operationId:id});assert.deepEqual(await read(),before);assert.deepEqual(s.counts(),counts);
  s.choose(accepted([{kind:'consume',objectId:'cake-piece-one',expectedRevision:1}]),proposal('cake-piece-one'));saved=await advance();
  assert.equal(saved.objects.find(o=>o.id==='cake-piece-one').lifecycle,'consumed');assert.equal(saved.objects.find(o=>o.id==='cake-pieces').quantity.amount,3);assert.equal(saved.supplies[0].remaining,0);
 }finally{s.restore();}
});

test('new finite materialization preserves supply provenance and quantity through consumption while old saved objects are not backfilled',async()=>{
 const w=fixture();w.objects=[];w.supplies[0].remaining=1;const s=await setup(w);try{
  s.choose(accepted([{kind:'materialize',supplyId:'last-cake',expectedRemaining:1}]),proposal('last-cake'));
  let saved=await advance(),meal=nonPhoneObjects(saved)[0];assert.deepEqual(meal.quantity,{amount:1,unit:'item'});assert.deepEqual(meal.sources,[{type:'supply',id:'last-cake',revision:null,amount:1,unit:'item',owner:'cass'}]);
  s.choose(accepted([{kind:'consume',objectId:meal.id,expectedRevision:meal.revision}]),proposal(meal.id));saved=await advance();assert.equal(nonPhoneObjects(saved)[0].quantity.amount,0);assert.equal(nonPhoneObjects(saved)[0].lifecycle,'consumed');assert.equal(saved.supplies[0].remaining,0);
 }finally{s.restore();}
 const old=fixture();store.install(old);const saved=await read();assert.equal(nonPhoneObjects(saved)[0].quantity,undefined);assert.equal(nonPhoneObjects(saved)[0].sources,undefined);
});

test('formation receipts retain bounded reasons sources quantities and selected results without backfilling old evidence',async()=>{
 const s=await setup();try{
  const id=Date.now()+':'+crypto.randomUUID();await advance({operationId:id});const result=await(await GET(new Request('https://test.invalid/api/world?operationId='+id))).json(),receipt=result.operation.evidence;
  const candidate=receipt.dispatches.find(dispatch=>dispatch.task==='adjudication').candidate;
  assert.equal(candidate.truncated,false);assert.deepEqual(candidate.value.effects[0].inputs,partition().inputs);assert.deepEqual(candidate.value.effects[0].outputs,partition().outputs);
  assert.equal(candidate.value.effects[0].reason,partition().reason);assert.deepEqual(receipt.result.objects.find(o=>o.id==='cake-pieces').quantity,{amount:4,unit:'piece'});assert.equal(receipt.result.beforeObjects.find(o=>o.id==='cake').id,'cake');
  assert.doesNotMatch(result.world.characters[0].activity,/原蛋糕已切開|原物來源|reason/);
 }finally{s.restore();}
});

const input=(objectId,amount=1,unit='item',expectedRevision=1)=>({objectId,expectedRevision,quantity:{amount,unit},disposition:'consumed'});
const output=(id,amount=1,unit='item')=>({id,label:'來源合成的成果',kind:'pastry',consumable:true,quantity:{amount,unit},state:[]});
const transform=(inputs,outputs)=>({kind:'form',version:1,access:'authorized',operation:'transform',inputs,outputs,reason:'保存真實材料來源與其用量。'});

test('multi-source transformation preserves partial quantities joint owners and permission intersection without fabricating consent',async()=>{
 const w=fixture();w.characters[1].location='kris-home';w.characters[1].region='kris-home-main';w.objects[0].quantity={amount:3,unit:'item'};w.objects.push({...structuredClone(w.objects[0]),id:'sugar',source:'sugar-stock',label:'糖',owner:'owner',quantity:{amount:2,unit:'item'},allowedTo:['cass','owner']});
 const s=await setup(w);try{
  s.choose(accepted([transform([input('cake',2),input('sugar',1)],[output('shared-pastry',3)])]));let saved=await advance();
  assert.equal(saved.objects.find(o=>o.id==='cake').quantity.amount,1);assert.equal(saved.objects.find(o=>o.id==='sugar').quantity.amount,1);
  const product=saved.objects.find(o=>o.id==='shared-pastry');assert.deepEqual(product.coOwners,['cass','owner']);assert.deepEqual(product.allowedTo,['cass']);assert.deepEqual(product.sources.map(source=>[source.id,source.amount,source.owner]),[['cake',2,'cass'],['sugar',1,'owner']]);assert.equal(product.acceptedBy,undefined);
  s.choose(accepted([{kind:'grant',targetId:product.id,recipient:'owner'}]),proposal(product.id));const response=await POST(req({operation:'advance',minutes:15}));assert.equal(response.status,502);assert.deepEqual((await read()).objects.find(o=>o.id===product.id).allowedTo,['cass']);
  s.choose(accepted([{kind:'consume',objectId:product.id,expectedRevision:1}]),proposal(product.id));saved=await advance();assert.equal(saved.objects.find(o=>o.id===product.id).lifecycle,'consumed');assert.equal(saved.objects.find(o=>o.id===product.id).quantity.amount,0);
 }finally{s.restore();}
});

test('same-owner multiple inputs keep their provenance and explicit non-consumable capability overrides legacy food kind',async()=>{
 const w=fixture();w.objects.push({...structuredClone(w.objects[0]),id:'second-material',source:'second-stock'});const s=await setup(w);try{
  const item=output('new-food',2);item.kind='food';item.consumable=false;s.choose(accepted([transform([input('cake'),input('second-material')],[item])]));let saved=await advance();const product=saved.objects.find(o=>o.id==='new-food');assert.equal(product.sources.length,2);assert.equal(product.owner,'cass');assert.equal(product.coOwners,undefined);
  s.choose(accepted([{kind:'consume',objectId:product.id,expectedRevision:1}]),proposal(product.id));assert.equal((await POST(req({operation:'advance',minutes:15}))).status,502);saved=await read();assert.equal(saved.objects.find(o=>o.id===product.id).lifecycle,'active');
 }finally{s.restore();}
});

test('overdraw stale or exhausted sources duplicate identities and reserved state cannot commit half a formation',async()=>{
 const cases=[
  {edit:e=>{e.inputs[0].quantity.amount=2;}},
  {edit:e=>{e.inputs[0].quantity.unit='piece';}},
  {edit:e=>{e.inputs[0].expectedRevision=2;}},
  {edit:e=>{e.outputs[0].id='cake';}},
  {edit:e=>{e.outputs[0].id='last-cake';}},
  {edit:e=>{e.outputs[0].id='owner';}},
  {edit:e=>{e.outputs[0].id='cafe-front';}},
  {edit:e=>{e.outputs[0].quantity={amount:2,unit:'item'};}},
  {edit:e=>{e.outputs[0].state=[{key:'owner',value:'cass',exposure:'public'}];}},
  {edit:e=>{e.outputs[0].state=[{key:'formation',value:'overwrite',exposure:'public'}];}},
  {world:w=>{w.objects[0].lifecycle='consumed';}},
  {world:w=>{w.objects[0].region='cafe-front';}},
  {edit:e=>{e.inputs=[];}},
  {edit:e=>{e.outputs[0].state=[{key:'vessel',value:'cake-pieces',exposure:'public'},{key:'beverage',value:'tea',exposure:'public'},{key:'contents',value:'tea',exposure:'public'}];}},
 ];
 for(const scenario of cases){
  const w=fixture();scenario.world?.(w);const s=await setup(w);try{
   const effect=partition();scenario.edit?.(effect);s.choose(accepted([effect]));const id=Date.now()+':'+crypto.randomUUID(),body={operation:'advance',minutes:15,operationId:id};
   assert.equal((await POST(req(body))).status,502);const saved=await read();assert.deepEqual(saved.objects,w.objects);assert.deepEqual(saved.supplies,w.supplies);assert.equal(saved.turn,w.turn);assert.equal(saved.aiUsage.totalCalls,2);
   const counts=s.counts();assert.equal((await POST(req(body))).status,502);assert.deepEqual(s.counts(),counts);assert.deepEqual((await read()).objects,w.objects);
  }finally{s.restore();}
 }
});

test('all formation branches are validated before D20 and unselected products never persist',async()=>{
 const s=await setup(),previous=Math.random;let rolls=0;Math.random=()=>{rolls++;return .9;};try{
  const bad=partition();bad.outputs[0].id='cake';s.choose({...accepted([]),check:{difficulty:8,ability:'切分'},branches:[{outcomes:['critical-success','success'],effects:[partition()],stages:[]},{outcomes:['mixed','failure','critical-failure'],effects:[bad],stages:[]}]});
  assert.equal((await POST(req({operation:'advance',minutes:15}))).status,502);assert.equal(rolls,0);assert.equal((await read()).objects.length,1);
 }finally{s.restore();Math.random=previous;}
});

test('physical partition can break another holder cup into a traced aggregate without inventing permission and child portions inherit no personal history',async()=>{
 const w=fixture();w.characters[1].location='kris-home';w.characters[1].region='kris-home-main';Object.assign(w.objects[0],{id:'cup',source:'cup-stock',label:'借來的杯子',owner:'owner',holder:'owner',kind:'utensil',allowedTo:[],knownTo:['cass','owner']});const s=await setup(w);try{
  const effect=partition();effect.access='physical';effect.inputs=[{...input('cup'),disposition:'destroyed'}];effect.outputs=[{...output('cup-shards',5,'piece'),label:'杯子碎片',kind:'ceramic-fragments',consumable:false}];s.choose(accepted([effect]),proposal('cup'));
  let saved=await advance(),original=saved.objects.find(o=>o.id==='cup'),aggregate=saved.objects.find(o=>o.id==='cup-shards');assert.equal(original.lifecycle,'destroyed');assert.equal(original.owner,'owner');assert.deepEqual(original.allowedTo,[]);assert.deepEqual(original.physicalHistory.at(-1),{actorId:'cass',minute:saved.minute,operation:'partition',permitted:false,priorHolder:'owner'});assert.equal(original.unpermittedCount,1);assert.equal(aggregate.owner,'owner');assert.deepEqual(aggregate.allowedTo,['owner']);assert.equal(aggregate.acceptedBy,undefined);
  s.choose(accepted([{kind:'separate',version:1,access:'physical',objectId:aggregate.id,expectedRevision:1,quantity:{amount:1,unit:'piece'},outputId:'one-shard',reason:'一片碎片需要獨立保存。'}]),proposal(aggregate.id));saved=await advance();assert.equal(saved.objects.find(o=>o.id==='cup-shards').quantity.amount,4);assert.equal(saved.objects.find(o=>o.id==='one-shard').physicalHistory,undefined);assert.equal(saved.objects.find(o=>o.id==='cup-shards').unpermittedCount,1);
 }finally{s.restore();}
});

test('controlled D20 formation outcomes retain only selected full partial or failed-consumption consequences',async()=>{
 for(const [die,outcome,parts] of [[20,'critical-success',4],[12,'success',4],[8,'mixed',2],[2,'failure',0],[1,'critical-failure',0]]){
  const s=await setup(),previous=Math.random;let rolls=0;Math.random=()=>{rolls++;return (die-.5)/20;};try{
   const full=partition(),partial=partition();partial.outputs[0].id='partial-pieces';partial.outputs[0].quantity.amount=2;
   s.choose({...accepted([]),check:{difficulty:12,ability:'切分'},branches:[{outcomes:['critical-success','success'],effects:[full],stages:[]},{outcomes:['mixed'],effects:[partial],stages:[]},{outcomes:['failure','critical-failure'],effects:[{kind:'consume',objectId:'cake',expectedRevision:1}],stages:[]}]});
   const id=Date.now()+':'+crypto.randomUUID();let saved=await advance({operationId:id});assert.equal(saved.events.findLast(event=>event.kind==='attempt').resolution.outcome,outcome);assert.equal(rolls,1);assert.equal(nonPhoneObjects(saved).filter(o=>o.id!=='cake'&&o.lifecycle==='active').reduce((sum,o)=>sum+o.quantity.amount,0),parts);assert.equal(saved.objects.some(o=>o.id==='cake-pieces'),outcome==='critical-success'||outcome==='success');assert.equal(saved.objects.some(o=>o.id==='partial-pieces'),outcome==='mixed');
   const before=saved.objects,counts=s.counts();saved=await advance({operationId:id});assert.deepEqual(saved.objects,before);assert.deepEqual(s.counts(),counts);assert.equal(rolls,1);
  }finally{s.restore();Math.random=previous;}
 }
});

test('formation save-before confirmed-after and version or lease conflicts retain one committed quantity history and no duplicate dispatch',async()=>{
 for(const fault of ['before','after','version','lease']){
  const initial=fixture(),s=await setup(initial);try{
   if(fault==='before')store.throwBeforeNextSave();if(fault==='after')store.throwAfterNextSave();if(fault==='version')store.conflictOnNextSave();if(fault==='lease')store.conflictOnNextSave(initial,{lockedUntil:Date.now()+60000});
   const id=Date.now()+':'+crypto.randomUUID(),body={operation:'advance',minutes:15,operationId:id},response=await POST(req(body));assert.equal(response.status,fault==='after'?200:502);const saved=await read();assert.equal(saved.objects.some(o=>o.id==='cake-pieces'),fault==='after');assert.equal(saved.objects.find(o=>o.id==='cake').lifecycle,fault==='after'?'consumed':'active');assert.equal(saved.aiUsage.totalCalls,2);
   const counts=s.counts();assert.equal((await POST(req(body))).status,fault==='lease'?409:response.status);assert.deepEqual((await read()).objects,saved.objects);assert.deepEqual(s.counts(),counts);
  }finally{s.restore();}
 }
});

test('a transient operation lookup failure after a committed formation never re-forms or dispatches on original-ID resend',async()=>{
 const s=await setup();try{
  const id=Date.now()+':'+crypto.randomUUID(),body={operation:'advance',minutes:15,operationId:id};assert.equal((await POST(req(body))).status,200);const before=await read(),counts=s.counts();store.failNextOperationRead();assert.equal((await POST(req(body))).status,502);assert.deepEqual(s.counts(),counts);assert.equal((await POST(req(body))).status,200);assert.deepEqual((await read()).objects,before.objects);assert.deepEqual(s.counts(),counts);
 }finally{s.restore();}
});

test('generic beverage continuity rejects an exhausted full vessel but accepts a separately sourced same-batch replacement',async()=>{
 for(const replacement of [false,true])for(const operation of ['consume','destroy']){
  const w=fixture();w.objects=[{...w.objects[0],id:'vessel',kind:'ceramic-vessel',state:{contents:'herbal-infusion'},consumable:false},{...w.objects[0],id:'old-infusion',kind:'herbal-drink',consumable:true,state:{vessel:'vessel',beverage:'herbal-infusion'}},{...w.objects[0],id:'dry-herbs',kind:'plant-material',consumable:false}];const s=await setup(w);try{
   const effects=[{kind:operation,objectId:'old-infusion',expectedRevision:1}];
   if(replacement){const fresh=output('fresh-infusion');fresh.kind='herbal-drink';fresh.state=[{key:'vessel',value:'vessel',exposure:'public'},{key:'beverage',value:'herbal-infusion',exposure:'public'}];effects.push(transform([input('dry-herbs')],[fresh]));}
   s.choose(accepted(effects),proposal('old-infusion'));const response=await POST(req({operation:'advance',minutes:15}));assert.equal(response.status,replacement?200:502);const saved=await read();assert.equal(saved.objects.find(o=>o.id==='old-infusion').lifecycle,replacement?(operation==='consume'?'consumed':'destroyed'):'active');assert.equal(saved.objects.filter(o=>o.lifecycle==='active'&&o.state.vessel==='vessel').length,1);assert.equal(saved.objects.find(o=>o.id==='vessel').id,'vessel');
  }finally{s.restore();}
 }
});

test('two new servings cannot duplicate the contents of a single continuous vessel',async()=>{
 const w=fixture();w.objects.push({...w.objects[0],id:'vessel',kind:'utensil',state:{contents:'tea'},consumable:false});const s=await setup(w);try{
  const drinks=[output('first-drink',1,'serving'),output('second-drink',1,'serving')];for(const drink of drinks)drink.state=[{key:'vessel',value:'vessel',exposure:'public'},{key:'beverage',value:'tea',exposure:'public'}];s.choose(accepted([transform([input('cake')],drinks)]));assert.equal((await POST(req({operation:'advance',minutes:15}))).status,502);assert.deepEqual((await read()).objects,w.objects);
 }finally{s.restore();}
});

test('formation state exposure persists for observers while later NPC input only includes public state and subdivided parts retain exposure',async()=>{
 const s=await setup();try{
  const effect=partition();effect.outputs[0].state=[{key:'surface',value:'有茶漬',exposure:'public'},{key:'hiddenMark',value:'observer-only-formation',exposure:'hidden'}];s.choose(accepted([effect]));let saved=await advance();const aggregate=saved.objects.find(o=>o.id==='cake-pieces');assert.equal(aggregate.state.hiddenMark,'observer-only-formation');assert.deepEqual(aggregate.stateExposure,{surface:'public',hiddenMark:'hidden'});
  s.choose(accepted([{kind:'separate',version:1,access:'authorized',objectId:aggregate.id,expectedRevision:1,quantity:{amount:1,unit:'piece'},outputId:'exposed-part',reason:'保留原物的狀態可知界線。'}]),proposal(aggregate.id));saved=await advance();const npc=s.requests.filter(input=>input.contractVersion!=='world-adjudication.v1').at(-1);assert.equal(npc.objects.find(o=>o.id===aggregate.id).state.surface,'有茶漬');assert.equal(npc.objects.find(o=>o.id===aggregate.id).state.hiddenMark,undefined);assert.deepEqual(saved.objects.find(o=>o.id==='exposed-part').stateExposure,aggregate.stateExposure);
 }finally{s.restore();}
});

test('formation reason credentials are redacted in bounded observer evidence and never copied into the persistent product or NPC story',async()=>{
 const s=await setup();try{
  const effect=partition();effect.reason='只有觀察者可見的 fixture-key 裁定細節';s.choose(accepted([effect]));const id=Date.now()+':'+crypto.randomUUID();assert.equal((await POST(req({operation:'advance',minutes:15,operationId:id}))).status,502);const saved=await read();assert.equal(saved.objects.length,1);assert.equal(saved.objects[0].lifecycle,'active');const result=await(await GET(new Request('https://test.invalid/api/world?operationId='+id))).json();assert.doesNotMatch(JSON.stringify(result.operation.evidence),/fixture-key/);assert.equal(result.operation.evidence.redacted,true);assert.doesNotMatch(JSON.stringify(saved.objects),/裁定細節|fixture-key/);assert.doesNotMatch(saved.characters[0].activity,/裁定細節|fixture-key/);
 }finally{s.restore();}
});
