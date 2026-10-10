/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const build = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, `${name}.cjs`));
const { seedWorld, record } = build('world');
const { aiDecision } = build('models');
const { GET, POST } = build('route');
const store = build('store');
const request = body => new Request('https://test.invalid/api/world', { method: 'POST', headers: { origin: 'https://test.invalid' }, body: JSON.stringify({ mode: 'openai', ...body }) });
const advance = async () => { await POST(request({ operation: 'set-model-key', mode: 'openai', key: 'unit-test-key' })); return POST(request({ operation: 'advance', minutes: 15, model: 'gpt-6-luna', limits: { calls: 120, tokens: 500000 } })) };
const queue = [{ id: 'reply-later', content: '稍後回覆', intensity: 'medium', importance: 'medium', urgency: 'low', context: '先完成手上工作' }];
const action = type => ({ type, target: '', content: '', mood: '平靜', durationMinutes: 90, intents: queue });
async function model(respond, run) {
  const original = global.fetch;
  global.fetch = async (_url, init) => {
    const payload = JSON.parse(init.body), data = JSON.parse(payload.messages[1].content);
    return Response.json({ usage: { prompt_tokens: 30, completion_tokens: 20 }, choices: [{ message: { content: JSON.stringify(respond(data, payload)) } }] });
  };
  try { await run(); } finally { global.fetch = original; }
}
async function read() { return (await (await GET()).json()).world; }

function busyWorld() {
  const world = seedWorld();
  for (const c of world.characters) c.plan = { action: { type: 'rest' }, startedAt: world.minute - 15, until: world.minute + 75, attention: '', modelKey: 'openai:gpt-6-luna' };
  return world;
}

test('NPC sees its current activity progress when a known message prompts a decision', async () => {
  const world = busyWorld(); record(world, 'observer', '稍後想聊聊', 'intervention', ['cass']); store.install(world);
  await model(data => {
    assert.deepEqual(data.self.plan, world.characters[0].plan);
    assert.equal(data.currentActivity.elapsedMinutes, 30);
    assert.equal(data.currentActivity.remainingMinutes, 60);
    assert.equal(data.currentActivity.canContinueExisting, true);
    return action('rest');
  }, async () => assert.equal((await advance()).status, 200));
});

test('model may defer a message, update its queue, and continue without restarting or repeating memories and habit evidence', async () => {
  const world = busyWorld();
  record(world, 'observer', '稍後想聊聊', 'intervention', ['cass']);
  const initialMemories = structuredClone(world.characters[0].memories);
  world.characters[0].habits = [{ key: 'rest', type: 'rest', target: '', location: 'kris-home', period: 3, observedDays: [0, 1, 2], lastSeen: 1200 }];
  store.install(world); let calls = 0;
  await model(data => { calls++; assert.equal(data.self.id, 'cass'); return action('continue'); }, async () => {
    assert.equal((await advance()).status, 200);
    const saved = await read(), cass = saved.characters[0];
    assert.equal(cass.plan.startedAt, world.characters[0].plan.startedAt);
    assert.equal(cass.plan.until, world.characters[0].plan.until);
    assert.deepEqual(cass.intents, queue);
    assert.deepEqual(cass.memories, initialMemories);
    assert.deepEqual(cass.habits, world.characters[0].habits);
    assert.equal((await advance()).status, 200);
    assert.equal(calls, 1);
    assert.deepEqual((await read()).characters[0].memories, initialMemories);
  });
});

test('NPC can switch from its unfinished activity and persist the replacement and updated queue', async () => {
  const world = busyWorld(); record(world, 'vera', '有新消息', 'message', ['vera', 'cass']); store.install(world);
  await model(data => data.self.id === 'cass' ? { ...action('reflect'), content: '先想一想', durationMinutes: 60 } : action('rest'), async () => {
    assert.equal((await advance()).status, 200);
    const cass = (await read()).characters[0];
    assert.equal(cass.plan.action.type, 'reflect');
    assert.equal(cass.plan.startedAt, 1260);
    assert.equal(cass.plan.until, 1320);
    assert.deepEqual(cass.intents, queue);
    assert.ok(cass.memories.some(m => m.text.includes('先想一想')));
  });
});

test('private thoughts and messages to other recipients do not trigger unrelated NPC decisions', async () => {
  const world = busyWorld();
  record(world, 'vera', 'private-thought', 'reflect', ['vera']);
  record(world, 'observer', 'private-request', 'intervention', ['vera']);
  store.install(world); const recipients = [];
  await model(data => {
    recipients.push(data.self.id);
    assert.equal(data.self.memories.some(m => m.text.includes('private-thought')), true);
    return action('continue');
  }, async () => {
    assert.equal((await advance()).status, 200);
    assert.deepEqual(recipients, ['vera']);
    const cass = (await read()).characters[0];
    assert.deepEqual(cass.plan, world.characters[0].plan);
    assert.equal(cass.memories.some(m => m.text.includes('private-')), false);
  });
});

test('a continuation without a current activity rolls back the round and retains paid usage', async () => {
  const world = seedWorld(); store.install(world);
  await model(() => action('continue'), async () => {
    assert.equal((await advance()).status, 502);
    const saved = await read();
    assert.deepEqual(saved.characters, world.characters);
    assert.equal(saved.turn, 0);
    assert.equal(saved.minute, world.minute);
    assert.equal(saved.aiUsage.calls, 1);
    assert.equal(saved.aiUsage.inputTokens, 30);
  });
});

for (const scenario of ['rule mode', 'other model', 'expired activity', 'no activity', 'one-time action']) {
  test(`OpenAI offers a new action for ${scenario} and saves the round without retries`, async () => {
    const world = busyWorld();
    for (const character of world.characters) {
      if (scenario === 'rule mode') character.plan.modelKey = 'demo';
      if (scenario === 'other model') character.plan.modelKey = 'openai:gpt-6.1-sol';
      if (scenario === 'expired activity') character.plan.until = world.minute;
      if (scenario === 'one-time action') character.plan.action = { type: 'say', target: 'observer', content: '已回覆' };
      if (scenario === 'no activity') delete character.plan;
    }
    store.install(world);
    let calls = 0;
    await model((_data, payload) => {
      calls++;
      const allowed = payload.response_format.json_schema.schema.properties.type.enum;
      return action(allowed.includes('continue') ? 'continue' : 'rest');
    }, async () => {
      const response = await advance();
      const body = await response.json();
      assert.equal(response.status, 200, body.error);
      const saved = await read();
      assert.equal(saved.turn, 1);
      assert.equal(calls, world.characters.length);
      assert.ok(saved.characters.every(character => character.plan.modelKey === 'openai:gpt-6-luna'));
    });
  });
}

test('OpenRouter continuation eligibility uses its own provider/model and rejects invalid continuation without retry', async () => {
  const world = busyWorld(), cass = world.characters[0];
  cass.plan.modelKey = 'ai:fixture/model';
  let calls = 0;
  const fetcher = async (_url, init) => {
    calls++;
    const payload = JSON.parse(init.body), data = JSON.parse(payload.messages[1].content);
    assert.equal(data.currentActivity.canContinueExisting, calls === 1);
    return Response.json({ choices: [{ message: { content: JSON.stringify(action('continue')) } }] });
  };
  assert.equal((await aiDecision(world, cass, 'unit-test-key', 'fixture/model', 'openrouter', fetcher)).continueExisting, true);
  await assert.rejects(aiDecision(world, cass, 'unit-test-key', 'fixture/other', 'openrouter', fetcher), /有效的意圖與行動格式/);
  assert.equal(calls, 2);
});

test('a later provider failure rolls back a previously selected continuation and its queue', async () => {
  const world = busyWorld();
  record(world, 'observer', 'new-cass', 'intervention', ['cass']);
  record(world, 'observer', 'new-vera', 'intervention', ['vera']);
  store.install(world); let calls = 0;
  await model(() => { if (++calls === 2) throw Error('provider unavailable'); return action('continue'); }, async () => {
    assert.equal((await advance()).status, 502);
    const saved = await read();
    assert.deepEqual(saved.characters, world.characters);
    assert.deepEqual(saved.events, world.events);
    assert.equal(saved.turn, 0);
    assert.equal(saved.aiUsage.calls, 2);
    assert.equal(saved.aiUsage.inputTokens, 30);
  });
});

