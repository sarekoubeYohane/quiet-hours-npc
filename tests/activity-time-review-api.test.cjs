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

test('review: generic full meal must not materialize before confirmed completion merely because a later stage exists',async()=>{
 const goal={type:'propose',target:'meal',content:'把這份準備中的餐點做好',purpose:'完成餐點',mood:'平靜',durationMinutes:15,intents:[],timeIntent:{kind:'completion',maxMinutes:null}};
 const s=await setup(()=>goal,()=>({status:'accepted',effects:[{kind:'materialize',supplyId:'meal',expectedRemaining:1}],stages:[{afterMinutes:45,preconditions:[],effects:[{kind:'state',objectId:'timer',expectedRevision:1,key:'condition',value:'done'}]}],check:null,routine:null,completionMinutes:45}),w=>{
 w.supplies=[{id:'meal',label:'完成的餐點',region:'cafe-front',remaining:1,owner:'owner',knownTo:['owner'],allowedTo:['owner'],kind:'food',initialState:{}}];
 w.objects=[{id:'timer',source:'fixture',label:'計時器',region:'cafe-front',holder:'owner',owner:'owner',revision:1,state:{condition:'waiting'},lifecycle:'active',kind:'utensil',knownTo:['owner'],allowedTo:['owner'],stateTransitions:{condition:['waiting','done']}}];
 });
 try {const r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,200,await r.clone().text());const w=await s.read();assert.equal(w.characters[0].plan.until-w.characters[0].plan.startedAt,45);assert.equal(w.objects.some(o=>o.id==='meal:1'),false,'complete active food exists at 15 while completion is 45');await s.post({operation:'advance',minutes:15});assert.equal((await s.read()).objects.some(o=>o.id==='meal:1'),false);await s.post({operation:'advance',minutes:15});const done=await s.read();assert.equal(done.objects.filter(o=>o.id==='meal:1').length,1);assert.equal(done.objects.find(o=>o.id==='timer').state.condition,'done');assert.equal(done.characters[0].plan,undefined);assert.deepEqual(s.counts(),{npc:1,judgments:1});}finally{s.restore();}
});

test('complete edible products cannot be hidden in an early phase before a later completion marker',async()=>{
 const goal={type:'propose',target:'meal',content:'完成餐點',purpose:'用餐',mood:'平靜',durationMinutes:15,intents:[],timeIntent:{kind:'completion',maxMinutes:null}};
 const s=await setup(()=>goal,()=>({status:'accepted',effects:[],stages:[{afterMinutes:15,preconditions:[],effects:[{kind:'materialize',supplyId:'meal',expectedRemaining:1}]},{afterMinutes:45,preconditions:[],effects:[{kind:'state',objectId:'timer',expectedRevision:1,key:'condition',value:'done'}]}],check:null,routine:null,completionMinutes:45}),w=>{
  w.supplies=[{id:'meal',label:'完整餐點',region:'cafe-front',remaining:1,owner:'owner',knownTo:['owner'],allowedTo:['owner'],kind:'food',initialState:{}}];
  w.objects=[{id:'timer',source:'fixture',label:'計時器',region:'cafe-front',holder:'owner',owner:'owner',revision:1,state:{condition:'waiting'},lifecycle:'active',kind:'utensil',knownTo:['owner'],allowedTo:['owner'],stateTransitions:{condition:['waiting','done']}}];
 });
 try{const op={operation:'advance',minutes:15,operationId:operationId()};assert.equal((await s.post(op)).status,502);let w=await s.read();assert.equal(w.turn,0);assert.equal(w.supplies[0].remaining,1);assert.equal(nonPhoneObjects(w).length,1);assert.equal(w.characters[0].plan,undefined);await s.post(op);assert.deepEqual(s.counts(),{npc:1,judgments:1});}finally{s.restore();}
});

test('cafe confirmation persists a full local scope without changing a known narrow home rule',async()=>{
 const tea={type:'propose',target:'cafe',content:'泡一杯茶',purpose:'飲用',mood:'平靜',durationMinutes:15,intents:[],timeIntent:{kind:'completion',maxMinutes:null}};
 const s=await setup((_input,n)=>n===2?{...tea,content:'準備一杯咖啡'}:tea,input=>({status:'accepted',effects:[],stages:[],check:null,routine:{family:'cafe-service',version:1,operation:'tea',subject:'茶',timings:input.routineOffer.operations.map(operation=>({operation,minutes:operation==='tea'?60:operation==='coffee'?45:15}))},completionMinutes:null}),w=>{
  w.routineRules=[{id:'home-rule',version:1,family:'cafe-service',operations:['tea'],origin:'vera-home',knownTo:['owner'],templates:[{operation:'tea',verbs:['泡'],subjects:['茶'],purposes:['飲用'],result:{kind:'brew',contents:'tea',minutes:30}}]}];
 });
 try{
  assert.equal((await s.post({operation:'advance',minutes:15})).status,200);let w=await s.read();const home=structuredClone(w.routineRules.find(rule=>rule.id==='home-rule'));assert.equal(w.characters[0].plan.until-w.characters[0].plan.startedAt,60);const cafe=w.routineRules.find(rule=>rule.origin==='cafe');assert.equal(cafe.operations.length,6);assert.equal(cafe.templates.find(t=>t.operation==='tea').result.minutes,60);assert.equal(w.routinePlaces.find(p=>p.location==='cafe').confirmedOperations.length,6);
  for(let i=0;i<3;i++)assert.equal((await s.post({operation:'advance',minutes:15})).status,200);
  assert.equal((await s.post({operation:'advance',minutes:15})).status,200);w=await s.read();assert.equal(w.characters[0].plan.until-w.characters[0].plan.startedAt,45);for(let i=0;i<2;i++)await s.post({operation:'advance',minutes:15});
  assert.equal((await s.post({operation:'advance',minutes:15})).status,200);w=await s.read();assert.equal(w.characters[0].plan.until-w.characters[0].plan.startedAt,60);assert.deepEqual(w.routineRules.find(rule=>rule.id==='home-rule'),home);assert.deepEqual(home.operations,['tea']);assert.equal(home.templates[0].result.minutes,30);assert.deepEqual(s.counts(),{npc:3,judgments:1});
 }finally{s.restore();}
});

test('explicit preparation stages keep partial water while the full drink waits for completion',async()=>{
 const goal={type:'propose',target:'cup',content:'準備這杯茶',purpose:'飲用',mood:'平靜',durationMinutes:15,intents:[],timeIntent:{kind:'completion',maxMinutes:null}};
 const s=await setup(()=>goal,()=>({status:'accepted',effects:[],stages:[{afterMinutes:15,preconditions:[],effects:[{kind:'state',objectId:'cup',expectedRevision:1,key:'contents',value:'water'}]},{afterMinutes:45,preconditions:[{objectId:'cup',revision:2,region:'cafe-front',holder:'owner',state:[{key:'contents',value:'water'}]}],effects:[{kind:'state',objectId:'cup',expectedRevision:2,key:'contents',value:'tea'},{kind:'materialize',supplyId:'drink',expectedRemaining:1}]}],check:null,routine:null,completionMinutes:45}),w=>{
  w.supplies=[{id:'drink',label:'完整的茶',region:'cafe-front',remaining:1,owner:'owner',knownTo:['owner'],allowedTo:['owner'],kind:'food',initialState:{vessel:'cup',beverage:'tea'}}];
  w.objects=[{id:'cup',source:'fixture',label:'杯子',region:'cafe-front',holder:'owner',owner:'owner',revision:1,state:{contents:'empty'},lifecycle:'active',kind:'utensil',knownTo:['owner'],allowedTo:['owner'],stateTransitions:{contents:['empty','water','tea']}}];
 });
 try{assert.equal((await s.post({operation:'advance',minutes:15})).status,200);let w=await s.read();assert.equal(nonPhoneObjects(w)[0].state.contents,'water');assert.equal(nonPhoneObjects(w).length,1);await s.post({operation:'advance',minutes:15});assert.equal(nonPhoneObjects(await s.read()).length,1);await s.post({operation:'advance',minutes:15});w=await s.read();assert.equal(w.objects.find(o=>o.id==='cup').state.contents,'tea');assert.equal(w.objects.filter(o=>o.kind==='food').length,1);assert.deepEqual(s.counts(),{npc:1,judgments:1});}finally{s.restore();}
});
test('normalizing final results cannot exceed the bounded number of effects in a stage',async()=>{
 const goal={type:'propose',target:'cafe',content:'完成這些器具的檢查',purpose:'檢查',mood:'平靜',durationMinutes:15,intents:[],timeIntent:{kind:'completion',maxMinutes:null}};
 const effect=i=>({kind:'state',objectId:'timer'+i,expectedRevision:1,key:'condition',value:'done'});
 const s=await setup(()=>goal,()=>({status:'accepted',effects:[0,1,2,3].map(effect),stages:[{afterMinutes:45,preconditions:[],effects:[4,5,6,7].map(effect)}],check:null,routine:null,completionMinutes:45}),w=>{w.objects=Array.from({length:8},(_,i)=>({id:'timer'+i,source:'fixture',label:'器具',region:'cafe-front',holder:'owner',owner:'owner',revision:1,state:{condition:'waiting'},lifecycle:'active',kind:'utensil',knownTo:['owner'],allowedTo:['owner'],stateTransitions:{condition:['waiting','done']}}));});
 try{const op={operation:'advance',minutes:15,operationId:operationId()};assert.equal((await s.post(op)).status,502);const w=await s.read();assert.equal(w.turn,0);assert.ok(w.objects.every(o=>o.state.condition==='waiting'));await s.post(op);assert.deepEqual(s.counts(),{npc:1,judgments:1});}finally{s.restore();}
});
test('consuming a completed meal in an early phase does not disguise its terminal result as preparation',async()=>{
 const goal={type:'propose',target:'meal',content:'完成餐點',purpose:'用餐',mood:'平靜',durationMinutes:15,intents:[],timeIntent:{kind:'completion',maxMinutes:null}};
 const s=await setup(()=>goal,()=>({status:'accepted',effects:[],stages:[{afterMinutes:15,preconditions:[],effects:[{kind:'materialize',supplyId:'meal',expectedRemaining:1},{kind:'consume',objectId:'meal:1',expectedRevision:1}]},{afterMinutes:45,preconditions:[],effects:[{kind:'state',objectId:'timer',expectedRevision:1,key:'condition',value:'done'}]}],check:null,routine:null,completionMinutes:45}),w=>{
  w.supplies=[{id:'meal',label:'完整餐點',region:'cafe-front',remaining:1,owner:'owner',knownTo:['owner'],allowedTo:['owner'],kind:'food',initialState:{}}];
  w.objects=[{id:'timer',source:'fixture',label:'計時器',region:'cafe-front',holder:'owner',owner:'owner',revision:1,state:{condition:'waiting'},lifecycle:'active',kind:'utensil',knownTo:['owner'],allowedTo:['owner'],stateTransitions:{condition:['waiting','done']}}];
 });
 try{const op={operation:'advance',minutes:15,operationId:operationId()};assert.equal((await s.post(op)).status,502);let w=await s.read();assert.equal(w.turn,0);assert.equal(w.supplies[0].remaining,1);assert.equal(nonPhoneObjects(w).length,1);assert.equal(w.characters[0].plan,undefined);await s.post(op);assert.deepEqual(s.counts(),{npc:1,judgments:1});}finally{s.restore();}
});


test('terminal changes of existing food cannot happen before confirmed completion',async()=>{
 for(const kind of ['consume','destroy']){
  const goal={type:'propose',target:'meal:1',content:'處理完這份餐點',purpose:'完成處理',mood:'平靜',durationMinutes:15,intents:[],timeIntent:{kind:'completion',maxMinutes:null}};
  const s=await setup(()=>goal,()=>({status:'accepted',effects:[],stages:[{afterMinutes:15,preconditions:[],effects:[{kind,objectId:'meal:1',expectedRevision:1}]},{afterMinutes:45,preconditions:[],effects:[{kind:'state',objectId:'timer',expectedRevision:1,key:'condition',value:'done'}]}],check:null,routine:null,completionMinutes:45}),w=>{
   w.objects=[{id:'meal:1',source:'meal',label:'完整餐點',region:'cafe-front',holder:'owner',owner:'owner',revision:1,state:{},lifecycle:'active',kind:'food',knownTo:['owner'],allowedTo:['owner']},{id:'timer',source:'fixture',label:'計時器',region:'cafe-front',holder:'owner',owner:'owner',revision:1,state:{condition:'waiting'},lifecycle:'active',kind:'utensil',knownTo:['owner'],allowedTo:['owner'],stateTransitions:{condition:['waiting','done']}}];
  });
  try{const op={operation:'advance',minutes:15,operationId:operationId()};assert.equal((await s.post(op)).status,502);const w=await s.read();assert.equal(w.turn,0);assert.equal(nonPhoneObjects(w)[0].lifecycle,'active');assert.equal(nonPhoneObjects(w)[0].revision,1);assert.equal(w.objects[1].state.condition,'waiting');assert.equal(w.characters[0].plan,undefined);await s.post(op);assert.deepEqual(s.counts(),{npc:1,judgments:1});}finally{s.restore();}
 }
});
