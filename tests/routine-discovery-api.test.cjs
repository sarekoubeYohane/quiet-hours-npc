/* eslint-disable @typescript-eslint/no-require-imports -- Public API/SQLite and actual request boundaries; external model transport only is fixed. */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {scenario:sourceScenario,propose,rest,advance}=require('./alternative-food-fixture.cjs');
const scenario=async options=>{const s=await sourceScenario(options),random=Math.random;Math.random=()=>.675;return {...s,restore:()=>{Math.random=random;s.restore();}};};
const {nonPhoneObjects}=require('./fixtures/non-phone-objects.cjs');
const f=require('./routine-world-programs-fixture.cjs');
const load=name=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,name+'.cjs'));
const {search,initial}=require('./routine-discovery-fixture.cjs');

test('ordinary background search confirms a source without taking it; SQLite and next actual messages support a later real acquisition',async()=>{
 const s=await scenario({prepare:initial});try{
  s.choose(propose('查看這裡可用的普通備餐材料','確認可用材料'));s.reply(f.approval([search()],'find-ingredient'));
  let w=await advance(s);assert.equal(w.supplies.length,1);const source=w.supplies[0];assert.equal(source.pending,undefined);assert.deepEqual(source.knownTo,['owner']);assert.equal(source.remaining,1);assert.equal(source.background.sequence,0);assert.equal(nonPhoneObjects(w).length,0);assert.equal(s.judgments(),1);
  s.choose(rest);await advance(s);const next=s.inputs.at(-1);assert.ok(next.supplies.some(x=>x.id===source.id));assert.equal(JSON.stringify(s.requests.at(-1).messages).includes('allowedTo'),false);
  s.choose(propose('取一份剛才找到的材料','取得材料',source.id));s.reply({status:'accepted',completionMinutes:15,effects:[{kind:'materialize',supplyId:source.id,expectedRemaining:1}],check:null});w=await advance(s);assert.equal(w.supplies[0].id,source.id);assert.equal(w.supplies[0].background.sequence,1);assert.equal(w.supplies[0].remaining,1);const actual=nonPhoneObjects(w)[0];assert.equal(actual.source,source.id);assert.equal(actual.holder,'owner');assert.equal(actual.owner,'owner');assert.equal(s.judgments(),2);
 }finally{s.restore();}
});

test('a synonymous new search reuses the established canonical source even after a missed discovery, without generating or rerolling another supply',async()=>{
 const s=await scenario({prepare:initial});try{
  Math.random=()=>.075;s.choose(propose('查看這裡可用的普通備餐材料','確認可用材料'));s.reply(f.approval([search()],'find-ingredient'));let w=await advance(s);const id=w.supplies[0].id;assert.deepEqual(w.supplies[0].knownTo,[]);assert.equal(w.supplies[0].pending,undefined);
  let rolls=0;Math.random=()=>{rolls++;return .975;};const content='檢查這裡的日常烹飪原料';s.choose(propose(content,'確認可用材料'));s.reply(f.approval([search({content,label:'日常烹飪原料'})],'find-ingredient'));w=await advance(s);assert.equal(w.supplies.length,1);assert.equal(w.supplies[0].id,id);assert.equal(rolls,0);assert.deepEqual(w.supplies[0].knownTo,[]);assert.equal(nonPhoneObjects(w).length,0);assert.equal(s.judgments(),2);
 }finally{s.restore();}
});

test('an unknown but applicable finite ingredient scope constrains authority confirmation without leaking hidden stock reasons',async()=>{
 const s=await scenario({prepare:w=>{initial(w);w.supplies=[{id:'finite-ordinary-materials',label:'普通備餐原料總來源',kind:'cooking-ingredient',region:'cafe-front',owner:'owner',knownTo:[],allowedTo:['owner'],remaining:0,initialState:{category:'食材',reason:'PRIVATE_STOCK_REASON'},stateExposure:{reason:'hidden'},consumable:false}];}});try{
  s.choose(propose('查看這裡可用的普通備餐材料','確認可用材料'));s.reply(input=>{assert.ok(input.supplies.some(x=>x.id==='finite-ordinary-materials'));return f.approval([search()],'find-ingredient');});let w=await advance(s);assert.equal(w.supplies.length,1);assert.equal(w.supplies[0].id,'finite-ordinary-materials');assert.equal(w.supplies[0].remaining,0);assert.equal(nonPhoneObjects(w).length,0);
  s.choose(rest);await advance(s);assert.equal(JSON.stringify(s.requests.at(-1).messages).includes('PRIVATE_STOCK_REASON'),false);assert.equal(JSON.stringify(s.inputs.at(-1)).includes('缺貨'),false);assert.equal(s.judgments(),1);
 }finally{s.restore();}
});

test('another operator discovers the canonical background with original ownership and permissions instead of creating a private replacement',async()=>{
 for(const permitted of [true,false]){
  const allowedTo=permitted?['owner','cass']:['owner'];
  const s=await scenario({actorId:'cass',prepare:w=>{initial(w);w.routinePlaces[0].operators.push('cass');w.supplies=[{id:'shared-ordinary-source',label:'店內普通備餐材料',kind:'cooking-ingredient',region:'cafe-front',owner:'owner',knownTo:[],allowedTo,remaining:1,initialState:{category:'食材'},stateExposure:{category:'public'},consumable:false,quantity:{amount:1,unit:'item'},background:{ruleId:'prior-confirmation',sequence:3,scope:{version:1,role:'material',subject:'食材'}}}];}});try{
   s.choose(propose('查看這裡可用的普通備餐材料','確認可用材料'));s.reply(f.approval([search()],'find-ingredient'));let w=await advance(s);assert.equal(w.supplies.length,1);assert.equal(w.supplies[0].id,'shared-ordinary-source');assert.equal(w.supplies[0].owner,'owner');assert.deepEqual(w.supplies[0].allowedTo,allowedTo);assert.deepEqual(w.supplies[0].knownTo,['cass']);assert.equal(w.supplies[0].background.sequence,3);
   s.choose(propose('取一份剛才找到的材料','取得材料','shared-ordinary-source'));s.reply({status:'accepted',completionMinutes:15,effects:[{kind:'materialize',supplyId:'shared-ordinary-source',expectedRemaining:1}],check:null});const r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,permitted?200:502);w=await s.read();assert.equal(w.supplies.length,1);assert.equal(w.supplies[0].owner,'owner');if(permitted){assert.equal(nonPhoneObjects(w)[0].owner,'owner');assert.equal(nonPhoneObjects(w)[0].holder,'cass');}else assert.equal(nonPhoneObjects(w).length,0);
  }finally{s.restore();}
 }
});

test('validation and reads do not perceive pending background; the later phase alone establishes it and cancellation discards only uncommitted background',async()=>{
 for(const cancel of [false,true]){
  const s=await scenario({prepare:initial});try{
   let rolls=0;Math.random=()=>{rolls++;return .675;};s.choose(propose('查看這裡可用的普通備餐材料','確認可用材料'));s.reply(f.approval([search({minutes:30})],'find-ingredient'));let w=await advance(s);const id=w.supplies[0].id;assert.equal(w.supplies[0].pending,true);assert.deepEqual(w.supplies[0].knownTo,[]);assert.equal(rolls,0);assert.equal(nonPhoneObjects(w).length,0);assert.equal(w.characters[0].observations.some(x=>x.supplyId===id),false);const before=load('store').snapshot();await s.read();await s.read();assert.deepEqual(load('store').snapshot(),before);
   if(cancel){assert.equal((await s.post({operation:'takeover'})).status,200);w=await s.read();assert.equal(w.supplies.length,0);assert.equal(rolls,0);assert.equal(w.characters[0].plan,undefined);}else{w=await advance(s);assert.equal(w.supplies[0].id,id);assert.equal(w.supplies[0].pending,undefined);assert.deepEqual(w.supplies[0].knownTo,['owner']);assert.equal(rolls,1);assert.equal(w.supplies[0].background.sequence,0);assert.equal(s.judgments(),1);}
  }finally{s.restore();}
 }
});

test('operator revocation or a newly applicable finite restriction before the scheduled phase prevents background confirmation',async()=>{
 for(const condition of ['operator','finite']){
  const s=await scenario({prepare:initial});try{
   s.choose(propose('查看這裡可用的普通備餐材料','確認可用材料'));s.reply(f.approval([search({minutes:30})],'find-ingredient'));let w=await advance(s);assert.equal(w.supplies[0].pending,true);const pendingId=w.supplies[0].id;
   if(condition==='operator')w.routinePlaces[0].operators=[];else w.supplies.push({id:'new-finite-limit',label:'原料總來源',kind:'cooking-ingredient',region:'cafe-front',owner:'owner',knownTo:[],allowedTo:['owner'],remaining:0,initialState:{category:'食材'}});load('store').replaceCommittedWorld(w);
   let rolls=0;Math.random=()=>{rolls++;return .675;};w=await advance(s);assert.equal(w.supplies.some(x=>x.id===pendingId),false);assert.equal(nonPhoneObjects(w).length,0);assert.equal(rolls,0);assert.equal(w.characters[0].observations.some(x=>x.supplyId===pendingId),false);assert.equal(s.judgments(),1);
  }finally{s.restore();}
 }
});

test('missing normal-place authority, visitors and invalid large or physical background approvals do not create sources',async()=>{
 for(const condition of ['no-place','visitor','invalid-quantity','physical']){
  const s=await scenario({actorId:condition==='visitor'?'cass':'owner',prepare:w=>{initial(w);if(condition==='no-place')w.routinePlaces=[];}});try{
   const program=search();if(condition==='invalid-quantity')program.bindings[0].background.quantity.amount=1e20;if(condition==='physical')program.bindings[0].access='physical';
   s.choose(propose('查看這裡可用的普通備餐材料','確認可用材料'));s.reply(f.approval([program],'find-ingredient'));const r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,502);const w=await s.read();assert.equal(w.supplies.length,0);assert.equal(nonPhoneObjects(w).length,0);assert.equal(w.routineRules,undefined);
  }finally{s.restore();}
 }
 for(const content of ['查找珍稀金屬','要求一萬人份備餐材料']){
  const s=await scenario({prepare:initial});try{s.choose(propose(content,'確認可用材料'));s.reply({status:'denied',effects:[],check:null,explanation:{summary:'不屬於此處已確認的普通供應範圍',facts:[]}});const w=await advance(s);assert.equal(w.supplies.length,0);assert.equal(nonPhoneObjects(w).length,0);assert.equal(w.routineRules,undefined);assert.equal(s.judgments(),1);}finally{s.restore();}
 }
});

test('background confirmation rolls back with save failures and later actor errors; operation replay never generates again',async()=>{
 for(const fault of ['conflict','before-save','later-actor']){
  const s=await scenario({prepare:w=>{initial(w);if(fault==='later-actor'){const other=load('world').seedWorld().characters.find(c=>c.id==='cass');other.location='cafe';other.region='cafe-front';w.characters.push(other);}}});try{
   s.choose(input=>input.self.id==='owner'?propose('查看這裡可用的普通備餐材料','確認可用材料'):{invalid:'late actor fixture'});s.reply(f.approval([search()],'find-ingredient'));if(fault==='conflict')load('store').conflictOnNextSave();if(fault==='before-save')load('store').throwBeforeNextSave();const op={operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()};assert.equal((await s.post(op)).status,502);let w=await s.read();assert.equal(w.supplies.length,0);assert.equal(nonPhoneObjects(w).length,0);assert.equal(w.routineRules,undefined);assert.equal(w.characters[0].observations.some(x=>x.supplyId),false);const calls=w.aiUsage.totalCalls;await s.post(op);w=await s.read();assert.equal(w.aiUsage.totalCalls,calls);assert.equal(w.supplies.length,0);
  }finally{s.restore();}
 }
});

test('supply capacity and old-world reads remain bounded and never build sources on read',async()=>{
 const s=await scenario({prepare:w=>{initial(w);w.supplies=Array.from({length:512},(_,i)=>({id:'unrelated-'+i,label:'其他配備',kind:'decoration',region:'cafe-front',owner:'owner',knownTo:[],allowedTo:['owner'],remaining:1,initialState:{}}));}});try{
  const before=load('store').snapshot();await s.read();await s.read();assert.deepEqual(load('store').snapshot(),before);s.choose(propose('查看這裡可用的普通備餐材料','確認可用材料'));s.reply(f.approval([search()],'find-ingredient'));const r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,502);assert.match(await r.clone().text(),/容量/);const w=await s.read();assert.equal(w.supplies.length,512);assert.equal(w.routineRules,undefined);assert.equal(w.supplies.some(x=>x.background),false);
 }finally{s.restore();}
});

test('switching an unfinished search to a synonymous method replaces only its uncommitted source and completes the new confirmation',async()=>{
 const s=await scenario({prepare:initial});try{
  s.choose(propose('查看這裡可用的普通備餐材料','確認可用材料'));s.reply(f.approval([search({minutes:30})],'find-ingredient'));let w=await advance(s);const discarded=w.supplies[0].id;assert.equal(w.supplies[0].pending,true);assert.deepEqual(w.supplies[0].knownTo,[]);
  assert.equal((await s.post({operation:'intervene',target:'owner',text:'目前想調整查看的方法嗎？'})).status,200);const content='換個方法查看這裡的備餐原料';s.choose(propose(content,'確認可用材料'));s.reply(f.approval([search({content,label:'日常烹飪原料'})],'find-ingredient'));w=await advance(s);assert.equal(w.supplies.length,1);assert.notEqual(w.supplies[0].id,discarded);assert.equal(w.supplies[0].pending,undefined);assert.deepEqual(w.supplies[0].knownTo,['owner']);assert.equal(nonPhoneObjects(w).length,0);assert.equal(s.judgments(),2);
 }finally{s.restore();}
});

test('legacy ordinary sources are not rewritten on read and new searches preserve consumed identities across successful replay and later use',async()=>{
 const s=await scenario({prepare:w=>{initial(w);w.supplies=[{id:'legacy-ordinary',label:'先前已成立的備餐材料',kind:'cooking-ingredient',region:'cafe-front',owner:'owner',knownTo:['owner'],allowedTo:['owner'],remaining:1,initialState:{category:'食材'},stateExposure:{category:'public'},consumable:false,quantity:{amount:1,unit:'item'},background:{ruleId:'legacy-rule',sequence:2}}];w.objects=[{id:'legacy-ordinary:1',source:'legacy-ordinary',label:'用掉的上一份原料',kind:'cooking-ingredient',region:'cafe-front',holder:'owner',owner:'owner',knownTo:['owner'],allowedTo:['owner'],revision:2,state:{category:'食材'},lifecycle:'consumed',consumable:false}];}});try{
  const before=load('store').snapshot();await s.read();await s.read();assert.deepEqual(load('store').snapshot(),before);assert.equal(before.supplies[0].background.scope,undefined);
  s.choose(propose('查看這裡可用的普通備餐材料','確認可用材料'));s.reply(f.approval([search()],'find-ingredient'));const op={operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()};assert.equal((await s.post(op)).status,200);let w=await s.read();assert.equal(w.supplies.length,1);assert.equal(w.supplies[0].id,'legacy-ordinary');assert.equal(w.supplies[0].background.scope,undefined);assert.equal(w.objects.find(x=>x.id==='legacy-ordinary:1').lifecycle,'consumed');const used=w.aiUsage.totalCalls;await s.post(op);assert.equal((await s.read()).aiUsage.totalCalls,used);assert.equal((await s.read()).supplies.length,1);
  s.choose(propose('取新的一份原料','取得材料','legacy-ordinary'));s.reply({status:'accepted',completionMinutes:15,effects:[{kind:'materialize',supplyId:'legacy-ordinary',expectedRemaining:1}],check:null});w=await advance(s);assert.equal(w.objects.find(x=>x.id==='legacy-ordinary:1').lifecycle,'consumed');assert.equal(w.objects.find(x=>x.id==='legacy-ordinary:2').lifecycle,'active');assert.equal(w.supplies[0].background.sequence,3);assert.equal(w.supplies.length,1);s.choose(rest);await advance(s);assert.ok(s.inputs.at(-1).objects.some(x=>x.id==='legacy-ordinary:2'));assert.equal(s.inputs.at(-1).objects.some(x=>x.id==='legacy-ordinary:1'),false);
 }finally{s.restore();}
});

test('a missed optional search does not prevent a known ordinary preparation from contacting the same established source directly',async()=>{
 const program=f.cafePrograms().find(item=>item.operation==='food'),content=program.methods[0].content,purpose=program.methods[0].purpose;assert.deepEqual(program.bindings[0].background.initialState,[]);
 const s=await scenario({prepare:w=>{initial(w);w.routineRules=[{id:'known-preparation',version:3,family:'cafe-service',origin:'cafe',knownTo:['owner'],operations:['food'],programs:[program],worldTimings:[{operation:'food',minutes:15}]}];}});try{
  Math.random=()=>.075;s.choose(propose('查看這裡可用的普通備餐材料','確認可用材料'));s.reply(f.approval([search()],'find-ingredient'));let w=await advance(s);const id=w.supplies[0].id;assert.equal(w.supplies[0].pending,undefined);assert.deepEqual(w.supplies[0].knownTo,[]);assert.equal(nonPhoneObjects(w).length,0);
  s.choose(propose(content,purpose));s.reply(f.approval([program],'food'));w=await advance(s);assert.equal(w.supplies.length,1);assert.equal(w.supplies[0].id,id);assert.equal(w.supplies[0].background.sequence,1);assert.deepEqual(w.supplies[0].knownTo,['owner']);assert.equal(w.supplies[0].owner,'owner');assert.deepEqual(w.supplies[0].allowedTo,['owner']);const raw=nonPhoneObjects(w).find(x=>x.source===id),meal=nonPhoneObjects(w).find(x=>x.kind==='meal');assert.equal(raw.lifecycle,'consumed');assert.equal(meal.lifecycle,'active');assert.equal(meal.owner,'owner');assert.equal(meal.holder,'owner');assert.equal(s.judgments(),1);s.choose(rest);await advance(s);assert.ok(s.inputs.at(-1).objects.some(x=>x.id===meal.id));assert.equal(s.inputs.at(-1).objects.some(x=>x.id===raw.id),false);
 }finally{s.restore();}
});

test('an unknown ordinary source cannot be materialized by an arbitrary free candidate without the bound routine contact authority',async()=>{
 const s=await scenario({prepare:initial});try{
  Math.random=()=>.075;s.choose(propose('查看這裡可用的普通備餐材料','確認可用材料'));s.reply(f.approval([search()],'find-ingredient'));let w=await advance(s);const source=w.supplies[0];assert.deepEqual(source.knownTo,[]);
  s.choose(propose('試著直接拿一份材料','取得材料'));s.reply({status:'accepted',completionMinutes:15,effects:[{kind:'materialize',supplyId:source.id,expectedRemaining:1}],check:null});const r=await s.post({operation:'advance',minutes:15});assert.equal(r.status,502);w=await s.read();assert.equal(w.supplies.length,1);assert.equal(w.supplies[0].id,source.id);assert.deepEqual(w.supplies[0].knownTo,[]);assert.equal(w.supplies[0].background.sequence,0);assert.equal(nonPhoneObjects(w).length,0);
 }finally{s.restore();}
});
