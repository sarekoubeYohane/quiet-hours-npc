/* eslint-disable @typescript-eslint/no-require-imports -- World API fixture. */
const test=require('node:test'), assert=require('node:assert/strict'), path=require('node:path');
const load=name=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,`${name}.cjs`));
const {GET,POST}=load('route'),{seedWorld}=load('world'),store=load('store');
const request=body=>new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationId:`${Date.now()}:${crypto.randomUUID()}`,mode:'demo',...body})});
const read=async()=>(await(await GET()).json()).world;
const candidate={type:'rest',target:'',content:'',mood:'平靜',durationMinutes:15,intents:[],attentionConditions:[],memorySelections:[],memoryOperations:[],cognitiveUpdates:[],interpretation:''};
const worldWithAdjudication = require('./fixtures/ai-world.cjs')(seedWorld);

test('system contract version reaches filtered adapter input and incompatible output atomically fails with paid usage retained',async()=>{
 store.install(worldWithAdjudication());const original=global.fetch,inputs=[];
 global.fetch=async(_url,init)=>{const data=JSON.parse(init.body);inputs.push(JSON.parse(data.messages[1].content));return Response.json({usage:{prompt_tokens:10,completion_tokens:5},choices:[{message:{content:JSON.stringify({...candidate,contractVersion:'npc-decision.v99'})}}]});};
 try{await POST(request({operation:'set-model-key',mode:'openai',key:'fixture-key'})); const before=await read();
 const response=await POST(request({operation:'advance',mode:'openai',model:'gpt-6-luna',minutes:15}));assert.equal(response.status,502);
 assert.equal(inputs[0].contractVersion,'npc-decision.v1');assert.equal(Object.hasOwn(inputs[0],'characters'),false);
 const after=await read();assert.deepEqual(after.characters,before.characters);assert.equal(after.aiUsage.totalInputTokens,10);
 }finally{global.fetch=original;}
});
test('a response explicitly associated with another request cannot change the world and its paid failure is replayed',async()=>{
 store.install(worldWithAdjudication());const original=global.fetch;let calls=0;
 global.fetch=async()=>{calls++;return Response.json({usage:{prompt_tokens:12,completion_tokens:3},choices:[{message:{content:JSON.stringify(candidate)}}]},{headers:{'x-decision-request-id':'another-request'}});};
 try{await POST(request({operation:'set-model-key',mode:'openai',key:'fixture-key'}));const before=await read(); const body={operation:'advance',operationId:`${Date.now()}:${crypto.randomUUID()}`,mode:'openai',model:'gpt-6-luna',minutes:15};
 const response=await POST(request(body));assert.equal(response.status,502);const failure=await response.json();assert.deepEqual((await read()).characters,before.characters);assert.equal((await read()).aiUsage.totalInputTokens,12);
 assert.deepEqual(await(await POST(request(body))).json(),failure);assert.equal(calls,1);
 }finally{global.fetch=original;}
});
test('a response after the absolute deadline is discarded and cannot change settled usage or submit an action',async()=>{
 store.install(worldWithAdjudication());const original=global.fetch,clock=Date.now;let instant=clock(),calls=0;Date.now=()=>instant;
 global.fetch=async()=>{if(++calls===4)instant+=401000;return Response.json({usage:{prompt_tokens:9,completion_tokens:2},choices:[{message:{content:JSON.stringify(candidate)}}]});};
 try{await POST(request({operation:'set-model-key',mode:'openai',key:'fixture-key'}));const before=await read(); const response=await POST(request({operation:'advance',mode:'openai',model:'gpt-6-luna',minutes:15}));assert.equal(response.status,502);assert.deepEqual((await read()).characters,before.characters);assert.equal((await read()).aiUsage.totalInputTokens,27);assert.equal((await read()).aiUsage.totalUnknownCalls,1);
 }finally{global.fetch=original;Date.now=clock;}
});
test('injected adjudication receives separate minimal authority input while the existing action still uses program execution and persistence',async()=>{
 store.install(worldWithAdjudication());const original=global.fetch,inputs=[];
 global.fetch=async()=>Response.json({usage:{prompt_tokens:7,completion_tokens:2},choices:[{message:{content:JSON.stringify({...candidate,type:'work',target:'tidy'})}}]});
 try{await POST(request({operation:'set-model-key',mode:'openai',key:'fixture-key'}));
 const response=await POST(request({operation:'advance',mode:'openai',model:'gpt-6-luna',minutes:15}),{adjudicateExistingAction:async input=>{inputs.push(input);return {status:'accepted'};}});
 assert.equal(response.status,200);assert.equal(inputs.length,4);assert.equal(inputs[0].contractVersion,'world-adjudication.v1');assert.equal(inputs[0].action.type,'work');
 const serialized=JSON.stringify(inputs);for(const forbidden of ['shortTerm','longTerm','intents','personality','relationships','mood'])assert.equal(serialized.includes(`"${forbidden}"`),false,forbidden);
 assert.ok((await read()).events.some(e=>e.actor==='cass'&&e.kind==='work'));assert.equal((await read()).aiUsage.totalCalls,4);
 }finally{global.fetch=original;}
});
test('adjudication cannot inject dice or world effects into the program action and failure rolls back all candidates',async()=>{
 store.install(worldWithAdjudication());const original=global.fetch;
 global.fetch=async()=>Response.json({usage:{prompt_tokens:7,completion_tokens:2},choices:[{message:{content:JSON.stringify(candidate)}}]});
 try{await POST(request({operation:'set-model-key',mode:'openai',key:'fixture-key'}));const before=await read();
 const response=await POST(request({operation:'advance',mode:'openai',model:'gpt-6-luna',minutes:15}),{adjudicateExistingAction:async()=>({status:'accepted',die:20,effects:[{overwriteWorld:true}]})});
 assert.equal(response.status,502);const after=await read();assert.deepEqual(after.characters,before.characters);assert.deepEqual(after.events,before.events);assert.equal(after.aiUsage.totalCalls,1);assert.equal(after.aiUsage.totalInputTokens,7);
 }finally{global.fetch=original;}
});
test('current contract replies and legacy versionless replies both save through the world API',async()=>{
 for(const version of [undefined,'npc-decision.v1']){
  store.install(worldWithAdjudication());const original=global.fetch;
  global.fetch=async()=>Response.json({usage:{prompt_tokens:7,completion_tokens:2},choices:[{message:{content:JSON.stringify({...candidate,...(version?{contractVersion:version}:{})})}}]});
  try{await POST(request({operation:'set-model-key',mode:'openai',key:'fixture-key'}));const response=await POST(request({operation:'advance',mode:'openai',model:'gpt-6-luna',minutes:15}));assert.equal(response.status,200,version);assert.equal((await read()).turn,1);assert.equal((await read()).aiUsage.totalCalls,4);
  }finally{global.fetch=original;}
 }
});
