/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const build=name=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,`${name}.cjs`));
const {GET,POST}=build('route'),store=build('store'),{seedWorld}=build('world');
const req=body=>new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationId:`${Date.now()}:${crypto.randomUUID()}`,mode:'demo',...body})});
const read=async()=>(await(await GET()).json()).world;
const worldWithAdjudication = require('./fixtures/ai-world.cjs')(seedWorld);

test('player applies explicit unlimited budget, reloads and resets without losing setting or usage',async()=>{
 const world=worldWithAdjudication();world.aiUsage={windowStartedAt:Date.now(),calls:151,inputTokens:600000,outputTokens:10,unknownCalls:0,totalCalls:151,totalInputTokens:600000,totalOutputTokens:10,totalUnknownCalls:0,savedDecisions:0};store.install(world);
 const request=req({operation:'set-budget',limits:{calls:null,tokens:null}});
 const body=await request.clone().text();assert.equal((await POST(request)).status,200);
 assert.deepEqual((await read()).playerBudget,{calls:null,tokens:null});
 assert.equal((await POST(new Request(request.url,{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body}))).status,200);
 assert.equal((await POST(req({operation:'reset'}))).status,200);
 const saved=await read();assert.deepEqual(saved.playerBudget,{calls:null,tokens:null});assert.equal(saved.aiUsage.totalCalls,151);
});
test('budget API rejects invalid finite values and partial unlimited while legacy worlds stay finite',async()=>{
 store.install(worldWithAdjudication());assert.equal((await read()).playerBudget,undefined);
 for(const limits of [{calls:0,tokens:1000},{calls:-1,tokens:1000},{calls:1.5,tokens:1000},{calls:Number.MAX_SAFE_INTEGER+1,tokens:1000},{calls:'12',tokens:1000},{calls:null},{calls:null,tokens:false},null])assert.equal((await POST(req({operation:'set-budget',limits}))).status,400,JSON.stringify(limits));
 assert.equal((await POST(req({operation:'set-budget',limits:{calls:600,tokens:10000000}}))).status,200);
 assert.deepEqual((await read()).playerBudget,{calls:600,tokens:10000000});
});
test('all four budget combinations govern real dispatch and retain paid use without partial rounds',async()=>{
 const original=global.fetch;let dispatched=0;
 global.fetch=async()=>{dispatched++;return Response.json({usage:{prompt_tokens:30,completion_tokens:20},choices:[{message:{content:JSON.stringify({type:'rest',target:'',content:'',mood:'平靜',durationMinutes:15,intents:[]})}}]});};
 try{
 for(const limits of [{calls:1,tokens:null},{calls:null,tokens:1},{calls:1,tokens:1},{calls:null,tokens:null}]){
  const world=worldWithAdjudication();world.aiUsage={windowStartedAt:Date.now(),calls:0,inputTokens:0,outputTokens:0,unknownCalls:0,totalCalls:0,totalInputTokens:0,totalOutputTokens:0,totalUnknownCalls:0,savedDecisions:0};store.install(world);dispatched=0;
  await POST(req({operation:'set-model-key',mode:'openai',key:'test-key'}));await POST(req({operation:'set-budget',limits}));
  const response=await POST(req({operation:'advance',mode:'openai',model:'gpt-6-luna',minutes:15}));
  const saved=await read(),unlimited=limits.calls===null&&limits.tokens===null;
  assert.equal(response.status,unlimited?200:429);assert.equal(dispatched,unlimited?4:1);assert.equal(saved.turn,unlimited?1:0);assert.equal(saved.aiUsage.totalInputTokens,unlimited?120:30);
 }
 }finally{global.fetch=original;}
});
test('unlimited persisted policy passes old hourly and daily thresholds, then finite changes stop future dispatch',async()=>{
 const original=global.fetch,clock=Date.now;let now=clock(),dispatched=0;Date.now=()=>now;
 global.fetch=async()=>{dispatched++;return Response.json({usage:{prompt_tokens:30,completion_tokens:20},choices:[{message:{content:JSON.stringify({type:'rest',target:'',content:'',mood:'',durationMinutes:15,intents:[]})}}]});};
 try{
  const world=worldWithAdjudication();world.aiUsage={windowStartedAt:now,calls:151,inputTokens:600000,outputTokens:10,unknownCalls:0,totalCalls:151,totalInputTokens:600000,totalOutputTokens:10,totalUnknownCalls:0,savedDecisions:0};store.install(world);
  await POST(req({operation:'set-model-key',mode:'openai',key:'test-key'}));await POST(req({operation:'set-budget',limits:{calls:null,tokens:null}}));
  const advance=()=>POST(req({operation:'advance',mode:'openai',model:'gpt-6-luna',minutes:15}));
  assert.equal((await advance()).status,200);assert.equal(dispatched,4);assert.equal((await read()).aiUsage.calls,155);
  await POST(req({operation:'set-budget',limits:{calls:1,tokens:1}}));assert.equal((await advance()).status,429);assert.equal(dispatched,4);
  now+=3600001;assert.equal((await advance()).status,429);assert.equal(dispatched,5);const saved=await read();assert.equal(saved.aiUsage.calls,1);assert.equal(saved.aiUsage.totalCalls,156);assert.equal(saved.turn,1);
 }finally{global.fetch=original;Date.now=clock;}
});
test('advance uses only applied budget despite unlimited or stale larger request limits and replays paid failure',async()=>{
 const original=global.fetch;let dispatched=0;
 global.fetch=async()=>{dispatched++;return Response.json({usage:{prompt_tokens:30,completion_tokens:20},choices:[{message:{content:JSON.stringify({type:'rest',target:'',content:'',mood:'',durationMinutes:15,intents:[]})}}]});};
 try{
  for(const limits of [{calls:null,tokens:null},{calls:1200,tokens:10000000}]){
   store.install(worldWithAdjudication());dispatched=0;
   await POST(req({operation:'set-model-key',mode:'openai',key:'test-key'}));
   await POST(req({operation:'set-budget',limits:{calls:1,tokens:1}}));
   const request=req({operation:'advance',mode:'openai',model:'gpt-6-luna',minutes:15,limits});
   const replay=request.clone();const response=await POST(request);assert.equal(response.status,429);
   const saved=await read();assert.deepEqual(saved.playerBudget,{calls:1,tokens:1});assert.equal(saved.turn,0);assert.equal(saved.aiUsage.totalCalls,1);assert.equal(saved.aiUsage.totalInputTokens,30);assert.equal(dispatched,1);
   await POST(req({operation:'set-budget',limits:{calls:null,tokens:null}}));
   assert.equal((await POST(replay)).status,429);assert.equal(dispatched,1);assert.deepEqual((await read()).playerBudget,{calls:null,tokens:null});
  }
 }finally{global.fetch=original;}
});
