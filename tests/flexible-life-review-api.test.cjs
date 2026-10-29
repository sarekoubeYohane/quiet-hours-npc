/* eslint-disable @typescript-eslint/no-require-imports -- Public world API, SQLite and external transport fixtures. */
const {fixtureDecision}=require('./pursuit-fixture.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
const {GET,POST}=load('route'),{seedWorld}=load('world'),store=load('store');
const req=b=>new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationId:`${Date.now()}:${crypto.randomUUID()}`,mode:'demo',...b})});
test('known nonmatch then match between own slots rearms event cue',async()=>{
const w=seedWorld();const owner=w.characters.find(c=>c.id==='owner'),cass=w.characters.find(c=>c.id==='cass');w.characters=[owner,cass];for(const c of w.characters){c.location='cafe';c.region='cafe-front';}w.adjudication={provider:'openai',model:'fixture'};store.install(w);
await POST(req({operation:'set-model-key',mode:'openai',key:'test-key'}));await POST(req({operation:'set-budget',limits:{calls:100,tokens:1000000}}));
const old=global.fetch;let round=0;const owners=[];
global.fetch=async(_u,init)=>{const b=JSON.parse(init.body),i=JSON.parse(b.messages[1].content);let a={type:'rest',target:'',content:'',mood:'平靜',durationMinutes:15,intents:[],memorySelections:[],memoryOperations:[],cognitiveUpdates:[],preferenceUpdates:[],habitCandidates:[],attentionConditions:[],interpretation:''};if(i.self.id==='owner'){owners.push(i);if(round===0)a.arrangementUpdates=[{operation:'upsert',id:'meet-cass',version:0,text:'Cass再次來到前台時談話',condition:{kind:'event',clueKind:'person',source:'cass',region:'cafe-front'},references:[{kind:'short',id:i.self.shortTerm[0].id,version:i.self.shortTerm[0].version}],reason:'稍後再談'}];}else if(round<4)a={...a,type:'move',target:round%2===0?'cafe-storeroom':'cafe-front'};return Response.json({usage:{prompt_tokens:5,completion_tokens:5},choices:[{message:{content:JSON.stringify(fixtureDecision(JSON.parse(JSON.parse(init.body).messages[1].content),a))}}]});};
try{for(round=0;round<6;round++){const r=await POST(req({operation:'advance',mode:'openai',model:'gpt-6-luna',minutes:15}));assert.equal(r.status,200,await r.clone().text());}assert.deepEqual(owners.map(i=>i.self.arrangementCues.length),[0,1,0,1,0,0],'both known cycles trigger once, quiet views never replay old observations');}finally{global.fetch=old;}
});

test('semantic condition field order supports complete, drop and archive while a real changed condition is rejected',async()=>{
 for(const operation of ['complete','drop','archive','changed']){
  const w=seedWorld();w.characters=w.characters.filter(c=>c.id==='owner');w.adjudication={provider:'openai',model:'fixture'};store.install(w);
  await POST(req({operation:'set-model-key',mode:'openai',key:'test-key'}));const old=global.fetch;let step=0;
  global.fetch=async(_u,init)=>{
   const i=JSON.parse(JSON.parse(init.body).messages[1].content),m=i.self.shortTerm[0];
   const next=step===0?'upsert':operation==='archive'&&step===1?'drop':operation==='changed'?'drop':operation;
   return Response.json({usage:{prompt_tokens:5,completion_tokens:5},choices:[{message:{content:JSON.stringify(fixtureDecision(JSON.parse(JSON.parse(init.body).messages[1].content),{type:'rest',target:'',content:'',mood:'平靜',durationMinutes:15,intents:[],memorySelections:[],memoryOperations:[],cognitiveUpdates:[],preferenceUpdates:[],habitCandidates:[],attentionConditions:[],interpretation:'',arrangementUpdates:[{operation:next,id:'same',version:step,text:'以後再談',condition:step===0?{kind:'time',minute:9999}:{minute:operation==='changed'?10000:9999,kind:'time'},references:[{kind:'short',id:m.id,version:m.version}],reason:'我自行決定'}]}))}}]});
  };
  try{
   for(step=0;step<(operation==='archive'?3:2);step++){
    const before=(await(await GET()).json()).world,r=await POST(req({operation:'advance',mode:'openai',model:'gpt-6-luna',minutes:15}));
    if(operation==='changed'&&step===1){assert.equal(r.status,502);assert.deepEqual((await(await GET()).json()).world.characters,before.characters);}
    else assert.equal(r.status,200,await r.clone().text());
   }
   const state=(await(await GET()).json()).world.characters[0].arrangements;
   if(operation==='archive')assert.equal(state.items.length,0);else assert.equal(state.items[0].status,operation==='complete'?'completed':operation==='drop'?'dropped':'active');
  }finally{global.fetch=old;}
 }
});
test('private delivered message keeps the exact original whitespace',async()=>{const w=seedWorld();w.adjudication={provider:'openai',model:'fixture'};store.install(w);await POST(req({operation:'set-model-key',mode:'openai',key:'test-key'}));const old=global.fetch;const original='  第一行\n  第二行\n';global.fetch=async(_u,init)=>{const i=JSON.parse(JSON.parse(init.body).messages[1].content);return Response.json({usage:{prompt_tokens:5,completion_tokens:5},choices:[{message:{content:JSON.stringify(fixtureDecision(JSON.parse(JSON.parse(init.body).messages[1].content),{type:i.self.id==='cass'?'message':'rest',target:i.self.id==='cass'?'vera':'',content:i.self.id==='cass'?original:'',mood:'平靜',durationMinutes:15,intents:[],memorySelections:[],memoryOperations:[],cognitiveUpdates:[],preferenceUpdates:[],habitCandidates:[],attentionConditions:[],interpretation:''}))}}]});};try{const r=await POST(req({operation:'advance',mode:'openai',model:'gpt-6-luna',minutes:15}));assert.equal(r.status,200,await r.clone().text());const saved=(await(await GET()).json()).world;const inbox=saved.phones.devices.flatMap(d=>d.inbox);assert.equal(inbox[0].text,original);assert.ok(saved.characters.find(c=>c.id==='cass').shortTerm.some(m=>m.text.includes(original)),'sender retains the same exact sent body');}finally{global.fetch=old;}});

test('shared phone event reminders preserve two known departure-return cycles, then stay quiet on reload and operation replay',async()=>{
 const w=seedWorld(),owner=w.characters.find(c=>c.id==='owner'),cass=w.characters.find(c=>c.id==='cass');w.characters=[owner,cass];
 for(const c of w.characters){c.location='cafe';c.region='cafe-front';}w.adjudication={provider:'openai',model:'fixture'};store.install(w);
 await POST(req({operation:'set-model-key',mode:'openai',key:'test-key'}));await POST(req({operation:'set-budget',limits:{calls:100,tokens:1000000}}));
 const previousFetch=global.fetch,previousRandom=Math.random;let round=0,calls=0,rolls=0;const notices=[];
 Math.random=()=>{rolls++;return .8;};
 global.fetch=async(_u,init)=>{
  calls++;const i=JSON.parse(JSON.parse(init.body).messages[1].content);
  let a={type:'rest',target:'',content:'',mood:'平靜',durationMinutes:15,intents:[],memorySelections:[],memoryOperations:[],cognitiveUpdates:[],preferenceUpdates:[],habitCandidates:[],attentionConditions:[],interpretation:''};
  if(i.self.id==='owner'&&round===0)a={...a,type:'phone',target:i.phones[0].objectId,content:JSON.stringify(fixtureDecision(JSON.parse(JSON.parse(init.body).messages[1].content),{collection:'calendar',operation:'create',id:'return-reminder',version:0,text:'等她回來再談',condition:{kind:'event',clueKind:'person',source:'cass',region:'cafe-front'},reminder:true}))};
  else if(i.self.id==='cass'&&round<4)a={...a,type:'move',target:round%2===0?'cafe-storeroom':'cafe-front'};
  return Response.json({usage:{prompt_tokens:5,completion_tokens:5},choices:[{message:{content:JSON.stringify(fixtureDecision(JSON.parse(JSON.parse(init.body).messages[1].content),a))}}]});
 };
 try{
  let settledRolls;
  for(round=0;round<6;round++){
   const operationId=`${Date.now()}:${crypto.randomUUID()}`,body={operation:'advance',mode:'openai',model:'gpt-6-luna',minutes:15,operationId};
   const response=await POST(req(body));assert.equal(response.status,200,await response.clone().text());
   const saved=(await(await GET()).json()).world;notices.push(saved.phones.devices.flatMap(d=>d.notifications||[]).length);
   if(round===3){settledRolls=rolls;const dispatched=calls;assert.deepEqual(await(await POST(req(body))).json(),await response.json());assert.equal(calls,dispatched);assert.equal(rolls,settledRolls);}
   if(round>3)assert.equal(rolls,settledRolls,'quiet rounds cannot reroll old notification sounds');
  }
  assert.deepEqual(notices,[0,1,1,2,2,2]);
 }finally{global.fetch=previousFetch;Math.random=previousRandom;}
});

test('new event cursor and consideration roll back with a failed save; failed and committed original IDs never replay observations',async()=>{
 const w=seedWorld(),owner=w.characters.find(c=>c.id==='owner'),cass=w.characters.find(c=>c.id==='cass');w.characters=[owner,cass];for(const c of w.characters){c.location='cafe';c.region='cafe-front';}w.adjudication={provider:'openai',model:'fixture'};store.install(w);
 await POST(req({operation:'set-model-key',mode:'openai',key:'test-key'}));await POST(req({operation:'set-budget',limits:{calls:100,tokens:1000000}}));
 const previous=global.fetch;let round=0,calls=0;
 global.fetch=async(_u,init)=>{
  calls++;const i=JSON.parse(JSON.parse(init.body).messages[1].content);
  let a={type:'rest',target:'',content:'',mood:'平靜',durationMinutes:15,intents:[],memorySelections:[],memoryOperations:[],cognitiveUpdates:[],preferenceUpdates:[],habitCandidates:[],attentionConditions:[],interpretation:''};
  if(i.self.id==='owner'&&round===0)a.arrangementUpdates=[{operation:'upsert',id:'again',version:0,text:'回來後再談',condition:{kind:'event',clueKind:'person',source:'cass',region:'cafe-front'},references:[{kind:'short',id:i.self.shortTerm[0].id,version:i.self.shortTerm[0].version}],reason:'留待下次見面'}];
  else if(i.self.id==='cass'&&round<4)a={...a,type:'move',target:round%2===0?'cafe-storeroom':'cafe-front'};
  return Response.json({usage:{prompt_tokens:5,completion_tokens:5},choices:[{message:{content:JSON.stringify(fixtureDecision(JSON.parse(JSON.parse(init.body).messages[1].content),a))}}]});
 };
 const read=async()=>(await(await GET()).json()).world,advance=body=>POST(req({operation:'advance',mode:'openai',model:'gpt-6-luna',minutes:15,...body}));
 try{
  for(round=0;round<3;round++)assert.equal((await advance()).status,200);
  const before=await read();store.throwBeforeNextSave();const failed={operationId:`${Date.now()}:${crypto.randomUUID()}`},failure=await advance(failed),result=await failure.json();assert.notEqual(failure.status,200);assert.deepEqual((await read()).characters,before.characters);const charged=calls;
  assert.deepEqual(await(await advance(failed)).json(),result);assert.equal(calls,charged);
  const committed={operationId:`${Date.now()}:${crypto.randomUUID()}`};assert.equal((await advance(committed)).status,200);const after=await read(),cue=after.characters.find(c=>c.id==='owner').arrangements.items[0].cue;assert.equal(cue.epoch,2);assert.ok(cue.observationCursor);assert.ok(cue.trigger.handledAt);
  round=4;assert.equal((await advance()).status,200);const settled=(await read()).characters.find(c=>c.id==='owner').arrangements.items[0].cue;assert.deepEqual(settled,cue);const dispatched=calls;await advance(committed);assert.equal(calls,dispatched);assert.deepEqual((await read()).characters.find(c=>c.id==='owner').arrangements.items[0].cue,cue);
 }finally{global.fetch=previous;}
});

test('forgetting latest processed same-minute observation must not replay earlier processed events',async()=>{const w=seedWorld();w.characters=['owner','cass','vera'].map(id=>w.characters.find(c=>c.id===id));for(const c of w.characters){c.location='cafe';c.region='cafe-front';}w.adjudication={provider:'openai',model:'fixture'};store.install(w);await POST(req({operation:'set-model-key',mode:'openai',key:'test-key'}));await POST(req({operation:'set-budget',limits:{calls:100,tokens:1000000}}));const old=global.fetch;let round=0;const own=[];global.fetch=async(_u,init)=>{const i=JSON.parse(JSON.parse(init.body).messages[1].content);assert.doesNotMatch(JSON.stringify(i),/observationSequence/,'operational order is not NPC knowledge');const a={type:'rest',target:'',content:'',mood:'平靜',durationMinutes:15,intents:[],memorySelections:[],memoryOperations:[],cognitiveUpdates:[],preferenceUpdates:[],habitCandidates:[],attentionConditions:[],interpretation:''};if(i.self.id==='owner'){own.push(i);if(round===0)a.arrangementUpdates=[{operation:'upsert',id:'somebody-returns',version:0,text:'有人回前台再談',condition:{kind:'event',clueKind:'person',source:'',region:'cafe-front'},references:[{kind:'short',id:i.self.shortTerm[0].id,version:i.self.shortTerm[0].version}],reason:'留待見面'}];if(round===1){const m=i.self.shortTerm.find(m=>m.text.includes('Vera 來到了前台'));assert.ok(m);const arrangement=i.self.shortTerm.find(m=>m.id===i.self.arrangements.items[0].memory.id);assert.ok(arrangement);a.memorySelections=[{id:m.id,version:m.version,reason:'保留片刻'},{id:arrangement.id,version:arrangement.version,reason:'仍在乎此安排'}];}if(round===2){const m=i.self.longTerm.find(m=>m.text.includes('Vera 來到了前台'));assert.ok(m);a.memoryOperations=[{type:'forget',targets:[{id:m.id,version:m.version}],text:'',unresolved:[],reason:'明示忘記這段'}];}}else if(round<2||i.self.id==='cass'&&(round===5||round===6)){a.type='move';a.target=round===0||round===5?'cafe-storeroom':'cafe-front';}return Response.json({usage:{prompt_tokens:5,completion_tokens:5},choices:[{message:{content:JSON.stringify(fixtureDecision(JSON.parse(JSON.parse(init.body).messages[1].content),a))}}]});};try{for(round=0;round<4;round++){const r=await POST(req({operation:'advance',mode:'openai',model:'gpt-6-luna',minutes:15}));assert.equal(r.status,200,await r.clone().text());}assert.deepEqual(own.map(i=>i.self.arrangementCues.length),[0,1,0,0]);assert.equal(own[3].self.arrangementCues.length,0,'no new person event occurred after the legitimate forget');for(let j=0;j<82;j++)assert.equal((await POST(req({operation:'intervene',target:'owner',text:'日常問候 '+j}))).status,200);for(round=4;round<9;round++){const response=await POST(req({operation:'advance',mode:'openai',model:'gpt-6-luna',minutes:15}));assert.equal(response.status,200,await response.clone().text());}assert.deepEqual(own.slice(4).map(i=>i.self.arrangementCues.length),[0,0,0,1,0],'FIFO keeps high water, then a genuinely new known cycle still triggers once');}finally{global.fetch=old;}});

test('a genuinely later same-minute person clue remains eligible after the actor already consumed an earlier clue in that minute',async()=>{
 const w=seedWorld();w.characters=['owner','cass','vera'].map(id=>w.characters.find(c=>c.id===id));for(const c of w.characters){c.location='cafe';c.region='cafe-front';}w.adjudication={provider:'openai',model:'fixture'};store.install(w);
 await POST(req({operation:'set-model-key',mode:'openai',key:'test-key'}));await POST(req({operation:'set-budget',limits:{calls:100,tokens:1000000}}));
 const previous=global.fetch,inputs=[];let round=0;
 global.fetch=async(_u,init)=>{
  const i=JSON.parse(JSON.parse(init.body).messages[1].content);assert.doesNotMatch(JSON.stringify(i),/observationSequence/);
  const a={type:'rest',target:'',content:'',mood:'平靜',durationMinutes:15,intents:[],memorySelections:[],memoryOperations:[],cognitiveUpdates:[],preferenceUpdates:[],habitCandidates:[],attentionConditions:[],interpretation:''};
  if(i.self.id==='owner'){
   inputs.push(i);if(round===0)a.arrangementUpdates=[{operation:'upsert',id:'next-arrival',version:0,text:'有人來到前台時再談',condition:{kind:'event',clueKind:'person',source:'',region:'cafe-front'},references:[{kind:'short',id:i.self.shortTerm[0].id,version:i.self.shortTerm[0].version}],reason:'等待相遇'}];
  }else if(round===0||round===1&&i.self.id==='vera'||round===2){a.type='move';a.target=round===0||round===2&&i.self.id==='vera'?'cafe-storeroom':'cafe-front';}
  return Response.json({usage:{prompt_tokens:5,completion_tokens:5},choices:[{message:{content:JSON.stringify(fixtureDecision(JSON.parse(JSON.parse(init.body).messages[1].content),a))}}]});
 };
 try{
  for(round=0;round<4;round++){const response=await POST(req({operation:'advance',mode:'openai',model:'gpt-6-luna',minutes:15}));assert.equal(response.status,200,await response.clone().text());}
  assert.deepEqual(inputs.map(i=>i.self.arrangementCues.length),[0,1,0,1]);
  const earlier=inputs[2].self.observations.findLast(o=>o.kind==='person'&&o.source==='vera'),later=inputs[3].self.observations.findLast(o=>o.kind==='person'&&o.source==='cass');assert.equal(earlier.time,later.time,'the later source must not be lost by changing the old timestamp fallback to <=');
 }finally{global.fetch=previous;}
});
