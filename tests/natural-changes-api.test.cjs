/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, name + '.cjs'));
const { GET, POST } = load('route');
const store = load('store');
const { seedWorld } = load('world');
const operationId = () => Date.now() + ':' + crypto.randomUUID();
const read = async id => (await (await GET(id ? new Request('https://test.invalid/api/world?operationId=' + encodeURIComponent(id)) : undefined)).json());
const response = value => Response.json({ usage: { prompt_tokens: 30, completion_tokens: 10 }, choices: [{ message: { content: JSON.stringify(value) } }] });
const rest = { type: 'rest', target: '', content: '安靜休息一會', purpose: '休息', mood: '平靜', durationMinutes: 15, timeIntent: { kind: 'open-ended', maxMinutes: null }, intents: [] };
const proposal = { ...rest, type: 'propose', target: 'natural-cup', content: '觀察這只杯子並確認外在溫度的變化', purpose: '處理眼前物件', timeIntent: { kind: 'completion', maxMinutes: null } };
const accepted = effects => ({ status: 'accepted', completionMinutes: 15, effects, stages: [], branches: null, check: null, routine: null });
const condition = (target, state) => ({ kind: 'state-condition', version: 1, target, state: Object.entries(state).map(([key, value]) => ({ key, value })) });
const natural = (overrides = {}) => ({ kind: 'schedule-natural', version: 1, delayMinutes: 15, conditions: [condition({ type: 'object', id: 'natural-cup' }, { temperature: 'hot' })], effects: [{ target: { type: 'object', id: 'natural-cup' }, exposure: 'public', changes: [{ key: 'temperature', from: 'hot', value: 'cool' }] }], reason: '熱杯在室內靜置後逐漸冷卻', ...overrides });
const cup = world => world.objects.find(object => object.id === 'natural-cup');
async function setup(adjust = () => {}) {
  const world = seedWorld();
  world.minute = 0;
  world.characters.forEach(character => { character.control = { mode: 'taken-over' }; });
  const actor = world.characters.find(character => character.id === 'owner');
  actor.control = { mode: 'autonomous' };
  world.adjudication = { provider: 'openai', model: 'fixture-natural' };
  world.playerBudget = { calls: 200, tokens: 1000000 };
  world.objects = [{ id: 'natural-cup', source: 'known-cup', label: '自然變化測試杯', region: 'cafe-front', holder: 'owner', owner: 'owner', revision: 1, state: { temperature: 'warm' }, stateTransitions: { temperature: ['warm', 'hot', 'cool'] }, lifecycle: 'active', kind: 'utensil', knownTo: ['owner'], allowedTo: ['owner'] }];
  adjust(world);
  store.install(world);
  const post = body => POST(new Request('https://test.invalid/api/world', { method: 'POST', headers: { origin: 'https://test.invalid' }, body: JSON.stringify({ operationId: operationId(), mode: 'openai', model: 'gpt-6-luna', ...body }) }));
  assert.equal((await post({ operation: 'set-model-key', key: 'fixture-key' })).status, 200);
  let decision = proposal;
  let candidate = accepted([{ kind: 'state', objectId: 'natural-cup', expectedRevision: 1, key: 'temperature', value: 'hot' }, natural()]);
  let npc = 0, adjudication = 0;
  const inputs = [];
  let inputHook;
  const original = global.fetch;
  global.fetch = async (_url, init) => {
    const input = JSON.parse(JSON.parse(init.body).messages[1].content);
    assert.doesNotMatch(JSON.stringify(input), /operationEvidence|fixture-key/);
    inputs.push(input);
    await inputHook?.(input);
    if (input.contractVersion === 'world-adjudication.v1') { adjudication++; return response(typeof candidate === 'function' ? candidate(input) : candidate); }
    npc++; return response(decision);
  };
  return { post, inputs, onInput(value) { inputHook = value; }, choose(value) { decision = value; }, candidate(value) { candidate = value; }, counts: () => ({ npc, adjudication }), restore() { global.fetch = original; } };
}
async function advance(s, minutes = 15, extra = {}) {
  const result = await s.post({ operation: 'advance', minutes, ...extra });
  assert.equal(result.status, 200, (await result.clone().json()).error);
  return (await read()).world;
}

test('a confirmed cooling arrangement executes on world time after SQLite reload without another adjudication or die', async () => {
  const s = await setup();
  const random = Math.random;
  let dice = 0;
  Math.random = () => { dice++; return 0.5; };
  try {
    let world = await advance(s);
    assert.equal(cup(world).state.temperature, 'hot');
    assert.equal(world.naturalChanges.length, 1);
    assert.equal(world.naturalChanges[0].committedAt, 15);
    assert.equal(world.naturalChanges[0].dueAt, 30);
    assert.equal(world.naturalChanges[0].status, 'pending');
    assert.deepEqual(store.snapshot().naturalChanges, world.naturalChanges);
    s.choose(rest);
    world = await advance(s);
    assert.equal(cup(world).state.temperature, 'cool');
    assert.equal(world.naturalChanges[0].status, 'executed');
    assert.equal(world.naturalChanges[0].settledAt, 30);
    assert.deepEqual(s.counts(), { npc: 2, adjudication: 1 });
    assert.equal(dice, 0);
  } finally { s.restore(); Math.random = random; }
});

test('a 30-minute advance keeps the model duration and anchors new nature at the actual commit instead of backdating it', async () => {
  const s = await setup();
  try {
    const body = { operation: 'advance', minutes: 30, operationId: operationId() };
    const result = await s.post(body);
    assert.equal(result.status, 200, (await result.clone().json()).error);
    const saved = await read(body.operationId), world = saved.world;
    assert.equal(world.minute, 30);
    assert.equal(cup(world).state.temperature, 'hot');
    assert.deepEqual({ committed: world.naturalChanges[0].committedAt, nominal: world.naturalChanges[0].nominalDueAt, due: world.naturalChanges[0].dueAt }, { committed: 30, nominal: 15, due: 45 });
    const judgment = saved.operation.evidence.dispatches.find(item => item.task === 'adjudication');
    assert.equal(judgment.candidate.value.completionMinutes, 15);
    assert.equal(saved.operation.evidence.result.naturalChanges[0].committedAt, 30);
    const before = JSON.stringify({ world, version: saved.version, counts: s.counts() });
    assert.equal((await s.post(body)).status, 200);
    const replayed = await read(body.operationId);
    assert.equal(JSON.stringify({ world: replayed.world, version: replayed.version, counts: s.counts() }), before);
    s.choose(rest);
    const cooled = await advance(s);
    assert.equal(cup(cooled).state.temperature, 'cool');
    assert.equal(cooled.naturalChanges[0].settledAt, 45);
  } finally { s.restore(); }
});

test('future from values continuously invalidate a natural change even when the model only declared a position guard and the value later returns', async () => {
  const s = await setup();
  const target = { type: 'object', id: 'natural-cup' };
  const guarded = { kind: 'state-condition', version: 1, target, state: [], guard: { region: 'cafe-front', holder: { check: false, value: null } } };
  const state = (revision, from, value) => ({ kind: 'change-state', version: 1, access: 'authorized', target, expectedRevision: revision, changes: [{ key: 'temperature', from, value }], exposure: 'public', reason: '以當前方法處理杯溫' });
  try {
    s.candidate(accepted([{ kind: 'state', objectId: 'natural-cup', expectedRevision: 1, key: 'temperature', value: 'hot' }, natural({ delayMinutes: 45, conditions: [guarded] })]));
    let world = await advance(s);
    assert.equal(world.naturalChanges[0].status, 'pending');
    s.candidate(accepted([state(2, 'hot', 'cool')]));
    world = await advance(s);
    assert.equal(world.naturalChanges[0].status, 'invalidated');
    assert.equal(world.naturalChanges[0].invalidatedAt, 30);
    s.candidate(accepted([state(3, 'cool', 'hot')]));
    world = await advance(s);
    assert.equal(cup(world).state.temperature, 'hot');
    s.choose(rest);
    world = await advance(s);
    assert.equal(world.minute, 60);
    assert.equal(cup(world).state.temperature, 'hot');
    assert.equal(world.naturalChanges[0].status, 'invalidated');
    assert.equal(world.naturalChanges[0].invalidatedAt, 30);
  } finally { s.restore(); }
});

test('unrelated state changes keep pending nature but a carried-object location guard invalidates it permanently after a real move', async () => {
  const s = await setup();
  const target = { type: 'object', id: 'natural-cup' };
  try {
    s.candidate(accepted([{ kind: 'state', objectId: 'natural-cup', expectedRevision: 1, key: 'temperature', value: 'hot' }, natural({ delayMinutes: 60, conditions: [{ ...condition(target, { temperature: 'hot' }), guard: { region: 'cafe-front', holder: { check: true, value: 'owner' } } }] })]));
    let world = await advance(s);
    s.candidate(accepted([{ kind: 'change-state', version: 1, access: 'authorized', target, expectedRevision: 2, changes: [{ key: 'surface', from: null, value: '磨砂' }], exposure: 'public', reason: '新增與冷卻無關的外觀狀態' }]));
    world = await advance(s);
    assert.equal(world.naturalChanges[0].status, 'pending');
    s.choose({ ...rest, type: 'move', target: 'kris-home', content: '帶杯子前往Kris家', timeIntent: { kind: 'completion', maxMinutes: null } });
    world = await advance(s);
    assert.equal(cup(world).region, 'kris-home-main');
    assert.equal(world.naturalChanges[0].status, 'invalidated');
    assert.equal(world.naturalChanges[0].invalidatedAt, 45);
    s.choose({ ...rest, type: 'move', target: 'cafe', timeIntent: { kind: 'completion', maxMinutes: null } });
    world = await advance(s);
    s.choose(rest);
    world = await advance(s);
    assert.equal(world.minute, 75);
    assert.equal(cup(world).state.temperature, 'hot');
    assert.equal(world.naturalChanges[0].status, 'invalidated');
    assert.deepEqual(s.counts(), { npc: 5, adjudication: 2 });
  } finally { s.restore(); }
});

test('due nature settles before an activity phase at the same round boundary and stops only the invalid future phase', async () => {
  const s = await setup();
  const target = { type: 'object', id: 'natural-cup' };
  try {
    s.candidate({ status: 'accepted', completionMinutes: 30, check: null, routine: null, branches: null, effects: [], stages: [
      { afterMinutes: 15, preconditions: [], effects: [{ kind: 'state', objectId: 'natural-cup', expectedRevision: 1, key: 'temperature', value: 'hot' }, natural()] },
      { afterMinutes: 30, preconditions: [condition(target, { temperature: 'hot' })], effects: [{ kind: 'change-state', version: 1, access: 'authorized', target, expectedRevision: 2, changes: [{ key: 'finish', from: null, value: '已完成加工' }], exposure: 'public', reason: '只能趁熱完成' }] },
    ] });
    let world = await advance(s);
    assert.equal(cup(world).state.temperature, 'hot');
    assert.equal(world.characters.find(person => person.id === 'owner').plan.phases.cursor, 1);
    world = await advance(s);
    assert.equal(cup(world).state.temperature, 'cool');
    assert.equal(cup(world).state.finish, undefined);
    assert.equal(world.characters.find(person => person.id === 'owner').plan, undefined);
    assert.equal(world.naturalChanges[0].status, 'executed');
    assert.equal(world.naturalChanges[0].nominalDueAt, 15);
    assert.equal(world.naturalChanges[0].settledAt, 30);
    assert.deepEqual(s.counts(), { npc: 1, adjudication: 1 });
  } finally { s.restore(); }
});

test('one natural batch dries the environment and changes the body with explicit exposure, without adding a decision or attributing nature to the old actor', async () => {
  const s = await setup();
  const environment = { type: 'environment', id: 'cafe-front' }, body = { type: 'body', id: 'owner' };
  try {
    s.candidate(accepted([
      { kind: 'change-state', version: 1, access: 'physical', target: environment, expectedRevision: 0, exposure: 'public', changes: [{ key: 'table.surface', from: null, value: '濕潤' }], reason: '水滴落到桌面' },
      { kind: 'change-state', version: 1, access: 'physical', target: body, expectedRevision: 0, exposure: 'subject', changes: [{ key: 'hand.sensation', from: null, value: '溫熱刺痛' }], reason: '接觸熱水的身體感受' },
      natural({ conditions: [condition(environment, { 'table.surface': '濕潤' }), condition(body, { 'hand.sensation': '溫熱刺痛' })], effects: [
        { target: environment, exposure: 'public', changes: [{ key: 'table.surface', from: '濕潤', value: '已乾燥' }] },
        { target: body, exposure: 'hidden', changes: [{ key: 'hand.sensation', from: '溫熱刺痛', value: '隱藏的復原機制' }] },
      ], reason: '僅觀察者可查的自然原因' }),
    ]));
    let world = await advance(s);
    assert.equal(world.scene.external['cafe-front'].state['table.surface'], '濕潤');
    assert.equal(world.characters.find(person => person.id === 'owner').physical.state['hand.sensation'], '溫熱刺痛');
    s.choose(rest);
    const id = operationId();
    world = await advance(s, 15, { operationId: id });
    const external = (await read(id)).operation.evidence.result.externalStates.find(item => item.target.type === 'environment');
    assert.deepEqual(external.before.exposureEntries, [{ key: 'table.surface', value: 'public' }]);
    assert.deepEqual(external.after.exposureEntries, [{ key: 'table.surface', value: 'public' }]);
    assert.equal(world.scene.external['cafe-front'].state['table.surface'], '已乾燥');
    assert.equal(world.characters.find(person => person.id === 'owner').physical.state['hand.sensation'], '隱藏的復原機制');
    assert.equal(world.naturalChanges[0].status, 'executed');
    const latestInput = s.inputs.filter(input => input.contractVersion !== 'world-adjudication.v1').at(-1);
    assert.match(JSON.stringify(latestInput), /已乾燥/);
    assert.doesNotMatch(JSON.stringify(latestInput), /隱藏的復原機制|僅觀察者可查的自然原因|naturalChanges/);
    const event = world.events.findLast(item => item.kind === 'natural');
    assert.equal(event.actor, 'world');
    assert.equal(event.time, 30);
    assert.equal(world.naturalChanges[0].source.actorId, 'owner');
    assert.deepEqual(store.snapshot().scene.external, world.scene.external);
    assert.deepEqual(s.counts(), { npc: 2, adjudication: 1 });
  } finally { s.restore(); }
});

test('the historical actor no longer present receives no remote environment changes or hidden arrangement reasons', async () => {
  const s = await setup();
  const environment = { type: 'environment', id: 'cafe-front' };
  try {
    s.candidate(accepted([
      { kind: 'change-state', version: 1, access: 'physical', target: environment, expectedRevision: 0, exposure: 'public', changes: [{ key: 'surface', from: null, value: '濕潤' }], reason: '打濕了桌面' },
      natural({ delayMinutes: 30, conditions: [condition(environment, { surface: '濕潤' })], effects: [{ target: environment, exposure: 'public', changes: [{ key: 'surface', from: '濕潤', value: '只在原場所看得到的乾燥結果' }] }], reason: '未公開的安排原因' }),
    ]));
    await advance(s);
    s.choose({ ...rest, type: 'move', target: 'kris-home', timeIntent: { kind: 'completion', maxMinutes: null } });
    await advance(s);
    s.choose(rest);
    const world = await advance(s);
    assert.equal(world.scene.external['cafe-front'].state.surface, '只在原場所看得到的乾燥結果');
    const latestInput = s.inputs.filter(input => input.contractVersion !== 'world-adjudication.v1').at(-1);
    assert.doesNotMatch(JSON.stringify(latestInput), /只在原場所看得到的乾燥結果|未公開的安排原因|naturalChanges/);
    assert.equal(world.events.findLast(event => event.kind === 'natural').audience.includes('owner'), false);
    assert.deepEqual(s.counts(), { npc: 3, adjudication: 1 });
  } finally { s.restore(); }
});

test('new natural execution preserves atomic save recovery and original-operation replay for before-save failure, lost response, version and lease conflicts', async () => {
  for (const fault of ['before', 'after', 'version', 'lease']) {
    const s = await setup();
    try {
      await advance(s);
      s.choose(rest);
      const before = (await read()).world;
      if (fault === 'before') store.throwBeforeNextSave();
      if (fault === 'after') store.throwAfterNextSave();
      if (fault === 'version' || fault === 'lease') s.onInput(async input => {
        if (input.contractVersion === 'world-adjudication.v1') return;
        s.onInput(undefined);
        // Storage concurrency fixture: mutate the CAS coordinate, preserving the
        // durable journal and every saved world fact, as a real contender must.
        await store.database().prepare(fault === 'version' ? 'UPDATE worlds SET version = version + 1 WHERE owner = ?' : 'UPDATE worlds SET locked_until = locked_until + 60000 WHERE owner = ?').bind('test-owner').run();
      });
      const operation = { operation: 'advance', minutes: 15, operationId: operationId() };
      const result = await s.post(operation);
      assert.equal(result.status, fault === 'after' ? 200 : 502, fault + ': ' + (await result.clone().json()).error);
      const saved = await read(operation.operationId), counts = s.counts();
      assert.equal(cup(saved.world).state.temperature, fault === 'after' ? 'cool' : 'hot', fault);
      assert.equal(saved.world.naturalChanges[0].status, fault === 'after' ? 'executed' : 'pending', fault);
      if (fault !== 'after') assert.deepEqual(saved.world.naturalChanges, before.naturalChanges);
      const replay = await s.post(operation);
      assert.equal(replay.status, result.status, fault);
      const reloaded = await read(operation.operationId);
      assert.deepEqual(reloaded.world.naturalChanges, saved.world.naturalChanges, fault);
      assert.deepEqual(reloaded.world.objects, saved.world.objects, fault);
      assert.deepEqual(s.counts(), counts, fault);
      assert.deepEqual(counts, { npc: 2, adjudication: 1 }, fault);
    } finally { s.restore(); }
  }
});

test('a newly executed old pending arrangement keeps a bounded recent receipt when later-created settled records are already full', async () => {
  const oldId = 'saved-old-pending';
  const s = await setup(world => {
    const source = { actorId: 'owner', turn: 0 };
    const base = { version: 1, source, scheduledAt: -1425, committedAt: -1425, dueAt: 15, conditions: [condition({ type: 'object', id: 'natural-cup' }, { temperature: 'warm' })], effects: [{ target: { type: 'object', id: 'natural-cup' }, exposure: 'public', changes: [{ key: 'temperature', from: 'warm', value: 'cool' }] }], reason: '明示已保存世界fixture，不是追補舊證據' };
    world.naturalChanges = [{ ...base, id: oldId, status: 'pending' }, ...Array.from({ length: 64 }, (_, index) => ({ ...base, id: 'saved-terminal-' + index, status: 'executed', settledAt: -100 + index }))];
  });
  try {
    s.choose(rest);
    const id = operationId();
    const world = await advance(s, 15, { operationId: id });
    assert.equal(cup(world).state.temperature, 'cool');
    assert.equal(world.naturalChanges.length, 64);
    const evidence = (await read(id)).operation.evidence;
    assert.deepEqual(evidence.result.naturalChanges.map(change => change.id), [oldId]);
    assert.equal(evidence.result.naturalChangesDropped, 1);
    assert.equal(world.naturalChanges.find(change => change.id === oldId)?.settledAt, 15);
    assert.equal(world.naturalChanges.some(change => change.id === 'saved-terminal-0'), false);
    assert.equal(world.naturalChangesDropped, 1);
    assert.deepEqual(s.counts(), { npc: 1, adjudication: 0 });
  } finally { s.restore(); }
});

test('natural contracts reject unsupported delays, recursion and contradictory or unreachable futures atomically; old worlds acquire no fabricated schedules', async () => {
  const invalid = [
    natural({ delayMinutes: 0 }), natural({ delayMinutes: 16 }), natural({ delayMinutes: 1441 }),
    natural({ effects: [natural()] }), natural({ version: 2 }),
    natural({ effects: [{ target: { type: 'object', id: 'natural-cup' }, exposure: 'public', changes: [{ key: 'temperature', from: 'hot', value: 'cool' }] }, { target: { type: 'object', id: 'natural-cup' }, exposure: 'hidden', changes: [{ key: 'temperature', from: 'hot', value: 'warm' }] }] }),
    natural({ conditions: [{ kind: 'state-condition', version: 1, target: { type: 'object', id: 'natural-cup' }, state: [] }] }),
    natural({ effects: [{ target: { type: 'object', id: 'missing-cup' }, exposure: 'public', changes: [{ key: 'temperature', from: 'hot', value: 'cool' }] }] }),
    natural({ effects: [{ target: { type: 'object', id: 'natural-cup' }, exposure: 'public', changes: [{ key: 'temperature', from: 'already-cold', value: 'cool' }] }] }),
    natural({ effects: [{ target: { type: 'body', id: 'owner' }, exposure: 'subject', changes: [{ key: 'will', from: null, value: '必須配合' }] }] }),
  ];
  for (const value of invalid) {
    const s = await setup();
    try {
      s.candidate(accepted([{ kind: 'state', objectId: 'natural-cup', expectedRevision: 1, key: 'temperature', value: 'hot' }, value]));
      const before = (await read()).world;
      const result = await s.post({ operation: 'advance', minutes: 15 });
      assert.equal(result.status, 502);
      const saved = (await read()).world;
      assert.deepEqual(saved.objects, before.objects);
      assert.equal(saved.naturalChanges, undefined);
      assert.deepEqual(s.counts(), { npc: 1, adjudication: 1 });
    } finally { s.restore(); }
  }
  const s = await setup();
  try {
    assert.equal((await read()).world.naturalChanges, undefined);
    s.choose(rest);
    const world = await advance(s);
    assert.equal(world.naturalChanges, undefined);
    assert.equal(cup(world).state.temperature, 'warm');
    assert.deepEqual(s.counts(), { npc: 1, adjudication: 0 });
  } finally { s.restore(); }
});

test('the pending capacity fails atomically without dropping confirmed natural changes or replaying the failed operation', async () => {
  const s = await setup();
  try {
    s.candidate(accepted([{ kind: 'state', objectId: 'natural-cup', expectedRevision: 1, key: 'temperature', value: 'hot' }, natural({ delayMinutes: 1440 })]));
    await advance(s);
    s.candidate(accepted([natural({ delayMinutes: 1440 })]));
    for (let index = 1; index < 31; index++) await advance(s);
    const lastId = operationId();
    const last = await advance(s, 15, { operationId: lastId });
    const lastReceipt = (await read(lastId)).operation.evidence.result.naturalChanges;
    assert.deepEqual(lastReceipt.map(change => change.id), [last.naturalChanges.at(-1).id]);
    const before = (await read()).world;
    assert.equal(before.naturalChanges.filter(change => change.status === 'pending').length, 32);
    const operation = { operation: 'advance', minutes: 15, operationId: operationId() };
    assert.equal((await s.post(operation)).status, 502);
    const failed = (await read()).world, counts = s.counts();
    assert.deepEqual(failed.naturalChanges, before.naturalChanges);
    assert.deepEqual(failed.objects, before.objects);
    assert.equal((await s.post(operation)).status, 502);
    assert.deepEqual(s.counts(), counts);
    assert.deepEqual(counts, { npc: 33, adjudication: 33 });
  } finally { s.restore(); }
});

test('controlled five-band fixtures schedule only the selected natural result and preserve replay without another die or adjudication', async () => {
  const cases = [[0.99, 'critical-success'], [0.55, 'success'], [0.3, 'mixed'], [0.1, 'failure'], [0, 'critical-failure']];
  for (const [sample, outcome] of cases) {
    const s = await setup();
    const random = Math.random;
    let dice = 0;
    Math.random = () => { dice++; return sample; };
    try {
      s.candidate({ status: 'accepted', completionMinutes: 15, effects: [], stages: [], check: { difficulty: 12, ability: '照料' }, routine: null, branches: [
        { outcomes: ['critical-success', 'success'], effects: [{ kind: 'state', objectId: 'natural-cup', expectedRevision: 1, key: 'temperature', value: 'hot' }, natural()], stages: [] },
        { outcomes: ['mixed'], effects: [{ kind: 'change-state', version: 1, access: 'authorized', target: { type: 'object', id: 'natural-cup' }, expectedRevision: 1, changes: [{ key: 'temperature', from: 'warm', value: 'lukewarm' }], exposure: 'public', reason: '僅有部分溫度變化' }], stages: [] },
        { outcomes: ['failure', 'critical-failure'], effects: [], stages: [] },
      ] });
      const operation = { operation: 'advance', minutes: 15, operationId: operationId() };
      assert.equal((await s.post(operation)).status, 200, outcome);
      let world = (await read()).world;
      assert.equal(world.events.findLast(event => event.kind === 'attempt').resolution.outcome, outcome);
      const succeeded = outcome === 'success' || outcome === 'critical-success';
      assert.equal(world.naturalChanges?.length || 0, succeeded ? 1 : 0);
      assert.equal(cup(world).state.temperature, succeeded ? 'hot' : outcome === 'mixed' ? 'lukewarm' : 'warm');
      assert.equal((await s.post(operation)).status, 200);
      assert.deepEqual(s.counts(), { npc: 1, adjudication: 1 });
      assert.equal(dice, 1);
      s.choose(rest);
      world = await advance(s);
      assert.equal(world.naturalChanges?.[0]?.status, succeeded ? 'executed' : undefined);
      assert.equal(dice, 1);
      assert.deepEqual(s.counts(), { npc: 2, adjudication: 1 });
    } finally { s.restore(); Math.random = random; }
  }
});

 test('one natural body batch preserves different key exposures without merging private state into public clues', async () => {
  const s = await setup();
  const target = { type: 'body', id: 'owner' };
  try {
    s.candidate(accepted([
      { kind: 'change-state', version: 1, access: 'physical', target, expectedRevision: 0, exposure: 'subject', changes: [{ key: 'pain', from: null, value: '刺痛' }], reason: '碰觸熱物' },
      { kind: 'change-state', version: 1, access: 'physical', target, expectedRevision: 1, exposure: 'public', changes: [{ key: 'redness', from: null, value: '泛紅' }], reason: '外在紅痕' },
      natural({ conditions: [condition(target, { pain: '刺痛', redness: '泛紅' })], effects: [
        { target, exposure: 'hidden', changes: [{ key: 'pain', from: '刺痛', value: '隱藏復原' }] },
        { target, exposure: 'public', changes: [{ key: 'redness', from: '泛紅', value: '紅痕淡去' }] },
      ] }),
    ]));
    await advance(s); s.choose(rest);
    const world = await advance(s), physical = world.characters.find(actor => actor.id === 'owner').physical;
    assert.deepEqual(physical.exposure, { pain: 'hidden', redness: 'public' });
    assert.equal(world.naturalChanges[0].status, 'executed');
    const input = JSON.stringify(s.inputs.filter(item => item.contractVersion !== 'world-adjudication.v1').at(-1));
    assert.match(input, /紅痕淡去/); assert.doesNotMatch(input, /隱藏復原/);
    assert.deepEqual(s.counts(), { npc: 2, adjudication: 1 });
  } finally { s.restore(); }
});
