/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
const {GET,POST}=load('route'),store=load('store'),{seedWorld}=load('world');
const id=()=>Date.now()+':'+crypto.randomUUID();
const completion=v=>Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(v)}}]});
test('first ordinary tea approval survives serialized reload and a new activity reuses it without adjudication',async()=>{
 const world=seedWorld();world.contextId='routine-fixture';world.adjudication={provider:'openai',model:'gpt-6.1-sol'};
 world.characters.forEach(c=>{if(c.id!=='owner')c.control={mode:'taken-over'};});store.install(world);
 const post=body=>POST(new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid'},body:JSON.stringify({operationId:id(),worldContext:world.contextId,mode:'openai',model:'gpt-6.1-sol',...body})}));
 await post({operation:'set-model-key',key:'fixture-key'});
 const previous=global.fetch;let npc=0,adjudication=0;
 global.fetch=async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);if(input.contractVersion==='world-adjudication.v1'){adjudication++;return completion({status:'accepted',effects:[],stages:[],check:null,routine:{family:'cafe-service',version:1}});}npc++;return completion({type:'work',target:'tea',content:'準備一杯普通茶',mood:'平靜',durationMinutes:30,intents:[]});};
 try{
  const advance={operation:'advance',minutes:15};const first=await post(advance);assert.equal(first.status,200,(await first.clone().json()).error);
  let saved=(await(await GET()).json()).world;assert.equal(saved.routineRules.length,1);assert.equal(saved.objects[0].state.contents,'water');assert.equal(adjudication,1);
  await post(advance);saved=(await(await GET()).json()).world;assert.equal(saved.objects[0].state.contents,'tea');assert.equal(saved.characters.find(c=>c.id==='owner').plan,undefined);
  // GET uses SQLite JSON serialization; next POST loads a separate world object.
  const operation={...advance,operationId:id()};assert.equal((await post(operation)).status,200);assert.equal((await post(operation)).status,200);
  saved=(await(await GET()).json()).world;assert.equal(saved.objects.length,2);assert.equal(saved.objects[1].state.contents,'water');assert.equal(adjudication,1);assert.equal(npc,2);assert.equal(saved.aiUsage.totalCalls,3);
  await post(advance);saved=(await(await GET()).json()).world;assert.equal(saved.objects[1].state.contents,'tea');assert.ok(saved.routineAudit.some(e=>e.result==='reused'));
 }finally{global.fetch=previous;}
});

async function scenario(modify=()=>{},candidate={status:'accepted',effects:[],stages:[],check:null,routine:{family:'cafe-service',version:1}},decision={type:'work',target:'tea',content:'泡茶',mood:'平靜',durationMinutes:30,intents:[]}){
 const w=seedWorld();w.contextId='routine-failures';w.adjudication={provider:'openai',model:'gpt-6.1-sol'};w.characters.forEach(c=>{if(c.id!=='owner')c.control={mode:'taken-over'};});modify(w);store.install(w);
 const post=body=>POST(new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid'},body:JSON.stringify({operationId:id(),worldContext:w.contextId,mode:'openai',model:'gpt-6.1-sol',...body})}));await post({operation:'set-model-key',key:'fixture-key'});
 const previous=global.fetch;let dispatch=0;global.fetch=async(_url,init)=>{dispatch++;const input=JSON.parse(JSON.parse(init.body).messages[1].content);return completion(input.contractVersion==='world-adjudication.v1'?candidate:decision);};
 return {post,restore:()=>{global.fetch=previous;},calls:()=>dispatch,read:async()=>(await(await GET()).json()).world};
}
test('budget and malformed approval roll back rules, background and products while retaining paid attempts and replay safety',async()=>{
 for(const variant of ['budget','format']){
  const s=await scenario(w=>{if(variant==='budget')w.playerBudget={calls:1,tokens:1000000};},variant==='format'?{status:'accepted',effects:[],stages:[],check:null,routine:{family:'cafe-service',version:1,patch:{owner:'other'}}}:undefined);
  try{const op={operation:'advance',minutes:15,operationId:id()};const result=await s.post(op);assert.equal(result.status,variant==='budget'?429:502);const w=await s.read();assert.equal(w.turn,0);assert.equal(w.routineRules,undefined);assert.equal(w.supplies,undefined);assert.equal(w.objects,undefined);assert.equal(w.aiUsage.totalCalls,variant==='budget'?1:2);const calls=s.calls();await s.post(op);assert.equal(s.calls(),calls);}finally{s.restore();}
 }
});
test('save failure cannot expose half-approved ordinary background or a future product',async()=>{
 const s=await scenario();try{store.throwBeforeNextSave();const result=await s.post({operation:'advance',minutes:15});assert.equal(result.status,502);const w=await s.read();assert.equal(w.turn,0);assert.equal(w.routineRules,undefined);assert.equal(w.supplies,undefined);assert.equal(w.objects,undefined);}finally{s.restore();}
});
test('approval with a fabricated object target fails closed and cannot make an alternative cup',async()=>{
 const s=await scenario(()=>{},undefined,{type:'propose',target:'invented-cup',content:'泡一杯茶',purpose:'泡茶',mood:'平靜',durationMinutes:30,intents:[]});
 try{assert.equal((await s.post({operation:'advance',minutes:15})).status,200);const w=await s.read();assert.equal(w.objects,undefined);assert.equal(w.supplies,undefined);assert.match(w.characters.find(c=>c.id==='owner').activity,/沒有成功/);}finally{s.restore();}
});
test('ordinary rule diagnostics stay out of the next NPC decision and memory while physical results remain visible',async()=>{
 const s=await scenario();try{await s.post({operation:'advance',minutes:15});await s.post({operation:'advance',minutes:15});const previous=global.fetch;let input;global.fetch=async(url,init)=>{input=JSON.parse(JSON.parse(init.body).messages[1].content);return previous(url,init);};await s.post({operation:'advance',minutes:15});assert.equal(input.objects[0].state.contents,'tea');assert.doesNotMatch(JSON.stringify(input),/routineAudit|ruleId|routine-approved|routine-reuse|首次裁定|沿用日常規則/);}finally{s.restore();}
});
test('explicit exhausted tea materials cannot be replaced by ordinary background',async()=>{
 const s=await scenario(w=>{w.supplies=[{id:'last-tea',label:'明確有限的茶葉',region:'cafe-front',remaining:0,owner:'owner',knownTo:['owner'],allowedTo:['owner'],kind:'food',initialState:{}}];});
 try{assert.equal((await s.post({operation:'advance',minutes:15})).status,200);const w=await s.read();assert.equal(w.objects,undefined);assert.equal(w.supplies.length,1);assert.equal(w.supplies[0].remaining,0);assert.match(w.characters.find(c=>c.id==='owner').activity,/沒有成功/);}finally{s.restore();}
});
