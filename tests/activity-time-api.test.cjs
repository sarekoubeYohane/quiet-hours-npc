/* eslint-disable @typescript-eslint/no-require-imports */
const {fixtureDecision}=require('./pursuit-fixture.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
const {GET,POST}=load('route'),store=load('store'),{seedWorld}=load('world');
const id=()=>Date.now()+':'+crypto.randomUUID();
const completion=(v,_fixtureInput)=>Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(fixtureDecision(_fixtureInput,v))}}]});
const timings=tea=>['tea','coffee','food','drink','wash','return'].map(operation=>({operation,minutes:operation==='tea'?tea:operation==='coffee'?45:15}));
async function scenario(minutes,estimate=15,overrides={},adjust=approval=>approval){
 const w=seedWorld();w.contextId='activity-time';w.adjudication={provider:'openai',model:'gpt-6.1-sol'};w.characters.forEach(c=>{if(c.id!=='owner')c.control={mode:'taken-over'};});store.install(w);
 const post=body=>POST(new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationId:id(),worldContext:w.contextId,mode:'openai',model:'gpt-6.1-sol',...body})}));await post({operation:'set-model-key',key:'fixture-key'});
 let npc=0,judgments=0,decision={type:'propose',target:'cafe',content:'泡一杯普通茶',purpose:'飲用',mood:'平靜',durationMinutes:estimate,intents:[]};const old=global.fetch;
 global.fetch=async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);if(input.contractVersion==='world-adjudication.v1'){judgments++;assert.ok(input.routineOffer.templates.every(t=>!('minutes' in t.result)),'first offer must not preselect completion time');return completion({status:'accepted',effects:[],stages:[],check:null,routine:adjust({family:'cafe-service',version:1,operation:'tea',subject:'茶',timings:timings(minutes).map(t=>({...t,minutes:overrides[t.operation]??t.minutes}))})},JSON.parse(JSON.parse(init.body).messages[1].content));}npc++;return completion(decision,JSON.parse(JSON.parse(init.body).messages[1].content));};
 return {post,read:async()=>(await(await GET()).json()).world,restore:()=>{global.fetch=old;},counts:()=>({npc,judgments}),choose:d=>{decision={...decision,...d};}};
}
test('ordinary estimate fifteen permits confirmed thirty; serialized scope reuses coffee forty-five without adjudication',async()=>{
 const s=await scenario(30);try{
 const op={operation:'advance',minutes:15,operationId:id()};let r=await s.post(op);assert.equal(r.status,200,await r.clone().text());let w=await s.read();const owner=w.characters.find(c=>c.id==='owner');assert.equal(owner.plan.until-owner.plan.startedAt,30);assert.equal(w.objects.some(o=>o.state.beverage==='tea'),false);assert.equal(w.routineRules[0].templates.length,6);
 await s.post(op);assert.deepEqual(s.counts(),{npc:1,judgments:1});await s.post({operation:'advance',minutes:15});w=await s.read();assert.ok(w.objects.some(o=>o.state.beverage==='tea'));
 s.choose({content:'準備一杯咖啡'});await s.post({operation:'advance',minutes:15});w=await s.read();assert.equal(w.characters.find(c=>c.id==='owner').plan.until-w.characters.find(c=>c.id==='owner').plan.startedAt,45);assert.equal(w.objects.some(o=>o.state.beverage==='coffee'),false);await s.post({operation:'advance',minutes:15});assert.equal((await s.read()).objects.some(o=>o.state.beverage==='coffee'),false);await s.post({operation:'advance',minutes:15});w=await s.read();assert.ok(w.objects.some(o=>o.state.beverage==='coffee'));assert.deepEqual(s.counts(),{npc:2,judgments:1});assert.equal(w.aiUsage.totalCalls,3);
 }finally{s.restore();}
});
test('confirmed times fifteen, five and twenty align without treating a longer estimate as a minimum',async()=>{
 for(const [minutes,estimate,scheduled] of [[15,60,15],[5,15,15],[20,15,30],[90,15,90]]){
  const s=await scenario(minutes,estimate);try{const r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200,await r.clone().text());let w=await s.read();assert.equal(w.routineRules[0].templates.find(t=>t.operation==='tea').result.minutes,scheduled);assert.equal(w.objects.some(o=>o.state.beverage==='tea'),scheduled===15);for(let i=15;i<scheduled;i+=15)await s.post({operation:'advance',minutes:15});w=await s.read();assert.ok(w.objects.some(o=>o.state.beverage==='tea'));assert.deepEqual(s.counts(),{npc:1,judgments:1});}finally{s.restore();}
 }
});
test('missing scope times and illegal completion times fail atomically with paid usage and safe replay',async()=>{
 for(const value of [0,-1,1441,null,'30',undefined]){
  const s=await scenario(value);try{const operation={operation:'advance',minutes:15,operationId:id()};const r=await s.post(operation);assert.equal(r.status,502);const w=await s.read();assert.equal(w.turn,0);assert.equal(w.routineRules,undefined);assert.equal(w.objects,undefined);assert.equal(w.supplies,undefined);assert.equal(w.aiUsage.totalCalls,2);await s.post(operation);assert.deepEqual(s.counts(),{npc:1,judgments:1});}finally{s.restore();}
 }
});
test('later save failure retains completed tea and no half coffee plan, rule or paid replay',async()=>{
 const s=await scenario(30);try{await s.post({operation:'advance',minutes:15});await s.post({operation:'advance',minutes:15});const before=await s.read();s.choose({content:'準備一杯咖啡'});const operation={operation:'advance',minutes:15,operationId:id()};store.throwBeforeNextSave();assert.equal((await s.post(operation)).status,502);let w=await s.read();assert.deepEqual(w.objects,before.objects);assert.deepEqual(w.routineRules,before.routineRules);assert.deepEqual(w.supplies,before.supplies);assert.equal(w.aiUsage.totalCalls,3);await s.post(operation);assert.deepEqual(s.counts(),{npc:2,judgments:1});}finally{s.restore();}
});

test('food, drinking, washing and return all defer their full result to the confirmed completion',async()=>{
 const s=await scenario(15,15,{food:30,drink:30,wash:30,return:30});try{
 await s.post({operation:'advance',minutes:15});let w=await s.read();const cup=w.objects.find(o=>o.kind==='utensil'),drink=w.objects.find(o=>o.state.vessel===cup.id);
 for(const [content,purpose,before,after] of [['喝茶','飲用','tea','dirty'],['清洗杯子','清潔','dirty','empty'],['放回杯子','歸還','empty','empty']]){
  s.choose({content,purpose,target:cup.id});assert.equal((await s.post({operation:'advance',minutes:15})).status,200);w=await s.read();assert.equal(w.objects.find(o=>o.id===cup.id).state.contents,before);assert.ok(w.characters.find(c=>c.id==='owner').plan);if(content==='喝茶')assert.equal(w.objects.find(o=>o.id===drink.id).lifecycle,'active');if(content==='放回杯子')assert.equal(w.objects.find(o=>o.id===cup.id).holder,'owner');
  await s.post({operation:'advance',minutes:15});w=await s.read();assert.equal(w.objects.find(o=>o.id===cup.id).state.contents,after);if(content==='喝茶')assert.equal(w.objects.find(o=>o.id===drink.id).lifecycle,'consumed');if(content==='放回杯子')assert.equal(w.objects.find(o=>o.id===cup.id).holder,null);
 }
 s.choose({content:'準備一份簡餐',purpose:'用餐',target:'cafe'});await s.post({operation:'advance',minutes:15});assert.equal((await s.read()).objects.some(o=>o.label==='簡餐'),false);await s.post({operation:'advance',minutes:15});w=await s.read();assert.equal(w.objects.filter(o=>o.label==='簡餐').length,1);assert.deepEqual(s.counts(),{npc:5,judgments:1});
 }finally{s.restore();}
});

test('a first approval must confirm the complete scope exactly once',async()=>{
 for(const adjust of [a=>{delete a.timings;return a;},a=>({...a,timings:a.timings.slice(0,1)}),a=>({...a,timings:[...a.timings.slice(0,5),a.timings[0]]}),a=>({...a,timings:a.timings.map(t=>({...t,extra:true}))})]){
  const s=await scenario(30,15,{},adjust);try{assert.equal((await s.post({operation:'advance',minutes:15})).status,502);const w=await s.read();assert.equal(w.turn,0);assert.equal(w.routineRules,undefined);assert.equal(w.supplies,undefined);assert.equal(w.objects,undefined);}finally{s.restore();}
 }
});
