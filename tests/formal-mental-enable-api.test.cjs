/* eslint-disable @typescript-eslint/no-require-imports */
const { originalWorldInput, originalAccountInput } = require('./original-scope-fixture.cjs');

const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=n=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,n+'.cjs'));
const {GET,POST}=load('route'),store=load('store'),{seedWorld}=load('world'),{env}=load('cloudflare-workers');
const id=()=>Date.now()+':'+crypto.randomUUID();
function scenario(prepare=()=>{}){const w=seedWorld();w.contextId='formal-enable-263';w.characters=w.characters.filter(c=>c.id==='owner');w.characters[0].control={mode:'taken-over',experiences:[]};prepare(w);store.install(w);delete env.MENTAL_ENERGY_TEST_POLICY;env.APP_ENV='local';return {post:b=>POST(new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify(originalWorldInput({operationId:id(),worldContext:w.contextId,mode:'demo',...b}, 'test-owner'))})),read:async()=>(await(await GET()).json()).world};}
const enable=(opening={capacity:65,current:3,stage:'見底'})=>({operation:'enable-mental-energy',mentalOpenings:[{id:'owner',opening}]});
test('owner explicitly enables the formal policy once; GET, SQLite reload and original ID preserve exact capacity and current state',async()=>{
 const s=scenario();assert.equal((await s.read()).characters[0].mentalEnergy,undefined);const op={...enable(),operationId:id()};const r=await s.post(op);assert.equal(r.status,200,await r.clone().text());const c=(await s.read()).characters[0];assert.equal(c.mentalEnergy.policy.kind,'formal');assert.equal(c.mentalEnergy.policy.maximum,65);assert.equal(c.mentalEnergy.value,3);assert.equal(c.mentalEnergy.activatedAt,c.mentalEnergy.updatedAt);
 await s.post(op);assert.deepEqual((await s.read()).characters[0].mentalEnergy,c.mentalEnergy);const again=await s.post(enable({capacity:90,current:90}));assert.equal(again.status,400);assert.deepEqual((await s.read()).characters[0].mentalEnergy,c.mentalEnergy);
});
test('retired start-city does not form values or overwrite an existing legacy world',async()=>{
 const s=scenario(),before=await(await GET()).json(),people=load('character-templates-route'),scenes=load('scene-templates-route');
 const api=async(route,b)=>{const r=await route.POST(new Request('https://test.invalid',{method:'POST',headers:{origin:'https://test.invalid'},body:JSON.stringify(originalAccountInput(b, 'account-operations:test-owner'))}));assert.ok(r.status<300,await r.clone().text());return r.json();};
 const person=(await api(people,{id:crypto.randomUUID(),version:0,fields:{...load('character-templates').blankCharacterTemplateFields(),name:'開局居民'}})).template;
 const scene=(await api(scenes,{id:crypto.randomUUID(),version:0,name:'屋',note:'',rooms:[{id:'front',name:'室'}],objects:[],connections:[]})).template;
 const city={places:[{id:'one',templateId:scene.id,version:1,name:'屋'}],characters:[{templateId:person.id,version:1,placeId:'one',roomId:'front',mentalOpening:{capacity:65,stage:'有餘'}}]};
 const context={operationScope:before.operationScope,expectedVersion:before.version},random=Math.random;let count=0;Math.random=()=>{count++;return .5;};try{
  const invalidCity={...city,characters:[{...city.characters[0],mentalOpening:{current:80}}]};const invalid=await s.post({...context,operation:'preview-city',city:invalidCity});assert.equal(invalid.status,400);assert.equal(count,0);assert.equal((await s.read()).characters[0].mentalEnergy,undefined);
  const preview=await s.post({...context,operation:'preview-city',city});assert.equal(preview.status,200,await preview.clone().text());assert.equal(count,0);
  const op={...context,operation:'start-city',operationId:id(),city};const r=await s.post(op);assert.equal(r.status,409,await r.clone().text());assert.equal(count,0);assert.equal((await s.read()).characters[0].mentalEnergy,undefined);assert.equal((await s.post(op)).status,409);
 }finally{Math.random=random;}
});
test('invalid openings, engineering knobs, incompatible worlds and saved null or corrupt policies never recreate energy',async()=>{
 for(const opening of [{capacity:0},{capacity:65,current:2.5},{capacity:65,current:3,stage:'充沛'},{minimum:41,maximum:44},{seed:1},{regulationCost:1}]){const s=scenario();const r=await s.post(enable(opening));assert.equal(r.status,400);assert.equal((await s.read()).characters[0].mentalEnergy,undefined);}
 for(const saved of [null,{}, {policy:{kind:'unknown'}},{policy:{kind:'formal',id:'broken'}}]){const s=scenario(w=>{w.characters[0].mentalEnergy=saved;});const r=await s.post(enable());assert.equal(r.status,400);assert.deepEqual((await s.read()).characters[0].mentalEnergy,saved);}
 const legacy=scenario(w=>{delete w.pursuitVersion;});assert.equal((await legacy.post(enable())).status,400);assert.equal((await legacy.read()).characters[0].mentalEnergy,undefined);
});
test('test policy remains isolated from formal enablement and production never falls back to fixture values',async()=>{
 const fixture={version:1,policy:{version:1,kind:'test',id:'isolated',maximum:10,initial:5,awakePerHour:0,regulationCost:4,lowAt:4},value:5,activatedAt:1260,updatedAt:1260,history:[],dropped:0};
 const s=scenario(w=>{w.characters[0].mentalEnergy=fixture;});assert.equal((await s.post(enable())).status,400);env.APP_ENV='production';assert.equal((await s.post(enable())).status,400);assert.equal((await s.post({operation:'advance',minutes:5,timeContract:'five-minute-v1'})).status,502);assert.deepEqual((await s.read()).characters[0].mentalEnergy,fixture);
 const fresh=scenario();env.APP_ENV='production';try{const r=await fresh.post(enable());assert.equal(r.status,200,await r.clone().text());assert.equal((await fresh.read()).characters[0].mentalEnergy.policy.kind,'formal');}finally{env.APP_ENV='local';}
});
const {fixtureDecision,savedPursuit}=require('./pursuit-fixture.cjs');
async function lifeScene(prepare=()=>{},opening){
 const s=scenario(w=>{w.characters[0].control={mode:'autonomous'};w.characters[0].mood='低落';w.characters[0].intents.push(savedPursuit('owner',{id:'create',content:'繼續創作',intensity:'medium',importance:'medium',urgency:'low',context:''}));w.adjudication={provider:'openai',model:'fixture-judge'};w.objects=[{id:'workpiece',source:'fixture',label:'練習作品',region:'cafe-front',holder:'owner',owner:'owner',revision:1,state:{progress:'raw'},lifecycle:'active',kind:'utensil',knownTo:['owner'],allowedTo:['owner'],stateTransitions:{progress:['raw','complete']}}];prepare(w);});
 const r=await s.post(enable(opening));assert.equal(r.status,200,await r.clone().text());await s.post({operation:'set-model-key',mode:'openai',key:'fixture-key'});
 const requests=[],old=global.fetch;let normal=()=>({type:'reflect',target:'',content:'低電量也想繼續',durationMinutes:60,timeIntent:{kind:'open-ended',maxMinutes:null}}),controlled=()=>({contractVersion:'controlled-feelings.v1',feelingUpdates:[],processFeeling:null});
 global.fetch=async(_url,init)=>{const body=JSON.parse(init.body),input=JSON.parse(body.messages[1].content);requests.push({body,input});const value=input.contractVersion==='world-adjudication.v1'?{status:'accepted',completionMinutes:15,effects:[{kind:'state',objectId:'workpiece',expectedRevision:1,key:'progress',value:'complete'}],stages:[],check:null,routine:null}:input.contractVersion==='controlled-feelings.v1'?controlled(input):fixtureDecision(input,normal(input));return Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(value)}}]});};
 const step=async(extra={})=>{const r=await s.post({operation:'advance',minutes:5,timeContract:'five-minute-v1',mode:'openai',model:'gpt-6-luna',...extra});assert.equal(r.status,200,await r.clone().text());return s.read();};
 return {...s,step,requests,normal:f=>{normal=f;},controlled:f=>{controlled=f;},restore:()=>{global.fetch=old;}};
}
test('a formally enabled low-energy life joins actual process, independent result, voluntary payment, handoff and reload without a reward loop',async()=>{
 const s=await lifeScene();try{
  let decisions=0;s.normal(input=>{decisions++;assert.equal(input.self.mentalEnergy.value,undefined);assert.equal(input.self.mentalEnergy.maximum,undefined);assert.doesNotMatch(JSON.stringify(input),/mental-energy-271-v1|capacityDice|sleepUnits|rawDelta/);
   if(decisions===1){assert.equal(input.self.mentalEnergy.canRegulate,false);return{type:'propose',target:'workpiece',content:'加工這件作品',purpose:'完成作品',durationMinutes:15,timeIntent:{kind:'completion',maxMinutes:null},processFeeling:{direction:'positive',level:3,reason:'我享受投入創作的過程'}};}
   const source=input.self.shortTerm.findLast(m=>m.feelingSources?.length)?.feelingSources[0];assert.ok(source);return{type:'rest',target:'',content:'先休息欣賞成果',durationMinutes:60,timeIntent:{kind:'open-ended',maxMinutes:null},feelingUpdates:[{source,direction:'positive',level:3,reason:'完成的成果帶來獨立成就感',mood:'有成就感'}],emotionRegulation:{effort:'慢慢呼吸整理想法',reason:'有餘裕照顧低落心情',mood:'稍微穩住'}};
  });
  let w=await s.step();assert.equal(w.objects[0].state.progress,'raw');assert.equal(w.characters[0].mentalEnergy.history.some(e=>e.kind==='process'),false);const firstCalls=s.requests.length;
  await s.step();await s.step();w=await s.step();assert.equal(s.requests.length,firstCalls);assert.equal(w.objects[0].state.progress,'complete');assert.ok(w.characters[0].mentalEnergy.history.some(e=>e.kind==='process'&&e.draws.some(d=>d.die===3)));assert.equal(decisions,1);
  w=await s.step();let c=w.characters[0];const receipt=c.mentalEnergy.experiences.receipts[0];assert.equal(receipt.originKind,'result');assert.ok(receipt.rawDelta>=5&&receipt.rawDelta<=8);assert.equal(c.mentalEnergy.history.at(-1).kind,'regulation');assert.equal(c.mentalEnergy.history.at(-1).before-c.mentalEnergy.history.at(-1).after,5);assert.equal(c.mood,'稍微穩住');assert.equal(c.intents.find(n=>n.id==='owner:create').status,'active');
  const prompt=s.requests.find(r=>r.input.self).body.messages[0].content;assert.match(prompt,/至少小幅緩和/);assert.match(prompt,/能承受/);assert.match(prompt,/優先考慮/);
  const paid=c.mentalEnergy.history.filter(e=>e.kind==='regulation').length;await s.post({operation:'intervene',target:'owner',text:'也可以保留現在的餘裕'});s.normal(input=>{assert.equal(input.self.shortTerm.some(m=>m.feelingSources?.includes(receipt.source)),false);return{type:'continue',target:'',content:'想保留心力繼續休息',durationMinutes:60,timeIntent:{kind:'open-ended',maxMinutes:null},processFeeling:{direction:'negative',level:1,reason:'現在稍有疲憊，但願意自己取捨'},emotionRegulation:null};});w=await s.step();assert.equal(w.characters[0].mentalEnergy.history.filter(e=>e.kind==='regulation').length,paid);
  await s.post({operation:'takeover'});await s.post({operation:'direct',action:{type:'rest',content:'使用者指定休息'}});s.controlled(()=>({contractVersion:'controlled-feelings.v1',feelingUpdates:[],processFeeling:{direction:'positive',level:2,reason:'受控活動中本人感到放鬆'}}));w=await s.step();assert.equal(w.characters[0].control.mode,'taken-over');assert.equal(w.characters[0].plan.action.content,'使用者指定休息');assert.equal(w.characters[0].mentalEnergy.history.filter(e=>e.kind==='regulation').length,paid);const controlledCalls=s.requests.filter(r=>r.input.contractVersion==='controlled-feelings.v1').length;assert.equal(controlledCalls,1);
  const op={operation:'advance',minutes:5,timeContract:'five-minute-v1',mode:'openai',model:'gpt-6-luna',operationId:id()};const response=await s.post(op);assert.equal(response.status,200,await response.clone().text());const durable=(await s.read()).characters[0],calls=s.requests.length;await s.post(op);assert.equal(s.requests.length,calls);assert.deepEqual((await s.read()).characters[0],durable);assert.equal(s.requests.filter(r=>r.input.contractVersion==='controlled-feelings.v1').length,controlledCalls);
 }finally{s.restore();}
});
test('a file SQLite close and reopen keeps formal enablement and original operation without drawing again',async()=>{
 const {mkdtemp,rm}=require('node:fs/promises'),{tmpdir}=require('node:os'),{createRuntime}=await import('../tooling/experiments/pursuit-runtime-228.mjs');const directory=await mkdtemp(path.join(tmpdir(),'formal-263-')),databasePath=path.join(directory,'world.sqlite');let runtime;
 try{runtime=await createRuntime({databasePath,legacySeed:true});const before=await(await runtime.get()).json();const op={operationScope:before.operationScope,...enable({capacity:65,stage:'有餘'}),mentalOpenings:[{id:'cass',opening:{capacity:65,stage:'有餘'}}],operationId:id(),worldContext:before.world.contextId,mode:'demo'};const r=await runtime.post(op);assert.equal(r.status,200,await r.clone().text());const formed=(await r.json()).world.characters.find(c=>c.id==='cass').mentalEnergy;assert.equal(formed.value,46);await runtime.close();runtime=undefined;runtime=await createRuntime({databasePath,legacySeed:true});assert.deepEqual((await(await runtime.get()).json()).world.characters.find(c=>c.id==='cass').mentalEnergy,formed);const random=Math.random;Math.random=()=>{throw Error('reopen replay must not draw');};try{assert.equal((await runtime.post(op)).status,200);}finally{Math.random=random;}assert.deepEqual((await(await runtime.get()).json()).world.characters.find(c=>c.id==='cass').mentalEnergy,formed);
 }finally{await runtime?.close();await rm(directory,{recursive:true,force:true});}
});
test('existing valid formal partial coverage and prior successful income are preserved by explicit no-change adoption',async()=>{
 const s=scenario(w=>{w.minute=1262;});await s.post(enable());assert.equal((await s.post({operation:'advance',minutes:5,timeContract:'five-minute-v1'})).status,200);const before=(await s.read()).characters[0].mentalEnergy;assert.ok(before.formal.coverage);const random=Math.random;Math.random=()=>{throw Error('existing formal must not draw');};try{const r=await s.post({operation:'enable-mental-energy',mentalOpenings:[{id:'owner'}]});assert.equal(r.status,200,await r.clone().text());assert.deepEqual((await s.read()).characters[0].mentalEnergy,before);}finally{Math.random=random;}
});
test('formal enablement and state share CAS, before-save and unknown-after-save operation recovery',async()=>{
 for(const fault of ['before','conflict','after']){const s=scenario();if(fault==='before')store.throwBeforeNextSave();if(fault==='conflict')store.conflictOnNextSave();if(fault==='after')store.throwAfterNextSave();const op={...enable(),operationId:id()},r=await s.post(op),payload=await r.json(),committed=(await s.read()).characters[0].mentalEnergy;assert.equal(!!committed,fault==='after');const random=Math.random;Math.random=()=>{throw Error('replay must not redraw');};try{assert.deepEqual(await(await s.post(op)).json(),payload);}finally{Math.random=random;}assert.deepEqual((await s.read()).characters[0].mentalEnergy,committed);}
});
test('formal income, mood, payment, activity and sources roll back together across late actor, invalid source, stale object, lease and save faults',async()=>{
 for(const fault of ['later','source','stale-object','lease','before','conflict','after']){
  const s=await lifeScene(w=>{w.turn=0;if(fault==='later')w.characters.push({...seedWorld().characters.find(c=>c.id==='cass'),location:'cafe',region:'cafe-front'});}),clock=Date.now;
  try{
   await s.post({operation:'intervene',target:'owner',text:'這是剛剛真正收到的鼓勵'});const before=await s.read();s.normal(input=>{
    if(input.self.id!=='owner')return{malformed:'later actor'};
    const source=input.self.shortTerm.findLast(m=>m.feelingSources?.length).feelingSources[0];if(fault==='lease'){const then=clock();Date.now=()=>then+500000;}
    return{type:fault==='stale-object'?'propose':'rest',target:fault==='stale-object'?'workpiece':'',content:fault==='stale-object'?'加工這件作品':'選擇安靜休息',purpose:'照顧自己',durationMinutes:60,timeIntent:{kind:fault==='stale-object'?'completion':'open-ended',maxMinutes:null},feelingUpdates:[{source:fault==='source'?'not-offered':source,direction:'positive',level:3,reason:'獨立的新鼓勵讓我補回餘裕',mood:'稍微安心'}],emotionRegulation:{effort:'慢慢呼吸',reason:'讓自己能承受',mood:'稍微穩住'}};
   });
   // A stale object is changed through a committed fixture boundary, then its
   // actual proposed effect still carries the old expected revision.
   if(fault==='stale-object'){const w=await s.read();w.objects[0].revision=2;store.replaceCommittedWorld(w);before.objects[0].revision=2;}
   if(fault==='before')store.throwBeforeNextSave();if(fault==='conflict')store.conflictOnNextSave();if(fault==='after')store.throwAfterNextSave();
   const op={operation:'advance',minutes:5,timeContract:'five-minute-v1',mode:'openai',model:'gpt-6-luna',operationId:id()},r=await s.post(op);Date.now=clock;const payload=await r.json(),w=await s.read();
   if(fault==='after'){assert.ok(w.characters[0].mentalEnergy.history.some(h=>h.kind==='regulation'));assert.ok(w.characters[0].mentalEnergy.experiences.receipts.length);}
   else{assert.notEqual(r.status,200,JSON.stringify(payload));assert.deepEqual(w.characters,before.characters);assert.deepEqual(w.objects,before.objects);assert.equal(w.minute,before.minute);}
   assert.ok(w.aiUsage.totalCalls>before.aiUsage.totalCalls);const calls=s.requests.length;await s.post(op);assert.equal(s.requests.length,calls);assert.deepEqual((await s.read()).characters,w.characters);
  }finally{Date.now=clock;s.restore();}
 }
});
test('insufficient voluntary payment is rejected and a later legal choice may retain energy without a free mood rewrite',async()=>{
 const s=await lifeScene();try{
  const before=await s.read();s.normal(()=>({type:'rest',target:'',content:'想安靜休息',durationMinutes:60,timeIntent:{kind:'open-ended',maxMinutes:null},emotionRegulation:{effort:'想穩住自己',reason:'嘗試照顧自己',mood:'不能免費取得'}}));const r=await s.post({operation:'advance',minutes:5,timeContract:'five-minute-v1',mode:'openai',model:'gpt-6-luna'});assert.equal(r.status,502);assert.deepEqual((await s.read()).characters,before.characters);
  s.normal(()=>({type:'rest',target:'',content:'低電量也可以自己選擇休息',durationMinutes:60,timeIntent:{kind:'open-ended',maxMinutes:null},emotionRegulation:null,mood:'頂層台詞不能免費改心情'}));const w=await s.step();assert.equal(w.characters[0].mood,'低落');assert.equal(w.characters[0].plan.action.content,'低電量也可以自己選擇休息');assert.equal(w.characters[0].mentalEnergy.history.some(h=>h.kind==='regulation'),false);
 }finally{s.restore();}
});
test('the public formal factory also rejects a present null record without taking a replacement die',()=>{
 const {createFormalMentalEnergy}=load('formal-mental-policy'),random=Math.random;Math.random=()=>{throw Error('replacement die must not be taken');};try{assert.throws(()=>createFormalMentalEnergy({id:'broken',mentalEnergy:null},0),/既有精神電量/);}finally{Math.random=random;}
});
test('controlled appraisal after a committed payment cannot charge again, replace the user action or bypass the call budget',async()=>{
 const s=await lifeScene();try{
  await s.post({operation:'intervene',target:'owner',text:'真正收到的新支持'});s.normal(input=>({type:'rest',target:'',content:'自己先休息',durationMinutes:60,timeIntent:{kind:'open-ended',maxMinutes:null},feelingUpdates:[{source:input.self.shortTerm.findLast(m=>m.feelingSources?.length).feelingSources[0],direction:'positive',level:3,reason:'支持與調節分開',mood:'安心'}],emotionRegulation:{effort:'整理呼吸',reason:'照顧自己的感受',mood:'稍微穩住'}}));await s.step();await s.post({operation:'takeover'});await s.post({operation:'direct',action:{type:'rest',content:'使用者的行動保持不變'}});const before=await s.read();s.controlled(()=>({contractVersion:'controlled-feelings.v1',feelingUpdates:[],processFeeling:null,emotionRegulation:{effort:'越權',reason:'不能再扣費',mood:'免費換心情'}}));
  const op={operation:'advance',minutes:5,timeContract:'five-minute-v1',mode:'openai',model:'gpt-6-luna',operationId:id()};assert.equal((await s.post(op)).status,502);assert.deepEqual((await s.read()).characters,before.characters);const calls=s.requests.length;await s.post(op);assert.equal(s.requests.length,calls);
  s.controlled(()=>({contractVersion:'controlled-feelings.v1',feelingUpdates:[],processFeeling:{direction:'positive',level:3,reason:'本人仍可感受受控休息'}}));const w=await s.step();assert.equal(w.characters[0].plan.action.content,'使用者的行動保持不變');assert.equal(w.characters[0].mentalEnergy.history.filter(h=>h.kind==='regulation').length,1);
  await s.post({operation:'intervene',target:'owner',text:'仍有新的可知經歷'});await s.post({operation:'set-budget',limits:{calls:1,tokens:null}});const capped=await s.read(),count=s.requests.length,r=await s.post({operation:'advance',minutes:5,timeContract:'five-minute-v1',mode:'openai',model:'gpt-6-luna'});assert.notEqual(r.status,200);assert.equal(s.requests.length,count);assert.deepEqual((await s.read()).characters,capped.characters);
 }finally{s.restore();}
});
test('exact openings must fit every declared capacity before drawing instead of selecting capacity by retries',async()=>{
 const random=Math.random;try{
  for(const opening of [{current:80},{minimum:60,maximum:90,current:40,stage:'尚可'},{capacity:65,current:3,stage:'充沛'}]){const s=scenario();let draws=0;Math.random=()=>{draws++;return .5;};const r=await s.post(enable(opening));assert.equal(r.status,400);assert.equal(draws,0);assert.equal((await s.read()).characters[0].mentalEnergy,undefined);}
  for(const [sample,expected] of [[0,80],[.999999,90]]){const s=scenario();Math.random=()=>sample;const r=await s.post(enable({minimum:80,maximum:90,current:80}));assert.equal(r.status,200,await r.clone().text());const c=(await s.read()).characters[0];assert.equal(c.mentalEnergy.policy.maximum,expected);assert.equal(c.mentalEnergy.value,80);}
 }finally{Math.random=random;}
});

// Runtime already passed review. These are original-contract boundary evidence,
// not a claimed RED/bug fix. Only creation randomness, time and transport vary.
test('actual formal enablement projects all stage boundaries and payment availability without numeric energy in provider requests',async()=>{
 const random=Math.random;Math.random=()=>0; // Saved seed0: owner/natural/slot0 is d6 face2, no first-slot loss.
 const cases=[[0,'見底',false],[1,'見底',false],[2,'吃緊',false],[3,'吃緊',false],[4,'尚可',false],[5,'尚可',true],[6,'有餘',true],[7,'有餘',true],[8,'充沛',true],[9,'充沛',true],[10,'充沛',true]];
 try{for(const [current,feeling,canRegulate] of cases){
  const s=await lifeScene(w=>{w.minute=0;},{capacity:10,current});try{
   const enabled=(await s.read()).characters[0].mentalEnergy;assert.equal(enabled.policy.process.seed,0);assert.equal(enabled.value,current);
   s.normal(()=>({type:'rest',target:'',content:'依自己的餘裕選擇休息',durationMinutes:60,timeIntent:{kind:'open-ended',maxMinutes:null},emotionRegulation:null}));
   const w=await s.step(),request=s.requests.find(r=>r.input.self);assert.ok(request,'actual provider dispatch');assert.deepEqual(request.input.self.mentalEnergy,{feeling,canRegulate},`current ${current}/10`);
   const saved=w.characters[0].mentalEnergy;assert.equal(saved.value,current);assert.equal(saved.policy.maximum,10);assert.equal(saved.history[0].draws.find(d=>d.source==='natural').face,2);assert.equal(saved.history.some(h=>h.kind==='regulation'),false);assert.deepEqual((await s.read()).characters[0].mentalEnergy,saved);
  }finally{s.restore();}
 }}finally{Math.random=random;}
});
test('exactly five pays once to zero, four rejects the whole candidate, and either may voluntarily retain energy',async()=>{
 const random=Math.random;Math.random=()=>0;
 try{for(const [current,regulate] of [[5,true],[4,true],[5,false],[4,false]]){
  const s=await lifeScene(w=>{w.minute=0;},{capacity:10,current});try{
   const before=await s.read();s.normal(()=>({type:'rest',target:'',content:'調節與保留都由自己選擇',durationMinutes:60,timeIntent:{kind:'open-ended',maxMinutes:null},mood:'頂層文字不能免費改心情',emotionRegulation:regulate?{effort:'放慢呼吸',reason:'願意照顧現在的低落',mood:'稍微穩住'}:null}));
   const op={operation:'advance',minutes:5,timeContract:'five-minute-v1',mode:'openai',model:'gpt-6-luna',operationId:id()},response=await s.post(op),body=await response.json(),w=await s.read(),c=w.characters[0];
   assert.deepEqual(s.requests[0].input.self.mentalEnergy,{feeling:'尚可',canRegulate:current===5});assert.equal(s.requests.length,1);
   if(current===4&&regulate){assert.equal(response.status,502);assert.deepEqual(w.characters,before.characters);assert.equal(w.minute,before.minute);assert.equal(w.aiUsage.totalCalls,1);assert.equal(c.mood,'低落');}
   else{assert.equal(response.status,200,body.error);assert.equal(c.mentalEnergy.value,regulate?0:current);assert.equal(c.mood,regulate?'稍微穩住':'低落');const payments=c.mentalEnergy.history.filter(h=>h.kind==='regulation');assert.equal(payments.length,regulate?1:0);if(regulate){assert.equal(payments[0].before,5);assert.equal(payments[0].after,0);}assert.equal(c.plan.action.content,'調節與保留都由自己選擇');}
   assert.deepEqual(await(await s.post(op)).json(),body);assert.equal(s.requests.length,1,'original ID never dispatches or charges again');assert.deepEqual((await s.read()).characters,w.characters);
  }finally{s.restore();}
 }}finally{Math.random=random;}
});
