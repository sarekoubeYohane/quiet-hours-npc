/* eslint-disable @typescript-eslint/no-require-imports -- Public API fixtures, only model transport and RNG are controlled. */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=name=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,`${name}.cjs`));
const {GET,POST}=load('route'),{seedWorld}=load('world'),store=load('store');
const action=(extra={})=>({type:'rest',target:'',content:'休息片刻',mood:'平靜',durationMinutes:15,intents:[],memorySelections:[],memoryOperations:[],cognitiveUpdates:[],preferenceUpdates:[],habitCandidates:[],attentionConditions:[],interpretation:'',...extra});
const actor=w=>w.characters.find(c=>c.id==='owner');
const read=async()=>{const response=await GET();assert.equal(response.status,200);return(await response.json()).world;};
async function setup(initial=seedWorld()){
 initial.adjudication={provider:'openai',model:'fixture-world'};
 for(const c of initial.characters)if(c.id!=='owner')c.control={mode:'taken-over'};
 store.install(initial);
 const post=body=>POST(new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationId:`${Date.now()}:${crypto.randomUUID()}`,mode:'openai',model:'gpt-6-luna',minutes:15,...body})}));
 await post({operation:'set-model-key',key:'fixture-key'});await post({operation:'set-budget',limits:{calls:120,tokens:500000}});
 const original=global.fetch,inputs=[],bodies=[];let choose=()=>action();
 global.fetch=async(_url,init)=>{const body=JSON.parse(init.body),input=JSON.parse(body.messages[1].content);inputs.push(input);bodies.push(body);return Response.json({usage:{prompt_tokens:10,completion_tokens:5},choices:[{message:{content:JSON.stringify(choose(input))}}]});};
 return {post,inputs,bodies,choose:fn=>{choose=fn;},restore:()=>{global.fetch=original;},advance:async(body={})=>{const response=await post({operation:'advance',...body});assert.equal(response.status,200,await response.clone().text());return read();}};
}
const memoryPayload=input=>({preferences:input.self.preferences,cognition:input.self.cognition,shortTerm:input.self.shortTerm,longTerm:input.self.longTerm,memoryReview:input.self.memoryReview,memories:input.self.memories,observations:input.self.observations,relationships:input.self.relationships,knownControlExperiences:input.knownControlExperiences,pendingInterventions:input.pendingInterventions,learnedHabits:input.learnedHabits});
async function performedPair(s){s.choose(()=>action({type:'work',target:'tidy',content:'整理桌面'}));await s.advance();s.choose(()=>action());const w=await s.advance(),evidence=actor(w).habitEvidence;return{trigger:evidence.at(-2).memory,action:evidence.at(-1).memory};}
const ref=pair=>({kind:'short',...pair.action});
function combined(pair){return action({
 type:'work',target:'tidy',content:'先把手上的工作做好',
 preferenceUpdates:[{operation:'upsert',id:'rest-choice',version:0,topic:'休息',context:'工作之後',text:'我喜歡停下來休息，但現在仍想先整理。',references:[ref(pair)],reason:'剛才的經歷對我有意義。'}],
 habitCandidates:[pair],memorySelections:[{...pair.action,reason:'我選擇保留這段休息經驗。'}],
 cognitiveUpdates:[{kind:'belief',operation:'upsert',id:'work-pace',version:0,topic:'工作節奏',text:'適時停一下可能幫助我整理思緒。',conviction:'leaning',references:[ref(pair)],contradictions:[],reason:'這次是我自己的體會，並非必然規則。'}],
 intents:[{id:'work-first',content:'先處理手上工作',intensity:'medium',importance:'high',urgency:'low',context:'雖然我喜歡休息'},{id:'rest-later',content:'等會兒再休息',intensity:'high',importance:'medium',urgency:'low',context:'仍由我選擇時機'}],
});}

test('one normal decision commits four kinds of subjective maintenance with autonomous intentions and exact operation replay',async()=>{
 const s=await setup();try{
  const pair=await performedPair(s);s.choose(()=>combined(pair));const operationId=`${Date.now()}:${crypto.randomUUID()}`;
  const response=await s.post({operation:'advance',operationId});assert.equal(response.status,200);const result=await response.json(),saved=await read(),c=actor(saved);
  assert.equal(c.preferences.items[0].version,1);assert.equal(c.eventHabits[0].observedDays.length,1);assert.equal(c.longTerm.filter(m=>m.origin.id===pair.action.id).length,1);assert.equal(c.cognition.beliefs[0].conviction,'leaning');assert.deepEqual(c.intents.map(i=>i.id),['work-first','rest-later']);
  assert.ok(saved.events.some(event=>event.actor==='owner'&&event.time===saved.minute&&event.text.includes('整理')));assert.equal(s.inputs.length,3);
  assert.deepEqual(await(await s.post({operation:'advance',operationId})).json(),result);assert.deepEqual(actor(await read()),c);assert.equal(s.inputs.length,3);
  s.choose(()=>action());await s.advance();const input=s.inputs.at(-1);assert.equal(input.self.preferences.items[0].id,'rest-choice');assert.equal(input.self.cognition.beliefs[0].id,'work-pace');assert.equal(input.learnedHabits.some(item=>item.tendency.includes('之後')),false,'one day is only a candidate');assert.equal(input.self.eventHabits,undefined);assert.equal(input.self.habitEvidence,undefined);assert.equal(input.self.preferences.trace,undefined);
 }finally{s.restore();}
});

test('a fifth combined operation or an invalid habit source rejects otherwise valid preference, memory, belief and intention updates atomically',async()=>{
 for(const fault of ['fifth','habit-source']){
  const s=await setup();try{
   const pair=await performedPair(s),before=await read();s.choose(()=>{const value=combined(pair);if(fault==='fifth')value.memorySelections.push({...pair.trigger,reason:'第五項超出共同工作量。'});else value.habitCandidates[0]={...pair,action:{id:'unexecuted-proposal',version:1}};return value;});
   const operationId=`${Date.now()}:${crypto.randomUUID()}`,response=await s.post({operation:'advance',operationId});assert.equal(response.status,502);const failure=await response.json(),after=await read();assert.deepEqual(after.characters,before.characters);assert.deepEqual(after.events,before.events);assert.equal(after.minute,before.minute);const calls=s.inputs.length;
   assert.deepEqual(await(await s.post({operation:'advance',operationId})).json(),failure);assert.equal(s.inputs.length,calls);
  }finally{s.restore();}
 }
});

test('later-character and persistence faults cannot leave half a combined subjective update',async()=>{
 for(const fault of ['later-character','save-before','save-after','cas']){
  const s=await setup();try{
   const pair=await performedPair(s);
   if(fault==='later-character'){const w=await read();w.characters.find(c=>c.id==='cass').control={mode:'autonomous'};store.replaceCommittedWorld(w);}
   const before=await read();s.choose(input=>input.self.id==='owner'?combined(pair):{...action(),preferenceUpdates:[{operation:'upsert',id:'invalid',version:0,topic:'無效',context:'',text:'無權引用別人的經驗',reason:'故障注入',references:[ref(pair)]}]});
   if(fault==='save-before')store.throwBeforeNextSave();if(fault==='save-after')store.throwAfterNextSave();if(fault==='cas')store.conflictOnNextSave();
   const operationId=`${Date.now()}:${crypto.randomUUID()}`,response=await s.post({operation:'advance',operationId}),result=await response.json(),after=await read();
   if(fault==='save-after'){assert.equal(response.status,200);assert.equal(actor(after).preferences.items[0].version,1);assert.equal(actor(after).eventHabits.length,1);assert.equal(actor(after).longTerm.length,1);assert.equal(actor(after).cognition.beliefs.length,1);}
   else {assert.notEqual(response.status,200);assert.deepEqual(after.characters,before.characters);assert.deepEqual(after.events,before.events);assert.equal(after.minute,before.minute);}
   const calls=s.inputs.length;await s.post({operation:'advance',operationId});assert.equal(s.inputs.length,calls);assert.deepEqual((await read()).characters,after.characters);
   if(fault==='later-character'){assert.equal(s.inputs.at(-2).self.id,'owner');assert.equal(s.inputs.at(-1).self.id,'cass');assert.equal(after.aiUsage.totalCalls,before.aiUsage.totalCalls+2);}
   if(fault==='save-after')assert.deepEqual(await(await s.post({operation:'advance',operationId})).json(),result);
  }finally{s.restore();}
 }
});

test('individually legal fields and operations still share a single 8 KiB combined output budget',async()=>{
 const w=seedWorld(),c=actor(w);c.memories=[];
 const id=(prefix,index)=>`${prefix}-${index}-`.padEnd(128,'x');
 c.shortTerm=Array.from({length:8},(_,i)=>({id:id('source',i),characterId:c.id,version:1,time:i,text:'可見的本人經驗',source:{kind:'experience'}}));
 c.cognition={beliefs:Array.from({length:8},(_,i)=>({id:id('old-belief',i),characterId:c.id,version:1,time:0,topic:`既有主題${i}`,text:'仍有疑問的既有看法',conviction:'doubtful',references:[],contradictions:[],reason:'本人理解'})),relationshipTags:[],trace:[]};
 const s=await setup(w);try{
  const pair=await performedPair(s);let items;
  s.choose(input=>{
   const references=input.self.shortTerm.filter(m=>m.id.startsWith('source-')).map(m=>({kind:'short',id:m.id,version:m.version}));assert.equal(references.length,8);
   const preference=i=>({operation:'upsert',id:id('preference',i),version:0,topic:`${i}`.padEnd(128,'t'),context:'c'.repeat(256),text:'p'.repeat(512),references,reason:'r'.repeat(256)});
   const belief={kind:'belief',operation:'upsert',id:id('new-belief',0),version:0,topic:'b'.repeat(128),text:'b'.repeat(512),conviction:'leaning',references,contradictions:input.self.cognition.beliefs.map(b=>b.id),reason:'r'.repeat(256)};
   items={preferenceUpdates:[preference(0),preference(1)],cognitiveUpdates:[belief],habitCandidates:[pair],memoryOperations:[],memorySelections:[],interpretation:''};
   // The first four decisions validate each complete operation separately.
   const index=s.inputs.length-3;
   if(index===0)return action({preferenceUpdates:[items.preferenceUpdates[0]]});
   if(index===1)return action({preferenceUpdates:[items.preferenceUpdates[1]]});
   if(index===2)return action({cognitiveUpdates:[items.cognitiveUpdates[0]]});
   if(index===3)return action({habitCandidates:[pair]});
   for(const preference of items.preferenceUpdates)preference.version=1;belief.version=1;
   assert.ok(Buffer.byteLength(JSON.stringify(items))>8192,'the violation is the combined bytes, not any single oversized field');
   return action(items);
  });
  for(let i=0;i<4;i++)await s.advance();const before=await read();
  const operationId=`${Date.now()}:${crypto.randomUUID()}`,response=await s.post({operation:'advance',operationId});assert.equal(response.status,502);const after=await read();assert.deepEqual(after.characters,before.characters);assert.deepEqual(after.events,before.events);assert.equal(after.minute,before.minute);
  const calls=s.inputs.length;await s.post({operation:'advance',operationId});assert.equal(s.inputs.length,calls);
 }finally{s.restore();}
});

test('actual D20 failure and critical failure can each be followed by subjective liking without leaking the result grade or adding a roll',async()=>{
 for(const [roll,outcome,status] of [[2,'failure','unfinished'],[1,'critical-failure','spoiled']]){
  const w=seedWorld();actor(w).abilityTags=[];const s=await setup(w),random=Math.random;let rolls=0;
  try{
   s.choose(()=>action({type:'work',target:'craft-challenge',content:'實作失敗後喜好'}));
   Math.random=()=>{rolls++;return(roll-.5)/20;};let saved=await s.advance();Math.random=random;
   const event=saved.events.findLast(e=>e.actor==='owner'&&e.resolution);assert.equal(event.resolution.outcome,outcome);assert.equal(event.resolution.roll,roll);assert.equal(actor(saved).projects.at(-1).status,status);assert.equal(rolls,1);
   s.choose(input=>{
    const experience=input.self.shortTerm.findLast(m=>m.text.includes('主題：'));assert.ok(experience,'the failed real attempt must reach the next subjective decision');
    assert.doesNotMatch(JSON.stringify(input),/critical-failure|"outcome"|"roll"|"dc"|"resolution"|D20/);
    return action({preferenceUpdates:[{operation:'upsert',id:'enjoy-design',version:0,topic:'髮飾設計',context:'嘗試構思時',text:'即使這次沒有做成，我仍喜歡構思樣式的過程。',references:[{kind:'short',id:experience.id,version:experience.version}],reason:'自己實際嘗試後，我仍想再學。'}]});
   });
   Math.random=()=>{throw Error('preference evaluation and ordinary rest must not add a roll');};saved=await s.advance();Math.random=random;
   assert.match(actor(saved).preferences.items[0].text,/仍喜歡/);assert.equal(saved.events.filter(e=>e.resolution&&e.actor==='owner').length,1);assert.equal(s.inputs.length,2);
  }finally{Math.random=random;s.restore();}
 }
});

test('the existing 88 KiB psychological input budget includes current preferences and both kinds of learned tendency',async()=>{
 const w=seedWorld();w.minute=4140;const c=actor(w);c.memories=[];
 c.shortTerm=Array.from({length:80},(_,i)=>({id:`recent-${i}`,characterId:c.id,version:1,time:i,text:'甲'.repeat(160),source:{kind:'experience'}}));
 c.longTerm=Array.from({length:58},(_,i)=>({id:`long-${i}`,characterId:c.id,version:1,time:i,text:'乙'.repeat(280),source:{kind:'experience'},origin:{id:`past-${i}`,version:1},reason:'重要'}));
 c.cognition={beliefs:Array.from({length:24},(_,i)=>({id:`belief-${i}`,characterId:c.id,version:1,time:0,topic:`主題${i}`,text:'丙'.repeat(125),conviction:'leaning',references:[],contradictions:[],reason:'仍在乎'})),relationshipTags:[],trace:[]};
 c.preferences={schemaVersion:1,items:Array.from({length:16},(_,i)=>({id:`preference-${i}`,characterId:c.id,version:1,time:0,topic:`喜好${i}`,context:'日常',text:'偏'.repeat(130),references:[{kind:'short',id:'recent-0',version:1}],reason:'主觀體會'})),trace:[],droppedTrace:0};
 c.habits=Array.from({length:4},(_,i)=>({key:`habit-${i}`,type:'rest',target:'',location:c.location,period:3,observedDays:[1,2,3],lastSeen:4140,activityKey:`fixture-${i}`,activityLabel:'傾'.repeat(64)}));
 c.habitEvidence=[{id:'prior-start',version:1,time:4140,location:c.location,activityKey:'trigger-method',activityLabel:'之前活動',memory:{id:'recent-0',version:1},started:true}];
 c.eventHabits=[{key:'event-example',triggerKey:'trigger-method',triggerLabel:'先'.repeat(64),activityKey:'rest',activityLabel:'後'.repeat(64),location:c.location,observedDays:[1,2,3],lastSeen:4140,proposedAt:4140,links:[]}];
 const s=await setup(w);try{
  const before=await read();await s.advance();const input=s.inputs[0];
  assert.ok(Buffer.byteLength(JSON.stringify(memoryPayload(input)))<=88*1024,'new psychological projections share the original input budget');
  const saved=actor(await read());assert.equal(saved.preferences.items.length,16);assert.equal(saved.longTerm.length,58);assert.equal(saved.cognition.beliefs.length,24);assert.ok(saved.habits.length>=before.characters.find(c=>c.id==='owner').habits.length);
  const committed=await read();s.choose(next=>{
   assert.ok(next.self.preferences.items.length<16,'pressure omits only this input view');
   const omitted=saved.preferences.items.find(item=>!next.self.preferences.items.some(shown=>shown.id===item.id));assert.ok(omitted);
   const source=next.self.shortTerm[0];
   return action({preferenceUpdates:[{operation:'keep',id:omitted.id,version:omitted.version,references:[{kind:'short',id:source.id,version:source.version}],reason:'不能修改未展示的喜好。'}]});
  });
  assert.equal((await s.post({operation:'advance'})).status,502);assert.deepEqual((await read()).characters,committed.characters);
 }finally{s.restore();}
});
