/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, name + '.cjs'));
const {aiDecision} = load('models');
const {seedWorld} = load('world');
const {initialDirection} = load('pursuits');
const {createFormalMentalEnergy} = load('formal-mental-policy');

// The shared fixture replaces save-specific handles. The local replay also accepts the original strings.
const replies = require(process.env.QUIET_HOURS_ROUND_NINE_REPLIES || './fixtures/cafe-round-nine-decisions.json');

function replay(actorId, reply, fetcher = async () => Response.json({choices:[{message:{content:reply}}]}), recall) {
  const world = seedWorld();
  const actor = world.characters.find(c => c.id === actorId);
  const captured = JSON.parse(reply);
  world.pursuitContext = captured.pursuitContext;
  actor.id = actorId === 'owner' ? 'npc:2' : 'npc:1';
  actor.intents = [{...initialDirection(actor), version:2}];
  actor.mentalEnergy = createFormalMentalEnergy(actor, world.minute, {capacity:50,current:35,seed:1});
  actor.shortTerm = captured.methodAssessment.knownResults.map(({id,version}) => ({
    id, version, characterId:actor.id, time:world.minute, text:'店主告知了杯子的位置。', source:{kind:'experience'},
  }));
  return aiDecision(world, actor, 'fixture-key', 'deepseek-flash', 'deepseek', fetcher, undefined, recall);
}

test('the owner can propose counting cups once the undefined field is omitted', async () => {
  const raw = replies.owner;
  await assert.rejects(replay('owner', raw), /\$\["interpretation_"\]：收到 null，預期 省略未定義的決策欄位/);
  const corrected = JSON.parse(raw);
  delete corrected.interpretation_;
  const decision = await replay('owner', JSON.stringify(corrected));
  assert.equal(decision.action.content, corrected.action.content);
  assert.equal(decision.interpretation, corrected.interpretation);
});

test('Cass can propose looking for a cup once the neutral process feeling has level zero', async () => {
  const raw = replies.cass;
  await assert.rejects(replay('cass', raw), /processFeeling\.level：收到 1，預期 neutral 對應 0/);
  const corrected = JSON.parse(raw);
  corrected.processFeeling.level = 0;
  const decision = await replay('cass', JSON.stringify(corrected));
  assert.deepEqual(decision.processFeeling, corrected.processFeeling);
  assert.equal(decision.action.content, corrected.action.content);
});

test('the actual NPC request gives both field rules before and after recall', async () => {
  const corrected = JSON.parse(replies.cass);
  corrected.processFeeling.level = 0;
  const prompts = [];
  const fetcher = async (_url, init) => {
    prompts.push(JSON.parse(init.body).messages.find(m => m.role === 'system').content);
    const content = JSON.stringify(prompts.length === 1 ? {type:'recall',questions:['杯子在哪裡？']} : corrected);
    return Response.json({choices:[{message:{content}}]});
  };
  await replay('cass', JSON.stringify(corrected), fetcher, {
    enabled:true, signal:() => AbortSignal.timeout(15000), beforeContinuation:async () => {}, search:async () => [],
  });
  assert.equal(prompts.length, 2);
  for (const prompt of prompts) {
    assert.match(prompt, /未定義的欄位.{0,12}省略.{0,30}null/);
    assert.match(prompt, /processFeeling\.direction.{0,15}"neutral".{0,20}processFeeling\.level.{0,12}0/);
    assert.match(prompt, /processFeeling[^。\n]{0,50}direction、level、reason/);
    assert.match(prompt, /processFeeling\.mood[^。\n]*null[^。\n]*省略/);
  }
});

test('the round thirteen proposal keeps its top-level mood after omitting only processFeeling.mood', async () => {
  const {cass:raw} = require(process.env.QUIET_HOURS_ROUND_THIRTEEN_REPLIES || './fixtures/cafe-round-thirteen-replies.json');
  await assert.rejects(replay('cass', raw), /processFeeling.*"mood":null.*活動感受只能給有界方向、等級及理由/);
  const corrected = JSON.parse(raw);
  delete corrected.processFeeling.mood;
  const decision = await replay('cass', JSON.stringify(corrected));
  assert.deepEqual(decision.processFeeling, corrected.processFeeling);
  assert.equal(decision.action.mood, corrected.mood);
  assert.equal(decision.action.content, corrected.action.content);
});
