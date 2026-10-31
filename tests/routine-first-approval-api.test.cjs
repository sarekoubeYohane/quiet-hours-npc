/* eslint-disable @typescript-eslint/no-require-imports */
const {fixtureDecision}=require('./pursuit-fixture.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {nonPhoneObjects}=require('./fixtures/non-phone-objects.cjs');
const load=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
const {GET,POST}=load('route'),store=load('store'),{seedWorld}=load('world');
const ordinaryTimes=offer=>(offer?.operations||[]).map(operation=>({operation,minutes:['tea','coffee'].includes(operation)?30:15}));
const completion=(v,_fixtureInput)=>Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(fixtureDecision(_fixtureInput,v))}}]});

async function setup(modify=()=>{}){
 const world=seedWorld();world.contextId='first-approval';world.adjudication={provider:'openai',model:'gpt-6.1-sol'};
 world.characters.forEach(c=>{if(c.id!=='owner')c.control={mode:'taken-over'};});modify(world);store.install(world);
 const post=body=>POST(new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationId:Date.now()+':'+crypto.randomUUID(),worldContext:world.contextId,mode:'openai',model:'gpt-6-luna',...body})}));
 await post({operation:'set-model-key',key:'fixture-key'});
 return {post};
}

test('first natural-language cafe proposal reaches bounded background approval and completes before reuse',async()=>{
 const {post}=await setup();
 const previous=global.fetch;let npc=0,adjudications=0,offered;
 // Representative free wording, not a captured production transcript. Transport
 // substitutes model choice only; the world API, effects and SQLite are real.
 global.fetch=async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);
  if(input.contractVersion==='world-adjudication.v1'){
   adjudications++;offered=input.routineOffer;
   return completion(offered?{status:'accepted',effects:[],stages:[],check:null,routine:{family:'cafe-service',version:1,timings:ordinaryTimes(input.routineOffer),operation:'tea'}}:{status:'denied',effects:[],stages:[],check:null,routine:null},JSON.parse(JSON.parse(init.body).messages[1].content));
  }
  npc++;return completion(npc===1?{type:'propose',target:'cafe',content:'為自己沖泡一杯普通的茶',purpose:'給自己一點暖意',mood:'平靜',durationMinutes:30,intents:[]}:{type:'propose',target:'cafe',content:'準備一杯咖啡',purpose:'飲用',mood:'平靜',durationMinutes:30,intents:[]},JSON.parse(JSON.parse(init.body).messages[1].content));
 };
 try{
  let response=await post({operation:'advance',minutes:15});assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
  let saved=(await(await GET()).json()).world;
  assert.equal(saved.routineRules?.length,1,'ordinary background was never offered/approved; NPC can only wait for nonexistent supplies');
  assert.ok(offered);assert.equal(nonPhoneObjects(saved)[0].state.contents,'water');
  assert.equal(saved.objects.some(o=>o.kind==='food'),false,'approval must not complete the drink early');
  await post({operation:'advance',minutes:15});saved=(await(await GET()).json()).world;assert.ok(saved.objects.some(o=>o.state.beverage==='tea'));
  await post({operation:'advance',minutes:15});await post({operation:'advance',minutes:15});saved=(await(await GET()).json()).world;
  assert.ok(saved.objects.some(o=>o.state.beverage==='coffee'));assert.equal(adjudications,1);assert.equal(npc,2);assert.equal(saved.aiUsage.totalCalls,3);
 }finally{global.fetch=previous;}
});

async function firstApproval(modify=()=>{},operation='tea',decision={type:'propose',target:'cafe',content:'為自己沖泡一杯普通的茶',purpose:'給自己一點暖意',mood:'平靜',durationMinutes:30,intents:[]},subject){
 const {post}=await setup(modify);
 const previous=global.fetch;let offer;
 global.fetch=async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);if(input.contractVersion==='world-adjudication.v1'){offer=input.routineOffer;return completion({status:'accepted',effects:[],stages:[],check:null,routine:{family:'cafe-service',version:1,timings:ordinaryTimes(input.routineOffer),operation,...(subject===undefined?{}:{subject})}},JSON.parse(JSON.parse(init.body).messages[1].content));}return completion(decision,JSON.parse(JSON.parse(init.body).messages[1].content));};
 try{const response=await post({operation:'advance',minutes:15});return {response,body:await response.json(),world:(await(await GET()).json()).world,offer};}finally{global.fetch=previous;}
}

test('interpretation cannot grant a nonoperator or an incapable operator background authority',async()=>{
 for(const modify of [w=>{w.routinePlaces[0].operators=[];},w=>{w.characters.find(c=>c.id==='owner').routineCapabilities=[];}]){
  const result=await firstApproval(modify);assert.equal(result.response.status,502);assert.equal(result.offer,null);assert.equal(result.world.turn,0);assert.equal(result.world.routineRules,undefined);assert.equal(result.world.objects,undefined);assert.equal(result.world.aiUsage.totalCalls,2);
 }
});

test('first interpreted approval respects exhausted materials and never replaces a fabricated target',async()=>{
 const exhausted=await firstApproval(w=>{w.supplies=[{id:'empty-tea',label:'最後的茶葉',region:'cafe-front',remaining:0,owner:'owner',knownTo:['owner'],allowedTo:['owner'],kind:'food',initialState:{}}];});
 assert.equal(exhausted.response.status,200);assert.equal(exhausted.world.supplies.length,1);assert.equal(exhausted.world.supplies[0].remaining,0);assert.deepEqual(nonPhoneObjects(exhausted.world),[]);assert.equal(exhausted.world.routineAudit[0].result,'approved');assert.match(exhausted.world.routineAudit[0].reason,/用完/);
 const target=await firstApproval(()=>{},'tea',{type:'propose',target:'invented-cup',content:'為自己沖泡一杯普通的茶',purpose:'給自己一點暖意',mood:'平靜',durationMinutes:30,intents:[]});
 assert.equal(target.response.status,200);assert.deepEqual(nonPhoneObjects(target.world),[]);assert.equal(target.world.supplies,undefined);
});

test('home interpretation confirms only one procedure and preserves the local resource boundary',async()=>{
 const result=await firstApproval(w=>{const c=w.characters.find(c=>c.id==='owner');c.location='vera-home';c.region='vera-home-main';w.routinePlaces.push({location:'vera-home',purpose:'home',operators:['owner']});},'tea',{type:'propose',target:'vera-home',content:'為自己沖泡一杯普通的茶',purpose:'給自己一點暖意',mood:'平靜',durationMinutes:30,intents:[]});
 assert.equal(result.response.status,200,JSON.stringify(result.body));assert.deepEqual(result.world.routineRules[0].operations,['tea']);assert.deepEqual(result.world.routinePlaces.find(p=>p.location==='vera-home').confirmedOperations,['tea']);assert.equal(nonPhoneObjects(result.world).length,1);assert.ok(nonPhoneObjects(result.world).every(o=>o.region==='vera-home-main'));assert.deepEqual(result.world.routinePlaces[0].confirmedOperations,undefined);
});

test('a natural food interpretation without a resolvable subject cannot persist a nameless serving',async()=>{
 const result=await firstApproval(()=>{},'food',{type:'propose',target:'cafe',content:'做一點吃的給自己',purpose:'填飽肚子',mood:'平靜',durationMinutes:15,intents:[]});
 assert.equal(result.response.status,502);assert.equal(result.world.routineRules,undefined);assert.equal(result.world.supplies,undefined);assert.equal(result.world.objects,undefined);
});

test('interpreted food has a bounded named result; cake cannot be invented or replaced by an ordinary meal',async()=>{
 const decision={type:'propose',target:'cafe',content:'做一點吃的給自己',purpose:'填飽肚子',mood:'平靜',durationMinutes:15,intents:[]};
 const meal=await firstApproval(()=>{},'food',decision,'簡餐');assert.equal(meal.response.status,200);assert.equal(nonPhoneObjects(meal.world)[0].label,'簡餐');assert.equal(meal.world.supplies[0].label,'簡餐');
 const cake=await firstApproval(()=>{},'food',{...decision,content:'拿點蛋糕來吃'},'蛋糕');assert.equal(cake.response.status,200);assert.deepEqual(nonPhoneObjects(cake.world),[]);assert.equal(cake.world.supplies,undefined);
 const substitute=await firstApproval(()=>{},'food',{...decision,content:'拿點蛋糕來吃'},'簡餐');assert.equal(substitute.response.status,502);assert.equal(substitute.world.objects,undefined);
 const unknown=await firstApproval(()=>{},'food',decision,'未核准的食物');assert.equal(unknown.response.status,502);assert.equal(unknown.world.supplies,undefined);
});

test('natural drinking interpretation preserves tea versus coffee rather than consuming any nearby serving',async()=>{
 for(const entry of [{subject:'茶',content:'先喝一點暖暖身子',status:200,lifecycle:'active',contents:'coffee'},{subject:'咖啡',content:'先喝一點暖暖身子',status:200,lifecycle:'consumed',contents:'dirty'},{subject:'咖啡',content:'喝茶',status:502,lifecycle:'active',contents:'coffee'},{subject:'飲品',content:'喝茶',status:200,lifecycle:'active',contents:'coffee'}]){
  const result=await firstApproval(w=>{w.objects=[{id:'coffee-cup',source:'fixture',label:'咖啡杯',region:'cafe-front',holder:'owner',owner:'owner',revision:1,state:{contents:'coffee'},lifecycle:'active',kind:'utensil',knownTo:['owner'],allowedTo:['owner'],stateTransitions:{contents:['coffee','dirty','empty']}},{id:'coffee-drink',source:'fixture',label:'咖啡',region:'cafe-front',holder:'owner',owner:'owner',revision:1,state:{vessel:'coffee-cup',beverage:'coffee'},lifecycle:'active',kind:'food',knownTo:['owner'],allowedTo:['owner']}];},'drink',{type:'propose',target:'coffee-cup',content:entry.content,purpose:'飲用',mood:'平靜',durationMinutes:15,intents:[]},entry.subject);
  assert.equal(result.response.status,entry.status,result.body.error);assert.equal(result.world.objects[1].lifecycle,entry.lifecycle);assert.equal(result.world.objects[0].state.contents,entry.contents);
 }
});

test('a known home tea procedure does not suppress the cafe operator offer for coffee',async()=>{
 const result=await firstApproval(w=>{w.routineRules=[{id:'home-tea',version:1,family:'cafe-service',operations:['tea'],origin:'vera-home',knownTo:['owner'],templates:[{operation:'tea',verbs:['泡'],subjects:['茶'],purposes:['泡茶'],result:{kind:'brew',contents:'tea',minutes:30}}]}];},'coffee',{type:'propose',target:'cafe',content:'替自己做一杯咖啡休息一下',purpose:'休息',mood:'平靜',durationMinutes:30,intents:[]});
 assert.equal(result.response.status,200,JSON.stringify(result.body));assert.ok(result.offer.operations.includes('coffee'));assert.equal(nonPhoneObjects(result.world)[0].state.contents,'water');assert.deepEqual(result.world.routineRules[0].operations,['tea']);assert.ok(result.world.routineRules[1].operations.includes('coffee'));
});

test('unknown operations and contradictory literal interpretations fail atomically',async()=>{
 const invalid=await firstApproval(()=>{},'magic');assert.equal(invalid.response.status,502);assert.equal(invalid.world.routineRules,undefined);assert.equal(invalid.world.objects,undefined);
 const mismatch=await firstApproval(()=>{},'coffee',{type:'propose',target:'cafe',content:'泡一杯茶',purpose:'泡茶',mood:'平靜',durationMinutes:30,intents:[]});
 assert.equal(mismatch.response.status,502);assert.equal(mismatch.world.routineRules,undefined);assert.equal(mismatch.world.objects,undefined);
});

test('an unrecognized free method still requires an adjudication after approval; denied exception does not fabricate results',async()=>{
 const {post}=await setup();
 const previous=global.fetch;let adjudications=0,npc=0;
 global.fetch=async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);if(input.contractVersion==='world-adjudication.v1'){adjudications++;return completion(adjudications===1?{status:'accepted',effects:[],stages:[],check:null,routine:{family:'cafe-service',version:1,timings:ordinaryTimes(input.routineOffer),operation:'tea'}}:{status:'unsupported',effects:[],stages:[],check:null,routine:null},JSON.parse(JSON.parse(init.body).messages[1].content));}npc++;return completion({type:'propose',target:'cafe',content:npc===1?'為自己沖泡一杯普通的茶':'用魔法製作一百杯茶',purpose:npc===1?'給自己一點暖意':'大型宴席',mood:'平靜',durationMinutes:30,intents:[]},JSON.parse(JSON.parse(init.body).messages[1].content));};
 try{await post({operation:'advance',minutes:15});await post({operation:'advance',minutes:15});const before=(await(await GET()).json()).world;assert.equal((await post({operation:'advance',minutes:15})).status,200);const saved=(await(await GET()).json()).world;assert.equal(adjudications,2);assert.deepEqual(saved.objects,before.objects);assert.equal(saved.routineRules.length,1);}finally{global.fetch=previous;}
});
