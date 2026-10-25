/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, name + '.cjs'));
const { GET, POST } = load('route'), store = load('store');
const { seedWorld } = load('world');
const { enterAcceptanceScene } = load('acceptance-scene');
const read = async operationId => (await (await GET(operationId ? new Request('https://test.invalid/api/world?operationId=' + encodeURIComponent(operationId)) : undefined)).json());
const request = body => new Request('https://test.invalid/api/world', { method: 'POST', headers: { origin: 'https://test.invalid', 'X-World-Time-Policy':'round-v1' }, body: JSON.stringify(body) });
const operationId = () => Date.now() + ':' + crypto.randomUUID();
const completion = value => Response.json({ usage: { prompt_tokens: 30, completion_tokens: 10 }, choices: [{ message: { content: typeof value === 'string' ? value : JSON.stringify(value) } }] });
async function setup(actor = 'cass', modify = () => {}) {
  const original = seedWorld(); original.turn = 124; original.minute = 3120;
  const world = await enterAcceptanceScene(original);
  world.adjudication = { provider: 'openai', model: 'gpt-6.1-sol' };
  world.characters.forEach(c => { if (c.id !== actor) c.control = { mode: 'taken-over' }; });
  modify(world); store.install(world);
  const post = body => POST(request({ operationId: operationId(), worldContext: world.contextId, mode: 'demo', ...body }));
  await post({ operation: 'set-model-key', mode: 'openai', key: 'fixture-key' });
  return { post, advance: { operation: 'advance', minutes: 15, mode: 'openai', model: 'gpt-6.1-sol', operationId: operationId() } };
}
const proposal = { type: 'propose', target: 'acceptance-meal', content: '取得並享用眼前的餐點', purpose: '吃飯', mood: '平靜', durationMinutes: 15, intents: [] };
const accepted = effects => ({ status: 'accepted', effects, check: null, stages: [] });

test('the dispatched contract provides generated identity and effect semantics for same-action meal consumption', async () => {
  const { post, advance } = await setup();
  const previous = global.fetch; let contract;
  global.fetch = async (_url, init) => {
    const payload = JSON.parse(init.body), input = JSON.parse(payload.messages[1].content);
    if (input.contractVersion !== 'world-adjudication.v1') return completion(proposal);
    contract = input;
    return completion(accepted([
      { kind: 'materialize', supplyId: input.supplies[0].id, expectedRemaining: 1 },
      { kind: 'consume', objectId: input.supplies[0].materializedObjectId, expectedRevision: 1 },
    ]));
  };
  try {
    const response = await post(advance); assert.equal(response.status, 200, (await response.clone().json()).error);
    assert.equal(contract.durationMinutes, 15);
    assert.match(JSON.stringify(contract.effectRules), /expectedRevision/);
    assert.match(JSON.stringify(contract.effectRules), /consume/);
    const saved = (await read()).world;
    assert.equal(saved.supplies[0].remaining, 0);
    assert.equal(saved.objects.find(o => o.id === 'acceptance-meal:1').lifecycle, 'consumed');
    assert.equal((await read()).world.objects.filter(o => o.id === 'acceptance-meal:1').length, 1);
  } finally { global.fetch = previous; }
});

test('rejected effects retain a bounded, redacted diagnosis through rollback, reload and operation replay', async () => {
  const { post, advance } = await setup('owner', world => { world.objects[0].label = 'fixture-key Bearer sk-other-secret-123456789'; });
  const before = (await read()).world, previous = global.fetch;
  let calls = 0;
  global.fetch = async (_url, init) => {
    calls++;
    const input = JSON.parse(JSON.parse(init.body).messages[1].content);
    return completion(input.contractVersion === 'world-adjudication.v1'
      ? accepted([{ kind: 'consume', objectId: 'acceptance-cup', expectedRevision: 1 }])
      : { ...proposal, target: 'acceptance-cup', purpose: '喝茶' });
  };
  try {
    const response = await post(advance), result = await response.json();
    assert.equal(response.status, 502);
    assert.deepEqual(result.stopReason, { scope: 'adjudication', code: 'candidate_contract' });
    const diagnostic = result.adjudicationFailure;
    assert.equal(diagnostic.actorId, 'owner');
    assert.equal(diagnostic.operationId, advance.operationId);
    assert.equal(diagnostic.validation.reason, 'not_consumable');
    assert.equal(diagnostic.validation.effectIndex, 0);
    assert.equal(diagnostic.validation.actual.kind, 'utensil');
    assert.equal(diagnostic.validation.actual.holder, null);
    assert.equal(JSON.parse(diagnostic.candidate).effects[0].objectId, 'acceptance-cup');
    const serialized = JSON.stringify(diagnostic);
    assert.ok(serialized.length <= 24000);
    assert.doesNotMatch(serialized, /fixture-key|sk-other-secret|Authorization|gzip-base64|personality|memories/);
    assert.match(serialized, /REDACTED/);
    const latest = await read(); assert.deepEqual(latest.adjudicationFailure, diagnostic);
    const w = latest.world;
    for (const field of ['turn', 'minute', 'objects', 'supplies', 'events', 'characters']) assert.deepEqual(w[field], before[field]);
    assert.equal(w.aiUsage.totalCalls, 2); assert.equal(w.aiUsage.totalInputTokens, 60);
    assert.deepEqual((await read(advance.operationId)).operation.adjudicationFailure, diagnostic);
    assert.deepEqual(await (await post(advance)).json(), result);
    assert.equal(calls, 2); assert.equal((await read()).world.aiUsage.totalCalls, 2);
    assert.equal((await post({ operation: 'exit-acceptance' })).status, 200);
    assert.equal((await read()).world.turn, 124);
    assert.equal((await read()).adjudicationFailure, undefined);
    const auth = load('auth'); store.installForOwner('another-owner', seedWorld()); auth.setUserId('another-owner');
    try { assert.equal((await read()).adjudicationFailure, undefined); }
    finally { auth.setUserId('test-owner'); }
  } finally { global.fetch = previous; }
});

test('a same-batch stale revision reports the failing second effect and its post-first-effect snapshot', async () => {
  const { post, advance } = await setup('cass', world => {
    world.supplies[0].remaining = 0;
    world.objects.push({ id: 'acceptance-meal:1', source: 'acceptance-meal', label: '餐點', region: 'cafe-front', holder: null, owner: 'owner', revision: 1, state: {}, lifecycle: 'active', kind: 'food', knownTo: ['cass'], allowedTo: ['cass'] });
  });
  const previous = global.fetch;
  let expectedRevision = 1;
  global.fetch = async (_url, init) => completion(JSON.parse(JSON.parse(init.body).messages[1].content).contractVersion === 'world-adjudication.v1'
    ? accepted([{ kind: 'transfer', objectId: 'acceptance-meal:1', expectedRevision: 1, toHolder: 'cass', toRegion: 'cafe-front' }, { kind: 'consume', objectId: 'acceptance-meal:1', expectedRevision }])
    : { ...proposal, target: 'acceptance-meal:1' });
  try {
    const response = await post(advance), result = await response.json(); assert.equal(response.status, 502);
    const diagnostic = result.adjudicationFailure;
    assert.equal(diagnostic.validation.reason, 'object_precondition');
    assert.equal(diagnostic.validation.effectIndex, 1);
    assert.equal(diagnostic.validation.effect.expectedRevision, 1);
    assert.equal(diagnostic.validation.actual.revision, 2);
    assert.equal(diagnostic.validation.actual.holder, 'cass');
    assert.equal(JSON.parse(diagnostic.input).objects.find(o => o.id === 'acceptance-meal:1').revision, 1);
    assert.equal((await read()).world.objects.find(o => o.id === 'acceptance-meal:1').holder, null);
    expectedRevision = 2;
    assert.equal((await post({ ...advance, operationId: operationId() })).status, 200);
    const saved = await read(); assert.equal(saved.adjudicationFailure, undefined);
    assert.equal(saved.world.objects.find(o => o.id === 'acceptance-meal:1').lifecycle, 'consumed');
  } finally { global.fetch = previous; }
});

test('malformed or oversized candidates are bounded contract failures, while transport faults remain technical', async () => {
  for (const raw of ['{invalid', JSON.stringify({ bogus: '\\'.repeat(20000) + 'Bearer sk-another-secret-value' })]) {
    const { post, advance } = await setup(), previous = global.fetch;
    global.fetch = async (_url, init) => completion(JSON.parse(JSON.parse(init.body).messages[1].content).contractVersion === 'world-adjudication.v1' ? raw : proposal);
    try {
      const response = await post(advance), result = await response.json(); assert.equal(response.status, 502);
      assert.equal(result.stopReason.code, 'candidate_contract');
      assert.equal(result.adjudicationFailure.stage, 'parse');
      assert.equal(result.adjudicationFailure.validation.reason, 'candidate_format');
      assert.ok(JSON.stringify(result.adjudicationFailure).length <= 24000);
      assert.equal(result.adjudicationFailure.truncated, raw.length > 8192);
      assert.doesNotMatch(JSON.stringify(result.adjudicationFailure), /sk-another-secret/);
      assert.equal((await read()).world.aiUsage.totalCalls, 2);
    } finally { global.fetch = previous; }
  }
  const { post, advance } = await setup(), previous = global.fetch;
  global.fetch = async (_url, init) => JSON.parse(JSON.parse(init.body).messages[1].content).contractVersion === 'world-adjudication.v1'
    ? Response.json({ error: 'provider unavailable' }, { status: 503 }) : completion(proposal);
  try {
    const result = await (await post(advance)).json();
    assert.deepEqual(result.stopReason, { scope: 'technical', code: 'technical_failure' });
    assert.equal(result.adjudicationFailure, undefined);
  } finally { global.fetch = previous; }
});

test('future phase rejection identifies the phase without applying earlier previewed effects', async () => {
  const { post, advance } = await setup('owner'); const previous = global.fetch;
  global.fetch = async (_url, init) => completion(JSON.parse(JSON.parse(init.body).messages[1].content).contractVersion === 'world-adjudication.v1'
    ? { ...accepted([]), stages: [
      { afterMinutes: 30, preconditions: [], effects: [{ kind: 'state', objectId: 'acceptance-cup', expectedRevision: 1, key: 'contents', value: 'water' }] },
      { afterMinutes: 60, preconditions: [], effects: [{ kind: 'state', objectId: 'acceptance-cup', expectedRevision: 1, key: 'contents', value: 'tea' }] },
    ] } : { ...proposal, target: 'acceptance-cup', durationMinutes: 60 });
  try {
    const response = await post(advance), result = await response.json(); assert.equal(response.status, 502);
    assert.equal(result.adjudicationFailure.validation.phaseIndex, 1);
    assert.equal(result.adjudicationFailure.validation.actual.revision, 2);
    const saved = (await read()).world;
    assert.equal(saved.objects[0].state.contents, 'empty'); assert.equal(saved.objects[0].revision, 1);
    assert.equal(saved.characters.find(c => c.id === 'owner').plan, undefined);
  } finally { global.fetch = previous; }
});

test('failure input projects static contract fields and truncates large dynamic facts as valid bounded JSON', async () => {
  const { post, advance } = await setup('owner', world => { world.objects[0].label = '保留身份的長標籤'.repeat(3000); });
  const previous = global.fetch;
  global.fetch = async (_url, init) => completion(JSON.parse(JSON.parse(init.body).messages[1].content).contractVersion === 'world-adjudication.v1'
    ? accepted([{ kind: 'consume', objectId: 'acceptance-cup', expectedRevision: 1 }]) : { ...proposal, target: 'acceptance-cup' });
  try {
    const response = await post(advance), body = await response.json(); assert.equal(response.status, 502);
    const receipt = body.adjudicationFailure, input = JSON.parse(receipt.input);
    assert.equal(input.contractVersion, 'world-adjudication.v1'); assert.equal(input.effectContractVersion, 'world-effects.v4');
    assert.deepEqual(input.inputProjection, { version: 1, omittedStaticFields: ['rules', 'effectRules', 'effectContract'] });
    assert.equal(input.effectContract, undefined); assert.equal(input.actor.id, 'owner');
    assert.equal(input.objects.find(object => object.id === 'acceptance-cup').revision, 1);
    assert.ok(receipt.input.length <= 9000); assert.ok(receipt.candidate.length <= 8192);
    assert.ok(JSON.stringify(receipt).length <= 24000); assert.equal(receipt.truncated, true);
    assert.equal(JSON.parse(receipt.candidate).effects[0].objectId, 'acceptance-cup');
    assert.deepEqual((await read(advance.operationId)).operation.adjudicationFailure, receipt);
    assert.deepEqual(await (await post(advance)).json(), body);
  } finally { global.fetch = previous; }
});
