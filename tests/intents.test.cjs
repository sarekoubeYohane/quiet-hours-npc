/* eslint-disable @typescript-eslint/no-require-imports -- Node test fixtures load the temporary CommonJS build. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const build = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, `${name}.cjs`));
const { seedWorld } = build('world');
const { GET, POST } = build('route');
const store = build('store');
const intent = (id, content, context = '') => ({ id, content, intensity: 'high', importance: 'medium', urgency: 'low', context });
const request = body => new Request('https://test.invalid/api/world', { method: 'POST', headers: { origin: 'https://test.invalid' }, body: JSON.stringify({ mode: 'openai', ...body }) });
const advance = () => POST(request({ operation: 'advance', minutes: 15, model: 'gpt-6-luna', key: 'unit-test-key', limits: { calls: 120, tokens: 500000 } }));
const decision = (intents, action = {}) => ({ type: 'rest', target: '', content: '', mood: '平靜', durationMinutes: 15, intents, ...action });
const withModel = async (respond, run) => {
  const original = global.fetch;
  global.fetch = async (_url, init) => {
    const payload = JSON.parse(init.body);
    const data = JSON.parse(payload.messages[1].content);
    return Response.json({ usage: { prompt_tokens: 30, completion_tokens: 20 }, choices: [{ message: { content: JSON.stringify(respond(data.self.id, data, payload)) } }] });
  };
  try { await run(); } finally { global.fetch = original; }
};

test('world API persists NPC-selected queue order, including a waiting intent, in one decision per NPC', async () => {
  store.install(seedWorld()); let calls = 0;
  const queue = [intent('waiting', '確認 Vera 平安', '已傳訊息，還在等回覆'), intent('rest', '讓自己恢復精神')];
  await withModel(id => { calls++; return decision(id === 'cass' ? queue : []); }, async () => {
    assert.equal((await advance()).status, 200);
    assert.deepEqual((await (await GET()).json()).world.characters[0].intents, queue);
    assert.equal(calls, 4);
  });
});

test('every NPC receives the shared Playbook and only its own private queue and character setting', async () => {
  const world = seedWorld();
  for (const c of world.characters) c.intents = [intent(c.id, `${c.id}-private-intent`)];
  store.install(world); const prompts = [];
  await withModel((id, data, payload) => {
    prompts.push(payload.messages[0].content);
    assert.deepEqual(data.self.intents, world.characters.find(c => c.id === id).intents);
    for (const other of world.characters.filter(c => c.id !== id)) {
      assert.equal(JSON.stringify(data).includes(`${other.id}-private-intent`), false);
      assert.equal(JSON.stringify(data).includes(other.personality), false);
    }
    return decision(data.self.intents);
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
  const world = seedWorld(); world.characters[0].intents = [intent('prior', '先安頓自己')];
  store.install(world); let calls = 0;
  await withModel(() => decision(++calls === 1 ? [intent('new', '新的方向')] : [{ ...intent('invalid', '格式錯誤'), urgency: 'tomorrow' }]), async () => {
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
  const old = seedWorld(); delete old.characters[0].intents;
  old.characters[0].habits = [{ key: 'rest', type: 'rest', target: '', location: 'kris-home', period: 3, observedDays: [0, 1, 2], lastSeen: 1200 }];
  old.characters[0].plan = { action: { type: 'rest' }, startedAt: 1245, until: 1335, attention: '', modelKey: 'openai:gpt-6-luna' };
  store.install(old);
  const loaded = (await (await GET()).json()).world;
  assert.deepEqual(loaded.characters[0].intents, []);
  assert.deepEqual(loaded.characters[0].memories, old.characters[0].memories);
  assert.deepEqual(loaded.characters[0].habits, old.characters[0].habits);
  assert.deepEqual(loaded.characters[0].plan, old.characters[0].plan);
  await withModel(() => decision([]), async () => {
    assert.equal((await advance()).status, 200);
    assert.deepEqual((await (await GET()).json()).world.characters[0].plan, old.characters[0].plan);
  });
});

test('NPC can keep intentions after an action, reorder them, and remove one after receiving the actual blocked result', async () => {
  store.install(seedWorld()); const waiting = intent('waiting', '確認 Vera 平安', '等回覆');
  const recovering = intent('recovering', '好好休息'); let round = 0;
  await withModel((id, data) => {
    if (id !== 'cass') return decision([]);
    if (round === 0) return decision([waiting, recovering]);
    if (round === 1) {
      assert.deepEqual(data.self.intents, [waiting, recovering]);
      return decision([recovering, waiting], { type: 'work', target: 'unavailable-task' });
    }
    assert.deepEqual(data.self.intents, [recovering, waiting]);
    assert.ok(data.self.memories.some(m => m.text.includes('未通過規則檢查')));
    return decision([waiting]);
  }, async () => {
    for (round = 0; round < 3; round++) {
      assert.equal((await advance()).status, 200);
      const cass = (await (await GET()).json()).world.characters[0];
      assert.deepEqual(cass.intents, round === 0 ? [waiting, recovering] : round === 1 ? [recovering, waiting] : [waiting]);
    }
  });
});

test('continuing an activity retains its queue without additional model decisions', async () => {
  store.install(seedWorld()); const queue = [intent('recover', '恢復精神')]; let calls = 0;
  await withModel(() => { calls++; return decision(queue, { durationMinutes: 90 }); }, async () => {
    assert.equal((await advance()).status, 200);
    for (let i = 0; i < 5; i++) assert.equal((await advance()).status, 200);
    const saved = (await (await GET()).json()).world;
    assert.equal(calls, 4);
    assert.deepEqual(saved.characters.map(c => c.intents), [queue, queue, queue, queue]);
  });
});

for (const [name, malformed] of [
  ['missing queue', undefined], ['duplicate identifiers', [intent('same', '一'), intent('same', '二')]],
  ['oversized queue', Array.from({ length: 13 }, (_, i) => intent(String(i), '方向'))],
  ['blank intent', [intent('blank', ' ')]], ['oversized context', [intent('long', '方向', 'x'.repeat(401))]],
  ['unknown intent fields', [{ ...intent('extra', '方向'), deadline: 10 }]],
]) test(`model contract rejects ${name} without advancing the world`, async () => {
  const world = seedWorld(); store.install(world);
  await withModel(() => decision(malformed), async () => {
    assert.equal((await advance()).status, 502);
    const saved = (await (await GET()).json()).world;
    assert.deepEqual(saved.characters, world.characters);
    assert.equal(saved.turn, 0);
    assert.equal(saved.aiUsage.calls, 1);
    assert.equal(saved.aiUsage.inputTokens, 30);
  });
});

test('a storage conflict leaves no partially saved queue or activity', async () => {
  const world = seedWorld(); world.characters[0].intents = [intent('prior', '保留的方向')];
  store.install(world); store.conflictOnNextSave();
  await withModel(() => decision([intent('unsaved', '尚未儲存的方向')], { durationMinutes: 90 }), async () => {
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
