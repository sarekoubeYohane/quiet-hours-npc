/* eslint-disable @typescript-eslint/no-require-imports */
const { originalAccountInput, originalWorldInput } = require('./original-scope-fixture.cjs');

const assert=require('node:assert/strict'),test=require('node:test'),path=require('node:path');
const load=name=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,name+'.cjs'));
const saves=load('saves-route'),world=load('route'),people=load('character-templates-route'),scenes=load('scene-templates-route'),store=load('store'),auth=load('auth');
const {seedWorld}=load('world');
const originalSaveScopes=new Map();
const origin='https://test.invalid';
const req=(value,save)=>new Request(origin+'/api/world'+(save?'?save='+save:''),{method:'POST',headers:{origin,'Content-Type':'application/json','X-World-Time-Policy':'round-v1'},body:JSON.stringify(originalWorldInput(value, save?originalSaveScopes.get(save):'test-owner'))});
const body=async(response,status=200)=>{const value=await response.json();assert.equal(response.status,status,JSON.stringify(value));return value;};
const id=()=>Date.now()+':'+crypto.randomUUID();
const read=save=>world.GET(new Request(origin+'/api/world?save='+save)).then(r=>body(r)).then(value=>{if(!originalSaveScopes.has(save))originalSaveScopes.set(save,value.operationScope);return value;});
async function create(name='來源') {
 const scene=(await body(await scenes.POST(new Request(origin+'/api/scene-templates',{method:'POST',headers:{origin},body:JSON.stringify(originalAccountInput({id:crypto.randomUUID(),version:0,name:'共享來源房屋',note:'',rooms:[{id:'front',name:'前室'}],connections:[],objects:[{id:'cup',name:'杯子',roomId:'front',state:{水量:'半杯'}}]},'account-operations:test-owner'))})),201)).template;
 const {input,saved,formationCalls}=await require('./create-world-via-opening.cjs')({load,name,scene,placeName:'本次住處',characterName:name+'人物',initialMemories:'保存的開局記憶'});await read(saved.save.id);return {input,...saved,formationCalls};
}
async function advance(save,extra={}) {const current=await read(save);return body(await world.POST(req({operation:'advance',operationId:id(),operationScope:current.operationScope,worldContext:current.world.contextId,mode:'demo',minutes:5,timeContract:'five-minute-v1',...extra},save)));}

test('copy saves the complete committed life and in-progress activity without advancing or copying accounting',async()=>{
 store.install(seedWorld());auth.setUserId('test-owner');
 const source=await create();await advance(source.save.id);
 const current=await read(source.save.id);
 assert.ok(current.world.characters[0].plan);
 const input={operationScope:'test-owner',operation:'copy',operationId:crypto.randomUUID(),saveId:source.save.id,expectedVersion:current.version,name:'分岔副本'};
 const copy=await body(await saves.POST(req(input)),201);
 const reread=await read(copy.save.id);
 const story=structuredClone(current.world),copiedStory=structuredClone(reread.world);delete story.aiUsage;delete copiedStory.aiUsage;
 assert.deepEqual(copiedStory,story);
 assert.equal(reread.world.aiUsage.totalCalls,0);
 assert.equal(reread.world.turn,current.world.turn);
 assert.equal(copy.save.originalOpeningAvailable,true);
 assert.deepEqual(copy.save.savedFrom,{id:source.save.id,name:'來源',version:current.version,turn:current.world.turn,minute:current.world.minute});
 const replay=await body(await saves.POST(req(input)));
 assert.equal(replay.save.id,copy.save.id);
 assert.equal((await body(await saves.GET())).saves.length,3);
});

test('deleting the source leaves the copy playable and does not delete other saves or reusable assets',async()=>{
 store.install(seedWorld());auth.setUserId('test-owner');
 const source=await create();await advance(source.save.id);const current=await read(source.save.id);
 const copied=await body(await saves.POST(req({operationScope:'test-owner',operation:'copy',operationId:crypto.randomUUID(),saveId:source.save.id,expectedVersion:current.version,name:'獨立副本'})),201);
 const templateBefore=await body(await people.GET()),sceneBefore=await body(await scenes.GET());
 const deletion={operationScope:'test-owner',operation:'delete',operationId:crypto.randomUUID(),saveId:source.save.id,expectedVersion:current.version};
 await body(await saves.POST(req(deletion)));
 await body(await world.GET(new Request(origin+'/api/world?save='+source.save.id)),404);
 await advance(copied.save.id);
 assert.equal((await read(copied.save.id)).world.turn,2);
 const listed=(await body(await saves.GET())).saves;
 assert.deepEqual(listed.map(save=>save.id).sort(),['legacy',copied.save.id].sort());
 assert.deepEqual(await body(await people.GET()),templateBefore);assert.deepEqual(await body(await scenes.GET()),sceneBefore);
 await body(await saves.POST(req(deletion)));
 assert.equal((await body(await saves.GET())).saves.length,2);
 await body(await saves.POST(req(source.input)),410);
 const copiedDeletion={operationScope:'test-owner',operation:'delete',operationId:crypto.randomUUID(),saveId:copied.save.id,expectedVersion:(await read(copied.save.id)).version};
 await body(await saves.POST(req(copiedDeletion)));
 const originalCopy=await body(await saves.POST(req({operationScope:'test-owner',operation:'copy',operationId:copied.save.id,saveId:source.save.id,expectedVersion:current.version,name:'獨立副本'})));
 assert.equal(originalCopy.save.id,copied.save.id);
 assert.equal((await body(await saves.GET())).saves.length,1);
});

test('copy does not duplicate real model usage and deletion preserves the account bill without a recall billing service',async()=>{
 store.install(seedWorld());auth.setUserId('test-owner');const source=await create('費用來源');const authoringBefore=(await body(await saves.GET())).accountUsage;
 const {fixtureDecision}=require('./pursuit-fixture.cjs');const originalFetch=global.fetch;
 global.fetch=async(_url,request)=>{const input=JSON.parse(JSON.parse(request.body).messages[1].content);return Response.json({usage:{prompt_tokens:10,completion_tokens:5},choices:[{message:{content:JSON.stringify(fixtureDecision(input,{type:'rest',target:'',content:''}))}}]});};
 const act=async(value)=>{const current=await read(source.save.id);return body(await world.POST(req({operationId:id(),operationScope:current.operationScope,worldContext:current.world.contextId,mode:'demo',...value},source.save.id)));};
 try {
  await act({operation:'set-model-key',mode:'openai',key:'controlled-private-key'});
  await act({operation:'set-adjudication',adjudication:{provider:'openai',model:'gpt-6.1-sol'}});
  await act({operation:'set-price',price:{provider:'openai',model:'gpt-6.1-sol',input:1,output:1,source:'受控單價',date:'2026-11-09'}});
  await advance(source.save.id,{mode:'openai',model:'gpt-6.1-sol'});
  const current=await read(source.save.id),before=(await body(await saves.GET())).accountUsage;
  assert.equal(before.totalCalls-authoringBefore.totalCalls,1);assert.equal(before.totalInputTokens-authoringBefore.totalInputTokens,10);assert.equal(before.totalOutputTokens-authoringBefore.totalOutputTokens,5);assert.ok(Math.abs(before.knownUsd-0.000015)<1e-12);
  const copy=await body(await saves.POST(req({operationScope:'test-owner',operation:'copy',operationId:crypto.randomUUID(),saveId:source.save.id,expectedVersion:current.version,name:'不帶費用的副本'})),201);
  assert.equal((await read(copy.save.id)).world.aiUsage.totalCalls,0);
  assert.equal((await body(await saves.GET())).accountUsage.totalCalls,before.totalCalls);
  await body(await saves.POST(req({operationScope:'test-owner',operation:'delete',operationId:crypto.randomUUID(),saveId:source.save.id,expectedVersion:current.version})));
  const after=(await body(await saves.GET())).accountUsage;
  assert.equal(after.totalCalls,before.totalCalls);assert.equal(after.totalInputTokens,before.totalInputTokens);assert.equal(after.knownUsd,before.knownUsd);assert.equal(after.archivedWorlds,1);
  assert.equal((await read(copy.save.id)).modelKeys.openai.configured,true);
  auth.setUserId('different-account');assert.equal((await body(await saves.GET())).accountUsage.totalCalls,0);auth.setUserId('test-owner');
 }finally{global.fetch=originalFetch;}
});

test('copy/delete reject stale versions and foreign accounts and leave transactions recoverable across failures',async()=>{
 store.install(seedWorld());auth.setUserId('test-owner');const source=await create();const current=await read(source.save.id);
 const input={operationScope:'test-owner',operation:'copy',operationId:crypto.randomUUID(),saveId:source.save.id,expectedVersion:current.version,name:'原子副本'};
 auth.setUserId('other');await body(await saves.POST(req(input)),409);await body(await saves.POST(req({...input,operationScope:'other'})),404);auth.setUserId('test-owner');
 await body(await saves.POST(req({...input,expectedVersion:current.version+1})),409);
 store.onStorage(sql=>{if(sql.startsWith('INSERT OR IGNORE INTO save_operation_receipts'))throw Error('controlled before copy receipt');});
 await body(await saves.POST(req(input)),503);store.onStorage(undefined);
 assert.equal((await body(await saves.GET())).saves.length,2);
 await body(await world.GET(new Request(origin+'/api/world?save='+input.operationId)),404);
 let receiptReads=0;store.onStorage(sql=>{if(sql.startsWith('SELECT request,result FROM save_operation_receipts')&&++receiptReads===2)throw Error('copy committed, reply lost');});
 await body(await saves.POST(req(input)),503);store.onStorage(undefined);
 const restored=await body(await saves.POST(req(input)));assert.equal(restored.save.id,input.operationId);
 assert.equal((await body(await saves.GET())).saves.length,3);
 await body(await saves.POST(req({...input,name:'不同內容'})),409);
 const deletion={operationScope:'test-owner',operation:'delete',operationId:crypto.randomUUID(),saveId:source.save.id,expectedVersion:current.version};
 store.onStorage(sql=>{if(sql.startsWith('DELETE FROM worlds WHERE owner=?'))throw Error('controlled delete rollback');});
 await body(await saves.POST(req(deletion)),503);store.onStorage(undefined);
 assert.equal((await read(source.save.id)).world.turn,0);
 assert.equal((await body(await saves.GET())).accountUsage.archivedWorlds,0);
 await body(await saves.POST(req(deletion)));
 assert.equal((await body(await saves.GET())).accountUsage.archivedWorlds,1);
 await body(await saves.POST(req(deletion)));
 assert.equal((await body(await saves.GET())).accountUsage.archivedWorlds,1);
});

test('copied long-term memory reindexes in its own scope and remains recallable after the source index is erased',async()=>{
 store.install(seedWorld());auth.setUserId('test-owner');const source=await create('長期記憶來源');
 const {env}=load('cloudflare-workers'),{fixtureDecision}=require('./pursuit-fixture.cjs');
 const vectors=new Map(),recalls=[],scopeOwners=new Set();let phase='retain',modelCalls=0;
 env.RECALL_ENABLED='true';env.RECALL_USAGE_DB=store.database();env.OWNER_EMBEDDING_KEY='controlled-owner-key';
 env.MEMORY_VECTOR_INDEX={upsert:async records=>{for(const record of records){vectors.set(record.id,record);scopeOwners.add(record.metadata.owner);}return {mutationId:'local'};},deleteByIds:async ids=>{for(const key of ids)vectors.delete(key);return {mutationId:'local-delete'};},getByIds:async ids=>ids.flatMap(key=>vectors.has(key)?[vectors.get(key)]:[]),queryById:async key=>({matches:vectors.has(key)?[vectors.get(key)]:[]}),query:async(_values,options)=>({matches:[...vectors.values()].filter(record=>record.metadata.owner===options.filter.owner.$eq)})};
 const originalFetch=global.fetch;
 global.fetch=async(url,request)=>{
  const message=JSON.parse(request.body);
  if(String(url).includes('embeddings'))return Response.json({usage:{total_tokens:7},data:message.input.map((_,index)=>({index,embedding:Array(1536).fill(.1)}))});
  modelCalls++;const input=JSON.parse(message.messages[1].content);
  let decision;
  if(phase==='recall'&&message.messages.length===2)decision={type:'recall',questions:['開局留下的記憶？']};
  else {if(phase==='recall')recalls.push({handles:JSON.parse(message.messages.at(-1).content).recalledMemories,memories:input.self.longTerm});decision=fixtureDecision(input,{type:'rest',target:'',content:'',...(phase==='retain'?{memorySelections:[{id:input.self.shortTerm[0].id,version:input.self.shortTerm[0].version,reason:'這是重要的開局記憶'}]}:{})});}
  return Response.json({usage:{prompt_tokens:10,completion_tokens:5},choices:[{message:{content:JSON.stringify(decision)}}]});
 };
 try {
  let current=await read(source.save.id);
  await body(await world.POST(req({operation:'set-model-key',mode:'openai',key:'controlled-key'},source.save.id)));
  await body(await world.POST(req({operation:'set-adjudication',mode:'demo',operationId:id(),operationScope:current.operationScope,worldContext:current.world.contextId,adjudication:{provider:'openai',model:'gpt-6.1-sol'}},source.save.id)));
  await advance(source.save.id,{mode:'openai',model:'gpt-6.1-sol'});
  assert.equal((await read(source.save.id)).world.characters[0].longTerm.length,1);
  await advance(source.save.id);await advance(source.save.id);phase='recall';
  await advance(source.save.id,{mode:'openai',model:'gpt-6.1-sol'});
  assert.equal(vectors.size,1);const callsBeforeCopy=modelCalls;
  current=await read(source.save.id);
  const copied=await body(await saves.POST(req({operationScope:'test-owner',operation:'copy',operationId:crypto.randomUUID(),saveId:source.save.id,expectedVersion:current.version,name:'獨立記憶副本'})),201);
  const deletion={operationScope:'test-owner',operation:'delete',operationId:crypto.randomUUID(),saveId:source.save.id,expectedVersion:current.version};
  const remove=env.MEMORY_VECTOR_INDEX.deleteByIds;env.MEMORY_VECTOR_INDEX.deleteByIds=async()=>{throw Error('controlled cleanup unavailable');};
  const pendingCleanup=await body(await saves.POST(req(deletion)));assert.equal(pendingCleanup.externalCleanup,'pending');
  await body(await world.GET(new Request(origin+'/api/world?save='+source.save.id)),404);
  env.MEMORY_VECTOR_INDEX.deleteByIds=remove;
  const cleaned=await body(await saves.POST(req(deletion)));assert.equal(cleaned.externalCleanup,undefined);
  assert.equal(modelCalls,callsBeforeCopy);assert.equal(vectors.size,0);
  assert.equal((await read(copied.save.id)).world.characters[0].longTerm[0].text,'保存的開局記憶');
  await advance(copied.save.id);await advance(copied.save.id);
  await advance(copied.save.id,{mode:'openai',model:'gpt-6.1-sol'});
  assert.equal(scopeOwners.size,2);assert.equal(vectors.size,1);assert.equal(recalls.length,2);
  assert.match(JSON.stringify(recalls[1]),/保存的開局記憶/);
 }finally{global.fetch=originalFetch;for(const key of ['RECALL_ENABLED','RECALL_USAGE_DB','OWNER_EMBEDDING_KEY','MEMORY_VECTOR_INDEX'])delete env[key];}
});

test('copy and delete wait for the source operation instead of cloning or discarding an in-flight request',async()=>{
 store.install(seedWorld());auth.setUserId('test-owner');const source=await create('尚在處理');let current=await read(source.save.id);
 await body(await world.POST(req({operation:'set-model-key',mode:'openai',key:'controlled'},source.save.id)));
 await body(await world.POST(req({operation:'set-adjudication',operationId:id(),operationScope:current.operationScope,worldContext:current.world.contextId,mode:'demo',adjudication:{provider:'openai',model:'gpt-6.1-sol'}},source.save.id)));
 current=await read(source.save.id);
 const {fixtureDecision}=require('./pursuit-fixture.cjs');let release,started;
 const gate=new Promise(resolve=>{release=resolve;}),dispatched=new Promise(resolve=>{started=resolve;});const originalFetch=global.fetch;
 global.fetch=async(_url,request)=>{started();await gate;const input=JSON.parse(JSON.parse(request.body).messages[1].content);return Response.json({usage:{prompt_tokens:10,completion_tokens:5},choices:[{message:{content:JSON.stringify(fixtureDecision(input,{type:'rest',target:'',content:''}))}}]});};
 const running=advance(source.save.id,{mode:'openai',model:'gpt-6.1-sol'});
 try {
  await dispatched;
  await body(await saves.POST(req({operationScope:'test-owner',operation:'copy',operationId:crypto.randomUUID(),saveId:source.save.id,expectedVersion:current.version,name:'不可偷複製請求'})),409);
  await body(await saves.POST(req({operationScope:'test-owner',operation:'delete',operationId:crypto.randomUUID(),saveId:source.save.id,expectedVersion:current.version})),409);
  release();await running;
  assert.equal((await read(source.save.id)).world.turn,1);
  assert.equal((await body(await saves.GET())).saves.length,2);
 }finally{release();await running;global.fetch=originalFetch;}
});

test('a terminal legacy uncertain operation that cannot finalize remains an explicit accounting gap and does not permanently forbid deletion',async()=>{
 store.install(seedWorld());auth.setUserId('test-owner');const source=await create('舊帳務缺口');const current=await read(source.save.id),operationId=id();
 // Historical fault setup only: the world itself was created through the product API.
 // This is the legacy settled-uncertain/empty-marker state, with no durable trace.
 const usage={windowStartedAt:Date.now(),calls:0,inputTokens:0,outputTokens:0,unknownCalls:0,totalCalls:0,totalInputTokens:0,totalOutputTokens:0,totalUnknownCalls:0,savedDecisions:0};
 const journal={floor:0,results:{[operationId]:{status:502,body:{error:'舊操作派送與費用未知',operationUncertain:true}}},usage:{[operationId]:{applied:usage,finalized:false}}};
 await store.database().prepare('UPDATE worlds SET operations = ? WHERE owner = ?').bind(JSON.stringify(journal),current.operationScope).run();
 const lookup=()=>world.GET(new Request(origin+'/api/world?save='+source.save.id+'&operationScope='+encodeURIComponent(originalSaveScopes.get(source.save.id))+'&operationId='+operationId)).then(r=>body(r));
 assert.equal((await lookup()).usageRecovery.unknownRange,true);
 await body(await world.POST(req({operation:'advance',operationId,operationScope:current.operationScope,worldContext:current.world.contextId,mode:'demo',minutes:5,timeContract:'five-minute-v1'},source.save.id)),502);
 const unresolved=await lookup();assert.equal(unresolved.usageRecovery.unknownRange,true);assert.equal(unresolved.usageRecovery.status,'pending');
 const deletion={operationScope:'test-owner',operation:'delete',operationId:crypto.randomUUID(),saveId:source.save.id,expectedVersion:current.version};
 const result=await body(await saves.POST(req(deletion)));
 assert.equal(result.accounting.unknownRange,true);assert.equal(result.accounting.retainedOperations,1);
 const summary=(await body(await saves.GET())).accountUsage;
 assert.equal(summary.unknownAccountingRanges,1);assert.equal(summary.archivedWorlds,1);
 await body(await world.GET(new Request(origin+'/api/world?save='+source.save.id)),404);
 const recovered=await body(await saves.GET(new Request(origin+'/api/saves?operationScope=test-owner&operationId='+deletion.operationId)));
 assert.equal(recovered.operation.accounting.unknownRange,true);
 assert.ok(!JSON.stringify(recovered.operation).includes('保存的開局記憶'));
});

test('copy snapshots custom model roles and deletion keeps account defaults, other saves and account Keys',async()=>{
 store.install(seedWorld());auth.setUserId('test-owner');const source=await create('自訂模型來源'),other=await create('其他設定');
 const settings=load('model-settings-route');
 const readSettings=save=>settings.GET(new Request(origin+'/api/model-settings'+(save?'?save='+save:''))).then(r=>body(r));
 const setSettings=(value,save)=>settings.POST(new Request(origin+'/api/model-settings'+(save?'?save='+save:''),{method:'POST',headers:{origin},body:JSON.stringify(originalAccountInput(value, 'account-operations:test-owner'))})).then(r=>body(r));
 const account={npc:{provider:'openai',model:'gpt-6-luna'},adjudication:{provider:'openai',model:'gpt-6.1-sol'}};
 const custom={npc:{provider:'openrouter',model:'vendor/npc-custom'},adjudication:{provider:'openrouter',model:'vendor/heaven-custom'}};
 await setSettings({version:0,mode:'custom',models:account});await setSettings({version:0,mode:'custom',models:custom},source.save.id);
 await body(await world.POST(req({operation:'set-model-key',mode:'ai',key:'account-shared-key'},source.save.id)));
 const current=await read(source.save.id),input={operationScope:'test-owner',operation:'copy',operationId:crypto.randomUUID(),saveId:source.save.id,expectedVersion:current.version,name:'保留自訂設定'};
 const copy=await body(await saves.POST(req(input)),201);
 const copiedSettings=await readSettings(copy.save.id);assert.equal(copiedSettings.source,'save');assert.deepEqual(copiedSettings.effective,custom);
 await setSettings({version:1,mode:'custom',models:account},source.save.id);
 await body(await saves.POST(req(input)));
 assert.deepEqual((await readSettings(copy.save.id)).effective,custom);
 await body(await saves.POST(req({operationScope:'test-owner',operation:'delete',operationId:crypto.randomUUID(),saveId:source.save.id,expectedVersion:current.version})));
 await body(await settings.GET(new Request(origin+'/api/model-settings?save='+source.save.id)),404);
 assert.deepEqual((await readSettings(copy.save.id)).effective,custom);
 assert.deepEqual((await readSettings(other.save.id)).effective,account);
 assert.deepEqual((await readSettings()).effective,account);
 assert.equal((await readSettings()).modelKeys.openrouter.configured,true);
});
