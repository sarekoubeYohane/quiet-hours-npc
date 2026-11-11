import assert from 'node:assert/strict';
import { startApp } from './real-route-runtime.mjs';
import { confirmOpening, formCharacterCard } from './opening-journey.mjs';

const app = await startApp({
  diceFaces: Array(20).fill(4),
  modelResponder(request, count) {
    assert.equal(count, 1);
    const task = JSON.parse(request.messages.at(-1).content).task;
    assert.equal(task, 'character-card-assessment-v1');
    return { bonuses: [] };
  },
});

async function request(path, body) {
  const method = body === undefined ? 'GET' : 'POST';
  const response = await fetch(app.url + path, {
    method,
    headers: {
      Cookie: 'qh_local_owner=journey-player',
      Origin: app.url,
      'Content-Type': 'application/json',
      'X-World-Time-Policy': 'round-v1',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  console.log(method, path.split('?')[0], response.status);
  return { status: response.status, body: await response.json() };
}

async function ok(path, body, expectedStatus = 200) {
  const result = await request(path, body);
  assert.equal(result.status, expectedStatus, JSON.stringify(result.body));
  return result.body;
}

try {
  assert.deepEqual((await ok('/api/saves')).saves, []);
  assert.deepEqual((await ok('/api/opening-drafts')).drafts, []);
  assert.deepEqual((await ok('/api/character-drafts')).drafts, []);
  assert.deepEqual((await ok('/api/character-cards')).cards, []);

  const { accountScope } = await ok('/api/model-settings');
  await ok('/api/model-settings', {
    accountScope, version: 0, mode: 'custom',
    models: { npc: { provider: 'openai', model: 'gpt-6-luna' },
      adjudication: { provider: 'openai', model: 'gpt-6.1-sol' } },
  });
  const workspace = await ok('/api/world?workspace=account');
  await ok('/api/world?workspace=account', {
    operationScope: workspace.operationScope, operation: 'set-model-key',
    mode: 'openai', key: 'controlled-journey-key',
  });

  const card = await formCharacterCard(request, { name: '林澄' });
  const scenes = await ok('/api/scene-templates');
  const { template: scene } = await ok('/api/scene-templates', {
    accountScope: scenes.accountScope, id: crypto.randomUUID(), version: 0,
    name: '河岸小屋', note: '靠近河岸', rooms: [{ id: 'front', name: '客廳' }],
    connections: [], objects: [],
  }, 201);

  const { input, saved } = await confirmOpening(request, {
    name: '河岸世界',
    city: {
      places: [{ id: 'home', templateId: scene.id, version: scene.version, name: '河岸小屋' }],
      characters: [{ templateId: card.id, version: card.version, placeId: 'home', roomId: 'front' }],
    },
  });
  assert.equal((await ok('/api/saves')).saves.length, 1);
  assert.deepEqual((await ok('/api/opening-drafts')).drafts, []);

  const observation = await ok('/api/world?save=' + encodeURIComponent(input.id));
  assert.equal(observation.world.contextId, saved.world.contextId);
  assert.equal(observation.world.turn, 0);
  assert.equal(observation.world.characters.length, 1);
  assert.equal(observation.world.characters[0].name, '林澄');
  assert.deepEqual(observation.world.characters[0].attributes.values, card.values);
  assert.equal(observation.world.configuration.locations.length, 1);
  assert.equal(app.modelRequests.length, 1);
  console.log(JSON.stringify({ ok: true, commit: app.commit, characters: 1, locations: 1, turn: 0, localModelCalls: 1 }));
} finally {
  await app.close();
}
