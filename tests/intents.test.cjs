/* eslint-disable @typescript-eslint/no-require-imports -- Node test fixtures load the temporary CommonJS build. */
const {fixtureDecision,fixturePursuitDecision,expectedUnreferencedPursuits}=require('./pursuit-fixture.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const build = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, `${name}.cjs`));
const { seedWorld } = build('world');
const { GET, POST } = build('route');
const store = build('store');
const intent = (id, content, context = '') => ({ id, content, intensity: 'high', importance: 'medium', urgency: 'low', context });
const request = body => new Request('https://test.invalid/api/world', { method: 'POST', headers: { origin: 'https://test.invalid', 'X-World-Time-Policy':'round-v1' }, body: JSON.stringify({ operationId: `${Date.now()}:${crypto.randomUUID()}`, mode: 'openai', ...body }) });
const advance = async () => { await POST(request({ operation: 'set-model-key', mode: 'openai', key: 'unit-test-key' })); return POST(request({ operation: 'advance', minutes: 15, model: 'gpt-6-luna', limits: { calls: 120, tokens: 500000 } })) };
const decision = (data,intents, action = {}) => fixturePursuitDecision(data,{ type: 'rest', target: '', content: '', mood: '平靜', durationMinutes: 15, intents, ...action });
const children=c=>c.intents.filter(n=>n.kind!=='direction');
const ids=c=>children(c).filter(n=>n.status==='active').map(n=>n.id);
const withModel = async (respond, run) => {
  const original = global.fetch;
  global.fetch = async (_url, init) => {
    const payload = JSON.parse(init.body);
    const data = JSON.parse(payload.messages[1].content);
    return Response.json({ usage: { prompt_tokens: 30, completion_tokens: 20 }, choices: [{ message: { content: JSON.stringify(respond(data.self.id, data, payload)) } }] });
  };
  try { await run(); } finally { global.fetch = original; }
};

const worldWithAdjudication = require('./fixtures/ai-world.cjs')(seedWorld);

test('world API persists NPC-selected queue order, including a waiting intent, in one decision per NPC', async () => {
  store.install(worldWithAdjudication()); let calls = 0;
  const queue = [intent('waiting', '確認 Vera 平安', '已傳訊息，還在等回覆'), intent('rest', '讓自己恢復精神')];
  await withModel((id,data) => { calls++; return decision(data,id === 'cass' ? queue : []); }, async () => {
    assert.equal((await advance()).status, 200);
    assert.deepEqual(children((await (await GET()).json()).world.characters[0]).map(n=>n.content),queue.map(n=>n.content));
    assert.equal(calls, 4);
  });
});

test('every NPC receives the shared Playbook and only its own private queue and character setting', async () => {
  const world = worldWithAdjudication();
  for (const c of world.characters) c.intents.push({...intent(c.id+':private', `${c.id}-private-intent`),version:1,kind:'intent',scope:'本人私有方向',satisfaction:null,parents:[],references:[],status:'active',reason:'合成起點'});
  store.install(world); const prompts = [];
  await withModel((id, data, payload) => {
    prompts.push(payload.messages[0].content);
    assert.deepEqual(data.self.intents, expectedUnreferencedPursuits(world.characters.find(c => c.id === id).intents));
    for(const node of data.self.intents){assert.equal(Object.hasOwn(node,'reason'),false);assert.deepEqual(node.sourceGaps,{formation:0,assessment:0});}
    for (const other of world.characters.filter(c => c.id !== id)) {
      assert.equal(JSON.stringify(data).includes(`${other.id}-private-intent`), false);
      assert.equal(JSON.stringify(data).includes(other.personality), false);
    }
    return decision(data,[]);
  }, async () => {
    assert.equal((await advance()).status, 200);
    assert.equal(prompts.length, 4);
    assert.ok(prompts.every(p => p === prompts[0]));
    assert.match(prompts[0], /意圖強度|越強烈的意圖/);
    assert.match(prompts[0], /輕重緩急/);
    assert.match(prompts[0], /尚未執行|已知結果/);
  });
});

test('invalid queue rolls back the entire round and preserves paid usage', async () => {
  const world = worldWithAdjudication(); /* New world retains its seed direction. */
  store.install(world); let calls = 0;
  await withModel((_id,data) => {const value=decision(data,[intent('new','新的方向')]);if(++calls===2)value.pursuitUpdates[0].node.urgency='tomorrow';return value;}, async () => {
    assert.equal((await advance()).status, 502);
    const saved = (await (await GET()).json()).world;
    assert.equal(saved.turn, 0); assert.equal(saved.minute, world.minute);
    assert.deepEqual(saved.characters, world.characters);
    assert.equal(saved.aiUsage.calls, 2);
    assert.equal(saved.aiUsage.inputTokens, 60);
    assert.equal(saved.aiUsage.outputTokens, 40);
  });
});

test('old worlds load empty queues while preserving their memories, habits and activity progress', async () => {
  const old = worldWithAdjudication(); delete old.pursuitVersion;delete old.pursuitContext;delete old.characters[0].intents;
  old.characters[0].habits = [{ key: 'rest', type: 'rest', target: '', location: 'kris-home', period: 3, observedDays: [0, 1, 2], lastSeen: 1200 }];
  old.characters[0].plan = { action: { type: 'rest' }, startedAt: 1245, until: 1335, attention: '', modelKey: 'openai:gpt-6-luna' };
  store.install(old);
  const loaded = (await (await GET()).json()).world;
  assert.deepEqual(loaded.characters[0].intents.filter(node=>node.kind!=='direction'),[]);
  assert.deepEqual(loaded.characters[0].memories, old.characters[0].memories);
  assert.deepEqual(loaded.characters[0].habits, old.characters[0].habits);
  assert.deepEqual(loaded.characters[0].plan, old.characters[0].plan);
  await withModel((_id,data) => decision(data,[]), async () => {
    assert.equal((await advance()).status, 409);
    assert.deepEqual((await (await GET()).json()).world.characters[0].plan, old.characters[0].plan);
  });
});

test('NPC keeps omitted pursuits across a blocked action and explicitly drops one afterward', async () => {
  store.install(worldWithAdjudication()); const waiting = intent('waiting', '確認 Vera 平安', '等回覆');
  const recovering = intent('recovering', '好好休息'); let round = 0;
  await withModel((id, data) => {
    if (id !== 'cass') return decision(data,[]);
    if (round === 0) return decision(data,[waiting, recovering]);
    if (round === 1) {
      assert.deepEqual(ids(data.self), ['cass:waiting','cass:recovering']);
      return decision(data,[], { type: 'work', target: 'unavailable-task' });
    }
    assert.deepEqual(ids(data.self), ['cass:waiting','cass:recovering']);
    assert.ok(data.self.memories.some(m => m.text.includes('未通過規則檢查')));
    return fixtureDecision(data,{type:'rest',target:'',content:'',mood:'平靜',durationMinutes:15,intents:[]},{drop:['cass:recovering']});
  }, async () => {
    for (round = 0; round < 3; round++) {
      assert.equal((await advance()).status, 200);
      const cass = (await (await GET()).json()).world.characters[0];
      assert.deepEqual(ids(cass),round<2?['cass:waiting','cass:recovering']:['cass:waiting']);
    }
  });
});

test('continuing an activity retains its queue without additional model decisions', async () => {
  store.install(worldWithAdjudication()); const queue = [intent('recover', '恢復精神')]; let calls = 0;
  await withModel((_id,data) => { calls++; return decision(data,queue, { durationMinutes: 90 }); }, async () => {
    assert.equal((await advance()).status, 200);
    for (let i = 0; i < 5; i++) assert.equal((await advance()).status, 200);
    const saved = (await (await GET()).json()).world;
    assert.equal(calls, 4);
    assert.ok(saved.characters.every(c=>children(c).length===1&&children(c)[0].id===c.id+':recover'&&children(c)[0].version===1));
  });
});

for(const [name,mutate] of [
 ['old full array',v=>{delete v.pursuitUpdates;v.intents=[];}],
 ['duplicate identifiers',v=>{v.pursuitUpdates.push(structuredClone(v.pursuitUpdates[0]));}],
 ['oversized increment',v=>{v.pursuitUpdates=Array(5).fill(v.pursuitUpdates[0]);}],
 ['blank intent',v=>{v.pursuitUpdates[0].node.content=' ';}],
 ['oversized context',v=>{v.pursuitUpdates[0].node.context='x'.repeat(401);}],
 ['unknown intent fields',v=>{v.pursuitUpdates[0].node.deadline=10;}],
])test('v3 contract rejects '+name+' without advancing',async()=>{
 const initial=worldWithAdjudication();store.install(initial);
 await withModel((_id,data)=>{const v=decision(data,[intent('new','方向')]);mutate(v);return v;},async()=>{assert.equal((await advance()).status,502);const saved=(await(await GET()).json()).world;assert.deepEqual(saved.characters,initial.characters);assert.equal(saved.turn,0);assert.equal(saved.aiUsage.calls,1);assert.equal(saved.aiUsage.inputTokens,30);});
});

test('a storage conflict leaves no partially saved queue or activity', async () => {
  const world = worldWithAdjudication(); /* Keep the new seed direction. */
  store.install(world); store.conflictOnNextSave();
  await withModel((_id,data) => decision(data,[intent('unsaved', '尚未儲存的方向')], { durationMinutes: 90 }), async () => {
    const response = await advance();
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /儲存衝突/);
    const saved = (await (await GET()).json()).world;
    assert.deepEqual(saved.characters, world.characters);
    assert.deepEqual(saved.events, world.events);
    assert.equal(saved.minute, world.minute);
    assert.equal(saved.turn, 0);
    assert.equal(saved.aiUsage.totalCalls, 4);
    assert.equal(saved.aiUsage.totalInputTokens, 120);
    assert.equal(saved.aiUsage.totalOutputTokens, 80);
  });
});

