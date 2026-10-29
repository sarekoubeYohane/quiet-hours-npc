/* eslint-disable @typescript-eslint/no-require-imports */
const {fixtureDecision}=require('./pursuit-fixture.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
const {GET}=load('route'),store=load('store'),{scenario,proposal}=require('./routine-program-fixture.cjs');
const lookup=async id=>(await(await GET(new Request('https://test.invalid/api/world?operationId='+encodeURIComponent(id)))).json());
const operation=()=>({operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()});
// Synthetic candidates, not recovered production transcripts.
for(const [kind,reason] of [['json','json-parse'],['long','memory-selection-reference'],['version','memory-selection-reference'],['foreign','memory-selection-reference'],['format','field-format']])test(`NPC ${kind} failure rereads its safe validation reason without partial commits or replay`,async()=>{
 const s=await scenario({modify:w=>{
  const second=structuredClone(w.characters[0]);second.id='second';second.shortTerm=[{id:'second-short',characterId:'second',version:1,time:w.minute,text:'PRIVATE-EXPERIENCE',source:{kind:'experience'}}];second.longTerm=[{id:'second-long',characterId:'second',version:1,time:w.minute,text:'PRIVATE-LONG',source:{kind:'experience'},origin:{id:'old',version:1},reason:'保留'}];second.memories=[];second.observations=[];second.memoryTrace=[];delete second.cognition;delete second.control;w.characters.push(second);
 }}),op=operation(),before=await s.read();let calls=0;
 global.fetch=async(_fixtureUrl,_fixtureInit)=>{
  calls++;const ref=kind==='long'?{id:'second-long',version:1}:kind==='foreign'?{id:before.characters[0].shortTerm[0].id,version:1}:{id:'second-short',version:kind==='version'?2:1};
  const candidate={...proposal,type:'move',target:'kris-home',content:'移動',purpose:'',memorySelections:calls===1?[]:[{...ref,reason:kind==='format'?'':'留作回憶'}]};
  return Response.json({usage:{prompt_tokens:9,completion_tokens:2},choices:[{message:{content:calls===2&&kind==='json'?'{PRIVATE-MALFORMED':JSON.stringify(fixtureDecision(JSON.parse(JSON.parse(_fixtureInit.body).messages[1].content),candidate))}}]});
 };
 try{
  const r=await s.post(op),first=await r.json();assert.equal(r.status,502);const data=await lookup(op.operationId),trace=data.decisionTrace;
  assert.equal(trace.outcome,'rolled-back');assert.equal(trace.dispatches[1].actorId,'second');assert.equal(trace.dispatches[1].failure.reason,reason);
  assert.equal(trace.dispatches[1].failure.stage,kind==='json'?'npc-candidate-parse':'npc-candidate-validation');
  const actual=structuredClone(data.world),expected=structuredClone(before);delete actual.aiUsage;delete expected.aiUsage;assert.deepEqual(actual,expected);
  assert.equal(data.world.aiUsage.totalCalls,2);assert.equal(data.world.aiUsage.totalInputTokens,18);
  assert.deepEqual((await lookup(op.operationId)).decisionTrace,trace);
  assert.deepEqual(await(await s.post(op)).json(),first);assert.equal(calls,2);assert.deepEqual((await lookup(op.operationId)).decisionTrace,trace);
 }finally{s.restore();}
});

for(const mode of ['normal','omitted','write-failed'])test(`NPC safe reason ${mode} follows bounded private history and never enters console or NPC context`,async()=>{
 const privateText='PRIVATE-DIAGNOSTIC-FIXTURE',credential='fixture-key';
 const s=await scenario(),op=operation(),auth=load('auth'),logs=[],original={log:console.log,warn:console.warn,error:console.error};
 for(const method of Object.keys(original))console[method]=(...args)=>logs.push(args);
 let calls=0;
 global.fetch=async(_fixtureUrl,_fixtureInit)=>{
  calls++;if(mode==='write-failed')store.failTraceWrites(true);
  const candidate={...proposal,type:'rest',target:'',content:privateText,purpose:'',memorySelections:[{id:'unknown-ref',version:1,reason:'保留'}]};
  const raw=mode==='omitted'?'{'+'x'.repeat(1100000):JSON.stringify(fixtureDecision(JSON.parse(JSON.parse(_fixtureInit.body).messages[1].content),candidate));
  return Response.json({usage:{prompt_tokens:8,completion_tokens:2},choices:[{message:{content:raw}}]});
 };
 try{
  const r=await s.post(op);assert.equal(r.status,502);const first=await r.json(),saved=await lookup(op.operationId),trace=saved.decisionTrace;
  if(mode==='write-failed'){
   assert.equal(first.decisionTraceStatus.status,'write-failed');assert.equal(saved.operation.decisionTraceStatus.gap,'trace-write-failed');
   assert.equal(trace.dispatches[0].failure,undefined,'last durable prepared checkpoint cannot invent a later reason');
  }else{
   assert.equal(trace.dispatches[0].failure.reason,mode==='omitted'?'json-parse':'memory-selection-reference');
   if(mode==='omitted'){assert.equal(trace.gap,'single-record-limit');assert.equal(trace.dispatches[0].rawCandidate,undefined);}
  }
  assert.ok(!JSON.stringify(logs).includes(privateText));assert.ok(!JSON.stringify(logs).includes(credential));
  assert.ok(!JSON.stringify(trace).includes(credential));
  store.installForOwner('other-owner',load('world').seedWorld());auth.setUserId('other-owner');
  assert.equal((await lookup(op.operationId)).decisionTrace,null);auth.setUserId('test-owner');
  assert.deepEqual((await lookup(op.operationId)).decisionTrace,trace);
  await s.post(op);assert.equal(calls,1);
  store.failTraceWrites(false);
  global.fetch=async(_url,init)=>{
   const input=JSON.parse(init.body);assert.ok(!JSON.stringify(input).includes(privateText));assert.ok(!JSON.stringify(input).includes('memory-selection-reference'));
   return Response.json({usage:{prompt_tokens:8,completion_tokens:2},choices:[{message:{content:JSON.stringify(fixtureDecision(JSON.parse(JSON.parse(init.body).messages[1].content),{...proposal,type:'rest',target:'',content:'休息',purpose:'',timeIntent:{kind:'open-ended',maxMinutes:null},memorySelections:[]}))}}]});
  };
  assert.equal((await s.post(operation())).status,200);
 }finally{Object.assign(console,original);auth.setUserId('test-owner');store.failTraceWrites(false);s.restore();}
});
