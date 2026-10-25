/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
const {GET,POST}=load('route'),store=load('store'),{seedWorld}=load('world');
const id=()=>Date.now()+':'+crypto.randomUUID();
const completion=v=>Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(v)}}]});
const cup=()=>({id:'cup',source:'finite-cups',label:'店內茶杯',region:'cafe-front',holder:null,owner:'owner',revision:1,state:{contents:'empty',condition:'broken'},lifecycle:'active',kind:'utensil',knownTo:['owner'],allowedTo:['owner'],stateTransitions:{contents:['empty','water','tea'],condition:['broken','sound']}});
async function fixture(modify=()=>{}) {
 const w=seedWorld();w.contextId='obstacle-fixture';w.adjudication={provider:'openai',model:'fixture-adjudicator'};w.characters.forEach(c=>{if(c.id!=='owner')c.control={mode:'taken-over'};});
 w.routineRules=[{id:'tea-rule',version:1,family:'cafe-service',operations:['tea'],origin:'cafe',knownTo:['owner']}];w.objects=[cup()];modify(w);store.install(w);
 const post=body=>POST(new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationId:id(),worldContext:w.contextId,mode:'openai',model:'gpt-6.1-sol',...body})}));await post({operation:'set-model-key',key:'fixture-key'});
 const previous=global.fetch,inputs=[];let decision={type:'work',target:'tea',content:'泡茶',mood:'平靜',durationMinutes:30,intents:[]},candidate={status:'unsupported',effects:[],stages:[],check:null};
 global.fetch=async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);inputs.push(input);return completion(input.contractVersion==='world-adjudication.v1'?candidate:decision);};
 return {post,inputs,decision:v=>{decision=v;},candidate:v=>{candidate=v;},read:async()=>(await(await GET()).json()).world,restore:()=>{global.fetch=previous;}};
}
test('known broken utensil gives a knowable obstruction across fresh worded operations and serialized reload, then actual repair recovers',async()=>{
 const s=await fixture();try{
  assert.equal((await s.post({operation:'advance',minutes:15})).status,200);
  let w=await s.read();assert.match(w.characters.find(c=>c.id==='owner').activity,/器具.*損壞/);assert.equal(w.routineAudit.at(-1).result,'blocked');
  s.decision({type:'propose',target:'cafe',content:'沖泡一壺紅茶',purpose:'泡茶',mood:'平靜',durationMinutes:30,intents:[]});
  assert.equal((await s.post({operation:'advance',minutes:15})).status,200);w=await s.read();assert.equal(w.turn,2);assert.equal(w.objects[0].state.contents,'empty');assert.equal(w.aiUsage.totalCalls,2);assert.equal(s.inputs.filter(i=>i.contractVersion==='world-adjudication.v1').length,0);assert.equal(w.events.filter(e=>e.kind==='attempt').length,0);
  // Explicit authoritative fixture change, no product repair subsystem claimed.
  w.objects[0].state.condition='sound';w.objects[0].revision++;store.replaceCommittedWorld(w);
  assert.equal((await s.post({operation:'advance',minutes:15})).status,200);w=await s.read();assert.equal(w.objects[0].state.contents,'water');
  await s.post({operation:'advance',minutes:15});w=await s.read();assert.equal(w.objects[0].state.contents,'tea');assert.equal(w.objects.filter(o=>o.kind==='utensil').length,1);assert.equal(w.aiUsage.totalCalls,3);
  assert.doesNotMatch(JSON.stringify(s.inputs),/routineAudit|ruleId|anti.loop|反循環|必須放棄|owner_consent/);
 }finally{s.restore();}
});

test('an activity keeps earlier water but cannot finish after an actual utensil break, and the NPC chooses its own next method',async()=>{
 const s=await fixture(w=>{w.objects[0].state.condition='sound';});try{
  await s.post({operation:'advance',minutes:15});let w=await s.read();assert.equal(w.objects[0].state.contents,'water');
  // A live condition update can precede the next phase; do not rely on revision
  // alone to authorize using a now-broken or no-longer-permitted utensil.
  w.objects[0].state.condition='broken';store.replaceCommittedWorld(w);
  await s.post({operation:'advance',minutes:15});w=await s.read();assert.equal(w.objects[0].state.contents,'water');assert.equal(w.characters.find(c=>c.id==='owner').plan,undefined);assert.match(w.characters.find(c=>c.id==='owner').activity,/條件已改變/);assert.equal(w.aiUsage.totalCalls,1);
  s.decision({type:'propose',target:'cup',content:'用另一種裝置加熱這杯水',purpose:'泡茶',mood:'平靜',durationMinutes:30,intents:[]});
  await s.post({operation:'advance',minutes:15});w=await s.read();assert.equal(s.inputs.filter(i=>i.contractVersion==='world-adjudication.v1').length,1);assert.equal(w.aiUsage.totalCalls,3);assert.equal(w.objects[0].state.contents,'water');assert.match(w.characters.find(c=>c.id==='owner').activity,/無法落實/);
 }finally{s.restore();}
});

for(const obstacle of ['depleted','permission'])test(`known ${obstacle} remains blocked across unrelated changes and recovers only after authoritative conditions improve`,async()=>{
 const s=await fixture(w=>{
  w.objects[0].state.condition='sound';
  if(obstacle==='depleted')w.supplies=[{id:'tea-leaves',label:'最後的茶葉',region:'cafe-front',remaining:0,owner:'owner',knownTo:['owner'],allowedTo:['owner'],kind:'food',initialState:{}}];
  else {w.objects[0].owner='someone-else';w.objects[0].allowedTo=[];}
 });try{
  await s.post({operation:'advance',minutes:15});let w=await s.read();assert.match(w.characters.find(c=>c.id==='owner').activity,/沒有新增成果/);assert.doesNotMatch(w.characters.find(c=>c.id==='owner').activity,/材料已用完|物主已拒絕/);assert.equal(w.routineAudit.at(-1).result,'blocked');
  w.characters.find(c=>c.id!=='owner').mood='好奇';store.replaceCommittedWorld(w);await s.post({operation:'advance',minutes:15});w=await s.read();assert.equal(w.aiUsage.totalCalls,2);assert.equal(w.objects[0].state.contents,'empty');
  if(obstacle==='depleted')w.supplies[0].remaining=1;else w.objects[0].allowedTo=['owner'];store.replaceCommittedWorld(w);
  await s.post({operation:'advance',minutes:15});w=await s.read();assert.equal(w.objects[0].state.contents,'water');assert.equal(s.inputs.filter(i=>i.contractVersion==='world-adjudication.v1').length,0);assert.equal(w.aiUsage.totalCalls,3);
  if(obstacle==='depleted'){assert.equal(w.supplies[0].remaining,0);assert.equal(w.objects.find(o=>o.source==='tea-leaves').lifecycle,'consumed');}
  const modelInput=s.inputs.at(-1);assert.doesNotMatch(JSON.stringify(modelInput),/someone-else|routineAudit|ruleId/);
 }finally{s.restore();}
});

test('genuinely new methods use one adjudicator slot, retain denied versus unsupported, and contract failures leave no false world prohibition',async()=>{
 for(const outcome of ['accepted','denied','unsupported','invalid']){
  const s=await fixture();try{
   s.decision({type:'propose',target:'cup',content:'用感應加熱器修復茶具',purpose:'修理器具',mood:'平靜',durationMinutes:30,intents:[]});
   s.candidate(outcome==='accepted'?{status:'accepted',effects:[{kind:'state',objectId:'cup',expectedRevision:1,key:'condition',value:'sound'}],stages:[],check:null}:outcome==='invalid'?{status:'accepted',effects:[],stages:[],check:null,patch:{invent:'tea'}}:{status:outcome,effects:[],stages:[],check:null});
   const r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,outcome==='invalid'?502:200);const w=await s.read();assert.equal(s.inputs.filter(i=>i.contractVersion==='world-adjudication.v1').length,1);assert.equal(w.aiUsage.totalCalls,2);assert.equal(w.routineAudit?.at(-1)?.result,outcome==='invalid'?undefined:'exception');assert.equal(w.objects[0].state.condition,outcome==='accepted'?'sound':'broken');
   if(outcome==='invalid'){assert.equal(w.turn,0);assert.ok((await r.json()).stopReason);}
   else assert.match(w.characters.find(c=>c.id==='owner').activity,outcome==='accepted'?/condition=sound/:outcome==='denied'?/沒有成功/:/無法落實/);
  }finally{s.restore();}
 }
});

test('failed saving a known obstruction leaves no half-audit or false background and replays no new paid request',async()=>{
 const s=await fixture();try{
  store.throwBeforeNextSave();const op={operation:'advance',minutes:15,operationId:id()};const r=await s.post(op);assert.equal(r.status,502);let w=await s.read();assert.equal(w.turn,0);assert.equal(w.routineAudit,undefined);assert.equal(w.supplies,undefined);assert.equal(w.objects[0].state.condition,'broken');assert.equal(w.aiUsage.totalCalls,1);
  await s.post(op);assert.equal(s.inputs.length,1);w=await s.read();assert.equal(w.turn,0);
 }finally{s.restore();}
});

test('live permission revocation interrupts the phase, preserving earlier results and disclosing no hidden authority truth',async()=>{
 const s=await fixture(w=>{w.objects[0].state.condition='sound';w.objects[0].owner='secret-owner';});try{
  await s.post({operation:'advance',minutes:15});let w=await s.read();assert.equal(w.objects[0].state.contents,'water');w.objects[0].allowedTo=[];store.replaceCommittedWorld(w);
  await s.post({operation:'advance',minutes:15});w=await s.read();assert.equal(w.objects[0].state.contents,'water');assert.equal(w.characters.find(c=>c.id==='owner').plan,undefined);assert.match(w.characters.find(c=>c.id==='owner').activity,/條件已改變/);assert.doesNotMatch(JSON.stringify(w.events),/secret-owner/);assert.equal(w.aiUsage.totalCalls,1);
 }finally{s.restore();}
});
