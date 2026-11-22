const assert = require('node:assert/strict');
const {fixtureDecision} = require('../../../tests/pursuit-fixture.cjs');

const originalExample = '例如在自己的床上躺好睡覺，希望睡到自然醒。';
const onsetExample = '如果你想先躺下試著入睡，可以用 timeIntent.kind=open-ended 選一段願意嘗試的時間，何時醒來留給世界判定。';

function sleepPromptFor(system, shipped, condition) {
  const hint = '\n' + shipped;
  assert.equal(system.split(hint).length, 2, 'expected the complete shipped sleep prompt exactly once');
  if (condition === 'baseline') return system.replace(hint, '');
  const example = [originalExample, onsetExample].filter(text => shipped.includes(text));
  assert.equal(example.length, 1, 'inspect the shipped example before replaying these variants');
  return system.replace(hint, '\n' + shipped.replace(example[0], condition === 'candidate' ? onsetExample : originalExample));
}

const scenarios = [
  {id:'mild', need:52, feeling:'有些睡意', goal:'今晚想在自己的床上睡一覺，其他事情留到醒來再想。'},
  {id:'strong', need:92, feeling:'睡意強烈', goal:'今晚想在自己的床上睡一覺，其他事情留到醒來再想。'},
  {id:'awake', need:52, feeling:'有些睡意', goal:'雖然有些睏，我現在只想清醒地躺著歇一會兒。'}
];

function fixture(input, condition, scene) {
  if (input.contractVersion === 'world-adjudication.v1') {
    return {status:'accepted', effects:[], stages:[], check:null, routine:null, completionMinutes:480,
      bodyActivity:{version:1,kind:'sleep',fatiguePerHour:-6,sleepPerHour:-14}};
  }
  const sleep = condition !== 'baseline' && scene.id !== 'awake';
  const bed = input.objects.find(o=>o.label==='自己的床');
  assert.ok(bed);
  return fixtureDecision(input,{
    type:sleep?'propose':'rest', target:bed.id, content:sleep?'在自己的床上睡一覺。':'躺著清醒休息。',
    purpose:sleep?'睡到自然醒':'清醒休息', durationMinutes:480,
    timeIntent:{kind:sleep && condition !== 'candidate'?'completion':'open-ended',maxMinutes:null}
  });
}

async function observeSleep(first, advance, read) {
  const result = {initialBodyActivity:first.plan?.bodyActivity?.kind ?? null, ticks:[]};
  if (result.initialBodyActivity !== 'sleep') return result;
  assert.equal(first.mentalEnergy.formal.sleepUnits,0);
  assert.equal(first.plan.sleep.elapsedMinutes,0);
  const startedAt = first.mentalEnergy.updatedAt;
  for (let step=1; step<=12; step++) {
    const response = await advance();
    if (response.status !== 200) {
      result.failure = (await response.json()).error;
      break;
    }
    const actor = read(), energy = actor.mentalEnergy;
    const interval = energy.history.find(h=>h.from===startedAt+(step-1)*5 && h.minute===startedAt+step*5 &&
      ['process','natural'].includes(h.kind));
    assert.ok(interval,'missing committed mental interval');
    result.ticks.push({minute:step*5, elapsedSleep:actor.plan?.sleep?.elapsedMinutes ?? null,
      sleepUnits:energy.formal.sleepUnits, awakeMinutes:interval.awakeMinutes,
      before:interval.before, after:interval.after, sleepDelta:interval.sleepDelta,
      processDelta:interval.processDelta, naturalDelta:interval.naturalDelta});
    if (actor.plan?.bodyActivity?.kind !== 'sleep') break;
  }
  result.fullHour = result.ticks.length===12 && result.ticks.every((t,i)=>t.elapsedSleep===(i+1)*5 && t.awakeMinutes===0);
  if (result.fullHour) {
    for (const tick of result.ticks) {
      assert.equal(tick.sleepUnits,(tick.minute/5)%12);
      assert.equal(tick.sleepDelta,tick.minute===60?1:0);
      assert.equal(tick.after,Math.max(0,Math.min(first.mentalEnergy.policy.maximum,
        tick.before+tick.processDelta+tick.naturalDelta+tick.sleepDelta)));
    }
  }
  return result;
}

module.exports = {scenarios, fixture, observeSleep, sleepPromptFor};
