import { regions, regionOf } from './perception';
import { assertBoundedState, validBodyStateKey } from './adjudication-contract';
import type { World } from './world';
import type { StateChange } from './world-effects';

export type WorldStateTarget={type:'object'|'environment'|'body';id:string};
export type StateExposure='public'|'subject'|'hidden';
export type PhysicalState={revision:number;state:Record<string,string>;exposure?:Record<string,StateExposure>};
export type ExternalConsequence={target:WorldStateTarget;changes:{key:string;value:string}[];exposure?:StateExposure;movement?:{fromRegion:string;toRegion:string}};
export type StateCondition={kind:'state-condition';version:1;target:WorldStateTarget;state:{key:string;value:string|null}[];guard?:{region:string|null;holder:{check:boolean;value:string|null}}};

// A missing new bag is the current empty state, never a fabricated past event.
// This authority projection is for execution; NPC projections live in perception.
export function worldTargetSnapshot(w:World,target:WorldStateTarget):{revision:number;state:Record<string,string>;region:string;holder?:string|null}|undefined {
 if(target.type==='object'){
  const object=w.objects?.find(o=>o.id===target.id&&o.lifecycle==='active');
  return object?{revision:object.revision,state:object.state,region:object.region,holder:object.holder}:undefined;
 }
 if(target.type==='body'){
  const actor=w.characters.find(c=>c.id===target.id);if(!actor)return;
  return {revision:actor.physical?.revision||0,state:actor.physical?.state||{},region:regionOf(actor)};
 }
 const region=target.id;if(!regions.some(item=>item.id===region))return;
 // Region existence is checked by the contract executor before this writer.
 const bag=w.scene?.external?.[region];return {revision:bag?.revision||0,state:bag?.state||{},region};
}
export function applyBoundedStateChanges(state:Record<string,string>,changes:StateChange[]):Record<string,string> {
 const next={...state};
 for(const change of changes){
  const previous=Object.hasOwn(next,change.key)?next[change.key]:null;
  if(previous!==change.from)throw Error('外在狀態前提已改變。');
  next[change.key]=change.value;
 }
 assertBoundedState(next);return next;
}
export function applyWorldStateChange(w:World,target:WorldStateTarget,changes:StateChange[],exposure?:StateExposure):void {
 const current=worldTargetSnapshot(w,target);if(!current)throw Error('外在狀態對象已不存在。');
 const state=applyBoundedStateChanges(current.state,changes);
 if(target.type==='object'){
  if(exposure!=='public'&&exposure!=='hidden')throw Error('物件狀態缺少可知範圍。');
  const object=w.objects!.find(o=>o.id===target.id)!;object.state=state;object.revision++;
  const visibility={...(object.stateExposure||{})};for(const change of changes)visibility[change.key]=exposure;object.stateExposure=visibility;return;
 }
 if(target.type==='body'){
  if(changes.some(change=>!validBodyStateKey(change.key)))throw Error('身體效果不能改寫心理或自主欄位。');
  if(exposure!=='public'&&exposure!=='subject'&&exposure!=='hidden')throw Error('身體外在狀態缺少可知範圍。');
  const actor=w.characters.find(c=>c.id===target.id)!;
  const visibility={...(actor.physical?.exposure||{})};for(const change of changes)visibility[change.key]=exposure!;
  actor.physical={revision:current.revision+1,state,exposure:visibility};return;
 }
 w.scene??={doors:{},noise:{},occluded:[]};
 if(exposure!=='public'&&exposure!=='hidden')throw Error('環境狀態缺少可知範圍。');
 const visibility={...(w.scene.external?.[target.id]?.exposure||{})};for(const change of changes)visibility[change.key]=exposure;
 (w.scene.external??={})[target.id]={revision:current.revision+1,state,exposure:visibility};
}
export function stateConditionsHold(w:World,conditions:StateCondition[]):boolean {
 return conditions.every(condition=>{
  const current=worldTargetSnapshot(w,condition.target);if(!current)return false;
  if(condition.guard?.region!==undefined&&condition.guard.region!==null&&current.region!==condition.guard.region)return false;
  if(condition.guard?.holder.check&&current.holder!==condition.guard.holder.value)return false;
  return condition.state.every(({key,value})=>(Object.hasOwn(current.state,key)?current.state[key]:null)===value);
 });
}
// Preserve live character/plan references owned by the activity lifecycle.
export function commitWorldChanges(w:World,clone:World):void {
 w.objects=clone.objects;w.supplies=clone.supplies;w.scene=clone.scene;
 if(clone.naturalChangesDropped!==undefined)w.naturalChangesDropped=clone.naturalChangesDropped;else delete w.naturalChangesDropped;
 if(clone.naturalChanges)w.naturalChanges=clone.naturalChanges;else delete w.naturalChanges;
 for(const actor of w.characters){
  const next=clone.characters.find(c=>c.id===actor.id)!;
  if(next.physical)actor.physical=next.physical;else delete actor.physical;
  if(next.needs)actor.needs=next.needs;else delete actor.needs;
  actor.location=next.location;actor.region=next.region;
 }
}

// Projection of observable facts, never the authoritative state bag or revision.
export function knownExternalState(bag:PhysicalState|undefined,subject=false):{state:Record<string,string>}|undefined {
 if(!bag)return;
 const state=Object.fromEntries(Object.entries(bag.state).filter(([key])=>bag.exposure?.[key]==='public'||subject&&bag.exposure?.[key]==='subject'));
 return Object.keys(state).length?{state}:undefined;
}

// Shared object relations are checked after a whole batch, including nature.
export function worldObjectContinuityProblem(w:World,touched:ReadonlySet<string>):{message:string;objectId:string}|undefined {
 for(const drink of w.objects||[]){
  if(!drink.state.vessel||(!touched.has(drink.id)&&!touched.has(drink.state.vessel)))continue;
  const vessel=w.objects?.find(o=>o.id===drink.state.vessel);
  const separated=drink.lifecycle==='active'&&(!vessel||vessel.id===drink.id||vessel.lifecycle!=='active'||vessel.region!==drink.region||vessel.holder!==drink.holder||vessel.state.contents!==drink.state.beverage);
  const activeServings=(w.objects||[]).filter(object=>object.lifecycle==='active'&&object.state.vessel===drink.state.vessel);
  const replacement=activeServings.some(object=>object.id!==drink.id&&object.state.beverage===vessel?.state.contents);
  const terminalStillFull=drink.lifecycle!=='active'&&touched.has(drink.id)&&vessel&&vessel.state.contents===drink.state.beverage&&!replacement;
  if(separated||terminalStillFull||activeServings.length>1)return {message:'飲品與容器的結果不一致。',objectId:drink.id};
 }
}
