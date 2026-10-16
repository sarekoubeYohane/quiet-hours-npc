/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, name + '.cjs'));
const { GET, POST } = load('route');
const store = load('store');
const { seedWorld, record } = load('world');
const read = async () => (await (await GET()).json()).world;
const request = body => new Request('https://test.invalid/api/world', {
  method: 'POST', headers: { origin: 'https://test.invalid' },
  body: JSON.stringify({ operationId: Date.now() + ':' + crypto.randomUUID(), mode: 'demo', ...body }),
});

test('scene switches are replayable, reject stale other-tab operations, and never bypass the account budget', async () => {
  const original = seedWorld(); original.playerBudget = { calls: 1, tokens: 1000000 };
  original.adjudication = { provider: 'openai', model: 'gpt-6.1-sol' };
  store.install(original);
  await act({ operation: 'set-model-key', mode: 'openai', key: 'fixture-key' });
  const enterBody = { operation: 'enter-acceptance', operationId: Date.now() + ':' + crypto.randomUUID() };
  assert.equal((await POST(request(enterBody))).status, 200);
  const context = (await read()).contextId;
  assert.equal((await POST(request(enterBody))).status, 200);
  assert.equal((await read()).contextId, context);
  const stale = await POST(request({ operationId: (Date.now() - 1000) + ':' + crypto.randomUUID(), operation: 'intervene', target: 'cass', text: 'OLD-TAB-MESSAGE' }));
  assert.equal(stale.status, 409); assert.equal((await stale.json()).contextMismatch, true);
  assert.doesNotMatch(JSON.stringify(await read()), /OLD-TAB-MESSAGE/);
  assert.equal((await act({ operation: 'reset' })).status, 400);
  assert.equal((await act({ operation: 'enter-acceptance' })).status, 400);
  const before = await read(), previous = global.fetch;
  global.fetch = async () => completion({ type: 'rest', target: '', content: '', mood: '', durationMinutes: 90, intents: [] });
  try {
    assert.equal((await act({ operation: 'advance', minutes: 15, mode: 'openai', model: 'gpt-6.1-sol' })).status, 429);
    const failed = await read();
    assert.equal(failed.turn, before.turn); assert.equal(failed.aiUsage.totalCalls, 1);
    assert.deepEqual(failed.objects, before.objects);
    assert.equal((await act({ operation: 'exit-acceptance' })).status, 200);
    const restored = await read(); assert.equal(restored.aiUsage.calls, 1);
    assert.deepEqual(restored.playerBudget, original.playerBudget);
    assert.equal((await POST(request({ operation: 'intervene', worldContext: context, target: 'cass', text: 'TEST-STORY-ONLY' }))).status, 409);
    assert.equal((await act({ operation: 'advance', minutes: 15, mode: 'openai', model: 'gpt-6.1-sol' })).status, 429);
    assert.equal((await read()).aiUsage.totalCalls, 1);
  } finally { global.fetch = previous; }
});

test('failed switching never loses either story, and late response replay cannot recreate a scene', async () => {
  store.install(seedWorld());
  const before = await read();
  store.conflictOnNextSave();
  assert.equal((await act({ operation: 'enter-acceptance' })).status, 502);
  assert.equal((await read()).acceptance, undefined);
  assert.deepEqual((await read()).characters, before.characters);
  assert.equal((await act({ operation: 'enter-acceptance' })).status, 200);
  const scene = await read();
  store.conflictOnNextSave();
  assert.equal((await act({ operation: 'exit-acceptance' })).status, 502);
  assert.equal((await read()).contextId, scene.contextId);
  const exitBody = { operation: 'exit-acceptance', worldContext: scene.contextId, operationId: Date.now() + ':' + crypto.randomUUID() };
  store.throwAfterNextSave();
  assert.equal((await POST(request(exitBody))).status, 200);
  const returned = await read();
  assert.equal((await POST(request(exitBody))).status, 200);
  assert.equal((await read()).contextId, returned.contextId);
  assert.equal(returned.acceptance, undefined);
  assert.deepEqual(returned.characters, before.characters);
});

test('original backup is bounded, hidden from journal results, and private to the authenticated owner', async () => {
  const large = seedWorld(); large.events[0].text = 'x'.repeat(513 * 1024); store.install(large);
  assert.equal((await act({ operation: 'enter-acceptance' })).status, 502);
  assert.equal((await read()).events[0].text.length, 513 * 1024);
  const original = seedWorld(); record(original, 'observer', 'PAUSED-PRIVATE-STORY', 'intervention', ['cass']); store.install(original);
  const enterBody = { operation: 'enter-acceptance', operationId: Date.now() + ':' + crypto.randomUUID() };
  assert.equal((await POST(request(enterBody))).status, 200);
  assert.doesNotMatch(await (await POST(request(enterBody))).text(), /PAUSED-PRIVATE-STORY/);
  const auth = load('auth'); store.installForOwner('other-owner', seedWorld()); auth.setUserId('other-owner');
  try { assert.equal((await read()).acceptance, undefined); assert.doesNotMatch(JSON.stringify(await read()), /PAUSED-PRIVATE-STORY/); }
  finally { auth.setUserId('test-owner'); }
  assert.equal((await read()).acceptance.id, 'daily-life-v1');
});
const act = async body => POST(request({ worldContext: (await read()).contextId, ...body }));
const completion = value => Response.json({ usage: { prompt_tokens: 30, completion_tokens: 10 }, choices: [{ message: { content: JSON.stringify(value) } }] });
const rest = { type: 'rest', target: '', content: '', mood: '平靜', durationMinutes: 90, intents: [] };
const propose = (target, durationMinutes = 15) => ({ type: 'propose', target, content: '依當下權限處理杯子', purpose: '日常驗收', mood: '平靜', durationMinutes, intents: [] });
const advance = async () => {
  const response = await act({ operation: 'advance', minutes: 15, mode: 'openai', model: 'gpt-6.1-sol' });
  assert.equal(response.status, 200, await response.clone().text());
  return read();
};
async function startScene() {
  const world = seedWorld(); world.playerBudget = { calls: 120, tokens: 1000000 };
  world.adjudication = { provider: 'openai', model: 'gpt-6.1-sol' }; store.install(world);
  await act({ operation: 'set-model-key', mode: 'openai', key: 'fixture-key' });
  assert.equal((await act({ operation: 'enter-acceptance' })).status, 200);
}

test('enter, acquire, eat, reload and return preserves the original story and shared paid usage', async () => {
  const original = seedWorld();
  original.turn = 123; original.minute = 3105;
  record(original, 'observer', 'ORIGINAL-PRIVATE-MEMORY', 'intervention', ['cass']);
  original.playerBudget = { calls: 120, tokens: 1000000 };
  original.adjudication = { provider: 'openai', model: 'gpt-6.1-sol' };
  store.install(original);
  await act({ operation: 'set-model-key', mode: 'openai', key: 'fixture-key' });
  const entered = await act({ operation: 'enter-acceptance' });
  assert.equal(entered.status, 200, await entered.clone().text());
  const scene = await read();
  assert.equal(scene.acceptance.id, 'daily-life-v1');
  assert.equal(scene.acceptance.original, undefined);
  assert.doesNotMatch(JSON.stringify(scene), /ORIGINAL-PRIVATE-MEMORY/);
  assert.equal(scene.supplies.find(s => s.id === 'acceptance-meal').remaining, 1);
  assert.deepEqual(scene.playerBudget, original.playerBudget);
  assert.deepEqual(scene.adjudication, original.adjudication);
  let judges = 0;
  const previous = global.fetch;
  global.fetch = async (_url, init) => {
    const input = JSON.parse(JSON.parse(init.body).messages[1].content);
    assert.doesNotMatch(JSON.stringify(input), /ORIGINAL-PRIVATE-MEMORY/);
    if (input.contractVersion === 'world-adjudication.v1') {
      judges++;
      return completion({ status: 'accepted', effects: judges === 1
        ? [{ kind: 'materialize', supplyId: 'acceptance-meal', expectedRemaining: 1 }]
        : [{ kind: 'consume', objectId: 'acceptance-meal:1', expectedRevision: 1 }], check: null });
    }
    return completion(input.self.id === 'cass'
      ? { type: 'propose', target: judges === 0 ? 'acceptance-meal' : 'acceptance-meal:1', content: '取得餐點或食用手上的餐點', purpose: '吃飯', mood: '平靜', durationMinutes: 15, intents: [] }
      : { type: 'rest', target: '', content: '', mood: '平靜', durationMinutes: 90, intents: [] });
  };
  try {
    for (let n = 0; n < 2; n++) {
      const result = await act({ operation: 'advance', minutes: 15, mode: 'openai', model: 'gpt-6.1-sol' });
      assert.equal(result.status, 200, await result.clone().text());
    }
    const saved = await read();
    assert.equal(saved.objects.find(o => o.id === 'acceptance-meal:1').lifecycle, 'consumed');
    assert.equal(saved.supplies[0].remaining, 0);
    assert.equal(saved.aiUsage.totalCalls, 7);
    const returned = await act({ operation: 'exit-acceptance' });
    assert.equal(returned.status, 200, await returned.clone().text());
    const restored = await read();
    assert.equal(restored.turn, 123); assert.equal(restored.minute, 3105);
    assert.deepEqual(restored.characters, original.characters);
    assert.deepEqual(restored.events, original.events);
    assert.equal(restored.objects, undefined);
    assert.equal(restored.acceptance, undefined);
    assert.equal(restored.aiUsage.totalCalls, 7);
    assert.equal(restored.aiUsage.totalInputTokens, 210);
    assert.equal(restored.aiUsage.totalOutputTokens, 70);
    assert.equal(judges, 2);
  } finally { global.fetch = previous; }
});

test('the actual scene supports autonomous permission, borrowing, carrying, washing, returning and interrupted tea', async () => {
  await startScene();
  let actor = 'owner', choice = propose('acceptance-cup'), effects = [{ kind: 'grant', targetId: 'acceptance-cup', recipient: 'vera' }];
  let stages;
  const previous = global.fetch;
  global.fetch = async (_url, init) => {
    const input = JSON.parse(JSON.parse(init.body).messages[1].content);
    return completion(input.contractVersion === 'world-adjudication.v1'
      ? { status: 'accepted', effects, check: null, ...(stages ? { stages } : {}) }
      : input.self.id === actor ? choice : rest);
  };
  const wake = async () => { assert.equal((await act({ operation: 'intervene', target: actor, text: '想做什麼由你決定，這裡有杯子可留意。' })).status, 200); };
  try {
    await advance();
    let w = await read(); assert.deepEqual(w.objects[0].allowedTo, ['owner', 'vera']);
    actor = 'vera'; await wake();
    effects = [{ kind: 'transfer', objectId: 'acceptance-cup', expectedRevision: 1, toHolder: 'vera', toRegion: 'cafe-front' }];
    w = await advance(); assert.equal(w.objects[0].holder, 'vera');
    choice = { ...rest, type: 'move', target: 'kris-home', durationMinutes: 15 }; await wake();
    w = await advance(); assert.equal(w.objects[0].region, 'kris-home-main');
    choice = propose('acceptance-cup'); effects = [{ kind: 'state', objectId: 'acceptance-cup', expectedRevision: 3, key: 'clean', value: 'no' }]; await wake();
    await advance();
    effects = [{ kind: 'state', objectId: 'acceptance-cup', expectedRevision: 4, key: 'clean', value: 'yes' }]; await wake();
    w = await advance(); assert.equal(w.objects[0].state.clean, 'yes');
    choice = { ...rest, type: 'move', target: 'cafe', durationMinutes: 15 }; await wake(); await advance();
    choice = propose('acceptance-cup'); effects = [{ kind: 'transfer', objectId: 'acceptance-cup', expectedRevision: 6, toHolder: null, toRegion: 'cafe-front' }]; await wake();
    w = await advance(); assert.equal(w.objects[0].revision, 7); assert.equal(w.objects[0].holder, null); assert.equal(w.objects[0].owner, 'owner');
    choice = propose('acceptance-cup', 60); effects = [];
    stages = [
      { afterMinutes: 30, preconditions: [{ objectId: 'acceptance-cup', revision: 7, region: 'cafe-front', holder: null, state: { contents: 'empty' } }], effects: [{ kind: 'state', objectId: 'acceptance-cup', expectedRevision: 7, key: 'contents', value: 'water' }] },
      { afterMinutes: 60, preconditions: [{ objectId: 'acceptance-cup', revision: 8, region: 'cafe-front', holder: null, state: { contents: 'water' } }], effects: [{ kind: 'state', objectId: 'acceptance-cup', expectedRevision: 8, key: 'contents', value: 'tea' }] },
    ];
    await wake(); w = await advance(); assert.equal(w.objects[0].state.contents, 'empty');
    w = await advance(); assert.equal(w.objects[0].state.contents, 'water');
    choice = rest; stages = undefined; await wake(); await advance(); w = await advance();
    assert.equal(w.objects[0].state.contents, 'water'); assert.equal(w.objects[0].revision, 8);
    assert.equal(w.characters.find(c => c.id === 'vera').plan.phases, undefined);
    assert.equal(w.objects.filter(o => o.id === 'acceptance-cup').length, 1);
  } finally { global.fetch = previous; }
});

test('acceptance memory never enables vector recall or touches the paused story index', async () => {
  await startScene();
  const { env } = load('cloudflare-workers'); const previous = global.fetch;
  env.RECALL_ENABLED = 'true'; env.RECALL_USAGE_DB = store.database();
  let calls = 0;
  global.fetch = async (url, init) => {
    assert.match(String(url), /chat\/completions$/);
    const payload = JSON.parse(init.body); calls++;
    assert.doesNotMatch(payload.messages[0].content, /你可以直接完成決策，或只回傳/);
    return completion(rest);
  };
  try {
    assert.deepEqual((await (await GET()).json()).recallUsage, { enabled: false });
    await advance(); assert.equal(calls, 4);
  } finally { global.fetch = previous; delete env.RECALL_ENABLED; delete env.RECALL_USAGE_DB; }
});
