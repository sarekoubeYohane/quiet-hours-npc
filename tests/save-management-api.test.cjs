/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict'),test=require('node:test'),path=require('node:path');
const load=name=>require(path.join(process.env.QUIET_HOURS_TEST_BUILD,name+'.cjs'));
const saves=load('saves-route'),world=load('route'),people=load('character-templates-route'),scenes=load('scene-templates-route'),store=load('store'),auth=load('auth');
const {seedWorld}=load('world'),{blankCharacterTemplateFields}=load('character-templates');
const origin='https://test.invalid';
const req=(value,save)=>new Request(origin+'/api/world'+(save?'?save='+save:''),{method:'POST',headers:{origin,'Content-Type':'application/json','X-World-Time-Policy':'round-v1'},body:JSON.stringify(value)});
const body=async(response,status=200)=>{const value=await response.json();assert.equal(response.status,status,JSON.stringify(value));return value;};
const id=()=>Date.now()+':'+crypto.randomUUID();
const read=save=>world.GET(new Request(origin+'/api/world?save='+save)).then(r=>body(r));
async function create(name='來源') {
 const person=(await body(await people.POST(req({id:crypto.randomUUID(),version:0,fields:{...blankCharacterTemplateFields(),name:name+'人物',initialMemories:'保存的開局記憶'}})))).template;
 const scene=(await body(await scenes.POST(req({id:crypto.randomUUID(),version:0,name:'共享來源房屋',note:'',rooms:[{id:'front',name:'前室'}],connections:[],objects:[{id:'cup',name:'杯子',roomId:'front',state:{水量:'半杯'}}]})),201)).template;
 const input={id:crypto.randomUUID(),name,city:{places:[{id:'home',templateId:scene.id,version:scene.version,name:'本次住處'}],characters:[{templateId:person.id,version:person.version,placeId:'home',roomId:'front'}]}};
 const result=await body(await saves.POST(req(input)),201);return {input,...result};
}
async function advance(save,extra={}) {const current=await read(save);return body(await world.POST(req({operation:'advance',operationId:id(),operationScope:current.operationScope,worldContext:current.world.contextId,mode:'demo',minutes:5,timeContract:'five-minute-v1',...extra},save)));}

test('copy saves the complete committed life and in-progress activity without advancing or copying accounting',async()=>{
 store.install(seedWorld());auth.setUserId('test-owner');
 const source=await create();await advance(source.save.id);
 const current=await read(source.save.id);
 assert.ok(current.world.characters[0].plan);
 const input={operation:'copy',operationId:crypto.randomUUID(),saveId:source.save.id,expectedVersion:current.version,name:'分岔副本'};
 const copy=await body(await saves.POST(req(input)),201);
 const reread=await read(copy.save.id);
 const story=structuredClone(current.world),copiedStory=structuredClone(reread.world);delete story.aiUsage;delete copiedStory.aiUsage;
 assert.deepEqual(copiedStory,story);
 assert.equal(reread.world.aiUsage.totalCalls,0);
 assert.equal(reread.world.turn,current.world.turn);
 assert.equal(copy.save.originalOpeningAvailable,false);
 assert.deepEqual(copy.save.savedFrom,{id:source.save.id,name:'來源',version:current.version,turn:current.world.turn,minute:current.world.minute});
 const replay=await body(await saves.POST(req(input)));
 assert.equal(replay.save.id,copy.save.id);
 assert.equal((await body(await saves.GET())).saves.length,3);
});

test('deleting the source leaves the copy playable and does not delete other saves or reusable assets',async()=>{
 store.install(seedWorld());auth.setUserId('test-owner');
 const source=await create();await advance(source.save.id);const current=await read(source.save.id);
 const copied=await body(await saves.POST(req({operation:'copy',operationId:crypto.randomUUID(),saveId:source.save.id,expectedVersion:current.version,name:'獨立副本'})),201);
 const templateBefore=await body(await people.GET()),sceneBefore=await body(await scenes.GET());
 const deletion={operation:'delete',operationId:crypto.randomUUID(),saveId:source.save.id,expectedVersion:current.version};
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
 const copiedDeletion={operation:'delete',operationId:crypto.randomUUID(),saveId:copied.save.id,expectedVersion:(await read(copied.save.id)).version};
 await body(await saves.POST(req(copiedDeletion)));
 const originalCopy=await body(await saves.POST(req({operation:'copy',operationId:copied.save.id,saveId:source.save.id,expectedVersion:current.version,name:'獨立副本'})));
 assert.equal(originalCopy.save.id,copied.save.id);
 assert.equal((await body(await saves.GET())).saves.length,1);
});

test('copy does not duplicate real model usage and deletion preserves the account bill without a recall billing service',async()=>{
 store.install(seedWorld());auth.setUserId('test-owner');const source=await create('費用來源');
 const {fixtureDecision}=require('./pursuit-fixture.cjs');const originalFetch=global.fetch;
 global.fetch=async(_url,request)=>{const input=JSON.parse(JSON.parse(request.body).messages[1].content);return Response.json({usage:{prompt_tokens:10,completion_tokens:5},choices:[{message:{content:JSON.stringify(fixtureDecision(input,{type:'rest',target:'',content:''}))}}]});};
 const act=async(value)=>{const current=await read(source.save.id);return body(await world.POST(req({operationId:id(),operationScope:current.operationScope,worldContext:current.world.contextId,mode:'demo',...value},source.save.id)));};
 try {
  await act({operation:'set-model-key',mode:'openai',key:'controlled-private-key'});
  await act({operation:'set-adjudication',adjudication:{provider:'openai',model:'gpt-6.1-sol'}});
  await act({operation:'set-price',price:{provider:'openai',model:'gpt-6.1-sol',input:1,output:1,source:'受控單價',date:'2026-11-09'}});
  await advance(source.save.id,{mode:'openai',model:'gpt-6.1-sol'});
  const current=await read(source.save.id),before=(await body(await saves.GET())).accountUsage;
  assert.equal(before.totalCalls,1);assert.equal(before.totalInputTokens,10);assert.equal(before.totalOutputTokens,5);assert.ok(Math.abs(before.knownUsd-0.000015)<1e-12);
  const copy=await body(await saves.POST(req({operation:'copy',operationId:crypto.randomUUID(),saveId:source.save.id,expectedVersion:current.version,name:'不帶費用的副本'})),201);
  assert.equal((await read(copy.save.id)).world.aiUsage.totalCalls,0);
  assert.equal((await body(await saves.GET())).accountUsage.totalCalls,1);
  await body(await saves.POST(req({operation:'delete',operationId:crypto.randomUUID(),saveId:source.save.id,expectedVersion:current.version})));
  const after=(await body(await saves.GET())).accountUsage;
  assert.equal(after.totalCalls,1);assert.equal(after.totalInputTokens,10);assert.equal(after.knownUsd,before.knownUsd);assert.equal(after.archivedWorlds,1);
  assert.equal((await read(copy.save.id)).modelKeys.openai.configured,true);
  auth.setUserId('different-account');assert.equal((await body(await saves.GET())).accountUsage.totalCalls,0);auth.setUserId('test-owner');
 }finally{global.fetch=originalFetch;}
});

test('copy/delete reject stale versions and foreign accounts and leave transactions recoverable across failures',async()=>{
 store.install(seedWorld());auth.setUserId('test-owner');const source=await create();const current=await read(source.save.id);
 const input={operation:'copy',operationId:crypto.randomUUID(),saveId:source.save.id,expectedVersion:current.version,name:'原子副本'};
 auth.setUserId('other');await body(await saves.POST(req(input)),404);auth.setUserId('test-owner');
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
 const deletion={operation:'delete',operationId:crypto.randomUUID(),saveId:source.save.id,expectedVersion:current.version};
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
  const copied=await body(await saves.POST(req({operation:'copy',operationId:crypto.randomUUID(),saveId:source.save.id,expectedVersion:current.version,name:'獨立記憶副本'})),201);
  const deletion={operation:'delete',operationId:crypto.randomUUID(),saveId:source.save.id,expectedVersion:current.version};
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
  await body(await saves.POST(req({operation:'copy',operationId:crypto.randomUUID(),saveId:source.save.id,expectedVersion:current.version,name:'不可偷複製請求'})),409);
  await body(await saves.POST(req({operation:'delete',operationId:crypto.randomUUID(),saveId:source.save.id,expectedVersion:current.version})),409);
  release();await running;
  assert.equal((await read(source.save.id)).world.turn,1);
  assert.equal((await body(await saves.GET())).saves.length,2);
 }finally{release();await running;global.fetch=originalFetch;}
});
