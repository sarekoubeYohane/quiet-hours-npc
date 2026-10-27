/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const {nonPhoneObjects}=require('./fixtures/non-phone-objects.cjs');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, name + '.cjs'));
const { GET, POST } = load('route');
const store = load('store');
const { seedWorld } = load('world');
const report = require('../docs/verification/assets/pr131-live-acceptance/evidence.json');
const read = async () => (await (await GET()).json()).world;
const id = () => Date.now() + ':' + crypto.randomUUID();
const request = body => new Request('https://test.invalid/api/world', {
  method: 'POST', headers: { origin: 'https://test.invalid', 'X-World-Time-Policy':'round-v1' }, body: JSON.stringify({ operationId: id(), mode: 'demo', ...body }),
});
const completion = value => Response.json({ usage: { prompt_tokens: 30, completion_tokens: 10 }, choices: [{ message: { content: JSON.stringify(value) } }] });
async function scenario({ hiddenTarget = false } = {}) {
  store.install({ ...seedWorld(), adjudication: { provider: 'openai', model: 'fixture-adjudicator' } });
  await POST(request({ operation: 'set-model-key', mode: 'openai', key: 'fixture-key' }));
  assert.equal((await POST(request({ operation: 'enter-acceptance' }))).status, 200);
  const worldContext = (await read()).contextId;
  if (hiddenTarget) {
    const world = await read();
    // An explicitly hidden fixture target, never a production-world mutation.
    world.objects.push({ id: 'hidden-object', source: 'hidden-source', label: 'PRIVATE_OBJECT_LABEL', region: 'vera-home-main', holder: 'PRIVATE_HOLDER', owner: 'PRIVATE_OWNER', revision: 1, state: {}, lifecycle: 'active', kind: 'food', knownTo: [], allowedTo: ['PRIVATE_ALLOWED'] });
    store.replaceCommittedWorld(world);
  }
  const prompts = [], operations = [], adjudications = [], previous = global.fetch;
  global.fetch = async (_url, init) => {
    const messages = JSON.parse(init.body).messages, input = JSON.parse(messages[1].content);
    if (input.contractVersion === 'world-adjudication.v1') {
      adjudications.push(input);
      // Only captured fields are reused. Omitted historical fields cannot be
      // reconstructed; this transport response is an explicit fixture.
      return completion({ status: input.actor.id === 'kris' ? 'denied' : 'unsupported', effects: [], stages: [], check: null });
    }
    prompts.push({ input, system: messages[0].content });
    const saved = report.first.dispatches.find(d => d.task === 'npc' && d.actorId === input.self.id);
    return completion(['vera', 'kris'].includes(input.self.id)
      ? { ...saved.candidate.value, ...(hiddenTarget ? { target: 'hidden-object' } : {}), mood: '平靜', intents: [] }
      : { type: 'rest', target: '', content: '安靜休息', mood: '平靜', durationMinutes: 15, intents: [] });
  };
  return {
    prompts,
    adjudications,
    advance: () => {
      const body = { operation: 'advance', operationId: id(), mode: 'openai', model: 'gpt-6-luna', minutes: 15, worldContext };
      operations.push(body);
      return POST(request(body));
    },
    replay: index => POST(request(operations[index])),
    restore: () => { global.fetch = previous; },
  };
}

test('a rejected meal attempt gives conditional permission and retry guidance in the next persisted decision', async () => {
  const s = await scenario();
  try {
    assert.equal((await s.advance()).status, 200);
    const first = await read();
    assert.equal(first.supplies.find(x => x.id === 'acceptance-meal').remaining, 1);
    assert.equal((await s.advance()).status, 200);
    const next = s.prompts.filter(p => p.input.self.id === 'kris')[1];
    assert.ok(next);
    assert.equal(next.input.self.activity, first.characters.find(c => c.id === 'kris').activity);
    assert.match(next.input.self.activity, /若尚未取得必要使用許可.*自行同意授權/);
    assert.match(next.input.self.activity, /方法或已知條件實質改變/);
    assert.match(JSON.stringify(next.input.self), /只有一份可供 Cass/);
    assert.doesNotMatch(JSON.stringify(next.input), /allowedTo|adjudicationFailure|operationEvidence|routineAudit/);
    // The fixture deliberately chooses the same action. Feedback must not force
    // success, rewrite the action or silently switch this NPC to resting.
    const attempts = s.adjudications.filter(input => input.actor.id === 'kris');
    assert.equal(attempts.length, 2);
    assert.equal(attempts[1].action.target, 'acceptance-meal');
    assert.equal(attempts[1].action.content, attempts[0].action.content);
    const saved = await read();
    assert.equal(saved.supplies.find(x => x.id === 'acceptance-meal').remaining, 1);
    assert.equal(saved.objects.some(x => x.source === 'acceptance-meal'), false);
    assert.equal((await s.replay(1)).status, 200);
    assert.deepEqual(await read(), saved);
    assert.equal(s.adjudications.filter(input => input.actor.id === 'kris').length, 2);
  } finally { s.restore(); }
});

test('unsupported tea feedback preserves the distinction and changes no proposal or physical state', async () => {
  const s = await scenario();
  try {
    const before = await read();
    assert.equal((await s.advance()).status, 200);
    const first = await read();
    assert.equal((await s.advance()).status, 200);
    const next = s.prompts.filter(p => p.input.self.id === 'vera')[1].input;
    assert.equal(next.self.activity, first.characters.find(c => c.id === 'vera').activity);
    assert.match(next.self.activity, /目前的方法無法落實.*效果目前無法承接/);
    assert.match(next.self.activity, /方法或已知條件實質改變.*僅改措辭不算改變/);
    assert.match(next.self.activity, /由自己決定/);
    assert.match(JSON.stringify(next.self), /借用需要店主自己同意/);
    assert.doesNotMatch(next.self.activity, /沒有杯子|店主拒絕|無權使用|沒有茶包/);
    assert.deepEqual(nonPhoneObjects(await read()), nonPhoneObjects(before));
    const attempts = s.adjudications.filter(input => input.actor.id === 'vera');
    assert.equal(attempts.length, 2);
    assert.equal(attempts[1].action.content, attempts[0].action.content);
    assert.doesNotMatch(JSON.stringify(next), /operationEvidence|adjudicationFailure|routineAudit/);
  } finally { s.restore(); }
});

test('denied and unsupported hidden targets cannot reveal authority identities or invent a specific reason', async () => {
  const s = await scenario({ hiddenTarget: true });
  try {
    assert.equal((await s.advance()).status, 200);
    assert.equal((await s.advance()).status, 200);
    for (const actor of ['vera', 'kris']) {
      const next = s.prompts.filter(p => p.input.self.id === actor)[1].input;
      assert.doesNotMatch(JSON.stringify(next), /PRIVATE_|hidden-source|allowedTo|operationEvidence|adjudicationFailure/);
      assert.equal(next.objects.some(x => x.id === 'hidden-object'), false);
      assert.doesNotMatch(next.self.activity, /在.*房間|由.*持有|誰.*拒絕/);
    }
    assert.equal((await read()).objects.find(x => x.id === 'hidden-object').revision, 1);
  } finally { s.restore(); }
});
