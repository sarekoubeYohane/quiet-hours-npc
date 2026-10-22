import { worldTargetSnapshot } from './world-state';
import { regionOf } from './perception';
import type { Effect } from './world-effects';
import type { World } from './world';
import type { Quantity } from './world-formation-contract';

// Only a server-bound v3 plan can carry this metadata. Model phase schemas do
// not accept it. Relevant physical facts must still hold before rebinding.
export type RoutinePhaseBindings={objects:{id:string;region:string;holder:string|null;quantity:Quantity}[];bodies:{id:string;region:string}[]};
export function routineBindingsHold(world:World,bindings:RoutinePhaseBindings):boolean {
 return bindings.objects.every(binding=>{const object=world.objects?.find(value=>value.id===binding.id);const quantity=object?.quantity||{amount:1,unit:'item'};return !!object&&object.lifecycle==='active'&&object.region===binding.region&&object.holder===binding.holder&&quantity.amount===binding.quantity.amount&&quantity.unit===binding.quantity.unit;})&&bindings.bodies.every(binding=>{const body=world.characters.find(value=>value.id===binding.id);return !!body&&regionOf(body)===binding.region;});
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
