/* eslint-disable @typescript-eslint/no-require-imports */
const {fixtureDecision}=require('./pursuit-fixture.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, name + '.cjs'));
const { GET, POST } = load('route');
const store = load('store');
const { seedWorld } = load('world');
const { approval } = require('./routine-program-fixture.cjs');
const read = async () => (await (await GET()).json()).world;
const operationId = () => Date.now() + ':' + crypto.randomUUID();
const proposal = { type: 'propose', target: 'acceptance-tea-kit', content: '我想用這套共用茶具取熱水和茶包，替自己泡一杯普通的茶。', purpose: '飲用', mood: '平靜', durationMinutes: 15, timeIntent: { kind: 'completion', maxMinutes: null }, intents: [] };
async function setup({ oldCapabilities = false, version = 2 } = {}) {
  const world = seedWorld();
  world.adjudication = { provider: 'openai', model: 'fixture-adjudicator' };
  world.playerBudget = { calls: 120, tokens: 1000000 };
  store.install(world);
  const post = async body => POST(new Request('https://test.invalid/api/world', {
    method: 'POST', headers: { origin: 'https://test.invalid', 'X-World-Time-Policy':'round-v1' },
    body: JSON.stringify({ operationId: operationId(), worldContext: (await read()).contextId, mode: 'openai', model: 'gpt-6-luna', ...body }),
  }));
  assert.equal((await post({ operation: 'set-model-key', key: 'fixture-key' })).status, 200);
  assert.equal((await post({ operation: 'enter-acceptance' })).status, 200);
  if (oldCapabilities) {
    // Saved-world fixture only: simulate a pre-fix scene without migrating it.
    const saved = store.snapshot();
    saved.objects.find(o => o.id === 'acceptance-cup').stateTransitions.contents = ['empty', 'water', 'tea'];
    store.install(saved);
    assert.equal((await post({ operation: 'set-model-key', key: 'fixture-key' })).status, 200);
  }
  const reply = approval();
  if (version === 1) { reply.routine.version = 1; delete reply.routine.programs; }
  let decision = proposal, npc = 0, judgments = 0;
  const previous = global.fetch;
  global.fetch = async (_url, init) => {
    const input = JSON.parse(JSON.parse(init.body).messages[1].content);
    const judgment = input.contractVersion === 'world-adjudication.v1';
    if (judgment) judgments++; else npc++;
    const value = judgment ? reply : input.self.id === 'owner' ? decision : { type: 'rest', target: '', content: '', mood: '平靜', durationMinutes: 90, intents: [] };
    return Response.json({ usage: { prompt_tokens: 30, completion_tokens: 10 }, choices: [{ message: { content: JSON.stringify(fixtureDecision(JSON.parse(JSON.parse(init.body).messages[1].content),value)) } }] });
  };
  return { post, choose: value => { decision = value; }, counts: () => ({ npc, judgments }), restore: () => { global.fetch = previous; } };
}
async function advance(s, extra = {}) {
  const response = await s.post({ operation: 'advance', minutes: 15, ...extra });
  assert.equal(response.status, 200, (await response.clone().json()).error);
  return read();
}

test('the actual new acceptance scene can drink wash and brew again with the same model-confirmed cup', async () => {
  const s = await setup();
  try {
    let world = await advance(s);
    world = await advance(s);
    assert.equal(world.objects.find(o => o.id === 'acceptance-cup').state.contents, 'tea');
    s.choose({ ...proposal, target: 'acceptance-cup', content: '喝茶' });
    world = await advance(s);
    assert.equal(world.objects.find(o => o.id === 'acceptance-cup').state.contents, 'dirty');
    assert.equal(world.objects.find(o => o.state.vessel === 'acceptance-cup').lifecycle, 'consumed');
    s.choose({ ...proposal, target: 'acceptance-cup', content: '清洗杯子', purpose: '清洗' });
    world = await advance(s);
    assert.equal(world.objects.find(o => o.id === 'acceptance-cup').state.contents, 'empty');
    s.choose({ ...proposal, content: '泡一杯茶' });
    world = await advance(s);
    const id = operationId();
    world = await advance(s, { operationId: id });
    assert.equal(world.objects.find(o => o.id === 'acceptance-cup').state.contents, 'tea');
    assert.equal(world.objects.filter(o => 'contents' in o.state).length, 1);
    assert.equal(world.objects.filter(o => o.state.vessel === 'acceptance-cup').length, 2);
    assert.equal(world.objects.filter(o => o.state.vessel === 'acceptance-cup' && o.lifecycle === 'active').length, 1);
    assert.deepEqual(s.counts(), { npc: 7, judgments: 1 });
    const beforeReplay = await read(), counts = s.counts();
    await advance(s, { operationId: id });
    assert.deepEqual(await read(), beforeReplay);
    assert.deepEqual(s.counts(), counts);
  } finally { s.restore(); }
});


test('saved old scenes keep their original capabilities and reject incompatible drink programs atomically', async () => {
  for (const version of [1, 2]) {
    const s = await setup({ oldCapabilities: true, version });
    try {
      await advance(s);
      await advance(s);
      const before = await read();
      const cup = before.objects.find(o => o.id === 'acceptance-cup');
      assert.equal(cup.state.contents, 'tea');
      assert.deepEqual(cup.stateTransitions.contents, ['empty', 'water', 'tea']);
      s.choose({ ...proposal, target: cup.id, content: '喝茶' });
      const id = operationId(), body = { operation: 'advance', minutes: 15, operationId: id };
      const response = await s.post(body);
      assert.equal(response.status, 502);
      assert.match((await response.json()).error, /物件不支援這個狀態轉換/);
      const after = await read();
      assert.equal(after.turn, before.turn);
      assert.equal(after.minute, before.minute);
      assert.deepEqual(after.objects, before.objects);
      assert.deepEqual(after.supplies, before.supplies);
      assert.deepEqual(after.routineRules, before.routineRules);
      assert.equal(after.aiUsage.totalCalls, before.aiUsage.totalCalls + 1);
      assert.equal(s.counts().judgments, 1);
      const counts = s.counts();
      assert.equal((await s.post(body)).status, 502);
      assert.deepEqual(await read(), after);
      assert.deepEqual(s.counts(), counts);
    } finally { s.restore(); }
  }
});
