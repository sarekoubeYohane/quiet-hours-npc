/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const build=name=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,`${name}.cjs`));
const {GET,POST}=build('route'),store=build('store'),{seedWorld}=build('world');
const req=body=>new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationId:`${Date.now()}:${crypto.randomUUID()}`,mode:'demo',...body})});
const read=async()=>(await(await GET()).json());
const price=(input=1,output=2,extra={})=>({provider:'openai',model:'gpt-6-luna',input,output,source:'供應商測試報價',date:'2026-10-15',...extra});
const worldWithAdjudication = require('./fixtures/ai-world.cjs')(seedWorld);

test('player saves a traceable custom model price and explicit free prices; malformed prices fail',async()=>{
 store.install(worldWithAdjudication());
 assert.equal((await POST(req({operation:'set-price',price:price(0,0)}))).status,200);
 let saved=await read();assert.equal(saved.world.modelPrices[0].input,0);assert.equal(saved.world.modelPrices[0].custom,true);assert.equal(saved.world.modelPrices[0].source,'供應商測試報價');
 for(const bad of [price(-1),price('1'),price(null),price(1,2,{date:'yesterday'}),price(1,2,{date:'2026-99-99'}),price(1,2,{source:''}),price(1,2,{provider:'other'})])assert.equal((await POST(req({operation:'set-price',price:bad}))).status,400);
});
const response=(usage={prompt_tokens:1000000,completion_tokens:500000})=>Response.json({usage,choices:[{message:{content:JSON.stringify({type:'rest',target:'',content:'',mood:'',durationMinutes:15,intents:[]})}}]});
const advance=(extra={})=>POST(req({operation:'advance',mode:'openai',model:'gpt-6-luna',minutes:30,...extra}));
const setup=async()=>{store.install(worldWithAdjudication());await POST(req({operation:'set-model-key',mode:'openai',key:'test-key'}));await POST(req({operation:'set-budget',limits:{calls:null,tokens:null}}));};
test('incurred estimates use immutable price cohorts, real cache split, clock windows and survive replay/reset',async()=>{
 const fetcher=global.fetch,clock=Date.now;let now=clock();Date.now=()=>now;global.fetch=async()=>response();
 try{
  await setup();await POST(req({operation:'set-price',price:price()}));
  const request=req({operation:'advance',mode:'openai',model:'gpt-6-luna',minutes:30});const replay=request.clone();assert.equal((await POST(request)).status,200);
  let saved=await read();assert.equal(saved.costSummary.total.knownUsd,8);assert.equal(saved.costSummary.total.complete,true);
  await POST(replay);assert.equal((await read()).costSummary.total.knownUsd,8);
  await POST(req({operation:'set-price',price:price(3,4,{cachedInput:0.5})}));
  global.fetch=async()=>response({prompt_tokens:1000000,completion_tokens:500000,prompt_tokens_details:{cached_tokens:200000}});
  await advance();saved=await read();assert.equal(saved.costSummary.total.knownUsd,26);assert.equal(saved.costSummary.total.cohorts.length,2);
  await POST(req({operation:'reset'}));assert.equal((await read()).costSummary.total.knownUsd,26);
  now+=3600001;saved=await read();assert.equal(saved.costSummary.hour.knownUsd,0);assert.equal(saved.costSummary.total.knownUsd,26);
  await advance();assert.equal((await read()).costSummary.hour.knownUsd,18);
 }finally{global.fetch=fetcher;Date.now=clock;}
});
test('unknown price, cache rate, missing usage and legacy history are explicitly partial while zero is complete',async()=>{
 const fetcher=global.fetch;global.fetch=async()=>response();
 try{
  await setup();await advance();let saved=await read();assert.equal(saved.costSummary.total.complete,false);assert.equal(saved.costSummary.total.unknownCalls,4);
  await POST(req({operation:'set-price',price:price(0,0)}));await advance();saved=await read();assert.equal(saved.costSummary.total.knownUsd,0);assert.equal(saved.costSummary.total.unknownCalls,4);
  await setup();await POST(req({operation:'set-price',price:price()}));global.fetch=async()=>response({prompt_tokens:1000000,completion_tokens:500000,prompt_tokens_details:{cached_tokens:200000}});await advance();saved=await read();assert.equal(saved.costSummary.total.knownUsd,7.2);assert.equal(saved.costSummary.total.complete,false);
  global.fetch=async()=>response(null);await advance();saved=await read();assert.equal(saved.costSummary.total.unknownCalls,8);assert.equal(saved.costSummary.total.knownUsd,7.2);
  const old=worldWithAdjudication();old.aiUsage={windowStartedAt:Date.now(),calls:3,inputTokens:10,outputTokens:2,unknownCalls:0,totalCalls:9,totalInputTokens:50,totalOutputTokens:10,totalUnknownCalls:0,savedDecisions:0};store.install(old);saved=await read();assert.equal(saved.costSummary.total.unknownCalls,9);assert.equal(saved.costSummary.hour.unknownCalls,3);
 }finally{global.fetch=fetcher;}
});
test('paid failures and confirmed commit conflicts retain cost once and preserve competing history',async()=>{
 const fetcher=global.fetch;
 try{
  await setup();await POST(req({operation:'set-price',price:price()}));global.fetch=async()=>Response.json({usage:{prompt_tokens:1000000,completion_tokens:500000},choices:[{message:{refusal:'no'}}]});
  assert.equal((await advance()).status,502);assert.equal((await read()).costSummary.total.knownUsd,2);
  global.fetch=async()=>response();
  store.conflictOnNextSave();const request=req({operation:'advance',mode:'openai',model:'gpt-6-luna',minutes:30}),replay=request.clone();assert.equal((await POST(request)).status,502);
  let saved=await read();assert.equal(saved.costSummary.total.knownUsd,10);assert.equal(saved.costSummary.total.complete,true);assert.equal(saved.world.turn,0);
  await POST(replay);saved=await read();assert.equal(saved.costSummary.total.knownUsd,10);
 }finally{global.fetch=fetcher;}
});
test('confirmed conflicts preserve competing cost cohorts and respect a newer hourly window',async()=>{
 const fetcher=global.fetch,clock=Date.now;let now=clock();Date.now=()=>now;global.fetch=async()=>response();
 try{
  await setup();await POST(req({operation:'set-price',price:price()}));await advance();
  const newer=structuredClone((await read()).world);newer.aiUsage.windowStartedAt=now+3600001;newer.aiUsage.calls=0;newer.aiUsage.inputTokens=0;newer.aiUsage.outputTokens=0;newer.aiUsage.costs.hour={};
  store.conflictOnNextSave(newer,{version:10,lockedUntil:now+240000});await advance();
  const saved=await read();assert.equal(saved.costSummary.total.knownUsd,16);assert.equal(saved.costSummary.hour.knownUsd,0);assert.equal(saved.world.turn,1);
 }finally{global.fetch=fetcher;Date.now=clock;}
});
test('mixed providers, free prices and huge finite prices never become a false zero complete bill',async()=>{
 const fetcher=global.fetch;global.fetch=async()=>response();
 try{
  await setup();await POST(req({operation:'set-price',price:price(0,0)}));await advance();let saved=await read();assert.equal(saved.costSummary.total.complete,true);assert.equal(saved.costSummary.total.knownUsd,0);
  await POST(req({operation:'set-model-key',mode:'ai',key:'test-key'}));await POST(req({operation:'set-price',price:price(2,4,{provider:'openrouter',model:'fixture/model'})}));await advance({mode:'ai',model:'fixture/model'});saved=await read();assert.equal(saved.costSummary.total.knownUsd,16);assert.equal(saved.costSummary.total.cohorts.length,2);
  await POST(req({operation:'set-price',price:price(1e308,1e308)}));await advance();saved=await read();assert.equal(Number.isFinite(saved.costSummary.total.knownUsd),true);assert.equal(saved.costSummary.total.complete,false);
 }finally{global.fetch=fetcher;}
});
test('provider failure with trusted reported usage retains incurred cost and provider stop reason',async()=>{
 const fetcher=global.fetch;
 try{await setup();await POST(req({operation:'set-price',price:price()}));global.fetch=async()=>Response.json({usage:{prompt_tokens:1000000,completion_tokens:500000}},{status:429});const result=await advance();assert.equal(result.status,502);assert.equal((await result.json()).stopReason.scope,'provider');const saved=await read();assert.equal(saved.world.turn,0);assert.equal(saved.costSummary.total.knownUsd,2);assert.equal(saved.costSummary.total.complete,true);}finally{global.fetch=fetcher;}
});
test('overflow in competing paid cohorts remains unknown after another settings save',async()=>{
 const fetcher=global.fetch;global.fetch=async()=>response();
 try{await setup();await POST(req({operation:'set-price',price:price(4e307,0)}));await advance();const newer=(await read()).world;const baseline=worldWithAdjudication();baseline.modelPrices=newer.modelPrices;store.install(baseline);await POST(req({operation:'set-model-key',mode:'openai',key:'test-key'}));await POST(req({operation:'set-budget',limits:{calls:null,tokens:null}}));store.conflictOnNextSave(newer);await advance();await POST(req({operation:'set-price',price:price(0,0)}));const saved=await read();assert.equal(Number.isFinite(saved.costSummary.total.knownUsd),true);assert.equal(saved.costSummary.total.complete,false);}finally{global.fetch=fetcher;}
});
