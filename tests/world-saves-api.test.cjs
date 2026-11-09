/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const load = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, name+'.cjs'));
const saves = load('saves-route');
const world = load('route');
const people = load('character-templates-route');
const scenes = load('scene-templates-route');
const store = load('store');
const auth = load('auth');
const { seedWorld } = load('world');
const { blankCharacterTemplateFields } = load('character-templates');
const origin = 'https://test.invalid';
const req = (body, save) => new Request(origin+'/api/world'+(save?'?save='+save:''),{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
const body = async (response,status=200) => {const value=await response.json();assert.equal(response.status,status,JSON.stringify(value));return value;};
const read = save => world.GET(new Request(origin+'/api/world?save='+save)).then(r=>body(r));
const operationId = () => Date.now()+':'+crypto.randomUUID();

test('existing story is listed and selection reads exactly its committed values without advancing', async()=>{
  auth.setUserId('test-owner');
  const old=seedWorld();old.turn=14;old.minute=1330;old.events.push({id:'history',time:1300,actor:'cass',kind:'event',audience:['cass'],text:'仍然保存的歷史'});
  store.install(old);
  const listed=await body(await saves.GET());
  assert.equal(listed.saves.length,1);
  assert.equal(listed.saves[0].id,'legacy');
  assert.equal(listed.saves[0].turn,14);
  const loaded=await read('legacy');
  assert.equal(loaded.world.turn,14);
  assert.equal(loaded.world.minute,1330);
  assert.ok(loaded.world.events.some(m=>m.text==='仍然保存的歷史'));
  assert.equal((await read('legacy')).version,loaded.version);
});

test('an empty account sees no saves and cannot install a seed by reading observation', async()=>{
  store.install(seedWorld());auth.setUserId('empty-account');
  assert.deepEqual((await body(await saves.GET())).saves,[]);
  await body(await world.GET(new Request(origin+'/api/world')),409);
  assert.deepEqual((await body(await saves.GET())).saves,[]);
  auth.setUserId('test-owner');
});

async function create(name) {
  const person=(await body(await people.POST(req({id:crypto.randomUUID(),version:0,fields:{...blankCharacterTemplateFields(),name:name+'的人'}})))).template;
  const scene=(await body(await scenes.POST(req({id:crypto.randomUUID(),version:0,name:name+'的場景',note:'',rooms:[{id:'front',name:'客廳'}],connections:[],objects:[]})),201)).template;
  const request={id:crypto.randomUUID(),name,city:{places:[{id:'home',templateId:scene.id,version:scene.version,name:name+'的家'}],characters:[{templateId:person.id,version:person.version,placeId:'home',roomId:'front'}]}};
  const saved=await body(await saves.POST(req(request)),201);
  return {request,saved};
}

test('two worlds created through real templates and the product API resume independently and recover one creation', async()=>{
  store.install(seedWorld());auth.setUserId('test-owner');
  const first=await create('河岸');
  const second=await create('山城');
  assert.notEqual(first.saved.save.id,second.saved.save.id);
  assert.equal((await body(await saves.GET())).saves.length,3);
  const a=await read(first.saved.save.id),b=await read(second.saved.save.id);
  assert.equal(a.world.turn,0);assert.equal(b.world.turn,0);
  assert.equal(a.world.characters[0].name,'河岸的人');assert.equal(b.world.characters[0].name,'山城的人');
  const advance={operation:'advance',mode:'demo',minutes:5,timeContract:'five-minute-v1',operationId:operationId(),operationScope:a.operationScope,worldContext:a.world.contextId};
  await body(await world.POST(req(advance,first.saved.save.id)));
  assert.equal((await read(first.saved.save.id)).world.turn,1);
  assert.equal((await read(second.saved.save.id)).world.turn,0);
  const replay=await body(await saves.POST(req(first.request)));
  assert.equal(replay.save.id,first.saved.save.id);
  assert.deepEqual(replay.world.characters[0].attributes,a.world.characters[0].attributes);
  assert.equal((await read(first.saved.save.id)).world.turn,1);
  assert.equal((await body(await saves.GET())).saves.length,3);
});

test('foreign accounts and stale source scopes cannot read, recover or mutate another save', async()=>{
  store.install(seedWorld());auth.setUserId('test-owner');
  const a=await create('甲'),b=await create('乙');
  const original=await read(a.saved.save.id);
  const attempt={operation:'advance',operationId:operationId(),operationScope:original.operationScope,worldContext:original.world.contextId,mode:'demo',minutes:5,timeContract:'five-minute-v1'};
  await body(await world.POST(req(attempt,b.saved.save.id)),409);
  assert.equal((await read(b.saved.save.id)).world.turn,0);
  auth.setUserId('other-account');
  assert.deepEqual((await body(await saves.GET())).saves,[]);
  await body(await world.GET(new Request(origin+'/api/world?save='+a.saved.save.id)),404);
  await body(await world.GET(new Request(origin+'/api/world?save='+a.saved.save.id+'&operationId='+attempt.operationId)),404);
  await body(await world.POST(req(attempt,a.saved.save.id)),404);
  auth.setUserId('test-owner');
  assert.equal((await read(a.saved.save.id)).world.turn,0);
  const changed={...a.request,name:'不該覆寫的名稱'};
  await body(await saves.POST(req(changed)),409);
  assert.equal((await body(await saves.GET())).saves.find(s=>s.id===a.saved.save.id).name,'甲');
});

test('a slow accepted operation and recovery remain attached to the source world after selecting another world', async()=>{
  store.install(seedWorld());auth.setUserId('test-owner');
  const a=await create('慢回覆'),b=await create('現在選檔');
  let original=await read(a.saved.save.id);
  await body(await world.POST(req({operation:'set-model-key',mode:'openai',key:'controlled-key'},a.saved.save.id)));
  await body(await world.POST(req({operation:'set-adjudication',mode:'demo',adjudication:{provider:'openai',model:'gpt-6.1-sol'},operationScope:original.operationScope,worldContext:original.world.contextId,operationId:operationId()},a.saved.save.id)));
  original=await read(a.saved.save.id);
  assert.equal((await read(b.saved.save.id)).modelKeys.openai.configured,true);
  const {fixtureDecision}=require('./pursuit-fixture.cjs');
  let release,started;
  const dispatched=new Promise(resolve=>{started=resolve;});
  const gate=new Promise(resolve=>{release=resolve;});
  const fetcher=global.fetch;let calls=0;
  global.fetch=async(_url,request)=>{calls++;started();await gate;const input=JSON.parse(JSON.parse(request.body).messages[1].content);return Response.json({usage:{prompt_tokens:10,completion_tokens:5},choices:[{message:{content:JSON.stringify(fixtureDecision(input,{type:'rest',target:'',content:''}))}}]});};
  const sent={operation:'advance',operationId:operationId(),operationScope:original.operationScope,worldContext:original.world.contextId,mode:'openai',model:'gpt-6.1-sol',minutes:5,timeContract:'five-minute-v1'};
  const request=req(sent,a.saved.save.id);request.headers.set('X-World-Time-Policy','round-v1');
  const accepted=world.POST(request);
  try {
    await dispatched;
    const selected=await read(b.saved.save.id);
    await body(await world.POST(req({operation:'advance',operationId:operationId(),operationScope:selected.operationScope,worldContext:selected.world.contextId,mode:'demo',minutes:5,timeContract:'five-minute-v1'},b.saved.save.id)));
    release();await body(await accepted);
    assert.equal((await read(a.saved.save.id)).world.turn,1);
    assert.equal((await read(b.saved.save.id)).world.turn,1);
    const recovered=await body(await world.GET(new Request(origin+'/api/world?save='+a.saved.save.id+'&operationId='+sent.operationId)));
    assert.equal(recovered.operation.state,'settled');
    const other=await body(await world.GET(new Request(origin+'/api/world?save='+b.saved.save.id+'&operationId='+sent.operationId)));
    assert.equal(other.operation.state,'unknown');
    await body(await world.POST(req(sent,b.saved.save.id)),409);
    const replay=req(sent,a.saved.save.id);replay.headers.set('X-World-Time-Policy','round-v1');
    await body(await world.POST(replay));
    assert.equal(calls,1);
  }finally{release();global.fetch=fetcher;await accepted;}
});

test('standalone authoring has an account operation ledger but cannot create or advance a world', async()=>{
  store.install(seedWorld());auth.setUserId('author-only');
  const workspace=origin+'/api/world?workspace=account';
  const original=await body(await world.GET(new Request(workspace)));
  assert.deepEqual(original.world.characters,[]);assert.deepEqual(original.world.events,[]);
  assert.deepEqual((await body(await saves.GET())).saves,[]);
  const request=new Request(workspace,{method:'POST',headers:{origin},body:JSON.stringify({operation:'advance',operationScope:original.operationScope,worldContext:original.world.contextId,operationId:operationId(),mode:'demo',minutes:5,timeContract:'five-minute-v1'})});
  await body(await world.POST(request),400);
  assert.deepEqual((await body(await saves.GET())).saves,[]);
  assert.equal((await body(await world.GET(new Request(workspace)))).world.turn,0);
  auth.setUserId('test-owner');
});

test('save installation is atomic, and a committed save whose response was lost recovers without forming again', async()=>{
  store.install(seedWorld());auth.setUserId('test-owner');
  const initial=await create('保存來源');
  const before=(await body(await saves.GET())).saves.length;
  const pending={...initial.request,id:crypto.randomUUID(),name:'交易失敗'};
  store.onStorage(sql=>{if(sql.startsWith('INSERT OR IGNORE INTO world_saves (owner,id,storage_owner,name,created_at,creation_request'))throw Error('controlled failure before registration');});
  await body(await saves.POST(req(pending)),503);
  store.onStorage(undefined);
  assert.equal((await body(await saves.GET())).saves.length,before);
  await body(await world.GET(new Request(origin+'/api/world?save='+pending.id)),404);
  let reads=0;
  store.onStorage(sql=>{if(sql.startsWith('SELECT s.name,s.created_at')&&++reads===2)throw Error('controlled response loss after commit');});
  const lost={...pending,id:crypto.randomUUID(),name:'回覆遺失'};
  await body(await saves.POST(req(lost)),503);
  store.onStorage(undefined);
  const committed=await read(lost.id);
  const recovered=await body(await saves.POST(req(lost)));
  assert.equal(recovered.save.id,lost.id);
  assert.deepEqual(recovered.world.characters[0].attributes,committed.world.characters[0].attributes);
  assert.deepEqual(recovered.world.characters[0].mentalEnergy,committed.world.characters[0].mentalEnergy);
  assert.equal((await body(await saves.GET())).saves.length,before+1);
});
