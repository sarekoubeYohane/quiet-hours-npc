/* eslint-disable @typescript-eslint/no-require-imports -- Explicit model transport fixtures; API/effects/SQLite remain real. */
const {nonPhoneObjects}=require('./fixtures/non-phone-objects.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=name=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,name+'.cjs'));
const store=load('store'),{seedWorld}=load('world');
const f=require('./routine-world-programs-fixture.cjs');
const {scenario,preparation,propose,rest,stock,advance}=require('./alternative-food-fixture.cjs');
test('a known-place proposal prepares a different food source, then actual ingestion and next decision survive SQLite reload and replay',async()=>{
 const s=await scenario();try{
  s.choose(propose('用另一個來源的麵粉做一份薄餅','準備食物'));s.reply(f.approval([preparation()],'prepare-flatbread','薄餅'));
  let w=await advance(s);assert.equal(w.supplies.find(x=>x.id==='finished-meal').remaining,0);const meal=w.objects.find(x=>x.kind==='meal');assert.ok(meal);assert.equal(meal.lifecycle,'active');assert.equal(meal.holder,'owner');assert.equal(w.characters[0].needs.values.hunger,20.75,'Preparing food is not ingestion');assert.equal(meal.sources.length,1);assert.equal(w.objects.find(x=>x.id===meal.sources[0].id).lifecycle,'consumed');assert.equal(s.inputs.find(i=>i.contractVersion==='world-adjudication.v1').action.target,'cafe');
  s.choose(propose('吃這份薄餅','進食',meal.id));s.reply({status:'accepted',completionMinutes:15,effects:[{kind:'ingest',version:1,objectId:meal.id,expectedRevision:meal.revision,hungerRelief:12,thirstRelief:0}],check:null});const op={operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()};const r=await s.post(op);assert.equal(r.status,200,await r.clone().text());w=await s.read();assert.equal(w.objects.find(x=>x.id===meal.id).lifecycle,'consumed');assert.equal(w.characters[0].needs.values.hunger,9.5);assert.equal(s.judgments(),2);const used=w.aiUsage.totalCalls;
  assert.equal((await s.post(op)).status,200);assert.equal((await s.read()).aiUsage.totalCalls,used);assert.deepEqual((await s.read()).objects,w.objects);
  s.choose(rest);await advance(s);const input=s.inputs.filter(i=>i.contractVersion!=='world-adjudication.v1').at(-1);assert.match(JSON.stringify(input),/薄餅/);assert.match(JSON.stringify(input),/攝取|吃這份薄餅|食用|消耗/);assert.equal(s.judgments(),2);assert.equal((await s.read()).supplies.find(x=>x.id==='finished-meal').remaining,0);
 }finally{s.restore();}
});
test('the same exhausted ingredient cannot be renamed into a new background source',async()=>{
 const s=await scenario({prepare:w=>{w.supplies.push({...stock(),remaining:0});}});try{
  const program=preparation();program.bindings[0].background.label='換個名字的常備麵粉';s.reply(f.approval([program],'prepare-flatbread','薄餅'));s.choose(propose('用另一個來源的麵粉做一份薄餅','準備食物'));
  const w=await advance(s);assert.equal(nonPhoneObjects(w).length,0);assert.equal(w.characters[0].needs.values.hunger,20.75);assert.equal(w.supplies.length,2);assert.equal(w.supplies.find(x=>x.id==='flour').remaining,0);assert.match(w.routineAudit.at(-1).reason,/有限材料|背景不會補回/);assert.equal(w.characters[0].plan,undefined);
 }finally{s.restore();}
});
test('a visitor may prepare a meal from a permitted concrete source without gaining ordinary background authority',async()=>{
 const s=await scenario({actorId:'cass',prepare:w=>{w.supplies.push(stock('cass'));}});try{
  s.choose(propose('用自己獲准的麵粉做薄餅','準備食物'));
  s.reply(input=>{assert.equal(input.routineOffer,null);return {status:'accepted',completionMinutes:15,check:null,effects:[{kind:'materialize',supplyId:'flour',expectedRemaining:1},{...f.form('訪客做的一份薄餅','meal'),inputs:[{objectId:'flour:1',expectedRevision:1,quantity:{amount:1,unit:'item'},disposition:'consumed'}],outputs:[{id:'visitor-meal',label:'訪客做的一份薄餅',kind:'meal',consumable:true,quantity:{amount:1,unit:'serving'},state:[]}]}]};});
  let w=await advance(s);assert.equal(w.supplies.length,2);assert.equal(w.supplies.find(x=>x.id==='flour').remaining,0);assert.equal(w.objects.find(x=>x.id==='visitor-meal').owner,'cass');assert.equal(w.routineRules,undefined);assert.equal(w.characters[0].needs.values.hunger,20.75);
  const meal=w.objects.find(x=>x.id==='visitor-meal');s.choose(propose('吃這份薄餅','進食',meal.id));s.reply({status:'accepted',completionMinutes:15,check:null,effects:[{kind:'ingest',version:1,objectId:meal.id,expectedRevision:meal.revision,hungerRelief:12,thirstRelief:0}]});w=await advance(s);assert.equal(w.objects.find(x=>x.id===meal.id).lifecycle,'consumed');assert.equal(w.characters[0].needs.values.hunger,9.5);assert.equal(w.supplies.find(x=>x.id==='finished-meal').remaining,0);
 }finally{s.restore();}
});
test('an unconditional visitor background approval rolls back instead of inventing a new food source',async()=>{
 const s=await scenario({actorId:'cass'});try{
  s.choose(propose('用另一個來源的麵粉做一份薄餅','準備食物'));s.reply(input=>{assert.equal(input.routineOffer,null);return f.approval([preparation()],'prepare-flatbread','薄餅');});
  const before=await s.read(),op={operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()};const r=await s.post(op);assert.equal(r.status,502);const after=await s.read();assert.equal(after.turn,before.turn);assert.deepEqual(after.supplies,before.supplies);assert.equal(after.objects,undefined);assert.equal(after.routineRules,undefined);assert.equal(after.characters[0].needs,undefined);const used=after.aiUsage.totalCalls;await s.post(op);assert.equal((await s.read()).aiUsage.totalCalls,used);assert.equal(s.judgments(),1);
 }finally{s.restore();}
});
test('a visitor physical preparation uses real finite stock and records lack of permission without forging consent',async()=>{
 const s=await scenario({actorId:'cass',prepare:w=>{w.supplies.push(stock());}});try{
  s.choose(propose('擅取眼前麵粉做一份薄餅','準備食物'));s.reply(input=>{assert.equal(input.routineOffer,null);return {status:'accepted',completionMinutes:15,check:null,effects:[{kind:'physical',version:1,operation:'materialize',supplyId:'flour',expectedRemaining:1,reason:'這是可接觸的實物，沒有物主許可。'},{...f.form('訪客做的一份薄餅','meal'),access:'physical',inputs:[{objectId:'flour:1',expectedRevision:1,quantity:{amount:1,unit:'item'},disposition:'consumed'}],outputs:[{id:'visitor-meal',label:'訪客做的一份薄餅',kind:'meal',consumable:true,quantity:{amount:1,unit:'serving'},state:[]}]}]};});
  const w=await advance(s);assert.equal(w.supplies.find(x=>x.id==='flour').remaining,0);assert.deepEqual(w.supplies.find(x=>x.id==='flour').allowedTo,['owner']);const raw=w.objects.find(x=>x.id==='flour:1'),meal=w.objects.find(x=>x.id==='visitor-meal');assert.equal(raw.owner,'owner');assert.ok(raw.unpermittedCount>0);assert.equal(meal.owner,'owner');assert.equal(meal.holder,'cass');assert.equal(meal.acceptedBy,undefined);assert.equal(w.characters[0].needs.values.hunger,20.75);assert.equal(w.routineRules,undefined);
 }finally{s.restore();}
});
test('asking another character to prepare food does not execute their work or imply their agreement',async()=>{
 const s=await scenario({actorId:'cass',prepare:w=>{const owner=w.characters.find(c=>c.id==='owner');owner.location='cafe';owner.region='cafe-front';}});try{
  s.choose({...rest,type:'say',target:'owner',content:'店主，可以請你另外做一份薄餅嗎？',timeIntent:{kind:'completion',maxMinutes:null}});const w=await advance(s);assert.equal(s.judgments(),0);assert.equal(nonPhoneObjects(w).length,0);assert.equal(w.supplies.length,1);assert.equal(w.supplies[0].remaining,0);assert.equal(w.characters.find(c=>c.id==='owner').plan,undefined);assert.equal(w.characters.find(c=>c.id==='cass').needs.values.hunger,20.75);assert.equal(w.routineRules,undefined);
 }finally{s.restore();}
});
test('save conflict after alternative preparation leaves no half source or serving and replay does not redispatch',async()=>{
 const s=await scenario();try{
  s.choose(propose('用另一個來源的麵粉做一份薄餅','準備食物'));s.reply(f.approval([preparation()],'prepare-flatbread','薄餅'));const before=await s.read();store.conflictOnNextSave();const op={operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()};assert.equal((await s.post(op)).status,502);const w=await s.read();assert.deepEqual(w.supplies,before.supplies);assert.equal(w.objects,undefined);assert.equal(w.routineRules,undefined);assert.equal(w.characters[0].needs,undefined);assert.equal(w.aiUsage.totalCalls,2);await s.post(op);assert.equal((await s.read()).aiUsage.totalCalls,2);assert.equal(s.judgments(),1);
 }finally{s.restore();}
});
test('a later character error rolls back the alternate source and all formation while retaining dispatched usage',async()=>{
 const s=await scenario({prepare:w=>{const cass=seedWorld().characters.find(c=>c.id==='cass');cass.location='cafe';cass.region='cafe-front';w.characters.push(cass);}});try{
  s.choose(input=>input.self.id==='owner'?propose('用另一個來源的麵粉做一份薄餅','準備食物'):{invalid:'later actor fixture'});s.reply(f.approval([preparation()],'prepare-flatbread','薄餅'));const before=await s.read(),op={operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()};assert.equal((await s.post(op)).status,502);const w=await s.read();assert.deepEqual(w.supplies,before.supplies);assert.equal(w.objects,undefined);assert.equal(w.routineRules,undefined);assert.ok(w.characters.every(c=>c.needs===undefined));assert.equal(w.aiUsage.totalCalls,3);await s.post(op);assert.equal((await s.read()).aiUsage.totalCalls,3);assert.equal(s.judgments(),1);
 }finally{s.restore();}
});
