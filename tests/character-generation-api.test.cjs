/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const load = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, name + '.cjs'));
const { GET, POST } = load('route');
const store = load('store');
const auth = load('auth');
const { seedWorld } = load('world');

const fields = {
  name: '柳生', appearance: '  深色外套  ', personality: '安靜', abilities: '  ',
  background: '', initialMemories: '雨停了', beliefs: '重視承諾',
  preferences: '沒有', directions: '找到老鐘', startLocation: '自己的臥室',
};
const modelKey = 'test-fixture-adjudication-key';
const operationId = () => Date.now() + ':' + crypto.randomUUID();
const send = body => POST(new Request('https://test.invalid/api/world', {
  method: 'POST', headers: { origin: 'https://test.invalid', 'X-World-Time-Policy': 'round-v1' },
  body: JSON.stringify({ operationId: operationId(), mode: 'demo', ...body }),
}));
const read = async () => (await GET()).json();

test('character generation preserves filled fields and the existing story, accounting for each paid attempt once', async () => {
  store.install(seedWorld());
  store.installForOwner('other-owner', seedWorld());
  const transport = global.fetch;
  const calls = [];
  let candidate = JSON.stringify({ name: '改名', personality: '擴寫個性', abilities: '改寫空格', preferences: '咖啡', background: '在河畔跟長輩學修鐘。' });
  global.fetch = async (url, init) => {
    assert.match(url, /openai\.com/);
    assert.equal(init.headers.Authorization, 'Bearer ' + modelKey);
    calls.push(JSON.parse(init.body));
    return Response.json({ usage: { prompt_tokens: 15, completion_tokens: 9 }, choices: [{ message: { content: candidate } }] });
  };
  try {
    assert.equal((await send({ operation: 'set-model-key', mode: 'openai', key: modelKey })).status, 200);
    assert.equal((await send({ operation: 'set-adjudication', adjudication: { provider: 'openai', model: 'gpt-6.1-sol' } })).status, 200);
    const before = await read();
    const input = {
      operation: 'generate-character-template', operationId: operationId(),
      operationScope: before.operationScope, worldContext: before.world.contextId,
      characterGeneration: { description: '她在河邊長大。', fields },
    };
    store.throwAfterNextSave();
    const created = await send(input);
    assert.equal(created.status, 200, await created.clone().text());
    assert.deepEqual((await created.json()).generatedCharacter, { ...fields, background: '在河畔跟長輩學修鐘。' });
    assert.equal((await send(input)).status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].model, 'gpt-6.1-sol');
    assert.match(calls[0].messages.at(-1).content, /安靜/);
    assert.match(calls[0].messages.at(-1).content, /她在河邊長大/);
    assert.doesNotMatch(JSON.stringify(calls[0].messages), /Cass|Vera|Kris/);
    const after = await read();
    assert.equal(after.world.minute, before.world.minute);
    assert.equal(after.world.turn, before.world.turn);
    assert.deepEqual(after.world.characters, before.world.characters);
    assert.equal(after.world.aiUsage.totalCalls, 1);
    assert.equal(after.world.aiUsage.totalInputTokens, 15);
    assert.equal(after.world.aiUsage.totalOutputTokens, 9);

    auth.setUserId('other-owner');
    assert.equal((await send(input)).status, 409);
    assert.equal((await read()).world.aiUsage.totalCalls, 0);
    auth.setUserId('test-owner');

    candidate = '{bad reply';
    const invalid = { ...input, operationId: operationId() };
    const failed = await send(invalid);
    assert.equal(failed.status, 502);
    assert.equal((await failed.json()).generatedCharacter, undefined);
    assert.equal((await send(invalid)).status, 502);
    assert.equal(calls.length, 2);
    assert.equal((await read()).world.aiUsage.totalInputTokens, 30);

    candidate = JSON.stringify({ background: '新候選' });
    const interrupted = { ...input, operationId: operationId() };
    store.throwBeforeNextSave();
    const interruptedResponse = await send(interrupted);
    assert.equal(interruptedResponse.status, 502);
    assert.equal((await interruptedResponse.json()).generatedCharacter, undefined);
    assert.equal((await send(interrupted)).status, 502);
    assert.equal(calls.length, 3);
    assert.equal((await read()).world.aiUsage.totalInputTokens, 45);

    assert.equal((await send({ operation: 'set-budget', limits: { calls: 3, tokens: null } })).status, 200);
    assert.equal((await send({ ...input, operationId: operationId() })).status, 429);
    assert.equal(calls.length, 3);
  } finally {
    auth.setUserId('test-owner');
    global.fetch = transport;
  }
});
