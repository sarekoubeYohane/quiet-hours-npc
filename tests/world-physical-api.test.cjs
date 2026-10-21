/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=name=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,name+'.cjs'));
const {GET,POST}=load('route'),store=load('store'),{seedWorld}=load('world');
const id=()=>Date.now()+':'+crypto.randomUUID();
const request=body=>new Request('https://test.invalid/api/world',{method:'POST',headers:{origin:'https://test.invalid'},body:JSON.stringify({operationId:id(),mode:'openai',model:'gpt-6-luna',...body})});
const read=async()=> (await (await GET()).json()).world;
const reply=value=>Response.json({usage:{prompt_tokens:30,completion_tokens:10},choices:[{message:{content:JSON.stringify(value)}}]});
function fixture({allowed=true,holder='cass'}={}){
 const world=seedWorld();world.characters=[world.characters.find(c=>c.id==='cass'),world.characters.find(c=>c.id==='owner')];
 world.characters[0].location='kris-home';world.characters[0].region='kris-home-main';world.characters[1].location='kris-home';world.characters[1].region='kris-home-main';world.characters[1].control={mode:'taken-over'};
 world.adjudication={provider:'openai',model:'fixture-world'};world.playerBudget={calls:120,tokens:1000000};
 world.objects=[{id:'borrowed-cup',source:'old-supply',label:'借來的杯子',region:'kris-home-main',holder,owner:'owner',revision:1,state:{contents:'empty'},lifecycle:'active',kind:'utensil',knownTo:['cass','owner'],allowedTo:allowed?['cass','owner']:['owner']}];return world;
}
async function setup(candidate,options={}){
 const world=fixture(options);options.mutate?.(world);store.install(world);assert.equal((await POST(request({operation:'set-model-key',key:'fixture-key'}))).status,200);
 const original=global.fetch;let npc=0,judgments=0;const inputs=[],systems=[];
 global.fetch=async(_url,init)=>{
  const packet=JSON.parse(init.body),input=JSON.parse(packet.messages[1].content);inputs.push(input);systems.push(packet.messages[0].content);
  if(input.contractVersion==='world-adjudication.v1'){judgments++;return reply(typeof candidate==='function'?candidate(input):candidate);}
  npc++;return reply({type:'propose',target:options.target||'borrowed-cup',content:options.content||'拿穩杯子時手滑掉落，承接可能的外在後果',purpose:'整理器具',mood:'平靜',durationMinutes:15,timeIntent:{kind:'completion',maxMinutes:null},intents:[]});
 };
 return {world,inputs,systems,restore:()=>{global.fetch=original;},counts:()=>({npc,judgments})};
}
const candidate=effects=>({status:'accepted',completionMinutes:15,check:null,effects,stages:[],branches:null,routine:null});
test('legacy borrowed-object destroy still rejects atomically instead of inventing ownership',async()=>{
 const s=await setup(candidate([{kind:'destroy',objectId:'borrowed-cup',expectedRevision:1}]));
 try{const response=await POST(request({operation:'advance',minutes:15}));assert.equal(response.status,502);assert.match((await response.json()).error,/不能毀壞借來/);assert.deepEqual((await read()).objects,s.world.objects);}finally{s.restore();}
});
test('a confirmed physical failure can damage a borrowed cup while retaining its owner and permission facts',async()=>{
 const effect={kind:'physical',version:1,operation:'destroy',objectId:'borrowed-cup',expectedRevision:1,reason:'原已借用的杯子在失手時摔碎，並非物主自願交付或移轉所有權。'};
 const branches=[{outcomes:['critical-success','success','mixed'],effects:[],stages:[]},{outcomes:['failure','critical-failure'],effects:[effect],stages:[]}];
 const s=await setup({...candidate([]),check:{difficulty:12,ability:'拿穩杯子'},branches});const original=Math.random;let rolls=0;Math.random=()=>{rolls++;return 0;};
 try{
  const body={operation:'advance',minutes:15,operationId:id()},response=await POST(request(body));assert.equal(response.status,200,(await response.clone().json()).error);
  const saved=await read(),cup=saved.objects[0];assert.equal(cup.lifecycle,'destroyed');assert.equal(cup.owner,'owner');assert.equal(cup.source,'old-supply');assert.deepEqual(cup.allowedTo,['cass','owner']);assert.equal(cup.holder,null);assert.equal(rolls,1);assert.deepEqual(cup.physicalHistory,[{actorId:'cass',minute:1275,operation:'destroy',permitted:true,priorHolder:'cass'}]);
  const counts=s.counts();assert.equal((await POST(request(body))).status,200);assert.deepEqual((await read()).objects,saved.objects);assert.deepEqual(s.counts(),counts);assert.equal(rolls,1);
 }finally{s.restore();Math.random=original;}
});
test('physical take can affect another present holder without forging grant, ownership or receiving consent',async()=>{
 const s=await setup(candidate([{kind:'physical',version:1,operation:'take',objectId:'borrowed-cup',expectedRevision:1,reason:'雙方在場，嘗試從對方手上取走杯子；不表示自願交付。'}]),{allowed:false,holder:'owner'});
 try{
  const response=await POST(request({operation:'advance',minutes:15}));assert.equal(response.status,200,(await response.clone().json()).error);
  const saved=await read(),cup=saved.objects[0];assert.equal(cup.holder,'cass');assert.equal(cup.owner,'owner');assert.deepEqual(cup.allowedTo,['owner']);assert.equal(cup.acceptedBy,undefined);assert.equal(cup.unpermittedCount,1);assert.deepEqual(cup.physicalHistory,[{actorId:'cass',minute:1275,operation:'take',permitted:false,priorHolder:'owner'}]);
  assert.equal(saved.characters.find(c=>c.id==='owner').goal,s.world.characters.find(c=>c.id==='owner').goal);assert.doesNotMatch(saved.characters.find(c=>c.id==='cass').activity,/自願|交付|同意|原諒/);
 }finally{s.restore();}
});
test('physical state effects can use a present held object while preserving permission and private owner context',async()=>{
 const effect={kind:'change-state',exposure:'public',version:1,access:'physical',target:{type:'object',id:'borrowed-cup'},expectedRevision:1,changes:[{key:'surface',from:null,value:'濕潤'}],reason:'隱藏世界裁定原因，不替物主選擇反應。'};
 const s=await setup(candidate([effect]),{allowed:false,holder:'owner'});
 try{const response=await POST(request({operation:'advance',minutes:15}));assert.equal(response.status,200,(await response.clone().json()).error);const saved=await read(),cup=saved.objects[0];assert.equal(cup.state.surface,'濕潤');assert.equal(cup.holder,'owner');assert.equal(cup.owner,'owner');assert.deepEqual(cup.allowedTo,['owner']);assert.equal(cup.unpermittedCount,1);assert.equal(cup.physicalHistory[0].operation,'state');assert.doesNotMatch(saved.characters.find(c=>c.id==='cass').activity,/隱藏世界裁定原因|替物主/);}finally{s.restore();}
});
test('physical materialization and consumption retain finite supply, source and unpermitted facts',async()=>{
 const s=await setup(candidate([{kind:'physical',version:1,operation:'materialize',supplyId:'meal',expectedRemaining:1,reason:'未經許可取走眼前最後一份食物。'},{kind:'physical',version:1,operation:'consume',objectId:'meal:1',expectedRevision:1,reason:'食用已拿到手上的食物，所有權不因此改變。'}]),{target:'meal',content:'不等待許可，拿取並吃掉面前食物',mutate:w=>{w.supplies=[{id:'meal',label:'最後一份餐點',region:'kris-home-main',remaining:1,owner:'owner',knownTo:['cass','owner'],allowedTo:['owner'],kind:'food',initialState:{}}];}});
 try{const response=await POST(request({operation:'advance',minutes:15}));assert.equal(response.status,200,(await response.clone().json()).error);const saved=await read(),meal=saved.objects.find(o=>o.id==='meal:1');assert.equal(saved.supplies[0].remaining,0);assert.equal(meal.source,'meal');assert.equal(meal.owner,'owner');assert.equal(meal.lifecycle,'consumed');assert.equal(meal.holder,null);assert.deepEqual(meal.allowedTo,['owner']);assert.equal(meal.unpermittedCount,2);assert.deepEqual(meal.physicalHistory.map(h=>h.operation),['materialize','consume']);}finally{s.restore();}
});
test('physical access still rejects remote, unknown, expired, stale and cross-world references atomically',async()=>{
 const effect={kind:'physical',version:1,operation:'take',objectId:'borrowed-cup',expectedRevision:1,reason:'測試目前物理前提。'};
 for(const mutate of [w=>w.objects[0].region='cafe-front',w=>w.objects[0].knownTo=['owner'],w=>w.objects[0].lifecycle='consumed',w=>w.objects[0].revision=2,w=>w.objects=[],w=>{const owner=w.characters.find(c=>c.id==='owner');owner.location='cafe';owner.region='cafe-front';}]){
  const s=await setup(candidate([effect]),{allowed:false,holder:'owner',mutate});try{const before=await read(),response=await POST(request({operation:'advance',minutes:15}));assert.equal(response.status,502);const saved=await read();assert.deepEqual(saved.objects,before.objects);assert.equal(saved.turn,before.turn);}finally{s.restore();}
 }
});
test('physical access cannot force a third-party receiving choice or grant and still rejects empty supply',async()=>{
 const base={kind:'physical',version:1,operation:'take',objectId:'borrowed-cup',expectedRevision:1,reason:'外在影響不等於他人同意。'};
 for(const effect of [{...base,toHolder:'owner'},{...base,operation:'grant',recipient:'cass'}, {...base,version:2},{...base,reason:'x'.repeat(301)}]){
  const s=await setup(candidate([effect]),{allowed:false,holder:'owner'});try{const response=await POST(request({operation:'advance',minutes:15}));assert.equal(response.status,502);assert.deepEqual((await read()).objects,s.world.objects);}finally{s.restore();}
 }
 for(const supply of [{remaining:0},{pending:true},{knownTo:['owner']},{region:'cafe-front'}]){
  const s=await setup(candidate([{kind:'physical',version:1,operation:'materialize',supplyId:'meal',expectedRemaining:1,reason:'物理操作不補貨。'}]),{mutate:w=>{w.supplies=[{id:'meal',label:'有限食物',region:'kris-home-main',remaining:1,owner:'owner',knownTo:['cass','owner'],allowedTo:['owner'],kind:'food',initialState:{},...supply}];}});try{const response=await POST(request({operation:'advance',minutes:15}));assert.equal(response.status,502);assert.deepEqual((await read()).objects,s.world.objects);assert.deepEqual((await read()).supplies,s.world.supplies);}finally{s.restore();}
 }
});
test('physical history survives detail eviction without backfilling old evidence or erasing unpermitted facts',async()=>{
 const s=await setup(()=>{const cup=store.snapshot().objects[0];return candidate([{kind:'change-state',exposure:'public',version:1,access:'physical',target:{type:'object',id:cup.id},expectedRevision:cup.revision,changes:[{key:'surface',from:cup.state.surface??null,value:cup.state.surface==='濕潤'?'乾爽':'濕潤'}],reason:'物件外在狀態的當前後果。'}]);},{allowed:false,holder:'owner'});
 try{assert.equal((await read()).objects[0].physicalHistory,undefined);for(let n=0;n<18;n++)assert.equal((await POST(request({operation:'advance',minutes:15}))).status,200);const cup=(await read()).objects[0];assert.equal(cup.physicalHistory.length,16);assert.equal(cup.physicalHistoryDropped,2);assert.equal(cup.unpermittedCount,18);assert.ok(cup.physicalHistory.every(h=>h.permitted===false));assert.ok(!JSON.stringify(cup.physicalHistory).includes('reason'));}finally{s.restore();}
});
test('physical effects preserve save-before, confirmed-after and version/lease conflict replay semantics',async()=>{
 for(const fault of ['before','after','version','lease']){
  const s=await setup(candidate([{kind:'physical',version:1,operation:'take',objectId:'borrowed-cup',expectedRevision:1,reason:'目前在場的物理拿取。'}]),{allowed:false,holder:'owner'});
  try{
   if(fault==='before')store.throwBeforeNextSave();if(fault==='after')store.throwAfterNextSave();if(fault==='version')store.conflictOnNextSave();if(fault==='lease')store.conflictOnNextSave(s.world,{lockedUntil:Date.now()+60000});
   const body={operation:'advance',minutes:15,operationId:id()},response=await POST(request(body));assert.equal(response.status,fault==='after'?200:502);const saved=await read(),cup=saved.objects[0];assert.equal(cup.holder,fault==='after'?'cass':'owner');assert.equal(cup.unpermittedCount,fault==='after'?1:undefined);assert.equal(saved.aiUsage.totalCalls,2);const counts=s.counts();assert.equal((await POST(request(body))).status,fault==='lease'?409:response.status);assert.deepEqual((await read()).objects,saved.objects);assert.deepEqual(s.counts(),counts);
  }finally{s.restore();}
 }
});
test('placing a physically taken object never forces another character to receive it',async()=>{
 const effects=['take','place'].map((operation,index)=>({kind:'physical',version:1,operation,objectId:'borrowed-cup',expectedRevision:index+1,reason:'只取到自己手上再放在本地，沒有第三人接收。'}));const s=await setup(candidate(effects),{allowed:false,holder:'owner'});
 try{const response=await POST(request({operation:'advance',minutes:15}));assert.equal(response.status,200,(await response.clone().json()).error);const cup=(await read()).objects[0];assert.equal(cup.holder,null);assert.equal(cup.region,'kris-home-main');assert.equal(cup.owner,'owner');assert.equal(cup.acceptedBy,undefined);assert.deepEqual(cup.physicalHistory.map(h=>h.operation),['take','place']);assert.equal(cup.unpermittedCount,2);}finally{s.restore();}
});
test('physical receipts retain before-permission and reasons while NPC inputs remain only knowable facts',async()=>{
 const effect={kind:'physical',version:1,operation:'take',objectId:'borrowed-cup',expectedRevision:1,reason:'世界裁定理由，不能成為角色已知內情。'};
 const s=await setup(candidate([effect]),{allowed:false,holder:'owner',mutate:w=>w.characters.find(c=>c.id==='owner').memories.push({time:w.minute,text:'PRIVATE_OWNER_MEMORY_147'})});
 try{
  const response=await POST(request({operation:'advance',minutes:15}));assert.equal(response.status,200,(await response.clone().json()).error);const body=await response.json(),receipt=body.operationEvidence;assert.equal(receipt.result.beforeObjects[0].holder,'owner');assert.deepEqual(receipt.result.beforeObjects[0].allowedTo,['owner']);assert.equal(receipt.result.objects[0].holder,'cass');assert.equal(receipt.result.objects[0].physicalHistory[0].permitted,false);assert.equal(receipt.dispatches.find(d=>d.task==='adjudication').candidate.value.effects[0].operation,'take');assert.ok(!JSON.stringify(receipt).includes('fixture-key'));assert.equal(receipt.redacted,false);assert.ok(Buffer.byteLength(JSON.stringify(receipt))<=65536);
  for(const input of s.inputs.filter(input=>input.contractVersion!=='world-adjudication.v1'))assert.doesNotMatch(JSON.stringify(input),/physicalHistory|unpermittedCount|allowedTo|PRIVATE_OWNER_MEMORY_147|世界裁定理由/);
  assert.match(s.systems[0],/物主的使用許可與物理上能否操作分開/);const adjudication=s.inputs.find(input=>input.contractVersion==='world-adjudication.v1');assert.match(adjudication.effectRules.join(' '),/physical version=1/);assert.match(adjudication.effectRules.join(' '),/不能直接強迫第三者接收/);
 }finally{s.restore();}
});
test('a different account cannot resolve another worlds physical object reference',async()=>{
 const auth=load('auth'),s=await setup(candidate([{kind:'physical',version:1,operation:'take',objectId:'borrowed-cup',expectedRevision:1,reason:'不能跨帳號取得物件。'}]),{allowed:false,holder:'owner'});
 try{
  const other=fixture({allowed:false,holder:'owner'});other.objects=[];store.installForOwner('other-owner',other);auth.setUserId('other-owner');assert.equal((await POST(request({operation:'set-model-key',key:'fixture-other-key'}))).status,200);const response=await POST(request({operation:'advance',minutes:15}));assert.equal(response.status,502);assert.deepEqual((await read()).objects,[]);auth.setUserId('test-owner');assert.deepEqual((await read()).objects,s.world.objects);
 }finally{auth.setUserId('test-owner');s.restore();}
});
test('a physical candidate containing a credential is safely rejected and its bounded receipt is redacted',async()=>{
 const s=await setup(candidate([{kind:'physical',version:1,operation:'take',objectId:'borrowed-cup',expectedRevision:1,reason:'裁定理由含fixture-key，應拒絕且遮蔽。'}]),{allowed:false,holder:'owner'});
 try{const response=await POST(request({operation:'advance',minutes:15}));assert.equal(response.status,502);const body=await response.json();assert.match(body.error,/敏感資料/);assert.deepEqual((await read()).objects,s.world.objects);assert.doesNotMatch(JSON.stringify(body.operationEvidence),/fixture-key/);assert.equal(body.operationEvidence.redacted,true);assert.ok(Buffer.byteLength(JSON.stringify(body.operationEvidence))<=65536);}finally{s.restore();}
});
