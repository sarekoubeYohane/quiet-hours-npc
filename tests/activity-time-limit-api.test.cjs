/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
const {GET,POST}=load('route'),store=load('store'),{seedWorld}=load('world');
const id=()=>Date.now()+':'+crypto.randomUUID();
const completion=v=>Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(v)}}]});
async function scenario(minutes=30,maxMinutes=15,options={}){
 const w=seedWorld();w.contextId='activity-limit';w.adjudication={provider:'openai',model:'gpt-6.1-sol'};w.characters.forEach(c=>{if(c.id!=='owner')c.control={mode:'taken-over'};});store.install(w);
 const post=body=>POST(new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid'},body:JSON.stringify({operationId:id(),worldContext:w.contextId,mode:'openai',model:'gpt-6.1-sol',...body})}));await post({operation:'set-model-key',key:'fixture-key'});
 let npc=0,judgments=0,inputs=[],decision={type:'propose',target:'cafe',content:'泡一杯普通茶',purpose:'飲用',mood:'平靜',durationMinutes:15,intents:[],timeIntent:{kind:'completion',maxMinutes}};const old=global.fetch;
 global.fetch=async(_url,init)=>{const request=JSON.parse(init.body),input=JSON.parse(request.messages[1].content);if(input.contractVersion==='world-adjudication.v1'){judgments++;return completion({status:'accepted',effects:[],stages:[],check:null,routine:{family:'cafe-service',version:1,operation:options.operation||'tea',subject:options.subject===undefined?'茶':options.subject,timings:['tea','coffee','food','drink','wash','return'].map(operation=>({operation,minutes:operation===(options.operation||'tea')?minutes:15}))}});}assert.ok(request.response_format.json_schema.schema.required.includes('timeIntent'));npc++;inputs.push(input);return completion(decision);};
 return {post,read:async()=>(await(await GET()).json()).world,restore:()=>{global.fetch=old;},counts:()=>({npc,judgments}),inputs,choose:d=>{decision={...decision,...d};}};
}
test('explicit limit stops before execution but persists approval; next autonomous choice reloads and reuses it',async()=>{
 const s=await scenario();try{
  const op={operation:'advance',minutes:15,operationId:id()};let r=await s.post(op);assert.equal(r.status,200,await r.clone().text());let w=await s.read(),owner=w.characters.find(c=>c.id==='owner');assert.equal(w.turn,1);assert.equal(owner.plan,undefined);assert.equal(w.objects,undefined);assert.equal(w.supplies,undefined);assert.equal(w.routineRules[0].templates.find(t=>t.operation==='tea').result.minutes,30);assert.ok(w.routinePlaces[0].confirmedOperations.includes('tea'));assert.match(owner.activity,/30/);assert.match(owner.activity,/15/);assert.match(owner.activity,/尚未啟動/);assert.deepEqual(s.counts(),{npc:1,judgments:1});
  await s.post(op);assert.deepEqual(s.counts(),{npc:1,judgments:1});
  s.choose({timeIntent:{kind:'completion',maxMinutes:30}});r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200,await r.clone().text());w=await s.read();assert.equal(w.characters.find(c=>c.id==='owner').plan.until-w.characters.find(c=>c.id==='owner').plan.startedAt,30);assert.equal(w.objects[0].state.contents,'water');assert.match(JSON.stringify(s.inputs[1].self),/尚未啟動/);assert.deepEqual(s.counts(),{npc:2,judgments:1});
  await s.post({operation:'advance',minutes:15});w=await s.read();assert.equal(w.objects.filter(o=>o.state.beverage==='tea').length,1);assert.equal(w.aiUsage.totalCalls,3);assert.equal(w.routineRules.length,1);
 }finally{s.restore();}
});
test('aligned completion is compared against the unchanged explicit cap and repeated insufficiency remains free of adjudication',async()=>{
 for(const [reasonable,cap,starts] of [[20,20,false],[20,30,true],[5,15,true],[30,null,true]]){
  const s=await scenario(reasonable,cap);try{
   assert.equal((await s.post({operation:'advance',minutes:15})).status,200);let w=await s.read();assert.equal(w.routineRules[0].templates.find(t=>t.operation==='tea').result.minutes,reasonable===5?15:30);
   if(!starts){assert.equal(w.objects,undefined);assert.equal(w.characters.find(c=>c.id==='owner').plan,undefined);assert.match(w.characters.find(c=>c.id==='owner').activity,/20/);await s.post({operation:'advance',minutes:15});w=await s.read();assert.equal(w.objects,undefined);assert.deepEqual(s.counts(),{npc:2,judgments:1});}
   else{assert.ok(w.objects?.length);assert.doesNotMatch(w.characters.find(c=>c.id==='owner').activity,/上限/);}
  }finally{s.restore();}
 }
});
test('invalid explicit limits are technical failures before adjudication and replay never redispatches',async()=>{
 for(const maxMinutes of [0,-1,91,'15',undefined]){
  const s=await scenario(30,maxMinutes);try{
   if(maxMinutes===undefined)s.choose({timeIntent:{kind:'completion'}});
   const op={operation:'advance',minutes:15,operationId:id()};assert.equal((await s.post(op)).status,502);const w=await s.read();assert.equal(w.turn,0);assert.equal(w.routineRules,undefined);assert.equal(w.objects,undefined);assert.equal(w.aiUsage.totalCalls,1);await s.post(op);assert.deepEqual(s.counts(),{npc:1,judgments:0});
  }finally{s.restore();}
 }
});
test('saving failure during normal insufficiency rolls back approval and preserves paid usage without replay',async()=>{
 const s=await scenario();try{
  const op={operation:'advance',minutes:15,operationId:id()};store.throwBeforeNextSave();assert.equal((await s.post(op)).status,502);const w=await s.read();assert.equal(w.turn,0);assert.equal(w.routineRules,undefined);assert.equal(w.routinePlaces[0].confirmedOperations,undefined);assert.equal(w.objects,undefined);assert.equal(w.supplies,undefined);assert.equal(w.aiUsage.totalCalls,2);await s.post(op);assert.deepEqual(s.counts(),{npc:1,judgments:1});
 }finally{s.restore();}
});

test('a malformed routine subject remains technical even when the explicit cap would be too short',async()=>{
 const s=await scenario(30,15,{operation:'food',subject:null});try{
  s.choose({content:'做一點吃的給自己',purpose:'用餐'});assert.equal((await s.post({operation:'advance',minutes:15})).status,502);const w=await s.read();assert.equal(w.turn,0);assert.equal(w.routineRules,undefined);assert.equal(w.objects,undefined);
 }finally{s.restore();}
});
