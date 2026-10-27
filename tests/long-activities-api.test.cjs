/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
const {GET,POST}=load('route'),store=load('store'),{seedWorld}=load('world');
const id=()=>Date.now()+':'+crypto.randomUUID();
const response=v=>Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(v)}}]});
const rest={type:'rest',target:'',content:'安靜讀書',mood:'平靜',durationMinutes:240,intents:[],timeIntent:{kind:'open-ended',maxMinutes:null}};
async function scenario({prepare=()=>{},adjudicate}={}){
 const w=seedWorld();w.contextId='long-activity';w.characters=w.characters.filter(c=>c.id==='owner');w.adjudication={provider:'openai',model:'gpt-6.1-sol'};prepare(w);store.install(w);
 const post=body=>POST(new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationId:id(),worldContext:w.contextId,mode:'openai',model:'gpt-6.1-sol',...body})}));await post({operation:'set-model-key',key:'fixture-key'});
 let decision=rest,pending=true,npc=0,judgments=0,resumable;const inputs=[]; const old=global.fetch;
 global.fetch=async(_url,init)=>{const req=JSON.parse(init.body),input=JSON.parse(req.messages[1].content);if(input.contractVersion==='world-adjudication.v1'){judgments++;if(adjudicate)return response(adjudicate(input));if(input.action?.content==='拿起工作容器')return response({status:'accepted',effects:[{kind:'transfer',objectId:'work',expectedRevision:2,toHolder:'owner',toRegion:'cafe-front'}],stages:[],check:null,routine:null,completionMinutes:15});return response({...(resumable===undefined?{}:{resumable}),status:'accepted',effects:[],stages:[{afterMinutes:15,preconditions:[],effects:[{kind:'state',objectId:'work',expectedRevision:1,key:'contents',value:'water'}]},{afterMinutes:240,preconditions:[{objectId:'work',revision:2,region:'cafe-front',holder:null,state:[{key:'contents',value:'water'}]}],effects:[{kind:'state',objectId:'work',expectedRevision:2,key:'contents',value:'tea'}]}],check:null,routine:null,completionMinutes:240});}npc++;inputs.push(input);if(input.self.id!=='owner')return response({...rest,durationMinutes:15});const chosen=!pending&&input.currentActivity?.canContinueExisting?{...rest,type:'continue',durationMinutes:15}:decision;pending=false;return response(chosen);};
 return {adjudicate:fn=>{adjudicate=fn;},post,read:async()=>(await(await GET()).json()).world,choose:d=>{decision=d;pending=true;},counts:()=>({npc,judgments}),inputs,restore:()=>{global.fetch=old;},install:world=>store.install(world),allowPause:()=>{resumable=true;}};
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

for(const mutation of ['position','hidden body revision','closed door'])test(`resume revalidates a phase-only body reference after ${mutation} changes and preserves the current activity`,async()=>{
 const displacement={kind:'displace-body',version:1,targetId:'vera',expectedRegion:'cafe-front',expectedRevision:0,toRegion:'cafe-storeroom',reason:'later external result'};
 const s=await scenario({prepare:w=>{w.playerBudget={calls:120,tokens:1000000};const vera=seedWorld().characters.find(c=>c.id==='vera');vera.location='cafe';vera.region='cafe-front';w.characters.push(vera);},adjudicate:input=>input.action.content==='長工作'?{status:'accepted',resumable:true,effects:[],stages:[{afterMinutes:240,preconditions:[],effects:[displacement]}],check:null,routine:null,completionMinutes:240}:{status:'accepted',effects:[mutation==='position'?displacement:{kind:'change-state',version:1,target:{type:'body',id:'vera'},access:'physical',exposure:'hidden',expectedRevision:0,changes:[{key:'手背',from:null,value:'PRIVATE_BODY_DETAIL'}],reason:'hidden external change'}],stages:[],check:null,routine:null,completionMinutes:15}});
 try{
  const advance=async()=>{const r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200,await r.clone().text());return s.read();};
  s.choose({...rest,type:'propose',target:'',content:'長工作',purpose:'整理場地',timeIntent:{kind:'completion',maxMinutes:null}});let w=await advance();assert.equal(w.characters[0].plan.resumable,true);assert.equal(w.characters[0].plan.action.target,'');
  await s.post({operation:'intervene',target:'owner',text:'先暫停。'});s.choose({...rest,type:'pause',durationMinutes:15,timeIntent:{kind:'completion',maxMinutes:null}});w=await advance();const paused=structuredClone(w.characters[0].pausedActivity);assert.ok(paused);
  s.choose(mutation==='closed door'?{...rest,type:'door',target:'cafe-door',content:'close',durationMinutes:15,timeIntent:{kind:'completion',maxMinutes:null}}:{...rest,type:'propose',target:'vera',content:'改變外在條件',purpose:'調整場地',durationMinutes:15,timeIntent:{kind:'completion',maxMinutes:null}});w=await advance();if(mutation==='closed door'){assert.equal(w.scene.doors['cafe-door'],'closed');assert.equal(w.characters.find(c=>c.id==='vera').physical,undefined);}assert.equal(w.characters.find(c=>c.id==='vera').region,mutation==='position'?'cafe-storeroom':'cafe-front');
  s.choose({...rest,durationMinutes:120});w=await advance();const current=structuredClone(w.characters[0].plan);assert.ok(current);
  await s.post({operation:'intervene',target:'owner',text:'考慮恢復原工作。'});s.choose({...rest,type:'resume',target:paused.id,durationMinutes:15,timeIntent:{kind:'completion',maxMinutes:null}});w=await advance();
  assert.deepEqual(w.characters[0].pausedActivity,paused);assert.deepEqual(w.characters[0].plan,current);assert.match(w.characters[0].activity,/必要條件已改變/);assert.doesNotMatch(w.characters[0].activity,/PRIVATE_BODY_DETAIL|cafe-storeroom/);assert.equal(s.counts().judgments,mutation==='closed door'?1:2);
  if(mutation==='closed door'){
   await s.post({operation:'intervene',target:'owner',text:'打開通路。'});s.choose({...rest,type:'door',target:'cafe-door',content:'open',durationMinutes:15,timeIntent:{kind:'completion',maxMinutes:null}});w=await advance();assert.equal(w.scene.doors['cafe-door'],'open');
   const random=Math.random;let dice=0;Math.random=()=>{dice++;return 0.5;};
   try{s.choose({...rest,type:'resume',target:paused.id,durationMinutes:15,timeIntent:{kind:'completion',maxMinutes:null}});w=await advance();assert.equal(w.characters[0].pausedActivity,undefined);assert.deepEqual(w.characters[0].plan.phases,paused.plan.phases);assert.equal(w.characters.find(c=>c.id==='vera').region,'cafe-front');assert.equal(w.characters.find(c=>c.id==='vera').physical,undefined);assert.equal(dice,0);assert.equal(s.counts().judgments,1);}finally{Math.random=random;}
  }
 }finally{s.restore();}
});

for(const metadata of ['requiredTools','routineBindings'])test(`persisted resumable plan revalidates ${metadata} before clearing its pause`,async()=>{
 const s=await scenario();try{
  await startLongWork(s);let w=await s.read();
  // Compatibility boundary: these trusted metadata fields are saved by older
  // routine binders, not accepted from a model's stage JSON. Keep the real API
  // start, then persist that legal plan representation through SQLite.
  w.objects.push({...w.objects[0],id:'tool',label:'工作工具',state:{},revision:1});
  const phase=w.characters[0].plan.phases.stages.at(-1);
  if(metadata==='requiredTools')phase.requiredTools=['tool'];
  else phase.routineBindings={objects:[{id:'tool',region:'cafe-front',holder:null,quantity:{amount:1,unit:'item'}}],bodies:[]};
  store.replaceCommittedWorld(w);
  await s.post({operation:'intervene',target:'owner',text:'先暫停。'});s.choose({...rest,type:'pause',durationMinutes:15,timeIntent:{kind:'completion',maxMinutes:null}});await s.post({operation:'advance',minutes:15});w=await s.read();const paused=structuredClone(w.characters[0].pausedActivity);assert.ok(paused);
  s.adjudicate(()=>({status:'accepted',effects:[{kind:'transfer',objectId:'tool',expectedRevision:1,toHolder:'owner',toRegion:'cafe-front'}],stages:[],check:null,routine:null,completionMinutes:15}));
  s.choose({...rest,type:'propose',target:'tool',content:'拿起工具',purpose:'攜帶工具',durationMinutes:15,timeIntent:{kind:'completion',maxMinutes:null}});assert.equal((await s.post({operation:'advance',minutes:15})).status,200);assert.equal((await s.read()).objects.find(o=>o.id==='tool').holder,'owner');
  s.choose({...rest,durationMinutes:120});await s.post({operation:'advance',minutes:15});w=await s.read();const current=structuredClone(w.characters[0].plan);
  await s.post({operation:'intervene',target:'owner',text:'考慮復工。'});s.choose({...rest,type:'resume',target:paused.id,durationMinutes:15,timeIntent:{kind:'completion',maxMinutes:null}});const op={operation:'advance',minutes:15,operationId:id()};assert.equal((await s.post(op)).status,200);w=await s.read();assert.deepEqual(w.characters[0].pausedActivity,paused);assert.deepEqual(w.characters[0].plan,current);assert.match(w.characters[0].activity,/必要條件已改變/);assert.doesNotMatch(w.characters[0].activity,/cafe-storeroom/);assert.equal(w.objects.find(o=>o.id==='work').revision,2);const counts=s.counts();await s.post(op);assert.deepEqual(s.counts(),counts);assert.deepEqual((await s.read()).characters[0].pausedActivity,paused);
 }finally{s.restore();}
});

test('confirmed material cooling continues while a real long activity is paused and stale resume preserves committed progress without revealing hidden nature',async()=>{
 const target={type:'object',id:'cooling-work'};
 const hot={kind:'state-condition',version:1,target,state:[{key:'temperature',value:'hot'}]};
 const s=await scenario({prepare:w=>{
  w.objects=[{id:'cooling-work',source:'fixture',label:'工作材料',region:'cafe-front',holder:null,owner:'owner',revision:1,state:{temperature:'warm',progress:'prepared'},stateTransitions:{temperature:['warm','hot','PRIVATE_COOLED_MATERIAL'],progress:['prepared','started','finished']},lifecycle:'active',kind:'utensil',knownTo:['owner'],allowedTo:['owner']}];
 },adjudicate:()=>({status:'accepted',resumable:true,effects:[],stages:[
  {afterMinutes:15,preconditions:[],effects:[{kind:'state',objectId:'cooling-work',expectedRevision:1,key:'temperature',value:'hot'},{kind:'state',objectId:'cooling-work',expectedRevision:2,key:'progress',value:'started'},{kind:'schedule-natural',version:1,delayMinutes:45,conditions:[hot],effects:[{target,exposure:'hidden',changes:[{key:'temperature',from:'hot',value:'PRIVATE_COOLED_MATERIAL'}]}],reason:'PRIVATE_COOLING_REASON'}]},
  {afterMinutes:240,preconditions:[hot],effects:[{kind:'state',objectId:'cooling-work',expectedRevision:3,key:'progress',value:'finished'}]}
 ],check:null,routine:null,completionMinutes:240})});
 const oldRandom=Math.random;let dice=0;Math.random=()=>{dice++;return 0.5;};
 try{
  const advance=async(extra={})=>{const r=await s.post({operation:'advance',minutes:15,...extra});assert.equal(r.status,200,await r.clone().text());return s.read();};
  s.choose({...rest,type:'propose',target:'cooling-work',content:'加熱材料後繼續長工作',purpose:'處理工作材料',timeIntent:{kind:'completion',maxMinutes:null}});
  let w=await advance();const committedAt=w.minute;assert.equal(w.objects[0].state.temperature,'hot');assert.equal(w.objects[0].revision,3);assert.equal(w.objects[0].state.progress,'started');assert.equal(w.characters[0].plan.phases.cursor,1);assert.equal(w.naturalChanges[0].status,'pending');assert.equal(w.naturalChanges[0].dueAt,committedAt+45);
  await s.post({operation:'intervene',target:'owner',text:'先暫停工作。'});s.choose({...rest,type:'pause',durationMinutes:15,timeIntent:{kind:'completion',maxMinutes:null}});w=await advance();const paused=structuredClone(w.characters[0].pausedActivity);assert.ok(paused);assert.equal(paused.plan.phases.cursor,1);assert.equal(paused.elapsedMinutes,30);assert.equal(w.objects[0].state.temperature,'hot');
  s.choose({...rest,durationMinutes:120});w=await advance();assert.equal(w.naturalChanges[0].status,'pending');assert.deepEqual(w.characters[0].pausedActivity,paused);
  w=await advance();assert.equal(w.minute,committedAt+45);assert.equal(w.naturalChanges[0].status,'executed');assert.equal(w.naturalChanges[0].settledAt,w.minute);assert.equal(w.objects[0].state.temperature,'PRIVATE_COOLED_MATERIAL');assert.equal(w.objects[0].revision,4);assert.equal(w.objects[0].state.progress,'started');assert.deepEqual(w.characters[0].pausedActivity,paused);const current=structuredClone(w.characters[0].plan);assert.ok(current);
  await s.post({operation:'intervene',target:'owner',text:'考慮恢復原工作。'});s.choose({...rest,type:'resume',target:paused.id,durationMinutes:15,timeIntent:{kind:'completion',maxMinutes:null}});const operationId=id();w=await advance({operationId});assert.deepEqual(w.characters[0].pausedActivity,paused);assert.deepEqual(w.characters[0].plan,current);assert.match(w.characters[0].activity,/必要條件已改變/);assert.equal(w.objects[0].state.progress,'started');assert.equal(w.objects[0].revision,4);assert.equal(s.counts().judgments,1);assert.equal(dice,0);
  const counts=s.counts();await advance({operationId});assert.deepEqual(s.counts(),counts);assert.deepEqual((await s.read()).naturalChanges,w.naturalChanges);assert.deepEqual((await s.read()).characters[0].pausedActivity,paused);
  await s.post({operation:'intervene',target:'owner',text:'自行選擇接下來的安排。'});s.choose({...rest,type:'reflect',durationMinutes:15});await advance();assert.match(JSON.stringify(s.inputs.at(-1)),/必要條件已改變/);for(const input of s.inputs)assert.doesNotMatch(JSON.stringify(input),/PRIVATE_COOLED_MATERIAL|PRIVATE_COOLING_REASON/);assert.equal(s.counts().judgments,1);assert.equal(dice,0);
 }finally{s.restore();Math.random=oldRandom;}
});

test('an invalid pause cannot defer an elapsed phase of a nonresumable activity',async()=>{
 const s=await scenario({prepare:w=>{w.objects=[{id:'work',source:'fixture',label:'工作容器',region:'cafe-front',holder:null,owner:'owner',revision:1,state:{contents:'empty'},lifecycle:'active',kind:'utensil',knownTo:['owner'],allowedTo:['owner'],stateTransitions:{contents:['empty','water','tea']}}];},adjudicate:()=>({status:'accepted',effects:[],stages:[
  {afterMinutes:15,preconditions:[],effects:[{kind:'state',objectId:'work',expectedRevision:1,key:'contents',value:'water'}]},
  {afterMinutes:30,preconditions:[],effects:[{kind:'state',objectId:'work',expectedRevision:2,key:'contents',value:'tea'}]},
  {afterMinutes:240,preconditions:[],effects:[{kind:'state',objectId:'work',expectedRevision:3,key:'contents',value:'empty'}]}
 ],check:null,routine:null,completionMinutes:240})});
 try{
  s.choose({...rest,type:'propose',target:'work',content:'不可暫停的長工作',purpose:'連續工作',timeIntent:{kind:'completion',maxMinutes:null}});assert.equal((await s.post({operation:'advance',minutes:15})).status,200);let w=await s.read();assert.equal(w.objects[0].state.contents,'water');const startedAt=w.characters[0].plan.startedAt;
  await s.post({operation:'intervene',target:'owner',text:'考慮暫停。'});s.choose({...rest,type:'pause',durationMinutes:15,timeIntent:{kind:'completion',maxMinutes:null}});const op={operation:'advance',minutes:15,operationId:id()};assert.equal((await s.post(op)).status,200);w=await s.read();assert.equal(w.objects[0].state.contents,'tea');assert.equal(w.objects[0].revision,3);assert.equal(w.characters[0].plan.phases.cursor,2);assert.equal(w.characters[0].plan.startedAt,startedAt);assert.equal(w.characters[0].pausedActivity,undefined);assert.match(w.characters[0].activity,/未確認可暫停/);assert.equal(s.counts().judgments,1);const counts=s.counts();await s.post(op);assert.deepEqual(s.counts(),counts);assert.equal((await s.read()).objects[0].revision,3);
 }finally{s.restore();}
});
