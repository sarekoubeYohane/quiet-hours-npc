/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
const {GET,POST}=load('route'),store=load('store'),{seedWorld}=load('world');
const opid=()=>Date.now()+':'+crypto.randomUUID();
async function scenario(prepare=()=>{}) {
 const w=seedWorld();w.contextId='life-needs';w.adjudication={provider:'openai',model:'fixture-judge'};w.characters=w.characters.filter(c=>c.id==='owner');prepare(w);store.install(w);
 const post=body=>POST(new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationId:opid(),worldContext:w.contextId,mode:'openai',model:'gpt-6-luna',...body})}));
 await post({operation:'set-model-key',key:'fixture-key'});let npc=0,inputs=[];const old=global.fetch;
 global.fetch=async(_url,init)=>{npc++;inputs.push(JSON.parse(JSON.parse(init.body).messages[1].content));return Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify({type:npc===1?'reflect':'continue',target:'',content:'先留在這裡',mood:'平靜',durationMinutes:90,intents:[],timeIntent:{kind:'open-ended',maxMinutes:null}})}}]});};
 return {post,read:async()=>(await(await GET()).json()).world,inputs,calls:()=>npc,restore:()=>{global.fetch=old;}};
}
test('four needs start at an explicit mutation boundary, advance separately and survive SQLite read/replay',async()=>{
 const s=await scenario();try{
  const before=await s.read();assert.equal(before.characters[0].needs,undefined);
  const body={operation:'advance',minutes:15,operationId:opid()};const response=await s.post(body);assert.equal(response.status,200,await response.clone().text());let w=await s.read();
  assert.deepEqual(w.characters[0].needs.values,{hunger:20.75,thirst:21.5,fatigue:15.25,sleep:21});assert.equal(w.characters[0].needs.activatedAt,before.minute);assert.equal(w.characters[0].needs.updatedAt,w.minute);
  const current=structuredClone(w.characters[0].needs);await s.read();assert.deepEqual((await s.read()).characters[0].needs,current);await s.post(body);assert.deepEqual((await s.read()).characters[0].needs,current);assert.equal(s.calls(),1);
  const input=JSON.stringify(s.inputs[0]);assert.match(input,/bodyFeelings/);assert.doesNotMatch(input,/activatedAt|updatedAt|assessed|20\.75|21\.5/);
 }finally{s.restore();}
});

test('a new feeling stage prompts once, continuing is voluntary and same stage does not reprompt after reload',async()=>{
 const s=await scenario(w=>{w.characters[0].needs={version:1,activatedAt:w.minute,updatedAt:w.minute,values:{hunger:39,thirst:39,fatigue:39,sleep:39},assessed:{hunger:0,thirst:0,fatigue:0,sleep:0},history:[],dropped:0};});try{
  await s.post({operation:'advance',minutes:15});assert.equal(s.calls(),1);const first=(await s.read()).characters[0].plan;
  await s.post({operation:'advance',minutes:15});const w=await s.read();assert.equal(s.calls(),2);assert.equal(w.characters[0].plan.startedAt,first.startedAt);assert.equal(w.characters[0].plan.until,first.until);
  await s.post({operation:'advance',minutes:15});assert.equal(s.calls(),2);assert.equal((await s.read()).characters[0].needs.assessed.hunger,1);assert.equal((await s.read()).characters[0].intents.length,0);
 }finally{s.restore();}
});

test('later model failure and save conflict roll back needs and assessed stages while operation replay does not dispatch',async()=>{
 const s=await scenario();try{
  await s.post({operation:'advance',minutes:15});await s.post({operation:'intervene',target:'owner',text:'你好'});const before=await s.read();store.conflictOnNextSave();const body={operation:'advance',minutes:15,operationId:opid()};assert.equal((await s.post(body)).status,502);assert.deepEqual((await s.read()).characters[0].needs,before.characters[0].needs);const calls=s.calls();await s.post(body);assert.equal(s.calls(),calls);
 }finally{s.restore();}
});

test('actual ingestion consumes one concrete serving, relieves only confirmed needs and replay cannot double restore',async()=>{
 const s=await scenario(w=>{w.objects=[{id:'meal',source:'fixture',label:'一份餐點',region:'cafe-front',holder:'owner',owner:'owner',revision:1,state:{},lifecycle:'active',kind:'food',quantity:{amount:1,unit:'serving'},consumable:true,knownTo:['owner'],allowedTo:['owner']}];});try{
  global.fetch=async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);const value=input.contractVersion==='world-adjudication.v1'?{status:'accepted',effects:[{kind:'ingest',version:1,objectId:'meal',expectedRevision:1,hungerRelief:15,thirstRelief:0}],stages:[],check:null,routine:null,completionMinutes:15}:{type:'propose',target:'meal',content:'吃這份餐點',purpose:'進食',mood:'平靜',durationMinutes:15,intents:[],timeIntent:{kind:'completion',maxMinutes:null}};return Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(value)}}]});};
  const body={operation:'advance',minutes:15,operationId:opid()};const response=await s.post(body);assert.equal(response.status,200,await response.clone().text());const w=await s.read();assert.equal(w.objects[0].lifecycle,'consumed');assert.equal(w.objects[0].quantity.amount,0);assert.equal(w.characters[0].needs.values.hunger,5.75);assert.equal(w.characters[0].needs.values.thirst,21.5);await s.post(body);assert.deepEqual((await s.read()).characters[0].needs,w.characters[0].needs);
 }finally{s.restore();}
});

test('new rest recovers only actual minutes and an interruption does not prepay future rest',async()=>{
 const s=await scenario(w=>{w.characters[0].needs={version:1,activatedAt:w.minute,updatedAt:w.minute,values:{hunger:20,thirst:20,fatigue:60,sleep:20},assessed:{hunger:0,thirst:0,fatigue:1,sleep:0},history:[],dropped:0};});try{
  let decision={type:'rest',target:'',content:'休息一段時間',mood:'平靜',durationMinutes:90,intents:[],timeIntent:{kind:'open-ended',maxMinutes:null}};
  global.fetch=async()=>Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(decision)}}]});
  await s.post({operation:'advance',minutes:15});let w=await s.read();assert.equal(w.characters[0].needs.values.fatigue,58);assert.equal(w.characters[0].needs.values.sleep,21);
  await s.post({operation:'advance',minutes:15});w=await s.read();assert.equal(w.characters[0].needs.values.fatigue,56);
  await s.post({operation:'intervene',target:'owner',text:'先說句話吧'});decision={...decision,type:'say',target:'observer',content:'我先休息了一會',durationMinutes:15,timeIntent:{kind:'completion',maxMinutes:null}};
  await s.post({operation:'advance',minutes:15});w=await s.read();assert.equal(w.characters[0].needs.values.fatigue,54);assert.equal(w.characters[0].plan,undefined);
  await s.post({operation:'advance',minutes:15});w=await s.read();assert.equal(w.characters[0].needs.values.fatigue,54.25);assert.equal(w.characters[0].needs.values.sleep,24);
 }finally{s.restore();}
});

test('a denied ingestion and stale serving cannot restore hunger or consume a different identity',async()=>{
 for(const candidate of [{status:'denied',effects:[],stages:[],check:null,routine:null,completionMinutes:null},{status:'accepted',effects:[{kind:'ingest',version:1,objectId:'missing',expectedRevision:1,hungerRelief:30,thirstRelief:30}],stages:[],check:null,routine:null,completionMinutes:15}]){
  const s=await scenario();try{
   global.fetch=async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);return Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(input.contractVersion==='world-adjudication.v1'?candidate:{type:'propose',target:'cafe',content:'吃點東西',purpose:'進食',mood:'平靜',durationMinutes:15,intents:[],timeIntent:{kind:'completion',maxMinutes:null}})}}]});};
   const response=await s.post({operation:'advance',minutes:15});const w=await s.read();if(candidate.status==='denied'){assert.equal(response.status,200);assert.equal(w.characters[0].needs.values.hunger,20.75);}else{assert.equal(response.status,502);assert.equal(w.characters[0].needs,undefined);}assert.equal(w.objects,undefined);
  }finally{s.restore();}
 }
});

test('confirmed ingestion routine rebinds a second serving without another adjudication',async()=>{
 const s=await scenario(w=>{w.objects=['meal-a','meal-b'].map(id=>({id,source:'fixture',label:'餐點',region:'cafe-front',holder:'owner',owner:'owner',revision:1,state:{},lifecycle:'active',kind:'food',consumable:true,quantity:{amount:1,unit:'half-serving'},knownTo:['owner'],allowedTo:['owner']}));});try{
  let npc=0,judgments=0;
  global.fetch=async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);let value;if(input.contractVersion==='world-adjudication.v1'){judgments++;value={status:'accepted',completionMinutes:null,effects:[],stages:[],branches:null,check:null,routine:{family:'cafe-service',version:3,operation:'eat-serving',subject:'餐點',timings:[{operation:'eat-serving',minutes:15}],programs:[{operation:'eat-serving',methods:[{content:'吃掉這半份餐點',purpose:'進食'}],bindings:[{role:'meal',type:'object',select:'target',kind:'food',label:null,state:[],access:'authorized',link:null,background:null,quantity:{amount:1,unit:'half-serving'},sourceRole:null,sourceSubject:null}],effects:[],check:null,branches:null,stages:[{afterMinutes:15,preconditions:[],effects:[{kind:'ingest',version:1,objectId:'$meal',expectedRevision:0,hungerRelief:8,thirstRelief:0}]}]}]}};}else{npc++;value={type:'propose',target:npc===1?'meal-a':'meal-b',content:'吃掉這半份餐點',purpose:'進食',mood:'平靜',durationMinutes:15,intents:[],timeIntent:{kind:'completion',maxMinutes:null}};}return Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(value)}}]});};
  for(let i=0;i<2;i++){const response=await s.post({operation:'advance',minutes:15});assert.equal(response.status,200,await response.clone().text());}
  const w=await s.read();assert.equal(w.characters[0].needs.values.hunger,5.5);assert.ok(w.objects.every(o=>o.lifecycle==='consumed'&&o.quantity.amount===0));assert.equal(npc,2);assert.equal(judgments,1);assert.equal(w.routineRules[0].version,3);
 }finally{s.restore();}
});

test('drinking consumes the linked serving, empties its original cup and thirst later increases again',async()=>{
 const s=await scenario(w=>{w.objects=[{id:'cup',source:'fixture',label:'原杯子',region:'cafe-front',holder:'owner',owner:'owner',revision:1,state:{contents:'tea'},stateTransitions:{contents:['empty']},lifecycle:'active',kind:'utensil',consumable:false,knownTo:['owner'],allowedTo:['owner']},{id:'tea',source:'fixture',label:'杯中茶',region:'cafe-front',holder:'owner',owner:'owner',revision:1,state:{vessel:'cup',beverage:'tea'},lifecycle:'active',kind:'drink',consumable:true,quantity:{amount:100,unit:'ml'},knownTo:['owner'],allowedTo:['owner']}];});try{
  let npc=0;
  global.fetch=async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);let value;if(input.contractVersion==='world-adjudication.v1')value={status:'accepted',effects:[{kind:'ingest',version:1,objectId:'tea',expectedRevision:1,hungerRelief:0,thirstRelief:15},{kind:'state',objectId:'cup',expectedRevision:1,key:'contents',value:'empty'}],stages:[],check:null,routine:null,completionMinutes:15};else{npc++;value=npc===1?{type:'propose',target:'tea',content:'喝這杯茶',purpose:'飲用',mood:'平靜',durationMinutes:15,intents:[],timeIntent:{kind:'completion',maxMinutes:null}}:{type:'reflect',target:'',content:'先留在這裡',mood:'平靜',durationMinutes:90,intents:[],timeIntent:{kind:'open-ended',maxMinutes:null}};}return Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(value)}}]});};
  assert.equal((await s.post({operation:'advance',minutes:15})).status,200);let w=await s.read();assert.equal(w.characters[0].needs.values.thirst,6.5);assert.equal(w.objects.find(o=>o.id==='tea').lifecycle,'consumed');assert.equal(w.objects.find(o=>o.id==='cup').state.contents,'empty');assert.equal(w.objects.length,2);
  await s.post({operation:'advance',minutes:15});w=await s.read();assert.equal(w.characters[0].needs.values.thirst,8);assert.equal(w.objects.find(o=>o.id==='tea').quantity.amount,0);
 }finally{s.restore();}
});

test('later actor failure rolls back actual ingestion and need changes together, keeping only paid usage',async()=>{
 const s=await scenario(w=>{const cass=seedWorld().characters.find(c=>c.id==='cass');w.characters.push(cass);w.objects=[{id:'meal',source:'fixture',label:'餐點',region:'cafe-front',holder:'owner',owner:'owner',revision:1,state:{},lifecycle:'active',kind:'food',consumable:true,knownTo:['owner'],allowedTo:['owner']}];});try{
  global.fetch=async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);let value;if(input.contractVersion==='world-adjudication.v1')value={status:'accepted',effects:[{kind:'ingest',version:1,objectId:'meal',expectedRevision:1,hungerRelief:15,thirstRelief:0}],stages:[],check:null,routine:null,completionMinutes:15};else if(input.self.id==='owner')value={type:'propose',target:'meal',content:'吃餐點',purpose:'進食',mood:'平靜',durationMinutes:15,intents:[],timeIntent:{kind:'completion',maxMinutes:null}};else value={bad:'invalid final actor'};return Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(value)}}]});};
  const before=await s.read(),body={operation:'advance',minutes:15,operationId:opid()};assert.equal((await s.post(body)).status,502);const w=await s.read();assert.equal(w.minute,before.minute);assert.equal(w.objects[0].lifecycle,'active');assert.equal(w.characters[0].needs,undefined);assert.equal(w.characters[1].needs,undefined);assert.equal(w.aiUsage.totalCalls,3);
  await s.post(body);assert.equal((await s.read()).aiUsage.totalCalls,3);
 }finally{s.restore();}
});

test('first rest interval combines fatigue load and recovery before the upper clamp',async()=>{
 const s=await scenario(w=>{w.characters[0].needs={version:1,activatedAt:w.minute,updatedAt:w.minute,values:{hunger:20,thirst:20,fatigue:100,sleep:20},assessed:{hunger:0,thirst:0,fatigue:3,sleep:0},history:[],dropped:0};});try{
  global.fetch=async()=>Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify({type:'rest',target:'',content:'坐下休息',mood:'平靜',durationMinutes:90,intents:[],timeIntent:{kind:'open-ended',maxMinutes:null}})}}]});
  await s.post({operation:'advance',minutes:15});assert.equal((await s.read()).characters[0].needs.values.fatigue,98);await s.post({operation:'advance',minutes:15});assert.equal((await s.read()).characters[0].needs.values.fatigue,96);
 }finally{s.restore();}
});
