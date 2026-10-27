/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
const {GET,POST}=load('route'),store=load('store'),{seedWorld}=load('world');
const id=()=>Date.now()+':'+crypto.randomUUID();
const ordinaryTimes=['tea','coffee','food','drink','wash','return'].map(operation=>({operation,minutes:['tea','coffee'].includes(operation)?30:15}));
const completion=v=>Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(v)}}]});
test('first ordinary tea approval survives serialized reload and a new activity reuses it without adjudication',async()=>{
 const world=seedWorld();world.contextId='routine-fixture';world.adjudication={provider:'openai',model:'gpt-6.1-sol'};
 world.characters.forEach(c=>{if(c.id!=='owner')c.control={mode:'taken-over'};});store.install(world);
 const post=body=>POST(new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationId:id(),worldContext:world.contextId,mode:'openai',model:'gpt-6.1-sol',...body})}));
 await post({operation:'set-model-key',key:'fixture-key'});
 const previous=global.fetch;let npc=0,adjudication=0;
 global.fetch=async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);if(input.contractVersion==='world-adjudication.v1'){adjudication++;return completion({status:'accepted',effects:[],stages:[],check:null,routine:{family:'cafe-service',version:1,timings:ordinaryTimes}});}npc++;return completion({type:'work',target:'tea',content:'準備一杯普通茶',mood:'平靜',durationMinutes:30,intents:[]});};
 try{
  const advance={operation:'advance',minutes:15};const first=await post(advance);assert.equal(first.status,200,(await first.clone().json()).error);
  let saved=(await(await GET()).json()).world;assert.equal(saved.routineRules.length,1);assert.equal(saved.objects[0].state.contents,'water');assert.equal(adjudication,1);
  await post(advance);saved=(await(await GET()).json()).world;assert.equal(saved.objects[0].state.contents,'tea');assert.equal(saved.characters.find(c=>c.id==='owner').plan,undefined);
  // GET uses SQLite JSON serialization; next POST loads a separate world object.
  const operation={...advance,operationId:id()};assert.equal((await post(operation)).status,200);assert.equal((await post(operation)).status,200);
  saved=(await(await GET()).json()).world;assert.equal(saved.objects.filter(o=>o.kind==='utensil').length,2);assert.equal(saved.objects.filter(o=>o.kind==='utensil')[1].state.contents,'water');assert.equal(adjudication,1);assert.equal(npc,2);assert.equal(saved.aiUsage.totalCalls,3);
  await post(advance);saved=(await(await GET()).json()).world;assert.equal(saved.objects.filter(o=>o.kind==='utensil')[1].state.contents,'tea');assert.ok(saved.routineAudit.some(e=>e.result==='reused'));
 }finally{global.fetch=previous;}
});

async function scenario(modify=()=>{},candidate={status:'accepted',effects:[],stages:[],check:null,routine:{family:'cafe-service',version:1,timings:ordinaryTimes}},decision={type:'work',target:'tea',content:'泡茶',mood:'平靜',durationMinutes:30,intents:[]}){
 const w=seedWorld();w.contextId='routine-failures';w.adjudication={provider:'openai',model:'gpt-6.1-sol'};w.characters.forEach(c=>{if(c.id!=='owner')c.control={mode:'taken-over'};});modify(w);store.install(w);
 const post=body=>POST(new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationId:id(),worldContext:w.contextId,mode:'openai',model:'gpt-6.1-sol',...body})}));await post({operation:'set-model-key',key:'fixture-key'});
 const previous=global.fetch;let dispatch=0;global.fetch=async(_url,init)=>{dispatch++;const input=JSON.parse(JSON.parse(init.body).messages[1].content);return completion(input.contractVersion==='world-adjudication.v1'?candidate:decision);};
 return {post,restore:()=>{global.fetch=previous;},calls:()=>dispatch,read:async()=>(await(await GET()).json()).world};
}
test('budget and malformed approval roll back rules, background and products while retaining paid attempts and replay safety',async()=>{
 for(const variant of ['budget','format']){
  const s=await scenario(w=>{if(variant==='budget')w.playerBudget={calls:1,tokens:1000000};},variant==='format'?{status:'accepted',effects:[],stages:[],check:null,routine:{family:'cafe-service',version:1,patch:{owner:'other'}}}:undefined);
  try{const op={operation:'advance',minutes:15,operationId:id()};const result=await s.post(op);assert.equal(result.status,variant==='budget'?429:502);const w=await s.read();assert.equal(w.turn,0);assert.equal(w.routineRules,undefined);assert.equal(w.supplies,undefined);assert.equal(w.objects,undefined);assert.equal(w.aiUsage.totalCalls,variant==='budget'?1:2);const calls=s.calls();await s.post(op);assert.equal(s.calls(),calls);}finally{s.restore();}
 }
});
test('save failure cannot expose half-approved ordinary background or a future product',async()=>{
 const s=await scenario();try{store.throwBeforeNextSave();const result=await s.post({operation:'advance',minutes:15});assert.equal(result.status,502);const w=await s.read();assert.equal(w.turn,0);assert.equal(w.routineRules,undefined);assert.equal(w.supplies,undefined);assert.equal(w.objects,undefined);}finally{s.restore();}
});
test('approval with a fabricated object target fails closed and cannot make an alternative cup',async()=>{
 const s=await scenario(()=>{},undefined,{type:'propose',target:'invented-cup',content:'泡一杯茶',purpose:'泡茶',mood:'平靜',durationMinutes:30,intents:[]});
 try{assert.equal((await s.post({operation:'advance',minutes:15})).status,200);const w=await s.read();assert.equal(w.objects,undefined);assert.equal(w.supplies,undefined);assert.match(w.characters.find(c=>c.id==='owner').activity,/沒有成功/);}finally{s.restore();}
});
test('ordinary rule diagnostics stay out of the next NPC decision and memory while physical results remain visible',async()=>{
 const s=await scenario();try{await s.post({operation:'advance',minutes:15});await s.post({operation:'advance',minutes:15});const previous=global.fetch;let input;global.fetch=async(url,init)=>{input=JSON.parse(JSON.parse(init.body).messages[1].content);return previous(url,init);};await s.post({operation:'advance',minutes:15});assert.equal(input.objects[0].state.contents,'tea');assert.doesNotMatch(JSON.stringify(input),/routineAudit|ruleId|routine-approved|routine-reuse|首次裁定|沿用日常規則/);}finally{s.restore();}
});
test('explicit exhausted tea materials cannot be replaced by ordinary background',async()=>{
 const s=await scenario(w=>{w.supplies=[{id:'last-tea',label:'明確有限的茶葉',region:'cafe-front',remaining:0,owner:'owner',knownTo:['owner'],allowedTo:['owner'],kind:'food',initialState:{}}];});
 try{assert.equal((await s.post({operation:'advance',minutes:15})).status,200);const w=await s.read();assert.equal(w.objects,undefined);assert.equal(w.supplies.length,1);assert.equal(w.supplies[0].remaining,0);assert.match(w.characters.find(c=>c.id==='owner').activity,/沒有成功/);}finally{s.restore();}
});

test('one confirmed scope prepares a genuinely different coffee after tea with no extra adjudication',async()=>{
 const s=await scenario();try{await s.post({operation:'advance',minutes:15});await s.post({operation:'advance',minutes:15});
 const previous=global.fetch;let calls=0;global.fetch=async(url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);if(input.contractVersion==='world-adjudication.v1'){calls++;return previous(url,init);}return completion({type:'propose',target:'cafe',content:'準備一杯咖啡',purpose:'飲用',mood:'平靜',durationMinutes:30,intents:[]});};
 const response=await s.post({operation:'advance',minutes:15});assert.equal(response.status,200,JSON.stringify(await response.clone().json()));await s.post({operation:'advance',minutes:15});const w=await s.read();assert.equal(calls,0);assert.ok(w.objects.some(o=>o.state.contents==='coffee'));assert.equal(w.routineRules.length,1);
 }finally{s.restore();}
});
test('same borrowed cup carries a consumed drink, wash and return; finite cake never refills',async()=>{
 const s=await scenario(w=>{w.supplies=[{id:'last-cake',label:'最後一份蛋糕',region:'cafe-front',remaining:1,owner:'owner',knownTo:['owner'],allowedTo:['owner'],kind:'food',initialState:{}}];w.objects=[{id:'borrowed-cup',source:'fixture',label:'借來的杯子',region:'cafe-front',holder:null,owner:'kris',revision:1,state:{contents:'empty'},lifecycle:'active',kind:'utensil',knownTo:['owner','kris'],allowedTo:['owner','kris'],stateTransitions:{contents:['empty','water','tea','coffee','dirty']}}];});
 try{await s.post({operation:'advance',minutes:15});await s.post({operation:'advance',minutes:15});let w=await s.read();assert.ok(w.objects.some(o=>o.kind==='food'&&o.state.vessel==='borrowed-cup'&&o.lifecycle==='active'));
 let action;global.fetch=async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);assert.notEqual(input.contractVersion,'world-adjudication.v1');return completion({type:'propose',mood:'平靜',durationMinutes:15,intents:[],...action});};
 const act=async(next)=>{action=next;const response=await s.post({operation:'advance',minutes:15});assert.equal(response.status,200,(await response.clone().json()).error);return s.read();};
 w=await act({target:'borrowed-cup',content:'喝掉這杯茶',purpose:'飲用'});const drink=w.objects.find(o=>o.state.vessel==='borrowed-cup');assert.equal(drink.lifecycle,'consumed');assert.equal(w.objects[0].state.contents,'dirty');
 w=await act({target:'borrowed-cup',content:'清洗杯子',purpose:'清潔'});assert.equal(w.objects[0].state.contents,'empty');
 w=await act({target:'borrowed-cup',content:'歸還杯子',purpose:'歸還'});assert.equal(w.objects[0].holder,null);assert.equal(w.objects[0].owner,'kris');assert.equal(w.objects.filter(o=>o.kind==='utensil').length,1);
 w=await act({target:'last-cake',content:'取得一份蛋糕',purpose:'食用'});assert.equal(w.supplies.find(s=>s.id==='last-cake').remaining,0);assert.equal(w.objects.filter(o=>o.source==='last-cake').length,1);
 w=await act({target:'last-cake',content:'取用蛋糕',purpose:'食用'});assert.equal(w.supplies.find(s=>s.id==='last-cake').remaining,0);assert.equal(w.objects.filter(o=>o.source==='last-cake').length,1);assert.match(w.characters.find(c=>c.id==='owner').activity,/沒有成功/);assert.equal(w.aiUsage.totalCalls,7);
 }finally{s.restore();}
});

test('persisted composable selector slots support a new request without editing a cafe verb whitelist',async()=>{
 const s=await scenario(w=>{w.routineRules=[{id:'custom-scope',family:'cafe-service',version:1,operations:['coffee'],origin:'cafe',knownTo:['owner'],templates:[{operation:'coffee',verbs:['沖製'],subjects:['手沖特調'],purposes:['飲用'],result:{kind:'brew',contents:'coffee',minutes:30}}]}];},undefined,{type:'propose',target:'cafe',content:'沖製一杯手沖特調',purpose:'飲用',mood:'平靜',durationMinutes:30,intents:[]});
 try{await s.post({operation:'advance',minutes:15});await s.post({operation:'advance',minutes:15});const w=await s.read();assert.ok(w.objects.some(o=>o.state.contents==='coffee'));assert.equal(s.calls(),1);assert.equal(w.aiUsage.totalCalls,1);}finally{s.restore();}
});
test('completed serving cannot be materialized twice and a reserved drink is not advertised to the NPC',async()=>{
 const s=await scenario();try{await s.post({operation:'advance',minutes:15});let w=await s.read();const source=w.supplies.find(s=>s.kind==='food');assert.equal(w.objects.some(o=>o.kind==='food'),false);
 const previous=global.fetch;let seen;global.fetch=async(url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);if(input.contractVersion!=='world-adjudication.v1')seen=input;return previous(url,init);};
 // An intervention causes normal NPC reconsideration while the product is reserved.
 const intervention=await s.post({operation:'intervene',target:'owner',text:'你還在準備嗎？'});assert.equal(intervention.status,200);await s.post({operation:'advance',minutes:15});
 assert.ok(seen);assert.equal(seen.supplies.some(s=>s.id===source.id),false);
 // Finish the currently chosen fresh activity too; every prepared output is one-shot.
 await s.post({operation:'advance',minutes:15});w=await s.read();const finished=w.supplies.filter(s=>s.kind==='food'&&s.remaining===0);assert.ok(finished.length);
 const candidate={status:'accepted',effects:[{kind:'materialize',supplyId:finished[0].id,expectedRemaining:0}],stages:[],check:null,routine:null};
 global.fetch=async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);return completion(input.contractVersion==='world-adjudication.v1'?candidate:{type:'propose',target:finished[0].id,content:'複製已喝過的飲品',purpose:'新的特殊用途',mood:'平靜',durationMinutes:15,intents:[]});};
 const before=JSON.stringify(w.objects);const response=await s.post({operation:'advance',minutes:15});assert.equal(response.status,502);assert.equal(JSON.stringify((await s.read()).objects),before);
 }finally{s.restore();}
});
test('ordinary meal and finite cake coexist; save failure and replay preserve earlier finished products',async()=>{
 const s=await scenario(w=>{w.supplies=[{id:'cake',label:'最後一份蛋糕',region:'cafe-front',remaining:1,owner:'owner',knownTo:['owner'],allowedTo:['owner'],kind:'food',initialState:{}}];});
 try{await s.post({operation:'advance',minutes:15});await s.post({operation:'advance',minutes:15});const before=await s.read();global.fetch=async()=>completion({type:'propose',target:'cafe',content:'準備一份簡餐',purpose:'用餐',mood:'平靜',durationMinutes:15,intents:[]});
 const op={operation:'advance',minutes:15,operationId:id()};store.throwBeforeNextSave();assert.equal((await s.post(op)).status,502);let w=await s.read();assert.deepEqual(w.objects,before.objects);assert.equal(w.supplies.find(s=>s.id==='cake').remaining,1);const calls=w.aiUsage.totalCalls;await s.post(op);assert.equal((await s.read()).aiUsage.totalCalls,calls);
 const next={operation:'advance',minutes:15,operationId:id()};assert.equal((await s.post(next)).status,200);await s.post(next);w=await s.read();assert.equal(w.objects.filter(o=>o.label==='簡餐').length,1);assert.equal(w.supplies.find(s=>s.id==='cake').remaining,1);assert.equal(w.aiUsage.totalCalls,calls+1);
 }finally{s.restore();}
});
test('banquet purpose and moved explicit cup leave the bounded reuse path without silently changing target',async()=>{
 const s=await scenario();try{await s.post({operation:'advance',minutes:15});await s.post({operation:'advance',minutes:15});const w=await s.read();const cup=w.objects.find(o=>o.kind==='utensil');cup.region='cafe-back';store.replaceCommittedWorld(w);
 let adjudications=0;let decision={type:'propose',target:cup.id,content:'準備一杯咖啡',purpose:'飲用',mood:'平靜',durationMinutes:30,intents:[]};global.fetch=async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);if(input.contractVersion==='world-adjudication.v1'){adjudications++;return completion({status:'denied',effects:[],stages:[],check:null,routine:null});}return completion(decision);};
 await s.post({operation:'advance',minutes:15});assert.equal(adjudications,0);let saved=await s.read();assert.equal(saved.objects.filter(o=>o.kind==='utensil').length,1);assert.equal(saved.objects.find(o=>o.id===cup.id).region,'cafe-back');
 decision={...decision,target:'cafe',content:'準備一百杯咖啡',purpose:'大型宴席'};await s.post({operation:'advance',minutes:15});saved=await s.read();assert.equal(adjudications,1);assert.equal(saved.objects.filter(o=>o.kind==='utensil').length,1);
 }finally{s.restore();}
});

test('a completed finite coffee serving does not masquerade as exhausted coffee ingredients',async()=>{
 const s=await scenario(()=>{},undefined,{type:'propose',target:'cafe',content:'準備一杯咖啡',purpose:'飲用',mood:'平靜',durationMinutes:30,intents:[]});
 try{for(let i=0;i<4;i++)assert.equal((await s.post({operation:'advance',minutes:15})).status,200);const w=await s.read();assert.equal(w.objects.filter(o=>o.state.beverage==='coffee').length,2);assert.equal(s.calls(),3);}finally{s.restore();}
});

test('requested tea cannot consume coffee or substitute an explicit target; generic drink consumes visible coffee',async()=>{
 for(const target of ['cafe','review-cup']){
  const s=await scenario(()=>{},undefined,{type:'propose',target:'cafe',content:'準備一杯咖啡',purpose:'飲用',mood:'平靜',durationMinutes:30,intents:[]});
  try{
   await s.post({operation:'advance',minutes:15});await s.post({operation:'advance',minutes:15});
   let w=await s.read();const cup=w.objects.find(o=>o.kind==='utensil');w.objects.push({...cup,id:'secret-cup',label:'隱藏茶杯',region:'cafe-storeroom',holder:null,owner:'kris',knownTo:['kris'],state:{contents:'tea'}},{...w.objects.find(o=>o.kind==='food'),id:'secret-tea',label:'隱藏茶',region:'cafe-storeroom',holder:null,owner:'kris',knownTo:['kris'],state:{vessel:'secret-cup',beverage:'tea'}});store.replaceCommittedWorld(w);let seen,adjudications=0;
   let decision={type:'propose',target:target==='cafe'?'cafe':cup.id,content:'喝茶',purpose:'飲用',mood:'平靜',durationMinutes:15,intents:[]};
   global.fetch=async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);if(input.contractVersion==='world-adjudication.v1'){adjudications++;throw Error('unexpected adjudication');}seen=input;return completion(decision);};
   assert.equal((await s.post({operation:'advance',minutes:15})).status,200);w=await s.read();
   assert.equal(w.objects.find(o=>o.id===cup.id).state.contents,'coffee');assert.equal(w.objects.find(o=>o.state.vessel===cup.id).lifecycle,'active');assert.equal(adjudications,0);
   assert.match(w.characters.find(c=>c.id==='owner').activity,/沒有成功/);
   const projected=JSON.stringify(seen);assert.doesNotMatch(projected,/routineAudit|ruleId|secret-cup|secret-tea|隱藏茶/);assert.match(projected,/喝咖啡/);
   decision={...decision,content:'飲用飲品'};assert.equal((await s.post({operation:'advance',minutes:15})).status,200);w=await s.read();assert.equal(w.objects.find(o=>o.state.vessel===cup.id).lifecycle,'consumed');assert.equal(w.objects.find(o=>o.id===cup.id).state.contents,'dirty');assert.equal(adjudications,0);
  }finally{s.restore();}
 }
});

test('existing meal generator respects object capacity without evicting history or repeating paid decisions on replay',async()=>{
 const s=await scenario(w=>{w.routineRules=[{id:'r',version:1,family:'cafe-service',operations:['food'],origin:'cafe',knownTo:['owner']}];w.supplies=[{id:'meal-generator',label:'簡餐',region:'cafe-front',remaining:1,owner:'owner',knownTo:['owner'],allowedTo:['owner'],kind:'food',initialState:{},background:{ruleId:'r',sequence:512}}];w.objects=Array.from({length:512},(_,i)=>({id:'old-'+i,source:'old',label:'歷史餐點',region:'cafe-front',holder:null,owner:'owner',revision:1,state:{},lifecycle:'consumed',kind:'food',knownTo:['owner'],allowedTo:['owner']}));},undefined,{type:'propose',target:'cafe',content:'準備一份簡餐',purpose:'用餐',mood:'平靜',durationMinutes:15,intents:[]});
 try{const before=await s.read(),op={operation:'advance',minutes:15,operationId:id()};await s.post(op);const w=await s.read();assert.deepEqual(w.objects,before.objects);assert.equal(w.supplies[0].background.sequence,512);assert.equal(w.aiUsage.totalCalls,1);assert.equal(s.calls(),1);await s.post(op);assert.deepEqual((await s.read()).objects,before.objects);assert.equal(s.calls(),1);}finally{s.restore();}
});

test('exhausted finished English coffee serving never counts as raw coffee ingredients',async()=>{
 const s=await scenario(w=>{w.routineRules=[{id:'r',version:1,family:'cafe-service',operations:['coffee'],origin:'cafe',knownTo:['owner']}];w.supplies=[{id:'old-serving',label:'coffee',region:'cafe-front',remaining:0,owner:'owner',knownTo:['owner'],allowedTo:['owner'],kind:'food',initialState:{vessel:'old-cup',beverage:'coffee'}}];},undefined,{type:'propose',target:'cafe',content:'準備一杯咖啡',purpose:'飲用',mood:'平靜',durationMinutes:30,intents:[]});
 try{assert.equal((await s.post({operation:'advance',minutes:15})).status,200);assert.equal((await s.read()).objects[0].state.contents,'water');await s.post({operation:'advance',minutes:15});const w=await s.read();assert.ok(w.objects.some(o=>o.state.beverage==='coffee'));assert.equal(w.supplies.find(s=>s.id==='old-serving').remaining,0);assert.equal(s.calls(),1);}finally{s.restore();}
});

test('linked serving and cup require coherent transfers and consumption without implicit effects',async()=>{
 const s=await scenario();
 try{await s.post({operation:'advance',minutes:15});await s.post({operation:'advance',minutes:15});let w=await s.read();const cup=w.objects.find(o=>o.kind==='utensil'),drink=w.objects.find(o=>o.state.vessel===cup.id);let effects=[];
 global.fetch=async(_url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);return completion(input.contractVersion==='world-adjudication.v1'?{status:'accepted',effects,stages:[],check:null,routine:null}:{type:'propose',target:cup.id,content:'交付完整飲品',purpose:'新的交付方法',mood:'平靜',durationMinutes:15,intents:[]});};
 effects=[{kind:'transfer',objectId:cup.id,expectedRevision:cup.revision,toHolder:null,toRegion:cup.region}];const before=w.objects;assert.equal((await s.post({operation:'advance',minutes:15})).status,502);assert.deepEqual((await s.read()).objects,before);
 effects.push({kind:'transfer',objectId:drink.id,expectedRevision:drink.revision,toHolder:null,toRegion:drink.region});assert.equal((await s.post({operation:'advance',minutes:15})).status,200);w=await s.read();assert.equal(w.objects.find(o=>o.id===cup.id).holder,null);assert.equal(w.objects.find(o=>o.id===drink.id).holder,null);
 effects=[{kind:'transfer',objectId:drink.id,expectedRevision:drink.revision+1,toHolder:'owner',toRegion:drink.region},{kind:'consume',objectId:drink.id,expectedRevision:drink.revision+2}];assert.equal((await s.post({operation:'advance',minutes:15})).status,502);assert.equal((await s.read()).objects.find(o=>o.id===drink.id).lifecycle,'active');
 effects.push({kind:'state',objectId:cup.id,expectedRevision:cup.revision+1,key:'contents',value:'dirty'});assert.equal((await s.post({operation:'advance',minutes:15})).status,200);w=await s.read();assert.equal(w.objects.find(o=>o.id===cup.id).state.contents,'dirty');assert.equal(w.objects.find(o=>o.id===drink.id).lifecycle,'consumed');
 }finally{s.restore();}
});
