/* eslint-disable @typescript-eslint/no-require-imports */
const {fixtureDecision}=require('./pursuit-fixture.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
const {GET}=load('route'),{scenario,proposal}=require('./routine-program-fixture.cjs');
test('private trace rereads actual dispatched bytes and unchanged facts without replaying models',async()=>{
 const s=await scenario();const original=global.fetch,wire=[];
 global.fetch=async(url,init)=>{const response=await original(url,init);wire.push({request:init.body,response:await response.clone().text()});return response;};
 try{
  const op={operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()},r=await s.post(op);assert.equal(r.status,200);
  const read=async()=>(await(await GET(new Request('https://test.invalid/api/world?operationId='+encodeURIComponent(op.operationId)))).json());
  const first=await read(),trace=first.decisionTrace;assert.ok(trace,'completed operation must expose durable private transcript');
  assert.equal(trace.outcome,'committed');assert.equal(trace.requestId,r.headers.get('X-World-Request-Id'));
  assert.equal(trace.dispatches.length,2);
  trace.dispatches.forEach((dispatch,i)=>{assert.equal(dispatch.requestBody,wire[i].request);assert.equal(dispatch.responseBody,wire[i].response);assert.ok(dispatch.worldSnapshot.objects.some(o=>o.id==='cup-b'));});
  assert.ok(trace.steps.some(step=>step.kind==='rule-selection'));assert.ok(trace.steps.some(step=>step.kind==='npc-feedback'));
  const second=await read();assert.deepEqual(second.decisionTrace,trace);
  await s.post(op);assert.deepEqual(s.counts(),{npc:1,judgments:1,dice:0});assert.deepEqual((await read()).decisionTrace,trace);
  assert.equal(first.world.decisionTrace,undefined);assert.ok(!wire[0].request.includes(trace.requestId));
 }finally{s.restore();}
});
test('normal denial retains the full cup and raw reply even with no changed objects',async()=>{
 const denied={status:'denied',completionMinutes:null,effects:[],stages:[],check:null,routine:null};
 const s=await scenario({reply:denied,modify:w=>{w.objects.find(o=>o.id==='cup-a').state.contents='tea';}});
 try{
  const r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200);
  const data=await(await GET()).json(),trace=await(await GET(new Request('https://test.invalid/api/world?operationId='+encodeURIComponent(data.decisionTraces.records[0].operationId)))).json();
  const d=trace.decisionTrace.dispatches.find(item=>item.task==='adjudication');
  assert.equal(d.worldSnapshot.objects.find(o=>o.id==='cup-a').state.contents,'tea');
  assert.equal(JSON.parse(JSON.parse(d.responseBody).choices[0].message.content).status,'denied');
  assert.ok(trace.decisionTrace.steps.some(step=>step.kind==='parsed-candidate'&&step.data.explanationRecorded===false));
 }finally{s.restore();}
});
module.exports={proposal};

test('trace history survives journal eviction and time passage, stays private, and reset clears the old history',async()=>{
 const s=await scenario({modify:w=>{w.characters[0].shortTerm[0].text='FORGOTTEN-PRIVATE-CONTEXT';w.characters[0].memories[0].text='FORGOTTEN-PRIVATE-CONTEXT';}});const store=load('store'),auth=load('auth');
 try{
  const r=await s.post({operation:'advance',minutes:15}),first=(await r.json()).operationEvidence;
  const before=(await(await GET(new Request('https://test.invalid/api/world?operationId='+encodeURIComponent(first.operationId)))).json()).decisionTrace;
  for(let i=0;i<9;i++)assert.equal((await s.post({operation:'takeover'})).status,200);
  const saved=await(await GET(new Request('https://test.invalid/api/world?operationId='+encodeURIComponent(first.operationId)))).json();
  assert.equal(saved.operation.state,'expired');assert.deepEqual(saved.decisionTrace,before);assert.equal(saved.decisionTraces.retention.count,10);
  const current=store.snapshot();current.characters[0].shortTerm=[];current.characters[0].longTerm=[];current.characters[0].memories=[];store.replaceCommittedWorld(current);
  await s.post({operation:'return-control'});s.choose({...proposal,type:'rest',target:'',content:'休息',purpose:'休息',timeIntent:{kind:'open-ended',maxMinutes:null}});await s.post({operation:'advance',minutes:15});
  assert.ok(JSON.stringify(before).includes('FORGOTTEN-PRIVATE-CONTEXT'));assert.ok(!JSON.stringify(s.inputs.at(-1).request).includes('FORGOTTEN-PRIVATE-CONTEXT'));
  const clock=Date.now;Date.now=()=>clock()+8*86400000;
  try{const later=await(await GET(new Request('https://test.invalid/api/world?operationId='+encodeURIComponent(first.operationId)))).json();assert.deepEqual(later.decisionTrace,before);}finally{Date.now=clock;}
  store.installForOwner('other-owner',load('world').seedWorld());auth.setUserId('other-owner');
  try{const isolated=await(await GET(new Request('https://test.invalid/api/world?operationId='+encodeURIComponent(first.operationId)))).json();assert.equal(isolated.decisionTrace,null);assert.equal(isolated.decisionTraces.retention.count,0);}finally{auth.setUserId('test-owner');}
  await s.post({operation:'reset'});const reset=await(await GET(new Request('https://test.invalid/api/world?operationId='+encodeURIComponent(first.operationId)))).json();assert.equal(reset.decisionTrace,null);assert.equal(reset.decisionTraces.retention.count,1);
 }finally{auth.setUserId('test-owner');s.restore();}
});

test('archive enforces count, total bytes and single-record limits through world operations',async()=>{
 const store=load('store');
 for(const kind of ['count','bytes','record']){
  const s=await scenario();try{
   if(kind!=='count'){
    const w=store.snapshot();w.objects[0].label='量測'.repeat(kind==='record'?200000:90000);store.replaceCommittedWorld(w);
   }
   const runs=kind==='count'?66:kind==='bytes'?34:1;
   for(let i=0;i<runs;i++)assert.equal((await s.post({operation:'takeover'})).status,200);
   const body=await(await GET()).json(),index=body.decisionTraces;
   assert.ok(index.retention.count<=64);assert.ok(index.retention.bytes<=16*1024*1024);
   if(kind==='count')assert.equal(index.retention.evicted,2);
   if(kind==='bytes')assert.ok(index.retention.evicted>0);
   if(kind==='record'){
    const trace=(await(await GET(new Request('https://test.invalid/api/world?operationId='+encodeURIComponent(index.records[0].operationId)))).json()).decisionTrace;
    assert.equal(trace.gap,'single-record-limit');assert.ok(trace.omittedOriginalBytes>1024*1024);assert.deepEqual(trace.gaps,['single-record-limit']);
   }
  }finally{s.restore();}
 }
});

test('nested request and snapshot credential fields are masked while hidden facts stay out of NPC requests',async()=>{
 const s=await scenario({modify:w=>{w.objects[0].state.authorization='opaque-state-secret';w.objects[0].state.hiddenDiagnostic='OBS-HIDDEN';w.objects[0].stateExposure={authorization:'hidden',hiddenDiagnostic:'hidden'};w.characters[0].goal='泡茶 {"api_key":"opaque-goal-secret"}';}});
 try{
  await s.post({operation:'advance',minutes:15});const index=await(await GET()).json();
  const trace=(await(await GET(new Request('https://test.invalid/api/world?operationId='+encodeURIComponent(index.decisionTraces.records[0].operationId)))).json()).decisionTrace;
  const text=JSON.stringify(trace);for(const secret of ['fixture-key','opaque-state-secret','opaque-goal-secret'])assert.ok(!text.includes(secret),secret);
  assert.equal(trace.redacted,true);assert.ok(text.includes('OBS-HIDDEN'));assert.ok(!s.inputs[0].request.messages[1].content.includes('OBS-HIDDEN'));
  const rest={type:'rest',target:'',content:'休息',purpose:'休息',mood:'平靜',durationMinutes:15,timeIntent:{kind:'open-ended',maxMinutes:null},intents:[]};
  s.choose(rest);await s.post({operation:'advance',minutes:15});assert.ok(s.inputs.every(entry=>!JSON.stringify(entry.request.messages).includes(trace.requestId)));
 }finally{s.restore();}
});

test('each actor dispatch freezes its own sequential world, including unchanged authority scene facts',async()=>{
 const s=await scenario({modify:w=>{const other=structuredClone(w.characters[0]);other.id='other';other.name='其他角色';other.shortTerm=[];other.longTerm=[];other.memories=[];other.memoryTrace=[];other.observations=[];delete other.cognition;delete other.control;w.characters.push(other);w.scene={...(w.scene||{}),doors:{'cafe-door':'closed'},occluded:['cafe-storeroom'],noise:{'cafe-front':'busy'}};}});
 const previous=global.fetch;global.fetch=async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);return Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(fixtureDecision(JSON.parse(JSON.parse(init.body).messages[1].content),{...proposal,type:input.self.id==='owner'?'move':'rest',target:input.self.id==='owner'?'kris-home':'',content:'繼續生活',purpose:'',timeIntent:{kind:input.self.id==='owner'?'completion':'open-ended',maxMinutes:null}}))}}]});};
 try{
  const r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200,await r.clone().text());const id=(await r.json()).operationEvidence.operationId;
  const trace=(await(await GET(new Request('https://test.invalid/api/world?operationId='+encodeURIComponent(id)))).json()).decisionTrace;
  assert.equal(trace.dispatches.length,2);assert.equal(trace.dispatches[0].worldSnapshot.actors.find(a=>a.id==='owner').location,'cafe');assert.equal(trace.dispatches[1].worldSnapshot.actors.find(a=>a.id==='owner').location,'kris-home');
  assert.deepEqual(trace.dispatches[0].worldSnapshot.scene.occluded,['cafe-storeroom']);assert.deepEqual(trace.dispatches[1].worldSnapshot.scene.doors,{'cafe-door':'closed'});
 }finally{global.fetch=previous;s.restore();}
});

test('single-variable wording, purpose and depleted-source controls show actual rule branches without claiming historical causality',async()=>{
 const initial={};
 for(const variant of ['base','wording','purpose','depleted']){
  const decision={...proposal,target:'cup-a',content:variant==='wording'?'嘗試另一個未確認的方法':'泡一杯茶',purpose:variant==='purpose'?'觀察':'飲用'};
  const s=await scenario({decision,reply:{status:'denied',completionMinutes:null,effects:[],stages:[],check:null,routine:null},modify:w=>{
   if(initial.world)Object.assign(w,structuredClone(initial.world));
   else {w.routineRules=[{id:'known-tea',version:1,family:'cafe-service',operations:['tea'],origin:'cafe',knownTo:['owner']}];w.supplies=[{id:'finite-tea',label:'茶葉',region:'cafe-front',remaining:1,owner:'owner',knownTo:['owner'],allowedTo:['owner'],kind:'food',initialState:{}}];initial.world=structuredClone(w);}
   if(variant==='depleted')w.supplies[0].remaining=0;
  }});
  try{
   const r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200,await r.clone().text());const id=(await r.json()).operationEvidence.operationId;
   const trace=(await(await GET(new Request('https://test.invalid/api/world?operationId='+encodeURIComponent(id)))).json()).decisionTrace;
   const checks=trace.steps.filter(step=>step.kind==='rule-selection').map(step=>step.data);
   if(variant==='base'){assert.equal(s.counts().judgments,0);assert.ok(checks.some(item=>item.branch==='program-result'));}
   if(variant==='wording'){assert.equal(s.counts().judgments,1);assert.ok(checks.some(item=>item.check==='template'&&item.wording===false));}
   if(variant==='purpose'){assert.equal(s.counts().judgments,1);assert.ok(checks.some(item=>item.check==='template'&&item.purpose===false));}
   if(variant==='depleted'){assert.equal(s.counts().judgments,0);assert.ok(checks.some(item=>item.check==='obstacle'&&item.branch==='blocked'));assert.equal(trace.dispatches[0].worldSnapshot.supplies[0].remaining,0);}
  }finally{s.restore();}
 }
});

test('trace storage failure leaves a visible gap without undoing or repeating a committed world operation',async()=>{
 const s=await scenario(),store=load('store');
 try{
  store.failTraceWrites(true);const op={operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()},r=await s.post(op);assert.equal(r.status,200);const body=await r.json();assert.equal(body.decisionTraceStatus.status,'write-failed');
  const saved=await(await GET(new Request('https://test.invalid/api/world?operationId='+encodeURIComponent(op.operationId)))).json();assert.equal(saved.world.turn,1);assert.equal(saved.decisionTrace,null);assert.equal(saved.decisionTraces.gap,'trace-write-failed');assert.equal(saved.operation.decisionTraceStatus.gap,'trace-write-failed');
  const replay=await s.post(op);assert.equal(replay.status,200);assert.equal((await replay.json()).decisionTraceStatus.status,'write-failed');assert.deepEqual(s.counts(),{npc:1,judgments:1,dice:0});
 }finally{store.failTraceWrites(false);s.restore();}
});
