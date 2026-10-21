/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
const {GET,POST}=load('route'),store=load('store'),{seedWorld}=load('world');
const timings=[['tea',5],['coffee',6],['food',10],['drink',8],['wash',3],['return',1]].map(([operation,minutes])=>({operation,minutes}));
const accepted=()=>({status:'accepted',effects:[],stages:[],check:null,completionMinutes:null,routine:{family:'cafe-service',version:1,operation:'tea',subject:'茶',timings:structuredClone(timings)}});
const proposal={type:'propose',target:'shared-tea-kit',content:'我想用這套共用茶具取熱水和茶包，替自己泡一杯普通的茶。',purpose:'飲用',mood:'平靜',durationMinutes:15,intents:[],timeIntent:{kind:'completion',maxMinutes:null}};
async function setup(adjust=x=>x,adjustNpc=x=>x){
 const w=seedWorld();w.contextId='routine-contract';w.characters=w.characters.filter(c=>c.id==='owner');w.adjudication={provider:'openai',model:'fixture-world'};w.objects=[{id:'ordinary-mug',source:'fixture',label:'杯子',region:'cafe-front',holder:null,owner:'owner',revision:1,state:{contents:'empty'},lifecycle:'active',kind:'utensil',knownTo:['owner'],allowedTo:['owner'],stateTransitions:{contents:['empty','water','tea','coffee','dirty']}},{id:'shared-tea-kit',source:'fixture',label:'共用茶具',region:'cafe-front',holder:null,owner:'owner',revision:1,state:{available:'yes'},lifecycle:'active',kind:'utensil',knownTo:['owner'],allowedTo:['owner']}];store.install(w);
 const post=body=>POST(new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid'},body:JSON.stringify({operationId:Date.now()+':'+crypto.randomUUID(),worldContext:w.contextId,mode:'openai',model:'gpt-6-luna',...body})}));await post({operation:'set-model-key',key:'fixture-key'});
 const previous=global.fetch;let calls=0,contract,request;
 global.fetch=async(_url,init)=>{calls++;const body=JSON.parse(init.body),input=JSON.parse(body.messages[1].content);const value=input.contractVersion==='world-adjudication.v1'?(contract=input,request=body,adjust(accepted())):adjustNpc(structuredClone(proposal));return Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(value)}}]});};
 return {post,read:async()=>await(await GET()).json(),restore:()=>{global.fetch=previous;},calls:()=>calls,contract:()=>contract,request:()=>request};
}
test('successful operation keeps the original proposal and unaligned candidate readable after reload', async()=>{
 const s=await setup();try{
  const op={operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()};
  const response=await s.post(op);assert.equal(response.status,200);
  const saved=await (await GET(new Request('https://test.invalid/api/world?operationId='+encodeURIComponent(op.operationId)))).json();
  assert.ok(saved.operation.evidence,'settled success must expose original proposal and raw adjudication evidence');
  const e=saved.operation.evidence;
  assert.equal(e.requestId,response.headers.get('X-World-Request-Id'));assert.equal(e.operationId,op.operationId);
  assert.deepEqual(e.deployment,{name:'local',commit:'unknown',builtAt:'unknown'});assert.equal(e.baseVersion,0);assert.equal(e.resultVersion,1);assert.equal(e.outcome,'committed');
  assert.deepEqual(e.counts,{npc:1,adjudication:1});assert.equal(e.dispatches.length,2);
  const npc=e.dispatches[0],adjudication=e.dispatches[1];assert.equal(npc.task,'npc');assert.equal(npc.actorId,'owner');assert.ok(npc.requestId);assert.equal(npc.candidate.value.content,proposal.content);assert.equal(npc.candidate.value.target,'shared-tea-kit');assert.equal(npc.candidate.value.durationMinutes,15);assert.deepEqual(npc.candidate.value.timeIntent,{kind:'completion',maxMinutes:null});
  assert.equal(adjudication.task,'adjudication');assert.deepEqual(adjudication.candidate.value,accepted());assert.deepEqual(adjudication.usage,{inputTokens:30,outputTokens:10});
  assert.deepEqual(e.result.rules[0].timings,timings.map(t=>({...t,minutes:15})));assert.equal(e.result.actors[0].plan,null);assert.match(e.result.actors[0].activity,/完成/);
  const cup=e.result.objects.find(o=>o.id==='ordinary-mug');assert.equal(cup.state.contents,'tea');assert.ok(e.result.objects.some(o=>o.state.beverage==='tea'&&o.state.vessel===cup.id));
  assert.equal(saved.operationEvidence.operationId,op.operationId);assert.equal(saved.recentOperations[0].operationId,op.operationId);
  const replay=await s.post(e.replay);assert.equal(replay.status,200);assert.deepEqual((await replay.json()).operationEvidence,e);assert.deepEqual((await s.read()).world,saved.world);assert.equal(s.calls(),2);
 }finally{s.restore();}
});

test('contract failure retains raw timings and known dispatch usage while saved world stays unchanged',async()=>{
 const s=await setup(x=>({...x,completionMinutes:5}));try{
  const before=(await s.read()).world;
  const response=await s.post({operation:'advance',minutes:15}),body=await response.json();assert.equal(response.status,502);
  const e=body.operationEvidence;assert.equal(e.outcome,'rolled-back');assert.equal(e.result.minute,before.minute);assert.deepEqual(e.result.objects,[]);assert.deepEqual(e.result.rules,[]);
  assert.equal(e.dispatches[1].candidate.value.completionMinutes,5);assert.deepEqual(e.dispatches[1].candidate.value.routine.timings,timings);
  assert.deepEqual((await s.read()).operationEvidence,e);assert.equal((await s.post(e.replay)).status,502);assert.equal(s.calls(),2);
 }finally{s.restore();}
});
test('invalid NPC candidate is bounded and excludes private response fields and credentials before storage',async()=>{
 const s=await setup(x=>x,x=>({...x,content:'fixture-key Bearer abc-secret sk-exposed-secret',memoryOperations:[{text:'PRIVATE-MEMORY-CONTENT'}],cognitiveUpdates:[{text:'PRIVATE-COGNITION-CONTENT'}]}));try{
  const response=await s.post({operation:'advance',minutes:15,text:'UNUSED-PRIVATE-INPUT',target:'UNUSED-TARGET'}),body=await response.json();assert.equal(response.status,502);
  const e=body.operationEvidence,serialized=JSON.stringify(e);assert.equal(e.counts.npc,1);assert.equal(e.counts.adjudication,0);assert.equal(e.dispatches[0].usage.inputTokens,30);
  for(const secret of ['fixture-key','abc-secret','sk-exposed-secret','PRIVATE-MEMORY-CONTENT','PRIVATE-COGNITION-CONTENT','UNUSED-PRIVATE-INPUT','UNUSED-TARGET'])assert.ok(!serialized.includes(secret),secret);
  assert.ok(serialized.includes('<REDACTED>'));assert.equal(e.redacted,true);assert.equal(e.replay.text,undefined);assert.equal(e.replay.target,undefined);
  assert.ok(Buffer.byteLength(serialized)<=65536);assert.equal((await s.read()).world.operationEvidence,undefined);
 }finally{s.restore();}
});
test('multi-byte overlong candidates are explicitly omitted without altering the failed operation or journal replay',async()=>{
 const s=await setup(x=>({...x,routine:{...x.routine,subject:'茶'.repeat(40000)}}));try{
  const response=await s.post({operation:'advance',minutes:15}),body=await response.json();assert.equal(response.status,502);
  const e=body.operationEvidence;assert.equal(e.dispatches[1].candidate.status,'omitted');assert.equal(e.truncated,true);assert.ok(Buffer.byteLength(JSON.stringify(e))<=65536);
  assert.equal(e.counts.adjudication,1);assert.equal((await s.post(e.replay)).status,502);assert.equal(s.calls(),2);
 }finally{s.restore();}
});
test('credentials embedded in proposal text and key-value effects are redacted by meaning, not only key prefixes',async()=>{
 const s=await setup(x=>({...x,effects:[{kind:'state',objectId:'ordinary-mug',expectedRevision:1,key:'authorization',value:'opaque-session-secret'}]}),x=>({...x,content:'泡一杯茶 {"api_key":"opaque-content-secret"} Cookie="opaque-cookie-secret"'}));try{
  const response=await s.post({operation:'advance',minutes:15}),body=await response.json();assert.equal(response.status,502);
  const text=JSON.stringify(body.operationEvidence);
  for(const secret of ['opaque-content-secret','opaque-cookie-secret','opaque-session-secret'])assert.ok(!text.includes(secret),secret);
  assert.equal(body.operationEvidence.redacted,true);
 }finally{s.restore();}
});
test('legacy failure diagnostics cannot bypass credential masking for structured effect key-value pairs',async()=>{
 const s=await setup(x=>({...x,effects:[{kind:'state',objectId:'ordinary-mug',expectedRevision:1,key:'authorization',value:'opaque-session-secret'}]}));try{
  const response=await s.post({operation:'advance',minutes:15}),body=await response.json();assert.equal(response.status,502);
  assert.ok(!JSON.stringify(body.adjudicationFailure).includes('opaque-session-secret'));
 }finally{s.restore();}
});
test('transport failures distinguish actual dispatch from unknown usage and retain known provider usage',async()=>{
 for(const known of [false,true]){
  const s=await setup();let sent=0;global.fetch=async()=>{sent++;if(!known)throw Error('network failure');return Response.json({usage:{prompt_tokens:17,completion_tokens:3},choices:[]},{status:429});};
  try{
   const response=await s.post({operation:'advance',minutes:15}),body=await response.json();assert.equal(response.status,502);
   const e=body.operationEvidence;assert.deepEqual(e.counts,{npc:1,adjudication:0});assert.equal(e.outcome,'rolled-back');assert.equal(e.dispatches[0].candidate,undefined);assert.deepEqual(e.dispatches[0].usage,known?{inputTokens:17,outputTokens:3}:null);
   assert.deepEqual((await s.read()).operationEvidence,e);await s.post(e.replay);assert.equal(sent,1);
  }finally{s.restore();}
 }
});
test('save failures preserve evidence without claiming uncommitted cup effects and confirmed saves retain exact receipt',async()=>{
 for(const method of ['throwBeforeNextSave','throwAfterNextSave']){
  const s=await setup();try{
   store[method]();const response=await s.post({operation:'advance',minutes:15}),body=await response.json(),e=body.operationEvidence;
   assert.equal(response.status,method==='throwBeforeNextSave'?502:200);assert.deepEqual(e.counts,{npc:1,adjudication:1});
   if(method==='throwBeforeNextSave'){assert.equal(e.outcome,'not-committed');assert.equal(e.result,undefined);assert.equal(e.resultVersion,undefined);assert.equal((await s.read()).world.objects[0].state.contents,'empty');}
   else{assert.equal(e.outcome,'committed');assert.equal(e.result.objects[0].state.contents,'tea');}
   assert.deepEqual((await s.read()).operationEvidence,e);const replay=await s.post(e.replay);assert.equal(replay.status,response.status);assert.deepEqual((await replay.json()).operationEvidence,e);assert.equal(s.calls(),2);
  }finally{s.restore();}
 }
});
test('journal retention expires old evidence without re-execution and isolates another account',async()=>{
 const s=await setup();try{
  const response=await s.post({operation:'advance',minutes:15}),e=(await response.json()).operationEvidence;
  const base=Date.now();for(let i=0;i<9;i++)assert.equal((await s.post({operation:'takeover',operationId:(base+i+1)+':'+crypto.randomUUID()})).status,200);
  const latest=await s.read();assert.ok(latest.recentOperations.length<=8);assert.ok(!latest.recentOperations.some(item=>item.operationId===e.operationId));
  const lookup=await(await GET(new Request('https://test.invalid/api/world?operationId='+encodeURIComponent(e.operationId)))).json();assert.equal(lookup.operation.state,'expired');assert.equal((await s.post(e.replay)).status,410);assert.equal(s.calls(),2);
  store.installForOwner('other-owner',seedWorld());load('auth').setUserId('other-owner');
  const isolated=await(await GET(new Request('https://test.invalid/api/world?operationId='+encodeURIComponent(e.operationId)))).json();assert.equal(isolated.operation.evidence,undefined);assert.deepEqual(isolated.recentOperations,[]);assert.equal(isolated.operationEvidence,undefined);
 }finally{load('auth').setUserId('test-owner');s.restore();}
});
test('untrusted cached usage does not enter the diagnostic object graph',async()=>{
 const s=await setup();global.fetch=async()=>Response.json({usage:{prompt_tokens:17,completion_tokens:3,prompt_tokens_details:{cached_tokens:{authorization:'opaque-usage-secret',deep:{private:'PRIVATE-USAGE'}}}},choices:[]},{status:429});
 try{
  const body=await(await s.post({operation:'advance',minutes:15})).json();assert.deepEqual(body.operationEvidence.dispatches[0].usage,{inputTokens:17,outputTokens:3});assert.ok(!JSON.stringify(body.operationEvidence).includes('opaque-usage-secret'));assert.equal(body.operationEvidence.truncated,true);
 }finally{s.restore();}
});
test('the original deployment and API request stay attached when a later deployment replays the operation',async()=>{
 const s=await setup();globalThis.__GIT_COMMIT__='evidence-a1';globalThis.__BUILT_AT__='2026-10-21T08:00:00.000Z';
 try{
  const response=await s.post({operation:'advance',minutes:15}),e=(await response.json()).operationEvidence;
  assert.deepEqual(e.deployment,{name:'local',commit:'evidence-a1',builtAt:'2026-10-21T08:00:00.000Z'});
  globalThis.__GIT_COMMIT__='evidence-b2';globalThis.__BUILT_AT__='2026-10-21T09:00:00.000Z';
  const replay=await s.post(e.replay);assert.notEqual(replay.headers.get('X-World-Request-Id'),e.requestId);assert.deepEqual((await replay.json()).operationEvidence,e);assert.deepEqual((await s.read()).operationEvidence,e);assert.equal(s.calls(),2);
 }finally{delete globalThis.__GIT_COMMIT__;delete globalThis.__BUILT_AT__;s.restore();}
});
test('a many-actor operation keeps exact dispatch counts while its receipt remains byte bounded and never enters NPC input',async()=>{
 const s=await setup();const w=store.snapshot(),actor=w.characters[0];w.characters=Array.from({length:40},(_,index)=>({...structuredClone(actor),id:index===0?'owner':'observer-fixture-'+index,control:undefined,memories:[],shortTerm:[],longTerm:[],memoryTrace:[],cognition:undefined,observations:[]}));w.playerBudget={calls:null,tokens:null};store.replaceCommittedWorld(w);
 let sent=0;const inputs=[];global.fetch=async(_url,init)=>{sent++;inputs.push(JSON.parse(init.body));return Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify({type:'rest',target:'',content:'休'.repeat(500),purpose:'休息',mood:'平靜',durationMinutes:15,intents:[],timeIntent:{kind:'open-ended',maxMinutes:null}})}}]});};
 try{
  const response=await s.post({operation:'advance',minutes:15}),body=await response.json();assert.equal(response.status,200,body.error);
  const e=body.operationEvidence;assert.deepEqual(e.counts,{npc:40,adjudication:0});assert.equal(sent,40);assert.ok(e.dispatches.length<=32);assert.ok(Buffer.byteLength(JSON.stringify(e))<=65536);assert.equal(e.truncated,true);
  assert.ok(inputs.every(input=>!JSON.stringify(input.messages).includes('operationEvidence')));assert.ok(inputs.every(input=>!JSON.stringify(input.messages).includes(e.requestId)));
  assert.equal((await s.post(e.replay)).status,200);assert.equal(sent,40);
 }finally{s.restore();}
});
test('a failed-save receipt observes the journal byte budget and evicts old results without reviving them',async()=>{
 const s=await setup();try{
  const initial=store.snapshot();initial.characters[0].goal='PRIVATE-LARGE-BACKGROUND'.repeat(9500);store.replaceCommittedWorld(initial);
  await s.post({operation:'takeover'});await s.post({operation:'return-control'});
  const w=store.snapshot(),actor=w.characters[0];w.characters=Array.from({length:40},(_,index)=>({...structuredClone(actor),goal:'休息',id:index===0?'owner':'fixture-'+index,control:undefined,memories:[],shortTerm:[],longTerm:[],memoryTrace:[],cognition:undefined,observations:[]}));w.playerBudget={calls:null,tokens:null};store.replaceCommittedWorld(w);
  global.fetch=async()=>Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify({type:'rest',target:'',content:'休'.repeat(500),purpose:'休息',mood:'平靜',durationMinutes:15,intents:[],timeIntent:{kind:'open-ended',maxMinutes:null}})}}]});
  const before=await store.database().prepare('SELECT operations FROM worlds WHERE owner = ?').bind('test-owner').first();assert.ok(Buffer.byteLength(before.operations)<500000);
  store.throwBeforeNextSave();const response=await s.post({operation:'advance',minutes:15});assert.equal(response.status,502);
  const after=await store.database().prepare('SELECT operations FROM worlds WHERE owner = ?').bind('test-owner').first();assert.ok(Buffer.byteLength(after.operations)<=500000,'failed-save evidence must not exceed the journal budget');
  const e=(await response.json()).operationEvidence;assert.equal(e.outcome,'not-committed');assert.equal((await s.post(e.replay)).status,502);
 }finally{s.restore();}
});
