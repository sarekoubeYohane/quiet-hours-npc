/* eslint-disable @typescript-eslint/no-require-imports -- World API and model boundary fixtures. */
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const build=name=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,`${name}.cjs`));
const {seedWorld}=build('world');
const {GET,POST}=build('route');
const store=build('store');
const req=body=>new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid'},body:JSON.stringify({ operationId: `${Date.now()}:${crypto.randomUUID()}`,mode:'demo',...body})});
const read=async()=>(await (await GET()).json()).world;
const owner=w=>w.characters.find(c=>c.id==='owner');
const advance=()=>POST(req({operation:'advance',minutes:15,mode:'openai',model:'gpt-6-luna',limits:{calls:120,tokens:500000}}));
const act=async action=>{assert.equal((await POST(req({operation:'direct',action}))).status,200);assert.equal((await advance()).status,200);return read();};
const withModel=async(actions,run)=>{
 const old=global.fetch,inputs=[];
 global.fetch=async(_url,init)=>{const data=JSON.parse(JSON.parse(init.body).messages[1].content);inputs.push(data);return Response.json({choices:[{message:{content:JSON.stringify({type:'rest',target:'',content:'',mood:'',durationMinutes:15,intents:[],...actions[data.self.id]})}}]});};
 try{await POST(req({operation:'set-model-key',mode:'openai',key:'test-key'}));await run(inputs);}finally{global.fetch=old;}
};
const scene=()=>{
 const w=seedWorld();owner(w).region='cafe-storeroom';w.scene.doors['cafe-door']='closed';
 for(const id of ['vera','cass']){const c=w.characters.find(c=>c.id===id);c.location='cafe';c.region='cafe-front';}
 return w;
};
test('focused looking obtains current people, replaces work and consumes world time; targets share world validation',async()=>{
 const w=scene();owner(w).plan={action:{type:'work',target:'tidy'},startedAt:w.minute,until:w.minute+90,attention:'',modelKey:'openai:gpt-6-luna'};
 w.scene.doors['cafe-door']='open';store.install(w);await POST(req({operation:'takeover'}));
 await withModel({},async()=>{
  const before=await read();
  assert.equal((await POST(req({operation:'direct',action:{type:'observe',target:'vera-home-main',content:'sight'}}))).status,400);
  assert.equal((await POST(req({operation:'direct',action:{type:'observe',target:'invented-person',content:'sight'}}))).status,400);
  const saved=await act({type:'observe',target:'cafe-front',content:'sight'});
  assert.equal(saved.minute,before.minute+15);
  assert.equal(owner(saved).plan.action.type,'observe');
  assert.ok(owner(saved).observations.some(o=>o.sense==='sight'&&o.source==='vera'));
  const probe=saved.events.findLast(e=>e.actor==='owner'&&e.kind==='observe');
  assert.equal(probe.perception.find(t=>t.characterId==='owner').status,'direct');
 });
});
test('listening uses current ongoing sounds with focused attention, never replays vanished words',async()=>{
 const w=scene();store.install(w);await POST(req({operation:'takeover'}));
 const actions={vera:{type:'say',target:'cass',content:'VANISHED_SECRET'}};
 await withModel(actions,async(inputs)=>{
  assert.equal((await advance()).status,200);
  actions.vera={type:'work',target:'tidy',durationMinutes:90};
  const random=Math.random;Math.random=()=>0.475;
  try{
   const saved=await act({type:'observe',target:'cafe-front',content:'hearing'});
   const probe=saved.events.findLast(e=>e.actor==='owner'&&e.kind==='observe');
   const trace=probe.perception.find(t=>t.characterId==='owner');
   assert.equal(trace.resolution.modifier,2);
   assert.equal(trace.resolution.outcome,'success');
   assert.ok(trace.observations.some(o=>o.sense==='hearing'&&!o.source&&o.text.includes('動靜')));
   assert.equal(JSON.stringify(owner(saved)).includes('VANISHED_SECRET'),false);
   assert.ok(owner(saved).control.experiences.some(m=>m.text.includes('動靜')));
   await POST(req({operation:'return-control'}));
   actions.owner={type:'rest'};assert.equal((await advance()).status,200);
   const input=inputs.find(p=>p.self.id==='owner');
   assert.ok(input.self.observations.some(o=>o.sense==='hearing'));
   assert.equal(JSON.stringify(input).includes('VANISHED_SECRET'),false);
   assert.equal(JSON.stringify(input).includes('resolution'),false);
  }finally{Math.random=random;}
 });
});
test('same focused method, wording, prior conditions, continued activity and reload cannot farm perception dice',async()=>{
 const w=scene();w.scene.doors['cafe-door']='open';w.scene.occluded=['cafe-front'];store.install(w);await POST(req({operation:'takeover'}));
 const random=Math.random;let rolls=0;Math.random=()=>{rolls++;return 0.475;};
 try{await withModel({},async()=>{
  const first=await act({type:'observe',target:'cafe-front',content:'sight'});
  const trace=first.events.findLast(e=>e.actor==='owner'&&e.kind==='observe').perception[0];
  assert.equal(trace.resolution.modifier,2);assert.equal(rolls,1);
  const count=owner(first).observations.length;
  await advance();assert.equal(rolls,1);
  assert.deepEqual(owner(await read()).observations,owner(first).observations);
  await act({type:'observe',target:'cafe-front',content:'再仔細看一次'});
  assert.equal(rolls,1);assert.equal(owner(await read()).observations.length,count);
  await act({type:'door',target:'cafe-door',content:'close'});
  const closed=await act({type:'observe',target:'cafe-front',content:'sight'});
  assert.equal(rolls,1);assert.equal(closed.events.findLast(e=>e.actor==='owner'&&e.kind==='observe').perception[0].status,'no-opportunity');
  await act({type:'door',target:'cafe-door',content:'open'});
  await act({type:'observe',target:'cafe-front',content:'sight'});
  assert.equal(rolls,1);
  // Moving nearer is a genuinely different opportunity; coming back is not.
  await act({type:'move',target:'cafe-front'});
  await act({type:'observe',target:'cafe-front',content:'sight'});
  assert.equal(rolls,2);
  await act({type:'move',target:'cafe-storeroom'});
  await act({type:'observe',target:'cafe-front',content:'sight'});
  assert.equal(rolls,2);
 });}finally{Math.random=random;}
});
test('an anonymous arrival can be investigated, opening the door reveals current people, and a new arrival unlocks a fresh clue',async()=>{
 const w=scene();const vera=w.characters.find(c=>c.id==='vera');vera.location='vera-home';vera.region='vera-home-main';store.install(w);await POST(req({operation:'takeover'}));
 const actions={vera:{type:'move',target:'cafe'}};
 const random=Math.random;let rolls=0;Math.random=()=>{rolls++;return 0.475;};
 try{await withModel(actions,async()=>{
  assert.equal((await advance()).status,200);
  const heard=owner(await read()).observations.find(o=>o.kind==='sound');assert.ok(heard);assert.equal(heard.source,undefined);
  actions.vera={type:'rest'};
  const listened=await act({type:'observe',target:'cafe-front',content:'hearing'});
  assert.equal(listened.events.findLast(e=>e.actor==='owner'&&e.kind==='observe').perception[0].observations.length,0);
  assert.equal(rolls,0); // The earlier footsteps have stopped.
  const opened=await act({type:'door',target:'cafe-door',content:'open'});
  assert.ok(owner(opened).observations.some(o=>o.source==='vera'&&o.sense==='sight'));
  assert.ok(owner(opened).observations.some(o=>o.id===heard.id));
 });}finally{Math.random=random;}
 const hidden=scene();hidden.scene.doors['cafe-door']='open';hidden.scene.occluded=['cafe-front'];store.install(hidden);await POST(req({operation:'takeover'}));
 rolls=0;Math.random=()=>{rolls++;return 0.475;};
 const newActions={};
 try{await withModel(newActions,async()=>{
  await act({type:'observe',target:'cafe-front',content:'sight'});assert.equal(rolls,1);
  newActions.kris={type:'move',target:'cafe'};
  assert.equal((await advance()).status,200);
  newActions.kris={type:'rest'};
  const before=rolls, oldCount=owner(await read()).observations.length;
  const fresh=await act({type:'observe',target:'cafe-front',content:'sight'});
  assert.equal(rolls,before+1);
  assert.ok(owner(fresh).observations.length>oldCount);
  const probe=fresh.events.findLast(e=>e.actor==='owner'&&e.kind==='observe');
  assert.equal(probe.perception[0].resolution.modifier,2);
 });}finally{Math.random=random;}
});
test('active failure gives only generic no-harvest feedback while passive misses never choose investigation',async()=>{
 const w=scene();store.install(w);await POST(req({operation:'takeover'}));
 const random=Math.random;Math.random=()=>0.075;
 const actions={vera:{type:'say',target:'cass',content:'MISSED_PRIVATE_WORDS'}};
 try{await withModel(actions,async(inputs)=>{
  assert.equal((await advance()).status,200);
  const passive=await read();
  assert.equal(passive.events.find(e=>e.actor==='vera'&&e.kind==='say').perception.find(t=>t.characterId==='owner').status,'missed');
  assert.equal(passive.events.some(e=>e.actor==='owner'&&e.kind==='observe'),false);
  assert.equal(owner(passive).memories.some(m=>/沒聽|沒有.*線索|錯過/.test(m.text)),false);
  actions.vera={type:'work',target:'tidy',durationMinutes:90};
  const tried=await act({type:'observe',target:'cafe-front',content:'hearing'});
  assert.equal(tried.events.findLast(e=>e.actor==='owner'&&e.kind==='observe').perception[0].status,'missed');
  assert.ok(owner(tried).memories.some(m=>m.text==='專注聆聽後，沒有聽到新的線索。'));
  assert.equal(JSON.stringify(owner(tried)).includes('MISSED_PRIVATE_WORDS'),false);
  await POST(req({operation:'return-control'}));actions.owner={type:'rest'};
  assert.equal((await advance()).status,200);
  const input=inputs.find(p=>p.self.id==='owner');
  assert.equal(JSON.stringify(input).includes('MISSED_PRIVATE_WORDS'),false);
  assert.equal(JSON.stringify(input).includes('perceptionTrials'),false);
  assert.equal(JSON.stringify(input).includes('missed'),false);
 });}finally{Math.random=random;}
});
test('probe observations and dice receipts roll back with model failure and conflicting final save',async()=>{
 const w=scene();w.turn=3;w.scene.doors['cafe-door']='open';w.scene.occluded=['cafe-front'];store.install(w);await POST(req({operation:'takeover'}));
 const random=Math.random;Math.random=()=>0.475;
 try{
  const action={type:'observe',target:'cafe-front',content:'sight'};
  assert.equal((await POST(req({operation:'direct',action}))).status,200);
  const before=await read(), old=global.fetch;
  global.fetch=async()=>{throw Error('provider down');};
  try{await POST(req({operation:'set-model-key',mode:'openai',key:'test-key'}));assert.equal((await advance()).status,502);}finally{global.fetch=old;}
  const failed=await read();
  assert.equal(failed.minute,before.minute);assert.deepEqual(failed.characters,before.characters);
  assert.deepEqual(failed.perceptionTrials,before.perceptionTrials);assert.deepEqual(failed.probeResults,before.probeResults);
  await withModel({},async()=>{
   store.conflictOnNextSave();assert.equal((await advance()).status,502);
   const conflicted=await read();assert.deepEqual(conflicted.characters,before.characters);
   assert.deepEqual(conflicted.perceptionTrials,before.perceptionTrials);assert.deepEqual(conflicted.probeResults,before.probeResults);
   const saved=await advance();assert.equal(saved.status,200);
   assert.ok(owner(await read()).observations.length>owner(before).observations.length);
   assert.equal((await read()).aiUsage.totalCalls,7); // 1 failed call + 3 paid calls on conflict + 3 on retry; no perception calls.
  });
 }finally{Math.random=random;}
});
