/* eslint-disable @typescript-eslint/no-require-imports -- API fixtures. */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const build=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
const {seedWorld}=build('world'),{GET,POST}=build('route'),store=build('store');
const req=body=>new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid'},body:JSON.stringify(body)});
const read=async()=>(await(await GET()).json()).world;
async function model(run,actions){const old=global.fetch,inputs=[];global.fetch=async(_,init)=>{const request=JSON.parse(init.body),input=JSON.parse(request.messages[1].content);inputs.push(input);return Response.json({choices:[{message:{content:JSON.stringify({type:'rest',target:'',content:'',mood:'',durationMinutes:90,intents:[],attentionConditions:[],...actions(input,request)})}}]});};try{await POST(req({operation:'set-model-key',mode:'openai',key:'test-key'}));await run(inputs,()=>POST(req({operation:'advance',mode:'openai',model:'gpt-6-luna',minutes:15,limits:{calls:120,tokens:500000}})));}finally{global.fetch=old;}}
test('a confirmed shout crosses a closed door as a strong anonymous sound and triggers just one reevaluation',async()=>{
 const w=seedWorld(),owner=w.characters.find(c=>c.id==='owner');owner.region='cafe-storeroom';w.scene.doors['cafe-door']='closed';
 owner.plan={action:{type:'rest'},startedAt:w.minute,until:w.minute+90,attention:'',modelKey:'openai:gpt-6-luna'};
 for(const id of ['vera','cass']){const c=w.characters.find(c=>c.id===id);c.location='cafe';c.region='cafe-front';}store.install(w);
 const random=Math.random;Math.random=()=>{throw Error('strong sound must be directly heard');};
 try{await model(async(inputs,advance)=>{
  assert.equal((await advance()).status,200);const saved=await read(),event=saved.events.find(e=>e.actor==='vera'&&e.kind==='shout');assert.ok(event);
  const trace=event.perception.find(t=>t.characterId==='owner');assert.equal(trace.status,'direct');assert.equal(trace.resolution,undefined);
  assert.deepEqual(trace.observations.map(o=>({kind:o.kind,text:o.text,source:o.source,urgency:o.urgency})),[{kind:'sound',text:'儲藏室門方向傳來大聲喊叫。',source:undefined,urgency:'strong'}]);
  const calls=inputs.filter(i=>i.self.id==='owner');assert.equal(calls.length,1);assert.equal(JSON.stringify(calls[0]).includes('SHOUT_SECRET'),false);
  assert.equal(saved.characters.find(c=>c.id==='owner').plan.until,w.minute+90);assert.equal(saved.scene.doors['cafe-door'],'closed');assert.equal(saved.characters.find(c=>c.id==='vera').plan,undefined);
 },(i,request)=>{assert.ok(request.response_format.json_schema.schema.properties.type.enum.includes('shout'));return i.self.id==='vera'?{type:'shout',target:'cass',content:'小心！SHOUT_SECRET',durationMinutes:90}:i.self.id==='owner'?{type:'continue'}:{};});}finally{Math.random=random;}
});
test('only a clearly heard warning triggers danger reevaluation without creating objective danger',async()=>{
 for(const [content,warning] of [['小心！杯子要掉了。',true],['這裡沒有危險，放心休息。',false]]){
  const w=seedWorld(),owner=w.characters.find(c=>c.id==='owner');
  owner.plan={action:{type:'rest'},startedAt:w.minute,until:w.minute+90,attention:'',modelKey:'openai:gpt-6-luna'};
  for(const id of ['vera','cass']){const c=w.characters.find(c=>c.id===id);c.location='cafe';c.region='cafe-front';}store.install(w);
  await model(async(inputs,advance)=>{
   assert.equal((await advance()).status,200);const saved=await read(),event=saved.events.find(e=>e.actor==='vera'&&e.kind==='say');
   assert.equal(event.perception.find(t=>t.characterId==='owner').observations[0].urgency,warning?'danger':undefined);
   assert.equal(inputs.filter(i=>i.self.id==='owner').length,warning?1:0);assert.deepEqual(saved.scene,w.scene);
   assert.equal(saved.events.some(e=>e.kind==='danger'),false);
  },i=>i.self.id==='vera'?{type:'say',target:'cass',content,durationMinutes:15}:i.self.id==='owner'?{type:'continue'}:{});
 }
});
test('continued activity keeps its internal attention marker out of later model decisions',async()=>{
 const w=seedWorld(),owner=w.characters.find(c=>c.id==='owner');
 owner.plan={action:{type:'rest'},startedAt:w.minute,until:w.minute+90,attention:'',modelKey:'openai:gpt-6-luna'};store.install(w);
 assert.equal((await POST(req({operation:'intervene',mode:'demo',target:'owner',text:'可以繼續休息'}))).status,200);
 await model(async(inputs,advance)=>{
  assert.equal((await advance()).status,200);const savedOwner=(await read()).characters.find(c=>c.id==='owner'),marker=savedOwner.plan.attention;assert.ok(marker);
  assert.equal((await POST(req({operation:'intervene',mode:'demo',target:'owner',text:'請想想接下來做什麼'}))).status,200);inputs.length=0;
  assert.equal((await advance()).status,200);const input=inputs.find(i=>i.self.id==='owner');assert.ok(input);
  assert.equal(JSON.stringify(input).includes(marker),false);assert.equal(input.self.plan.attention,undefined);
  assert.deepEqual(input.self.plan.action,{type:'rest'});assert.equal(input.self.plan.until,w.minute+90);
 },i=>i.self.id==='owner'?{type:'continue'}:{});
});
test('unknown footsteps do not match a familiar person condition; general observations wait for normal decision',async()=>{
 const w=seedWorld(),owner=w.characters.find(c=>c.id==='owner');owner.region='cafe-storeroom';w.scene.doors['cafe-door']='closed';owner.attentionConditions=[{kind:'person',source:'vera',region:''}];owner.plan={action:{type:'rest'},startedAt:w.minute,until:w.minute+90,attention:'',modelKey:'openai:gpt-6-luna'};store.install(w);
 await model(async(inputs,advance)=>{assert.equal((await advance()).status,200);assert.equal(inputs.filter(i=>i.self.id==='owner').length,0);assert.ok((await read()).characters.find(c=>c.id==='owner').observations.some(o=>o.kind==='sound'));},i=>i.self.id==='vera'?{type:'move',target:'cafe',durationMinutes:15}:{});
});
test('matching subjective clues reevaluate once, preserve continuation progress, and reject only invalid conditions',async()=>{
 const w=seedWorld(),owner=w.characters.find(c=>c.id==='owner');owner.attentionConditions=[{kind:'person',source:'vera',region:'cafe-front'}];owner.plan={action:{type:'rest'},startedAt:w.minute,until:w.minute+90,attention:'',modelKey:'openai:gpt-6-luna'};store.install(w);
 await model(async(inputs,advance)=>{assert.equal((await advance()).status,200);const calls=inputs.filter(i=>i.self.id==='owner');assert.equal(calls.length,1);assert.ok(calls[0].self.observations.some(o=>o.source==='vera'));assert.equal(calls[0].currentActivity.remainingMinutes,75);const saved=(await read()).characters.find(c=>c.id==='owner');assert.equal(saved.plan.startedAt,w.minute);assert.equal(saved.plan.until,w.minute+90);assert.deepEqual(saved.attentionConditions,[{kind:'sound',source:'',region:''}]);assert.ok(saved.attentionDiagnostics.some(d=>d.reason.includes('捨棄')));assert.equal(JSON.stringify(calls[0]).includes('attentionDiagnostics'),false);},i=>i.self.id==='vera'?{type:'move',target:'cafe',durationMinutes:15}:i.self.id==='owner'?{type:'continue',attentionConditions:[{kind:'sound',source:'',region:''},{kind:'telepathy',source:'secret-person',region:''}]}:{});
});
test('late urgent observations survive memory clipping and reload, without a second decision in one advance',async()=>{
 const w=seedWorld();w.turn=3;const owner=w.characters.find(c=>c.id==='owner');owner.observations=Array.from({length:100},(_,i)=>({id:'old-'+i,time:1200,sense:'hearing',kind:'sound',text:'old-'+i,clarity:'vague'}));owner.observationCursor=100;
 for(const c of w.characters){c.location='cafe';c.region='cafe-front';}store.install(w);
 await model(async(inputs,advance)=>{assert.equal((await advance()).status,200);assert.equal(inputs.filter(i=>i.self.id==='owner').length,1);assert.equal(inputs[0].self.observations.length,12);let saved=await read();assert.ok(saved.characters.find(c=>c.id==='owner').observations.some(o=>o.text.includes('請幫忙')));inputs.length=0;assert.equal((await advance()).status,200);const call=inputs.find(i=>i.self.id==='owner');assert.ok(call);assert.ok(call.self.observations.some(o=>o.text.includes('請幫忙')));assert.equal(inputs.filter(i=>i.self.id==='owner').length,1);},i=>i.self.id==='vera'?{type:'say',target:'owner',content:'請幫忙',durationMinutes:15}:i.self.id==='owner'&&i.currentActivity?{type:'continue'}:{});
});
test('an invalid overall condition array rolls back observation consumption and keeps billed attempts',async()=>{
 const w=seedWorld();store.install(w);
 await model(async(_inputs,advance)=>{assert.equal((await advance()).status,502);const saved=await read();assert.equal(saved.turn,w.turn);assert.deepEqual(saved.characters,w.characters);assert.equal(saved.aiUsage.totalCalls,1);},()=>({attentionConditions:'invalid'}));
});
test('unconsumed danger survives the recent-memory window; consumed history stays bounded and observer diagnostics stay private',async()=>{
 const w=seedWorld(),owner=w.characters.find(c=>c.id==='owner');owner.observations=Array.from({length:130},(_,i)=>({id:'world-event-'+i,time:1200,sense:'hearing',kind:'sound',text:i===12?'早先尚未處理的警訊':'線索'+i,clarity:'clear',...(i===12?{urgency:'danger'}:{})}));owner.observationCursor=12;owner.memories=Array.from({length:80},()=>({time:1250,text:'近期記憶'}));owner.plan={action:{type:'rest'},startedAt:w.minute,until:w.minute+90,attention:'',modelKey:'openai:gpt-6-luna'};store.install(w);
 await model(async(inputs,advance)=>{assert.equal((await advance()).status,200);const input=inputs.find(i=>i.self.id==='owner');assert.ok(input.self.observations.some(o=>o.text==='早先尚未處理的警訊'));assert.equal(JSON.stringify(input).includes('world-event'),false);assert.equal(JSON.stringify(input).includes('urgency'),false);const saved=(await read()).characters.find(c=>c.id==='owner');assert.equal(saved.observationCursor,130);assert.ok(saved.attentionDiagnostics.some(d=>d.reason==='已察覺危險'));},i=>i.self.id==='owner'?{type:'continue'}:{});
});
test('a matching condition can switch activities while a storage conflict cannot consume observations',async()=>{
 const w=seedWorld(),owner=w.characters.find(c=>c.id==='owner');owner.observations=[{id:'saved-clue',time:1250,sense:'hearing',kind:'sound',text:'一聲動靜',clarity:'vague',region:'cafe-front'}];owner.attentionConditions=[{kind:'sound',source:'',region:'cafe-front'}];owner.plan={action:{type:'rest'},startedAt:w.minute,until:w.minute+90,attention:'',modelKey:'openai:gpt-6-luna'};store.install(w);
 await model(async(_inputs,advance)=>{store.conflictOnNextSave();assert.equal((await advance()).status,502);assert.equal((await read()).characters.find(c=>c.id==='owner').observationCursor,0);assert.equal((await advance()).status,200);const saved=(await read()).characters.find(c=>c.id==='owner');assert.equal(saved.plan.action.type,'work');assert.equal(saved.observationCursor,1);},i=>i.self.id==='owner'?{type:'work',target:'tidy'}:{});
});
