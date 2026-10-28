/* eslint-disable @typescript-eslint/no-require-imports -- Real World API/SQLite; only model transport, time and perception die are controlled. */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=name=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,name+'.cjs'));
const {POST,GET}=load('route'),store=load('store'),fixture=require('./fixtures/demand-integration-loop.cjs');
async function scenario({route='explore',prepare=()=>{},hidden,checkpoint,chooseNpc,chooseJudgment}={}){let instant=Date.parse('2026-10-28T00:00:00Z');const clock=Date.now,random=Math.random,old=fetch;Date.now=()=>instant;Math.random=()=>.675;const world=checkpoint?structuredClone(checkpoint):fixture.initialWorld(load('world').seedWorld,{hidden});if(checkpoint)instant=Math.max(instant,...Object.values(world.aiUsage?.costs?.total||{}).map(cohort=>cohort.lastDispatchAt));prepare(world);store.install(world);const transport=fixture.model({route,chooseNpc,chooseJudgment});global.fetch=async(url,init)=>{assert.match(String(url),/^https:\/\/api\.openai\.com\//);return transport.respond(JSON.parse(init.body));};const post=body=>POST(new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify({operationId:Date.now()+':'+crypto.randomUUID(),worldContext:world.contextId,mode:'openai',model:'gpt-6-luna',...body})}));await post({operation:'set-model-key',key:'fixture-key'});return {post,transport,tick:()=>{instant+=15*60*1000;},read:async()=>(await(await GET()).json()).world,trace:async id=>(await(await GET(new Request('https://test.invalid/api/world?operationId='+encodeURIComponent(id)))).json()).decisionTrace,restore:()=>{Date.now=clock;Math.random=random;global.fetch=old;}};}
async function step(s,name){s.tick();s.transport.setStep(name);const op={operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()},response=await s.post(op);assert.equal(response.status,200,await response.clone().text());return {world:await s.read(),trace:await s.trace(op.operationId),op};}
const actor=(world,id)=>world.characters.find(c=>c.id===id);
test('cross-character inquiry, real reply, optional exploration, preparation and consented delivery survive SQLite and next actual messages',async()=>{
 const seed=load('world').seedWorld,original=actor(seed(),'owner'),publicScene=fixture.snapshot(seed);assert.equal(actor(publicScene.world,'owner').personality,original.personality);assert.equal(actor(publicScene.world,'owner').goal,original.goal);assert.deepEqual(actor(publicScene.world,'owner').intents,original.intents);assert.equal(fixture.snapshot(seed).sha256,publicScene.sha256);assert.equal(publicScene.json.includes('fixture-key'),false);
 const s=await scenario();try{
  let result,sourceId,mealId;for(const name of fixture.steps('explore')){result=await step(s,name);const w=result.world;if(name==='inquire'){assert.ok(actor(w,'owner').shortTerm.some(m=>m.source.person==='cass'&&m.text.includes(fixture.words.ask)));assert.equal(w.supplies.some(source=>source.background),false);}
   if(name==='answer')assert.ok(actor(w,'owner').shortTerm.some(m=>m.source.person==='cass'&&m.text.includes(fixture.words.answer)));
   if(name==='search'){const source=w.supplies.find(source=>source.background);assert.ok(source);sourceId=source.id;assert.deepEqual(source.knownTo,['owner']);assert.equal(w.objects.some(o=>o.source===sourceId),false);}
   if(name==='prepare'){const meal=w.objects.find(o=>o.kind==='meal');assert.ok(meal);mealId=meal.id;assert.equal(meal.holder,'owner');assert.equal(w.objects.find(o=>o.id===meal.sources[0].id).lifecycle,'consumed');assert.equal(w.supplies.find(source=>source.id===sourceId).background.sequence,1);assert.equal(actor(w,'cass').observations.some(o=>o.supplyId===sourceId),false);}
   if(name==='grant'){const meal=w.objects.find(o=>o.id===mealId);assert.equal(meal.holder,'owner');assert.ok(meal.allowedTo.includes('cass'));assert.equal(meal.acceptedBy,undefined);}
   if(name==='consent'){const meal=w.objects.find(o=>o.id===mealId);assert.equal(meal.holder,'owner');assert.ok(meal.acceptedBy.includes('cass'));}
   if(name==='deliver'){const meal=w.objects.find(o=>o.id===mealId);assert.equal(meal.holder,'cass');assert.equal(meal.owner,'owner');assert.deepEqual(meal.acceptedBy,[]);assert.equal(meal.lifecycle,'active');}
  }
  const w=result.world;assert.equal(w.supplies.find(x=>x.id==='old-finished-meal').remaining,0);assert.equal(w.objects.find(x=>x.id==='old-finished-meal:1').lifecycle,'consumed');assert.equal(w.supplies.find(x=>x.id==='special-stock').remaining,0);assert.equal(w.supplies.find(x=>x.id==='bread-stock').remaining,1);assert.ok(s.transport.frames.filter(f=>f.step==='reflect'&&f.input.self).every(f=>f.input.objects.some(o=>o.id===mealId&&o.holder==='cass')));assert.ok(result.trace.steps.some(x=>x.kind==='npc-method-assessment'));assert.equal(s.transport.counts().judgments,4);assert.equal(w.aiUsage.totalCalls,s.transport.counts().npc+4);const calls=s.transport.counts();await s.post(result.op);assert.deepEqual(s.transport.counts(),calls);
 }finally{s.restore();}
});
module.exports={scenario,step,actor};

test('a known direct method prepares from the independent legal bread source without searching, then delivers only after real consent',async()=>{
 const s=await scenario({route:'direct'});try{
  let result,mealId,hungerBeforeDelivery;for(const name of fixture.steps('direct')){result=await step(s,name);const w=result.world;
   if(name==='prepare'){mealId=w.objects.find(o=>o.kind==='meal').id;assert.equal(w.supplies.find(x=>x.id==='bread-stock').remaining,0);assert.equal(w.supplies.some(x=>x.background),false);assert.equal(s.transport.frames.some(frame=>frame.step==='search'),false);const frame=s.transport.frames.find(frame=>frame.step==='prepare'&&frame.input.self?.id==='owner');assert.ok(frame.input.knownMethods.some(method=>method.content==='用現有麵包準備一份餐點'));}
   if(name==='consent'){hungerBeforeDelivery=actor(w,'cass').needs.values.hunger;assert.equal(w.objects.find(x=>x.id===mealId).holder,'owner');}
  }
  const w=result.world,meal=w.objects.find(x=>x.id===mealId);assert.equal(meal.holder,'cass');assert.equal(meal.owner,'owner');assert.equal(meal.lifecycle,'active');assert.equal(meal.quantity.amount,1);assert.ok(actor(w,'cass').needs.values.hunger>=hungerBeforeDelivery,'delivery is not ingestion or need relief');assert.equal(w.supplies.some(x=>x.background),false);assert.equal(w.supplies.find(x=>x.id==='special-stock').remaining,0);assert.equal(w.supplies.find(x=>x.id==='old-finished-meal').remaining,0);assert.equal(w.objects.find(x=>x.id==='old-finished-meal:1').lifecycle,'consumed');
  const frames=s.transport.frames.filter(frame=>frame.step==='reflect'&&frame.input.self);assert.equal(frames.length,2);assert.ok(frames.every(frame=>frame.input.objects.some(object=>object.id===mealId&&object.holder==='cass')));assert.equal(s.transport.counts().judgments,3);assert.equal(w.aiUsage.totalCalls,s.transport.counts().npc+3);assert.equal(w.aiUsage.totalInputTokens,w.aiUsage.totalCalls*30);assert.equal(w.aiUsage.totalOutputTokens,w.aiUsage.totalCalls*10);assert.equal(w.aiUsage.totalUnknownCalls,0);assert.equal(Object.values(w.aiUsage.costs.total).reduce((sum,item)=>sum+item.calls,0),w.aiUsage.totalCalls);
 }finally{s.restore();}
});

const {wire}=require('./method-assessment-fixture.cjs');
const controlled=(input,action,extra={})=>wire(action,{purpose:action.purpose||'依自己的情境作選擇',knownResults:input.self.shortTerm.slice(-2).map(memory=>({kind:'short',id:memory.id,version:memory.version})),reason:'明示的受控NPC候選，仍只引用本次真正可知經歷。',...extra});
const checkpointBeforeGrant=async()=>{const s=await scenario();try{let result;for(const name of ['inquire','answer','offer','search','prepare'])result=await step(s,name);return result.world;}finally{s.restore();}};

test('refusal, waiting and changing a decision remain explicit NPC choices; a spoken promise never creates supplies or delivery',async()=>{
 const s=await scenario({chooseNpc:(name,input)=>{
  if(input.self.id==='owner'){
   if(name==='inquire'){assert.ok(input.self.shortTerm.some(m=>m.source.person==='cass'&&m.text.includes(fixture.words.ask)));return controlled(input,fixture.action('say','cass','我現在先不準備餐點。'));}
   if(name==='followup')return controlled(input,fixture.action('rest','','先等對方回應'),{choice:'wait'});
   if(name==='change'){assert.ok(input.self.shortTerm.some(m=>m.source.person==='cass'&&m.text.includes('改天')));return controlled(input,fixture.action('reflect','','我決定先放下這次餐點的事'),{choice:'drop'});}
  }
  if(name==='followup'&&input.self.id==='cass')return controlled(input,fixture.action('say','owner','那我改天再來，現在不需要了。'));
 }});try{
  for(const name of ['inquire','followup','change']){const {world,trace}=await step(s,name);assert.equal(world.supplies.some(source=>source.background),false);assert.equal(world.objects.some(object=>object.kind==='meal'),false);assert.deepEqual(actor(world,'owner').intents,[]);assert.equal(trace.dispatches.some(dispatch=>dispatch.task==='adjudication'),false);}
  assert.equal(s.transport.counts().judgments,0);const w=await s.read();assert.ok(actor(w,'cass').shortTerm.some(m=>m.source.person==='owner'&&m.text.includes('先不準備')));
 }finally{s.restore();}
 const promised=await scenario();try{for(const name of ['inquire','answer','offer'])await step(promised,name);const w=await promised.read();assert.ok(w.events.some(event=>event.actor==='owner'&&event.text.includes(fixture.words.offer)));assert.equal(w.objects.some(object=>object.kind==='meal'),false);assert.equal(w.supplies.some(source=>source.background),false);assert.equal(promised.transport.counts().judgments,0);}finally{promised.restore();}
});

test('cross-role grant does not imply receipt or delivery; a transfer without the guest consent atomically fails',async()=>{
 const checkpoint=await checkpointBeforeGrant();const s=await scenario({checkpoint,chooseNpc:(name,input)=>{
  if(name==='deliver'&&input.self.id==='owner'){const meal=input.objects.find(object=>object.kind==='meal');return controlled(input,fixture.action('propose',meal.id,'嘗試先把餐點交過去','交付餐點',[fixture.serving]));}
 }});try{
  const granted=await step(s,'grant'),meal=granted.world.objects.find(object=>object.kind==='meal');assert.equal(meal.holder,'owner');assert.ok(meal.allowedTo.includes('cass'));assert.equal(meal.acceptedBy,undefined);const before=await s.read();s.tick();s.transport.setStep('deliver');const op={operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()};assert.equal((await s.post(op)).status,502);const after=await s.read();assert.deepEqual(after.objects,before.objects);assert.deepEqual(after.characters,before.characters);assert.equal(after.objects.find(object=>object.id===meal.id).holder,'owner');assert.equal(after.objects.find(object=>object.id===meal.id).acceptedBy,undefined);const counts=s.transport.counts();await s.post(op);assert.deepEqual(s.transport.counts(),counts);
 }finally{s.restore();}
});

test('cross-slice save, later-role and lease failures retain earlier preparation but roll back the current grant and replay dispatches',async()=>{
 const checkpoint=await checkpointBeforeGrant();
 for(const fault of ['save','before-save','later','lease']){
  const s=await scenario({checkpoint,chooseNpc:(name,input)=>fault==='later'&&name==='grant'&&input.self.id==='cass'?{invalid:'controlled later actor failure'}:undefined});try{
   const before=await s.read();if(fault==='save')store.conflictOnNextSave();if(fault==='before-save')store.throwBeforeNextSave();
   const transport=global.fetch;if(fault==='lease')global.fetch=async(url,init)=>{const input=JSON.parse(JSON.parse(init.body).messages[1].content),response=await transport(url,init);if(input.contractVersion==='world-adjudication.v1')s.tick();return response;};
   s.tick();s.transport.setStep('grant');const op={operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()};assert.equal((await s.post(op)).status,502,fault);const after=await s.read();assert.deepEqual(after.objects,before.objects,fault+' objects');assert.deepEqual(after.supplies,before.supplies,fault+' sources');assert.deepEqual(after.characters,before.characters,fault+' characters');assert.deepEqual(after.routineRules,before.routineRules);assert.deepEqual(after.probeResults,before.probeResults);const meal=after.objects.find(object=>object.kind==='meal');assert.equal(meal.holder,'owner');assert.equal(meal.lifecycle,'active');assert.deepEqual(meal.allowedTo,['owner']);assert.equal(meal.acceptedBy,undefined);assert.ok(after.aiUsage.totalCalls>before.aiUsage.totalCalls);
   const counts=s.transport.counts();await s.post(op);assert.deepEqual(s.transport.counts(),counts);assert.equal((await s.read()).aiUsage.totalCalls,after.aiUsage.totalCalls);assert.notEqual((await s.trace(op.operationId)).outcome,'committed');
  }finally{s.restore();}
 }
});

test('the shared player dispatch budget stops a follow-up grant without discarding the earlier prepared meal or adding a service call',async()=>{
 const checkpoint=await checkpointBeforeGrant(),s=await scenario({checkpoint});try{
  const before=await s.read();await s.post({operation:'set-budget',limits:{calls:before.aiUsage.calls+1,tokens:500000}});s.tick();s.transport.setStep('grant');const op={operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()},response=await s.post(op);assert.equal(response.status,429);const after=await s.read();assert.deepEqual(after.objects,before.objects);assert.deepEqual(after.characters,before.characters);assert.equal(after.aiUsage.totalCalls,before.aiUsage.totalCalls+1);assert.equal(s.transport.counts().npc,1);assert.equal(s.transport.counts().judgments,0);const count=s.transport.counts();await s.post(op);assert.deepEqual(s.transport.counts(),count);
 }finally{s.restore();}
});

test('a real guest interruption can pause and resume a long preparation while committed raw material survives reload and abandonment',async()=>{
 const f=require('./routine-world-programs-fixture.cjs');let pausedCheckpoint;
 const chooseNpc=(name,input)=>{
  if(input.self.id==='cass'&&name==='interrupt')return controlled(input,fixture.action('say','owner','等一下，我還想確認一件事。'));
  if(input.self.id==='cass'&&name==='hold')return controlled(input,fixture.action('say','owner','還是維持原本那一份就好。'));
  if(input.self.id==='owner'){
   if(name==='pause'){assert.ok(input.self.shortTerm.some(m=>m.source.person==='cass'&&m.text.includes('等一下')));return controlled(input,fixture.action('pause','','先暫停準備','',[fixture.serving]),{choice:'wait'});}
   if(name==='hold')return controlled(input,fixture.action('rest','','先聽完客人的說明','',[fixture.serving]),{choice:'wait'});
   if(name==='resume'){assert.ok(input.self.pausedActivity);assert.ok(input.self.shortTerm.some(m=>m.source.person==='cass'&&m.text.includes('維持原本')));return controlled(input,fixture.action('resume',input.self.pausedActivity.id,'繼續準備餐點','',[fixture.serving]));}
   if(['interrupt','finish'].includes(name)&&input.self.plan)return controlled(input,fixture.action('continue','','繼續原來的準備','',[fixture.serving]),{choice:'continue'});
  }
 };
 const s=await scenario({prepare:w=>{const program=w.routineRules[0].programs.find(p=>p.operation==='food');program.resumable=true;program.stages=[f.phase(15,[{kind:'materialize',supplyId:'$raw',expectedRemaining:0}]),f.phase(60,[f.form('完成的一份簡餐','meal')])];w.routineRules[0].worldTimings.find(time=>time.operation==='food').minutes=60;},chooseNpc});try{
  for(const name of ['inquire','answer','offer','search'])await step(s,name);let result=await step(s,'prepare'),w=result.world;const source=w.supplies.find(source=>source.background),raw=w.objects.find(object=>object.source===source.id);assert.ok(raw);assert.equal(raw.lifecycle,'active');assert.equal(w.objects.some(object=>object.kind==='meal'),false);assert.equal(source.background.sequence,1);assert.ok(actor(w,'owner').plan);
  await step(s,'interrupt');result=await step(s,'pause');w=result.world;assert.ok(actor(w,'owner').pausedActivity);assert.equal(actor(w,'owner').plan,undefined);assert.equal(w.objects.find(object=>object.id===raw.id).lifecycle,'active');assert.equal(w.objects.some(object=>object.kind==='meal'),false);pausedCheckpoint=w;
  result=await step(s,'hold');assert.equal(result.world.objects.some(object=>object.kind==='meal'),false);result=await step(s,'resume');assert.equal(actor(result.world,'owner').pausedActivity,undefined);assert.ok(actor(result.world,'owner').plan);result=await step(s,'finish');assert.equal(result.world.objects.find(object=>object.id===raw.id).lifecycle,'consumed');assert.ok(result.world.objects.some(object=>object.kind==='meal'&&object.holder==='owner'));assert.equal(result.world.supplies.find(item=>item.id===source.id).background.sequence,1);await step(s,'reflect');assert.ok(s.transport.frames.filter(frame=>frame.input.self?.id==='owner').at(-1).input.objects.some(object=>object.kind==='meal'));assert.equal(s.transport.counts().judgments,1);
 }finally{s.restore();}
 const abandoned=await scenario({checkpoint:pausedCheckpoint,chooseNpc:(name,input)=>input.self.id==='owner'&&name==='abandon'?controlled(input,fixture.action('abandon',input.self.pausedActivity.id,'先放下未完成的準備'),{choice:'drop'}):undefined});try{let result=await step(abandoned,'abandon');assert.equal(actor(result.world,'owner').pausedActivity,undefined);assert.equal(result.world.objects.some(object=>object.kind==='meal'),false);const source=result.world.supplies.find(source=>source.background);assert.equal(source.background.sequence,1);assert.ok(result.world.objects.some(object=>object.source===source.id&&object.lifecycle==='active'));result=await step(abandoned,'reflect');assert.equal(result.world.objects.some(object=>object.kind==='meal'),false);assert.equal(abandoned.transport.counts().judgments,0);}finally{abandoned.restore();}
});

test('the composed ordinary source cannot refill a renamed explicitly finite special source or revive old completed food',async()=>{
 const f=require('./routine-world-programs-fixture.cjs'),checkpoint=await checkpointBeforeGrant();
 const special=f.program('prepare-special','用換個名稱的配料準備餐點','準備餐點',[f.binding('raw','supply','local',[],{kind:'food',sourceRole:'material',sourceSubject:'珍稀香料',background:f.bg('換名的日常配料','food')})],[f.phase(15,[{kind:'materialize',supplyId:'$raw',expectedRemaining:0},f.form('另一份特殊餐點','meal')])]);
 const s=await scenario({checkpoint,chooseNpc:(name,input)=>input.self.id==='owner'&&name==='special'?controlled(input,fixture.action('propose','cafe','用換個名稱的配料準備餐點','準備餐點',[fixture.serving]),{choice:'switch',change:{kind:'source',detail:'嘗試另一個指定類別的來源'}}):undefined,chooseJudgment:name=>name==='special'?f.approval([special],'prepare-special'):undefined});try{
  const before=await s.read(),result=await step(s,'special');assert.deepEqual(result.world.objects,before.objects);assert.deepEqual(result.world.supplies,before.supplies);assert.equal(result.world.supplies.find(source=>source.id==='special-stock').remaining,0);assert.equal(result.world.supplies.find(source=>source.id==='old-finished-meal').remaining,0);assert.equal(result.world.objects.find(object=>object.id==='old-finished-meal:1').lifecycle,'consumed');assert.ok(result.world.objects.some(object=>object.kind==='meal'&&object.lifecycle==='active'));assert.equal(result.world.supplies.filter(source=>source.background).length,1);assert.ok(result.world.events.some(event=>event.actor==='owner'&&event.kind==='blocked'));assert.equal(s.transport.counts().judgments,1);
 }finally{s.restore();}
});

test('a legacy source survives API read and subsequent use without fabricated scope or cross-owner discovery',async()=>{
 let checkpoint;const start=await scenario();try{for(const name of ['inquire','answer','offer','search'])checkpoint=(await step(start,name)).world;}finally{start.restore();}
 const sourceId=checkpoint.supplies.find(source=>source.background).id;delete checkpoint.supplies.find(source=>source.id===sourceId).background.scope;delete checkpoint.probeResults;delete checkpoint.perceptionTrials;
 const s=await scenario({checkpoint});try{
  const before=store.snapshot();await s.read();await s.read();assert.deepEqual(store.snapshot(),before);const result=await step(s,'prepare');assert.equal(result.world.supplies.filter(source=>source.background).length,1);assert.equal(result.world.supplies.find(source=>source.id===sourceId).background.scope,undefined);assert.equal(result.world.supplies.find(source=>source.id===sourceId).background.sequence,1);assert.ok(result.world.objects.some(object=>object.kind==='meal'));assert.equal(s.transport.counts().judgments,0);
  store.installForOwner('separate-owner',fixture.initialWorld(load('world').seedWorld));load('auth').setUserId('separate-owner');const separate=await s.read();assert.equal(separate.supplies.some(source=>source.background),false);assert.equal(separate.objects.some(object=>object.kind==='meal'),false);assert.equal(JSON.stringify(separate).includes(sourceId),false);
 }finally{load('auth').setUserId('test-owner');s.restore();}
});

test('hidden authority changes do not alter the next actual known-context request, while composed capacity and source-role boundaries stay explicit',async()=>{
 const checkpoint=await checkpointBeforeGrant(),inputs=[],capacity=[];
 for(const hidden of ['PRIVATE_VARIANT_A','PRIVATE_VARIANT_B']){
  const s=await scenario({checkpoint,prepare:w=>{w.scene.external={'cafe-front':{revision:1,state:{'private-stock-note':hidden},exposure:{'private-stock-note':'hidden'}}};}});try{
   const result=await step(s,'grant');const ownerFrame=s.transport.frames.find(frame=>frame.input.self?.id==='owner');inputs.push(ownerFrame.input);assert.equal(JSON.stringify(s.transport.frames.filter(frame=>frame.input.self).map(frame=>frame.request.messages)).includes(hidden),false);const sourceId=result.world.supplies.find(source=>source.background).id;const guestFrame=s.transport.frames.find(frame=>frame.input.self?.id==='cass');assert.equal(JSON.stringify(guestFrame.input).includes(sourceId),false);assert.equal(JSON.stringify(guestFrame.input).includes('allowedTo'),false);assert.equal(JSON.stringify(guestFrame.input).includes('acceptedBy'),false);assert.equal(result.trace.gaps.includes('single-record-limit'),false);
   const measure={requestBytes:Math.max(...s.transport.frames.map(frame=>Buffer.byteLength(JSON.stringify(frame.request)))),inputBytes:Math.max(...s.transport.frames.filter(frame=>frame.input.self).map(frame=>Buffer.byteLength(frame.request.messages[1].content))),traceBytes:Buffer.byteLength(JSON.stringify(result.trace)),worldBytes:Buffer.byteLength(JSON.stringify(result.world)),receiptBytes:Buffer.byteLength(JSON.stringify([result.world.probeResults,result.world.perceptionTrials])),rules:result.world.routineRules.length,shortBytes:Math.max(...result.world.characters.map(character=>Buffer.byteLength(JSON.stringify(character.shortTerm)))),shortCount:Math.max(...result.world.characters.map(character=>character.shortTerm.length))};capacity.push(measure);assert.ok(measure.traceBytes<1024*1024);assert.ok(measure.inputBytes<88*1024);assert.ok(measure.receiptBytes<1024*1024);assert.ok(measure.rules<=32);assert.ok(measure.shortBytes<=64*1024);assert.ok(measure.shortCount<=80);
  }finally{s.restore();}
 }
 assert.deepEqual(inputs[0],inputs[1]);console.log('DEMAND_210_CAPACITY '+JSON.stringify({fixture:true,measurements:capacity}));
});
