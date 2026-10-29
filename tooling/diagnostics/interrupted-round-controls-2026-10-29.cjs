/* eslint-disable @typescript-eslint/no-require-imports */
/* Synthetic controls; real route / serialization / isolated SQLite. */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
const {GET}=load('route'),store=load('store');
const {scenario,proposal}=require('../../tests/routine-program-fixture.cjs');
const lookup=async op=>(await(await GET(new Request('https://test.invalid/api/world?operationId='+op.operationId))).json());
const decision={...proposal,type:'rest',target:'',content:'Synthetic rest'};
const envelope=raw=>Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:raw}}]});
function clock(){
 const oldNow=Date.now,oldTimeout=AbortSignal.timeout;let now=1793246600000,queue=[];
 Date.now=()=>now;
 const sleep=ms=>new Promise(resolve=>queue.push({at:now+ms,run:resolve}));
 AbortSignal.timeout=ms=>{const c=new AbortController();queue.push({at:now+ms,run:()=>c.abort(new DOMException('fixture timeout','TimeoutError'))});return c.signal;};
 return {sleep,async run(work){let done=false,value,error;work.then(x=>{done=true;value=x},e=>{done=true;error=e});
  for(let i=0;!done&&i<20000;i++){await new Promise(r=>setImmediate(r));if(done)break;queue.sort((a,b)=>a.at-b.at);const next=queue.shift();if(next){now=next.at;next.run();}}
  assert.ok(done);if(error)throw error;return value;
 },restore(){Date.now=oldNow;AbortSignal.timeout=oldTimeout;}};
}
for(const kind of ['normal','invalid-candidate','slow-candidate-save','read-failure','trace-write-failure'])test(kind+' independent control',async()=>{
 const c=clock();let s,sent=0,delayed=false;
 try{
  s=await scenario();const op={operation:'advance',minutes:15,operationId:Date.now()+':00000000-0000-4000-8000-000000000002'};
  global.fetch=async()=>{sent++;return envelope(kind==='invalid-candidate'?'{BROKEN':JSON.stringify(decision));};
  if(kind==='slow-candidate-save')store.onStorage(async(sql,values)=>{
   if(!delayed&&(sql.startsWith('INSERT INTO decision_traces')||sql.startsWith('UPDATE decision_traces'))){const t=JSON.parse(values[sql.startsWith('INSERT')?5:0]);if(t.lastKnownStage==='candidate-received'){delayed=true;await c.sleep(26000);}}
  });
  if(kind==='trace-write-failure')store.failTraceWrites(true);
  const response=await c.run(s.post(op)),body=await response.json();store.onStorage(undefined);store.failTraceWrites(false);
  const expectedFailure=['invalid-candidate','slow-candidate-save'].includes(kind);
  assert.equal(response.status,expectedFailure?502:200);
  if(kind==='read-failure'){
   store.failNextTraceRead();const failedRead=await lookup(op);
   assert.equal(failedRead.decisionTraces.gap,'trace-read-failed');
   assert.equal(failedRead.operation.state,'settled');assert.equal(failedRead.world.turn,1);
  }
  const saved=await lookup(op);
  assert.equal(saved.operation.state,'settled');assert.equal(saved.world.turn,expectedFailure?0:1);
  assert.equal(saved.world.aiUsage.totalCalls,1);assert.equal(saved.world.aiUsage.totalInputTokens,30);
  assert.equal(saved.world.aiUsage.totalOutputTokens,10);
  const replay=await s.post(op);assert.equal(replay.status,response.status);assert.deepEqual(await replay.json(),body);assert.equal(sent,1);
  if(kind==='normal')assert.equal(saved.decisionTrace.checkpoints.at(-1).completedAt,undefined,'even successful final snapshot cannot contain its own later completion time');
  if(kind==='invalid-candidate')assert.equal(saved.decisionTrace.dispatches[0].failure.reason,'json-parse');
  console.log('INTERRUPTION_CONTROL '+JSON.stringify({kind,status:response.status,state:saved.operation.state,outcome:saved.decisionTrace?.outcome,stage:saved.decisionTrace?.lastKnownStage,calls:sent,knownTokens:40,worldCalls:saved.world.aiUsage.totalCalls,turn:saved.world.turn,traceStatus:body.decisionTraceStatus?.status}));
 }finally{store.onStorage(undefined);store.failTraceWrites(false);s?.restore();c.restore();}
});
