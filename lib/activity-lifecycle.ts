import { adjudicationLimits } from './adjudication-limits';
import { applyBodyActivity, sleepMinutesUntilWake, naturalWakeLevel, type BodyActivity } from './needs';
import { invalidateNaturalChanges } from './natural-changes';
import { requiresWorldEffects, recordActionResult, commitFreeAction, commitActivityPhase, validateResultBranches, discardPendingSupplies, EffectValidationError, type Effect } from './world-effects';
import { record, resolve, type Character, type World } from './world';
import { regionOf } from './perception';
import type { ActivityDecision } from './activities';

// This module mutates only the current round candidate. Model dispatch, NPC
// choices, usage accounting and the whole-round persistence remain outside.
export const activityDurations = [...adjudicationLimits.phaseMinutes];
export const sustainedActions = new Set(['propose', 'rest', 'work', 'reflect', 'observe']);
export function canResumeActivity(world: World, character: Character, modelKey: string): boolean {
  const plan = character.plan;
  return !!plan && (!requiresWorldEffects(plan.action) || !!plan.phases) && (sustainedActions.has(plan.action.type) || plan.timeIntent?.kind==='open-ended') && plan.modelKey === modelKey &&
    (world.minute <= plan.until || !!plan.phases);
}


function expireOpenPeriod(world:World,character:Character):boolean {
 if(character.plan?.timeIntent?.kind!=='open-ended'||world.minute<character.plan.until)return false;
 character.activity='自己選定的活動時段已到期，接下來可重新安排。';
 record(world,character.id,`${character.name} ${character.activity}`,'continue',[character.id]);
 cancelActivity(world,character);
 return true;
}

// Only unexecuted prepared servings belong to the cancelled future. Concrete
// objects and earlier committed phases remain facts of the world.
export function cancelActivity(w:World,c:Character):void {
 const phases=c.plan?.phases;
 if(phases&&w.supplies){
  const pending=new Set(phases.stages.slice(phases.cursor).flatMap(stage=>stage.effects).filter((effect):effect is Extract<Effect,{kind:'materialize'}>=>effect.kind==='materialize').map(effect=>effect.supplyId));
  discardPendingSupplies(w,pending);
 }
 delete c.plan;
 if(c.control)delete c.control.active;
}

function advancePhases(w:World,c:Character,throughMinute=w.minute):void{
 const plan=c.plan,phases=plan?.phases;
 if(!plan||!phases)return;
 const previousCursor=phases.cursor;
 const periodEnded='自己選定的活動時段已到期，接下來可重新安排。';
 while(phases.cursor<phases.stages.length&&phases.stages[phases.cursor].afterMinutes<=throughMinute-plan.startedAt){
  const phase=phases.stages[phases.cursor];
  let results:string[];
  try{results=commitActivityPhase(w,c,phase,phases.cursor);}catch{
   recordActionResult(w,c,plan.action,'原活動的條件已改變，尚未完成。','blocked');cancelActivity(w,c);return;
  }
  phases.cursor++;
  const finished=phases.cursor===phases.stages.length&&throughMinute>=plan.until;
  const summary=(results.join('，')||'這個階段沒有新增可知成果')+(finished?(plan.timeIntent?.kind==='open-ended'?`；${periodEnded}`:plan.selectedResult?'；這次嘗試已結束。':'；活動已完成。'):'；這個階段已執行，活動尚未完成。');
  recordActionResult(w,c,plan.action,summary,'work',{from:c.location,to:c.location,fromRegion:regionOf(c),toRegion:regionOf(c)},plan.selectedResult?.resolution);
 }
 if(phases.cursor===phases.stages.length&&throughMinute>=plan.until){
  // A stored plan may finish its final effect before its chosen period ends.
  // Expiry is still a new knowable result, even when no phase runs this time.
  if(phases.cursor===previousCursor)recordActionResult(w,c,plan.action,plan.timeIntent?.kind==='open-ended'?periodEnded:'這次嘗試已結束，沒有新增可知成果。','work',{from:c.location,to:c.location,fromRegion:regionOf(c),toRegion:regionOf(c)});
  cancelActivity(w,c);
 }
}

// A control transition, an autonomous continuation and an explicit NPC continue
// all advance the original plan and never start a fresh clock or reroll.
export function progressActivity(world:World,character:Character,kind:'controlled'|'automatic'|'chosen'):void {
 if(character.plan?.phases){
  if(kind==='chosen')record(world,character.id,`${character.name} 決定繼續原本的活動。`,'continue',[character.id],{from:character.location,to:character.location});
  advancePhases(world,character);return;
 }
 if(expireOpenPeriod(world,character))return;
 if(!character.plan)return;
 const left=Math.max(0,character.plan.until-world.minute);
 const message=kind==='chosen'?`決定繼續原本的活動，還有約 ${left} 分鐘。`:
  `${kind==='controlled'?'繼續指定活動':'繼續原本的活動'}${left?`，還有約 ${left} 分鐘`:'，這段活動已完成'}。`;
 record(world,character.id,`${character.name} ${message}`,'continue',[character.id],{from:character.location,to:character.location});
 if(kind==='controlled'&&!left)cancelActivity(world,character);
}

export function discardLegacyActivity(world:World,character:Character):void {
 if(character.plan?.action.type==='work'&&character.plan.action.target==='tea'&&!character.plan.phases){
  cancelActivity(world,character);
  character.activity='泡茶尚未完成，需要重新確認物件條件。';
 }
}

export function startActivity(world:World,character:Character,decision:ActivityDecision,options:{minutes:number;modelKey:string;attention:string;ai:boolean;bodyMinutes?:number;bodyBase?:Pick<import('./needs').NeedValues,'fatigue'|'sleep'>}):boolean {
 const {minutes,modelKey,attention,ai}=options;
 let confirmedProfile:BodyActivity|undefined;
 cancelActivity(world,character);
  if(requiresWorldEffects(decision.action)){
    if(!decision.freeCandidate){
      if(ai)throw Error('物件行動缺少裁定。');
      recordActionResult(world,character,decision.action,'泡茶尚未完成：目前規則模式不支援這項物件活動。','unsupported');
      return false;
    }
    let candidate=decision.freeCandidate;
    if(candidate.status==='accepted'&&candidate.bodyActivity?.kind==='sleep'){
      const required=sleepMinutesUntilWake(candidate.bodyActivity,character.needs!.values.sleep);
      if(required>adjudicationLimits.maxMinutes)candidate={status:'denied',effects:[],stages:[],check:null};
      else if(decision.timeIntent?.maxMinutes!==null&&decision.timeIntent?.maxMinutes!==undefined&&required>decision.timeIntent.maxMinutes)candidate={status:'denied',effects:[],stages:[],check:null,knownBlockedReason:'這次睡眠恢復需要超過自己選定的投入上限；尚未開始。'};
    }
    if(decision.timeIntent?.kind==='completion'&&candidate.status==='accepted'){
      const instantaneousRights=candidate.effects.length>0&&candidate.effects.every(effect=>effect.kind==='grant'||effect.kind==='consent')&&!(candidate.stages?.length);
      if(candidate.confirmedDurationMinutes===undefined&&instantaneousRights)candidate={...candidate,confirmedDurationMinutes:15};
      if(candidate.confirmedDurationMinutes===undefined)throw new EffectValidationError('完成目標缺少世界確認耗時。',{reason:'completion_time_missing'});
      const duration=candidate.confirmedDurationMinutes;
      if(instantaneousRights&&duration!==15)throw new EffectValidationError('授權與同意是一次性選擇。',{reason:'rights_duration'});
      if(!candidate.branches&&!(candidate.stages?.length)&&duration>minutes)candidate={...candidate,effects:[],stages:[{afterMinutes:duration,preconditions:[],effects:candidate.effects}]};
      if(!candidate.branches&&candidate.stages?.length&&candidate.stages.at(-1)!.afterMinutes!==duration)throw new EffectValidationError('最後階段須與確認完成時間一致。',{reason:'completion_phase_time'});
      if(decision.timeIntent.maxMinutes!==null&&duration>decision.timeIntent.maxMinutes&&candidate.bodyActivity?.kind!=='sleep'){
        const validation=structuredClone(world),actor=validation.characters.find(c=>c.id===character.id)!;
        if(candidate.branches)validateResultBranches(validation,actor,candidate);else commitFreeAction(validation,actor,{...candidate,check:null});
        candidate={status:'denied',effects:[],stages:[],check:null,knownBlockedReason:`這項活動需要 ${duration} 分鐘，超過自己設定的投入上限 ${decision.timeIntent.maxMinutes} 分鐘；尚未開始，可自行重新安排。`};
      }
    }
    const duration=candidate.bodyActivity?.kind==='sleep'?adjudicationLimits.maxMinutes:candidate.confirmedDurationMinutes??decision.durationMinutes;
    if((candidate.stages||[]).some(p=>p.afterMinutes>duration))throw new EffectValidationError('活動階段時點超出本次計畫。',{reason:'phase_duration',durationMinutes:decision.durationMinutes});
    const priorEvents=new Set(world.events.map(event=>event.id));
    const accepted=commitFreeAction(world,character,candidate,decision.action,{nominalDueAt:world.minute-minutes+(candidate.stages?.length?0:candidate.confirmedDurationMinutes??minutes)});
    if(!accepted)return world.events.some(event=>!priorEvents.has(event.id)&&event.actor===character.id&&event.kind==='attempt');
    const phases=candidate.stages||[];
    if(accepted)confirmedProfile=candidate.bodyActivity;
    if(accepted&&(phases.length||candidate.bodyActivity)){character.plan={...(candidate.resumable?{resumable:true}:{}),action:decision.action,startedAt:world.minute-minutes,until:world.minute-minutes+duration,attention,modelKey,...(candidate.selectedResult?{selectedResult:candidate.selectedResult}:{}),...(decision.timeIntent?{timeIntent:decision.timeIntent}:{}),phases:{stages:phases,cursor:0,origin:character.region!}};advancePhases(world,character);}
  }
  else {
    if(decision.timeIntent?.kind==='completion'){
      if(decision.action.type==='rest'||decision.action.type==='reflect'){
        recordActionResult(world,character,decision.action,'目前不支援以這個方法確認完成目標，可改用明確方法或自行選定活動時段。','unsupported');
        return false;
      }
      if(decision.timeIntent.maxMinutes!==null&&decision.timeIntent.maxMinutes<15){
        const validation=structuredClone(world),actor=validation.characters.find(c=>c.id===character.id)!;
        resolve(validation,actor,decision.action,{dryRun:true});
        recordActionResult(world,character,decision.action,`這項活動需要 15 分鐘，超過自己設定的投入上限 ${decision.timeIntent.maxMinutes} 分鐘；尚未開始，可自行重新安排。`,'blocked');
        return false;
      }
    }
    resolve(world, character, decision.action);
    invalidateNaturalChanges(world);
  }
  const duration = decision.timeIntent?.kind==='completion'?15:activityDurations.includes(decision.durationMinutes) ? decision.durationMinutes : 30;
  if (!requiresWorldEffects(decision.action) && (sustainedActions.has(decision.action.type) || decision.timeIntent?.kind==='open-ended') && duration > minutes) {
    character.plan = { action: decision.action, startedAt: world.minute - minutes,
      until: world.minute - minutes + duration, attention: attention, modelKey, ...(decision.timeIntent?{timeIntent:decision.timeIntent}:{}) };
    if(decision.timeIntent?.kind==='open-ended')character.activity=`正在進行自己選定的活動時段，約剩 ${duration-minutes} 分鐘。`;
  }else if(decision.timeIntent?.kind==='open-ended'&&!requiresWorldEffects(decision.action)){
    character.activity='自己選定的活動時段已到期，接下來可重新安排。';
  }
 const profile:BodyActivity|undefined=requiresWorldEffects(decision.action)?confirmedProfile:decision.action.type==='rest'?{version:1,kind:'rest',fatiguePerHour:-9,sleepPerHour:0}:decision.action.type==='work'?{version:1,kind:'exertion',fatiguePerHour:3,sleepPerHour:0}:undefined;
 if(profile){
  const duration=decision.freeCandidate?.confirmedDurationMinutes??decision.durationMinutes;
  const available=Math.min(options.bodyMinutes??minutes,duration);
  const actual=applyBodyActivity(character,world.minute,profile,available,options.bodyBase);
  if(character.plan){
   character.plan.bodyActivity={...profile};
   if(profile.kind==='sleep'){
    character.plan.sleep={elapsedMinutes:actual,...(actual<available||character.needs!.values.sleep<=naturalWakeLevel?{naturalWakeAt:world.minute-available+actual}:{})};
    character.activity='正在睡眠中。';
    if(actual>0)record(world,character.id,`${character.name} 已實際睡著。`,'rest',[character.id],{from:character.location,to:character.location,fromRegion:regionOf(character),toRegion:regionOf(character)});
    wakeSleepingActivity(world,character);
   }
  }
 }
 return true;
}

// Waking ends actual sleep; it does not schedule a replacement action.
export function wakeSleepingActivity(world:World,character:Character):boolean {
 if(character.plan?.bodyActivity?.kind!=='sleep')return false;
 const natural=character.plan.sleep?.naturalWakeAt!==undefined;
 if(!natural&&character.plan.sleep?.stimulusWakeAt===undefined)return false;
 const action=character.plan.action;
 const wakeAt=character.plan.sleep?.naturalWakeAt??character.plan.sleep?.stimulusWakeAt??world.minute;
 // Effects are committed now under current conditions, only for work that was
 // already due before actual sleep ended. Later stages remain unexecuted.
 if(character.plan.phases)advancePhases(world,character,Math.min(world.minute,wakeAt));
 cancelActivity(world,character);
 character.activity=natural?'睡眠恢復後自然醒來，接下來可以自行安排。':'受到已察覺的刺激而醒來，接下來可以自行安排。';
 recordActionResult(world,character,action,character.activity,'rest');
 return true;
}
