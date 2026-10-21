import { matchesRoutineMethod, type RoutineWorldApproval, type RoutineWorldProgram, type RoutineBinding } from './routine-world-contract';
import { regionOf, canSee } from './perception';
import { worldTargetSnapshot } from './world-state';
import { canPhysicallyReachObject, hasObjectPermission, commitActivityPhase, effectReferenceIds, type Effect, type EffectCandidate, EffectValidationError, type ActivityPhase } from './world-effects';
import { rebindRoutineEffects, type RoutinePhaseBindings } from './routine-world-bindings';
import type { World, Character, Action } from './world';
import type { RoutineRule } from './routine-rules';

const denied=(message:string):EffectCandidate=>({status:'denied',effects:[],stages:[],check:null,blockedReason:message});
function audit(w:World,c:Character,rule:RoutineRule,result:'approved'|'reused'|'exception'){
 w.routineAudit=[...(w.routineAudit||[]),{turn:w.turn,actorId:c.id,location:c.location,ruleId:rule.id,result}].slice(-64);
}
const stateMatches=(state:Record<string,string>,binding:RoutineBinding)=>binding.state.every(({key,value})=>(Object.hasOwn(state,key)?state[key]:null)===value);
class RoutineUnavailable extends Error {}
function bindRoles(w:World,c:Character,action:Action,program:RoutineWorldProgram,rule:RoutineRule):Map<string,string>|undefined {
 const refs=new Map<string,string>([['actor',c.id],['here',regionOf(c)]]);
 const background=(binding:RoutineBinding)=>{
  const bg=binding.background!;
  const explicit=(w.supplies||[]).filter(supply=>!supply.background&&supply.region===regionOf(c)&&supply.knownTo.includes(c.id)&&(binding.sourceRole==='material'?(supply.kind==='food'||bg.kind==='food'?!!binding.sourceSubject&&(supply.label.includes(binding.sourceSubject)||['material','category'].some(key=>supply.initialState[key]===binding.sourceSubject)):supply.kind===bg.kind||supply.kind===binding.kind):supply.kind==='utensil'||supply.kind===bg.kind));
  if(explicit.length){
   const actual=explicit.find(supply=>supply.remaining>0&&hasObjectPermission(supply,c.id)&&stateMatches(supply.initialState,binding));
   if(!actual)throw new RoutineUnavailable('目前已知的有限材料或器具不能使用，尚未完成；日常背景不會補回。');
   return actual;
  }
  let supply=w.supplies?.find(supply=>supply.background?.ruleId===rule.id&&supply.region===regionOf(c)&&supply.label===bg.label&&supply.kind===bg.kind);
  if(!supply){
   if((w.supplies?.length||0)>=512)throw Error('日常供應已達容量。');
   supply={id:`supply:${crypto.randomUUID()}`,label:bg.label,kind:bg.kind,consumable:bg.consumable,quantity:structuredClone(bg.quantity),initialState:Object.fromEntries(bg.initialState.map(({key,value})=>[key,value])),stateExposure:Object.fromEntries(bg.initialState.map(({key,exposure})=>[key,exposure])),region:regionOf(c),remaining:1,owner:c.id,knownTo:[c.id],allowedTo:[c.id],pending:true,background:{ruleId:rule.id,sequence:0}};
   (w.supplies??=[]).push(supply);
  }
  return supply;
 };
 for(const rawBinding of program.bindings){
  const binding={...rawBinding,state:substitute(rawBinding.state,refs),background:rawBinding.background?{...rawBinding.background,initialState:substitute(rawBinding.background.initialState,refs)}:null};
  if(binding.type==='object'){
   const reachable=(w.objects||[]).filter(object=>canPhysicallyReachObject(w,c,object)&&(binding.access==='physical'||hasObjectPermission(object,c.id)&&(object.holder===null||object.holder===c.id)));
   const candidates=reachable.filter(object=>(binding.select!=='target'||object.id===action.target)&&(!binding.kind||object.kind===binding.kind)&&(!binding.label||object.label.includes(binding.label))&&stateMatches(object.state,binding)&&(!binding.link||object.state[binding.link.key]===refs.get(binding.link.role))&&(!binding.quantity||(object.quantity||{amount:1,unit:'item'}).unit===binding.quantity.unit&&(object.quantity?.amount||1)>=binding.quantity.amount));
   const object=candidates[0];
   if(object){refs.set(binding.role,object.id);continue;}
   if(!binding.background)return;
   if(binding.select==='target'&&w.objects?.some(object=>object.id===action.target)||reachable.some(object=>(!binding.kind||object.kind===binding.kind)&&(!binding.label||object.label.includes(binding.label))))throw new RoutineUnavailable('指定或現有物件條件不成立，不能用日常背景代換。');
   const supply=background(binding);refs.set(binding.role,`${supply.id}:${supply.background?.sequence??supply.remaining}`);refs.set(binding.role+'-supply',supply.id);
  }else if(binding.type==='environment'){
   const snapshot=worldTargetSnapshot(w,{type:'environment',id:regionOf(c)});if(!snapshot||!stateMatches(snapshot.state,binding))return;refs.set(binding.role,regionOf(c));
  }else if(binding.type==='body'){
   const actor=w.characters.find(actor=>(binding.select==='actor'?actor.id===c.id:binding.select==='target'?actor.id===action.target:!binding.label||actor.name.includes(binding.label))&&regionOf(actor)===regionOf(c)&&canSee(w,c,regionOf(actor))&&stateMatches(actor.physical?.state||{},binding));if(!actor)return;refs.set(binding.role,actor.id);
  }else{
   let supply=w.supplies?.find(supply=>!supply.pending&&supply.remaining>0&&supply.region===regionOf(c)&&supply.knownTo.includes(c.id)&&(binding.access==='physical'||hasObjectPermission(supply,c.id))&&(binding.select!=='target'||supply.id===action.target)&&(!binding.kind||supply.kind===binding.kind)&&(!binding.label||supply.label.includes(binding.label))&&(binding.sourceRole!=='material'||supply.kind!=='food'||!!binding.sourceSubject&&(supply.label.includes(binding.sourceSubject)||['material','category'].some(key=>supply.initialState[key]===binding.sourceSubject)))&&stateMatches(supply.initialState,binding));if(!supply&&binding.background)supply=background(binding);if(!supply)return;
   refs.set(binding.role,supply.id);refs.set(binding.role+'-object',`${supply.id}:${supply.background?.sequence??supply.remaining}`);
  }
 }
 const explicit=w.objects?.some(object=>object.id===action.target)||w.supplies?.some(supply=>supply.id===action.target)||w.characters.some(actor=>actor.id===action.target);
 if(explicit&&![...refs.values()].includes(action.target||''))return;
 return refs;
}
function substitute<T>(value:T,refs:Map<string,string>):T {
 const walk=(entry:unknown):unknown=>{
  if(Array.isArray(entry))return entry.map(walk);
  if(entry&&typeof entry==='object')return Object.fromEntries(Object.entries(entry).map(([key,item])=>[key,walk(item)]));
  if(typeof entry==='string'&&entry.startsWith('$')){const id=refs.get(entry.slice(1));if(!id)throw Error('日常引用未綁定角色。');return id;}
  return entry;
 };
 return walk(value) as T;
}
function compilePath(w:World,c:Character,program:RoutineWorldProgram,path:{stages:ActivityPhase[]},refs:Map<string,string>):ActivityPhase[]{
 const sim=structuredClone(w),actor=sim.characters.find(actor=>actor.id===c.id)!,stages:ActivityPhase[]=[];
 for(const phase of path.stages){
  for(const effect of phase.effects){if(effect.kind==='form')for(const output of effect.outputs)refs.set(output.id.slice(1),`formed:${crypto.randomUUID()}`);if(effect.kind==='separate')refs.set(effect.outputId.slice(1),`portion:${crypto.randomUUID()}`);}
  const optional=phase.effects.filter(effect=>!(effect.kind==='materialize'&&effect.supplyId.endsWith('-supply')&&effect.supplyId.startsWith('$')&&!refs.has(effect.supplyId.slice(1))));
  const current=substitute(optional,refs).filter(effect=>!(effect.kind==='transfer'&&sim.objects?.find(object=>object.id===effect.objectId)?.holder===effect.toHolder));
  const effects=rebindRoutineEffects(sim,current);
  const preconditions=substitute(phase.preconditions,refs);
  const ids=new Set([...effects.flatMap(effectReferenceIds),...preconditions.flatMap(condition=>'target' in condition?[condition.target.id]:[condition.objectId])]);
  const bindings:RoutinePhaseBindings={objects:[...(sim.objects||[])].filter(object=>ids.has(object.id)).map(object=>({id:object.id,region:object.region,holder:object.holder,quantity:structuredClone(object.quantity||{amount:1,unit:'item'})})),bodies:sim.characters.filter(actor=>ids.has(actor.id)).map(actor=>({id:actor.id,region:regionOf(actor)}))};
  const compiled:ActivityPhase={afterMinutes:phase.afterMinutes,preconditions,effects,routineBindings:bindings};
  sim.minute=w.minute;commitActivityPhase(sim,actor,compiled,stages.length);stages.push(compiled);
 }
 return stages;
}
function trialReferences(w:World,program:RoutineWorldProgram,refs:Map<string,string>):string[]{
 const targets=new Map<string,{type:'object'|'supply'|'body'|'environment';id:string;keys:Set<string>}>();
 const add=(type:'object'|'supply'|'body'|'environment',id:string,keys:string[])=>{const key=type+':'+id;const entry=targets.get(key)||{type,id,keys:new Set<string>()};for(const name of keys)entry.keys.add(name);targets.set(key,entry);};
 for(const binding of program.bindings)add(binding.type,refs.get(binding.role)!,binding.state.map(entry=>entry.key));
 const walk=(value:unknown):void=>{if(Array.isArray(value)){value.forEach(walk);return;}if(!value||typeof value!=='object')return;const entry=value as Record<string,unknown>;
  if(entry.target&&typeof entry.target==='object'){const target=entry.target as {type:'object'|'body'|'environment';id:string};const keys=((entry.changes||entry.state||[]) as {key:string}[]).map(item=>item.key);add(target.type,target.id,keys);}
  Object.values(entry).forEach(walk);
 };
 const paths=program.branches||[{stages:program.stages}];for(const path of paths)for(const phase of path.stages)for(const value of [...phase.effects,...phase.preconditions]){const copy=JSON.parse(JSON.stringify(value),(_key,item)=>typeof item==='string'&&item.startsWith('$')?(refs.get(item.slice(1))||item):item);walk(copy);}
 return [...targets.values()].filter(target=>target.type==='supply'?w.supplies?.some(value=>value.id===target.id):!!worldTargetSnapshot(w,target as {type:'object'|'body'|'environment';id:string})).map(({type,id,keys})=>JSON.stringify({routineTarget:{type,id},keys:[...keys].sort()})).sort();
}
function bindWorldRoutineRule(w:World,c:Character,action:Action,approval?:RoutineWorldApproval,maxMinutes:number|null=null,ruleId?:string):EffectCandidate|undefined {
 let rule=w.routineRules?.find(rule=>rule.version===3&&(!ruleId||rule.id===ruleId)&&rule.origin===c.location&&rule.knownTo.includes(c.id)&&(rule.programs as RoutineWorldProgram[]||[]).some(program=>program.methods.some(method=>matchesRoutineMethod(method,action))));
 let program=(rule?.programs as RoutineWorldProgram[]|undefined)?.find(program=>program.methods.some(method=>matchesRoutineMethod(method,action)));
 if(approval){
  const programs=structuredClone(approval.programs),selected=programs.find(program=>program.operation===approval.operation)!;
  if(!selected.methods.some(method=>matchesRoutineMethod(method,action))){selected.methods.push({content:action.content||'',purpose:action.purpose||''});}
  if((w.routineRules?.length||0)>=32)throw Error('日常規則已達容量。');
  rule={id:crypto.randomUUID(),version:3,family:'cafe-service',origin:c.location,knownTo:[c.id],operations:approval.timings.map(time=>time.operation),programs,worldSubject:approval.subject,worldTimings:structuredClone(approval.timings)};
  (w.routineRules??=[]).push(rule);program=selected;audit(w,c,rule,'approved');
 }
 if(!rule||!program)return;
 const duration=rule.worldTimings!.find(time=>time.operation===program.operation)!.minutes,confirmedDurationMinutes=Math.ceil(duration/15)*15;
 if(maxMinutes!==null&&confirmedDurationMinutes>maxMinutes)return denied(`完成這項活動需要 ${confirmedDurationMinutes} 分鐘，超過本次明確投入上限 ${maxMinutes} 分鐘；尚未啟動。`);
 const prepared=structuredClone(w);let refs:Map<string,string>|undefined;try{refs=bindRoles(prepared,c,action,program,rule);}catch(error){if(error instanceof RoutineUnavailable)return denied(error.message);throw error;}
 if(!refs){audit(w,c,rule,'exception');if(approval)return denied('目前已知物件或外在條件不能承接這次方法，尚未完成。');return;}
 if(!approval)audit(w,c,rule,'reused');
 let branches:{outcomes:string[];effects:Effect[];stages:ActivityPhase[]}[];
 try{branches=(program.branches||[{outcomes:['critical-success','success','mixed','failure','critical-failure'],effects:[],stages:program.stages}]).map(path=>({outcomes:path.outcomes,effects:[] as Effect[],stages:compilePath(prepared,c,program,path,new Map(refs))}));}
 catch(error){if(error instanceof EffectValidationError){if(approval)return denied('目前外在前提與已確認方法不同，活動尚未完成。');audit(w,c,rule,'exception');return;}throw error;}

 const newSupplies=(prepared.supplies||[]).filter(supply=>!w.supplies?.some(existing=>existing.id===supply.id));if(newSupplies.length)(w.supplies??=[]).push(...structuredClone(newSupplies));
 const references=trialReferences(w,program,refs);
 return {status:'accepted',pendingResultSupplies:newSupplies.map(supply=>supply.id),effects:[],stages:[],branches:branches as EffectCandidate['branches'],check:program.check,confirmedDurationMinutes,trialBinding:{operation:program.operation,subject:refs.get(program.bindings[0].role)!,references}};
}

// A known method may have several separately confirmed scopes. Resolve each
// against a private snapshot so an obsolete first scope cannot force reapproval.
export function bindWorldRoutine(w:World,c:Character,action:Action,approval?:RoutineWorldApproval,maxMinutes:number|null=null):EffectCandidate|undefined {
 if(approval)return bindWorldRoutineRule(w,c,action,approval,maxMinutes);
 const candidates=(w.routineRules||[]).filter(rule=>rule.version===3&&rule.origin===c.location&&rule.knownTo.includes(c.id)&&(rule.programs as RoutineWorldProgram[]||[]).some(program=>program.methods.some(method=>matchesRoutineMethod(method,action))));
 let blocked:{candidate:EffectCandidate;world:World}|undefined;
 for(const rule of candidates){const snapshot=structuredClone(w),candidate=bindWorldRoutineRule(snapshot,c,action,undefined,maxMinutes,rule.id);if(!candidate)continue;if(candidate.status!=='accepted'){blocked??={candidate,world:snapshot};continue;}w.routineAudit=snapshot.routineAudit;w.supplies=snapshot.supplies;return candidate;}
 if(blocked){w.routineAudit=blocked.world.routineAudit;return blocked.candidate;}
 if(candidates.length)audit(w,c,candidates[0],'exception');
 return;
}
