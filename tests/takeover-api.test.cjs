/* eslint-disable @typescript-eslint/no-require-imports -- Fixtures load the temporary CommonJS build. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const build = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, `${name}.cjs`));
const { seedWorld } = build('world');
const { GET, POST } = build('route');
const store = build('store');
const request = body => new Request('https://test.invalid/api/world', { method:'POST', headers:{origin:'https://test.invalid'}, body:JSON.stringify({mode:'demo', ...body}) });
const read = async () => (await (await GET()).json()).world;
const owner = world => world.characters.find(c => c.id === 'owner');
const queue = [{id:'care',content:'照顧咖啡館',intensity:'high',importance:'medium',urgency:'low',context:'晚點整理'}];
const advance = (limits={calls:120,tokens:500000}) => POST(request({operation:'advance',minutes:15,mode:'openai',model:'gpt-6-luna',key:'unit-test-key',limits}));
const withModel = async run => {
  const original = global.fetch; const perceived=[];
  global.fetch = async (_url, init) => {
    const data = JSON.parse(JSON.parse(init.body).messages[1].content); perceived.push(data);
    return Response.json({usage:{prompt_tokens:30,completion_tokens:20},choices:[{message:{content:JSON.stringify({type:'rest',target:'',content:'',mood:'平靜',durationMinutes:15,intents:data.self.intents})}}]});
  };
  try { await run(perceived); } finally { global.fetch=original; }
};
test('takeover persists and waiting owner makes no autonomous calls while other characters advance within their budget', async () => {
  const world=seedWorld(); owner(world).intents=queue;
  owner(world).plan={action:{type:'work',target:'tea'},startedAt:1245,until:1335,attention:'',modelKey:'openai:gpt-6-luna'};
  store.install(world);
  assert.equal((await POST(request({operation:'takeover'}))).status,200);
  assert.equal(owner(await read()).control.mode,'taken-over');
  assert.equal(owner(await read()).plan,undefined);
  await withModel(async perceived => {
    assert.equal((await advance({calls:3,tokens:500000})).status,200);
    const saved=await read(); assert.equal(saved.turn,1); assert.deepEqual(owner(saved).intents,queue);
    assert.deepEqual(perceived.map(p=>p.self.id),['cass','vera','kris']);
    assert.match(owner(saved).activity,/待命/);
  });
});

test('return re-evaluates preserved intentions and only known takeover experiences in one decision, without learning controlled habits', async () => {
  const world=seedWorld(); owner(world).intents=queue; store.install(world);
  assert.equal((await POST(request({operation:'takeover'}))).status,200);
  await withModel(async perceived => {
    for (const content of ['只有店主知道的想法一','只有店主知道的想法二']) {
      assert.equal((await POST(request({operation:'direct',action:{type:'reflect',content}}))).status,200);
      assert.equal(owner(await read()).control.pending.content,content);
      for(let i=0;i<4;i++) assert.equal((await advance()).status,200);
      assert.equal(owner(await read()).control.mode,'taken-over');
    }
    assert.equal(perceived.some(p=>p.self.id==='owner'),false);
    assert.deepEqual(owner(await read()).habits || [],[]);
    assert.equal((await POST(request({operation:'intervene',target:'cass',text:'Cass的私密事件'}))).status,200);
    assert.equal((await POST(request({operation:'return-control'}))).status,200);
    const returned=owner(await read()); assert.equal(returned.control.mode,'autonomous'); assert.equal(returned.plan,undefined);
    assert.deepEqual(returned.intents,queue);
    assert.equal((await advance()).status,200);
    const decisions=perceived.filter(p=>p.self.id==='owner'); assert.equal(decisions.length,1);
    assert.deepEqual(decisions[0].self.intents,queue);
    assert.ok(decisions[0].self.memories.some(m=>m.text.includes('只有店主知道的想法二')));
    assert.equal(JSON.stringify(decisions[0]).includes('Cass的私密事件'),false);
  });
});

test('failed takeover round and conflicting control save leave no partial world or control changes', async () => {
  store.install(seedWorld());
  store.conflictOnNextSave();
  assert.equal((await POST(request({operation:'takeover'}))).status,502);
  assert.equal(owner(await read()).control.mode,'autonomous');
  assert.equal((await POST(request({operation:'takeover'}))).status,200);
  assert.equal((await POST(request({operation:'direct',action:{type:'reflect',content:'尚未執行的私密指定'}}))).status,200);
  const before=await read(); const original=global.fetch;
  global.fetch=async()=>{throw Error('provider unavailable');};
  try { assert.equal((await advance()).status,502); } finally { global.fetch=original; }
  const after=await read(); assert.deepEqual(after.characters,before.characters); assert.deepEqual(after.events,before.events);
  assert.equal(after.turn,before.turn); assert.equal(after.minute,before.minute);
  for(const operation of ['takeover','return-control']) {
    assert.equal((await POST(request({operation,target:'cass'}))).status,400);
    assert.deepEqual((await read()).characters,after.characters);
  }
});

test('return ends an unfinished designated activity and cancels a pending command without erasing its actual history', async () => {
  const world=seedWorld(); owner(world).intents=queue; store.install(world);
  assert.equal((await POST(request({operation:'takeover'}))).status,200);
  assert.equal((await POST(request({operation:'direct',action:{type:'work',target:'tea'}}))).status,200);
  await withModel(async perceived => {
    assert.equal((await advance()).status,200);
    assert.equal(owner(await read()).control.active,true);
    assert.equal((await POST(request({operation:'direct',action:{type:'reflect',content:'取消的想法'}}))).status,200);
    store.conflictOnNextSave();
    assert.equal((await POST(request({operation:'return-control'}))).status,502);
    assert.equal(owner(await read()).control.mode,'taken-over');
    assert.equal(owner(await read()).control.pending.content,'取消的想法');
    assert.equal((await POST(request({operation:'return-control'}))).status,200);
    const returned=owner(await read()); assert.equal(returned.control.mode,'autonomous'); assert.equal(returned.plan,undefined);
    assert.ok(returned.memories.some(m=>m.text.includes('泡了一壺茶')));
    assert.equal((await advance()).status,200);
    const data=perceived.filter(p=>p.self.id==='owner'); assert.equal(data.length,1);
    assert.equal(JSON.stringify(data[0]).includes('取消的想法'),false);
    assert.deepEqual(data[0].self.intents,queue);
  });
});

test('first autonomous decision receives earlier known takeover results beyond twelve recent memories and retries after failure', async () => {
  const world = seedWorld(); owner(world).intents = queue; store.install(world);
  assert.equal((await POST(request({operation:'takeover'}))).status, 200);
  assert.equal((await POST(request({operation:'intervene',target:'owner',text:'等候的客人已回覆：今晚不來'}))).status, 200);
  for (let i = 0; i < 16; i++) {
    assert.equal((await POST(request({operation:'intervene',target:'owner',text:`稍後知情的事情${i}`}))).status, 200);
  }
  assert.equal((await POST(request({operation:'intervene',target:'cass',text:'Cass不公開的秘密'}))).status, 200);
  assert.equal((await POST(request({operation:'return-control'}))).status, 200);
  const returned = await read(); assert.ok(owner(returned).memories.some(m => m.text.includes('今晚不來')));
  const original = global.fetch; let fail = true; const ownerInputs = []; const otherInputs = [];
  global.fetch = async (_url, init) => {
    const data = JSON.parse(JSON.parse(init.body).messages[1].content);
    if (data.self.id === 'owner') {
      ownerInputs.push(data);
      if (fail) return Response.json({choices:[{message:{content:'invalid response'}}]});
    } else {
      otherInputs.push(data);
    }
    return Response.json({usage:{prompt_tokens:30,completion_tokens:20},choices:[{message:{content:JSON.stringify({type:'rest',target:'',content:'',mood:'',durationMinutes:15,intents:data.self.intents})}}]});
  };
  try {
    assert.equal((await advance()).status, 502);
    assert.equal(ownerInputs[0].self.memories.some(m => m.text.includes('今晚不來')), false);
    assert.ok(ownerInputs[0].knownControlExperiences?.some(m => m.text.includes('今晚不來')));
    assert.equal(JSON.stringify(ownerInputs[0]).includes('Cass不公開的秘密'), false);
    assert.ok(otherInputs.every(p => !JSON.stringify(p).includes('今晚不來')));
    assert.deepEqual((await read()).characters, returned.characters);
    fail = false; assert.equal((await advance()).status, 200);
    assert.equal(ownerInputs.length, 2);
    assert.deepEqual(ownerInputs[1].knownControlExperiences, ownerInputs[0].knownControlExperiences);
    ownerInputs.length = 0;
    assert.equal((await advance()).status, 200);
    assert.equal(ownerInputs.length, 1);
    assert.equal(ownerInputs[0].knownControlExperiences, undefined);
  } finally { global.fetch = original; }
});

test('return context stays bounded at eighty known experiences and survives a failed final transaction', async () => {
  store.install(seedWorld()); assert.equal((await POST(request({operation:'takeover'}))).status, 200);
  for (let i = 0; i < 81; i++) {
    assert.equal((await POST(request({operation:'intervene',target:'owner',text:`控制經歷-${i}-結束`}))).status, 200);
  }
  assert.equal((await POST(request({operation:'return-control'}))).status, 200);
  await withModel(async perceived => {
    store.conflictOnNextSave(); assert.equal((await advance()).status, 502);
    const first = perceived.find(p => p.self.id === 'owner');
    assert.equal(first.knownControlExperiences.length, 80);
    assert.equal(first.knownControlExperiences.some(m => m.text.includes('控制經歷-0-結束')), false);
    assert.ok(first.knownControlExperiences.some(m => m.text.includes('控制經歷-1-結束')));
    assert.ok(first.knownControlExperiences.some(m => m.text.includes('控制經歷-80-結束')));
    assert.equal((await advance()).status, 200);
    const second = perceived.filter(p => p.self.id === 'owner')[1];
    assert.deepEqual(second.knownControlExperiences, first.knownControlExperiences);
    assert.equal(owner(await read()).control.experiences, undefined);
  });
});
