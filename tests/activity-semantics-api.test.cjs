/* eslint-disable @typescript-eslint/no-require-imports */
const {fixtureDecision}=require('./pursuit-fixture.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {nonPhoneObjects}=require('./fixtures/non-phone-objects.cjs');
const load=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
const {GET,POST}=load('route'),store=load('store'),{seedWorld}=load('world');
const completion=(v,_fixtureInput)=>Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(fixtureDecision(_fixtureInput,v))}}]});
const operationId=()=>Date.now()+':'+crypto.randomUUID();
async function setup(decide,adjudicate=()=>{throw Error('no adjudication expected');},prepare=()=>{}){
 const w=seedWorld();w.contextId='time-semantics';w.characters=w.characters.filter(c=>c.id==='owner');w.adjudication={provider:'openai',model:'fixture-world'};prepare(w);store.install(w);
 const post=body=>POST(new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationId:operationId(),worldContext:w.contextId,mode:'openai',model:'gpt-6-luna',...body})}));await post({operation:'set-model-key',key:'fixture-key'});
 const old=global.fetch;let npc=0,judgments=0;const inputs=[];
 global.fetch=async(_url,init)=>{const request=JSON.parse(init.body),input=JSON.parse(request.messages[1].content);if(input.contractVersion==='world-adjudication.v1'){judgments++;return completion(adjudicate(input,request),JSON.parse(JSON.parse(init.body).messages[1].content));}inputs.push(input);npc++;return completion(decide(input,npc,request),JSON.parse(JSON.parse(init.body).messages[1].content));};
 return {post,read:async()=>(await(await GET()).json()).world,restore:()=>{global.fetch=old;},counts:()=>({npc,judgments}),inputs};
}
const rest={type:'rest',target:'',content:'安靜休息半小時',mood:'平靜',durationMinutes:30,intents:[],timeIntent:{kind:'open-ended',maxMinutes:null}};
test('chosen open-ended period survives reload and expires without another decision or a fabricated external result',async()=>{
 const s=await setup(()=>rest);try{
 const first={operation:'advance',minutes:15,operationId:operationId()};const response=await s.post(first);assert.equal(response.status,200,await response.clone().text());let w=await s.read();const start=w.characters[0].plan.startedAt;assert.equal(w.characters[0].plan.until,start+30);assert.equal(w.characters[0].plan.timeIntent.kind,'open-ended');assert.deepEqual(s.counts(),{npc:1,judgments:0});
 await s.post(first);assert.deepEqual(s.counts(),{npc:1,judgments:0});
 assert.equal((await s.post({operation:'advance',minutes:15})).status,200);w=await s.read();assert.equal(w.characters[0].plan,undefined);assert.match(w.characters[0].activity,/時段.*到期/);assert.deepEqual(s.counts(),{npc:1,judgments:0});assert.deepEqual(nonPhoneObjects(w),[]);
 assert.equal((await s.post({operation:'advance',minutes:15})).status,200);assert.deepEqual(s.counts(),{npc:2,judgments:0});assert.equal(s.inputs[1].currentActivity,null);
 }finally{s.restore();}
});

const goal={type:'propose',target:'meal',content:'把這份準備中的餐點做好',purpose:'完成餐點',mood:'平靜',durationMinutes:15,intents:[],timeIntent:{kind:'completion',maxMinutes:null}};
const meal=w=>{w.supplies=[{id:'meal',label:'這份準備中的餐點',region:'cafe-front',remaining:1,owner:'owner',knownTo:['owner'],allowedTo:['owner'],kind:'food',initialState:{}}];};
test('explicit completion goal uses world time forty-five rather than estimated fifteen and saves its real result at completion',async()=>{
 const s=await setup(()=>goal,(input,request)=>{assert.equal(input.timeIntent.kind,'completion');assert.ok(request.response_format.json_schema.schema.required.includes('completionMinutes'));return {status:'accepted',effects:[{kind:'materialize',supplyId:'meal',expectedRemaining:1}],stages:[],check:null,routine:null,completionMinutes:45};},meal);try{
 const first={operation:'advance',minutes:15,operationId:operationId()};let response=await s.post(first);assert.equal(response.status,200,await response.clone().text());let w=await s.read();const plan=w.characters[0].plan;assert.equal(plan.until-plan.startedAt,45);assert.equal(plan.timeIntent.kind,'completion');assert.deepEqual(nonPhoneObjects(w),[]);assert.equal(w.supplies[0].remaining,1);
 await s.post(first);assert.deepEqual(s.counts(),{npc:1,judgments:1});await s.post({operation:'advance',minutes:15});w=await s.read();assert.deepEqual(nonPhoneObjects(w),[]);await s.post({operation:'advance',minutes:15});w=await s.read();assert.equal(w.characters[0].plan,undefined);assert.equal(nonPhoneObjects(w)[0].id,'meal:1');assert.equal(w.supplies[0].remaining,0);assert.deepEqual(s.counts(),{npc:1,judgments:1});assert.equal(w.aiUsage.totalCalls,2);
 }finally{s.restore();}
});
test('the same supported work action distinguishes an open-ended period from a program-confirmed completion',async()=>{
 const work={...rest,type:'work',target:'tidy',content:'整理眼前的桌面'};const s=await setup((_input,n)=>n===1?work:{...work,durationMinutes:60,timeIntent:{kind:'completion',maxMinutes:null}});try{
 assert.equal((await s.post({operation:'advance',minutes:15})).status,200);let w=await s.read();assert.equal(w.characters[0].plan.timeIntent.kind,'open-ended');await s.post({operation:'advance',minutes:15});assert.equal((await s.read()).characters[0].plan,undefined);assert.equal((await s.post({operation:'advance',minutes:15})).status,200);w=await s.read();assert.equal(w.characters[0].plan,undefined);assert.deepEqual(s.counts(),{npc:2,judgments:0});
 }finally{s.restore();}
});
test('unsupported open-ended world methods and unrepresented resting goals do not fabricate completed results or call an estimator',async()=>{
 for(const decision of [{...goal,timeIntent:{kind:'open-ended',maxMinutes:null},durationMinutes:30},{...rest,timeIntent:{kind:'completion',maxMinutes:null},content:'休息到完全康復'}]){
  const s=await setup(()=>decision,undefined,meal);try{const response=await s.post({operation:'advance',minutes:15});assert.equal(response.status,200,await response.clone().text());const w=await s.read();assert.deepEqual(nonPhoneObjects(w),[]);assert.equal(w.characters[0].plan,undefined);assert.match(w.characters[0].activity,/無法落實|不支援/);assert.deepEqual(s.counts(),{npc:1,judgments:0});}finally{s.restore();}
 }
});
test('generic completion cap compares aligned world time before execution and rejects invalid effects rather than hiding them',async()=>{
 let decision={...goal,timeIntent:{kind:'completion',maxMinutes:20}};
 const s=await setup(()=>decision,()=>({status:'accepted',effects:[{kind:'materialize',supplyId:'meal',expectedRemaining:1}],stages:[],check:null,routine:null,completionMinutes:20}),meal);try{
 const first={operation:'advance',minutes:15,operationId:operationId()};assert.equal((await s.post(first)).status,200);let w=await s.read();assert.equal(w.characters[0].plan,undefined);assert.deepEqual(nonPhoneObjects(w),[]);assert.equal(w.supplies[0].remaining,1);assert.match(w.characters[0].activity,/30.*20/);await s.post(first);assert.deepEqual(s.counts(),{npc:1,judgments:1});
 decision={...goal,timeIntent:{kind:'completion',maxMinutes:30}};await s.post({operation:'advance',minutes:15});w=await s.read();assert.equal(w.characters[0].plan.until-w.characters[0].plan.startedAt,30);assert.deepEqual(nonPhoneObjects(w),[]);await s.post({operation:'advance',minutes:15});assert.equal(nonPhoneObjects(await s.read())[0].id,'meal:1');assert.deepEqual(s.counts(),{npc:2,judgments:2});
 }finally{s.restore();}
 const invalid=await setup(()=>({...goal,timeIntent:{kind:'completion',maxMinutes:5}}),()=>({status:'accepted',effects:[{kind:'materialize',supplyId:'unknown',expectedRemaining:1}],stages:[],check:null,routine:null,completionMinutes:30}),meal);try{assert.equal((await invalid.post({operation:'advance',minutes:15})).status,502);const w=await invalid.read();assert.equal(w.turn,0);assert.equal(w.objects,undefined);assert.equal(w.aiUsage.totalCalls,2);}finally{invalid.restore();}
});
test('illegal generic completion times and mismatched final stage reject atomically and replay without another dispatch',async()=>{
 for(const completionMinutes of [0,-1,1441,1e300,null,'30']){
  const s=await setup(()=>goal,()=>({status:'accepted',effects:[{kind:'materialize',supplyId:'meal',expectedRemaining:1}],stages:[],check:null,routine:null,completionMinutes}),meal);try{const body={operation:'advance',minutes:15,operationId:operationId()};assert.equal((await s.post(body)).status,502);const w=await s.read();assert.equal(w.turn,0);assert.equal(w.objects,undefined);assert.equal(w.supplies[0].remaining,1);await s.post(body);assert.deepEqual(s.counts(),{npc:1,judgments:1});}finally{s.restore();}
 }
 const s=await setup(()=>goal,()=>({status:'accepted',effects:[],stages:[{afterMinutes:15,preconditions:[],effects:[{kind:'materialize',supplyId:'meal',expectedRemaining:1}]}],check:null,routine:null,completionMinutes:45}),meal);try{assert.equal((await s.post({operation:'advance',minutes:15})).status,502);assert.equal((await s.read()).objects,undefined);}finally{s.restore();}
});
test('a failed completion save preserves the original plan for a later retry without a second model dispatch',async()=>{
 const s=await setup(()=>goal,()=>({status:'accepted',effects:[{kind:'materialize',supplyId:'meal',expectedRemaining:1}],stages:[],check:null,routine:null,completionMinutes:30}),meal);try{
 await s.post({operation:'advance',minutes:15});const before=await s.read();store.conflictOnNextSave();const body={operation:'advance',minutes:15,operationId:operationId()};assert.equal((await s.post(body)).status,502);let w=await s.read();assert.deepEqual(w.characters[0].plan,before.characters[0].plan);assert.deepEqual(nonPhoneObjects(w),[]);await s.post(body);assert.deepEqual(s.counts(),{npc:1,judgments:1});await s.post({operation:'advance',minutes:15});w=await s.read();assert.equal(nonPhoneObjects(w)[0].id,'meal:1');assert.equal(w.characters[0].plan,undefined);assert.deepEqual(s.counts(),{npc:1,judgments:1});
 }finally{s.restore();}
});
test('program-confirmed operation cap blocks before its visible result and open-ended fifteen never loops inside a slot',async()=>{
 const s=await setup((_input,n)=>n===1?{...rest,type:'work',target:'tidy',timeIntent:{kind:'completion',maxMinutes:5}}:{...rest,durationMinutes:15});try{
 await s.post({operation:'advance',minutes:15});let w=await s.read();assert.equal(w.characters[0].plan,undefined);assert.match(w.characters[0].activity,/15.*5/);assert.equal(w.events.some(e=>e.actor==='owner'&&e.kind==='work'),false);await s.post({operation:'advance',minutes:15});w=await s.read();assert.match(w.characters[0].activity,/時段.*到期/);assert.equal(w.characters[0].plan,undefined);assert.deepEqual(s.counts(),{npc:2,judgments:0});
 }finally{s.restore();}
});
test('open-ended periods admit all fifteen-minute schedule units and reject non-granular values',async()=>{
 for(const durationMinutes of [45,75,105,1440]){
  const s=await setup(()=>({...rest,durationMinutes}));try{const response=await s.post({operation:'advance',minutes:15});assert.equal(response.status,200,await response.clone().text());const w=await s.read();assert.equal(w.characters[0].plan.until-w.characters[0].plan.startedAt,durationMinutes);assert.deepEqual(s.counts(),{npc:1,judgments:0});}finally{s.restore();}
 }
 for(const durationMinutes of [20,0,1441,1455]){
  const s=await setup(()=>({...rest,durationMinutes}));try{assert.equal((await s.post({operation:'advance',minutes:15})).status,502);assert.equal((await s.read()).turn,0);assert.deepEqual(s.counts(),{npc:1,judgments:0});}finally{s.restore();}
 }
});
test('strict routine output carries null generic time and the whole scope remains the only completion authority',async()=>{
 const s=await setup(()=>({...goal,target:'cafe',content:'沖泡一杯茶',purpose:'飲用'}),()=>({status:'accepted',effects:[],stages:[],check:null,completionMinutes:null,routine:{family:'cafe-service',version:1,operation:'tea',subject:'茶',timings:['tea','coffee','food','drink','wash','return'].map(operation=>({operation,minutes:operation==='tea'?45:15}))}}));try{
 const response=await s.post({operation:'advance',minutes:15});assert.equal(response.status,200,await response.clone().text());const w=await s.read();assert.equal(w.characters[0].plan.until-w.characters[0].plan.startedAt,45);assert.equal(w.routineRules[0].templates.length,6);assert.equal(w.objects.some(o=>o.state.beverage==='tea'),false);assert.deepEqual(s.counts(),{npc:1,judgments:1});
 }finally{s.restore();}
});
