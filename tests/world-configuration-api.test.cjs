/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { fixtureDecision } = require('./pursuit-fixture.cjs');
const load = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, name + '.cjs'));
const { GET, POST } = load('route');
const store = load('store');
const auth = load('auth');
const { seedWorld } = load('world');

const { configuration, configuredWorld } = require('./fixtures/world-configuration.cjs');

const send = body => POST(new Request('https://test.invalid/api/world', {
  method: 'POST', headers: { origin: 'https://test.invalid', 'X-World-Time-Policy': 'round-v1' },
  body: JSON.stringify({ operationId: Date.now() + ':' + crypto.randomUUID(), mode: 'demo', ...body }),
}));
const read = async () => {
  const response = await GET();
  assert.equal(response.status, 200);
  return (await response.json()).world;
};

test('an explicitly configured roster and room layout survive a saved round without default cast or private place names in NPC input', async () => {
  store.install(configuredWorld());
  store.installForOwner('other-owner', seedWorld());
  const before = await read();
  assert.deepEqual(before.characters.map(character => character.id), ['river', 'cedar']);
  assert.deepEqual(before.configuration, configuration);
  assert.equal(before.characters[0].region, 'lobby');
  const transport = global.fetch;
  const inputs = [];
  global.fetch = async (_url, init) => {
    const messages = JSON.parse(init.body).messages;
    assert.doesNotMatch(messages[0].content, /Vera 房間/);
    const input = JSON.parse(messages[1].content);
    inputs.push(input);
    return Response.json({
      usage: { prompt_tokens: 10, completion_tokens: 5 },
      choices: [{ message: { content: JSON.stringify(fixtureDecision(input, { type: 'rest', target: '', content: '', durationMinutes: 15 })) } }],
    });
  };
  try {
    assert.equal((await send({ operation: 'set-model-key', mode: 'openai', key: 'fixture-key' })).status, 200);
    const response = await send({ operation: 'advance', mode: 'openai', model: 'gpt-6.1-sol', minutes: 15 });
    assert.equal(response.status, 200, await response.text());
    const after = await read();
    assert.equal(after.turn, 1);
    assert.deepEqual(after.configuration, configuration);
    assert.deepEqual(after.characters.map(character => character.id), ['river', 'cedar']);
    assert.equal(after.aiUsage.totalCalls, 2);
    const river = inputs.find(input => input.self.id === 'river');
    assert.equal(river.home.name, '河畔工作室');
    assert.equal(river.scene.region.name, '接待室');
    assert.equal(river.scene.exits[0].state, 'closed');
    assert.deepEqual(river.visiblePeople, []);
    assert.doesNotMatch(JSON.stringify(river), /保密別館|保密房間|杉的獨立記憶|Kris 的住處|街角咖啡館/);
    assert.ok(after.characters[0].memories.some(memory => memory.text === '澄的獨立記憶'));
    auth.setUserId('other-owner');
    const other = await read();
    assert.equal(other.configuration, undefined);
    assert.deepEqual(other.characters.map(character => character.id), ['cass', 'vera', 'kris', 'owner']);
    assert.equal(other.turn, 0);
  } finally {
    auth.setUserId('test-owner');
    global.fetch = transport;
  }
});


test('normal actions open the configured door and move between the connected rooms', async () => {
  store.install(configuredWorld());
  const transport = global.fetch;
  let action = { type: 'door', target: 'loft-door', content: 'open' };
  global.fetch = async (_url, init) => {
    const input = JSON.parse(JSON.parse(init.body).messages[1].content);
    const candidate = input.self.id === 'river' ? action : { type: 'rest', target: '', content: '' };
    return Response.json({
      usage: { prompt_tokens: 10, completion_tokens: 5 },
      choices: [{ message: { content: JSON.stringify(fixtureDecision(input, candidate)) } }],
    });
  };
  try {
    assert.equal((await send({ operation: 'set-model-key', mode: 'openai', key: 'fixture-key' })).status, 200);
    const advance = () => send({ operation: 'advance', mode: 'openai', model: 'gpt-6.1-sol', minutes: 15 });
    const opened = await advance();
    assert.equal(opened.status, 200, await opened.text());
    assert.deepEqual((await read()).scene.doors, { 'loft-door': 'open' });
    action = { type: 'move', target: 'loft', content: '' };
    const moved = await advance();
    assert.equal(moved.status, 200, await moved.text());
    const after = await read();
    assert.equal(after.characters[0].region, 'loft');
    assert.equal(after.characters[0].location, 'studio');
    assert.ok(after.events.some(event => event.kind === 'move' && event.scene.toRegion === 'loft'));
  } finally {
    global.fetch = transport;
  }
});
