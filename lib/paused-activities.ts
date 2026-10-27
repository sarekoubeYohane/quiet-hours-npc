import type { ActivityPlan, Character, World } from './world';
import { regionOf } from './perception';
import { worldTargetSnapshot } from './world-state';
import { cancelActivity, progressActivity } from './activity-lifecycle';
import { recordActionResult } from './world-effects';

export type PausedActivity = {
 version:1;id:string;plan:ActivityPlan;pausedAt:number;elapsedMinutes:number;remainingMinutes:number;region:string;
 references:{kind:'object'|'supply'|'body'|'environment';id:string;snapshot:string}[];
};
function referencedFacts(world:World,plan:ActivityPlan):PausedActivity['references'] {
 const refs=new Map<string,{kind:'object'|'supply'|'body'|'environment';id:string}>();
 const remember=(kind:'object'|'supply'|'body'|'environment',id:string)=>{refs.set(kind+':'+id,{kind,id});};
 const walk=(value:unknown):void=>{
  if(!value||typeof value!=='object')return;
  if(Array.isArray(value)){value.forEach(walk);return;}
  const item=value as Record<string,unknown>;
  for(const [key,kind] of [['objectId','object'],['supplyId','supply']] as const)if(typeof item[key]==='string')remember(kind,item[key]);
  if(item.target&&typeof item.target==='object'){
   const target=item.target as {type?:string;id?:string};if(target.id&&['object','body','environment'].includes(target.type||''))remember(target.type as 'object'|'body'|'environment',target.id);
  }
  Object.values(item).forEach(walk);
 };
 walk(plan.phases);
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
  if(!character.plan?.resumable||character.pausedActivity){recordActionResult(world,character,undefined,'目前活動未確認可暫停，或已保留另一項暫停進度；原活動仍保留。','blocked');return;}
  // Settle only time that actually passed before freezing progress. The shared
  // phase executor validates all due work and preserves earlier committed facts.
  progressActivity(world,character,'automatic');
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
 if(regionOf(character)!==paused.region||paused.references.some(ref=>ref.snapshot!==snapshot(world,ref))){recordActionResult(world,character,undefined,'原活動目前的必要條件已改變，尚未恢復；可以重新確認方法或放棄原安排。','blocked');return;}
 cancelActivity(world,character);
 const plan=structuredClone(paused.plan);
 // The resume choice occupies this round. Productive progress restarts at this
 // committed boundary, so pause duration never becomes retroactive work.
 plan.startedAt=world.minute-paused.elapsedMinutes;plan.until=world.minute+paused.remainingMinutes;
 plan.modelKey=modelKey;plan.attention=attention;

 character.plan=plan;delete character.pausedActivity;
 recordActionResult(world,character,undefined,`自行恢復原活動，保留已投入 ${paused.elapsedMinutes} 分鐘的進度，尚餘 ${paused.remainingMinutes} 分鐘。`,'resume');
}
