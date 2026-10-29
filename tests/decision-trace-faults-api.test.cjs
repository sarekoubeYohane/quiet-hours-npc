/* eslint-disable @typescript-eslint/no-require-imports */
const {fixtureDecision}=require('./pursuit-fixture.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
const {GET}=load('route'),store=load('store'),{scenario,proposal}=require('./routine-program-fixture.cjs');
const lookup=async id=>(await(await GET(new Request('https://test.invalid/api/world?operationId='+encodeURIComponent(id)))).json());
const operation=()=>({operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()});
test('accepted and dispatched checkpoints survive while a real provider response is still unavailable',async()=>{
 const s=await scenario();let release,entered;const ready=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
 global.fetch=async()=>{entered();await gate;throw Error('fixture unavailable');};
 const op=operation();let running;
 try{
  running=s.post(op);await ready;const pending=await lookup(op.operationId);
  assert.ok(pending.decisionTrace,'in-flight operation must expose its durable checkpoint');
  assert.equal(pending.decisionTrace.outcome,'unknown');assert.ok(pending.decisionTrace.dispatches[0].requestBody);
  assert.ok(['dispatch-prepared','dispatched'].includes(pending.decisionTrace.dispatches[0].stage));
  release();const r=await running;assert.equal(r.status,502);
  const saved=await lookup(op.operationId);assert.equal(saved.decisionTrace.outcome,'rolled-back');
  assert.equal(saved.decisionTrace.dispatches[0].failure.kind,'transport');
  assert.equal(saved.decisionTrace.dispatches[0].responseBody,undefined);
 }finally{release();await running;s.restore();}
});

for(const task of ['npc','adjudication'])for(const kind of ['provider-body','candidate-format','http','transport']){
 test(`${task} ${kind} keeps the actual fault evidence and never commits or redispatches candidates`,async()=>{
  const s=await scenario();const original=global.fetch,op=operation(),before=store.snapshot();let sent=0,body;
  global.fetch=async(url,init)=>{
   sent++;const actual=JSON.parse(JSON.parse(init.body).messages[1].content),isFault=(actual.contractVersion==='world-adjudication.v1')===(task==='adjudication');
   if(!isFault)return original(url,init);
   if(kind==='transport')throw Error('fixture network failure');
   body=kind==='provider-body'?'{BROKEN-WIRE':JSON.stringify({usage:{prompt_tokens:17,completion_tokens:3},choices:kind==='http'?[]:[{message:{content:'{BROKEN-CANDIDATE'}}]});
   return new Response(body,{status:kind==='http'?429:200});
  };
  try{
   const response=await s.post(op),first=await response.json();assert.equal(response.status,502);
   const data=await lookup(op.operationId),trace=data.decisionTrace,dispatch=trace.dispatches.at(-1);
   assert.equal(trace.outcome,'rolled-back');assert.equal(dispatch.task,task);assert.ok(dispatch.requestBody);
   if(kind==='candidate-format'){assert.equal(dispatch.rawCandidate,'{BROKEN-CANDIDATE');if(task==='npc'){assert.equal(dispatch.failure.kind,'candidate-format');assert.equal(dispatch.failure.stage,'npc-candidate-parse');}assert.ok(trace.steps.some(step=>step.kind==='round-failure'));}
   else assert.equal(dispatch.failure.kind,kind);
   if(kind!=='transport')assert.equal(dispatch.responseBody,body);else assert.equal(dispatch.responseBody,undefined);
   if(kind==='http')assert.deepEqual(dispatch.usage,{inputTokens:17,outputTokens:3});
   assert.equal(data.world.turn,before.turn);assert.deepEqual(data.world.objects,before.objects);assert.deepEqual(data.world.events,before.events);
   const calls=sent;assert.deepEqual(await(await s.post(op)).json(),first);assert.equal(sent,calls);
   assert.deepEqual((await lookup(op.operationId)).decisionTrace,trace);
  }finally{s.restore();}
 });
}

test('a later actor failure preserves earlier execution candidates but rolls back the entire world',async()=>{
 const s=await scenario({modify:w=>{const second=structuredClone(w.characters[0]);second.id='second';second.shortTerm=[];second.longTerm=[];second.memories=[];second.memoryTrace=[];second.observations=[];delete second.cognition;delete second.control;w.characters.push(second);}}),op=operation(),before=store.snapshot();
 let calls=0;global.fetch=async(_fixtureUrl,_fixtureInit)=>{if(++calls===2)throw Error('second actor failure');return Response.json({usage:{prompt_tokens:9,completion_tokens:2},choices:[{message:{content:JSON.stringify(fixtureDecision(JSON.parse(JSON.parse(_fixtureInit.body).messages[1].content),{...proposal,type:'move',target:'kris-home',content:'移動',purpose:'',timeIntent:{kind:'completion',maxMinutes:null}}))}}]});};
 try{
  assert.equal((await s.post(op)).status,502);const data=await lookup(op.operationId),t=data.decisionTrace;
  assert.equal(t.dispatches.length,2);assert.equal(t.outcome,'rolled-back');assert.equal(t.dispatches[1].worldSnapshot.actors.find(a=>a.id==='owner').location,'kris-home');
  assert.equal(data.world.characters.find(a=>a.id==='owner').location,before.characters[0].location);assert.deepEqual(data.world.objects,before.objects);assert.equal(data.world.turn,0);
  assert.ok(t.steps.some(step=>step.kind==='npc-feedback'&&step.actorId==='owner'));assert.equal(data.world.aiUsage.totalCalls,2);assert.equal(data.world.aiUsage.totalInputTokens,9);
  await s.post(op);assert.equal(calls,2);
 }finally{s.restore();}
});

for(const method of ['throwBeforeNextSave','throwAfterNextSave','conflictOnNextSave'])test(`${method} has a durable commit outcome and same-ID retry changes no effects or dice`,async()=>{
 const s=await scenario(),op=operation(),before=store.snapshot();store[method]();
 try{
  const r=await s.post(op),body=await r.json(),data=await lookup(op.operationId);
  assert.equal(r.status,method==='throwAfterNextSave'?200:502);assert.ok(data.decisionTrace);
  assert.equal(data.decisionTrace.outcome,method==='throwAfterNextSave'?'committed':'not-committed');
  if(method!=='throwAfterNextSave'){assert.equal(data.world.turn,before.turn);assert.deepEqual(data.world.objects,before.objects);}
  const counts=s.counts();const again=await s.post(op);assert.equal(again.status,r.status);assert.deepEqual(await again.json(),body);assert.deepEqual(s.counts(),counts);assert.deepEqual((await lookup(op.operationId)).world,data.world);
 }finally{s.restore();}
});

test('a conflict replacing the journal cannot turn the same accepted operation into a new model call',async()=>{
 const s=await scenario(),op=operation(),newer=store.snapshot();newer.turn=8;store.conflictOnNextSave(newer,{version:10});
 try{
  const r=await s.post(op);assert.equal(r.status,502);const data=await lookup(op.operationId);assert.equal(data.world.turn,8);assert.equal(data.decisionTrace.outcome,'not-committed');
  const counts=s.counts();const replay=await s.post(op);assert.equal(replay.status,502);assert.equal((await replay.json()).operationUncertain,true);assert.deepEqual(s.counts(),counts);
 }finally{s.restore();}
});

for(const task of ['npc','adjudication'])test(`${task} timeout records no answer then preserves a late discarded reply without resuming world work`,async()=>{
 const s=await scenario(),original=global.fetch,originalTimeout=AbortSignal.timeout,op=operation();let release,entered;
 const ready=new Promise(r=>entered=r),gate=new Promise(r=>release=r);let calls=0;
 // AbortSignal.timeout uses an unref timer; this deliberately unresolved
 // transport gate must keep the test event loop alive until timeout wins.
 const keepAlive=setInterval(()=>{},1000);
 AbortSignal.timeout=ms=>originalTimeout(ms<=25000?Math.min(ms,100):ms);
 global.fetch=async(url,init)=>{
  calls++;const input=JSON.parse(JSON.parse(init.body).messages[1].content);if((input.contractVersion==='world-adjudication.v1')!==(task==='adjudication'))return original(url,init);
  entered();await gate;return Response.json({usage:{prompt_tokens:12,completion_tokens:4},choices:[{message:{content:JSON.stringify(fixtureDecision(JSON.parse(JSON.parse(init.body).messages[1].content),proposal))}}]});
 };
 let running;
 try{
  running=s.post(op);await ready;const r=await running;assert.equal(r.status,502);const first=await r.json(),before=await lookup(op.operationId),dispatch=before.decisionTrace.dispatches.at(-1);
  assert.equal(dispatch.failure.kind,'timeout');assert.equal(dispatch.responseBody,undefined);assert.equal(before.decisionTrace.outcome,'rolled-back');
  release();for(let i=0;i<30;i++){await new Promise(r=>setTimeout(r,5));if((await lookup(op.operationId)).decisionTrace.dispatches.at(-1).discarded)break;}
  const after=await lookup(op.operationId),late=after.decisionTrace.dispatches.at(-1);assert.equal(late.stage,'late-discarded');assert.equal(late.discarded,true);assert.deepEqual(late.lateUsage,{inputTokens:12,outputTokens:4});assert.ok(late.responseBody);
  assert.equal(after.decisionTrace.outcome,'rolled-back');assert.deepEqual(after.world,before.world);assert.equal(after.version,before.version);const sent=calls;
  assert.deepEqual(await(await s.post(op)).json(),first);assert.equal(calls,sent);
 }finally{release();try{await running;}finally{clearInterval(keepAlive);AbortSignal.timeout=originalTimeout;s.restore();}}
});

test('an expired lease discards the received candidate and preserves trace identity after uncertain replay',async()=>{
 const s=await scenario(),op=operation(),clock=Date.now;let now=clock(),entered,release;Date.now=()=>now;
 const ready=new Promise(r=>entered=r),gate=new Promise(r=>release=r);let sent=0;
 global.fetch=async(_fixtureUrl,_fixtureInit)=>{sent++;entered();await gate;return Response.json({usage:{prompt_tokens:6,completion_tokens:2},choices:[{message:{content:JSON.stringify(fixtureDecision(JSON.parse(JSON.parse(_fixtureInit.body).messages[1].content),{...proposal,type:'rest',target:'',content:'休息',purpose:'',timeIntent:{kind:'open-ended',maxMinutes:null}}))}}]});};
 let running;
 try{
  running=s.post(op);await ready;now+=440000;const expired=await s.post(op);assert.equal(expired.status,502);assert.equal((await expired.json()).operationUncertain,true);
  release();await running;for(let i=0;i<30;i++){if((await lookup(op.operationId)).decisionTrace.dispatches[0].responseBody)break;await new Promise(r=>setTimeout(r,5));}const saved=await lookup(op.operationId);assert.equal(saved.world.turn,0);assert.equal(saved.decisionTrace.outcome,'unknown');assert.ok(saved.decisionTrace.dispatches[0].responseBody);assert.equal(saved.decisionTrace.dispatches[0].discarded,true);assert.ok(saved.decisionTrace.steps.some(step=>step.kind==='round-failure'));
  assert.equal(saved.decisionTrace.requestId,saved.decisionTraces.records.find(item=>item.operationId===op.operationId).requestId);
  const before=structuredClone(saved.world);await s.post(op);assert.equal(sent,1);assert.deepEqual((await lookup(op.operationId)).world,before);
 }finally{release();await running;Date.now=clock;s.restore();}
});

test('an evicted or cleared in-flight trace is not reinserted by a late worker',async()=>{
 const s=await scenario(),op=operation(),clock=Date.now;let now=clock(),entered,release;Date.now=()=>now;
 const ready=new Promise(r=>entered=r),gate=new Promise(r=>release=r);let sent=0;
 global.fetch=async()=>{sent++;entered();await gate;throw Error('late provider failure');};let running;
 try{
  running=s.post(op);await ready;now+=440000;await running;
  for(let i=0;i<66;i++){now++;const response=await s.post({operation:'takeover'});assert.equal(response.status,200,await response.clone().text());}
  assert.equal((await lookup(op.operationId)).decisionTrace,null);
  const before=(await lookup(op.operationId)).world;release();await running;const after=await lookup(op.operationId);
  assert.equal(after.decisionTrace,null);assert.deepEqual(after.world.characters,before.characters);assert.deepEqual(after.world.objects,before.objects);assert.equal(after.world.turn,before.turn);assert.equal(after.world.aiUsage.totalCalls,1);assert.equal((await s.post(op)).status,410);assert.equal(sent,1);assert.ok(after.decisionTraces.retention.count<=64);
 }finally{release();await running;Date.now=clock;s.restore();}
});

test('checkpoint writes failing after dispatch preserve the last durable input and expose the gap without reexecution',async()=>{
 const s=await scenario(),original=global.fetch,op=operation();let sent=0;
 global.fetch=async(url,init)=>{sent++;store.failTraceWrites(true);return original(url,init);};
 try{
  const r=await s.post(op);assert.equal(r.status,200);const first=await r.json();assert.equal(first.decisionTraceStatus.status,'write-failed');
  const data=await lookup(op.operationId);assert.ok(data.decisionTrace);assert.equal(data.decisionTrace.outcome,'unknown');assert.equal(data.decisionTrace.lastKnownStage,'dispatch-prepared');assert.equal(data.decisionTrace.dispatches[0].responseBody,undefined);
  assert.equal(data.operation.decisionTraceStatus.gap,'trace-write-failed');assert.ok(data.operation.decisionTraceStatus.lastKnownStage);assert.equal(data.world.turn,1);
  const calls=sent;assert.deepEqual(await(await s.post(op)).json(),first);assert.equal(sent,calls);
 }finally{store.failTraceWrites(false);s.restore();}
});

test('cross-provider secret must be masked in an early checkpoint',async()=>{
 const otherKey='opaque-OTHER-provider-fixture-secret';
 const s=await scenario({modify:w=>{w.adjudication={provider:'openrouter',model:'fixture-world'};w.characters[0].goal='工作備註：'+otherKey;}});
 await s.post({operation:'set-model-key',mode:'ai',key:otherKey});
 let release,entered;const gate=new Promise(r=>release=r),ready=new Promise(r=>entered=r);
 global.fetch=async()=>{entered();await gate;throw Error('fixture ended');};
 const op={operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()};let running;
 try{
  running=s.post(op);await ready;
  const data=await(await GET(new Request('https://test.invalid/api/world?operationId='+encodeURIComponent(op.operationId)))).json();
  assert.ok(data.decisionTrace);assert.ok(!JSON.stringify(data.decisionTrace).includes(otherKey),'unregistered adjudication key leaked into durable NPC input checkpoint');
 }finally{release();await running;s.restore();}
});

for(const status of [200,429])test(`HTTP ${status} body-read failure preserves known headers and provider classification`,async()=>{
 const s=await scenario(),op=operation();let calls=0;
 global.fetch=async()=>{calls++;return new Response(new ReadableStream({start(controller){controller.error(Error('fixture body interrupted'));}}),{status});};
 try{
  const r=await s.post(op);assert.equal(r.status,502);const data=await r.json(),saved=await lookup(op.operationId),d=saved.decisionTrace.dispatches[0];
  assert.equal(d.httpStatus,status);assert.equal(d.failure.kind,'response-body');assert.equal(d.responseBody,undefined);assert.equal(data.stopReason.scope,status===429?'provider':'technical');
  assert.equal(d.usage,undefined);assert.equal(saved.world.turn,0);await s.post(op);assert.equal(calls,1);
 }finally{s.restore();}
});

test('an abort during the prepared checkpoint does not invent a provider dispatch',async()=>{
 const s=await scenario(),op=operation(),originalTimeout=AbortSignal.timeout;let sent=0;
 AbortSignal.timeout=ms=>{if(ms>25000)return originalTimeout(ms);const controller=new AbortController();store.onNextTraceWrite(()=>controller.abort());return controller.signal;};
 global.fetch=async()=>{sent++;throw Error('must not dispatch');};
 try{
  const r=await s.post(op);assert.equal(r.status,502);const data=await lookup(op.operationId),d=data.decisionTrace.dispatches[0];assert.equal(sent,0);assert.equal(d.stage,'dispatch-prepared');assert.equal(d.responseBody,undefined);assert.equal(data.operation.evidence.counts.npc,0);assert.equal(data.world.turn,0);
  await s.post(op);assert.equal(sent,0);
 }finally{AbortSignal.timeout=originalTimeout;s.restore();}
});

test('unavailable prior-acceptance lookup stops before dispatch and the same ID can recover after reads return',async()=>{
 const s=await scenario(),op=operation(),before=await lookup(op.operationId);
 try{
  store.failNextTraceRead();const r=await s.post(op),body=await r.json();assert.equal(r.status,503);assert.equal(body.operationUncertain,true);assert.equal(body.decisionTraceStatus.gap,'prior-acceptance-unavailable');assert.equal(body.decisionTraceStatus.lastKnownStage,'before-acceptance');assert.ok(!body.error.includes('fixture archive'));assert.deepEqual(s.counts(),{npc:0,judgments:0,dice:0});
  const data=await lookup(op.operationId);assert.deepEqual(data.world.characters,before.world.characters);assert.deepEqual(data.world.objects,before.world.objects);assert.deepEqual(data.world.events,before.world.events);assert.equal(data.world.turn,before.world.turn);assert.equal(data.world.aiUsage.totalCalls,0);assert.equal(data.version,before.version);assert.equal(data.decisionTrace,null);
  assert.equal((await s.post(op)).status,200);const counts=s.counts();await s.post(op);assert.deepEqual(s.counts(),counts);
 }finally{s.restore();}
});

test('fault records obey the shared count, byte and single-record limits through API reads',async()=>{
 for(const kind of ['count','bytes','record']){
  const s=await scenario({modify:w=>{w.playerBudget={calls:null,tokens:null};}});let sent=0;const raw=kind==='count'?'{broken':'!'.repeat(kind==='record'?1100000:780000);
  global.fetch=async()=>{sent++;return new Response(raw,{status:200});};
  try{
   const runs=kind==='count'?66:kind==='bytes'?24:1;let first;
   for(let i=0;i<runs;i++){const op=operation();first??=op;assert.equal((await s.post(op)).status,502);}
   const data=await lookup(first.operationId),retention=data.decisionTraces.retention;
   assert.ok(retention.count<=64);assert.ok(retention.bytes<=16*1024*1024);
   if(kind==='count')assert.equal(retention.evicted,2);
   if(kind==='bytes')assert.ok(retention.evicted>0);
   if(kind==='record'){const t=data.decisionTrace;assert.equal(t.gap,'single-record-limit');assert.equal(t.dispatches[0].failure.kind,'provider-body');assert.ok(t.omittedOriginalBytes>1024*1024);assert.ok(t.gaps.includes('single-record-limit'));}
   const calls=sent;await s.post(first);assert.equal(sent,calls);
  }finally{s.restore();}
 }
});

test('an oversized late reply keeps known usage, discard classification and gaps in its bounded receipt',async()=>{
 const s=await scenario(),op=operation(),originalTimeout=AbortSignal.timeout;let release,entered;const ready=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
 // AbortSignal.timeout uses an unref timer; this deliberately unresolved
 // transport gate must keep the test event loop alive until timeout wins.
 const keepAlive=setInterval(()=>{},1000);
 AbortSignal.timeout=ms=>originalTimeout(ms<=25000?Math.min(ms,100):ms);
 global.fetch=async()=>{entered();store.onNextTraceWrite(()=>{throw Error('fixture one checkpoint failure');});await gate;return Response.json({usage:{prompt_tokens:12,completion_tokens:4},choices:[{message:{content:'x'.repeat(1100000)}}]});};let running;
 try{
  running=s.post(op);await ready;assert.equal((await running).status,502);const before=await lookup(op.operationId);release();
  let after;for(let i=0;i<30;i++){await new Promise(r=>setTimeout(r,5));after=await lookup(op.operationId);if(after.decisionTrace.dispatches[0].discarded)break;}
  const t=after.decisionTrace,d=t.dispatches[0];assert.equal(t.gap,'single-record-limit');assert.ok(t.gaps.includes('checkpoint-write-failed'));assert.equal(d.discarded,true);assert.equal(d.failure.kind,'timeout');assert.deepEqual(d.lateUsage,{inputTokens:12,outputTokens:4});assert.deepEqual(after.world,before.world);assert.ok(Buffer.byteLength(JSON.stringify(t))<=1024*1024);
 }finally{release();try{await running;}finally{clearInterval(keepAlive);AbortSignal.timeout=originalTimeout;s.restore();}}
});

test('a valid JSON NPC reply with an illegal action is a contract validation failure rather than a parse failure',async()=>{
 const s=await scenario({decision:{...proposal,type:'delete-world'}}),op=operation();
 try{
  assert.equal((await s.post(op)).status,502);const data=await lookup(op.operationId),d=data.decisionTrace.dispatches[0];assert.equal(d.failure.kind,'candidate-validation');assert.equal(d.failure.stage,'npc-candidate-validation');assert.equal(data.world.turn,0);assert.ok(d.responseBody);assert.equal(data.decisionTrace.outcome,'rolled-back');
  await s.post(op);assert.deepEqual(s.counts(),{npc:1,judgments:0,dice:0});
 }finally{s.restore();}
});

for(const operationName of ['takeover','advance-demo','advance-openai'])test(`an unused damaged provider key cannot block ${operationName} and unsafe trace content is explicitly omitted`,async()=>{
 const marker='opaque-unreadable-provider-credential',s=await scenario({modify:w=>{w.characters[0].goal=marker;w.objects[0].label=marker;}}),op=operation();
 await s.post({operation:'set-model-key',mode:'ai',key:marker});
 // Corruption is injected at the encrypted storage boundary; assertions remain
 // at the world API rather than depending on stored trace table internals.
 await store.database().prepare('UPDATE account_model_keys SET ciphertext = ? WHERE provider = ?').bind('damaged','openrouter').run();
 try{
  const r=await s.post({...op,...(operationName==='takeover'?{operation:'takeover'}:operationName==='advance-demo'?{mode:'demo'}:{})});assert.equal(r.status,200,await r.clone().text());
  const data=await lookup(op.operationId),t=data.decisionTrace;assert.equal(t.outcome,'committed');assert.ok(t.gaps.includes('credential-redaction-unavailable'));assert.equal(t.result,undefined);assert.deepEqual(t.steps,[]);assert.ok(!JSON.stringify(t).includes(marker));assert.ok(t.dispatches.every(d=>d.requestBody===undefined&&d.responseBody===undefined&&d.worldSnapshot===undefined&&d.actorId===undefined&&d.model===undefined));
  if(operationName==='takeover'){for(let i=0;i<9;i++)assert.equal((await s.post({operation:'takeover'})).status,200);const index=await(await GET()).json();assert.ok(index.decisionTraces.records.some(item=>item.operationId===op.operationId),'context-unknown metadata must remain discoverable after journal eviction');assert.equal((await lookup(op.operationId)).decisionTrace.gap,'credential-redaction-unavailable');}
  if(operationName!=='advance-openai')assert.deepEqual(s.counts(),{npc:0,judgments:0,dice:0});else assert.deepEqual(s.counts(),{npc:1,judgments:1,dice:0});
 }finally{s.restore();}
});

test('a rolled candidate and its D20 remain evidence only after a failed commit and same-ID retry never rerolls',async()=>{
 const {uncertain,raw}=require('./routine-results-fixture.cjs');const s=await scenario({reply:uncertain(),supplies:raw(),random:.275}),op=operation();store.throwBeforeNextSave();
 try{
  const first=await s.post(op);assert.equal(first.status,502);const data=await lookup(op.operationId);assert.equal(data.decisionTrace.outcome,'not-committed');assert.equal(data.world.turn,0);assert.equal(s.counts().dice,1);
  assert.ok(data.decisionTrace.steps.some(step=>step.kind==='npc-feedback'&&step.data.resolutions.some(item=>item.resolution.roll===6)));const counts=s.counts(),before=data.world;
  assert.equal((await s.post(op)).status,502);assert.deepEqual(s.counts(),counts);assert.deepEqual((await lookup(op.operationId)).world,before);
 }finally{s.restore();}
});
