/* eslint-disable @typescript-eslint/no-require-imports -- API fixtures. */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const build=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
const {seedWorld}=build('world'),{GET,POST}=build('route'),store=build('store');
const read=async()=>(await(await GET()).json()).world;
const req=body=>new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid'},body:JSON.stringify({operationId:`${Date.now()}:${crypto.randomUUID()}`,mode:'demo',...body})});
const worldWithAdjudication = require('./fixtures/ai-world.cjs')(seedWorld);

test('legacy subjective experiences share bounded storage and stable identity without replay or inference',async()=>{
 const w=worldWithAdjudication(),c=w.characters[0];delete c.shortTerm;delete c.longTerm;
 c.memories=[{time:1,text:'相同文字'},{time:1,text:'相同文字'}];c.observations=Array.from({length:85},(_,i)=>({id:`o${i}`,time:i+2,sense:'hearing',kind:'sound',text:`聲音${i}`,clarity:'vague'}));c.observationCursor=10;
 store.install(w);const a=await read(),b=await read(),saved=a.characters[0];
 assert.equal(saved.shortTerm.length,80);assert.equal(saved.observations.length,80);assert.equal(saved.observationCursor,5);assert.deepEqual(saved.shortTerm,b.characters[0].shortTerm);assert.deepEqual(a.events,w.events);assert.deepEqual(saved.longTerm,[]);
 const old=worldWithAdjudication();delete old.characters[0].shortTerm;delete old.characters[0].longTerm;old.characters[0].memories=c.memories;store.install(old);
 const legacy=(await read()).characters[0].shortTerm;assert.equal(legacy.length,2);assert.notEqual(legacy[0].id,legacy[1].id);assert.equal(legacy[0].source.kind,'legacy-unclassified');
});
async function withModel(run,choose=()=>({})){const old=global.fetch,inputs=[];global.fetch=async(_,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);inputs.push(input);return Response.json({usage:{prompt_tokens:10,completion_tokens:5},choices:[{message:{content:JSON.stringify({type:'rest',target:'',content:'',mood:'',durationMinutes:90,intents:[],attentionConditions:[],memorySelections:[],...choose(input)})}}]});};try{await POST(req({operation:'set-model-key',mode:'openai',key:'test-key'}));await run(inputs,body=>POST(req({operation:'advance',mode:'openai',model:'gpt-6-luna',minutes:15,limits:{calls:120,tokens:500000},...body})));}finally{global.fetch=old;}}
test('one decision selects subjective memory with stable versions and operation replay without extra calls',async()=>{
 const w=worldWithAdjudication();store.install(w);
 await withModel(async(inputs,advance)=>{
 const operationId=`${Date.now()}:${crypto.randomUUID()}`,response=await advance({operationId});assert.equal(response.status,200);const result=await response.json();
 const saved=await read();for(const c of saved.characters){assert.equal(c.longTerm.length,1);assert.equal(c.longTerm[0].version,1);assert.equal(c.longTerm[0].characterId,c.id);assert.equal(c.longTerm[0].source.kind,'legacy-unclassified');}
 assert.equal(inputs.length,4);assert.deepEqual(await(await advance({operationId})).json(),result);assert.equal(inputs.length,4);assert.deepEqual((await read()).characters.map(c=>c.longTerm),saved.characters.map(c=>c.longTerm));
 },input=>({memorySelections:[{id:input.self.shortTerm[0].id,version:1,reason:'這對我很重要。'}]}));
});
test('existing legal 500-character Chinese experiences remain complete through selection and reload',async()=>{
 const w=worldWithAdjudication(),c=w.characters[0];delete c.shortTerm;c.memories=[{time:1,text:'Cass 心想：「'+'界'.repeat(500)+'」'}];store.install(w);
 assert.equal((await GET()).status,200);await withModel(async(_inputs,advance)=>{assert.equal((await advance()).status,200);const after=await read();assert.equal(after.characters[0].longTerm[0].text,c.memories[0].text);assert.ok(after.characters[0].shortTerm.some(m=>m.text.includes('文'.repeat(500))));},input=>({type:'reflect',content:'文'.repeat(500),durationMinutes:15,memorySelections:[{id:input.self.shortTerm[0].id,version:1,reason:'重要'}]}));
});
test('invalid selections restore all NPC memories and retain paid usage; failed operation replays',async()=>{
 for(const invalid of ['foreign','version','count','reason','unknown-field']){
  store.install(worldWithAdjudication());const before=await read();let selected=0;
  await withModel(async(inputs,advance)=>{const operationId=`${Date.now()}:${crypto.randomUUID()}`;const response=await advance({operationId});assert.equal(response.status,502);const failure=await response.json();const saved=await read();assert.deepEqual(saved.characters,before.characters);assert.deepEqual(saved.events,before.events);assert.equal(saved.aiUsage.totalCalls,2);assert.equal(saved.aiUsage.totalInputTokens,20);assert.deepEqual(await(await advance({operationId})).json(),failure);assert.equal(inputs.length,2);},input=>{
   const item={id:input.self.shortTerm[0].id,version:1,reason:'值得記住'};if(selected++===0)return {memorySelections:[item]};
   if(invalid==='foreign')item.id=before.characters[0].shortTerm[0].id;if(invalid==='version')item.version=999;if(invalid==='reason')item.reason='界'.repeat(86);if(invalid==='unknown-field')item.source='secret-person';return {memorySelections:invalid==='count'?Array(5).fill(item):[item]};
  });
 }
});
test('long-term hard capacity never evicts older memories to accept new selections',async()=>{
 const w=worldWithAdjudication(),c=w.characters[0];c.longTerm=Array.from({length:64},(_,i)=>({id:`retained-${i}`,characterId:c.id,version:1,time:i,text:`重要回憶${i}`,source:{kind:'experience'},origin:{id:`past-${i}`,version:1},reason:'重要'}));store.install(w);
 await withModel(async(_inputs,advance)=>{assert.equal((await advance()).status,502);assert.deepEqual((await read()).characters[0].longTerm,c.longTerm);},input=>({memorySelections:[{id:input.self.shortTerm[0].id,version:1,reason:'重要'}]}));
});
test('memory input stays within 88 KiB while omitted long-term entries remain stored',async()=>{
 const w=worldWithAdjudication(),c=w.characters[0];c.memories=[];c.shortTerm=Array.from({length:80},(_,i)=>({id:`recent-${i}`,characterId:c.id,version:1,time:i,text:'甲'.repeat(160),source:{kind:'experience'}}));c.longTerm=Array.from({length:58},(_,i)=>({id:`long-${i}`,characterId:c.id,version:1,time:i,text:'乙'.repeat(280),source:{kind:'experience'},origin:{id:`past-${i}`,version:1},reason:'重要'}));store.install(w);
 await withModel(async(inputs,advance)=>{assert.equal((await advance()).status,200);const input=inputs[0];const memory={shortTerm:input.self.shortTerm,longTerm:input.self.longTerm,memories:input.self.memories,observations:input.self.observations,relationships:input.self.relationships,knownControlExperiences:input.knownControlExperiences,pendingInterventions:input.pendingInterventions};assert.ok(Buffer.byteLength(JSON.stringify(memory))<=88*1024);assert.equal(input.self.shortTerm.length,80);assert.ok(input.self.longTerm.length<58);assert.equal((await read()).characters[0].longTerm.length,58);});
});
test('UTF-8 long-term collection and total memory state limits reject oversized saved candidates without truncation',async()=>{
 const w=worldWithAdjudication(),c=w.characters[0];c.longTerm=Array.from({length:64},(_,i)=>({id:`long-${i}`,characterId:c.id,version:1,time:i,text:'界'.repeat(340),source:{kind:'experience'},origin:{id:`old-${i}`,version:1},reason:'重要'}));store.install(w);assert.equal((await GET()).status,503);
});
test('short-term metadata bytes also trigger FIFO and retain pending observations',async()=>{
 const w=worldWithAdjudication(),c=w.characters[0];delete c.shortTerm;c.memories=[];c.observations=Array.from({length:80},(_,i)=>({id:`observation-${i}`,time:i,sense:'hearing',kind:'speech',text:'甲'.repeat(165),clarity:'vague',source:'vera',region:'kris-home-main'}));c.observationCursor=1;store.install(w);const saved=(await read()).characters[0];assert.ok(saved.shortTerm.length<80);assert.ok(Buffer.byteLength(JSON.stringify(saved.shortTerm))<=65536);assert.equal(saved.observationCursor,0);assert.equal(saved.observations.at(-1).id,'observation-79');assert.equal(saved.shortTerm.at(-1).text,'甲'.repeat(165));
});
test('legacy projections with explicit same identity link once, while unrelated equal text remains distinct',async()=>{
 const w=worldWithAdjudication(),c=w.characters[0];delete c.shortTerm;c.memories=[{id:'known-id',time:1,text:'聽到聲音'},{time:1,text:'聽到聲音'}];c.observations=[{id:'known-id',time:1,text:'聽到聲音',sense:'hearing',kind:'sound',clarity:'vague'}];c.control={mode:'taken-over',experiences:[{id:'known-id',time:1,text:'聽到聲音'}]};store.install(w);const saved=(await read()).characters[0];assert.equal(saved.shortTerm.length,2);assert.equal(saved.shortTerm.find(m=>m.id==='known-id').source.kind,'observation');assert.equal(saved.control.experiences.length,1);
});
test('abnormally oversized legacy text reports a concrete compatibility error without truncation',async()=>{
 const w=worldWithAdjudication(),c=w.characters[0];delete c.shortTerm;c.memories=[{time:1,text:'界'.repeat(1400)}];store.install(w);const response=await GET();assert.equal(response.status,503);assert.match((await response.json()).error,/4096 bytes/);
});
test('two NPCs retain different subjective clues including anonymous false perception without objective secrets',async()=>{
 const w=worldWithAdjudication(),owner=w.characters.find(c=>c.id==='owner');owner.region='cafe-storeroom';owner.control={mode:'taken-over'};w.scene.doors['cafe-door']='closed';for(const id of ['vera','cass']){const c=w.characters.find(c=>c.id===id);c.location='cafe';c.region='cafe-front';}store.install(w);const random=Math.random;let draws=0;Math.random=()=>draws++===0?0:0.65;let speak=true;
 try{await withModel(async(inputs,advance)=>{assert.equal((await advance()).status,200);const first=await read();assert.ok(first.characters.find(c=>c.id==='owner').shortTerm.some(m=>m.text==='似乎聽見有人喊「店主」。'));speak=false;await POST(req({operation:'return-control'}));Math.random=()=>0.95;assert.equal((await advance()).status,200);const saved=await read(),memory=saved.characters.find(c=>c.id==='owner').longTerm[0];assert.equal(memory.text,'似乎聽見有人喊「店主」。');assert.equal(memory.source.person,undefined);assert.ok(saved.characters.find(c=>c.id==='cass').longTerm.some(m=>m.text.includes('PRIVATE_SPEECH')));const ownerInput=inputs.find(i=>i.self.id==='owner');for(const secret of ['PRIVATE_SPEECH','falsePerception','critical-failure','templateId','objectiveClues','opportunity'])assert.equal(JSON.stringify(ownerInput).includes(secret),false);assert.equal(saved.events.some(e=>e.text.includes('有人喊')),false);
 },input=>input.self.id==='vera'&&speak?{type:'say',target:'cass',content:'PRIVATE_SPEECH',durationMinutes:15}:['cass','owner'].includes(input.self.id)&&input.self.shortTerm.some(m=>m.source.kind==='observation')?{memorySelections:[{id:input.self.shortTerm.find(m=>m.source.kind==='observation').id,version:1,reason:'我想記住'}]}:{});}finally{Math.random=random;}
});
test('long takeover shares FIFO capacity, cannot retrieve evicted intervention, and selects only after return',async()=>{
 store.install(worldWithAdjudication());await POST(req({operation:'takeover'}));const old=global.fetch;let calls=0;global.fetch=async()=>{calls++;throw Error('no model during takeover');};try{for(let i=0;i<85;i++)assert.equal((await POST(req({operation:'intervene',target:'owner',text:`接管經歷${i}`}))).status,200);assert.equal(calls,0);}finally{global.fetch=old;}
 const saved=await read(),owner=saved.characters.find(c=>c.id==='owner');assert.equal(owner.shortTerm.length,80);assert.equal(owner.control.experiences.length,80);assert.equal(owner.longTerm.length,0);assert.equal(owner.shortTerm[0].text,'觀察者對 店主 說：「接管經歷5」');
 await POST(req({operation:'return-control'}));await withModel(async(inputs,advance)=>{assert.equal((await advance()).status,200);const input=inputs.find(i=>i.self.id==='owner');assert.equal(input.pendingInterventions.length,80);assert.equal(JSON.stringify(input).includes('「接管經歷0」'),false);const after=(await read()).characters.find(c=>c.id==='owner');assert.equal(after.longTerm.length,1);assert.equal(after.control.experiences,undefined);},input=>input.self.id==='owner'?{memorySelections:[{id:input.self.shortTerm.at(-1).id,version:1,reason:'交還後才選留'}]}:{});
});
test('large legal takeover text stays bounded in both storage and decision input without pausing',async()=>{
 store.install(worldWithAdjudication());await POST(req({operation:'takeover'}));for(let i=0;i<80;i++)assert.equal((await POST(req({operation:'intervene',target:'owner',text:`${i} `+'界'.repeat(490)}))).status,200);
 const c=(await read()).characters.find(c=>c.id==='owner');assert.ok(c.shortTerm.length<80);assert.ok(Buffer.byteLength(JSON.stringify({shortTerm:c.shortTerm,memories:c.memories,observations:c.observations,controlExperiences:c.control.experiences,longTerm:c.longTerm,relationships:c.relationships}))<=208*1024);
 await POST(req({operation:'return-control'}));await withModel(async(inputs,advance)=>{assert.equal((await advance()).status,200);const input=inputs.find(i=>i.self.id==='owner');assert.equal(input.self.shortTerm.at(-1).text,`觀察者對 店主 說：「79 ${'界'.repeat(490)}」`);});
});
test('selected memory cannot partially commit across model failure, CAS conflict, or uncertain save replay',async()=>{
 for(const mode of ['conflict','after-save']){store.install(worldWithAdjudication());const before=await read();await withModel(async(inputs,advance)=>{const operationId=`${Date.now()}:${crypto.randomUUID()}`;if(mode==='conflict')store.conflictOnNextSave();else store.throwAfterNextSave();const first=await advance({operationId});const saved=await read();if(mode==='conflict'){assert.equal(first.status,502);assert.deepEqual(saved.characters,before.characters);assert.equal(saved.aiUsage.totalCalls,4);}else{const replay=await advance({operationId});assert.equal(replay.status,200);assert.equal(inputs.length,4);assert.ok(saved.characters.every(c=>c.longTerm.length===1));}},input=>({memorySelections:[{id:input.self.shortTerm[0].id,version:1,reason:'重要'}]}));}
});
test('aggregate memory pressure trims only short-term FIFO while all long-term memories survive takeover',async()=>{
 const w=worldWithAdjudication(),c=w.characters.find(c=>c.id==='owner');c.longTerm=Array.from({length:55},(_,i)=>({id:`long-${i}`,characterId:c.id,version:1,time:i,text:'乙'.repeat(300),source:{kind:'experience'},origin:{id:`past-${i}`,version:1},reason:'重要'}));store.install(w);await POST(req({operation:'takeover'}));for(let i=0;i<45;i++)assert.equal((await POST(req({operation:'intervene',target:'owner',text:`${i} `+'界'.repeat(490)}))).status,200);const saved=(await read()).characters.find(c=>c.id==='owner');assert.deepEqual(saved.longTerm,c.longTerm);assert.equal(saved.shortTerm.at(-1).text,`觀察者對 店主 說：「44 ${'界'.repeat(490)}」`);
});
test('invalid legacy text is rejected before FIFO can hide it, even when older than the retained window',async()=>{
 for (const count of [1,90]) {
  const w=worldWithAdjudication(),c=w.characters[0];delete c.shortTerm;c.memories=Array.from({length:count},(_,i)=>({time:i,text:i===0?'界'.repeat(23000):`近期${i}`}));store.install(w);
  const response=await GET();assert.equal(response.status,503);assert.match((await response.json()).error,/4096 bytes/);
 }
});
test('repeated persuasion keeps observer dice diagnostics out of subjective memory without editing spoken words',async()=>{
 const w=worldWithAdjudication();for(const c of w.characters){c.location='cafe';c.region='cafe-front';}store.install(w);const random=Math.random;let draws=0,select=false;Math.random=()=>{draws++;return .5;};
 try{await withModel(async(inputs,advance)=>{
  assert.equal((await advance()).status,200);assert.equal((await advance()).status,200);assert.equal(draws,1);const saved=await read(),vera=saved.characters.find(c=>c.id==='vera');assert.ok(saved.events.some(e=>e.actor==='vera'&&e.text.includes('不會重新擲骰')));
  const repeated=vera.shortTerm.find(m=>m.text.includes('又對 Cass'));assert.ok(repeated);assert.ok(repeated.text.includes('我喜歡擲骰遊戲'));assert.equal(repeated.text.includes('客觀條件未變'),false);assert.equal(repeated.text.includes('不會重新擲骰'),false);
  select=true;assert.equal((await advance()).status,200);const input=inputs.findLast(i=>i.self.id==='vera');assert.equal(JSON.stringify(input).includes('不會重新擲骰'),false);const memory=(await read()).characters.find(c=>c.id==='vera').longTerm[0];assert.equal(memory.text,repeated.text);assert.equal(draws,1);
 },input=>input.self.id==='vera'&&!select?{type:'persuade',target:'cass',content:'我喜歡擲骰遊戲',mood:input.self.mood,durationMinutes:15}:input.self.id==='vera'?{mood:input.self.mood,memorySelections:[{id:input.self.shortTerm.find(m=>m.text.includes('又對 Cass')).id,version:1,reason:'想記住這段交流'}]}:{mood:input.self.mood});}finally{Math.random=random;}
});
