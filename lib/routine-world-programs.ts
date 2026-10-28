import { confirmsBodyConsequences } from './needs';
import { checkRoutineMethod, matchesRoutineMethod, routineWorldLimits, type RoutineWorldApproval, type RoutineWorldProgram, type RoutineBinding } from './routine-world-contract';
import { regionOf, canSee, regions } from './perception';
import { worldTargetSnapshot } from './world-state';
import { canPhysicallyReachObject, hasObjectPermission, commitActivityPhase, effectReferenceIds, type Effect, type EffectCandidate, EffectValidationError, type ActivityPhase, type WorldObject, type SceneSupply } from './world-effects';
import { rebindRoutineEffects, rememberRoutineSource, routineSourcePremise, routineSourceLimits, type RoutinePhaseBindings } from './routine-world-bindings';
import type { World, Character, Action } from './world';
import type { RoutineRule, RoutineSelectionObserver } from './routine-rules';

const observeSelection=(observe:RoutineSelectionObserver|undefined,data:unknown)=>{try{observe?.(data);}catch{/* Evidence is not an execution dependency. */}};
const denied=(message:string):EffectCandidate=>({status:'denied',effects:[],stages:[],check:null,blockedReason:message});
function audit(w:World,c:Character,rule:RoutineRule,result:'approved'|'reused'|'exception'|'blocked',reason?:string){
 w.routineAudit=[...(w.routineAudit||[]),{turn:w.turn,actorId:c.id,location:c.location,ruleId:rule.id,result,...(reason?{reason}:{})}].slice(-64);
}
const stateMatches=(state:Record<string,string>,binding:RoutineBinding)=>binding.state.every(({key,value})=>(Object.hasOwn(state,key)?state[key]:null)===value);
// A material role keeps its confirmed source semantics for concrete objects and
// supplies alike. Legacy food needs its subject because that kind covers meals
// and ingredients; newer kinds can carry the confirmed source category.
function matchesMaterialSource(source:WorldObject|SceneSupply,binding:RoutineBinding):boolean {
 if(binding.sourceRole!=='material')return true;
 const state='initialState' in source?source.initialState:source.state;
 const subject=!!binding.sourceSubject&&(source.label.includes(binding.sourceSubject)||['material','category'].some(key=>state[key]===binding.sourceSubject));
 const kind=binding.background?.kind??binding.kind;
 return source.kind==='food'||kind==='food'||!kind?subject:source.kind===kind||source.kind===binding.kind;
}
class RoutineUnavailable extends Error {}
function bindRoles(w:World,c:Character,action:Action,program:RoutineWorldProgram,rule:RoutineRule,observe?:RoutineSelectionObserver,confirming=false):Map<string,string>|undefined {
 const refs=new Map<string,string>([['actor',c.id],['here',regionOf(c)]]);
 const report=(binding:RoutineBinding,data:Record<string,unknown>)=>observeSelection(observe,{source:'program-check',ruleId:rule.id,version:rule.version,operation:program.operation,role:binding.role,type:binding.type,...data});
 const currentRule=w.routineRules?.find(value=>value.id===rule.id)||rule;
 const rememberSource=(binding:RoutineBinding,id:string)=>rememberRoutineSource(currentRule,program,binding,id,routineSourcePremise(w,c,binding,id));
 const rejectPrerequisite=(binding:RoutineBinding,ids:string[])=>{
  // A newly encountered source with a different state may need a new scope;
  // it must not be frozen out by an older method's narrower confirmation.
  const verified=confirming||ids.every(id=>{const premise=routineSourcePremise(w,c,binding,id);return premise!==undefined&&currentRule.confirmedSources?.some(source=>source.operation===program.operation&&source.role===binding.role&&source.type===binding.type&&source.id===id&&source.facts?.includes(premise));});
  report(binding,{check:verified?'verified-prerequisite':'unverified-source-scope',ids:ids.slice(0,16),omittedIds:Math.max(0,ids.length-16),passed:false,conditions:['current-location','known-source','availability','access',...binding.state.map(entry=>'state:'+entry.key),...(binding.quantity?['quantity']:[])]});
  if(verified){if(confirming)for(const id of ids.slice(0,routineSourceLimits.sources))rememberSource(binding,id);throw new RoutineUnavailable('目前已確認方法所需的外在前提尚不成立，這次尚未開始。');}
 };
 const finiteSource=(binding:RoutineBinding)=>{
  if(!binding.background)return;
  const entries=currentRule.finiteSourceBindings??=[];
  let entry=entries.find(value=>value.operation===program.operation);
  if(!entry){if(entries.length>=routineWorldLimits.maxPrograms)throw Error('有限來源範圍超出程序容量。');entry={operation:program.operation,roles:[]};entries.push(entry);}
  if(!entry.roles.includes(binding.role)){if(entry.roles.length>=routineWorldLimits.maxBindings)throw Error('有限來源角色超出容量。');entry.roles.push(binding.role);}
 };
 const fromRenewableBackground=(object:WorldObject)=>!!w.supplies?.some(source=>source.id===object.source&&source.background);
 const background=(binding:RoutineBinding)=>{
  const bg=binding.background!;
  const discovering=(program.branches||[{stages:program.stages}]).some(path=>path.stages.some(phase=>phase.effects.some(effect=>effect.kind==='discover'&&effect.supplyIds.includes('$'+binding.role))));
  const explicit=(w.supplies||[]).filter(supply=>!supply.background&&supply.region===regionOf(c)&&supply.knownTo.includes(c.id)&&(binding.sourceRole==='material'?matchesMaterialSource(supply,binding):supply.kind==='utensil'||supply.kind===bg.kind));
  if(explicit.length){
   const actual=explicit.find(supply=>supply.remaining>0&&hasObjectPermission(supply,c.id)&&stateMatches(supply.initialState,binding));
   report(binding,{check:'finite-background-source',candidates:explicit.map(source=>({id:source.id,remaining:source.remaining})),selected:actual?.id??null});
   if(!actual)throw new RoutineUnavailable('目前已知的有限材料或器具不能使用，尚未完成；日常背景不會補回。');
   return actual;
  }
  const finite=currentRule.finiteSourceBindings?.some(entry=>entry.operation===program.operation&&entry.roles.includes(binding.role));
  const concrete=(w.objects||[]).some(object=>object.knownTo.includes(c.id)&&regions.some(region=>region.id===object.region&&region.location===c.location)&&!fromRenewableBackground(object)&&(binding.sourceRole==='material'?matchesMaterialSource(object,binding):object.kind===bg.kind||object.kind===binding.kind));
  report(binding,{check:'background-substitution',finite:!!finite,concrete,allowed:!finite&&!concrete});
  if(finite||concrete)throw new RoutineUnavailable('已知具體材料或器具已耗盡、損毀、移走或無法操作；日常背景不會補回。');
  let supply=w.supplies?.find(supply=>supply.background?.ruleId===rule.id&&supply.region===regionOf(c)&&supply.label===bg.label&&supply.kind===bg.kind);
  if(!supply){
   if((w.supplies?.length||0)>=512)throw Error('日常供應已達容量。');
   supply={id:`supply:${crypto.randomUUID()}`,label:bg.label,kind:bg.kind,consumable:bg.consumable,quantity:structuredClone(bg.quantity),initialState:Object.fromEntries(bg.initialState.map(({key,value})=>[key,value])),stateExposure:Object.fromEntries(bg.initialState.map(({key,exposure})=>[key,exposure])),region:regionOf(c),remaining:1,owner:c.id,knownTo:discovering?[]:[c.id],allowedTo:[c.id],pending:true,background:{ruleId:rule.id,sequence:0}};
   (w.supplies??=[]).push(supply);
  }
  return supply;
 };
 for(const rawBinding of program.bindings){
  const binding={...rawBinding,state:substitute(rawBinding.state,refs),background:rawBinding.background?{...rawBinding.background,initialState:substitute(rawBinding.background.initialState,refs)}:null};
  if(binding.type==='object'){
   const reachable=(w.objects||[]).filter(object=>{const reach=canPhysicallyReachObject(w,c,object),permission=reach?(binding.access==='physical'||hasObjectPermission(object,c.id)&&(object.holder===null||object.holder===c.id)):undefined;report(binding,{check:'object-access',id:object.id,reach,permission:permission??'not-evaluated',access:binding.access});return reach&&permission;});
   const candidates=reachable.filter(object=>{
    const checks:{name:string;run:()=>boolean}[]=[{name:'target',run:()=>binding.select!=='target'||object.id===action.target},{name:'kind',run:()=>!binding.kind||object.kind===binding.kind},{name:'label',run:()=>!binding.label||object.label.includes(binding.label)},{name:'material',run:()=>matchesMaterialSource(object,binding)},{name:'state',run:()=>stateMatches(object.state,binding)},{name:'link',run:()=>!binding.link||(binding.link.direction==='from-role'?w.objects?.find(source=>source.id===refs.get(binding.link!.role))?.state[binding.link.key]===object.id:object.state[binding.link.key]===refs.get(binding.link.role))},{name:'quantity',run:()=>!binding.quantity||(object.quantity||{amount:1,unit:'item'}).unit===binding.quantity.unit&&(object.quantity?.amount||1)>=binding.quantity.amount}];
    for(const check of checks){const passed=check.run();report(binding,{check:check.name,id:object.id,passed});if(!passed)return false;}return true;
   });
   if(binding.select==='linked'&&candidates.length>1){report(binding,{check:'unbound',reason:'ambiguous-linked-objects',candidates:candidates.map(object=>object.id)});return;}
   const object=candidates[0];
   if(object){report(binding,{check:'bound',id:object.id});rememberSource(binding,object.id);if(!fromRenewableBackground(object))finiteSource(binding);refs.set(binding.role,object.id);continue;}
   if(!binding.background){
    // Only known, selected objects with otherwise compatible identities
    // prove this method's physical prerequisite failed. Missing or
    // contradictory links, wrong kinds and ambiguous selectors remain an
    // exception; they are not evidence for a world prohibition.
    const target=binding.select==='target'&&!binding.link?w.objects?.find(object=>object.id===action.target&&object.knownTo.includes(c.id)&&(!binding.kind||object.kind===binding.kind)&&(!binding.label||object.label.includes(binding.label))&&matchesMaterialSource(object,binding)):undefined;
    if(target)rejectPrerequisite(binding,[target.id]);
    const local=binding.select==='local'&&!binding.link&&(binding.kind||binding.label)?(w.objects||[]).filter(object=>object.region===regionOf(c)&&object.knownTo.includes(c.id)&&(!binding.kind||object.kind===binding.kind)&&(!binding.label||object.label.includes(binding.label))&&matchesMaterialSource(object,binding)):[];
    if(local.length)rejectPrerequisite(binding,local.map(object=>object.id));
    report(binding,{check:'unbound',reason:'no-verified-object-premise'});return;
   }
   if(binding.select==='target'&&w.objects?.some(object=>object.id===action.target)||reachable.some(object=>(!binding.kind||object.kind===binding.kind)&&(!binding.label||object.label.includes(binding.label))&&matchesMaterialSource(object,binding)))throw new RoutineUnavailable('指定或現有物件條件不成立，不能用日常背景代換。');
   const supply=background(binding);if(!supply.background)finiteSource(binding);refs.set(binding.role,`${supply.id}:${supply.background?.sequence??supply.remaining}`);refs.set(binding.role+'-supply',supply.id);
  }else if(binding.type==='environment'){
   const snapshot=worldTargetSnapshot(w,{type:'environment',id:regionOf(c)}),matches=!!snapshot&&stateMatches(snapshot.state,binding);report(binding,{check:'environment-state',id:regionOf(c),snapshot:!!snapshot,passed:matches});if(!matches){if(snapshot&&binding.state.length)rejectPrerequisite(binding,[regionOf(c)]);return;}rememberSource(binding,regionOf(c));refs.set(binding.role,regionOf(c));
  }else if(binding.type==='body'){
   const actor=w.characters.find(actor=>{const selected=binding.select==='actor'?actor.id===c.id:binding.select==='target'?actor.id===action.target:!binding.label||actor.name.includes(binding.label);if(!selected){report(binding,{check:'body-selector',id:actor.id,passed:false});return false;}const local=regionOf(actor)===regionOf(c);if(!local){report(binding,{check:'body-location',id:actor.id,passed:false});return false;}const visible=canSee(w,c,regionOf(actor));if(!visible){report(binding,{check:'body-visibility',id:actor.id,passed:false});return false;}const state=stateMatches(actor.physical?.state||{},binding);report(binding,{check:'body-state',id:actor.id,passed:state});return state;});if(!actor){
    const selected=binding.select==='actor'?c:binding.select==='target'?w.characters.find(person=>person.id===action.target&&regionOf(person)===regionOf(c)&&canSee(w,c,regionOf(person))):undefined;
    if(selected&&binding.state.length)rejectPrerequisite(binding,[selected.id]);
    return;
   }report(binding,{check:'bound',id:actor.id});rememberSource(binding,actor.id);refs.set(binding.role,actor.id);
  }else{
   let supply=w.supplies?.find(supply=>{
    const checks:{name:string;run:()=>boolean}[]=[{name:'pending',run:()=>!supply.pending},{name:'remaining',run:()=>supply.remaining>0},{name:'location',run:()=>supply.region===regionOf(c)},{name:'known',run:()=>supply.knownTo.includes(c.id)},{name:'permission',run:()=>binding.access==='physical'||hasObjectPermission(supply,c.id)},{name:'target',run:()=>binding.select!=='target'||supply.id===action.target},{name:'kind',run:()=>!binding.kind||supply.kind===binding.kind},{name:'label',run:()=>!binding.label||supply.label.includes(binding.label)},{name:'material',run:()=>matchesMaterialSource(supply,binding)},{name:'state',run:()=>stateMatches(supply.initialState,binding)}];
    for(const check of checks){const passed=check.run();report(binding,{check:check.name,id:supply.id,passed});if(!passed)return false;}return true;
   });if(!supply&&binding.background)supply=background(binding);if(!supply){
    const relevant=(w.supplies||[]).filter(source=>!source.pending&&source.knownTo.includes(c.id)&&(binding.select==='target'?source.id===action.target:source.region===regionOf(c))&&(!binding.kind||source.kind===binding.kind)&&(!binding.label||source.label.includes(binding.label))&&matchesMaterialSource(source,binding));
    if(relevant.length)rejectPrerequisite(binding,relevant.map(source=>source.id));
    report(binding,{check:'unbound',reason:'no-verified-source-premise'});return;
   }report(binding,{check:'bound',id:supply.id});rememberSource(binding,supply.id);
   if(!supply.background)finiteSource(binding);refs.set(binding.role,supply.id);refs.set(binding.role+'-object',`${supply.id}:${supply.background?.sequence??supply.remaining}`);
  }
 }
 const explicit=w.objects?.some(object=>object.id===action.target)||w.supplies?.some(supply=>supply.id===action.target)||w.characters.some(actor=>actor.id===action.target);
 if(explicit&&![...refs.values()].includes(action.target||'')){observeSelection(observe,{source:'program-check',ruleId:rule.id,version:rule.version,check:'explicit-target-bound',passed:false,target:action.target});return;}
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
function compilePath(w:World,c:Character,program:RoutineWorldProgram,path:{stages:ActivityPhase[]},refs:Map<string,string>,ruleId:string):ActivityPhase[]{
 const sim=structuredClone(w),actor=sim.characters.find(actor=>actor.id===c.id)!,stages:ActivityPhase[]=[];
 const stateKeys=new Map<string,Set<string>>();
 const retainKey=(id:string,key:string)=>{const keys=stateKeys.get(id)||new Set<string>();keys.add(key);stateKeys.set(id,keys);};
 for(const binding of program.bindings){const id=refs.get(binding.role)!;for(const entry of binding.state)retainKey(id,entry.key);if(binding.link)retainKey(binding.link.direction==='from-role'?refs.get(binding.link.role)!:id,binding.link.key);}
 for(const phase of path.stages){
  for(const effect of phase.effects){if(effect.kind==='form')for(const output of effect.outputs)refs.set(output.id.slice(1),`formed:${crypto.randomUUID()}`);if(effect.kind==='separate')refs.set(effect.outputId.slice(1),`portion:${crypto.randomUUID()}`);}
  const optional=phase.effects.filter(effect=>!(effect.kind==='materialize'&&effect.supplyId.endsWith('-supply')&&effect.supplyId.startsWith('$')&&!refs.has(effect.supplyId.slice(1))));
  const current=substitute(optional,refs).filter(effect=>!(effect.kind==='transfer'&&sim.objects?.find(object=>object.id===effect.objectId)?.holder===effect.toHolder));
  const effects=rebindRoutineEffects(sim,current);
  const preconditions=substitute(phase.preconditions,refs);
  const ids=new Set([...effects.flatMap(effectReferenceIds),...preconditions.flatMap(condition=>'target' in condition?[condition.target.id]:[condition.objectId])]);
  const bindings:RoutinePhaseBindings={objects:[...(sim.objects||[])].filter(object=>ids.has(object.id)).map(object=>({id:object.id,region:object.region,holder:object.holder,quantity:structuredClone(object.quantity||{amount:1,unit:'item'}),state:Object.fromEntries([...(stateKeys.get(object.id)||[])].map(key=>[key,Object.hasOwn(object.state,key)?object.state[key]:null]))})),bodies:sim.characters.filter(actor=>ids.has(actor.id)).map(actor=>({id:actor.id,region:regionOf(actor)}))};
  const compiled:ActivityPhase={afterMinutes:phase.afterMinutes,preconditions,effects,routineBindings:bindings,routineSourceScope:{ruleId,operation:program.operation,refs:program.bindings.map(binding=>({role:binding.role,id:refs.get(binding.role)!}))}};
  sim.minute=w.minute;commitActivityPhase(sim,actor,compiled,stages.length,{validateOnly:true});stages.push(compiled);
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
function copyConfirmedSources(rule:RoutineRule,snapshot:World):void {
 const saved=snapshot.routineRules?.find(value=>value.id===rule.id);
 if(saved?.confirmedSources){rule.confirmedSources=structuredClone(saved.confirmedSources);rule.confirmedSourcesDropped=saved.confirmedSourcesDropped||0;rule.confirmedSourceFactsDropped=saved.confirmedSourceFactsDropped||0;}
}
function bindWorldRoutineRule(w:World,c:Character,action:Action,approval?:RoutineWorldApproval,maxMinutes:number|null=null,ruleId?:string,observe?:RoutineSelectionObserver):EffectCandidate|undefined {
 let rule=w.routineRules?.find(rule=>rule.version===3&&(!ruleId||rule.id===ruleId)&&rule.origin===c.location&&rule.knownTo.includes(c.id)&&(rule.programs as RoutineWorldProgram[]||[]).some(program=>program.methods.some(method=>matchesRoutineMethod(method,action))));
 let program=(rule?.programs as RoutineWorldProgram[]|undefined)?.find(program=>program.methods.some(method=>matchesRoutineMethod(method,action)));
 if(approval){
  const programs=structuredClone(approval.programs),selected=programs.find(program=>program.operation===approval.operation)!;
  if(!selected.methods.some(method=>matchesRoutineMethod(method,action))){selected.methods.push({content:action.content||'',purpose:action.purpose||''});}
  if((w.routineRules?.length||0)>=32)throw Error('日常規則已達容量。');
  rule={id:crypto.randomUUID(),version:3,family:'cafe-service',origin:c.location,knownTo:[c.id],operations:approval.timings.map(time=>time.operation),programs,worldSubject:approval.subject,worldTimings:structuredClone(approval.timings)};
  (w.routineRules??=[]).push(rule);program=selected;audit(w,c,rule,'approved');
 }
 if(!rule||!program){observeSelection(observe,{source:'program-check',ruleId,branch:'adjudication-required',reason:'no-matching-program'});return;}
 const duration=rule.worldTimings!.find(time=>time.operation===program.operation)!.minutes,confirmedDurationMinutes=Math.ceil(duration/15)*15;
 if(maxMinutes!==null&&confirmedDurationMinutes>maxMinutes){observeSelection(observe,{source:'program-check',ruleId:rule.id,version:rule.version,check:'time-limit',confirmedDurationMinutes,maxMinutes,passed:false});return {status:'denied',effects:[],stages:[],check:null,knownBlockedReason:`完成這項活動需要 ${confirmedDurationMinutes} 分鐘，超過本次明確投入上限 ${maxMinutes} 分鐘；尚未啟動。`};}
 const prepared=structuredClone(w);let refs:Map<string,string>|undefined;try{refs=bindRoles(prepared,c,action,program,rule,observe,!!approval);}catch(error){if(error instanceof RoutineUnavailable){copyConfirmedSources(rule,prepared);observeSelection(observe,{source:'program-check',ruleId:rule.id,version:rule.version,branch:'blocked',reason:error.message});audit(w,c,rule,'blocked',error.message);return denied(error.message);}throw error;}
 if(!refs){observeSelection(observe,{source:'program-check',ruleId:rule.id,version:rule.version,branch:'adjudication-required',reason:'role-binding-failed'});audit(w,c,rule,'exception');if(approval)return denied('目前已知物件或外在條件不能承接這次方法，尚未完成。');return;}
 if(!approval)audit(w,c,rule,'reused');
 let branches:{outcomes:string[];effects:Effect[];stages:ActivityPhase[]}[];
 try{branches=(program.branches||[{outcomes:['critical-success','success','mixed','failure','critical-failure'],effects:[],stages:program.stages}]).map(path=>({outcomes:path.outcomes,effects:[] as Effect[],stages:compilePath(prepared,c,program,path,new Map(refs),rule.id)}));}
 catch(error){if(error instanceof EffectValidationError){observeSelection(observe,{source:'program-check',ruleId:rule.id,version:rule.version,check:'compiled-effects',passed:false,details:error.details});if(approval)return denied('目前外在前提與已確認方法不同，活動尚未完成。');audit(w,c,rule,'exception');return;}throw error;}

 copyConfirmedSources(rule,prepared);
 const finite=prepared.routineRules?.find(value=>value.id===rule.id)?.finiteSourceBindings;if(finite)rule.finiteSourceBindings=structuredClone(finite);
 const newSupplies=(prepared.supplies||[]).filter(supply=>!w.supplies?.some(existing=>existing.id===supply.id));if(newSupplies.length)(w.supplies??=[]).push(...structuredClone(newSupplies));
 const references=trialReferences(w,program,refs);
 observeSelection(observe,{source:'program-check',ruleId:rule.id,version:rule.version,branch:approval?'approved':'reused',bindings:Object.fromEntries(refs),operation:program.operation});
 return {...(program.resumable?{resumable:true}:{}),...(program.bodyActivity?{bodyActivity:structuredClone(program.bodyActivity)}:{}),status:'accepted',pendingResultSupplies:newSupplies.map(supply=>supply.id),effects:[],stages:[],branches:branches as EffectCandidate['branches'],check:program.check,confirmedDurationMinutes,trialBinding:{operation:program.operation,subject:refs.get(program.bindings[0].role)!,references}};
}

// A known method may have several separately confirmed scopes. Resolve each
// against a private snapshot so an obsolete first scope cannot force reapproval.
export function bindWorldRoutine(w:World,c:Character,action:Action,approval?:RoutineWorldApproval,maxMinutes:number|null=null,observe?:RoutineSelectionObserver):EffectCandidate|undefined {
 if(approval)return bindWorldRoutineRule(w,c,action,approval,maxMinutes,undefined,observe);
 const candidates=(w.routineRules||[]).filter(rule=>{
  if(rule.version!==3)return false;
  const scope=rule.origin===c.location,known=scope?rule.knownTo.includes(c.id):undefined;
  observeSelection(observe,{source:'program-check',check:'scope',ruleId:rule.id,version:rule.version,scope,known:known??'not-evaluated'});
  if(!scope||!known)return false;
  return (rule.programs as RoutineWorldProgram[]||[]).some(program=>program.methods.some(method=>{const {wording,purpose}=checkRoutineMethod(method,action);observeSelection(observe,{source:'program-check',check:'method',ruleId:rule.id,version:rule.version,operation:program.operation,method,wording,purpose:wording?purpose:'not-evaluated'});return wording&&purpose;}));
 });
 let blocked:{candidate:EffectCandidate;world:World}|undefined;
 for(const rule of candidates.sort((left,right)=>{const confirmed=(rule:typeof left)=>(rule.programs as RoutineWorldProgram[]||[]).some(program=>program.methods.some(method=>matchesRoutineMethod(method,action))&&confirmsBodyConsequences(program));return Number(confirmed(right))-Number(confirmed(left));})){const snapshot=structuredClone(w),candidate=bindWorldRoutineRule(snapshot,c,action,undefined,maxMinutes,rule.id,observe);if(!candidate)continue;if(candidate.status!=='accepted'){blocked??={candidate,world:snapshot};continue;}w.routineAudit=snapshot.routineAudit;w.supplies=snapshot.supplies;const original=w.routineRules?.find(value=>value.id===rule.id),bound=snapshot.routineRules?.find(value=>value.id===rule.id);if(original){copyConfirmedSources(original,snapshot);if(bound?.finiteSourceBindings)original.finiteSourceBindings=structuredClone(bound.finiteSourceBindings);}return candidate;}
 if(blocked){w.routineAudit=blocked.world.routineAudit;for(const rule of w.routineRules||[])copyConfirmedSources(rule,blocked.world);return blocked.candidate;}
 if(candidates.length)audit(w,c,candidates[0],'exception');
 return;
}
