import { changeBodyNeeds, type IngestEffect } from './needs';
import { routineBindingsHold, rebindRoutineEffects, recordCommittedRoutinePremises, canConfirmRoutineBackground, type RoutineSourceScope, type RoutinePhaseBindings } from './routine-world-bindings';
import { validQuantity } from './world-formation-contract';
import { applyFormation } from './world-formation';
import type { FormationEffect, Quantity, ObjectSource, FormationFact } from './world-formation-contract';
import { scheduleNaturalChange, invalidateNaturalChanges, type ScheduleNaturalEffect } from './natural-changes';
import { applyWorldStateChange, worldTargetSnapshot, commitWorldChanges, stateConditionsHold, worldObjectContinuityProblem, type StateCondition, type ExternalConsequence } from './world-state';
export { applyBoundedStateChanges, commitWorldChanges } from './world-state';
import { effectCandidateSchema, effectRules, validObjectKind } from './adjudication-contract';
import { physicalEffectLimits } from './adjudication-limits';
export { effectCandidateSchema, effectSchema, parseEffectCandidate, scheduleCompletionMinutes } from './adjudication-contract';
import type { Action, ActivityPlan, Character, World } from './world';
import { canSee, regionOf, regions, connectingDoor, objectObservationCandidates, supplyObservationCandidates, discoverWorldResources } from './perception';
import { record } from './world';
import { usableRoutineObject } from './routine-materials';
import { judgeD20, rollD20, type Difficulty, type Advantage, type Outcome, type Resolution } from './d20';

// Legacy tea changes physical objects too; it must use the same verified effects.
export function requiresWorldEffects(action: Action): boolean {
 return action.type === 'propose' || action.type === 'work' && action.target === 'tea';
}

export type SceneSupply={stateExposure?:Record<string,'public'|'hidden'>;quantity?:Quantity;consumable?:boolean;coOwners?:string[];pending?:boolean;availableAt?:number;background?:{ruleId:string;sequence:number;scope?:{version:1;role:'material'|'equipment';subject:string|null}};id:string;label:string;region:string;remaining:number;owner:string;knownTo:string[];allowedTo:string[];kind:string;initialState:Record<string,string>;stateTransitions?:Record<string,string[]>};
export type PhysicalHistory={actorId:string;minute:number;operation:string;permitted:boolean;priorHolder:string|null};
export type WorldObject={stateExposure?:Record<string,'public'|'hidden'>;physicalHistory?:PhysicalHistory[];physicalHistoryDropped?:number;unpermittedCount?:number;endedByFormation?:{operation:'partition'|'transform';at:number;actorId:string;disposition:'consumed'|'destroyed'};quantity?:Quantity;consumable?:boolean;coOwners?:string[];sources?:ObjectSource[];formation?:FormationFact;id:string;source:string;label:string;region:string;holder:string|null;owner:string;revision:number;state:Record<string,string>;lifecycle:'active'|'consumed'|'destroyed';kind:string;knownTo:string[];allowedTo:string[];stateTransitions?:Record<string,string[]>;acceptedBy?:string[]};
export type StateChange={key:string;from:string|null;value:string};
export type ChangeStateEffect={kind:'change-state';version:1;expectedRevision:number;changes:StateChange[];reason:string}&({access:'authorized'|'physical';target:{type:'object';id:string};exposure:'public'|'hidden'}|{access:'physical';target:{type:'environment';id:string};exposure:'public'|'hidden'}|{access:'physical';target:{type:'body';id:string};exposure:'public'|'subject'|'hidden'});
export type DisplaceBodyEffect={kind:'displace-body';version:1;targetId:string;expectedRegion:string;expectedRevision:number;toRegion:string;reason:string};
export type PhysicalEffect={kind:'physical';version:1;reason:string}&({operation:'materialize';supplyId:string;expectedRemaining:number}|{operation:'take'|'place'|'consume'|'destroy';objectId:string;expectedRevision:number});
export type DiscoverEffect={kind:'discover';version:1;region:string;objectIds:string[];supplyIds:string[]};
export type Effect=DiscoverEffect|IngestEffect|ScheduleNaturalEffect|FormationEffect|PhysicalEffect|DisplaceBodyEffect|ChangeStateEffect|{kind:'materialize';supplyId:string;expectedRemaining:number}|{kind:'consume';objectId:string;expectedRevision:number}|{kind:'destroy';objectId:string;expectedRevision:number}|{kind:'transfer';objectId:string;expectedRevision:number;toHolder:string|null;toRegion:string}|{kind:'state';objectId:string;expectedRevision:number;key:string;value:string}|{kind:'grant';targetId:string;recipient:string}|{kind:'consent';objectId:string};
export type LegacyPhaseCondition={objectId:string;revision:number;region:string;holder:string|null;state:Record<string,string>};
export type PhaseCondition=LegacyPhaseCondition|StateCondition;
export type ActivityPhase={afterMinutes:number;preconditions:PhaseCondition[];effects:Effect[];routineBindings?:RoutinePhaseBindings;routineSourceScope?:RoutineSourceScope;requiredTools?:string[]};
export type ResultBranch={outcomes:Outcome[];effects:Effect[];stages:ActivityPhase[]};
// Internal only: a trusted routine binder can identify each current vessel/material
// attempt without storing model-authored IDs or the first historical die in a rule.
export type TrialBinding={operation:string;subject:string;references:string[]};
export type SelectedResult={outcome:Outcome|null;resolution?:Resolution;branch:number};
export type ActivityIdentity={version:1;key:string;label:string};
export type EffectCandidate={activityIdentity?:ActivityIdentity;resumable?:boolean;bodyActivity?:import('./needs').BodyActivity;pendingResultSupplies?:string[];branches?:ResultBranch[];selectedResult?:SelectedResult;trialBinding?:TrialBinding;preparationSupplies?:string[];confirmedDurationMinutes?:number;knownBlockedReason?:string;blockedReason?:string;stages?:ActivityPhase[];status:'accepted'|'denied'|'unsupported';effects:Effect[];check:{difficulty:Difficulty;ability:string}|null};
export function hasObjectPermission(object:{owner:string;allowedTo:string[];coOwners?:string[]},actorId:string):boolean {
 return object.allowedTo.includes(actorId)||(!object.coOwners||object.coOwners.length<=1)&&object.owner===actorId;
}
export function canPhysicallyReachObject(w:World,c:Character,object:WorldObject):boolean {
 const holder=object.holder===null?undefined:w.characters.find(person=>person.id===object.holder);
 return object.lifecycle==='active'&&object.region===regionOf(c)&&object.knownTo.includes(c.id)&&canSee(w,c,object.region)&&(object.holder===null||!!holder&&regionOf(holder)===object.region);
}
export function retainPhysicalHistory(object:WorldObject,c:Character,minute:number,operation:string,priorHolder:string|null,permitted=hasObjectPermission(object,c.id)):void {
 const history=[...(object.physicalHistory||[]),{actorId:c.id,minute,operation,permitted,priorHolder}];
 object.physicalHistoryDropped=(object.physicalHistoryDropped||0)+Math.max(0,history.length-physicalEffectLimits.maxHistory);
 object.physicalHistory=history.slice(-physicalEffectLimits.maxHistory);
 if(!permitted)object.unpermittedCount=(object.unpermittedCount||0)+1;
}
export function effectReferenceId(effect:Effect):string {
 return effect.kind==='discover'?effect.objectIds[0]||effect.supplyIds[0]||effect.region:effect.kind==='schedule-natural'?effect.effects[0].target.id:effect.kind==='form'?effect.inputs[0].objectId:effect.kind==='change-state'?effect.target.id:'objectId' in effect?effect.objectId:'supplyId' in effect?effect.supplyId:effect.targetId;
}
export function effectReferenceIds(effect:Effect):string[] {
 return effect.kind==='discover'?[...effect.objectIds,...effect.supplyIds]:effect.kind==='schedule-natural'?[...new Set([...effect.conditions.map(condition=>condition.target.id),...effect.effects.map(change=>change.target.id)])]:effect.kind==='form'?effect.inputs.map(input=>input.objectId):[effectReferenceId(effect)];
}
export function effectSupplyReferenceIds(effect:Effect):string[]{return effect.kind==='discover'?effect.supplyIds:'supplyId' in effect?[effect.supplyId]:[];}
export class EffectValidationError extends Error {
 constructor(message:string, public readonly details:Record<string,unknown>) { super(message); }
}
// Only candidate-owned future supplies are discardable. A concrete identity
// remains a world fact even if its source is still marked pending.
export function discardPendingSupplies(world:World,ids:ReadonlySet<string>):void {
 if(!ids.size||!world.supplies)return;
 const materialized=new Set((world.objects||[]).map(object=>object.source));
 world.supplies=world.supplies.filter(supply=>!ids.has(supply.id)||!supply.pending||materialized.has(supply.id));
}

const materializedObjectId = (supply: SceneSupply) => `${supply.id}:${supply.background?.sequence??supply.remaining}`;
export function knownWorldObjects(w:World,c:Character){
 return (w.objects||[]).filter(o=>o.lifecycle==='active'&&(o.holder===c.id||o.knownTo.includes(c.id)&&canSee(w,c,o.region))).map(o=>({id:o.id,label:o.label,region:o.region,holder:o.holder,state:Object.fromEntries(Object.entries(o.state).filter(([key])=>o.stateExposure?.[key]!=='hidden')),kind:o.kind,...(o.quantity?{quantity:o.quantity}:{}),...(o.consumable===undefined?{}:{consumable:o.consumable})}));
}
export function knownWorldSupplies(w:World,c:Character){
 return (w.supplies||[]).filter(s=>!s.pending&&(s.availableAt===undefined||w.minute>=s.availableAt)&&s.knownTo.includes(c.id)&&canSee(w,c,s.region)).map(s=>({id:s.id,label:s.label,region:s.region,kind:s.kind,availability:'unknown' as const}));
}
export function authorityForProposal(w:World,c:Character,action?:Action){
 const local=regionOf(c),objectIds=new Set(objectObservationCandidates(w,c).filter(item=>item.region===local).map(item=>item.objectId)),supplyIds=new Set(supplyObservationCandidates(w,c).filter(item=>item.region===local).map(item=>item.supplyId));
 const eligibleObjects=(w.objects||[]).filter(object=>objectIds.has(object.id)||object.lifecycle==='active'&&object.holder===c.id)
  .map(object=>{const copy={...object};delete copy.physicalHistory;delete copy.physicalHistoryDropped;delete copy.unpermittedCount;return copy;});
 const eligibleSupplies=(w.supplies||[]).filter(supply=>supplyIds.has(supply.id)).map(supply=>({...supply,materializedObjectId:supply.remaining>0?materializedObjectId(supply):null}));
 // A bounded authority subset is explicit about omissions, never a complete
 // execution snapshot. Prefer the requested identity and actor's own objects.
 eligibleObjects.sort((a,b)=>Number(b.id===action?.target)-Number(a.id===action?.target)||Number(b.holder===c.id)-Number(a.holder===c.id));
 eligibleSupplies.sort((a,b)=>Number(b.id===action?.target)-Number(a.id===action?.target));
 const objects:WorldObject[]=[],supplies:(SceneSupply&{materializedObjectId:string|null})[]=[];
 let bytes=32;
 const retain=<T,>(source:T[],target:T[])=>{for(const item of source){const size=new TextEncoder().encode(JSON.stringify(item)).length+2;if(target.length<32&&bytes+size<=64*1024){target.push(item);bytes+=size;}}};
 retain(eligibleObjects,objects);retain(eligibleSupplies,supplies);
 return {explorationScope:{region:local,objectsOmitted:eligibleObjects.length-objects.length,suppliesOmitted:eligibleSupplies.length-supplies.length,complete:eligibleObjects.length===objects.length&&eligibleSupplies.length===supplies.length},external:{bodies:w.characters.filter(person=>regionOf(person)===local&&(person.id===c.id||canSee(w,c,regionOf(person)))).map(person=>({id:person.id,...worldTargetSnapshot(w,{type:'body',id:person.id})})),environment:worldTargetSnapshot(w,{type:'environment',id:local})},objects,supplies,effectContractVersion:'world-effects.v5',effectRules,effectContract:effectCandidateSchema};
}
function physicalPrimitive(effect:PhysicalEffect,c:Character):Exclude<Effect,PhysicalEffect|IngestEffect> {
 if(effect.operation==='materialize')return {kind:'materialize',supplyId:effect.supplyId,expectedRemaining:effect.expectedRemaining};
 if(effect.operation==='take'||effect.operation==='place')return {kind:'transfer',objectId:effect.objectId,expectedRevision:effect.expectedRevision,toHolder:effect.operation==='take'?c.id:null,toRegion:regionOf(c)};
 return {kind:effect.operation,objectId:effect.objectId,expectedRevision:effect.expectedRevision};
}
function applyEffects(w:World,c:Character,effects:Effect[],phaseIndex:number|null=null,nominalDueAt?:number,routineSourceScope?:RoutineSourceScope):string[]{
 const results:string[]=[];
 const previousIdentities=new Set((w.objects||[]).map(object=>object.id));
 for(const [effectIndex,original] of effects.entries()){
  const physical=original.kind==='physical';
  const e=physical?physicalPrimitive(original,c):original.kind==='ingest'?{kind:'consume' as const,objectId:original.objectId,expectedRevision:original.expectedRevision}:original;
  const fail:(reason:string,message:string)=>never=(reason,message)=>{
   const id=effectReferenceId(e);
   throw new EffectValidationError(message,{reason,phaseIndex,effectIndex,effect:original,actorRegion:regionOf(c),actual:structuredClone(w.objects?.find(o=>o.id===id)||w.supplies?.find(s=>s.id===id)||null)});
  };
  if(e.kind==='discover'){
   for(const id of e.supplyIds){const supply=w.supplies?.find(item=>item.id===id);if(supply?.pending){if(!canConfirmRoutineBackground(w,c,routineSourceScope,id))fail('background_discovery_scope','尚未確認的背景來源不能由這次查找建立。');delete supply.pending;}}

   const objects=new Set(objectObservationCandidates(w,c,e.objectIds).map(item=>item.objectId)),supplies=new Set(supplyObservationCandidates(w,c,e.supplyIds).map(item=>item.supplyId));
   if(e.region!==regionOf(c)||!canSee(w,c,e.region)||e.objectIds.some(id=>!objects.has(id)||w.objects?.find(object=>object.id===id)?.region!==e.region)||e.supplyIds.some(id=>!supplies.has(id)||w.supplies?.find(supply=>supply.id===id)?.region!==e.region))fail('discovery_scope','查找結果超出目前可接觸的範圍。');
   results.push('已查探目前可接觸的範圍');
  }else if(e.kind==='schedule-natural'){
   try{scheduleNaturalChange(w,c,e,nominalDueAt);}catch(error){fail('natural_precondition',error instanceof Error?error.message:'自然變化前提無效。');}
   results.push('已確認自然後續');
  }else if(e.kind==='form'||e.kind==='separate'){
   results.push(...applyFormation(e,{world:w,actor:c,hasPermission:hasObjectPermission,canReach:canPhysicallyReachObject,retainPhysical:retainPhysicalHistory,fail}));
  }else if(e.kind==='change-state'){
   const current=worldTargetSnapshot(w,e.target);
   if(!current||current.revision!==e.expectedRevision||current.region!==regionOf(c))fail('external_precondition','外在狀態前提無效。');
   if(e.target.type==='object'){
    const o=w.objects!.find(object=>object.id===e.target.id)!;
    if(!canPhysicallyReachObject(w,c,o)||e.access==='authorized'&&(!hasObjectPermission(o,c.id)||!(o.holder===c.id||o.holder===null)))fail('object_precondition','裁定物件前提無效。');
   }else if(e.target.type==='body'){
    if(e.target.id!==c.id&&!canSee(w,c,current.region))fail('body_precondition','目前無法接觸這個身體對象。');
   }else if(!canSee(w,c,current.region))fail('environment_precondition','目前無法接觸這個環境。');
   try{applyWorldStateChange(w,e.target,e.changes,'exposure' in e?e.exposure:undefined);}catch(error){fail('state_precondition',error instanceof Error?error.message:'外在狀態前提無效。');}
   if(e.target.type==='object'&&e.access==='physical'){const o=w.objects!.find(object=>object.id===e.target.id)!;retainPhysicalHistory(o,c,w.minute,'state',o.holder);}
   results.push('已進行這個步驟');
  }else if(e.kind==='displace-body'){
   const target=w.characters.find(person=>person.id===e.targetId),destination=regions.find(region=>region.id===e.toRegion);
   const door=connectingDoor(e.expectedRegion,e.toRegion);
   if(!target||!destination||regionOf(target)!==e.expectedRegion||regionOf(target)!==regionOf(c)||(target.physical?.revision||0)!==e.expectedRevision||target.id!==c.id&&!canSee(w,c,regionOf(target))||destination.location!==target.location||!door||(w.scene?.doors[door.id]||'open')!=='open')fail('body_displacement','目前無法把這個身體移到指定位置。');
   target.region=destination.id;target.location=destination.location;
   target.physical={revision:e.expectedRevision+1,state:{...target.physical?.state},exposure:{...target.physical?.exposure}};
   for(const object of w.objects||[])if(object.lifecycle==='active'&&object.holder===target.id){object.region=destination.id;object.revision++;}
   results.push('身體外在位置已改變');
  }else if(e.kind==='materialize'){
   const s=w.supplies?.find(s=>s.id===e.supplyId);
   if(!s||s.remaining!==e.expectedRemaining||!Number.isSafeInteger(s.remaining)||s.remaining<=0||(s.pending&&(physical||phaseIndex===null))||(s.availableAt!==undefined&&w.minute<s.availableAt)||!s.knownTo.includes(c.id)||!physical&&!s.allowedTo.includes(c.id)||s.region!==regionOf(c)||physical&&!canSee(w,c,s.region))fail('supply_precondition','裁定供應前提無效。');
   if(!validQuantity(s.quantity??{amount:1,unit:'item'})||s.consumable!==undefined&&typeof s.consumable!=='boolean')fail('quantity_precondition','供應份量或消耗能力無法安全承接。');
   if(!validObjectKind(s.kind))fail('object_kind','物件種類超出有界資料契約。');
   if((w.objects?.length||0)>=512)fail('object_capacity','具體物件已達保存容量。');
   const id=materializedObjectId(s);
   if(w.objects?.some(o=>o.id===id))fail('identity_used','供應身份已被使用。');
   const o:WorldObject={id,source:s.id,sources:[{type:'supply',id:s.id,revision:null,amount:s.quantity?.amount??1,unit:s.quantity?.unit??'item',owner:s.owner}],quantity:{...(s.quantity??{amount:1,unit:'item'})},consumable:s.consumable??s.kind==='food',formation:{operation:'materialize',at:w.minute,inputs:[s.id]},...(s.coOwners?{coOwners:[...s.coOwners]}:{}),label:s.label,region:s.region,holder:c.id,owner:s.owner,revision:1,state:{...s.initialState},...(s.stateExposure?{stateExposure:{...s.stateExposure}}:{}),lifecycle:'active',kind:s.kind,knownTo:[...s.knownTo],allowedTo:[...s.allowedTo],...(s.stateTransitions?{stateTransitions:structuredClone(s.stateTransitions)}:{})};
   if(physical)retainPhysicalHistory(o,c,w.minute,'materialize',null,hasObjectPermission(s,c.id));
   (w.objects??=[]).push(o);delete s.pending;if(s.background)s.background.sequence++;else s.remaining--;results.push(`取得${o.label}`);
  }else if(e.kind==='grant'){
   const target=w.objects?.find(o=>o.id===e.targetId)||w.supplies?.find(s=>s.id===e.targetId);
   const recipient=w.characters.find(x=>x.id===e.recipient);
   if(!target||!target.knownTo.includes(c.id)||!canSee(w,c,target.region)||target.owner!==c.id||('coOwners' in target&&(target.coOwners?.length||0)>1)||target.region!==regionOf(c)||!recipient||!canSee(w,c,regionOf(recipient))||('lifecycle' in target&&target.lifecycle!=='active'))fail('owner_consent','無權代替所有者同意。');
   if(!target.allowedTo.includes(recipient.id))target.allowedTo.push(recipient.id);
   if(!target.knownTo.includes(recipient.id))target.knownTo.push(recipient.id);
   results.push(`同意 ${recipient.name} 使用${target.label}`);
  }else if(e.kind==='consent'){
   const o=w.objects?.find(o=>o.id===e.objectId);
   if(!o||o.lifecycle!=='active'||!o.knownTo.includes(c.id)||!canSee(w,c,o.region)||!o.allowedTo.includes(c.id))fail('receiving_consent','無法同意接收未知或未獲准物件。');
   o.acceptedBy=[...new Set([...(o.acceptedBy||[]),c.id])];results.push(`同意接收${o.label}`);
  }else{
   const o=w.objects?.find(o=>o.id===e.objectId);
   if(!o||o.revision!==e.expectedRevision||(physical?!canPhysicallyReachObject(w,c,o):o.lifecycle!=='active'||o.region!==regionOf(c)||!hasObjectPermission(o,c.id)||!(o.holder===c.id||o.holder===null&&o.knownTo.includes(c.id)&&canSee(w,c,o.region))))fail('object_precondition','裁定物件前提無效。');
   const priorHolder=o.holder;
   if(e.kind==='consume'){
    if(!(o.consumable??o.kind==='food')||o.holder!==c.id)fail('not_consumable','不能食用這件物品。');
    o.lifecycle='consumed';o.holder=null;if(o.quantity)o.quantity.amount=0;
    if(original.kind==='ingest')changeBodyNeeds(c,w.minute,{hunger:-original.hungerRelief,thirst:-original.thirstRelief},`實際攝取 ${o.id}`);
    results.push(`食用${o.label}`);
   }else if(e.kind==='destroy'){
    if(!physical&&o.owner!==c.id)fail('not_owned','不能毀壞借來的物品。');
    o.lifecycle='destroyed';o.holder=null;if(o.quantity)o.quantity.amount=0;results.push(physical?`${o.label}已損毀`:`處理了已損毀的${o.label}`);
   }else if(e.kind==='state'){
    if(!o.stateTransitions?.[e.key]?.includes(e.value)||o.state[e.key]===e.value)fail('state_transition','物件不支援這個狀態轉換。');
    o.state[e.key]=e.value;results.push(o.stateExposure?.[e.key]==='hidden'?'已進行這個步驟':`${o.label}：${e.key}=${e.value}`);
   }else{
    if(physical&&o.holder===e.toHolder)fail('unchanged_holder','物件已由該持有人持有。');
    if(e.toRegion!==regionOf(c)||!regions.some(r=>r.id===e.toRegion))fail('remote_transfer','不能跨地點遠端轉移物件。');
    if(e.toHolder!==null&&e.toHolder!==c.id){
     const recipient=w.characters.find(x=>x.id===e.toHolder);
     if(!recipient||regionOf(recipient)!==e.toRegion||!o.allowedTo.includes(recipient.id)||!o.acceptedBy?.includes(recipient.id))fail('recipient_consent','對方尚未同意接收。');
     o.acceptedBy=o.acceptedBy.filter(id=>id!==recipient.id);
    }
    o.holder=e.toHolder;o.region=e.toRegion;results.push(physical?`${o.label}的實際持有位置已改變`:`${o.label}${e.toHolder?'已交付持有人':'留在現場'}`);
   }
   o.revision++;
   if(physical)retainPhysicalHistory(o,c,w.minute,original.operation,priorHolder);

  }
 }
 // A linked serving is a concrete identity inside its vessel. Validate the
 // complete batch so explicit, separately authorized transfers can move both;
 // never manufacture an implicit transfer or recipient consent.
 const touched=new Set([...effects.flatMap(effect=>[...effectReferenceIds(effect),...(effect.kind==='form'?effect.outputs.map(output=>output.id):effect.kind==='separate'?[effect.outputId]:[])]),...(w.objects||[]).filter(object=>!previousIdentities.has(object.id)).map(object=>object.id)]);
 const problem=worldObjectContinuityProblem(w,touched);
 if(problem)throw new EffectValidationError(problem.message,{reason:'vessel_continuity',phaseIndex,objectId:problem.objectId});
 invalidateNaturalChanges(w);
 return results;
}
function canonical(value:unknown):unknown {return Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,val])=>[key,canonical(val)])):value;}
function abilityAdvantage(c:Character,ability:string):Advantage {
 const tags=(c.abilityTags||[]).filter(tag=>tag.replace(/^(非常擅長|非常不擅長|不擅長|擅長)/,'')===ability);
 return tags.some(t=>t.startsWith('非常不擅長'))?-4:tags.some(t=>t.startsWith('不擅長'))?-2:tags.some(t=>t.startsWith('非常擅長'))?4:tags.some(t=>t.startsWith('擅長'))?2:0;
}
// The first validated attempt freezes the relevant physical scope. A later
// candidate cannot obtain a new die by appending unrelated effect references.
function branchResolution(w:World,c:Character,candidate:EffectCandidate,action:Action):Resolution {
 const target=w.objects?.find(o=>o.id===action.target)||w.supplies?.find(s=>s.id===action.target);
 const person=w.characters.find(person=>person.id===action.target),environment=regions.find(region=>region.id===action.target);
 const localPerson=!!person&&regionOf(person)===regionOf(c)&&(person.id===c.id||canSee(w,c,regionOf(person)));
 const localEnvironment=!!environment&&environment.id===regionOf(c)&&canSee(w,c,environment.id);
 if(!candidate.trialBinding&&(!(target&&target.knownTo.includes(c.id)&&target.region===regionOf(c))&&!localPerson&&!localEnvironment))throw new EffectValidationError('不確定活動需要當前可知的具體對象。',{reason:'branch_subject'});
 const scope=JSON.stringify(['results.v1',c.id,candidate.trialBinding?['routine',candidate.trialBinding.operation,candidate.trialBinding.subject]:['free',action.target]]);
 const refs=new Set<string>(target?[target.id]:[]),external=new Map<string,{type:'body'|'environment';id:string;keys:Set<string>}>();
 const rememberExternal=(type:'body'|'environment',id:string,keys:string[])=>{const key=type+':'+id,entry=external.get(key)||{type,id,keys:new Set<string>()};for(const item of keys)entry.keys.add(item);external.set(key,entry);};
 if(localPerson)rememberExternal('body',person!.id,[]);else if(localEnvironment)rememberExternal('environment',environment!.id,[]);
 for(const branch of candidate.branches||[]){
  for(const effect of [...branch.effects,...branch.stages.flatMap(stage=>stage.effects)]){
   if(effect.kind==='change-state'&&effect.target.type!=='object')rememberExternal(effect.target.type,effect.target.id,effect.changes.map(change=>change.key));
   else if(effect.kind==='displace-body')rememberExternal('body',effect.targetId,[]);
   else for(const id of effectReferenceIds(effect))refs.add(id);
  }
  for(const stage of branch.stages)for(const condition of stage.preconditions){
   if('target' in condition&&condition.target.type!=='object')rememberExternal(condition.target.type,condition.target.id,condition.state.map(entry=>entry.key));
   else refs.add('target' in condition?condition.target.id:condition.objectId);
  }
 }
 for(const item of external.values())refs.add(JSON.stringify({external:item.type,id:item.id,keys:[...item.keys].sort()}));
 const externalReference=(id:string):{external:'body'|'environment';id:string;keys:string[]}|undefined=>{try{const ref=JSON.parse(id);return ref&&['body','environment'].includes(ref.external)&&typeof ref.id==='string'&&Array.isArray(ref.keys)?ref:undefined;}catch{return;}};
 const currentRefs=[...refs].filter(id=>{const ref=externalReference(id);return ref?!!worldTargetSnapshot(w,{type:ref.external,id:ref.id}):w.objects?.some(o=>o.id===id)||w.supplies?.some(s=>s.id===id);}).sort();
 let frozen=candidate.trialBinding?.references||w.branchTrialScopes?.[scope]||currentRefs;
 const facts=(references:string[])=>references.map(id=>{
  let routine:{routineTarget:{type:'object'|'supply'|'body'|'environment';id:string};keys:string[]}|undefined;try{const value=JSON.parse(id);if(value.routineTarget&&Array.isArray(value.keys))routine=value;}catch{/* Legacy plain identity. */}
  if(routine){const target=routine.routineTarget,object=w.objects?.find(value=>value.id===target.id),supply=w.supplies?.find(value=>value.id===target.id),snapshot=target.type==='supply'?null:worldTargetSnapshot(w,{type:target.type,id:target.id});const state=target.type==='supply'?supply?.initialState:snapshot?.state;return {id,region:target.type==='supply'?supply?.region:snapshot?.region,...(target.type==='object'?{source:object?.source,holder:object?.holder,lifecycle:object?.lifecycle,quantity:object?.quantity,allowed:object&&hasObjectPermission(object,c.id)}:target.type==='supply'?{remaining:supply?.remaining,sequence:supply?.background?.sequence,quantity:supply?.quantity,allowed:supply?.allowedTo.includes(c.id)}:{}),state:routine.keys.map(key=>({key,value:state&&Object.hasOwn(state,key)?state[key]:null})),missing:!state};}
 const ref=externalReference(id);if(ref){const current=worldTargetSnapshot(w,{type:ref.external,id:ref.id});return current?{id,region:current.region,state:ref.keys.map(key=>({key,value:Object.hasOwn(current.state,key)?current.state[key]:null}))}:{id,missing:true};}
  const o=w.objects?.find(o=>o.id===id),s=w.supplies?.find(s=>s.id===id);
  return o?{id:o.id,source:o.source,region:o.region,holder:o.holder,owner:o.owner,coOwners:o.coOwners,quantity:o.quantity,consumable:o.consumable,state:o.state,lifecycle:o.lifecycle,allowed:hasObjectPermission(o,c.id)}:s?{id:s.id,region:s.region,owner:s.owner,remaining:s.remaining,sequence:s.background?.sequence,state:s.initialState,allowed:s.allowedTo.includes(c.id)}:{id,missing:true};
 });
 const identity=(references:string[])=>JSON.stringify(canonical([scope,regionOf(c),[...(c.abilityTags||[])].sort(),[...(c.craftInsights||[])].sort(),facts(references)]));
 let key=identity(frozen),prior=w.freeTrials?.[key];
 // Only after a trusted fact in the frozen footprint really changed may a new
 // attempt bind its current material unit. Mere branch/reference edits cannot.
 if(!prior&&!candidate.trialBinding){frozen=currentRefs;key=identity(frozen);prior=w.freeTrials?.[key];}
 if(!prior&&Object.keys(w.freeTrials||{}).length>=128)throw Error('行動判定保存已達上限，本回合未進行新的判定。');
 const result=prior||judgeD20(rollD20(),abilityAdvantage(c,candidate.check!.ability),candidate.check!.difficulty);
 if(!prior){if(!candidate.trialBinding)(w.branchTrialScopes??={})[scope]=frozen;(w.freeTrials??={})[key]=result;record(w,c.id,`${c.name} 嘗試目前的方法。`,'attempt',[c.id],undefined,result);w.events.at(-1)!.attemptKey=key;}
 return result;
}
export function validateResultBranches(w:World,c:Character,candidate:EffectCandidate):void {
 for(const branch of candidate.branches||[]){const clone=structuredClone(w),actor=clone.characters.find(actor=>actor.id===c.id)!;commitFreeAction(clone,actor,{...candidate,branches:undefined,check:null,effects:branch.effects,stages:branch.stages},undefined,{validateOnly:true});}
}
// Generated feedback is an explicit excerpt, never truncation of an existing
// memory. Preserve the original event's public summary and mechanical evidence.
function feedbackExcerpt(text:string):string {
 const encoder=new TextEncoder(),limit=4096;
 if(encoder.encode(text).length<=limit)return text;
 const omitted='［行動回饋超出容量，後續內容省略］';
 let excerpt='',bytes=encoder.encode(omitted).length;
 for(const character of text){const size=encoder.encode(character).length;if(bytes+size>limit)break;excerpt+=character;bytes+=size;}
 return excerpt+omitted;
}
// A result is an actor experience, not a second knowledge store. Keep the
// proposal association in the existing bounded short-term memory/event channel.
// Only the existing NPC projection is consulted; authority reasons, inventory
// counters, permission lists and private decision traces are never sources.
export function recordActionResult(w:World,c:Character,action:Action|undefined,summary:string,kind:string,scene?:import('./world').WorldEvent['scene'],resolution?:Resolution):void {
 const label=action?`${action.type} ${action.target||''} ${action.content||''}`.trim().slice(0,240):'先前活動';
 const relevant=knownWorldObjects(w,c).filter(object=>object.id===action?.target||object.holder===c.id||action?.type==='work'&&action.target==='tea'&&object.kind==='utensil').slice(0,4);
 let state='';
 for(const object of relevant){
  const entry=`${object.label.slice(0,80)} [${object.id}]：${JSON.stringify(object.state)}`;
  if(new TextEncoder().encode(state+entry).length<=1024)state+=(state?'；':'')+entry;
 }
 const context=relevant.some(object=>object.kind==='utensil'&&object.state.condition==='broken')?' 已知的器具已損壞。':'';
 c.activity=summary+context;
 const text=feedbackExcerpt(`${c.name} 行動回饋（原提案，非已發生成果：${label}${c.plan?`；活動始於 ${c.plan.startedAt}`:''}；世界時間 ${w.minute}）：${c.activity}${state?` 依本次已知物件：${state}。`:''}`);
 record(w,c.id,scene&&kind!=='blocked'?`${c.name} ${summary}`:text,kind,[c.id],scene,resolution,text);
}
export function commitFreeAction(w:World,c:Character,candidate:EffectCandidate,action?:Action,context?:{nominalDueAt?:number;validateOnly?:boolean}):boolean{
 if(candidate.branches){
  validateResultBranches(w,c,candidate);
  if(!action)throw Error('結果分支缺少活動對象。');
  const resolution=candidate.check?branchResolution(w,c,candidate,action):undefined;
  const branchIndex=resolution?candidate.branches.findIndex(branch=>branch.outcomes.includes(resolution.outcome)):0;
  const branch=candidate.branches[branchIndex];
  candidate.selectedResult={outcome:resolution?.outcome||null,...(resolution?{resolution}:{}),branch:branchIndex};
  candidate.effects=branch.effects;candidate.stages=branch.stages;candidate.check=null;
  const used=new Set([...branch.effects,...branch.stages.flatMap(stage=>stage.effects)].flatMap(effectSupplyReferenceIds));
  const unselected=new Set((candidate.pendingResultSupplies||[]).filter(id=>!used.has(id)));
  discardPendingSupplies(w,unselected);
  delete candidate.branches;
 }

 if(candidate.status!=='accepted'){
  // blockedReason remains an observer diagnostic: even program-derived reasons
  // can depend on hidden stock or grants. Only actor-known grounds may leave it.
  const summary=candidate.knownBlockedReason||(candidate.status==='denied'
   ?'這次方法沒有成功，尚未執行，沒有新增成果。未確認本次受阻的原因；方法或已知條件實質改變後可再提出。是否等待、重試或換方法由自己決定。'
   :'目前的方法無法落實：這種效果目前無法承接，尚未執行，沒有新增成果。方法或已知條件實質改變後可再提出，僅改措辭不算改變。是否等待、重試或換方法由自己決定。');
  recordActionResult(w,c,action,summary,'blocked');return false;
 }
 const existingObjects=new Map((w.objects||[]).map(object=>[object.id,object.lifecycle]));
 const validateResultTime=(snapshot:World,afterMinutes:number)=>{
  // Only the routine factory can mark its verified raw-material supplies as
  // preparation. Consuming a generic completed product early is still a result.
  const completedFood=(object:WorldObject)=>{
   if(object.kind!=='food')return false;
   const newProduct=!existingObjects.has(object.id);
   const terminalChange=object.lifecycle!=='active'&&existingObjects.get(object.id)!==object.lifecycle;
   const rawPreparation=object.lifecycle==='consumed'&&candidate.preparationSupplies?.includes(object.source);
   return (newProduct||terminalChange)&&!rawPreparation;
  };
  if(candidate.confirmedDurationMinutes!==undefined&&afterMinutes<candidate.confirmedDurationMinutes&&snapshot.objects?.some(completedFood))throw new EffectValidationError('完整食物成果不能早於確認完成時間。',{reason:'completion_result_time'});
 };
 // Validate complete effects on a copy before randomness or any world mutation.
 const clone=structuredClone(w),actor=clone.characters.find(x=>x.id===c.id)!;
 const results=applyEffects(clone,actor,candidate.effects,null,context?.nominalDueAt);
 validateResultTime(clone,15);
 const predicted=structuredClone(clone),predictedActor=predicted.characters.find(x=>x.id===c.id)!;
 for(const [phaseIndex,phase] of (candidate.stages||[]).entries()){
  try{
   if(phase.effects.some(e=>e.kind==='transfer'&&e.toHolder!==null&&e.toHolder!==c.id))throw Error('階段需要接收者新的選擇。');
   predicted.minute=Math.max(predicted.minute,w.minute+phase.afterMinutes);
   checkPhase(predicted,predictedActor,phase);applyEffects(predicted,predictedActor,phase.effects,phaseIndex,undefined,phase.routineSourceScope);validateResultTime(predicted,phase.afterMinutes);
  }catch(error){
   if(error instanceof EffectValidationError)throw error;
   throw new EffectValidationError(error instanceof Error?error.message:'活動階段前提無效。',{reason:'phase_precondition',phaseIndex,preconditions:phase.preconditions,actual:phase.preconditions.map(p=>'target' in p?worldTargetSnapshot(predicted,p.target):predicted.objects?.find(o=>o.id===p.objectId)||null)});
  }
 }
 let resolution=candidate.selectedResult?.resolution;
 if(candidate.check){
  const allEffects=[...candidate.effects,...(candidate.stages||[]).flatMap(stage=>stage.effects)];
  const references=new Set(allEffects.flatMap(effectReferenceIds));
  for(const stage of candidate.stages||[])for(const p of stage.preconditions)references.add('target' in p?p.target.id:p.objectId);
  const conditions=[...references].sort().map(id=>w.objects?.find(o=>o.id===id)||w.supplies?.find(s=>s.id===id)||null);
  const phases=(candidate.stages||[]).map(stage=>({preconditions:stage.preconditions,effects:stage.effects}));
  const key=JSON.stringify(canonical(['free',c.id,regionOf(c),[...(c.abilityTags||[])].sort(),candidate.effects,phases,conditions]));
  const prior=w.freeTrials?.[key];
  if(!prior&&Object.keys(w.freeTrials||{}).length>=128)throw Error('行動判定保存已達上限，本回合未進行新的判定。');
  resolution=prior||judgeD20(rollD20(),abilityAdvantage(c,candidate.check.ability),candidate.check.difficulty);
  if(!prior){(w.freeTrials??={})[key]=resolution;record(w,c.id,`${c.name} 嘗試目前的方法。`,'attempt',[c.id],undefined,resolution);w.events.at(-1)!.attemptKey=key;}
  if(!['success','critical-success'].includes(resolution.outcome)){recordActionResult(w,c,action,'嘗試尚未完成，這次沒有新增成果。','blocked');return false;}
 }
 commitWorldChanges(w,clone);
 emitExternalConsequences(w,c.id,candidate.effects);
 const summary=(results.join('，')||(candidate.stages?.length?'開始進行這項活動':'這次步驟已執行，沒有新增可知成果'))+(candidate.stages?.length?'；活動尚未完成。':'');
 const here=regionOf(c);
 recordActionResult(w,c,action,summary,'work',{from:c.location,to:c.location,fromRegion:here,toRegion:here},resolution);
 if(!context?.validateOnly)commitDiscoveries(w,c,candidate.effects);
 return true;
}

function checkPhase(w:World,c:Character,phase:ActivityPhase):void{
 if(phase.routineBindings){if(!routineBindingsHold(w,phase.routineBindings))throw Error('日常活動的物理前提已改變。');phase.effects=rebindRoutineEffects(w,phase.effects);}
 // Internal routine plans retain tools separately from their result vessel.
 // They remain local, known and authorized at every scheduled phase.
 for(const id of phase.requiredTools||[]){
  const tool=w.objects?.find(o=>o.id===id);
  if(!tool||!usableRoutineObject(tool,c.id)||tool.region!==regionOf(c)||!tool.knownTo.includes(c.id))throw Error('活動工具已不可使用。');
 }
 for(const p of phase.preconditions){
  if('target' in p){
   const snapshot=worldTargetSnapshot(w,p.target);
   const known=p.target.type!=='object'||w.objects?.some(o=>o.id===p.target.id&&o.knownTo.includes(c.id));
   if(!snapshot||snapshot.region!==regionOf(c)||!known||p.target.type==='body'&&p.target.id!==c.id&&!canSee(w,c,snapshot.region)||p.target.type!=='body'&&!canSee(w,c,snapshot.region)||!stateConditionsHold(w,[p]))throw Error('活動外在條件已改變。');
   continue;
  }
  const o=w.objects?.find(o=>o.id===p.objectId);
  if(!o||o.lifecycle!=='active'||o.revision!==p.revision||o.region!==p.region||o.holder!==p.holder||Object.entries(p.state).some(([k,v])=>o.state[k]!==v))throw Error('活動前提已改變。');
  if(o.state.condition==='broken'&&phase.effects.some(e=>e.kind==='state'&&e.objectId===o.id&&e.key==='contents'))throw Error('活動器具已損壞。');
 }
 if(phase.effects.some(e=>e.kind==='grant'||e.kind==='consent'))throw Error('活動需要新的角色選擇。');
 if(c.plan?.phases&&regionOf(c)!==c.plan.phases.origin)throw Error('角色已離開活動場景。');
}
// Revalidate a resumed plan without committing consequences, observations or
// randomness. The full copy also isolates routine rebinding's phase mutations.
export function remainingActivityConditionsHold(w:World,c:Character,plan:ActivityPlan):boolean {
 const predicted=structuredClone(w),actor=predicted.characters.find(value=>value.id===c.id)!;
 actor.plan=structuredClone(plan);
 const phases=actor.plan.phases;
 if(!phases)return true;
 try{
  for(let index=phases.cursor;index<phases.stages.length;index++){
   const phase=phases.stages[index];
   predicted.minute=Math.max(predicted.minute,actor.plan.startedAt+phase.afterMinutes);
   checkPhase(predicted,actor,phase);
   applyEffects(predicted,actor,phase.effects,index,actor.plan.startedAt+phase.afterMinutes,phase.routineSourceScope);
  }
  return true;
 }catch{return false;}
}

// Validate and commit one phase as a batch; lifecycle owns the phase cursor.
export function commitActivityPhase(w:World,c:Character,phase:ActivityPhase,index:number,options?:{validateOnly?:boolean}):string[] {
 const clone=structuredClone(w),actor=clone.characters.find(character=>character.id===c.id)!;
 checkPhase(clone,actor,phase);
 const results=applyEffects(clone,actor,phase.effects,index,c.plan?c.plan.startedAt+phase.afterMinutes:undefined,phase.routineSourceScope);
 commitWorldChanges(w,clone);
 recordCommittedRoutinePremises(w,c,phase.routineSourceScope);
 emitExternalConsequences(w,c.id,phase.effects);
 if(!options?.validateOnly)commitDiscoveries(w,c,phase.effects);
 return results;
}

function commitDiscoveries(w:World,c:Character,effects:Effect[]):void {
 const discoveries=effects.filter((effect):effect is DiscoverEffect=>effect.kind==='discover');
 if(!discoveries.length)return;
 const region=regionOf(c);
 record(w,c.id,`${c.name} 實際查探了目前可接觸的範圍。`,'observe',[c.id],{from:c.location,to:c.location,fromRegion:region,toRegion:region,target:region,content:'sight'});
 discoverWorldResources(w,c,w.events.at(-1)!,[...new Set(discoveries.flatMap(effect=>effect.objectIds))],[...new Set(discoveries.flatMap(effect=>effect.supplyIds))]);
}

// Only external sensory facts leave the authority batch; reasons stay in receipts.
export function emitExternalConsequences(w:World,actorId:string,effects:Effect[]):void {
 const externalChanges:ExternalConsequence[]=effects.flatMap(e=>e.kind==='displace-body'?[{target:{type:'body' as const,id:e.targetId},changes:[{key:'位置',value:regions.find(region=>region.id===e.toRegion)?.name||e.toRegion}],exposure:'public' as const,movement:{fromRegion:e.expectedRegion,toRegion:e.toRegion}}]:e.kind==='change-state'&&(e.target.type!=='object'||actorId==='world')?[{target:e.target,changes:e.changes.map(({key,value})=>({key,value})),...('exposure' in e?{exposure:e.exposure}:{})}]:[]);
 if(!externalChanges.length)return;
 const actor=w.characters.find(c=>c.id===actorId),region=actor?regionOf(actor):externalChanges.find(change=>change.target.type==='environment')?.target.id;
 record(w,actorId,actorId==='world'?'已確認的自然變化發生。':'外在狀況發生變化。',actorId==='world'?'natural':'external',[],{from:actor?.location||'',to:actor?.location||'',fromRegion:region,toRegion:region,externalChanges});
}
