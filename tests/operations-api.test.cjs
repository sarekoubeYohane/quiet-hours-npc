/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const build = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, `${name}.cjs`));
const { POST, GET } = build('route');
const store = build('store');
const { seedWorld } = build('world');
const operationId = () => `${Date.now()}:${crypto.randomUUID()}`;
const request = body => new Request('https://test.invalid/api/world', {method:'POST',headers:{origin:'https://test.invalid'},body:JSON.stringify({mode:'demo',...body})});
test('reloaded API replays the exact result for an operation instead of advancing twice', async () => {
 store.install(seedWorld());
 const body = {operation:'advance',minutes:15,operationId:operationId()};
 const first = await (await POST(request(body))).json();
 delete require.cache[require.resolve(path.join(process.env.QUIET_HOURS_TEST_BUILD,'route.cjs'))];
 const replay = await build('route').POST(request(body));
 assert.equal(replay.status,200); assert.deepEqual(await replay.json(), first);
 assert.equal((await (await GET()).json()).world.turn,1);
});
test('overlapping copies wait and an expired in-flight operation never calls the model again', async () => {
 store.install(seedWorld());
 await POST(request({operation:'set-model-key',mode:'openai',key:'test-key'}));
 const original = global.fetch; const clock = Date.now; let release, entered; let calls = 0;
 const ready = new Promise(r=>entered=r), gate = new Promise(r=>release=r);
 global.fetch = async()=>{calls++;entered();await gate;throw Error('provider failed');};
 const body={operationId:operationId(),operation:'advance',mode:'openai',model:'gpt-6-luna',minutes:15};
 try {
  const running=POST(request(body)); await ready;
  const waiting=await POST(request(body)); assert.equal(waiting.status,409); assert.equal((await waiting.json()).retryable,true);
  Date.now=()=>clock()+130000;
  const expired=await POST(request(body)); assert.equal(expired.status,502); const result=await expired.json(); assert.equal(result.operationUncertain,true);
  release(); await running;
  const replay=await POST(request(body)); assert.deepEqual(await replay.json(),result); assert.equal(calls,1);
 } finally {release();global.fetch=original;Date.now=clock;}
});
test('all mutations require IDs, and evicted old IDs cannot execute again', async () => {
 store.install(seedWorld());
 assert.equal((await POST(request({operation:'takeover'}))).status,400);
 const first={operation:'takeover',operationId:operationId()}; assert.equal((await POST(request(first))).status,200);
 await new Promise(r=>setTimeout(r,2));
 for(let i=0;i<10;i++) assert.equal((await POST(request({operation:i%2?'takeover':'return-control',operationId:operationId()}))).status,200);
 const before=await (await GET()).json(); const expired=await POST(request(first));
 assert.equal(expired.status,410); assert.equal((await expired.json()).operationExpired,true);
 assert.equal((await (await GET()).json()).version,before.version);
});
test('failed paid rounds replay even after the key is cleared, with usage counted once', async () => {
 store.install(seedWorld()); await POST(request({operation:'set-model-key',mode:'openai',key:'test-key'}));
 const original=global.fetch; let calls=0; global.fetch=async()=>{calls++;throw Error('provider unavailable');};
 try {
  const body={operation:'advance',operationId:operationId(),mode:'openai',model:'gpt-6-luna',minutes:15};
  const first=await POST(request(body)); const data=await first.json();assert.equal(first.status,502);
  await POST(request({operation:'clear-model-key',mode:'openai'}));
  const replay=await POST(request(body));assert.equal(replay.status,502);assert.deepEqual(await replay.json(),data);
  assert.equal(calls,1);assert.equal((await (await GET()).json()).world.aiUsage.totalCalls,1);
 } finally {global.fetch=original;}
});
test('pending requests bound to the old account cannot mutate a newly signed-in account', async () => {
 store.install(seedWorld());
 const result=await POST(request({operation:'takeover',operationId:operationId(),operationScope:'different-account'}));
 assert.equal(result.status,409);assert.equal((await result.json()).scopeMismatch,true);
 assert.equal((await (await GET()).json()).version,0);
});
test('every mutation replays its original result after later changes without overwriting the latest world', async () => {
 store.install(seedWorld());
 const operations=[{operation:'intervene',text:'Hello',target:'cass'}, {operation:'direct',action:{type:'rest'}}, {operation:'takeover'}, {operation:'return-control'}, {operation:'advance',minutes:15}];
 const accepted=[];
 for(const operation of operations){const body={...operation,operationId:operationId()}; const response=await POST(request(body));assert.equal(response.status,200);accepted.push([body,await response.json()]);}
 const latest=await (await GET()).json();
 for(const [body,result] of accepted){const response=await POST(request(body));assert.equal(response.status,200);assert.deepEqual(await response.json(),result);}
 const after=await (await GET()).json();assert.deepEqual(after.world,latest.world);assert.equal(after.version,5);
});
test('paid success, confirmed CAS failure and ambiguous saves never dispatch a duplicate model request', async () => {
 const original=global.fetch, clock=Date.now, instant=Date.now();Date.now=()=>instant;
 try {
  for(const failure of ['none','conflict','throw-after','throw-before']){
   store.install(seedWorld());await POST(request({operation:'set-model-key',mode:'openai',key:'test-key'}));
   if(failure==='conflict')store.conflictOnNextSave();
   if(failure==='throw-after')store.throwAfterNextSave();
   if(failure==='throw-before')store.throwBeforeNextSave();
   let calls=0;global.fetch=async()=>{calls++;return Response.json({usage:{prompt_tokens:30,completion_tokens:20},choices:[{message:{content:JSON.stringify({type:'rest',target:'',content:'',mood:'',durationMinutes:15,intents:[]})}}]});};
   const body={operation:'advance',operationId:operationId(),mode:'openai',model:'gpt-6-luna',minutes:15};
   const first=await POST(request(body));const result=await first.json();
   const saved=await (await GET()).json();
   const replay=await POST(request(body));assert.equal(replay.status,first.status);assert.deepEqual(await replay.json(),result);
   assert.equal(calls,4);const after=await (await GET()).json();assert.deepEqual(after.world,saved.world);assert.equal(after.version,saved.version);
   if(failure!=='throw-before')assert.equal(saved.world.aiUsage.totalCalls,4);
  }
 } finally {global.fetch=original;Date.now=clock;}
});
test('durably settled results are distinguishable from a transient read failure after a lost response', async () => {
 store.install(seedWorld());
 const body={operation:'advance',operationId:operationId(),minutes:15};
 const first=await POST(request(body));const accepted=await first.json();assert.equal(accepted.operationSettled,true);
 store.failNextOperationRead();
 const unavailable=await POST(request(body));assert.equal(unavailable.status,502);assert.notEqual((await unavailable.json()).operationSettled,true);
 const replay=await POST(request(body));assert.deepEqual(await replay.json(),accepted);
 assert.equal((await (await GET()).json()).world.turn,1);
});
test('an expired worker cannot revive its evicted result after newer operations finish', async () => {
 store.install(seedWorld());await POST(request({operation:'set-model-key',mode:'openai',key:'test-key'}));
 const original=global.fetch,clock=Date.now;let instant=clock(),release,entered;Date.now=()=>instant;
 const ready=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
 global.fetch=async()=>{entered();await gate;throw Error('provider failed');};
 try {
  const body={operation:'advance',operationId:operationId(),mode:'openai',model:'gpt-6-luna',minutes:15};
  const running=POST(request(body));await ready;instant+=130000;
  for(let i=0;i<9;i++){instant++;assert.equal((await POST(request({operation:'takeover',operationId:operationId()}))).status,200);}
  release();await running;
  const replay=await POST(request(body));assert.equal(replay.status,410);assert.equal((await replay.json()).operationExpired,true);
 }finally{release();Date.now=clock;global.fetch=original;}
});
test('read-only operation lookup confirms a lost response without executing the operation again', async () => {
 store.install(seedWorld());
 const body={operation:'advance',operationId:operationId(),minutes:15};
 const accepted=await POST(request(body));assert.equal(accepted.status,200);
 const lookup=()=>GET(new Request(`https://test.invalid/api/world?operationId=${encodeURIComponent(body.operationId)}`));
 const latest=await (await lookup()).json();
 assert.equal(latest.operation.state,'settled');assert.equal(latest.operation.status,200);
 assert.equal(latest.world.turn,1);assert.equal(latest.version,1);
 assert.deepEqual((await (await lookup()).json()).operation,latest.operation);
 assert.equal((await (await GET()).json()).world.turn,1);
});
test('operation lookup does not dispatch unknown requests or settle an active or expired lease', async () => {
 store.install(seedWorld());await POST(request({operation:'set-model-key',mode:'openai',key:'test-key'}));
 const original=global.fetch,clock=Date.now;let instant=clock(),release,entered,calls=0;Date.now=()=>instant;
 const ready=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);
 global.fetch=async()=>{calls++;entered();await gate;throw Error('provider unavailable');};
 const body={operation:'advance',operationId:operationId(),minutes:15,mode:'openai',model:'gpt-6-luna'};
 const lookup=id=>GET(new Request(`https://test.invalid/api/world?operationId=${encodeURIComponent(id)}`));
 let running;
 try{
  assert.equal((await (await lookup(body.operationId)).json()).operation.state,'unknown');assert.equal(calls,0);
  running=POST(request(body));await ready;
  assert.equal((await (await lookup(body.operationId)).json()).operation.state,'pending');
  instant+=130000;
  assert.equal((await (await lookup(body.operationId)).json()).operation.state,'uncertain');
  assert.equal(calls,1);
  // A read must not replace pending with a tombstone: the existing writer still owns its journal.
  release();await running;
  assert.equal((await (await lookup(body.operationId)).json()).operation.state,'settled');
  assert.equal((await (await GET()).json()).world.aiUsage.totalCalls,1);
 }finally{release();await running;global.fetch=original;Date.now=clock;}
});
test('paid lost-response lookup preserves latest world, events and usage without another paid call', async () => {
 store.install(seedWorld());await POST(request({operation:'set-model-key',mode:'openai',key:'test-key'}));
 const original=global.fetch;let calls=0;
 global.fetch=async()=>{calls++;return Response.json({usage:{prompt_tokens:30,completion_tokens:20},choices:[{message:{content:JSON.stringify({type:'rest',target:'',content:'',mood:'',durationMinutes:15,intents:[]})}}]});};
 const body={operation:'advance',operationId:operationId(),minutes:15,mode:'openai',model:'gpt-6-luna'};
 try{
  assert.equal((await POST(request(body))).status,200);
  assert.equal(calls,4);
  assert.equal((await POST(request({operation:'intervene',operationId:operationId(),target:'all',text:'下一個共同事件'}))).status,200);
  const before=await (await GET()).json();
  const url=`https://test.invalid/api/world?operationId=${encodeURIComponent(body.operationId)}`;
  for(let i=0;i<3;i++){
   const data=await (await GET(new Request(url))).json();
   assert.deepEqual(data.world,before.world);assert.equal(data.version,2);
   assert.equal(data.operation.state,'settled');assert.equal(data.operation.status,200);
  }
  assert.equal(calls,4);assert.equal(before.world.aiUsage.totalCalls,4);
  assert.equal(before.world.aiUsage.totalInputTokens,120);assert.equal(before.world.aiUsage.totalOutputTokens,80);
 }finally{global.fetch=original;}
});
