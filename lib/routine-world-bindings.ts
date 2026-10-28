import { routineMaterialSourceMatches, type RoutineSourceQualification } from './routine-materials';
import { worldTargetSnapshot } from './world-state';
import { regionOf, canSee } from './perception';
import { hasObjectPermission, type Effect, type SceneSupply, type WorldObject } from './world-effects';
import type { World, Character } from './world';
import type { RoutineRule } from './routine-rules';
import type { RoutineBinding, RoutineWorldProgram } from './routine-world-contract';
import type { Quantity } from './world-formation-contract';

// Only a server-bound v3 plan can carry this metadata. Model phase schemas do
// not accept it. Relevant physical facts must still hold before rebinding.
export type RoutinePhaseBindings={objects:{id:string;region:string;holder:string|null;quantity:Quantity;state?:Record<string,string|null>}[];bodies:{id:string;region:string}[]};
export function routineBindingsHold(world:World,bindings:RoutinePhaseBindings):boolean {
 return bindings.objects.every(binding=>{const object=world.objects?.find(value=>value.id===binding.id);const quantity=object?.quantity||{amount:1,unit:'item'};return !!object&&object.lifecycle==='active'&&object.region===binding.region&&object.holder===binding.holder&&quantity.amount===binding.quantity.amount&&quantity.unit===binding.quantity.unit&&Object.entries(binding.state||{}).every(([key,value])=>(Object.hasOwn(object.state,key)?object.state[key]:null)===value);})&&bindings.bodies.every(binding=>{const body=world.characters.find(value=>value.id===binding.id);return !!body&&regionOf(body)===binding.region;});
}
export function rebindRoutineEffects(world:World,input:Effect[]):Effect[]{
 const effects=structuredClone(input),versions=new Map<string,number>(),remaining=new Map<string,number>();
 const next=(type:'object'|'body'|'environment',id:string)=>{const key=type+':'+id;const current=versions.get(key)??worldTargetSnapshot(world,{type,id})?.revision;if(current===undefined)throw Error('日常效果對象尚未形成。');versions.set(key,current+1);return current;};
 for(const effect of effects){
  if(effect.kind==='change-state')effect.expectedRevision=next(effect.target.type,effect.target.id);
  else if(effect.kind==='form'){for(const item of effect.inputs)item.expectedRevision=next('object',item.objectId);for(const output of effect.outputs)versions.set('object:'+output.id,1);}
  else if(effect.kind==='separate'){effect.expectedRevision=next('object',effect.objectId);versions.set('object:'+effect.outputId,1);}
  else if(effect.kind==='displace-body'){effect.expectedRevision=next('body',effect.targetId);const target=world.characters.find(actor=>actor.id===effect.targetId);if(!target)throw Error('日常身體對象已離場。');effect.expectedRegion=regionOf(target);for(const object of world.objects||[])if(object.holder===effect.targetId&&object.lifecycle==='active')next('object',object.id);}
  else if(effect.kind==='materialize'||effect.kind==='physical'&&effect.operation==='materialize'){
   const supply=world.supplies?.find(value=>value.id===effect.supplyId);if(!supply)throw Error('日常供應已不存在。');const amount=remaining.get(supply.id)??supply.remaining;effect.expectedRemaining=amount;remaining.set(supply.id,supply.background?amount:amount-1);versions.set('object:'+`${supply.id}:${supply.background?.sequence??amount}`,1);
  }else if('objectId' in effect&&'expectedRevision' in effect)effect.expectedRevision=next('object',effect.objectId);
 }
 return effects;
}

// This is an applicability snapshot, never NPC knowledge or an execution
// revision. Keep only facts used by this role's saved prerequisite.
export const routineSourceLimits={sources:32,factsPerSource:4,factBytes:4096,bytesPerRule:32768} as const;
export type RoutineSourceScope={ruleId:string;operation:string;refs:{role:string;id:string}[]};
export function routineSourcePremise(world:World,actor:Character,binding:RoutineBinding,id:string):string|undefined {
 const source=binding.type==='object'?world.objects?.find(item=>item.id===id):binding.type==='supply'?world.supplies?.find(item=>item.id===id):worldTargetSnapshot(world,{type:binding.type,id});
 if(!source)return;
 const state='initialState' in source?source.initialState:source.state;
 const authority='allowedTo' in source?{known:source.knownTo.includes(actor.id),...(binding.access==='authorized'?{authorized:hasObjectPermission(source,actor.id)}:{})}:{};
 return JSON.stringify({actor:actor.id,actorRegion:regionOf(actor),region:source.region,...('lifecycle' in source?{lifecycle:source.lifecycle,holder:'holder' in source?source.holder:null}:{}),...('remaining' in source?{remaining:source.remaining,pending:!!source.pending}:{}),...authority,state:[...binding.state].sort((a,b)=>a.key.localeCompare(b.key)).map(entry=>({key:entry.key,value:Object.hasOwn(state,entry.key)?state[entry.key]:null})),...(binding.quantity&&('lifecycle' in source||'remaining' in source)?{quantity:'quantity' in source&&source.quantity?source.quantity:{amount:1,unit:'item'}}:{})});
}
export function rememberRoutineSource(rule:RoutineRule,program:RoutineWorldProgram,binding:RoutineBinding,id:string,premise:string|undefined):void {
 if(premise===undefined||new TextEncoder().encode(premise).byteLength>routineSourceLimits.factBytes){rule.confirmedSourceFactsDropped=(rule.confirmedSourceFactsDropped||0)+1;return;}
 const sources=rule.confirmedSources??=[];
 let source=sources.find(item=>item.operation===program.operation&&item.role===binding.role&&item.type===binding.type&&item.id===id);
 if(!source){source={operation:program.operation,role:binding.role,type:binding.type,id,facts:[]};sources.push(source);}
 const facts=source.facts??=[];
 if(!facts.includes(premise))facts.push(premise);
 rule.confirmedSourceFactsDropped=(rule.confirmedSourceFactsDropped||0)+Math.max(0,facts.length-routineSourceLimits.factsPerSource);source.facts=facts.slice(-routineSourceLimits.factsPerSource);
 while(sources.length>routineSourceLimits.sources||new TextEncoder().encode(JSON.stringify(sources)).byteLength>routineSourceLimits.bytesPerRule){sources.shift();rule.confirmedSourcesDropped=(rule.confirmedSourcesDropped||0)+1;}
 rule.confirmedSources=sources;
}
// Only an actual phase batch advances this method's known applicability
// context. Another method's changes must leave its old fingerprint intact.
export function recordCommittedRoutinePremises(world:World,actor:Character,scope:RoutineSourceScope|undefined):void {
 if(!scope)return;
 const rule=world.routineRules?.find(item=>item.id===scope.ruleId&&item.version===3);
 const program=(rule?.programs as RoutineWorldProgram[]|undefined)?.find(item=>item.operation===scope.operation);
 if(!rule||!program)return;
 for(const reference of scope.refs){const binding=program.bindings.find(item=>item.role===reference.role);if(binding)rememberRoutineSource(rule,program,binding,reference.id,routineSourcePremise(world,actor,binding,reference.id));}
}

// This is authority for contacting an already-established ordinary background,
// never for giving knowledge or permission during candidate binding.
function routineBackgroundContext(world:World,actor:Character,scope:RoutineSourceScope|undefined,id:string) {
 if(!scope)return;
 const rule=world.routineRules?.find(item=>item.id===scope.ruleId&&item.version===3&&item.origin===actor.location&&item.knownTo.includes(actor.id));
 const program=(rule?.programs as RoutineWorldProgram[]|undefined)?.find(item=>item.operation===scope.operation);
 const reference=scope.refs.find(item=>item.id===id),binding=program?.bindings.find(item=>item.role===reference?.role);
 const source=world.supplies?.find(item=>item.id===id);
 if(!rule||!program||!binding||binding.type!=='supply'||binding.access!=='authorized'||!binding.background||!source?.background||source.region!==regionOf(actor)||!canSee(world,actor,source.region)||
  !world.routinePlaces?.some(place=>place.location===actor.location&&place.operators.includes(actor.id)))return;
 return {rule,binding,source};
}
function finiteBackgroundConflict(world:World,actor:Character,binding:RoutineSourceQualification):boolean {
 const matches=(item:WorldObject|SceneSupply)=>binding.sourceRole==='material'?routineMaterialSourceMatches(item,binding):item.kind===binding.background!.kind;
 return (world.supplies||[]).some(item=>!item.background&&item.region===regionOf(actor)&&matches(item))||
  (world.objects||[]).some(item=>item.region===regionOf(actor)&&!world.supplies?.some(supply=>supply.id===item.source&&supply.background)&&matches(item));
}
// Only the server-bound phase from this confirmation can establish a new source.
export function canConfirmRoutineBackground(world:World,actor:Character,scope:RoutineSourceScope|undefined,id:string):boolean {
 const context=routineBackgroundContext(world,actor,scope,id);if(!context)return false;
 const {rule,binding,source}=context;
 return !!source.pending&&source.background!.ruleId===rule.id&&source.owner===actor.id&&source.allowedTo.includes(actor.id)&&!finiteBackgroundConflict(world,actor,binding);
}
export function canContactRoutineBackground(world:World,actor:Character,scope:RoutineSourceScope|undefined,id:string):boolean {
 const context=routineBackgroundContext(world,actor,scope,id);if(!context)return false;
 const {binding,source}=context,confirmedScope=source.background!.scope;
 return !source.pending&&source.remaining>0&&(source.availableAt===undefined||source.availableAt<=world.minute)&&hasObjectPermission(source,actor.id)&&source.allowedTo.includes(actor.id)&&
  (!binding.kind||source.kind===binding.kind)&&routineMaterialSourceMatches(source,binding)&&
  (!confirmedScope||confirmedScope.version===1&&confirmedScope.role===binding.sourceRole&&confirmedScope.subject===binding.sourceSubject)&&!finiteBackgroundConflict(world,actor,binding);
}

// The same applicable finite source constrains both known and unknown ordinary
// backgrounds. Legacy rows without scope use the actual bound method if present.
export function routineBackgroundHasFiniteConflict(world:World,actor:Character,source:SceneSupply,scope?:RoutineSourceScope):boolean {
 const confirmed=source.background?.scope;
 const binding=routineBackgroundContext(world,actor,scope,source.id)?.binding??(confirmed?.version===1?{sourceRole:confirmed.role,sourceSubject:confirmed.subject,kind:source.kind,background:{kind:source.kind}}:undefined);
 return !!binding&&finiteBackgroundConflict(world,actor,binding);
}
