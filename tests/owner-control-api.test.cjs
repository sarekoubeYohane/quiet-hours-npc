/* eslint-disable @typescript-eslint/no-require-imports -- Node test fixtures load the temporary CommonJS build. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const build = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, `${name}.cjs`));
const { seedWorld } = build('world');
const { GET, POST } = build('route');
const store = build('store');
const request = body => new Request('https://test.invalid/api/world', { method: 'POST', headers: { origin: 'https://test.invalid' }, body: JSON.stringify({ mode: 'demo', ...body }) });
const read = async () => (await (await GET()).json()).world;

test('old worlds gain an independent cafe owner without replacing existing progress', async () => {
  const old = seedWorld(); old.characters = old.characters.filter(c => c.id !== 'owner'); old.minute = 1380; old.turn = 8;
  old.characters[0].activity = '保留中的活動'; old.characters[0].plan = { action: { type: 'rest' }, startedAt: 1365, until: 1455, attention: '', modelKey: 'demo' };
  store.install(old);
  const saved = await read();
  assert.equal(saved.characters.find(c => c.id === 'owner')?.location, 'cafe');
  assert.deepEqual(saved.characters.filter(c => c.id !== 'owner'), old.characters);
  assert.deepEqual(saved.events, old.events);
  assert.equal(saved.turn, 8); assert.equal(saved.minute, 1380);
});

const advance = async () => { await POST(request({ operation: 'set-model-key', mode: 'openai', key: 'unit-test-key' })); return POST(request({ operation: 'advance', minutes: 15, mode: 'openai', model: 'gpt-6-luna', limits: { calls: 120, tokens: 500000 } })) };
const withModel = async run => {
  const original = global.fetch; const called = [];
  global.fetch = async (_url, init) => {
    const data = JSON.parse(JSON.parse(init.body).messages[1].content); called.push(data.self.id);
    return Response.json({ usage: { prompt_tokens: 30, completion_tokens: 20 }, choices: [{ message: { content: JSON.stringify({ type: 'rest', target: '', content: '', mood: '平靜', durationMinutes: 15, intents: data.self.intents }) } }] });
  };
  try { await run(called); } finally { global.fetch = original; }
};

test('single designated action survives reload, replaces autonomous activity, preserves intents and resumes autonomous control', async () => {
  const world = seedWorld(); const owner = world.characters.find(c => c.id === 'owner');
  const queue = [{ id: 'care', content: '照顧咖啡館', intensity: 'high', importance: 'medium', urgency: 'low', context: '晚點再整理' }];
  owner.intents = queue; owner.plan = { action: { type: 'rest' }, startedAt: 1245, until: 1335, attention: '', modelKey: 'openai:gpt-6-luna' };
  store.install(world);
  assert.equal((await POST(request({ operation: 'direct', action: { type: 'work', target: 'tea' } }))).status, 200);
  assert.deepEqual((await read()).characters.find(c => c.id === 'owner').control.pending, { type: 'work', target: 'tea' });
  await withModel(async calls => {
    assert.equal((await advance()).status, 200);
    const saved = await read(); const c = saved.characters.find(c => c.id === 'owner');
    assert.match(c.activity, /泡了一壺茶/); assert.deepEqual(c.intents, queue);
    assert.equal(c.control.pending, undefined); assert.equal(c.control.active, true);
    assert.equal(c.plan.action.type, 'work'); assert.equal(c.plan.until, 1320);
    assert.deepEqual(c.habits || [], []); assert.deepEqual(calls, ['cass', 'vera', 'kris']);
    assert.equal(saved.turn, 1);
    for (let i = 0; i < 3; i++) assert.equal((await advance()).status, 200);
    assert.equal(calls.includes('owner'), false);
    const finished = (await read()).characters.find(c => c.id === 'owner');
    assert.equal(finished.control.mode, 'autonomous'); assert.equal(finished.control.active, undefined);
    assert.deepEqual(finished.intents, queue);
    assert.equal((await advance()).status, 200); assert.equal(calls.filter(id => id === 'owner').length, 1);
  });
});

test('invalid direct actions have no effect and only the cafe owner can be controlled', async () => {
  const world = seedWorld(); store.install(world);
  assert.equal((await POST(request({ operation: 'direct', target: 'cass', action: { type: 'rest' } }))).status, 400);
  for (const action of [{ type: 'say', target: 'cass', content: '遠處的話' }, { type: 'move', target: 'missing-place' }, { type: 'message', target: 'cass', content: '' }, { type: 'reflect', content: 'x'.repeat(501) }, { type: 'work', target: 'tea', unexpected: true }]) {
    assert.equal((await POST(request({ operation: 'direct', action }))).status, 400);
    const saved = await read(); assert.deepEqual(saved.characters, world.characters); assert.deepEqual(saved.events, world.events); assert.equal(saved.turn, 0);
  }
});

test('failed model round restores pending direct action and no action leaks to uninformed characters', async () => {
  const world = seedWorld(); world.turn = 3; store.install(world);
  assert.equal((await POST(request({ operation: 'direct', action: { type: 'reflect', content: '店主自己的秘密' } }))).status, 200);
  const original = global.fetch;
  global.fetch = async () => { throw Error('test provider failure'); };
  try { assert.equal((await advance()).status, 502); } finally { global.fetch = original; }
  const failed = await read(); assert.equal(failed.turn, 3);
  assert.equal(failed.characters.find(c => c.id === 'owner').control.pending.content, '店主自己的秘密');
  assert.equal(failed.events.some(e => e.text.includes('店主自己的秘密')), false);
  await withModel(async () => {
    assert.equal((await advance()).status, 200);
    const saved = await read();
    assert.deepEqual(saved.events.find(e => e.text.includes('店主自己的秘密')).audience, ['owner']);
    assert.ok(saved.characters.filter(c => c.id !== 'owner').every(c => !c.memories.some(m => m.text.includes('店主自己的秘密'))));
  });
});

