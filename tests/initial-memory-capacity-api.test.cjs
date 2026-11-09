/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const realNow=Date.now;
test.before(()=>{Date.now=()=>1793836800000;});
test.after(()=>{Date.now=realNow;});
const load = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, name + '.cjs'));
const {installHistoricalCity}=require('./historical-city-fixture.cjs');
const people = load('character-templates-route');
const route = load('route');
const store = load('store');
const {fixtureDecision} = require('./pursuit-fixture.cjs');
const id = () => Date.now()+':'+crypto.randomUUID();
const send = (api, body) => api.POST(new Request('https://test.invalid', {
  method:'POST',headers:{origin:'https://test.invalid','X-World-Time-Policy':'round-v1'},body:JSON.stringify(body),
}));
const json = async (response,status) => { const body=await response.json(); assert.equal(response.status,status,JSON.stringify(body)); return body; };
const read = async () => json(await route.GET(),200);
const list = async () => (await json(await people.GET(),200)).templates;
const draft = value => ({id:crypto.randomUUID(),version:0,fields:{...load('character-templates').blankCharacterTemplateFields(),name:'孟澄',initialMemories:value}});
const scope = state => ({mode:'demo',worldContext:state.world.contextId,operationScope:state.operationScope,expectedVersion:state.version});
const cityFor = async template => {
  const scene=(await json(await load('scene-templates-route').GET(),200)).templates[0];
  return {places:[{id:'one',templateId:scene.id,version:scene.version,name:'測試屋'}],characters:[{templateId:template.id,version:template.version,placeId:'one',roomId:scene.rooms[0].id}]};
};

for(const value of ['憶'.repeat(1365),'憶'.repeat(1366),'憶'.repeat(1500),'x'.repeat(2400),'憶'.repeat(1365)+'a','憶'.repeat(1365)+'ab','x'.repeat(2401)]) {
  test(`initial memory ${value.length} chars / ${Buffer.byteLength(value)} bytes: save, reload and historical city lifecycle`, async () => {
    store.install(load('world').seedWorld());
    const original=await read();
    const input=draft(value);
    const accepted=Buffer.byteLength(value)<=4096 && value.length<=2400;
    const body=await json(await send(people,input),accepted?200:400);
    if(!accepted) {
      if(Buffer.byteLength(value)>4096) {assert.equal(body.field,'initialMemories');assert.match(body.error,/初始記憶.*4096.*縮短/);}
      assert.deepEqual(await list(),[]);
      assert.deepEqual(await read(),original);
      return;
    }
    const template=(await list()).find(t=>t.id===body.template.id);
    assert.equal(template.fields.initialMemories,value);
    const city=await cityFor(template);
    const preview=await json(await send(route,{...scope(original),operation:'preview-city',city}),200);
    assert.deepEqual(preview.preview.issues,[]);
    assert.deepEqual(await read(),original);
    const {world}=await installHistoricalCity(city);
    assert.equal((await read()).world.characters[0].profile.initialMemories,value);
    assert.ok((await read()).world.characters[0].shortTerm.some(m=>m.text===value));
    await json(await send(route,{operation:'set-model-key',mode:'openai',key:'controlled'}),200);
    await json(await send(route,{operation:'set-adjudication',mode:'demo',worldContext:world.contextId,operationId:id(),adjudication:{provider:'openai',model:'gpt-6.1-sol'}}),200);
    const transport=global.fetch, inputs=[];
    global.fetch=async (_url,request)=>{
      const input=JSON.parse(JSON.parse(request.body).messages[1].content);inputs.push(input);
      return Response.json({usage:{prompt_tokens:10,completion_tokens:5},choices:[{message:{content:JSON.stringify(fixtureDecision(input,{type:'rest',target:'',content:''}))}}]});
    };
    try {
      const result=await json(await send(route,{operation:'advance',operationId:id(),worldContext:world.contextId,mode:'openai',model:'gpt-6.1-sol',minutes:5,timeContract:'five-minute-v1'}),200);
      assert.equal(result.world.turn,1);
      assert.equal(inputs.length,1);
      assert.ok(inputs[0].self.shortTerm.some(memory=>memory.text===value));
      assert.equal(result.world.aiUsage.totalCalls,1);
      assert.equal((await list())[0].fields.initialMemories,value);
    } finally {global.fetch=transport;}
  });
}

test('legacy oversized templates stay readable and editable; all city operations reject before model dispatch or world changes', async () => {
  const existing=load('world').seedWorld();
  existing.aiUsage={windowStartedAt:Date.now(),calls:2,inputTokens:60,outputTokens:15,unknownCalls:0,totalCalls:2,totalInputTokens:60,totalOutputTokens:15,totalUnknownCalls:0,savedDecisions:1};
  store.install(existing);
  const original=await read();
  const input=draft('憶'.repeat(1500));
  // Historical row accepted by dabcf5a, rather than a test-only world setup shortcut.
  await store.database().prepare('INSERT INTO character_templates (owner,id,version,fields) VALUES (?,?,1,?)').bind('test-owner',input.id,JSON.stringify(input.fields)).run();
  const template=(await list())[0];
  assert.deepEqual(template.fields,input.fields);
  const city=await cityFor(template);
  let calls=0; const transport=global.fetch;
  global.fetch=async ()=>{calls++;throw Error('must not dispatch');};
  try {
    for(const operation of ['preview-city','start-city','initialize-city','suggest-opening-relationships']) {
      const result=await json(await send(route,{...scope(original),operation,operationId:id(),city,openingDescription:'孟澄在測試屋居住'}),operation==='preview-city'?200:operation==='start-city'?409:400);
      const message=operation==='preview-city'?result.preview.issues.join(' '):result.error;
      if(operation==='start-city')assert.match(message,/新開存檔/);else assert.match(message,/孟澄.*初始記憶.*4500.*4096.*人物範本.*縮短/);
      assert.equal(result.stopReason,undefined);
      assert.deepEqual(await read(),original);
      assert.equal(store.archivedWorld(),undefined);
      assert.deepEqual((await list())[0],template);
    }
    const failed=await json(await send(people,{...template,fields:{...template.fields,appearance:'新外觀'}}),400);
    assert.equal(failed.field,'initialMemories');
    assert.deepEqual((await list())[0],template);
    const corrected=await json(await send(people,{...template,fields:{...template.fields,initialMemories:'憶'.repeat(1365)}}),200);
    city.characters[0].version=corrected.template.version;
    assert.deepEqual((await json(await send(route,{...scope(original),operation:'preview-city',city}),200)).preview.issues,[]);
    assert.equal(calls,0);
  } finally {global.fetch=transport;}
});

test('generation validates filled memory before dispatch and oversized generated memory without losing paid usage or changing the story',async()=>{
  store.install(load('world').seedWorld());
  const transport=global.fetch;let calls=0;
  global.fetch=async()=>{calls++;return Response.json({usage:{prompt_tokens:10,completion_tokens:5},choices:[{message:{content:JSON.stringify({initialMemories:'憶'.repeat(1500)})}}]});};
  try {
    const before=await read();
    const fields=draft('憶'.repeat(1500)).fields;
    const rejected=await json(await send(route,{...scope(before),operation:'generate-character-template',operationId:id(),characterGeneration:{description:'填寫空白',fields}}),400);
    assert.match(rejected.error,/初始記憶.*4096/);assert.equal(calls,0);
    assert.deepEqual(await read(),before);
    await json(await send(route,{operation:'set-model-key',mode:'openai',key:'controlled'}),200);
    await json(await send(route,{operation:'set-adjudication',mode:'demo',worldContext:before.world.contextId,operationId:id(),adjudication:{provider:'openai',model:'gpt-6.1-sol'}}),200);
    const current=await read();
    const request={...scope(current),operation:'generate-character-template',operationId:id(),characterGeneration:{description:'填寫記憶',fields:{...fields,initialMemories:''}}};
    const failed=await json(await send(route,request),502);
    assert.match(failed.error,/初始記憶.*4500.*4096/);
    await json(await send(route,request),502);assert.equal(calls,1);
    const after=await read();
    assert.equal(after.world.aiUsage.totalCalls,1);
    assert.equal(after.world.turn,current.world.turn);assert.equal(after.world.minute,current.world.minute);
    assert.deepEqual(after.world.characters,current.world.characters);assert.deepEqual(await list(),[]);
  }finally{global.fetch=transport;}
});
