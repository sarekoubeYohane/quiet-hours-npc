/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
const {GET,POST}=load('route'),store=load('store'),{seedWorld}=load('world');
const opid=()=>Date.now()+':'+crypto.randomUUID();
const completion=v=>Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(v)}}]});
const tea={type:'propose',target:'cafe',content:'泡一杯茶',purpose:'飲用',mood:'平靜',durationMinutes:15,intents:[],timeIntent:{kind:'completion',maxMinutes:null}};
const rest={type:'rest',target:'',content:'安靜休息',mood:'平靜',durationMinutes:45,intents:[],timeIntent:{kind:'open-ended',maxMinutes:null}};
async function scenario(minutes=60,prepare=()=>{},adjudicate){
 const w=seedWorld();w.contextId='time-lifecycle';w.characters=w.characters.filter(c=>c.id==='owner');w.adjudication={provider:'openai',model:'fixture-judge'};prepare(w);store.install(w);
 const post=body=>POST(new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid'},body:JSON.stringify({operationId:opid(),worldContext:w.contextId,mode:'openai',model:'gpt-6-luna',...body})}));await post({operation:'set-model-key',key:'fixture-key'});
 let decision=tea,npc=0,judgments=0;const inputs=[],old=global.fetch;
 global.fetch=async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);if(input.contractVersion==='world-adjudication.v1'){judgments++;if(adjudicate)return completion(adjudicate(input));return completion({status:'accepted',effects:[],stages:[],check:null,completionMinutes:null,routine:{family:'cafe-service',version:1,operation:'tea',subject:'茶',timings:['tea','coffee','food','drink','wash','return'].map(operation=>({operation,minutes:operation==='tea'?minutes:15}))}});}npc++;inputs.push(input);return completion(typeof decision==='function'?decision(input):decision);};
 return {post,read:async()=>(await(await GET()).json()).world,choose:d=>{decision=d;},counts:()=>({npc,judgments}),inputs,restore:()=>{global.fetch=old;}};
}
test('switching after a known intervention preserves water and cancels future serving after reload and replay',async()=>{
 const s=await scenario();try{
 await s.post({operation:'advance',minutes:15});let w=await s.read();const cup=w.objects[0];assert.equal(cup.state.contents,'water');assert.equal(w.supplies.filter(x=>x.pending).length,1);
 await s.post({operation:'intervene',target:'owner',text:'有件事想請你先停下來。'});s.choose(rest);const body={operation:'advance',minutes:15,operationId:opid()};assert.equal((await s.post(body)).status,200);w=await s.read();assert.equal(w.objects[0].id,cup.id);assert.equal(w.objects[0].state.contents,'water');assert.equal(w.characters[0].plan.timeIntent.kind,'open-ended');assert.equal(w.supplies.filter(x=>x.pending).length,0);
 await s.post(body);assert.deepEqual(s.counts(),{npc:2,judgments:1});await s.post({operation:'advance',minutes:15});await s.post({operation:'advance',minutes:15});w=await s.read();assert.equal(w.objects.some(x=>x.kind==='food'),false);assert.equal(w.objects[0].state.contents,'water');assert.deepEqual(s.counts(),{npc:2,judgments:1});
 }finally{s.restore();}
});

test('known-rule tea uses confirmed time through direct once, takeover and rule mode without another model',async()=>{
 const s=await scenario(30);try{
 await s.post({operation:'advance',minutes:15});await s.post({operation:'advance',minutes:15});assert.deepEqual(s.counts(),{npc:1,judgments:1});
 assert.equal((await s.post({operation:'takeover'})).status,200);const direct={operation:'direct',action:{type:'work',target:'tea',content:'泡一杯茶'}};const response=await s.post(direct);assert.equal(response.status,200,await response.clone().text());
 const body={operation:'advance',minutes:15,operationId:opid()};assert.equal((await s.post(body)).status,200);let w=await s.read();const plan=w.characters[0].plan;assert.equal(plan.until-plan.startedAt,30);assert.equal(w.characters[0].control.active,true);assert.equal(w.objects.filter(x=>x.state.beverage==='tea').length,1);await s.post(body);assert.deepEqual(s.counts(),{npc:1,judgments:1});
 assert.equal((await s.post({operation:'advance',minutes:15})).status,200);w=await s.read();assert.equal(w.characters[0].plan,undefined);assert.equal(w.characters[0].control.active,undefined);assert.equal(w.characters[0].control.mode,'taken-over');assert.equal(w.objects.filter(x=>x.state.beverage==='tea').length,2);assert.deepEqual(s.counts(),{npc:1,judgments:1});
 await s.post({operation:'return-control'});await s.post({operation:'intervene',target:'owner',text:'先泡一杯茶'});assert.equal((await s.post({operation:'advance',minutes:15,mode:'demo'})).status,200);w=await s.read();assert.equal(w.characters[0].plan.until-w.characters[0].plan.startedAt,30);await s.post({operation:'advance',minutes:15,mode:'demo'});w=await s.read();assert.equal(w.objects.filter(x=>x.state.beverage==='tea').length,3);assert.deepEqual(s.counts(),{npc:1,judgments:1});
 }finally{s.restore();}
});

test('explicit continuation preserves original completion and open-ended clocks without another adjudication or phase replay',async()=>{
 for(const [initial,minutes] of [[tea,60],[tea,90],[rest,60]]){
  const s=await scenario(minutes);try{
   s.choose(initial);await s.post({operation:'advance',minutes:15});let w=await s.read();const plan=structuredClone(w.characters[0].plan),objects=structuredClone(w.objects);
   await s.post({operation:'intervene',target:'owner',text:'現在方便嗎？'});s.choose({...rest,type:'continue',durationMinutes:90});assert.equal((await s.post({operation:'advance',minutes:15})).status,200);w=await s.read();assert.equal(w.characters[0].plan.startedAt,plan.startedAt);assert.equal(w.characters[0].plan.until,plan.until);assert.deepEqual(w.characters[0].plan.timeIntent,plan.timeIntent);assert.deepEqual(w.objects,objects);if(plan.phases)assert.equal(w.characters[0].plan.phases.cursor,plan.phases.cursor);
   if(initial===rest){await s.post({operation:'intervene',target:'owner',text:'你這段休息快結束了嗎？'});await s.post({operation:'advance',minutes:15});w=await s.read();assert.equal(w.characters[0].plan,undefined);assert.match(w.characters[0].activity,/時段.*到期/);assert.deepEqual(s.counts(),{npc:3,judgments:0});}
   else{for(let i=30;i<minutes;i+=15)await s.post({operation:'advance',minutes:15});w=await s.read();assert.equal(w.characters[0].plan,undefined);assert.equal(w.objects.filter(x=>x.state.beverage==='tea').length,1);assert.deepEqual(s.counts(),{npc:2,judgments:1});}
  }finally{s.restore();}
 }
});

test('another NPC moves an intermediate object and the ninety-minute stale completion preserves that new fact without revealing hidden destination',async()=>{
 let ownerStep=0,cassStep=0;
 const s=await scenario(90,w=>{
  const cass=seedWorld().characters.find(c=>c.id==='cass');cass.location='cafe';cass.region='cafe-front';w.characters.push(cass);
  w.objects=[{id:'shared-cup',source:'fixture',label:'共用杯子',region:'cafe-front',holder:null,owner:'owner',revision:1,state:{contents:'empty'},lifecycle:'active',kind:'utensil',knownTo:['owner','cass'],allowedTo:['owner','cass'],stateTransitions:{contents:['empty','water','tea']}}];
 },input=>input.actor.id==='cass'?{status:'accepted',effects:[],stages:[{afterMinutes:15,preconditions:[],effects:[{kind:'state',objectId:'shared-cup',expectedRevision:1,key:'contents',value:'water'}]},{afterMinutes:90,preconditions:[{objectId:'shared-cup',revision:2,region:'cafe-front',holder:null,state:[{key:'contents',value:'water'}]}],effects:[{kind:'state',objectId:'shared-cup',expectedRevision:2,key:'contents',value:'tea'}]}],check:null,routine:null,completionMinutes:90}:{status:'accepted',effects:[{kind:'transfer',objectId:'shared-cup',expectedRevision:2,toHolder:'owner',toRegion:'cafe-front'}],stages:[],check:null,routine:null,completionMinutes:15});
 try{
  s.choose(input=>input.self.id==='cass'?(++cassStep===1?{...tea,target:'shared-cup',content:'以現有杯子完成這杯茶',purpose:'完成茶飲'}:rest):(++ownerStep===1?{...rest,durationMinutes:90}:ownerStep===2?{...tea,target:'shared-cup',content:'拿起共用杯子',purpose:'攜帶杯子'}:{...rest,type:'move',target:'kris-home',durationMinutes:15,timeIntent:{kind:'completion',maxMinutes:null}}));
  assert.equal((await s.post({operation:'advance',minutes:15})).status,200);assert.equal((await s.read()).objects[0].state.contents,'water');await s.post({operation:'intervene',target:'owner',text:'請把共用杯子帶離這裡。'});assert.equal((await s.post({operation:'advance',minutes:15})).status,200);assert.equal((await s.read()).objects[0].holder,'owner');assert.equal((await s.post({operation:'advance',minutes:15})).status,200);
  for(let i=45;i<90;i+=15)assert.equal((await s.post({operation:'advance',minutes:15})).status,200);let w=await s.read();const cup=w.objects[0];assert.equal(cup.region,'kris-home-main');assert.equal(cup.state.contents,'water');assert.equal(cup.holder,'owner');assert.equal(w.characters.find(c=>c.id==='cass').plan,undefined);assert.equal(w.objects.length,1);
  assert.equal((await s.post({operation:'advance',minutes:15})).status,200);const input=s.inputs.filter(x=>x.self.id==='cass').at(-1);assert.deepEqual(input.objects,[]);assert.doesNotMatch(input.self.activity,/kris-home|owner|店主|Kris/);assert.equal(s.counts().judgments,2);
 }finally{s.restore();}
});

test('failed interruption save retains earlier water and original sixty-minute plan while replay adds no paid call',async()=>{
 const s=await scenario(60);try{
  await s.post({operation:'advance',minutes:15});await s.post({operation:'intervene',target:'owner',text:'請先停下來。'});const before=await s.read();s.choose(rest);store.conflictOnNextSave();const body={operation:'advance',minutes:15,operationId:opid()};assert.equal((await s.post(body)).status,502);let w=await s.read();assert.deepEqual(w.characters[0].plan,before.characters[0].plan);assert.deepEqual(w.objects,before.objects);assert.deepEqual(w.supplies,before.supplies);await s.post(body);assert.deepEqual(s.counts(),{npc:2,judgments:1});
  s.choose({...rest,type:'continue'});assert.equal((await s.post({operation:'advance',minutes:15})).status,200);w=await s.read();assert.equal(w.characters[0].plan.startedAt,before.characters[0].plan.startedAt);assert.equal(w.characters[0].plan.until,before.characters[0].plan.until);await s.post({operation:'advance',minutes:15});await s.post({operation:'advance',minutes:15});w=await s.read();assert.equal(w.objects.filter(x=>x.state.beverage==='tea').length,1);assert.equal(w.characters[0].plan,undefined);assert.deepEqual(s.counts(),{npc:3,judgments:1});assert.equal(w.aiUsage.totalCalls,4);
 }finally{s.restore();}
});
test('control transitions cancel the unexecuted serving while keeping actual intermediate water and unknown tea stays unsupported',async()=>{
 for(const operation of ['takeover','return-control']){
  const s=await scenario(90);try{
   if(operation==='return-control'){await s.post({operation:'advance',minutes:15});await s.post({operation:'advance',minutes:15});await s.post({operation:'advance',minutes:15});await s.post({operation:'advance',minutes:15});await s.post({operation:'advance',minutes:15});await s.post({operation:'advance',minutes:15});await s.post({operation:'takeover'});assert.equal((await s.post({operation:'direct',action:{type:'work',target:'tea'}})).status,200);await s.post({operation:'advance',minutes:15});}
   else await s.post({operation:'advance',minutes:15});
   const before=await s.read();assert.equal(before.supplies.filter(x=>x.pending).length,1);assert.equal((await s.post({operation})).status,200);const w=await s.read();assert.equal(w.characters[0].plan,undefined);assert.equal(w.supplies.filter(x=>x.pending).length,0);assert.deepEqual(w.objects,before.objects);assert.deepEqual(s.counts(),{npc:1,judgments:1});
  }finally{s.restore();}
 }
 const s=await scenario();try{const response=await s.post({operation:'direct',action:{type:'work',target:'tea'}});assert.equal(response.status,400);assert.match((await response.json()).error,/已確認|規則/);assert.deepEqual(s.counts(),{npc:0,judgments:0});assert.equal((await s.read()).objects,undefined);}finally{s.restore();}
});
test('direct deterministic work finishes in its program-confirmed unit and controlled open-ended rest expires at its chosen period',async()=>{
 const s=await scenario();try{
  await s.post({operation:'takeover'});assert.equal((await s.post({operation:'direct',action:{type:'work',target:'tidy'}})).status,200);await s.post({operation:'advance',minutes:15});let w=await s.read();assert.match(w.characters[0].activity,/收拾桌面/);assert.equal(w.characters[0].plan,undefined);assert.equal(w.characters[0].control.active,undefined);
  await s.post({operation:'direct',action:{type:'rest'}});await s.post({operation:'advance',minutes:15});w=await s.read();assert.equal(w.characters[0].plan.timeIntent.kind,'open-ended');assert.equal(w.characters[0].plan.until-w.characters[0].plan.startedAt,60);for(let i=0;i<3;i++)await s.post({operation:'advance',minutes:15});w=await s.read();assert.equal(w.characters[0].plan,undefined);assert.match(w.characters[0].activity,/時段.*到期/);assert.equal(w.characters[0].control.mode,'taken-over');assert.deepEqual(s.counts(),{npc:0,judgments:0});
 }finally{s.restore();}
});
