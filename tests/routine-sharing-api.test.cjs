/* eslint-disable @typescript-eslint/no-require-imports */
const {fixtureDecision}=require('./pursuit-fixture.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {nonPhoneObjects}=require('./fixtures/non-phone-objects.cjs');
const load=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
const {GET,POST}=load('route'),store=load('store'),{seedWorld}=load('world');
const id=()=>Date.now()+':'+crypto.randomUUID();
const tea={type:'work',target:'tea',content:'泡茶',mood:'平靜',durationMinutes:30,intents:[]};
async function fixture(modify=()=>{}){
 const w=seedWorld();w.contextId='sharing';w.adjudication={provider:'openai',model:'fixture-adjudicator'};w.characters.forEach(c=>c.control={mode:'taken-over'});
 const c=w.characters.find(c=>c.id==='vera');c.location='cafe';c.region='cafe-front';c.control={mode:'autonomous'};c.routineCapabilities=['tea'];
 w.routineRules=[{id:'tea-rule',version:1,family:'cafe-service',operations:['tea'],origin:'cafe',knownTo:['owner','vera']}];
 w.objects=[{id:'local-cup',source:'finite',label:'借用的茶杯',region:'cafe-front',holder:null,owner:'owner',revision:1,state:{contents:'empty'},lifecycle:'active',kind:'utensil',knownTo:['owner','vera'],allowedTo:['owner','vera'],stateTransitions:{contents:['empty','water','tea']}}];w.supplies=[{id:'tea-leaves',label:'茶葉',region:'cafe-front',remaining:8,owner:'owner',knownTo:['owner','vera'],allowedTo:['owner','vera'],kind:'food',initialState:{}}];modify(w,c);store.install(w);
 const post=body=>POST(new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationId:id(),worldContext:w.contextId,mode:'openai',model:'gpt-6.1-sol',...body})}));await post({operation:'set-model-key',key:'fixture-key'});
 const prev=global.fetch,inputs=[];let decision=tea,candidate={status:'accepted',completionMinutes:null,effects:[],stages:[],check:null,routine:{family:'cafe-service',version:1,timings:[{operation:'tea',minutes:30}]}};
 global.fetch=async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);inputs.push(input);return Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(fixtureDecision(JSON.parse(JSON.parse(init.body).messages[1].content),input.contractVersion==='world-adjudication.v1'?candidate:decision))}}]});};
 return {post,inputs,read:async()=>(await(await GET()).json()).world,restore:()=>global.fetch=prev,decision:v=>decision=v,candidate:v=>candidate=v};
}
test('another capable knowledgeable actor uses actual local permission without another adjudicator or changing ownership',async()=>{
 const s=await fixture();try{assert.equal((await s.post({operation:'advance',minutes:15})).status,200);let w=await s.read();assert.equal(w.objects[0].state.contents,'water');await s.post({operation:'advance',minutes:15});w=await s.read();assert.equal(w.objects[0].state.contents,'tea');assert.equal(w.objects[0].owner,'owner');assert.equal(w.objects[0].holder,'vera');assert.equal(s.inputs.filter(i=>i.contractVersion==='world-adjudication.v1').length,0);assert.equal(w.aiUsage.totalCalls,1);}finally{s.restore();}
});
for(const missing of ['knowledge','capability','rights','object-knowledge'])test(`shared ordinary request with missing ${missing} stays blocked with no fresh adjudication`,async()=>{
 const s=await fixture((w,c)=>{if(missing==='knowledge')w.routineRules[0].knownTo=['owner'];if(missing==='capability')c.routineCapabilities=[];if(missing==='rights')w.objects[0].allowedTo=['owner'];if(missing==='object-knowledge')w.objects[0].knownTo=['owner'];});try{await s.post({operation:'advance',minutes:15});const w=await s.read();assert.equal(w.objects[0].state.contents,'empty');assert.equal(s.inputs.filter(i=>i.contractVersion==='world-adjudication.v1').length,0);assert.equal(w.aiUsage.totalCalls,1);assert.doesNotMatch(JSON.stringify(s.inputs),/ruleId|routineAudit|finite|tea-rule/);}finally{s.restore();}
});
test('same procedure binds a different confirmed home cup without copying cafe resources or authority',async()=>{
 const s=await fixture((w,c)=>{c.location='vera-home';c.region='vera-home-main';w.routinePlaces.push({location:'vera-home',purpose:'home',operators:['vera'],confirmedOperations:['tea']});w.objects.push({...structuredClone(w.objects[0]),id:'home-cup',region:'vera-home-main',owner:'vera',knownTo:['vera'],allowedTo:['vera']});});try{await s.post({operation:'advance',minutes:15});let w=await s.read();assert.equal(w.objects.find(o=>o.id==='home-cup').state.contents,'water');await s.post({operation:'advance',minutes:15});w=await s.read();assert.equal(w.objects.find(o=>o.id==='home-cup').state.contents,'tea');assert.equal(w.objects.find(o=>o.id==='local-cup').state.contents,'empty');assert.equal(s.inputs.filter(i=>i.contractVersion==='world-adjudication.v1').length,0);assert.equal(w.objects.filter(o=>o.kind==='utensil').length,2);assert.equal(w.routineRules.length,1);}finally{s.restore();}
});
test('unconfirmed home background receives one bounded local confirmation then new activity survives reload and replay',async()=>{
 const s=await fixture((w,c)=>{c.location='vera-home';c.region='vera-home-main';w.routinePlaces.push({location:'vera-home',purpose:'home',operators:['vera']});});try{await s.post({operation:'advance',minutes:15});let w=await s.read();assert.equal(nonPhoneObjects(w).length,2);assert.equal(nonPhoneObjects(w)[1].region,'vera-home-main');await s.post({operation:'advance',minutes:15});const op={operation:'advance',minutes:15,operationId:id()};await s.post(op);await s.post(op);w=await s.read();assert.equal(nonPhoneObjects(w).length,4);assert.equal(nonPhoneObjects(w)[3].state.contents,'water');assert.equal(s.inputs.filter(i=>i.contractVersion==='world-adjudication.v1').length,1);assert.equal(w.routineRules.length,2);assert.deepEqual(w.routineRules.find(r=>r.origin==='vera-home').operations,['tea']);assert.deepEqual(w.routinePlaces.find(p=>p.location==='vera-home').confirmedOperations,['tea']);assert.equal(nonPhoneObjects(w)[1].owner,'vera');assert.equal(nonPhoneObjects(w)[0].region,'cafe-front');assert.equal(w.aiUsage.totalCalls,3);}finally{s.restore();}
});
test('owner grants local materials and cup through legal proposals before recipient chooses its own activity',async()=>{
 const s=await fixture(w=>{w.objects[0].allowedTo=['owner'];w.objects[0].knownTo=['owner'];w.supplies[0].allowedTo=['owner'];w.supplies[0].knownTo=['owner'];});try{
  let w=await s.read();w.characters.find(c=>c.id==='vera').control={mode:'taken-over'};w.characters.find(c=>c.id==='owner').control={mode:'autonomous'};store.replaceCommittedWorld(w);
  for(const targetId of ['local-cup','tea-leaves']){
   s.decision({type:'propose',target:targetId,content:'允許 Vera 使用這件物資',purpose:'授權使用',mood:'平靜',durationMinutes:15,intents:[]});s.candidate({status:'accepted',completionMinutes:15,effects:[{kind:'grant',targetId,recipient:'vera'}],stages:[],check:null,routine:null});const response=await s.post({operation:'advance',minutes:15});assert.equal(response.status,200,await response.text());
  }
  w=await s.read();assert.deepEqual(w.characters.find(c=>c.id==='vera').routineCapabilities,['tea']);assert.deepEqual(w.routineRules[0].knownTo,['owner','vera']);assert.equal(w.objects[0].holder,null);assert.equal(w.objects[0].owner,'owner');assert.equal(w.objects[0].acceptedBy,undefined);
  w.characters.find(c=>c.id==='owner').control={mode:'taken-over'};w.characters.find(c=>c.id==='vera').control={mode:'autonomous'};store.replaceCommittedWorld(w);s.decision(tea);
  const count=s.inputs.filter(i=>i.contractVersion==='world-adjudication.v1').length;await s.post({operation:'advance',minutes:15});await s.post({operation:'advance',minutes:15});w=await s.read();assert.equal(w.objects[0].state.contents,'tea');assert.equal(w.objects[0].holder,'vera');assert.equal(w.supplies[0].remaining,7);assert.equal(s.inputs.filter(i=>i.contractVersion==='world-adjudication.v1').length,count);assert.equal(count,2);
 }finally{s.restore();}
});
test('cup-only permission does not grant materials or café background and repeated requests add no adjudication',async()=>{
 const s=await fixture(w=>{w.supplies[0].allowedTo=['owner'];});try{for(let i=0;i<2;i++)await s.post({operation:'advance',minutes:15});const w=await s.read();assert.equal(w.objects[0].state.contents,'empty');assert.equal(w.supplies[0].remaining,8);assert.equal(s.inputs.filter(i=>i.contractVersion==='world-adjudication.v1').length,0);}finally{s.restore();}
});
test('shared actor save failure and replay retain spent decision but commit no half product or background',async()=>{
 const s=await fixture();try{store.throwBeforeNextSave();const op={operation:'advance',minutes:15,operationId:id()};assert.equal((await s.post(op)).status,502);let w=await s.read();assert.equal(w.turn,0);assert.equal(w.objects[0].state.contents,'empty');assert.equal(w.routineAudit,undefined);assert.equal(w.aiUsage.totalCalls,1);await s.post(op);w=await s.read();assert.equal(s.inputs.length,1);assert.equal(w.turn,0);}finally{s.restore();}
});
test('another account cannot read shared routine or receive its products',async()=>{
 const s=await fixture();const auth=load('auth');try{const other=seedWorld();other.contextId='other-world';store.installForOwner('other',other);auth.setUserId('other');const w=await s.read();assert.equal(w.routineRules,undefined);assert.equal(w.objects,undefined);assert.equal((await s.post({operation:'advance',minutes:15})).status,409);}finally{auth.setUserId('test-owner');s.restore();}
});
test('shared method cannot substitute receiving consent when delivering a concrete borrowed cup',async()=>{
 const s=await fixture(w=>{const kris=w.characters.find(c=>c.id==='kris');kris.location='cafe';kris.region='cafe-front';w.objects[0].holder='vera';w.objects[0].knownTo.push('kris');w.objects[0].allowedTo.push('kris');});try{
  s.decision({type:'propose',target:'local-cup',content:'交給 Kris 這隻杯子',purpose:'交付',mood:'平靜',durationMinutes:15,intents:[]});s.candidate({status:'accepted',completionMinutes:15,effects:[{kind:'transfer',objectId:'local-cup',expectedRevision:1,toHolder:'kris',toRegion:'cafe-front'}],stages:[],check:null,routine:null});assert.equal((await s.post({operation:'advance',minutes:15})).status,502);const w=await s.read();assert.equal(w.objects[0].holder,'vera');assert.equal(w.objects[0].acceptedBy,undefined);assert.equal(w.turn,0);
 }finally{s.restore();}
});
test('concrete cup that cannot hold the requested tea remains a known obstruction rather than a technical failure',async()=>{
 const s=await fixture(w=>{w.objects[0].stateTransitions.contents=['empty','water'];});try{assert.equal((await s.post({operation:'advance',minutes:15})).status,200);const w=await s.read();assert.equal(w.objects[0].state.contents,'empty');assert.equal(w.routineAudit.at(-1).result,'blocked');assert.equal(s.inputs.filter(i=>i.contractVersion==='world-adjudication.v1').length,0);}finally{s.restore();}
});
