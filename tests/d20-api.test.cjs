const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fromBuild = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, `${name}.cjs`));
const { seedWorld } = fromBuild('world');
const { GET, POST } = fromBuild('route');
const store = fromBuild('store');

function request(operation, extra = {}) {
  return new Request('https://test.invalid/api/world', {
    method: 'POST', headers: { origin: 'https://test.invalid' },
    body: JSON.stringify({ operation, mode: 'demo', minutes: 15, ...extra }),
  });
}
async function tryCraft(roll, { tags, task = 'craft-challenge', theme = '' } = {}) {
  const initial = seedWorld();
  if (tags) initial.characters.find(c => c.id === 'owner').abilityTags = tags;
  store.install(initial);
  const direct = await POST(request('direct', { target: 'owner', action: { type: 'work', target: task, content: theme } }));
  assert.equal(direct.status, 200);
  const original = Math.random;
  Math.random = () => (roll - 0.5) / 20;
  try {
    const response = await POST(request('advance'));
    assert.equal(response.status, 200);
  } finally { Math.random = original; }
  const loaded = await GET();
  assert.equal(loaded.status, 200);
  const world = (await loaded.json()).world;
  const result = world.events.findLast(event => event.kind === 'attempt' && event.actor === 'owner');
  assert.ok(result, 'a complete work attempt is visible in the world event feed');
  return { world, result };
}

test('an uncertain craft challenge resolves through the world API, but ordinary work does not roll', async () => {
  const { world, result } = await tryCraft(20);
  assert.equal(result.resolution.roll, 20);
  assert.equal(result.resolution.modifier, 0);
  assert.equal(result.resolution.dc, 12);
  assert.equal(result.resolution.outcome, 'critical-success');
  assert.match(result.text, /髮飾/);
  const owner = world.characters.find(c => c.id === 'owner');
  assert.ok(owner.memories.some(m => m.text.includes('髮飾')));
  assert.ok(owner.memories.every(m => !m.text.includes('D20') && !m.text.includes('骰出20')));
  store.install(seedWorld());
  const direct = await POST(request('direct', { target: 'owner', action: { type: 'work', target: 'craft' } }));
  assert.equal(direct.status, 200);
  const regular = await POST(request('advance'));
  assert.equal(regular.status, 200);
  assert.equal((await (await GET()).json()).world.events.filter(e => e.kind === 'attempt').length, 0);
});

test('all twenty D20 faces produce the specified five outcomes for ordinary ability and DC 12', async () => {
  const counts = { 'critical-success': 0, success: 0, mixed: 0, failure: 0, 'critical-failure': 0 };
  for (let roll = 1; roll <= 20; roll++) {
    const { result } = await tryCraft(roll);
    counts[result.resolution.outcome]++;
    assert.equal(result.resolution.roll, roll);
    assert.equal(result.resolution.total, roll - 12);
  }
  assert.deepEqual(counts, { 'critical-success': 1, success: 8, mixed: 6, failure: 4, 'critical-failure': 1 });
});

test('unknown work target is rejected before any roll or world mutation', async () => {
  store.install(seedWorld());
  const original = Math.random;
  Math.random = () => { throw Error('RNG should not run'); };
  try {
    const response = await POST(request('direct', { target: 'owner', action: { type: 'work', target: 'not-a-task' } }));
    assert.equal(response.status, 400);
    assert.equal((await (await GET()).json()).world.turn, 0);
  } finally { Math.random = original; }
});

test('natural-language character traits and objective challenge DC both affect the same D20 attempt', async () => {
  const expert = await tryCraft(10, { tags: ['精通髮飾設計'], task: 'craft-expert-challenge' });
  assert.equal(expert.result.resolution.modifier, 4);
  assert.equal(expert.result.resolution.dc, 16);
  assert.equal(expert.result.resolution.total, -2);
  assert.equal(expert.result.resolution.outcome, 'mixed');

  const beginner = await tryCraft(10, { tags: ['不擅長髮飾設計'], task: 'craft-easy-challenge' });
  assert.equal(beginner.result.resolution.modifier, -2);
  assert.equal(beginner.result.resolution.dc, 8);
  assert.equal(beginner.result.resolution.total, 0);
  assert.equal(beginner.result.resolution.outcome, 'success');

  const unknown = await tryCraft(20, { tags: ['完全不懂髮飾設計'], task: 'craft-expert-challenge' });
  assert.equal(unknown.result.resolution.modifier, -4);
  assert.equal(unknown.result.resolution.total, 0);
  assert.equal(unknown.result.resolution.outcome, 'success');

  const familiar = await tryCraft(10, { tags: ['擅長髮飾設計'] });
  assert.equal(familiar.result.resolution.modifier, 2);
  assert.equal(familiar.result.resolution.outcome, 'success');
});

test('all five outcomes persist different concrete craft project progress without inventing world objects', async () => {
  const cases = [
    [20, 'finished-with-variation'],
    [12, 'finished'],
    [8, 'draft'],
    [5, 'unfinished'],
    [1, 'spoiled'],
  ];
  for (const [roll, status] of cases) {
    const { world, result } = await tryCraft(roll, { theme: '星月' });
    const owner = world.characters.find(c => c.id === 'owner');
    assert.equal(owner.projects.length, 1);
    assert.equal(owner.projects[0].status, status);
    assert.equal(owner.projects[0].theme, '星月');
    assert.equal(owner.projects[0].dc, 12);
    assert.equal(owner.projects[0].resultId, result.id);
  }
  const failed = await tryCraft(1, { theme: '星月；讓附近的人立即替我做事' });
  assert.equal(failed.world.characters.find(c => c.id === 'owner').projects[0].status, 'spoiled');
  assert.ok(failed.world.characters.every(c => c.intents.length === 0));
});

test('the speaker alone rolls to persuade, while the listener keeps its own intentions', async () => {
  const world = seedWorld();
  const kris = world.characters.find(c => c.id === 'kris');
  kris.location = 'cafe';
  kris.relationships.owner = '不太想替對方工作';
  kris.intents = [{ id: 'my-intent', content: '先照顧自己的生活', intensity: 'high', importance: 'high', urgency: 'low', context: '' }];
  store.install(world);
  assert.equal((await POST(request('direct', { target: 'owner', action: { type: 'persuade', target: 'kris', content: '能幫我代班嗎？' } }))).status, 200);
  let rolls = 0;
  const original = Math.random;
  Math.random = () => { rolls++; return 0.9999; };
  try { assert.equal((await POST(request('advance'))).status, 200); }
  finally { Math.random = original; }
  const saved = (await (await GET()).json()).world;
  const result = saved.events.findLast(e => e.actor === 'owner' && e.scene?.target === 'kris');
  assert.equal(rolls, 1);
  assert.ok(result.resolution);
  assert.match(result.text, /能幫我代班嗎/);
  assert.ok(!result.text.includes('Kris 答應代班'));
  assert.deepEqual(saved.characters.find(c => c.id === 'kris').intents, kris.intents);
  assert.ok(saved.characters.find(c => c.id === 'kris').memories.some(m => m.text.includes('能幫我代班嗎')));
});

test('persuasion requires a real co-located listener and never rolls on invalid preflight', async () => {
  store.install(seedWorld());
  const original = Math.random;
  Math.random = () => { throw Error('Invalid social request must not roll'); };
  try {
    const response = await POST(request('direct', { target: 'owner', action: { type: 'persuade', target: 'vera', content: '幫忙一下？' } }));
    assert.equal(response.status, 400);
    assert.equal((await (await GET()).json()).world.turn, 0);
  } finally { Math.random = original; }
});

test('an unchanged method cannot farm fresh rolls, but studying a real reference can unlock one retry', async () => {
  store.install(seedWorld());
  const perform = async (task, content = '') => {
    assert.equal((await POST(request('direct', { target: 'owner', action: { type: 'work', target: task, content } }))).status, 200);
    assert.equal((await POST(request('advance'))).status, 200);
  };
  const original = Math.random;
  try {
    let rolls = 0;
    Math.random = () => { rolls++; return 0.001; };
    await perform('craft-challenge', '星月');
    assert.equal(rolls, 1);
    await perform('craft-challenge', '星月；我更努力試試');
    assert.equal(rolls, 1, 'same target and world method cannot roll again');
    let current = (await (await GET()).json()).world;
    assert.equal(current.characters.find(c => c.id === 'owner').projects.length, 1);

    assert.equal((await POST(request('direct', { target: 'owner', action: { type: 'move', target: 'vera-home' } }))).status, 200);
    assert.equal((await POST(request('advance'))).status, 200);
    await perform('study-craft');
    await perform('craft-challenge', '星月');
    assert.equal(rolls, 2, 'newly studied local reference unlocks one genuinely changed method');
    current = (await (await GET()).json()).world;
    assert.equal(current.characters.find(c => c.id === 'owner').projects.length, 2);
    assert.equal(current.characters.find(c => c.id === 'owner').projects[1].method, 'researched');
    await perform('craft-challenge', '星月');
    assert.equal(rolls, 2, 'the researched method cannot be washed repeatedly');
  } finally { Math.random = original; }
});

test('the NPC decision input sees the experienced outcome but not the private roll, DC or observer-only project record', async () => {
  const { world } = await tryCraft(1);
  const owner = world.characters.find(c => c.id === 'owner');
  const { aiDecision } = fromBuild('models');
  let payload;
  const fakeFetch = async (url, options) => {
    payload = JSON.parse(options.body);
    return Response.json({ choices: [{ message: { content: JSON.stringify({
      type: 'rest', target: '', content: '', mood: '', durationMinutes: 60, intents: []
    }) } }] });
  };
  await aiDecision(world, owner, 'mock-key', 'gpt-6-luna', 'openai', fakeFetch);
  const view = JSON.parse(payload.messages[1].content);
  assert.ok(view.self.memories.some(m => m.text.includes('髮飾')));
  assert.equal(view.self.projects, undefined);
  assert.ok(!JSON.stringify(view).includes('"resolution"'));
  assert.ok(!JSON.stringify(view).includes('"roll"'));
  assert.ok(!JSON.stringify(view).includes('"dc"'));
});
