/* eslint-disable @typescript-eslint/no-require-imports -- API and SQLite remain real; only model transport is fixed. */
const {nonPhoneObjects}=require('./fixtures/non-phone-objects.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {scenario,propose,rest,stock,advance}=require('./alternative-food-fixture.cjs');

test('an exhausted old meal does not block explicitly selected usable bread through the known method, reload and next actual request',async()=>{
 const s=await scenario({prepare:w=>{w.routineRules=[{id:'known-food',version:1,family:'cafe-service',operations:['food'],origin:'cafe',knownTo:['owner']}];w.supplies.push({...stock(),id:'bread',label:'麵包',initialState:{material:'麵包'}});}});
 try{
  s.choose(propose('取得一份簡餐','用餐','bread'));
  const w=await advance(s),bread=w.objects?.find(o=>o.source==='bread');
  assert.ok(bread,'the selected usable source must form an actual object');
  assert.equal(bread.holder,'owner');assert.equal(w.supplies.find(x=>x.id==='bread').remaining,0);assert.equal(w.supplies.find(x=>x.id==='finished-meal').remaining,0);assert.equal(s.judgments(),0);
  s.choose(rest);await advance(s);const request=s.requests.at(-1);assert.match(JSON.stringify(request.messages),/麵包/);assert.equal(s.judgments(),0);
 }finally{s.restore();}
});

const path=require('node:path'),store=require(path.join(process.env.QUIET_HOURS_TEST_BUILD,'store.cjs'));
const knownFood=w=>{w.routineRules=[{id:'known-food',version:1,family:'cafe-service',operations:['food'],origin:'cafe',knownTo:['owner']}];};
for(const label of ['麵包','另一份食物','某個新名稱'])test('selected source identity survives display rename: '+label,async()=>{
 const s=await scenario({prepare:w=>{knownFood(w);w.supplies.push({...stock(),id:'bread',label});}});
 try{
  s.choose(propose('取得一份簡餐','用餐','bread'));
  const operation={operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()};
  assert.equal((await s.post(operation)).status,200);const w=await s.read();assert.equal(w.objects.find(o=>o.source==='bread').label,label);assert.equal(w.supplies.find(x=>x.id==='finished-meal').remaining,0);
  assert.equal((await s.post(operation)).status,200);assert.deepEqual((await s.read()).objects,w.objects);assert.equal((await s.read()).aiUsage.totalCalls,w.aiUsage.totalCalls);assert.equal(s.judgments(),0);
 }finally{s.restore();}
});

for(const label of ['最後一份簡餐','麵包','改名後的食物'])test('an explicitly selected exhausted source remains exhausted: '+label,async()=>{
 const s=await scenario({prepare:w=>{knownFood(w);w.supplies[0].label=label;}});
 try{s.choose(propose('取得一份簡餐','用餐','finished-meal'));const w=await advance(s);assert.equal(nonPhoneObjects(w).length,0);assert.equal(w.supplies.length,1);assert.equal(w.supplies[0].remaining,0);assert.equal(s.judgments(),0);}finally{s.restore();}
});

test('a finite dish scope still prevents ordinary background substitution while unrelated ordinary supply remains usable',async()=>{
 const s=await scenario({prepare:w=>{knownFood(w);w.supplies[0].label='三明治';}});
 try{
  s.choose(propose('準備一份三明治','招待客人'));let w=await advance(s);assert.equal(nonPhoneObjects(w).length,0);assert.equal(w.supplies.length,1);assert.equal(w.supplies[0].remaining,0);
  s.choose(propose('準備一份簡餐','招待客人'));w=await advance(s);assert.equal(w.objects.filter(o=>o.kind==='food').length,1);assert.equal(w.supplies.find(x=>x.id==='finished-meal').remaining,0);assert.equal(w.supplies.find(x=>x.background).background.sequence,1);assert.equal(s.judgments(),0);
 }finally{s.restore();}
});

test('saving a selected independent source is atomic and failed operation replay never duplicates formation',async()=>{
 const s=await scenario({prepare:w=>{knownFood(w);w.supplies.push({...stock(),id:'bread',label:'麵包'});}});
 try{
  s.choose(propose('取得一份簡餐','用餐','bread'));store.conflictOnNextSave();const operation={operation:'advance',minutes:15,operationId:Date.now()+':'+crypto.randomUUID()};
  assert.equal((await s.post(operation)).status,502);let w=await s.read();assert.equal(nonPhoneObjects(w).length,0);assert.equal(w.supplies.find(x=>x.id==='bread').remaining,1);const used=w.aiUsage.totalCalls;
  await s.post(operation);w=await s.read();assert.equal(nonPhoneObjects(w).length,0);assert.equal(w.aiUsage.totalCalls,used);assert.equal(s.judgments(),0);
 }finally{s.restore();}
});


test('a consumed selected object cannot be resurrected through a known food method',async()=>{
 const s=await scenario({prepare:w=>{knownFood(w);w.objects=[{id:'eaten',source:'finished-meal',label:'原餐點的新名字',kind:'food',revision:2,region:'cafe-front',holder:'owner',owner:'owner',knownTo:['owner'],allowedTo:['owner'],state:{},lifecycle:'consumed',consumable:true}];}});
 try{s.choose(propose('取得一份簡餐','用餐','eaten'));const w=await advance(s);assert.equal(w.objects.find(o=>o.id==='eaten').lifecycle,'consumed');assert.equal(nonPhoneObjects(w).length,1);assert.equal(w.supplies.length,1);assert.equal(w.supplies[0].remaining,0);assert.equal(s.judgments(),0);}finally{s.restore();}
});

test('a confirmed overall ordinary ingredient scope stays exhausted independently of its display label',async()=>{
 const f=require('./routine-world-programs-fixture.cjs');
 const s=await scenario({prepare:w=>{w.supplies.push({...stock(),id:'entire-pantry',label:'所有普通備餐材料（明確耗盡）',kind:'cooking-ingredient',remaining:0,initialState:{category:'食材'}});}});
 try{
  const raw=f.binding('raw','supply','local',[],{kind:'cooking-ingredient',sourceRole:'material',sourceSubject:'食材',background:f.bg('已改名的一般材料','cooking-ingredient')});
  const method=f.program('prepare-food','使用場所的普通備餐材料製作簡餐','準備食物',[raw],[f.phase(15,[{kind:'materialize',supplyId:'$raw',expectedRemaining:0},f.form('新簡餐','meal')])]);
  s.choose(propose('使用場所的普通備餐材料製作簡餐','準備食物'));s.reply(f.approval([method],'prepare-food','簡餐'));
  const w=await advance(s);assert.equal(nonPhoneObjects(w).length,0);assert.equal(w.supplies.find(x=>x.id==='entire-pantry').remaining,0);assert.equal(w.supplies.length,2);assert.match(w.routineAudit.at(-1).reason,/有限材料|背景不會補回/);assert.equal(s.judgments(),1);
  s.choose(rest);await advance(s);const next=s.requests.at(-1);assert.ok(next.messages);assert.doesNotMatch(JSON.stringify(next.messages),/finiteSourceBindings|confirmedSourceFactsDropped/);assert.equal((await s.read()).supplies.length,2);
 }finally{s.restore();}
});
