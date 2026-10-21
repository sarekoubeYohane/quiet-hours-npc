import { effectCandidateSchema, effectRules } from './adjudication-contract';
export { effectCandidateSchema, effectSchema, parseEffectCandidate, scheduleCompletionMinutes } from './adjudication-contract';
import type { Action, Character, World } from './world';
import { canSee, regionOf, regions } from './perception';
import { record } from './world';
import { usableRoutineObject } from './routine-materials';
import { judgeD20, rollD20, type Difficulty, type Advantage, type Outcome, type Resolution } from './d20';

// Legacy tea changes physical objects too; it must use the same verified effects.
export function requiresWorldEffects(action: Action): boolean {
 return action.type === 'propose' || action.type === 'work' && action.target === 'tea';
}

export type SceneSupply={pending?:boolean;availableAt?:number;background?:{ruleId:string;sequence:number};id:string;label:string;region:string;remaining:number;owner:string;knownTo:string[];allowedTo:string[];kind:'food'|'utensil';initialState:Record<string,string>;stateTransitions?:Record<string,string[]>};
export type WorldObject={id:string;source:string;label:string;region:string;holder:string|null;owner:string;revision:number;state:Record<string,string>;lifecycle:'active'|'consumed'|'destroyed';kind:'food'|'utensil';knownTo:string[];allowedTo:string[];stateTransitions?:Record<string,string[]>;acceptedBy?:string[]};
export type Effect={kind:'materialize';supplyId:string;expectedRemaining:number}|{kind:'consume';objectId:string;expectedRevision:number}|{kind:'destroy';objectId:string;expectedRevision:number}|{kind:'transfer';objectId:string;expectedRevision:number;toHolder:string|null;toRegion:string}|{kind:'state';objectId:string;expectedRevision:number;key:string;value:string}|{kind:'grant';targetId:string;recipient:string}|{kind:'consent';objectId:string};
export type PhaseCondition={objectId:string;revision:number;region:string;holder:string|null;state:Record<string,string>};
export type ActivityPhase={afterMinutes:number;preconditions:PhaseCondition[];effects:Effect[];requiredTools?:string[]};
export type ResultBranch={outcomes:Outcome[];effects:Effect[];stages:ActivityPhase[]};
// Internal only: a trusted routine binder can identify each current vessel/material
// attempt without storing model-authored IDs or the first historical die in a rule.
export type TrialBinding={operation:import('./routine-rules').RoutineOperation;subject:string;references:string[]};
export type SelectedResult={outcome:Outcome|null;resolution?:Resolution;branch:number};
export type EffectCandidate={pendingResultSupplies?:string[];branches?:ResultBranch[];selectedResult?:SelectedResult;trialBinding?:TrialBinding;preparationSupplies?:string[];confirmedDurationMinutes?:number;blockedReason?:string;stages?:ActivityPhase[];status:'accepted'|'denied'|'unsupported';effects:Effect[];check:{difficulty:Difficulty;ability:string}|null};
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
 return (w.objects||[]).filter(o=>o.lifecycle==='active'&&(o.holder===c.id||o.knownTo.includes(c.id)&&canSee(w,c,o.region))).map(o=>({id:o.id,label:o.label,region:o.region,holder:o.holder,state:o.state,revision:o.revision,kind:o.kind}));
}
export function knownWorldSupplies(w:World,c:Character){
 return (w.supplies||[]).filter(s=>!s.pending&&(s.availableAt===undefined||w.minute>=s.availableAt)&&s.knownTo.includes(c.id)&&canSee(w,c,s.region)).map(s=>({id:s.id,label:s.label,region:s.region,kind:s.kind}));
}
export function authorityForProposal(w:World,c:Character){
 const objects=knownWorldObjects(w,c).map(o=>w.objects!.find(full=>full.id===o.id)!);
 const supplies=knownWorldSupplies(w,c).map(s=>w.supplies!.find(full=>full.id===s.id)!);
 return {objects,supplies:supplies.map(s=>({...s,materializedObjectId:s.remaining>0?materializedObjectId(s):null})),effectContractVersion:'world-effects.v3',effectRules,effectContract:effectCandidateSchema};
}
function applyEffects(w:World,c:Character,effects:Effect[],phaseIndex:number|null=null):string[]{
 const results:string[]=[];
 for(const [effectIndex,e] of effects.entries()){
  const fail:(reason:string,message:string)=>never=(reason,message)=>{
   const id='objectId' in e?e.objectId:'supplyId' in e?e.supplyId:e.targetId;
   throw new EffectValidationError(message,{reason,phaseIndex,effectIndex,effect:e,actorRegion:regionOf(c),actual:structuredClone(w.objects?.find(o=>o.id===id)||w.supplies?.find(s=>s.id===id)||null)});
  };
  if(e.kind==='materialize'){
   const s=w.supplies?.find(s=>s.id===e.supplyId);
   if(!s||s.remaining!==e.expectedRemaining||!Number.isSafeInteger(s.remaining)||s.remaining<=0||(s.pending&&phaseIndex===null)||(s.availableAt!==undefined&&w.minute<s.availableAt)||!s.knownTo.includes(c.id)||!s.allowedTo.includes(c.id)||s.region!==regionOf(c))fail('supply_precondition','裁定供應前提無效。');
   if((w.objects?.length||0)>=512)fail('object_capacity','具體物件已達保存容量。');
   const id=materializedObjectId(s);
   if(w.objects?.some(o=>o.id===id))fail('identity_used','供應身份已被使用。');
   const o:WorldObject={id,source:s.id,label:s.label,region:s.region,holder:c.id,owner:s.owner,revision:1,state:{...s.initialState},lifecycle:'active',kind:s.kind,knownTo:[...s.knownTo],allowedTo:[...s.allowedTo],...(s.stateTransitions?{stateTransitions:structuredClone(s.stateTransitions)}:{})};
   (w.objects??=[]).push(o);delete s.pending;if(s.background)s.background.sequence++;else s.remaining--;results.push(`取得${o.label}`);
  }else if(e.kind==='grant'){
   const target=w.objects?.find(o=>o.id===e.targetId)||w.supplies?.find(s=>s.id===e.targetId);
   const recipient=w.characters.find(x=>x.id===e.recipient);
   if(!target||!target.knownTo.includes(c.id)||!canSee(w,c,target.region)||target.owner!==c.id||target.region!==regionOf(c)||!recipient||!canSee(w,c,regionOf(recipient))||('lifecycle' in target&&target.lifecycle!=='active'))fail('owner_consent','無權代替所有者同意。');
   if(!target.allowedTo.includes(recipient.id))target.allowedTo.push(recipient.id);
   if(!target.knownTo.includes(recipient.id))target.knownTo.push(recipient.id);
   results.push(`同意 ${recipient.name} 使用${target.label}`);
  }else if(e.kind==='consent'){
   const o=w.objects?.find(o=>o.id===e.objectId);
   if(!o||o.lifecycle!=='active'||!o.knownTo.includes(c.id)||!canSee(w,c,o.region)||!o.allowedTo.includes(c.id))fail('receiving_consent','無法同意接收未知或未獲准物件。');
   o.acceptedBy=[...new Set([...(o.acceptedBy||[]),c.id])];results.push(`同意接收${o.label}`);
  }else{
   const o=w.objects?.find(o=>o.id===e.objectId);
   if(!o||o.revision!==e.expectedRevision||o.lifecycle!=='active'||o.region!==regionOf(c)||!(o.owner===c.id||o.allowedTo.includes(c.id))||!(o.holder===c.id||o.holder===null&&o.knownTo.includes(c.id)&&canSee(w,c,o.region)))fail('object_precondition','裁定物件前提無效。');
   if(e.kind==='consume'){
    if(o.kind!=='food'||o.holder!==c.id)fail('not_consumable','不能食用這件物品。');
    o.lifecycle='consumed';o.holder=null;results.push(`食用${o.label}`);
   }else if(e.kind==='destroy'){
    if(o.owner!==c.id)fail('not_owned','不能毀壞借來的物品。');
    o.lifecycle='destroyed';o.holder=null;results.push(`處理了已損毀的${o.label}`);
   }else if(e.kind==='state'){
    if(!o.stateTransitions?.[e.key]?.includes(e.value)||o.state[e.key]===e.value)fail('state_transition','物件不支援這個狀態轉換。');
    o.state[e.key]=e.value;results.push(`${o.label}：${e.key}=${e.value}`);
   }else{
    if(e.toRegion!==regionOf(c)||!regions.some(r=>r.id===e.toRegion))fail('remote_transfer','不能跨地點遠端轉移物件。');
    if(e.toHolder!==null&&e.toHolder!==c.id){
     const recipient=w.characters.find(x=>x.id===e.toHolder);
     if(!recipient||regionOf(recipient)!==e.toRegion||!o.allowedTo.includes(recipient.id)||!o.acceptedBy?.includes(recipient.id))fail('recipient_consent','對方尚未同意接收。');
     o.acceptedBy=o.acceptedBy.filter(id=>id!==recipient.id);
    }
    o.holder=e.toHolder;o.region=e.toRegion;results.push(`${o.label}${e.toHolder?'已交付持有人':'留在現場'}`);
   }
   o.revision++;

  }
 }
 // A linked serving is a concrete identity inside its vessel. Validate the
 // complete batch so explicit, separately authorized transfers can move both;
 // never manufacture an implicit transfer or recipient consent.
 const touched=new Set(effects.flatMap(e=>'objectId' in e?[e.objectId]:[]));
 for(const drink of w.objects||[]){
  if(drink.kind!=='food'||!drink.state.vessel||(!touched.has(drink.id)&&!touched.has(drink.state.vessel)))continue;
  const vessel=w.objects?.find(o=>o.id===drink.state.vessel);
  const active=drink.lifecycle==='active';
  const separated=active&&(!vessel||vessel.lifecycle!=='active'||vessel.region!==drink.region||vessel.holder!==drink.holder||vessel.state.contents!==drink.state.beverage);
  const consumedStillFull=drink.lifecycle==='consumed'&&touched.has(drink.id)&&vessel&&['tea','coffee'].includes(vessel.state.contents);
  if(separated||consumedStillFull){
   throw new EffectValidationError('飲品與容器的結果不一致。',{reason:'vessel_continuity',phaseIndex,objectId:drink.id});
  }
 }
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
 if(!candidate.trialBinding&&(!target||!target.knownTo.includes(c.id)||target.region!==regionOf(c)))throw new EffectValidationError('不確定活動需要當前可知的具體對象。',{reason:'branch_subject'});
 const scope=JSON.stringify(['results.v1',c.id,candidate.trialBinding?['routine',candidate.trialBinding.operation,candidate.trialBinding.subject]:['free',action.target]]);
 const refs=new Set<string>(target?[target.id]:[]);
 for(const branch of candidate.branches||[]){
  for(const effect of [...branch.effects,...branch.stages.flatMap(stage=>stage.effects)])refs.add('objectId' in effect?effect.objectId:'supplyId' in effect?effect.supplyId:effect.targetId);
  for(const stage of branch.stages)for(const condition of stage.preconditions)refs.add(condition.objectId);
 }
 const currentRefs=[...refs].filter(id=>w.objects?.some(o=>o.id===id)||w.supplies?.some(s=>s.id===id)).sort();
 let frozen=candidate.trialBinding?.references||w.branchTrialScopes?.[scope]||currentRefs;
 const facts=(references:string[])=>references.map(id=>{
  const o=w.objects?.find(o=>o.id===id),s=w.supplies?.find(s=>s.id===id);
  return o?{id:o.id,source:o.source,region:o.region,holder:o.holder,owner:o.owner,state:o.state,lifecycle:o.lifecycle,allowed:o.owner===c.id||o.allowedTo.includes(c.id)}:s?{id:s.id,region:s.region,owner:s.owner,remaining:s.remaining,sequence:s.background?.sequence,state:s.initialState,allowed:s.allowedTo.includes(c.id)}:{id,missing:true};
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
 for(const branch of candidate.branches||[]){const clone=structuredClone(w),actor=clone.characters.find(actor=>actor.id===c.id)!;commitFreeAction(clone,actor,{...candidate,branches:undefined,check:null,effects:branch.effects,stages:branch.stages});}
}
export function commitFreeAction(w:World,c:Character,candidate:EffectCandidate,action?:Action):boolean{
 if(candidate.branches){
  validateResultBranches(w,c,candidate);
  if(!action)throw Error('結果分支缺少活動對象。');
  const resolution=candidate.check?branchResolution(w,c,candidate,action):undefined;
  const branchIndex=resolution?candidate.branches.findIndex(branch=>branch.outcomes.includes(resolution.outcome)):0;
  const branch=candidate.branches[branchIndex];
  candidate.selectedResult={outcome:resolution?.outcome||null,...(resolution?{resolution}:{}),branch:branchIndex};
  candidate.effects=branch.effects;candidate.stages=branch.stages;candidate.check=null;
  const used=new Set([...branch.effects,...branch.stages.flatMap(stage=>stage.effects)].flatMap(effect=>effect.kind==='materialize'?[effect.supplyId]:[]));
  const unselected=new Set((candidate.pendingResultSupplies||[]).filter(id=>!used.has(id)));
  discardPendingSupplies(w,unselected);
  delete candidate.branches;
 }

 if(candidate.status!=='accepted'){
  // A general candidate carries only a status, not a verified explanation.
  // Do not turn hidden authority data into a reason or invent the model's intent.
  // Routine binders already provide a more specific, knowable blockedReason.
  c.activity=candidate.blockedReason||(candidate.status==='denied'
   ?'這次方法沒有成功。若尚未取得必要使用許可，須由有權角色自行同意授權；方法或已知條件實質改變後可再提出。是否等待、重試或換方法由自己決定。'
   :'目前的方法無法落實：這種效果目前無法承接，尚未完成。方法或已知條件實質改變後可再提出，僅改措辭不算改變。是否等待、重試或換方法由自己決定。');
  record(w,c.id,`${c.name} ${c.activity}`,'blocked',[c.id]);return false;
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
 const results=applyEffects(clone,actor,candidate.effects);
 validateResultTime(clone,15);
 const predicted=structuredClone(clone),predictedActor=predicted.characters.find(x=>x.id===c.id)!;
 for(const [phaseIndex,phase] of (candidate.stages||[]).entries()){
  try{
   if(phase.effects.some(e=>e.kind==='transfer'&&e.toHolder!==null&&e.toHolder!==c.id))throw Error('階段需要接收者新的選擇。');
   predicted.minute=Math.max(predicted.minute,w.minute+phase.afterMinutes);
   checkPhase(predicted,predictedActor,phase);applyEffects(predicted,predictedActor,phase.effects,phaseIndex);validateResultTime(predicted,phase.afterMinutes);
  }catch(error){
   if(error instanceof EffectValidationError)throw error;
   throw new EffectValidationError(error instanceof Error?error.message:'活動階段前提無效。',{reason:'phase_precondition',phaseIndex,preconditions:phase.preconditions,actual:phase.preconditions.map(p=>predicted.objects?.find(o=>o.id===p.objectId)||null)});
  }
 }
 let resolution=candidate.selectedResult?.resolution;
 if(candidate.check){
  const allEffects=[...candidate.effects,...(candidate.stages||[]).flatMap(stage=>stage.effects)];
  const references=new Set(allEffects.map(e=>'objectId' in e?e.objectId:'supplyId' in e?e.supplyId:e.targetId));
  for(const stage of candidate.stages||[])for(const p of stage.preconditions)references.add(p.objectId);
  const conditions=[...references].sort().map(id=>w.objects?.find(o=>o.id===id)||w.supplies?.find(s=>s.id===id)||null);
  const phases=(candidate.stages||[]).map(stage=>({preconditions:stage.preconditions,effects:stage.effects}));
  const key=JSON.stringify(canonical(['free',c.id,regionOf(c),[...(c.abilityTags||[])].sort(),candidate.effects,phases,conditions]));
  const prior=w.freeTrials?.[key];
  if(!prior&&Object.keys(w.freeTrials||{}).length>=128)throw Error('行動判定保存已達上限，本回合未進行新的判定。');
  resolution=prior||judgeD20(rollD20(),abilityAdvantage(c,candidate.check.ability),candidate.check.difficulty);
  if(!prior){(w.freeTrials??={})[key]=resolution;record(w,c.id,`${c.name} 嘗試目前的方法。`,'attempt',[c.id],undefined,resolution);w.events.at(-1)!.attemptKey=key;}
  if(!['success','critical-success'].includes(resolution.outcome)){c.activity='嘗試尚未完成。';return false;}
 }
 w.supplies=clone.supplies;w.objects=clone.objects;
 const outcomeLabel=resolution?.outcome==='critical-failure'?'大失敗':resolution?.outcome==='failure'?'失敗':resolution?.outcome==='mixed'?'部分成功':'完成';
 c.activity=(results.join('，')||(candidate.stages?.length?'開始進行這項活動':candidate.selectedResult?`這次嘗試的結果為${outcomeLabel}`:'完成這次行動'))+(candidate.stages?.length?'；活動尚未完成。':'');
 const here=regionOf(c);
 record(w,c.id,`${c.name} ${c.activity}。`,'work',[c.id],{from:c.location,to:c.location,fromRegion:here,toRegion:here},resolution);
 return true;
}

function checkPhase(w:World,c:Character,phase:ActivityPhase):void{
 // Internal routine plans retain tools separately from their result vessel.
 // They remain local, known and authorized at every scheduled phase.
 for(const id of phase.requiredTools||[]){
  const tool=w.objects?.find(o=>o.id===id);
  if(!tool||!usableRoutineObject(tool,c.id)||tool.region!==regionOf(c)||!tool.knownTo.includes(c.id))throw Error('活動工具已不可使用。');
 }
 for(const p of phase.preconditions){
  const o=w.objects?.find(o=>o.id===p.objectId);
  if(!o||o.lifecycle!=='active'||o.revision!==p.revision||o.region!==p.region||o.holder!==p.holder||Object.entries(p.state).some(([k,v])=>o.state[k]!==v))throw Error('活動前提已改變。');
  if(o.state.condition==='broken'&&phase.effects.some(e=>e.kind==='state'&&e.objectId===o.id&&e.key==='contents'))throw Error('活動器具已損壞。');
 }
 if(phase.effects.some(e=>e.kind==='grant'||e.kind==='consent'))throw Error('活動需要新的角色選擇。');
 if(c.plan?.phases&&regionOf(c)!==c.plan.phases.origin)throw Error('角色已離開活動場景。');
}
// Validate and commit one phase as a batch; lifecycle owns the phase cursor.
export function commitActivityPhase(w:World,c:Character,phase:ActivityPhase,index:number):string[] {
 const clone=structuredClone(w),actor=clone.characters.find(character=>character.id===c.id)!;
 checkPhase(clone,actor,phase);
 const results=applyEffects(clone,actor,phase.effects,index);
 w.objects=clone.objects;w.supplies=clone.supplies;
 return results;
}
