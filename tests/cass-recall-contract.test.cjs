/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const load = name => require(path.join(process.env.QUIET_HOURS_TEST_BUILD, name + '.cjs'));
const { modelRequestBody } = load('model-adapter');
const { prepareNpcDecision } = load('npc-decision-preparation');

test('a recall-enabled dispatch describes both choices and the actual decision contract for every provider', () => {
  const world=seedWorld(), cass=world.characters.find(actor=>actor.id==='cass');
  cass.mentalEnergy=createFormalMentalEnergy(cass,world.minute,{capacity:50,current:35,seed:1});
  for (const provider of ['deepseek', 'openai', 'openrouter', 'anthropic']) {
    const messages = [{role:'system', content:'玩家規則'}, {role:'user', content:'{}'}];
    const options={provider,model:'test',modelKey:provider+':test',messages,allowedTypes:['say','propose'],allowRecall:true};
    const prepared=prepareNpcDecision(world,cass,options);
    const schema=prepared.schema;
    const body=JSON.parse(modelRequestBody(options,prepared.messages,schema,options));
    const prompt = body.system ?? body.messages[0].content;
    assert.ok(prompt.includes(JSON.stringify(schema)), provider + ' must receive the final schema');
    assert.match(prompt, /"type":"recall","questions"/);
    assert.match(prompt, /neutral.{0,18}0/);
    assert.match(prompt, /reason.{0,25}256 UTF-8 bytes/);
    assert.match(prompt, /頂層省略 type.{0,45}action\.type/);
    assert.equal(messages[0].content, '玩家規則');
  }
});

const {aiDecision} = load('models');
const {seedWorld} = load('world');
const {createFormalMentalEnergy} = load('formal-mental-policy');
// The committed excerpts retain the provider's formatting. Only save-specific handles are replaced.
const auditFile = process.env.QUIET_HOURS_CASS_AUDIT;
const rawReplies = auditFile
  ? JSON.parse(require('node:fs').readFileSync(auditFile,'utf8').replace(/^\uFEFF/, '')).attempts.map(attempt=>attempt.modelResponse.choices[0].message.content)
  : require('./fixtures/cass-cafe-decisions.json');
const captured = rawReplies.map(raw=>JSON.parse(raw));

function replay(candidate, rawContent = JSON.stringify(candidate)) {
  const world = seedWorld();
  world.pursuitContext = candidate.pursuitContext;
  const cass = world.characters.find(actor => actor.id === 'cass');
  cass.mentalEnergy = createFormalMentalEnergy(cass, world.minute, {capacity:50,current:35,seed:1});
  cass.shortTerm = [{id:captured[1].memorySelections[0].id,version:1,characterId:cass.id,time:world.minute,text:'想問哪裡有水。',source:{kind:'experience'},
    feelingOrigins:[{id:captured[1].feelingUpdates[0].source,actorId:cass.id,version:1,at:world.minute,kind:'experience'}]}];
  const fetcher = async () => Response.json({choices:[{message:{content:rawContent}}]});
  return aiDecision(world, cass, 'fixture-key', 'deepseek-flash', 'deepseek', fetcher, undefined,
    {enabled:true,signal:()=>AbortSignal.timeout(15000),beforeContinuation:async()=>{},search:async()=>[]});
}

test('Cass asking for water receives actionable field errors and the corrected decision is accepted', async () => {
  const candidate = structuredClone(captured[0]);
  await assert.rejects(replay(candidate, rawReplies[0]), /pursuitSelection\.reason.*收到.*缺少.*預期.*字串/);
  candidate.pursuitSelection.reason = '';
  await assert.rejects(replay(candidate), /methodAssessment\.change.*收到.*not-applicable.*預期.*kind.*detail/);
  candidate.methodAssessment.change = {kind:'not-applicable',detail:''};
  assert.equal((await replay(candidate)).action.type, 'say');
  candidate.methodAssessment.change.kind='unknown';
  await assert.rejects(replay(candidate), /methodAssessment\.change\.kind.*收到 "unknown".*預期.*not-applicable/);
});

test('Cass approaching the dispenser receives the specific cause at each validation boundary', async () => {
  const candidate = structuredClone(captured[1]);
  await assert.rejects(replay(candidate, rawReplies[1]), /durationMinutes.*收到.*5.*預期.*15/);
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
  candidate.processFeeling.reason='水'.repeat(86);
  await assert.rejects(replay(candidate), /processFeeling\.reason.*收到.*水.*預期.*256 UTF-8 bytes/);
});


test('final decisions report the misplaced root type even when the nested action is valid', async () => {
  const siteFile=process.env.QUIET_HOURS_CASS_RETEST;
  const candidates=siteFile
    ? JSON.parse(require('node:fs').readFileSync(siteFile,'utf8')).attempts.flatMap(attempt =>
      attempt.failedTrace.dispatches.filter(dispatch => dispatch.failure).map(dispatch => dispatch.rawCandidate))
    : ['move','say'].map(type => JSON.stringify({...captured[0],type:'json_object',action:{...captured[0].action,type}}));
  assert.equal(candidates.length,2);
  for(const raw of candidates) {
    const candidate=JSON.parse(raw);
    await assert.rejects(replay(candidate,raw), /欄位 \$\.type：收到 "json_object"，預期.*省略.*action\.type/);
  }
});


test('additional action and root fields report their path and value even for empty keys', async () => {
  for(const [scope,pattern] of [['action', /action\[""\].*收到 1.*預期.*省略/],['root', /\$\[""\].*收到 1.*預期.*省略/]]){
    const candidate=structuredClone(captured[0]);
    (scope==='action'?candidate.action:candidate)['']=1;
    await assert.rejects(replay(candidate),pattern);
  }
});


test('DeepSeek receives the exact response identity and the enabled field layout for this dispatch', () => {
  for (const allowRecall of [true,false]) {
    const world=seedWorld(), cass=world.characters.find(actor=>actor.id==='cass');
    world.pursuitContext=allowRecall?'first-dispatch-context':'final-dispatch-context';
    cass.mentalEnergy=createFormalMentalEnergy(cass,world.minute,{capacity:50,current:35,seed:1});
    const options={provider:'deepseek',model:'deepseek-flash',modelKey:'deepseek:deepseek-flash',allowedTypes:['say','propose'],
      allowRecall,messages:[{role:'system',content:'玩家規則'},{role:'user',content:''}]};
    const prepared=prepareNpcDecision(world,cass,options);
    const request=JSON.parse(modelRequestBody(options,prepared.messages,prepared.schema,options));
    const prompt=request.messages[0].content;
    assert.ok(prompt.includes(JSON.stringify({contractVersion:'npc-decision.v3',pursuitContext:world.pursuitContext})));
    assert.ok(prompt.includes(prepared.schema.required.join('、')));
    assert.match(prompt,/processFeeling[^。\n]{0,50}direction、level、reason/);
  }
});
