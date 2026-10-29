/* eslint-disable @typescript-eslint/no-require-imports -- Real world API, SQLite and actual subsequent provider request. */
const test=require('node:test'),assert=require('node:assert/strict');
const {decision,upsert,scenario,edit,drop,assess,ownerOnly}=require('./pursuit-exit-fixture.cjs');
const owner=world=>world.characters.find(c=>c.id==='owner');
const {createPartner}=require('../tooling/experiments/pursuit-partner-228.cjs');
const {load}=require('./pursuit-graph-fixture.cjs');
const demand=require('./fixtures/demand-integration-loop.cjs');

for(const mode of ['waiting','deferred','known-result'])test(`an omitted active binding permits later ${mode} assessment while a new stale upsert still fails`,async()=>{
 let round=0;const inputs=[];
 const s=await scenario(input=>{
  inputs.push(input);
  if(round===0)return decision(input,{updates:[upsert('owner:parent',[],{kind:'direction'}),upsert('owner:child',[{id:'owner:parent',version:0}])]});
  if(round===1)return decision(input,{updates:[edit(input,'owner:parent',{importance:'high'})]});
  if(round===2){const update=assess(input,'owner:child','active',mode==='known-result'?'ready':mode);if(mode==='known-result'){assert.ok(input.self.shortTerm.length);const memory=input.self.shortTerm.at(-1);update.references=[{kind:'short',id:memory.id,version:memory.version}];update.node.basis={kind:'known-result',text:'依本次仍可知的真實經歷再取捨'};}return decision(input,{updates:[update]});}
  if(round===3)return decision(input,{updates:[edit(input,'owner:child',{parents:[{id:'owner:parent',version:1}]})]});
  return decision(input);
 },ownerOnly);
 try{
  for(round=0;round<3;round++){const response=await s.advance();assert.equal(response.status,200,await response.clone().text());}
  const saved=owner(await s.read()),child=saved.intents.find(n=>n.id==='owner:child');assert.equal(child.version,2);assert.equal(child.parents[0].version,1);assert.equal(child.progress,mode==='known-result'?'ready':mode);assert.equal(saved.intents.find(n=>n.id==='owner:parent').version,2);
  const trace=saved.pursuitTrace.filter(t=>t.id===child.id).at(-1);assert.equal(trace.operation,'assess');assert.equal(trace.before.parents[0].version,1);assert.equal(trace.after.parents[0].version,1);
  round=3;assert.equal((await s.advance()).status,502);assert.deepEqual(owner(await s.read()).intents,saved.intents);
  round=4;assert.equal((await s.advance()).status,200);const next=inputs.at(-1).self.intents.find(n=>n.id===child.id);assert.equal(next.parents[0].version,1);assert.equal(next.progress,child.progress);
 }finally{s.restore();}
});

test('an active child cannot silently accept a materially changed parent through assessment alone',async()=>{
 let round=0;const s=await scenario(input=>round===0?decision(input,{updates:[upsert('owner:parent',[],{kind:'direction'}),upsert('owner:child',[{id:'owner:parent',version:0}])]}):decision(input,{updates:[edit(input,'owner:parent',{scope:'完全不同的新承接範圍'}),assess(input,'owner:child','active','waiting')]}),ownerOnly);
 try{assert.equal((await s.advance()).status,200);const before=await s.read();round++;assert.equal((await s.advance()).status,502);assert.deepEqual((await s.read()).characters,before.characters);}finally{s.restore();}
});

for(const status of ['satisfied','dropped','active'])test(`parent updates preserve the omitted ${status} child's exact historical relation and trace`,async()=>{
 let round=0;const inputs=[];
 const s=await scenario(input=>{
  inputs.push(input);
  if(round===0)return decision(input,{updates:[upsert('owner:parent',[],{kind:'direction'}),upsert('owner:child',[{id:'owner:parent',version:0}])]});
  if(round===1)return decision(input,{updates:status==='satisfied'?[assess(input,'owner:child','satisfied','ready')]:status==='dropped'?[drop(input,'owner:child')]:[]});
  if(round===2)return decision(input,{updates:[edit(input,'owner:parent',status==='active'?{importance:'high'}:{content:'已改變的上層內容',scope:'我現在已改變上層承接範圍'})]});
  if(round===4&&status==='active')return decision(input,{updates:[edit(input,'owner:child',{parents:[{id:'owner:parent',version:input.self.intents.find(n=>n.id==='owner:parent').version}]})]});
  return decision(input);
 },ownerOnly);
 try{
  for(round=0;round<2;round++)assert.equal((await s.advance()).status,200);
  const before=owner(await s.read()),child=structuredClone(before.intents.find(n=>n.id==='owner:child')),history=before.pursuitTrace.filter(t=>t.id===child.id);
  assert.equal(child.parents[0].version,1);
  assert.equal((await s.advance()).status,200);
  const changed=owner(await s.read());assert.equal(changed.intents.find(n=>n.id==='owner:parent').version,2);
  assert.deepEqual(changed.intents.find(n=>n.id===child.id),child);assert.deepEqual(changed.pursuitTrace.filter(t=>t.id===child.id),history);
  round=3;assert.equal((await s.advance()).status,200);assert.equal(inputs.at(-1).self.intents.find(n=>n.id===child.id).parents[0].version,1);
  if(status==='active'){round=4;assert.equal((await s.advance()).status,200);const renewed=owner(await s.read()),node=renewed.intents.find(n=>n.id===child.id);assert.equal(node.version,child.version+1);assert.equal(node.parents[0].version,2);const trace=renewed.pursuitTrace.filter(t=>t.id===child.id).at(-1);assert.equal(trace.before.parents[0].version,1);assert.equal(trace.after.parents[0].version,2);}
 }finally{s.restore();}
});

test('L5 unrelated, information-only and refusal steps do not consume change; a bound human confirmation follows real meal commitment',async()=>{
 let round=0;const partner=createPartner('L5',{runId:'synthetic-run',trial:'L5:1'});
 const s=await scenario(input=>{
  if(input.self.id==='cass')return partner.reply(input);
  const withdrawn=input.self.shortTerm.some(m=>m.source?.person==='cass'&&m.text.includes('現在不需要餐點'));
  if(round<4)assert.equal(withdrawn,false,'unrelated work and information/refusal are not a confirmed meal commitment');
  if(round===0)return decision(input,{updates:[upsert('owner:tidy',[],{scope:'只整理自己的杯子'})],type:'say',target:'cass',content:'我先整理自己的杯子。'});
  if(round===1)return decision(input,{updates:[upsert('owner:information',[],{scope:'只介紹已知餐點資訊，不承接準備'})],type:'say',target:'cass',content:'我現在只能介紹已知資訊。'});
  if(round===2)return decision(input,{type:'say',target:'cass',content:'我現在拒絕替客人準備餐點。'});
  if(round===3)return decision(input,{updates:[upsert('owner:meal',[],{scope:'為 Cass 準備一份可取用的餐點'})],type:'say',target:'cass',content:'我現在願意替你準備一份餐點。'});
  assert.equal(withdrawn,true,'the real next input receives only the later legitimate partner statement');
  return decision(input,{updates:[drop(input,'owner:meal')]});
 },world=>{Object.assign(world,demand.initialWorld(load('world').seedWorld));delete world.contextId;});
 try{
  for(round=0;round<5;round++){
   const response=await s.advance();assert.equal(response.status,200,await response.clone().text());const receipt=await response.json(),world=await s.read(),operationId=receipt.operationEvidence.operationId;
   const meal=owner(world).intents.find(n=>n.id==='owner:meal');
   const base={runId:'synthetic-run',trial:'L5:1',operationId,relatedMealCommitment:true,reference:'synthetic human evidence review'};
   if(round===3){partner.observe(world,{operationId,confirmation:{...base,pursuitId:meal.id,version:meal.version,scope:'incorrect scope'}});assert.equal(partner.report().confirmedCommitment,null);}
   const confirmation=round===3?{...base,pursuitId:meal.id,version:meal.version,scope:meal.scope}:round===2?{...base,pursuitId:'owner:information',version:999,scope:'只介紹已知餐點資訊，不承接準備'}:round===1?{...base,operationId:'wrong-committed-operation',pursuitId:'owner:information',version:1,scope:'只介紹已知餐點資訊，不承接準備'}:round===0?{...base,pursuitId:'owner:foreign',version:1,scope:'不存在的承接'}:null;
   partner.observe(world,{operationId,confirmation});
   if(round<4)assert.equal(partner.report().changedAfterCommitment,false);
   if(round<3)assert.equal(partner.report().confirmedCommitment,null);
   if(round===3)assert.equal(partner.report().confirmedCommitment.pursuitId,'owner:meal');
  }
  assert.equal(partner.report().changedAfterCommitment,true);assert.equal(partner.report().confirmedCommitment.pursuitId,'owner:meal');
  assert.equal(owner(await s.read()).intents.find(n=>n.id==='owner:meal').status,'dropped');
 }finally{s.restore();}
});
