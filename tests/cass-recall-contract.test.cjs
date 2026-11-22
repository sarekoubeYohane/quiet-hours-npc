/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, name + '.cjs'));
const { modelRequestBody } = load('model-adapter');
const { decisionWireSchema } = load('npc-decision-schema');

test('a recall-enabled dispatch describes both choices and the actual decision contract for every provider', () => {
  const schema = decisionWireSchema(['say', 'propose'], [], ['cafe-feeling'], true, true, true);
  for (const provider of ['deepseek', 'openai', 'openrouter', 'anthropic']) {
    const messages = [{role:'system', content:'玩家規則'}, {role:'user', content:'{}'}];
    const body = JSON.parse(modelRequestBody({provider, model:'test'}, messages, schema, {allowRecall:true}));
    const prompt = body.system ?? body.messages[0].content;
    assert.ok(prompt.includes(JSON.stringify(schema)), provider + ' must receive the final schema');
    assert.match(prompt, /"type":"recall","questions"/);
    assert.match(prompt, /neutral.{0,18}0/);
    assert.equal(messages[0].content, '玩家規則');
  }
});

const {aiDecision} = load('models');
const {seedWorld} = load('world');
const {createFormalMentalEnergy} = load('formal-mental-policy');
const captured = require('./fixtures/cass-cafe-decisions.json');

function replay(candidate) {
  const world = seedWorld();
  world.pursuitContext = candidate.pursuitContext;
  const cass = world.characters.find(actor => actor.id === 'cass');
  cass.mentalEnergy = createFormalMentalEnergy(cass, world.minute, {capacity:50,current:35,seed:1});
  cass.shortTerm = [{id:captured[1].memorySelections[0].id,version:1,characterId:cass.id,time:world.minute,text:'想問哪裡有水。',source:{kind:'experience'},
    feelingOrigins:[{id:captured[1].feelingUpdates[0].source,actorId:cass.id,version:1,at:world.minute,kind:'experience'}]}];
  const fetcher = async () => Response.json({choices:[{message:{content:JSON.stringify(candidate)}}]});
  return aiDecision(world, cass, 'fixture-key', 'deepseek-flash', 'deepseek', fetcher, undefined,
    {enabled:true,signal:()=>AbortSignal.timeout(15000),beforeContinuation:async()=>{},search:async()=>[]});
}

test('Cass asking for water receives actionable field errors and the corrected decision is accepted', async () => {
  const candidate = structuredClone(captured[0]);
  await assert.rejects(replay(candidate), /pursuitSelection\.reason.*收到.*缺少.*預期.*字串/);
  candidate.pursuitSelection.reason = '';
  await assert.rejects(replay(candidate), /methodAssessment\.change.*收到.*not-applicable.*預期.*kind.*detail/);
  candidate.methodAssessment.change = {kind:'not-applicable',detail:''};
  assert.equal((await replay(candidate)).action.type, 'say');
});

test('Cass approaching the dispenser receives the specific cause at each validation boundary', async () => {
  const candidate = structuredClone(captured[1]);
  await assert.rejects(replay(candidate), /durationMinutes.*收到.*5.*預期.*15/);
  candidate.durationMinutes = 15;
  await assert.rejects(replay(candidate), /timeIntent\.maxMinutes.*收到.*缺少.*預期.*null/);
  candidate.timeIntent.maxMinutes = null;
  await assert.rejects(replay(candidate), /processFeeling\.direction.*收到.*正面.*預期.*positive/);
  candidate.processFeeling.direction = 'positive';
  await assert.rejects(replay(candidate), /feelingUpdates\[0\]\.reason.*收到.*缺少.*預期.*字串/);
  candidate.feelingUpdates[0].reason = '記得當時的提醒。';
  await assert.rejects(replay(candidate), /feelingUpdates\[0\]\.level.*收到.*1.*預期.*0/);
  candidate.feelingUpdates[0].level = 0;
  await assert.rejects(replay(candidate), /pursuitSelection\.reason.*收到.*缺少.*預期/);
  candidate.pursuitSelection.reason = '';
  await assert.rejects(replay(candidate), /methodAssessment\.change.*收到.*not-applicable.*預期/);
  candidate.methodAssessment.change = {kind:'not-applicable',detail:''};
  assert.equal((await replay(candidate)).action.type,'propose');
});
