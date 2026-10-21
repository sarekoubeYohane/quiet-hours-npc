import { requiresWorldEffects, commitFreeAction, commitActivityPhase, validateResultBranches, discardPendingSupplies, EffectValidationError, type Effect } from './world-effects';
import { record, resolve, type Character, type World } from './world';
import { regionOf } from './perception';
import type { ActivityDecision } from './activities';

// This module mutates only the current round candidate. Model dispatch, NPC
// choices, usage accounting and the whole-round persistence remain outside.
export const activityDurations = [15, 30, 45, 60, 75, 90];
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

function advancePhases(w:World,c:Character):void{
 const plan=c.plan,phases=plan?.phases;
 if(!plan||!phases)return;
 while(phases.cursor<phases.stages.length&&phases.stages[phases.cursor].afterMinutes<=w.minute-plan.startedAt){
  const phase=phases.stages[phases.cursor];
  let results:string[];
  try{results=commitActivityPhase(w,c,phase,phases.cursor);}catch{
   c.activity='原活動的條件已改變，尚未完成。';
   record(w,c.id,`${c.name} ${c.activity}`,'blocked',[c.id]);cancelActivity(w,c);return;
  }
  phases.cursor++;
  const outcome=plan.selectedResult?.outcome;
  const label=outcome==='critical-failure'?'大失敗':outcome==='failure'?'失敗':outcome==='mixed'?'部分成功':'完成';
  c.activity=results.join('，')||`這次嘗試的結果為${label}`;
  record(w,c.id,`${c.name} ${c.activity}。`,'work',[c.id],{from:c.location,to:c.location,fromRegion:regionOf(c),toRegion:regionOf(c)},plan.selectedResult?.resolution);
 }
 if(phases.cursor===phases.stages.length&&w.minute>=plan.until){
  const outcome=plan.selectedResult?.outcome;
  const label=outcome==='critical-failure'?'大失敗':outcome==='failure'?'失敗':outcome==='mixed'?'部分成功':outcome==='critical-success'?'大成功':'成功';
  c.activity+=plan.selectedResult?`；這次嘗試已結束${outcome?`（${label}）`:''}。`:'；活動已完成。';cancelActivity(w,c);
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

export function startActivity(world:World,character:Character,decision:ActivityDecision,options:{minutes:number;modelKey:string;attention:string;ai:boolean}):boolean {
 const {minutes,modelKey,attention,ai}=options;
 cancelActivity(world,character);
  if(requiresWorldEffects(decision.action)){
    if(!decision.freeCandidate){
      if(ai)throw Error('物件行動缺少裁定。');
      character.activity='泡茶尚未完成：目前規則模式不支援這項物件活動。';
      record(world,character.id,`${character.name} ${character.activity}`,'unsupported',[character.id]);
      return false;
    }
    let candidate=decision.freeCandidate;
    if(decision.timeIntent?.kind==='completion'&&candidate.status==='accepted'){
      const instantaneousRights=candidate.effects.length>0&&candidate.effects.every(effect=>effect.kind==='grant'||effect.kind==='consent')&&!(candidate.stages?.length);
      if(candidate.confirmedDurationMinutes===undefined&&instantaneousRights)candidate={...candidate,confirmedDurationMinutes:15};
      if(candidate.confirmedDurationMinutes===undefined)throw new EffectValidationError('完成目標缺少世界確認耗時。',{reason:'completion_time_missing'});
      const duration=candidate.confirmedDurationMinutes;
      if(instantaneousRights&&duration!==15)throw new EffectValidationError('授權與同意是一次性選擇。',{reason:'rights_duration'});
      if(!candidate.branches&&!(candidate.stages?.length)&&duration>minutes)candidate={...candidate,effects:[],stages:[{afterMinutes:duration,preconditions:[],effects:candidate.effects}]};
      if(!candidate.branches&&candidate.stages?.length&&candidate.stages.at(-1)!.afterMinutes!==duration)throw new EffectValidationError('最後階段須與確認完成時間一致。',{reason:'completion_phase_time'});
      if(decision.timeIntent.maxMinutes!==null&&duration>decision.timeIntent.maxMinutes){
        const validation=structuredClone(world),actor=validation.characters.find(c=>c.id===character.id)!;
        if(candidate.branches)validateResultBranches(validation,actor,candidate);else commitFreeAction(validation,actor,{...candidate,check:null});
        candidate={status:'denied',effects:[],stages:[],check:null,blockedReason:`這項活動需要 ${duration} 分鐘，超過自己設定的投入上限 ${decision.timeIntent.maxMinutes} 分鐘；尚未開始，可自行重新安排。`};
      }
    }
    const duration=candidate.confirmedDurationMinutes??decision.durationMinutes;
    if((candidate.stages||[]).some(p=>p.afterMinutes>duration))throw new EffectValidationError('活動階段時點超出本次計畫。',{reason:'phase_duration',durationMinutes:decision.durationMinutes});
    const accepted=commitFreeAction(world,character,candidate,decision.action);
    const phases=candidate.stages||[];
    if(accepted&&phases.length){character.plan={action:decision.action,startedAt:world.minute-minutes,until:world.minute-minutes+duration,attention,modelKey,...(candidate.selectedResult?{selectedResult:candidate.selectedResult}:{}),...(decision.timeIntent?{timeIntent:decision.timeIntent}:{}),phases:{stages:phases,cursor:0,origin:character.region!}};advancePhases(world,character);}
  }
  else {
    if(decision.timeIntent?.kind==='completion'){
      if(decision.action.type==='rest'||decision.action.type==='reflect'){
        character.activity='目前不支援以這個方法確認完成目標，可改用明確方法或自行選定活動時段。';
        record(world,character.id,`${character.name} ${character.activity}`,'unsupported',[character.id]);
        return false;
      }
      if(decision.timeIntent.maxMinutes!==null&&decision.timeIntent.maxMinutes<15){
        const validation=structuredClone(world),actor=validation.characters.find(c=>c.id===character.id)!;
        resolve(validation,actor,decision.action,{dryRun:true});
        character.activity=`這項活動需要 15 分鐘，超過自己設定的投入上限 ${decision.timeIntent.maxMinutes} 分鐘；尚未開始，可自行重新安排。`;
        record(world,character.id,`${character.name} ${character.activity}`,'blocked',[character.id]);
        return false;
      }
    }
    resolve(world, character, decision.action);
  }
  const duration = decision.timeIntent?.kind==='completion'?15:activityDurations.includes(decision.durationMinutes) ? decision.durationMinutes : 30;
  if (!requiresWorldEffects(decision.action) && (sustainedActions.has(decision.action.type) || decision.timeIntent?.kind==='open-ended') && duration > minutes) {
    character.plan = { action: decision.action, startedAt: world.minute - minutes,
      until: world.minute - minutes + duration, attention: attention, modelKey, ...(decision.timeIntent?{timeIntent:decision.timeIntent}:{}) };
    if(decision.timeIntent?.kind==='open-ended')character.activity=`正在進行自己選定的活動時段，約剩 ${duration-minutes} 分鐘。`;
  }else if(decision.timeIntent?.kind==='open-ended'&&!requiresWorldEffects(decision.action)){
    character.activity='自己選定的活動時段已到期，接下來可重新安排。';
  }
 return true;
}
