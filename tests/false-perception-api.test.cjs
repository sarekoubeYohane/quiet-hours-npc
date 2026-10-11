/* eslint-disable @typescript-eslint/no-require-imports -- API fixtures. */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const build=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
const {seedWorld}=build('world'),{GET,POST}=build('route'),store=build('store');
const req=body=>new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid'},body:JSON.stringify({mode:'demo',...body})});
const read=async()=>(await(await GET()).json()).world;
const owner=w=>w.characters.find(c=>c.id==='owner');
function setup(){const w=seedWorld();owner(w).region='cafe-storeroom';owner(w).control={mode:'taken-over'};w.scene.doors['cafe-door']='closed';for(const id of ['vera','cass']){const c=w.characters.find(c=>c.id===id);c.location='cafe';c.region='cafe-front';}return w;}
async function model(run,action=()=>({})){const old=global.fetch,inputs=[];global.fetch=async(_,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content);inputs.push(input);return Response.json({choices:[{message:{content:JSON.stringify({type:'rest',target:'',content:'',mood:'',durationMinutes:90,intents:[],attentionConditions:[],...action(input)})}}]});};try{await POST(req({operation:'set-model-key',mode:'openai',key:'test-key'}));await run(inputs,()=>POST(req({operation:'advance',mode:'openai',model:'gpt-6-luna',minutes:15,limits:{calls:120,tokens:500000}})));}finally{global.fetch=old;}}
test('critical failure saves a subjective distortion without copying private speech, and return preserves it without observer diagnostics',async()=>{
 const w=setup();store.install(w);const random=Math.random;Math.random=()=>0;
 try{await model(async(inputs,advance)=>{
  assert.equal((await advance()).status,200);const saved=await read(),trace=saved.events.find(e=>e.actor==='vera'&&e.kind==='say').perception.find(t=>t.characterId==='owner');
  assert.equal(trace.resolution.outcome,'critical-failure');assert.equal(trace.falsePerception.type,'distortion');assert.equal(trace.observations.length,1);
  assert.equal(owner(saved).observations[0].text,'似乎聽見 Cass 在附近說話。');assert.equal(owner(saved).observations[0].source,'cass');
  assert.equal(JSON.stringify(owner(saved)).includes('PRIVATE_SECRET'),false);assert.ok(owner(saved).control.experiences.some(e=>e.text==='似乎聽見 Cass 在附近說話。'));
  Math.random=()=>{throw Error('reload must not draw');};assert.deepEqual(owner(await read()).observations,owner(saved).observations);
  assert.deepEqual((await read()).events,saved.events);assert.equal(saved.characters.length,w.characters.length);
  assert.equal((await POST(req({operation:'return-control'}))).status,200);Math.random=()=>0.95;assert.equal((await advance()).status,200);
  const input=inputs.find(i=>i.self.id==='owner'),text=JSON.stringify(input);
  assert.ok(input.self.observations.some(o=>o.text==='似乎聽見 Cass 在附近說話。'));
  for(const secret of ['PRIVATE_SECRET','falsePerception','critical-failure','templateId','objectiveClues','opportunity'])assert.equal(text.includes(secret),false);
 },i=>i.self.id==='vera'?{type:'say',target:'cass',content:'PRIVATE_SECRET',durationMinutes:15}:{});}finally{Math.random=random;}
});

test('an imagined call creates no real stimulus, and a late direct subjective clue waits until the next decision',async()=>{
 const w=setup();owner(w).control={mode:'autonomous'};w.turn=3;store.install(w);
 const random=Math.random;let draws=0;Math.random=()=>draws++===0?0:0.65;let speak=true;
 try{await model(async(inputs,advance)=>{
  assert.equal((await advance()).status,200);let saved=await read();const trace=saved.events.find(e=>e.actor==='vera'&&e.kind==='say').perception.find(t=>t.characterId==='owner');
  assert.equal(trace.falsePerception.type,'no-stimulus');assert.equal(trace.observations[0].text,'似乎聽見有人喊「店主」。');assert.equal(trace.observations[0].source,undefined);
  assert.equal(inputs.filter(i=>i.self.id==='owner').length,1);assert.equal(owner(saved).observationCursor,0);
  assert.equal(saved.events.some(e=>e.text.includes('有人喊')),false);assert.equal(saved.characters.length,4);
  const savedTrace=trace;speak=false;Math.random=()=>{throw Error('the old clue must not be drawn again');};inputs.length=0;
  assert.equal((await advance()).status,200);saved=await read();assert.equal(inputs.filter(i=>i.self.id==='owner').length,1);
  const input=inputs.find(i=>i.self.id==='owner');assert.ok(input.self.observations.some(o=>o.text==='似乎聽見有人喊「店主」。'));
  assert.equal(owner(saved).plan.action.type,'rest');assert.equal(owner(saved).plan.until,w.minute+90);
  assert.ok(owner(saved).attentionDiagnostics.some(d=>d.reason==='直接互動'));assert.deepEqual(saved.events.find(e=>e.actor==='vera'&&e.kind==='say').perception.find(t=>t.characterId==='owner'),savedTrace);
 },i=>i.self.id==='vera'&&speak?{type:'say',target:'cass',content:'PRIVATE_SECRET',durationMinutes:15}:i.self.id==='owner'&&i.currentActivity?{type:'continue'}:{});}finally{Math.random=random;}
});

test('expressed expectations weight related identities 3 to 1 while other known identities stay possible',async()=>{
 for(const [sample,source,weight] of [[0.2,'vera',3],[0.6,'kris',1]]){
  const w=setup();owner(w).attentionConditions=[{kind:'speech',source:'vera',region:'cafe-storeroom'}];store.install(w);
  const random=Math.random;let calls=0;Math.random=()=>calls++===0?0:sample;
  try{await model(async(_inputs,advance)=>{
   assert.equal((await advance()).status,200);const trace=(await read()).events.find(e=>e.actor==='cass'&&e.kind==='say').perception.find(t=>t.characterId==='owner');
   assert.equal(trace.observations[0].source,source);assert.equal(trace.falsePerception.selectedWeight,weight);assert.equal(trace.falsePerception.totalWeight,7);
   assert.equal(trace.falsePerception.draw,sample);assert.equal(calls,2);
  },i=>i.self.id==='cass'?{type:'say',target:'vera',content:'SECRET_ACTUAL_WORDS',durationMinutes:15}:{});}finally{Math.random=random;}
 }
});
test('an incompatible template produces no new clue or draw, and direct footsteps survive another sense critical failure',async()=>{
 const rules=build('false-perception').falsePerceptionRules,templates=rules.templates;
 rules.templates=[{id:'unavailable-door',type:'distortion',sense:'sight',clueKinds:['door'],kind:'door',text:'門似乎晃了一下。'}];
 const w=seedWorld();owner(w).control={mode:'taken-over'};w.scene.occluded=['cafe-front'];store.install(w);
 const random=Math.random;let draws=0;Math.random=()=>{draws++;return 0;};
 try{await model(async(_inputs,advance)=>{
  assert.equal((await advance()).status,200);const saved=await read(),trace=saved.events.find(e=>e.actor==='vera'&&e.kind==='move').perception.find(t=>t.characterId==='owner');
  assert.equal(trace.resolution.outcome,'critical-failure');assert.equal(trace.falsePerception,undefined);assert.equal(draws,1);
  assert.deepEqual(trace.observations.map(o=>o.text),['附近傳來腳步聲。']);
 },i=>i.self.id==='vera'?{type:'move',target:'cafe',durationMinutes:15}:{});}finally{Math.random=random;rules.templates=templates;}
});
test('false perception and consumption roll back together on model failure or save conflict',async()=>{
 for(const fail of ['model','conflict']){
  const w=setup();store.install(w);const random=Math.random;Math.random=()=>0;
  try{await model(async(_inputs,advance)=>{
   if(fail==='conflict')store.conflictOnNextSave();
   assert.equal((await advance()).status,502);const saved=await read();assert.deepEqual(saved.events,w.events);assert.deepEqual(saved.characters,w.characters);assert.equal(saved.turn,w.turn);assert.ok(saved.aiUsage.totalCalls>0);
  },i=>i.self.id==='vera'?{type:'say',target:'cass',content:'SECRET',durationMinutes:15}:i.self.id==='kris'&&fail==='model'?{attentionConditions:'invalid'}:{});}finally{Math.random=random;}
 }
});

test('only a matching subjective false identity interrupts an ongoing activity, and the NPC may continue',async()=>{
 for(const [sample,expectedCalls] of [[0.2,1],[0.6,0]]){
  const w=setup();owner(w).control={mode:'autonomous'};owner(w).attentionConditions=[{kind:'speech',source:'vera',region:''}];owner(w).plan={action:{type:'rest'},startedAt:w.minute,until:w.minute+90,attention:'',modelKey:'openai:gpt-6-luna'};store.install(w);
  const random=Math.random;let draws=0;Math.random=()=>draws++===0?0:sample;
  try{await model(async(inputs,advance)=>{
   assert.equal((await advance()).status,200);const saved=await read();assert.equal(inputs.filter(i=>i.self.id==='owner').length,expectedCalls);
   assert.equal(owner(saved).plan.startedAt,w.minute);assert.equal(owner(saved).plan.until,w.minute+90);
   if(expectedCalls){assert.ok(inputs.find(i=>i.self.id==='owner').self.observations.some(o=>o.source==='vera'));assert.ok(owner(saved).attentionDiagnostics.some(d=>d.reason==='符合關注條件'));}
   else assert.ok(owner(saved).observations.some(o=>o.source==='kris'));
  },i=>i.self.id==='vera'?{type:'say',target:'cass',content:'SECRET',durationMinutes:15}:i.self.id==='owner'?{type:'continue',attentionConditions:[{kind:'speech',source:'vera',region:''}]}:{});}finally{Math.random=random;}
 }
});
test('no applicable templates leave a saved critical failure with no subjective clue',async()=>{
 const rules=build('false-perception').falsePerceptionRules,templates=rules.templates;rules.templates=[];
 const w=setup();store.install(w);const random=Math.random;let draws=0;Math.random=()=>{draws++;return 0;};
 try{await model(async(_inputs,advance)=>{
  assert.equal((await advance()).status,200);const saved=await read(),trace=saved.events.find(e=>e.actor==='vera'&&e.kind==='say').perception.find(t=>t.characterId==='owner');
  assert.equal(trace.resolution.outcome,'critical-failure');assert.equal(trace.status,'missed');assert.equal(trace.falsePerception,undefined);assert.deepEqual(owner(saved).observations,[]);assert.equal(draws,1);
 },i=>i.self.id==='vera'?{type:'say',target:'cass',content:'SECRET',durationMinutes:15}:{});}finally{Math.random=random;rules.templates=templates;}
});

test('active probes save both false-perception classes and reuse diagnostics after reload and identical retries without drawing',async()=>{
 for(const [sense,type,text] of [['sight','distortion','遮擋處的人影似乎是 Cass。'],['hearing','no-stimulus','似乎聽見有人喊「店主」。']]){
  const w=setup();if(sense==='sight'){w.scene.doors['cafe-door']='open';w.scene.occluded=['cafe-front'];owner(w).abilityTags=['視力很弱'];}else w.scene.noise['cafe-storeroom']='loud';store.install(w);
  const random=Math.random;let draws=0;Math.random=()=>{draws++;return 0;};
  try{await model(async(inputs,advance)=>{
   assert.equal((await advance()).status,200);
   assert.equal((await POST(req({operation:'direct',action:{type:'observe',target:'cafe-front',content:sense}}))).status,200);
   assert.equal((await advance()).status,200);const saved=await read(),trace=saved.events.findLast(e=>e.actor==='owner'&&e.kind==='observe').perception[0];
   assert.equal(trace.resolution.outcome,'critical-failure');assert.equal(trace.falsePerception.type,type);assert.equal(trace.falsePerception.subjectiveText,text);assert.equal(trace.observations[0].text,text);assert.equal(draws,2);
   Math.random=()=>{throw Error('saved probe may not reroll or reselect');};assert.deepEqual(owner(await read()).observations,owner(saved).observations);
   assert.equal((await POST(req({operation:'direct',action:{type:'observe',target:'cafe-front',content:sense}}))).status,200);assert.equal((await advance()).status,200);
   let reloaded=await read();const repeated=reloaded.events.findLast(e=>e.actor==='owner'&&e.kind==='observe').perception[0];assert.deepEqual(repeated.falsePerception,trace.falsePerception);assert.deepEqual(owner(reloaded).observations,owner(saved).observations);
   assert.equal((await POST(req({operation:'return-control'}))).status,200);assert.equal((await advance()).status,200);reloaded=await read();
   const input=inputs.find(i=>i.self.id==='owner');assert.ok(input.self.observations.some(o=>o.text===text));
   for(const secret of ['falsePerception','templateId','objectiveClues','critical-failure','probeResults','perceptionTrials'])assert.equal(JSON.stringify(input).includes(secret),false);
   assert.equal(reloaded.characters.length,4);
  },i=>sense==='hearing'&&i.self.id==='vera'?{type:'work',target:'tidy',durationMinutes:90}:{});}finally{Math.random=random;}
 }
});
