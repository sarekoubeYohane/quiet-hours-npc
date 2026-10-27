import type { ActivityPlan, Character, World } from './world';
import { regionOf } from './perception';
import { worldTargetSnapshot } from './world-state';
import { cancelActivity, progressActivity } from './activity-lifecycle';
import { recordActionResult, effectReferenceIds, remainingActivityConditionsHold, type Effect } from './world-effects';

export type PausedActivity = {
 version:1;id:string;plan:ActivityPlan;pausedAt:number;elapsedMinutes:number;remainingMinutes:number;region:string;
 references:{kind:'object'|'supply'|'body'|'environment';id:string;snapshot:string}[];
};
function referencedFacts(world:World,plan:ActivityPlan):PausedActivity['references'] {
 const refs=new Map<string,{kind:'object'|'supply'|'body'|'environment';id:string}>();
 const remember=(kind:'object'|'supply'|'body'|'environment',id:string)=>{refs.set(kind+':'+id,{kind,id});};
 const effectReferences=(effect:Effect):void=>{
  switch(effect.kind){
   case 'change-state':remember(effect.target.type,effect.target.id);return;
   case 'displace-body':remember('body',effect.targetId);return;
   case 'schedule-natural':
    for(const condition of effect.conditions)remember(condition.target.type,condition.target.id);
    for(const change of effect.effects)remember(change.target.type,change.target.id);
    return;
   case 'materialize':remember('supply',effect.supplyId);return;
   case 'physical':
    if(effect.operation==='materialize')remember('supply',effect.supplyId);
    else remember('object',effect.objectId);
    return;
   case 'grant':
    // Grants may name a concrete object or its scene supply.
    if(world.objects?.some(object=>object.id===effect.targetId))remember('object',effect.targetId);
    else remember('supply',effect.targetId);
    return;
   case 'form':case 'separate':case 'ingest':case 'consume':case 'destroy':case 'transfer':case 'state':case 'consent':
    for(const id of effectReferenceIds(effect))remember('object',id);
    return;
   default:{const exhaustive:never=effect;return exhaustive;}
  }
 };
 for(const phase of plan.phases?.stages||[]){
  for(const condition of phase.preconditions){
   if('target' in condition)remember(condition.target.type,condition.target.id);
   else remember('object',condition.objectId);
  }
  phase.effects.forEach(effectReferences);
  for(const id of phase.requiredTools||[])remember('object',id);
  for(const binding of phase.routineBindings?.objects||[])remember('object',binding.id);
  for(const binding of phase.routineBindings?.bodies||[])remember('body',binding.id);
 }
 if(plan.action.target&&world.objects?.some(object=>object.id===plan.action.target))remember('object',plan.action.target);
 return [...refs.values()].map(ref=>({...ref,snapshot:snapshot(world,ref)}));
}
function snapshot(world:World,ref:{kind:'object'|'supply'|'body'|'environment';id:string}):string {
 return JSON.stringify(ref.kind==='object'?world.objects?.find(object=>object.id===ref.id):ref.kind==='supply'?world.supplies?.find(supply=>supply.id===ref.id):worldTargetSnapshot(world,{type:ref.kind,id:ref.id}))||'missing';
}
export function pausedProjection(character:Character){
 const paused=character.pausedActivity;
 return paused?{id:paused.id,action:paused.plan.action,pausedAt:paused.pausedAt,elapsedMinutes:paused.elapsedMinutes,remainingMinutes:paused.remainingMinutes,region:paused.region}:undefined;
}
// Lifecycle controls use no new adjudication or roll. They mutate only the same
// round candidate as ordinary activity progress and world effects.
export function managePausedActivity(world:World,character:Character,type:'pause'|'resume'|'abandon',target:string|undefined,modelKey:string,attention:string):void {
 if(type==='pause'){
  const canPause=character.plan?.resumable&&!character.pausedActivity;
  // Even a rejected pause cannot freeze work whose time has already elapsed.
  // Settle through the shared executor before deciding whether to save a pause.
  progressActivity(world,character,'automatic');
  if(!canPause){recordActionResult(world,character,undefined,'目前活動未確認可暫停，或已保留另一項暫停進度。','blocked');return;}
  const plan=character.plan;if(!plan)return;
  const elapsedMinutes=Math.min(plan.until-plan.startedAt,Math.max(0,world.minute-plan.startedAt));
  character.pausedActivity={version:1,id:`${character.id}:${plan.startedAt}`,plan:structuredClone(plan),pausedAt:world.minute,elapsedMinutes,remainingMinutes:Math.max(0,plan.until-world.minute),region:regionOf(character),references:referencedFacts(world,plan)};
  delete character.plan;if(character.control)delete character.control.active;
  recordActionResult(world,character,undefined,`暫停原活動，已投入 ${elapsedMinutes} 分鐘；尚餘 ${character.pausedActivity.remainingMinutes} 分鐘，是否復工由自己決定。`,'pause');return;
 }
 const paused=character.pausedActivity;
 if(!paused||target!==paused.id){recordActionResult(world,character,undefined,'沒有這項可處理的暫停活動。','blocked');return;}
 if(type==='abandon'){
  const active=character.plan,controlled=character.control?.active;character.plan=paused.plan;cancelActivity(world,character);character.plan=active;if(controlled&&character.control)character.control.active=controlled;delete character.pausedActivity;
  recordActionResult(world,character,undefined,'已放棄暫停活動的未完成安排；先前已發生的成果仍保留。','abandon');return;
 }
 const plan=structuredClone(paused.plan);
 // The resume choice occupies this round. Productive progress restarts at this
 // committed boundary, so pause duration never becomes retroactive work.
 plan.startedAt=world.minute-paused.elapsedMinutes;plan.until=world.minute+paused.remainingMinutes;
 if(regionOf(character)!==paused.region||paused.references.some(ref=>ref.snapshot!==snapshot(world,ref))||!remainingActivityConditionsHold(world,character,plan)){recordActionResult(world,character,undefined,'原活動目前的必要條件已改變，尚未恢復；可以重新確認方法或放棄原安排。','blocked');return;}
 cancelActivity(world,character);
 plan.modelKey=modelKey;plan.attention=attention;

 character.plan=plan;delete character.pausedActivity;
 recordActionResult(world,character,undefined,`自行恢復原活動，保留已投入 ${paused.elapsedMinutes} 分鐘的進度，尚餘 ${paused.remainingMinutes} 分鐘。`,'resume');
}
