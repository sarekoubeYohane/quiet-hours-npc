/* eslint-disable @typescript-eslint/no-require-imports -- Public API, provider transport, elapsed clock and real SQLite. */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
const {GET,POST}=load('route'),store=load('store'),{env}=load('cloudflare-workers');
const {scenario,proposal}=require('./routine-program-fixture.cjs');
const query=async id=>(await(await GET(new Request('https://test.invalid/api/world?operationId='+encodeURIComponent(id)))).json());
const op=()=>({operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()});
function clock(){
 const now=Date.now,timeout=AbortSignal.timeout;let instant=now(),queue=[];
 Date.now=()=>instant;
 const sleep=ms=>new Promise(resolve=>queue.push({at:instant+ms,run:resolve}));
 AbortSignal.timeout=ms=>{const c=new AbortController();queue.push({at:instant+ms,run:()=>c.abort(new DOMException('fixture deadline','TimeoutError'))});return c.signal;};
 return {sleep,now:()=>instant,async run(work){let done=false,value,error;work.then(v=>{done=true;value=v;},e=>{done=true;error=e;});
  for(let i=0;!done&&i<20000;i++){await new Promise(resolve=>setImmediate(resolve));if(done)break;queue.sort((a,b)=>a.at-b.at);const next=queue.shift();if(next){instant=next.at;next.run();}}
  assert.ok(done,'operation must settle under a finite clock');if(error)throw error;return value;
 },restore(){Date.now=now;AbortSignal.timeout=timeout;}};
}
const envelope=body=>JSON.stringify({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(body)}}]});
function actors(w,count=4){const first=w.characters[0];w.characters=Array.from({length:count},(_,i)=>({...structuredClone(first),id:i?'actor-'+i:'owner',name:'Synthetic '+i,shortTerm:[],longTerm:[],memories:[],memoryTrace:[],observations:[],control:{mode:'autonomous'}}));w.playerBudget={calls:null,tokens:null};}
async function replay(s,operation,response,body,sent){
 const before=sent();const again=await s.post(operation);assert.equal(again.status,response.status);assert.deepEqual(await again.json(),body);assert.equal(sent(),before,'same ID is never a second dispatch');
 const saved=await query(operation.operationId);assert.equal(saved.operation.state,body.operationUncertain?'uncertain':'settled');return saved;
}
for(const config of [
 {name:'eight 14s replies',latency:14000},
 {name:'eight 12s replies and every trace save 0.4s',latency:12000,checkpoint:400},
 {name:'twelve chats with four legal recalls and bounded storage',latency:21000,checkpoint:400,recall:true},
])test(config.name+' commit a full four-slot round and replay exactly',async()=>{
 const c=clock();let s,sent=0,embedding=0,searches=0,writes=0;const wire=[],stages=new Map();
 try{
  s=await scenario({modify:w=>actors(w)});const before=await s.read(),started=Date.now();
  if(config.recall){env.RECALL_ENABLED='true';env.RECALL_USAGE_DB=store.database();env.OWNER_EMBEDDING_KEY='synthetic-owner-key';env.MEMORY_VECTOR_INDEX={query:async()=>{searches++;await c.sleep(2000);return {matches:[]};}};}
  const hook=async()=>{writes++;store.onNextTraceWrite(hook);if(config.checkpoint)await c.sleep(config.checkpoint);};store.onNextTraceWrite(hook);
  global.fetch=async(url,init)=>{
   if(String(url).includes('embeddings')){embedding++;await c.sleep(2000);return Response.json({usage:{total_tokens:7},data:[{index:0,embedding:Array(1536).fill(.1)}]});}
   const request=JSON.parse(init.body),input=JSON.parse(request.messages[1].content),judge=input.contractVersion==='world-adjudication.v1';
   const actor=judge?input.actor?.id:input.self.id;wire.push({at:Date.now(),input,request,judge,actor});sent++;
   let value={status:'denied',effects:[],stages:[],check:null,routine:null};
   if(!judge){const n=(stages.get(actor)||0)+1;stages.set(actor,n);value=config.recall&&n===1?{type:'recall',questions:['Synthetic earlier context?']}:{...proposal,content:'Inspect synthetic tools',intents:[{id:'purpose',content:'Understand my surroundings',intensity:'medium',importance:'medium',urgency:'low',context:'Synthetic fixture'}]};}
   await c.sleep(config.latency);return new Response(envelope(value),{status:200});
  };
  const operation=op(),response=await c.run(s.post(operation)),body=await response.json();
  assert.equal(response.status,200,body.error);assert.equal(sent,config.recall?12:8);assert.equal(embedding,config.recall?4:0);assert.equal(searches,config.recall?4:0);
  store.onNextTraceWrite(()=>{});const saved=await replay(s,operation,response,body,()=>sent);
  assert.equal(saved.world.turn,before.turn+1);assert.equal(saved.world.minute,before.minute+15);assert.equal(saved.world.aiUsage.totalCalls,sent);assert.equal(saved.world.aiUsage.totalInputTokens,sent*30);assert.equal(saved.world.aiUsage.totalUnknownCalls,0);
  for(const actor of saved.world.characters){assert.equal(actor.intents[0].id,'purpose');assert.ok(actor.shortTerm.length>0,'normal denied result is persisted as feedback');}
  const trace=saved.decisionTrace;assert.equal(trace.outcome,'committed');assert.equal(trace.dispatches.length,sent);
  const timing=trace.steps.find(x=>x.kind==='time-policy').data;
  assert.equal(timing.workDeadline-timing.leaseCreatedAt,400000);assert.equal(timing.leaseDeadline-timing.leaseCreatedAt,430000);assert.equal(timing.clientMs,445000);
  for(const d of trace.dispatches){assert.ok(d.fetchStartedAt>=d.startedAt);assert.ok(d.signal.deadline>d.fetchStartedAt);assert.ok(d.signal.deadline-d.signal.createdAt<=25000);assert.ok(d.headersReceivedAt<=d.receivedAt);assert.ok(d.usageKnownAt);}
  assert.ok(trace.checkpoints.some(x=>x.completedAt>x.startedAt)||!config.checkpoint);
  assert.ok(Date.now()-started<400000);assert.equal(JSON.stringify(wire).includes('time-policy'),false,'diagnostics never enter NPC inputs');
  console.log('ROUND_BUDGET '+JSON.stringify({case:config.name,elapsedMs:Date.now()-started,sent,embedding,searches,writes}));
 }finally{store.onNextTraceWrite(()=>{});s?.restore();c.restore();for(const key of ['RECALL_ENABLED','RECALL_USAGE_DB','OWNER_EMBEDDING_KEY','MEMORY_VECTOR_INDEX'])delete env[key];}
});

for(const stage of ['no-headers','body','response-save','prepared-save'])test(stage+' deadline rolls back, stops dispatch and preserves measured usage',async()=>{
 const c=clock();let s,sent=0,delayed=false;
 try{
  s=await scenario({modify:w=>actors(w)});const before=await s.read();
  if(stage.endsWith('save'))store.onStorage(async(sql,values)=>{if(!delayed&&(sql.startsWith('INSERT INTO decision_traces')||sql.startsWith('UPDATE decision_traces'))){const trace=JSON.parse(values[sql.startsWith('INSERT')?5:0]);if(stage==='prepared-save'?trace.dispatches[0]?.stage==='dispatch-prepared':trace.dispatches[0]?.stage==='received'){delayed=true;await c.sleep(26000);}}});
  global.fetch=async()=>{sent++;if(stage==='no-headers'){await c.sleep(26000);throw Error('late network');}if(stage==='body')return new Response(new ReadableStream({async pull(controller){await c.sleep(26000);controller.enqueue(new TextEncoder().encode(envelope(proposal)));controller.close();}},{highWaterMark:0}));return new Response(envelope(proposal));};
  const operation=op(),response=await c.run(s.post(operation)),body=await response.json();assert.equal(response.status,502);assert.equal(sent,stage==='prepared-save'?0:1);
  store.onStorage(undefined);const saved=await replay(s,operation,response,body,()=>sent);assert.equal(saved.world.turn,before.turn);assert.deepEqual(saved.world.events,before.events);
  assert.equal(saved.world.aiUsage.totalCalls,1);assert.equal(saved.world.aiUsage.totalInputTokens,stage==='response-save'?30:0);assert.equal(saved.world.aiUsage.totalUnknownCalls,stage==='response-save'?0:1);
 }finally{store.onStorage(undefined);s?.restore();c.restore();}
});

test('legacy 125s client is rejected before acceptance; original settled IDs still replay without opt-in',async()=>{
 const s=await scenario(),operation=op();let sent=0;const old=global.fetch;global.fetch=async(...args)=>{sent++;return old(...args);};
 const req=body=>new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid'},body:JSON.stringify({mode:'openai',model:'gpt-6-luna',worldContext:'program-fixture',...body})});
 try{
  const response=await POST(req(operation));assert.equal(response.status,426);assert.equal((await response.json()).clientUpdateRequired,true);assert.equal(sent,0);assert.equal((await query(operation.operationId)).operation.state,'unknown');
  const successful=await s.post(operation),body=await successful.json();const calls=sent;const replayed=await POST(req(operation));assert.equal(replayed.status,successful.status);assert.deepEqual(await replayed.json(),body);assert.equal(sent,calls);
 }finally{s.restore();}
});

for(const newer of [false,true])test('uncancellable CAS after lease expiry cannot commit'+(newer?' over a newer world':''),async()=>{
 const c=clock();let s,delayed=false;
 try{
  s=await scenario();const before=await s.read();
  store.onStorage(async sql=>{if(!delayed&&sql.startsWith('UPDATE worlds SET state = ?')){delayed=true;await c.sleep(431000);if(newer){const replacement=structuredClone(before);replacement.turn=19;store.replaceCommittedWorld(replacement);}}});
  const operation=op(),response=await c.run(s.post(operation));assert.equal(response.status,502);store.onStorage(undefined);
  // Let the original non-cancellable SQL complete; only the original trace queue
  // may update old evidence. No deferred story commit is permitted.
  await c.run(c.sleep(1000));await new Promise(resolve=>setImmediate(resolve));
  const saved=await query(operation.operationId);assert.equal(saved.world.turn,newer?19:before.turn);
 }finally{store.onStorage(undefined);s?.restore();c.restore();}
});
