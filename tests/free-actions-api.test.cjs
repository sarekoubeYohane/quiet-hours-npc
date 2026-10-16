/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
const {POST,GET}=load('route'),store=load('store'),{seedWorld}=load('world');
const req=b=>new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid'},body:JSON.stringify({operationId:Date.now()+':'+crypto.randomUUID(),mode:'demo',...b})});
const read=async()=> (await (await GET()).json()).world;
test('AI requires persisted adjudication configuration while old worlds and rules remain readable',async()=>{
 store.install(seedWorld());let dispatched=0;const old=global.fetch;global.fetch=async()=>{dispatched++;throw Error('must not dispatch');};
 try{
  await POST(req({operation:'set-model-key',mode:'openai',key:'fixture-key'}));
  assert.equal((await POST(req({operation:'advance',minutes:15,mode:'openai',model:'gpt-6-luna'}))).status,400);
  assert.equal(dispatched,0);assert.equal((await read()).turn,0);
  assert.equal((await POST(req({operation:'set-adjudication',adjudication:{provider:'openai',model:'gpt-6-luna'}}))).status,200);
  assert.deepEqual((await read()).adjudication,{provider:'openai',model:'gpt-6-luna'});
  assert.equal(dispatched,0);assert.equal((await POST(req({operation:'advance',minutes:15}))).status,200);
 }finally{global.fetch=old;}
});
const mealFixture=()=>{
 const w=seedWorld();w.characters=[w.characters[0],w.characters.find(c=>c.id==='owner')];w.characters[1].control={mode:'taken-over'};w.adjudication={provider:'openai',model:'gpt-6-luna'};
 w.supplies=[{id:'meal',label:'測試餐點',region:'kris-home-main',remaining:1,owner:'cass',knownTo:['cass'],allowedTo:['cass'],kind:'food',initialState:{}}];return w;
};
const completion=value=>Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(value)}}]});
const proposal=target=>({type:'propose',target,content:'用手拿起並享用這份餐點',purpose:'吃飯',mood:'平靜',durationMinutes:15,intents:[]});
const accepted=effects=>({status:'accepted',effects,check:null});
test('free meal proposals persist finite materialization and consumption without replacing the same meal',async()=>{
 const w=mealFixture();store.install(w);await POST(req({operation:'set-model-key',mode:'openai',key:'fixture-key'}));
 let chats=0,judgments=0;const original=global.fetch;
 global.fetch=async(_url,init)=>{const p=JSON.parse(init.body),input=JSON.parse(p.messages[1].content);
  if(input.contractVersion==='world-adjudication.v1'){judgments++;assert.equal(input.action.purpose,'吃飯');assert.equal(input.actor.personality,undefined);assert.equal(input.actor.memories,undefined);return completion(accepted(judgments===1?[{kind:'materialize',supplyId:'meal',expectedRemaining:1}]:[{kind:'consume',objectId:'meal:1',expectedRevision:1}]));}
  chats++;return completion(proposal(chats===1?'meal':'meal:1'));
 };
 try{
  const advance=()=>POST(req({operation:'advance',minutes:15,mode:'openai',model:'gpt-6-luna'}));
  const first=await advance();assert.equal(first.status,200,await first.clone().text());let saved=await read();assert.equal(saved.objects.length,1);assert.equal(saved.objects[0].id,'meal:1');assert.equal(saved.objects[0].holder,'cass');assert.equal(saved.supplies[0].remaining,0);
  assert.equal((await advance()).status,200);saved=await read();assert.equal(saved.objects[0].lifecycle,'consumed');assert.equal(saved.objects.length,1);
  assert.equal(chats,2);assert.equal(judgments,2);assert.equal(saved.aiUsage.totalCalls,4);
  const cohorts=Object.values(saved.aiUsage.costs.total);assert.equal(cohorts.filter(c=>c.task==='adjudication').reduce((n,c)=>n+c.calls,0),2);
 }finally{global.fetch=original;}
});
const configure=async world=>{store.install(world);await POST(req({operation:'set-model-key',mode:'openai',key:'fixture-key'}));};
const aiBody=()=>({operation:'advance',minutes:15,mode:'openai',model:'gpt-6-luna'});
const transport=judgment=>{let calls=0;return {get calls(){return calls;},fetch:async(_url,init)=>{calls++;const input=JSON.parse(JSON.parse(init.body).messages[1].content);return completion(input.contractVersion==='world-adjudication.v1'?judgment:proposal('meal'));}};};
test('ordinary denial and unsupported method commit feedback without fabricated supplies',async()=>{
 for(const status of ['denied','unsupported']){
  await configure(mealFixture());const t=transport({status,effects:[],check:null}),old=global.fetch;global.fetch=t.fetch;
  try{const r=await POST(req(aiBody()));assert.equal(r.status,200);const w=await read();assert.equal(w.supplies[0].remaining,1);assert.equal(w.objects,undefined);assert.equal(w.turn,1);assert.equal(t.calls,2);}finally{global.fetch=old;}
 }
});
test('invalid or mismatched adjudication is technical and retains known paid usage without partial state',async()=>{
 for(const invalid of [accepted([{kind:'materialize',supplyId:'meal',expectedRemaining:1},{kind:'consume',objectId:'missing',expectedRevision:1}]),{status:'accepted',effects:[],check:{difficulty:8,ability:'ordinary',roll:20}},'{invalid']){
  await configure(mealFixture());const old=global.fetch,t=transport(invalid);global.fetch=t.fetch;
  try{const r=await POST(req(aiBody()));assert.equal(r.status,502);const w=await read();assert.equal(w.turn,0);assert.equal(w.supplies[0].remaining,1);assert.equal(w.objects,undefined);assert.equal(w.aiUsage.totalCalls,2);assert.equal(w.aiUsage.totalInputTokens,60);}finally{global.fetch=old;}
 }
 await configure(mealFixture());const old=global.fetch,t=transport(accepted([]));global.fetch=async(...args)=>{const response=await t.fetch(...args);if(t.calls===2)response.headers.set('x-decision-request-id','wrong');return response;};
 try{assert.equal((await POST(req(aiBody()))).status,502);assert.equal((await read()).aiUsage.totalCalls,2);}finally{global.fetch=old;}
});
test('shared budget checks every dispatch and operation replay never charges or materializes twice',async()=>{
 await configure({...mealFixture(),playerBudget:{calls:1,tokens:500000}});let t=transport(accepted([{kind:'materialize',supplyId:'meal',expectedRemaining:1}])),old=global.fetch;global.fetch=t.fetch;
 try{assert.equal((await POST(req(aiBody()))).status,429);let w=await read();assert.equal(w.turn,0);assert.equal(w.supplies[0].remaining,1);assert.equal(t.calls,1);assert.equal(w.aiUsage.totalCalls,1);}finally{global.fetch=old;}
 await configure(mealFixture());t=transport(accepted([{kind:'materialize',supplyId:'meal',expectedRemaining:1}]));old=global.fetch;global.fetch=t.fetch;
 try{const body={...aiBody(),operationId:Date.now()+':'+crypto.randomUUID()};assert.equal((await POST(req(body))).status,200);assert.equal((await POST(req(body))).status,200);assert.equal(t.calls,2);const w=await read();assert.equal(w.objects.length,1);assert.equal(w.aiUsage.totalCalls,2);}finally{global.fetch=old;}
});
test('failed save retains known usage without leaking materialization and stale delayed replies cannot commit',async()=>{
 await configure(mealFixture());const original=global.fetch;let t=transport(accepted([{kind:'materialize',supplyId:'meal',expectedRemaining:1}]));global.fetch=t.fetch;store.conflictOnNextSave();
 try{assert.equal((await POST(req(aiBody()))).status,502);const w=await read();assert.equal(w.objects,undefined);assert.equal(w.supplies[0].remaining,1);assert.equal(w.aiUsage.totalCalls,2);assert.equal(w.aiUsage.totalInputTokens,60);}finally{global.fetch=original;}
 await configure(mealFixture());t=transport(accepted([{kind:'materialize',supplyId:'meal',expectedRemaining:1}]));global.fetch=async(...args)=>{const r=await t.fetch(...args);if(t.calls===2)store.replaceCommittedWorld(mealFixture());return r;};
 try{assert.equal((await POST(req(aiBody()))).status,502);const w=await read();assert.equal(w.objects,undefined);assert.equal(w.supplies[0].remaining,1);assert.equal(t.calls,2);}finally{global.fetch=original;}
});
test('uncertain proposals use the existing controlled D20 and identical failed attempts do not reroll',async()=>{
 await configure(mealFixture());const old=global.fetch,random=Math.random;let rolls=0;Math.random=()=>{rolls++;return 0;};const t=transport({...accepted([{kind:'materialize',supplyId:'meal',expectedRemaining:1}]),check:{difficulty:12,ability:'拿取'}});global.fetch=t.fetch;
 try{assert.equal((await POST(req(aiBody()))).status,200);assert.equal((await POST(req(aiBody()))).status,200);const w=await read();assert.equal(w.supplies[0].remaining,1);assert.equal(w.objects,undefined);assert.equal(rolls,1);assert.equal(w.events.filter(e=>e.kind==='attempt').length,1);}finally{global.fetch=old;Math.random=random;}
});
test('D20 uses established relevant abilities and persisted attempts survive recent-event eviction',async()=>{
 const w=mealFixture();w.characters[0].abilityTags=['擅長拿取'];await configure(w);const old=global.fetch,random=Math.random;let rolls=0;Math.random=()=>{rolls++;return .5;};const t=transport({...accepted([{kind:'materialize',supplyId:'meal',expectedRemaining:1}]),check:{difficulty:16,ability:'拿取'}});global.fetch=t.fetch;
 try{
  assert.equal((await POST(req(aiBody()))).status,200);const saved=await read();assert.equal(Object.values(saved.freeTrials)[0].modifier,2);
  saved.events=[];store.replaceCommittedWorld(saved);assert.equal((await POST(req(aiBody()))).status,200);assert.equal(rolls,1);
 }finally{global.fetch=old;Math.random=random;}
});
const cupFixture=()=>{
 const w=mealFixture();w.supplies=[{...w.supplies[0],id:'cup',label:'測試杯子',knownTo:['cass','owner'],owner:'owner',kind:'utensil',remaining:1,initialState:{clean:'no'},stateTransitions:{clean:['no','yes'],contents:['empty','water','tea']}}];
 w.characters.find(c=>c.id==='owner').location='kris-home';w.characters.find(c=>c.id==='owner').region='kris-home-main';
 return w;
};
test('the same borrowed cup keeps identity and ownership through carrying washing and returning',async()=>{
 await configure(cupFixture());const old=global.fetch;let step=0;
 const effects=[[{kind:'materialize',supplyId:'cup',expectedRemaining:1}],null,[{kind:'state',objectId:'cup:1',expectedRevision:2,key:'clean',value:'yes'}],null,[{kind:'transfer',objectId:'cup:1',expectedRevision:4,toHolder:null,toRegion:'kris-home-main'}]];
 global.fetch=async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);if(input.contractVersion==='world-adjudication.v1')return completion(accepted(effects[step-1]));step++;return completion((step===2||step===4)?{type:'move',target:step===2?'cafe':'kris-home',content:'',mood:'',durationMinutes:15,intents:[]}:proposal(step===1?'cup':'cup:1'));};
 try{
  for(let n=0;n<5;n++){const r=await POST(req(aiBody()));assert.equal(r.status,200,await r.clone().text());const w=await read();assert.equal(w.objects.length,1);assert.equal(w.objects[0].id,'cup:1');assert.equal(w.objects[0].owner,'owner');}
  const w=await read();assert.equal(w.objects[0].region,'kris-home-main');assert.equal(w.objects[0].holder,null);assert.equal(w.objects[0].state.clean,'yes');assert.equal(w.aiUsage.totalCalls,8);
 }finally{global.fetch=old;}
});
test('ownership grant is an owner NPC choice and cannot be invented by borrower adjudication',async()=>{
 const w=cupFixture();w.supplies[0].allowedTo=[];w.characters[0].control={mode:'taken-over'};w.characters[1].control={mode:'autonomous'};await configure(w);
 const old=global.fetch;global.fetch=async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);return completion(input.contractVersion==='world-adjudication.v1'?accepted([{kind:'grant',targetId:'cup',recipient:'cass'}]):proposal('cup'));};
 try{
  assert.equal((await POST(req(aiBody()))).status,200);let saved=await read();assert.deepEqual(saved.supplies[0].allowedTo,['cass']);assert.equal(saved.objects,undefined);
  saved.characters[0].control={mode:'autonomous'};saved.characters[1].control={mode:'taken-over'};store.replaceCommittedWorld(saved);
  global.fetch=transport(accepted([{kind:'materialize',supplyId:'cup',expectedRemaining:1}])).fetch;
  assert.equal((await POST(req(aiBody()))).status,200);saved=await read();assert.equal(saved.objects[0].owner,'owner');assert.equal(saved.objects[0].holder,'cass');
 }finally{global.fetch=old;}
 await configure({...cupFixture(),supplies:[{...cupFixture().supplies[0],allowedTo:[]}]});const t=transport(accepted([{kind:'grant',targetId:'cup',recipient:'cass'},{kind:'materialize',supplyId:'cup',expectedRemaining:1}]));global.fetch=t.fetch;
 try{assert.equal((await POST(req(aiBody()))).status,502);assert.deepEqual((await read()).supplies[0].allowedTo,[]);}finally{global.fetch=old;}
});
test('object lifecycle and recipient autonomy reject consumption, destruction, remote transfer and forced receiving',async()=>{
 for(const effect of [{kind:'consume',objectId:'cup:1',expectedRevision:1},{kind:'destroy',objectId:'cup:1',expectedRevision:1},{kind:'transfer',objectId:'cup:1',expectedRevision:1,toHolder:'owner',toRegion:'kris-home-main'},{kind:'transfer',objectId:'cup:1',expectedRevision:1,toHolder:null,toRegion:'cafe-front'}]){
  const w=cupFixture();w.supplies[0].remaining=0;w.objects=[{id:'cup:1',source:'cup',label:'測試杯子',region:'kris-home-main',holder:'cass',owner:'owner',revision:1,state:{clean:'no'},lifecycle:'active',kind:'utensil',knownTo:['cass','owner'],allowedTo:['cass','owner'],stateTransitions:{clean:['no','yes']}}];
  await configure(w);const old=global.fetch;global.fetch=transport(accepted([effect])).fetch;
  try{assert.equal((await POST(req(aiBody()))).status,502);assert.deepEqual((await read()).objects,w.objects);}finally{global.fetch=old;}
 }
});
test('authorized receiving is separately consented by that NPC and preserves ownership',async()=>{
 const w=cupFixture();w.supplies[0].remaining=0;w.objects=[{id:'cup:1',source:'cup',label:'測試杯子',region:'kris-home-main',holder:'cass',owner:'owner',revision:1,state:{},lifecycle:'active',kind:'utensil',knownTo:['cass','owner'],allowedTo:['cass','owner'],acceptedBy:['owner']}];await configure(w);
 const old=global.fetch;global.fetch=transport(accepted([{kind:'transfer',objectId:'cup:1',expectedRevision:1,toHolder:'owner',toRegion:'kris-home-main'}])).fetch;
 try{assert.equal((await POST(req(aiBody()))).status,200);const saved=await read();assert.equal(saved.objects[0].holder,'owner');assert.equal(saved.objects[0].owner,'owner');assert.deepEqual(saved.objects[0].acceptedBy,[]);}finally{global.fetch=old;}
});
const stagedFixture=()=>{
 const w=cupFixture();w.supplies[0].remaining=0;w.objects=[{id:'cup:1',source:'cup',label:'測試杯子',region:'kris-home-main',holder:null,owner:'owner',revision:1,state:{contents:'empty'},lifecycle:'active',kind:'utensil',knownTo:['cass','owner'],allowedTo:['cass','owner'],stateTransitions:{contents:['empty','water','tea']}}];return w;
};
const teaCandidate=()=>({...accepted([]),stages:[{afterMinutes:30,preconditions:[{objectId:'cup:1',revision:1,region:'kris-home-main',holder:null,state:{contents:'empty'}}],effects:[{kind:'state',objectId:'cup:1',expectedRevision:1,key:'contents',value:'water'}]},{afterMinutes:60,preconditions:[{objectId:'cup:1',revision:2,region:'kris-home-main',holder:null,state:{contents:'water'}}],effects:[{kind:'state',objectId:'cup:1',expectedRevision:2,key:'contents',value:'tea'}]}]});
test('activity phases commit only when due and continue without additional model calls or dice',async()=>{
 await configure(stagedFixture());const old=global.fetch,random=Math.random;let calls=0,rolls=0;Math.random=()=>{rolls++;return .8;};global.fetch=async(_url,init)=>{calls++;const input=JSON.parse(JSON.parse(init.body).messages[1].content);return completion(input.contractVersion==='world-adjudication.v1'?teaCandidate():{...proposal('cup:1'),durationMinutes:60});};
 try{
  const advance=()=>POST(req(aiBody()));assert.equal((await advance()).status,200);let w=await read();assert.equal(w.objects[0].state.contents,'empty');assert.equal(w.characters[0].plan.phases.cursor,0);
  assert.equal((await advance()).status,200);w=await read();assert.equal(w.objects[0].state.contents,'water');assert.equal(w.characters[0].plan.phases.cursor,1);
  assert.equal((await advance()).status,200);assert.equal((await advance()).status,200);w=await read();assert.equal(w.objects[0].state.contents,'tea');assert.equal(w.objects[0].revision,3);assert.equal(calls,2);assert.equal(rolls,0);assert.equal(w.characters[0].plan,undefined);
 }finally{global.fetch=old;Math.random=random;}
});
const teaTransport=()=>{let calls=0;return{get calls(){return calls;},fetch:async(_url,init)=>{calls++;const input=JSON.parse(JSON.parse(init.body).messages[1].content);return completion(input.contractVersion==='world-adjudication.v1'?teaCandidate():{...proposal('cup:1'),durationMinutes:60});}};};
test('an explicit continue retains the original phase clock and committed cursor across reload and replay',async()=>{
 await configure(stagedFixture());const t=teaTransport(),old=global.fetch;global.fetch=t.fetch;
 try{
  await POST(req(aiBody()));await POST(req(aiBody()));const before=await read();
  await POST(req({operation:'intervene',target:'cass',text:'需要你留意一下這邊。'}));
  global.fetch=async()=>completion({type:'continue',target:'',content:'',mood:'',durationMinutes:60,intents:[]});
  const b={...aiBody(),operationId:Date.now()+':'+crypto.randomUUID()};assert.equal((await POST(req(b))).status,200);assert.equal((await POST(req(b))).status,200);let w=await read();assert.equal(w.objects[0].revision,2);assert.equal(w.characters[0].plan.startedAt,before.characters[0].plan.startedAt);assert.equal(w.characters[0].plan.phases.cursor,1);
  assert.equal((await POST(req(aiBody()))).status,200);w=await read();assert.equal(w.objects[0].revision,3);assert.equal(w.objects[0].state.contents,'tea');assert.equal(w.aiUsage.totalCalls,3);
 }finally{global.fetch=old;}
});
test('NPC interruption preserves the water already committed and never completes abandoned future phases',async()=>{
 await configure(stagedFixture());const t=teaTransport(),old=global.fetch;global.fetch=t.fetch;
 try{
  await POST(req(aiBody()));await POST(req(aiBody()));await POST(req({operation:'intervene',target:'cass',text:'可以現在過來說說話嗎？'}));
  global.fetch=async()=>completion({type:'rest',target:'',content:'',mood:'',durationMinutes:90,intents:[]});
  assert.equal((await POST(req(aiBody()))).status,200);assert.equal((await POST(req(aiBody()))).status,200);
  const w=await read();assert.equal(w.objects[0].state.contents,'water');assert.equal(w.objects[0].revision,2);assert.equal(w.characters[0].plan.phases,undefined);assert.equal(w.aiUsage.totalCalls,3);
 }finally{global.fetch=old;}
});
test('later round save failure retains earlier committed water and a retry operation cannot apply its phase twice',async()=>{
 await configure(stagedFixture());const t=teaTransport(),old=global.fetch;global.fetch=t.fetch;
 try{
  await POST(req(aiBody()));await POST(req(aiBody()));await POST(req(aiBody()));const earlier=await read();assert.equal(earlier.objects[0].state.contents,'water');
  store.conflictOnNextSave();assert.equal((await POST(req(aiBody()))).status,502);let w=await read();assert.equal(w.objects[0].state.contents,'water');assert.equal(w.objects[0].revision,2);assert.equal(w.characters[0].plan.phases.cursor,1);
  const b={...aiBody(),operationId:Date.now()+':'+crypto.randomUUID()};assert.equal((await POST(req(b))).status,200);assert.equal((await POST(req(b))).status,200);w=await read();assert.equal(w.objects[0].revision,3);assert.equal(w.objects[0].state.contents,'tea');assert.equal(t.calls,2);
 }finally{global.fetch=old;}
});
test('another informed NPC can handle the intermediate cup and stale phases reveal no hidden destination or mover',async()=>{
 await configure(stagedFixture());const t=teaTransport(),old=global.fetch;global.fetch=t.fetch;
 try{
  await POST(req(aiBody()));await POST(req(aiBody()));assert.equal((await read()).objects[0].state.contents,'water');
  await POST(req({operation:'return-control',target:'owner'}));
  global.fetch=async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);
   if(input.contractVersion==='world-adjudication.v1')return completion(accepted([{kind:'transfer',objectId:'cup:1',expectedRevision:2,toHolder:'owner',toRegion:'kris-home-main'}]));
   return completion(proposal('cup:1'));
  };
  assert.equal((await POST(req(aiBody()))).status,200);let w=await read();assert.equal(w.objects[0].holder,'owner');assert.equal(w.objects[0].state.contents,'water');
  global.fetch=async()=>completion({type:'move',target:'cafe',content:'',mood:'',durationMinutes:15,intents:[]});
  assert.equal((await POST(req(aiBody()))).status,200);w=await read();assert.equal(w.objects[0].region,'cafe-front');assert.equal(w.objects[0].state.contents,'water');assert.equal(w.characters.find(c=>c.id==='cass').plan,undefined);
  let cassInput;
  global.fetch=async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);if(input.self.id==='cass')cassInput=input;return completion({type:'rest',target:'',content:'',mood:'',durationMinutes:60,intents:[]});};
  assert.equal((await POST(req(aiBody()))).status,200);assert.ok(cassInput);assert.deepEqual(cassInput.objects,[]);assert.doesNotMatch(cassInput.self.activity,/cafe|owner|店主|咖啡/);
 }finally{global.fetch=old;}
});
test('rephrasing the same physical method cannot reroll unchanged authority conditions',async()=>{
 await configure(mealFixture());const old=global.fetch,random=Math.random;let rolls=0,decisions=0;Math.random=()=>{rolls++;return 0;};
 global.fetch=async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);if(input.contractVersion==='world-adjudication.v1')return completion({...accepted([{kind:'materialize',supplyId:'meal',expectedRemaining:1}]),check:{difficulty:12,ability:'拿取'}});decisions++;return completion({...proposal('meal'),content:decisions===1?'拿起食物':'伸手取得餐點'});};
 try{await POST(req(aiBody()));await POST(req(aiBody()));assert.equal(rolls,1);assert.equal((await read()).supplies[0].remaining,1);}finally{global.fetch=old;Math.random=random;}
});
test('adjudication wire schema uses closed object shapes and accepts bounded phase state entries',async()=>{
 await configure(stagedFixture());const old=global.fetch;
 global.fetch=async(_url,init)=>{const p=JSON.parse(init.body),input=JSON.parse(p.messages[1].content);
  if(input.contractVersion!=='world-adjudication.v1')return completion({...proposal('cup:1'),durationMinutes:60});
  const inspect=s=>{if(s&&typeof s==='object'){if(s.type==='object')assert.equal(s.additionalProperties,false);for(const v of Object.values(s))if(v&&typeof v==='object'){if(Array.isArray(v))v.forEach(inspect);else inspect(v);}}};inspect(p.response_format.json_schema.schema);
  const candidate=teaCandidate();for(const stage of candidate.stages)for(const condition of stage.preconditions)condition.state=Object.entries(condition.state).map(([key,value])=>({key,value}));return completion(candidate);
 };
 try{assert.equal((await POST(req(aiBody()))).status,200);assert.equal((await POST(req(aiBody()))).status,200);assert.equal((await read()).objects[0].state.contents,'water');}finally{global.fetch=old;}
});
test('recipient NPC chooses its own consent before another NPC can transfer possession',async()=>{
 const w=stagedFixture();w.objects[0].holder='cass';w.characters[0].control={mode:'taken-over'};w.characters[1].control={mode:'autonomous'};await configure(w);const old=global.fetch;
 global.fetch=async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);return completion(input.contractVersion==='world-adjudication.v1'?accepted([{kind:'consent',objectId:'cup:1'}]):proposal('cup:1'));};
 try{
  assert.equal((await POST(req(aiBody()))).status,200);let saved=await read();assert.deepEqual(saved.objects[0].acceptedBy,['owner']);assert.equal(saved.objects[0].holder,'cass');
  saved.characters[0].control={mode:'autonomous'};saved.characters[1].control={mode:'taken-over'};store.replaceCommittedWorld(saved);global.fetch=transport(accepted([{kind:'transfer',objectId:'cup:1',expectedRevision:1,toHolder:'owner',toRegion:'kris-home-main'}])).fetch;
  assert.equal((await POST(req(aiBody()))).status,200);saved=await read();assert.equal(saved.objects[0].holder,'owner');assert.equal(saved.objects[0].owner,'owner');
 }finally{global.fetch=old;}
});
test('consumed or destroyed identities cannot be reused or replaced from exhausted supply',async()=>{
 for(const lifecycle of ['consumed','destroyed'])for(const effects of [[{kind:'state',objectId:'cup:1',expectedRevision:1,key:'contents',value:'water'}],[{kind:'materialize',supplyId:'cup',expectedRemaining:0}]]){
  const w=stagedFixture();w.objects[0].lifecycle=lifecycle;await configure(w);const old=global.fetch;global.fetch=transport(accepted(effects)).fetch;
  try{assert.equal((await POST(req(aiBody()))).status,502);const saved=await read();assert.equal(saved.objects.length,1);assert.equal(saved.objects[0].lifecycle,lifecycle);assert.equal(saved.supplies[0].remaining,0);}finally{global.fetch=old;}
 }
});
test('thrown saves preserve known paid usage exactly once for both before and after commit outcomes',async()=>{
 for(const [inject,status,turn] of [['throwBeforeNextSave',502,0],['throwAfterNextSave',200,1]]){
  await configure(mealFixture());const old=global.fetch,t=transport(accepted([{kind:'materialize',supplyId:'meal',expectedRemaining:1}]));global.fetch=t.fetch;store[inject]();
  try{
   const b={...aiBody(),operationId:Date.now()+':'+crypto.randomUUID()};assert.equal((await POST(req(b))).status,status);let w=await read();assert.equal(w.turn,turn);assert.equal(w.aiUsage.totalCalls,2);assert.equal(w.aiUsage.totalInputTokens,60);assert.equal(w.aiUsage.totalOutputTokens,20);
   assert.equal((await POST(req(b))).status,status);w=await read();assert.equal(w.aiUsage.totalCalls,2);assert.equal(t.calls,2);assert.equal((w.objects||[]).length,turn);
  }finally{global.fetch=old;}
 }
});
test('15 and 30 minute advances apply all already-due phases while retaining later future work',async()=>{
 for(const minutes of [15,30]){
  await configure(stagedFixture());const old=global.fetch;const candidate=teaCandidate();candidate.stages[0].afterMinutes=15;candidate.stages[1].afterMinutes=30;
  global.fetch=async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);return completion(input.contractVersion==='world-adjudication.v1'?candidate:{...proposal('cup:1'),durationMinutes:60});};
  try{
   assert.equal((await POST(req({...aiBody(),minutes}))).status,200);let w=await read();assert.equal(w.objects[0].state.contents,minutes===15?'water':'tea');assert.equal(w.characters[0].plan.phases.cursor,minutes===15?1:2);assert.equal(w.aiUsage.totalCalls,2);
   assert.equal((await POST(req({...aiBody(),minutes}))).status,200);w=await read();assert.equal(w.objects[0].state.contents,'tea');assert.equal(w.objects[0].revision,3);assert.equal(w.aiUsage.totalCalls,2);
  }finally{global.fetch=old;}
 }
});
test('ownership does not reveal an unknown supply or authorize a hidden-object grant',async()=>{
 const w=cupFixture();w.supplies[0].knownTo=['cass'];w.characters[0].control={mode:'taken-over'};w.characters[1].control={mode:'autonomous'};await configure(w);const old=global.fetch;let ownerInput;
 global.fetch=async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);if(input.contractVersion==='world-adjudication.v1')return completion(accepted([{kind:'grant',targetId:'cup',recipient:'cass'}]));ownerInput=input;return completion(proposal('cup'));};
 try{assert.equal((await POST(req(aiBody()))).status,502);assert.deepEqual(ownerInput.supplies,[]);assert.equal((await read()).turn,0);}finally{global.fetch=old;}
});

test('an accepted candidate with no effect is invalid and never fabricates completed activity',async()=>{
 await configure(mealFixture());const old=global.fetch;global.fetch=transport(accepted([])).fetch;
 try{assert.equal((await POST(req(aiBody()))).status,502);const w=await read();assert.equal(w.turn,0);assert.equal(w.objects,undefined);assert.equal(w.aiUsage.totalCalls,2);assert.doesNotMatch(w.characters[0].activity,/完成這次行動/);}finally{global.fetch=old;}
});
test('uncertain staged plans bind their actual target prerequisites rather than sharing an empty-effect trial',async()=>{
 const w=stagedFixture();w.objects.push({...structuredClone(w.objects[0]),id:'cup:2'});await configure(w);const old=global.fetch,random=Math.random;let turns=0,rolls=0;Math.random=()=>{rolls++;return 0;};
 global.fetch=async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);if(input.contractVersion!=='world-adjudication.v1'){turns++;return completion({...proposal('cup:'+turns),durationMinutes:60});}const candidate=teaCandidate();candidate.check={difficulty:12,ability:'泡茶'};for(const stage of candidate.stages){stage.preconditions[0].objectId='cup:'+turns;stage.effects[0].objectId='cup:'+turns;}return completion(candidate);};
 try{await POST(req(aiBody()));await POST(req(aiBody()));assert.equal(rolls,2);assert.equal((await read()).objects[0].state.contents,'empty');}finally{global.fetch=old;Math.random=random;}
});
