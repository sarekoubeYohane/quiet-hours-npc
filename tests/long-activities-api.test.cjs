/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
const {GET,POST}=load('route'),store=load('store'),{seedWorld}=load('world');
const id=()=>Date.now()+':'+crypto.randomUUID();
const response=v=>Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(v)}}]});
const rest={type:'rest',target:'',content:'安靜讀書',mood:'平靜',durationMinutes:240,intents:[],timeIntent:{kind:'open-ended',maxMinutes:null}};
async function scenario(){
 const w=seedWorld();w.contextId='long-activity';w.characters=w.characters.filter(c=>c.id==='owner');w.adjudication={provider:'openai',model:'gpt-6.1-sol'};store.install(w);
 const post=body=>POST(new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationId:id(),worldContext:w.contextId,mode:'openai',model:'gpt-6.1-sol',...body})}));await post({operation:'set-model-key',key:'fixture-key'});
 let decision=rest,pending=true,npc=0,judgments=0,resumable;const inputs=[]; const old=global.fetch;
 global.fetch=async(_url,init)=>{const req=JSON.parse(init.body),input=JSON.parse(req.messages[1].content);if(input.contractVersion==='world-adjudication.v1'){judgments++;if(input.action?.content==='拿起工作容器')return response({status:'accepted',effects:[{kind:'transfer',objectId:'work',expectedRevision:2,toHolder:'owner',toRegion:'cafe-front'}],stages:[],check:null,routine:null,completionMinutes:15});return response({...(resumable===undefined?{}:{resumable}),status:'accepted',effects:[],stages:[{afterMinutes:15,preconditions:[],effects:[{kind:'state',objectId:'work',expectedRevision:1,key:'contents',value:'water'}]},{afterMinutes:240,preconditions:[{objectId:'work',revision:2,region:'cafe-front',holder:null,state:[{key:'contents',value:'water'}]}],effects:[{kind:'state',objectId:'work',expectedRevision:2,key:'contents',value:'tea'}]}],check:null,routine:null,completionMinutes:240});}npc++;inputs.push(input);const chosen=!pending&&input.currentActivity?.canContinueExisting?{...rest,type:'continue',durationMinutes:15}:decision;pending=false;return response(chosen);};
 return {post,read:async()=>(await(await GET()).json()).world,choose:d=>{decision=d;pending=true;},counts:()=>({npc,judgments}),inputs,restore:()=>{global.fetch=old;},install:world=>store.install(world),allowPause:()=>{resumable=true;}};
}
test('four-hour open period survives reload and replay with only one need escalation review and no invented completion',async()=>{
 const s=await scenario();try{
  const op={operation:'advance',minutes:15,operationId:id()};let r=await s.post(op);assert.equal(r.status,200,await r.clone().text());let w=await s.read();const start=w.characters[0].plan.startedAt;assert.equal(w.characters[0].plan.until-start,240);await s.post(op);
  for(let t=15;t<225;t+=15){r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200,await r.clone().text());w=await s.read();assert.equal(w.characters[0].plan.startedAt,start);if(t===90)assert.equal(s.counts().npc,1);}
  assert.equal(s.counts().npc,2);await s.post({operation:'advance',minutes:15});w=await s.read();assert.equal(w.characters[0].plan,undefined);assert.match(w.characters[0].activity,/時段.*到期/);assert.equal(s.counts().npc,2);assert.equal(s.inputs.filter(input=>input.currentActivity?.canContinueExisting).length,1);
 }finally{s.restore();}
});
test('four-hour world-confirmed work preserves intermediate progress and commits final effect once',async()=>{
 const s=await scenario();try{
  let w=await s.read();w.objects=[{id:'work',source:'fixture',label:'工作容器',region:'cafe-front',holder:null,owner:'owner',revision:1,state:{contents:'empty'},lifecycle:'active',kind:'utensil',knownTo:['owner'],allowedTo:['owner'],stateTransitions:{contents:['empty','water','tea']}}];s.install(w);await s.post({operation:'set-model-key',key:'fixture-key'});
  s.choose({...rest,type:'propose',target:'work',content:'完成這項長工作',purpose:'完成工作',durationMinutes:30,timeIntent:{kind:'completion',maxMinutes:240}});let r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200,await r.clone().text());w=await s.read();assert.equal(w.objects[0].state.contents,'water');assert.equal(w.characters[0].plan.until-w.characters[0].plan.startedAt,240);
  for(let t=15;t<225;t+=15)assert.equal((await s.post({operation:'advance',minutes:15})).status,200);assert.equal((await s.read()).objects[0].state.contents,'water');
  const op={operation:'advance',minutes:15,operationId:id()};await s.post(op);w=await s.read();assert.equal(w.objects[0].state.contents,'tea');assert.equal(w.objects[0].revision,3);assert.equal(w.characters[0].plan,undefined);await s.post(op);assert.equal((await s.read()).objects[0].revision,3);assert.deepEqual(s.counts(),{npc:2,judgments:1});
 }finally{s.restore();}
});

async function startLongWork(s){
 let w=await s.read();w.objects=[{id:'work',source:'fixture',label:'工作容器',region:'cafe-front',holder:null,owner:'owner',revision:1,state:{contents:'empty'},lifecycle:'active',kind:'utensil',knownTo:['owner'],allowedTo:['owner'],stateTransitions:{contents:['empty','water','tea']}}];s.install(w);await s.post({operation:'set-model-key',key:'fixture-key'});s.allowPause();
 s.choose({...rest,type:'propose',target:'work',content:'完成這項長工作',purpose:'完成工作',durationMinutes:30,timeIntent:{kind:'completion',maxMinutes:null}});
 const r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200,await r.clone().text());
}
test('autonomous pause preserves submitted progress while another activity runs; resume never repeats stages or dispatches adjudication',async()=>{
 const s=await scenario();try{
  await startLongWork(s);await s.post({operation:'intervene',target:'owner',text:'你可以先休息。'});
  s.choose({...rest,type:'pause',durationMinutes:15,timeIntent:{kind:'completion',maxMinutes:null}});let r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200,await r.clone().text());let w=await s.read();assert.equal(w.characters[0].plan,undefined);assert.equal(w.characters[0].pausedActivity.elapsedMinutes,30);assert.equal(w.objects[0].revision,2);
  s.choose({...rest,durationMinutes:30});await s.post({operation:'advance',minutes:15});await s.post({operation:'advance',minutes:15});w=await s.read();assert.equal(w.characters[0].pausedActivity.elapsedMinutes,30);assert.equal(w.objects[0].state.contents,'water');
  s.choose({...rest,type:'resume',target:w.characters[0].pausedActivity.id,durationMinutes:15,timeIntent:{kind:'completion',maxMinutes:null}});r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200,await r.clone().text());w=await s.read();assert.equal(w.characters[0].pausedActivity,undefined);assert.equal(w.characters[0].plan.phases.cursor,1);assert.equal(w.objects[0].revision,2);
  for(let i=0;i<14;i++)await s.post({operation:'advance',minutes:15});w=await s.read();assert.equal(w.objects[0].revision,3);assert.equal(w.objects[0].state.contents,'tea');assert.equal(w.characters[0].plan,undefined);assert.equal(s.counts().judgments,1);
 }finally{s.restore();}
});

test('paused work revalidates all saved object conditions, refuses stale resume, and explicit abandon preserves past results',async()=>{
 const s=await scenario();try{
  await startLongWork(s);await s.post({operation:'intervene',target:'owner',text:'先暫停。'});s.choose({...rest,type:'pause',durationMinutes:15,timeIntent:{kind:'completion',maxMinutes:null}});await s.post({operation:'advance',minutes:15});let w=await s.read(),paused=w.characters[0].pausedActivity;assert.ok(paused);
  s.choose({...rest,type:'propose',target:'work',content:'拿起工作容器',purpose:'攜帶容器',durationMinutes:15,timeIntent:{kind:'completion',maxMinutes:null}});const moved=await s.post({operation:'advance',minutes:15});assert.equal(moved.status,200,await moved.clone().text());assert.equal((await s.read()).objects[0].holder,'owner');
  s.choose({...rest,type:'resume',target:paused.id,durationMinutes:15,timeIntent:{kind:'completion',maxMinutes:null}});let r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200);w=await s.read();assert.equal(w.characters[0].plan,undefined);assert.ok(w.characters[0].pausedActivity);assert.match(w.characters[0].activity,/必要條件已改變/);assert.equal(w.objects[0].state.contents,'water');
  s.choose({...rest,type:'abandon',target:paused.id,durationMinutes:15,timeIntent:{kind:'completion',maxMinutes:null}});await s.post({operation:'advance',minutes:15});w=await s.read();assert.equal(w.characters[0].pausedActivity,undefined);assert.equal(w.objects[0].state.contents,'water');assert.equal(s.counts().judgments,2);
 }finally{s.restore();}
});
test('failed pause persistence preserves the original active plan and operation replay does not duplicate the choice',async()=>{
 const s=await scenario();try{
  await startLongWork(s);await s.post({operation:'intervene',target:'owner',text:'暫停一下。'});const before=await s.read();s.choose({...rest,type:'pause',durationMinutes:15,timeIntent:{kind:'completion',maxMinutes:null}});store.throwBeforeNextSave();const op={operation:'advance',minutes:15,operationId:id()};assert.equal((await s.post(op)).status,502);let w=await s.read();assert.deepEqual(w.characters[0].plan,before.characters[0].plan);assert.equal(w.characters[0].pausedActivity,undefined);assert.deepEqual(w.objects,before.objects);const calls=s.counts();await s.post(op);assert.deepEqual(s.counts(),calls);
 }finally{s.restore();}
});
