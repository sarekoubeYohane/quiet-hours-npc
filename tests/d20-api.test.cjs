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
async function tryCraft(roll) {
  store.install(seedWorld());
  const direct = await POST(request('direct', { target: 'owner', action: { type: 'work', target: 'craft-challenge' } }));
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
