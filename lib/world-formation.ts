import type { Character,World } from './world';
import type { WorldObject } from './world-effects';
import type { FormationEffect, FormationInput, ObjectSource, Quantity } from './world-formation-contract';
import { formationLimits, validQuantity } from './world-formation-contract';
import { regionOf, regions } from './perception';

type FormationContext={world:World;actor:Character;hasPermission:(object:WorldObject,actorId:string)=>boolean;canReach:(world:World,actor:Character,object:WorldObject)=>boolean;retainPhysical:(object:WorldObject,actor:Character,minute:number,operation:string,priorHolder:string|null,permitted:boolean)=>void;fail:(reason:string,message:string)=>never};
const owners=(object:WorldObject)=>[...new Set(object.coOwners?.length?object.coOwners:[object.owner])];
const rights=(object:WorldObject)=>new Set([...object.allowedTo,...(owners(object).length===1?owners(object):[])]);
function amountOf(object:WorldObject,fail:FormationContext['fail']):Quantity {
 const quantity=object.quantity??{amount:1,unit:'item'};
 if(!validQuantity(quantity))fail('quantity_precondition','來源份量無法安全承接。');
 return quantity;
}
function sourceObject(input:FormationInput,context:FormationContext,access:'authorized'|'physical'):WorldObject {
 const {world:w,actor:c,hasPermission,fail}=context,object=w.objects?.find(item=>item.id===input.objectId);
 if(!object||object.revision!==input.expectedRevision||!context.canReach(w,c,object)||access==='authorized'&&(!hasPermission(object,c.id)||object.holder!==null&&object.holder!==c.id))return fail('formation_source','形成來源的當前條件不成立。');
 const quantity=amountOf(object,fail);
 if(input.quantity.unit!==quantity.unit||input.quantity.amount>quantity.amount)fail('quantity_precondition','形成來源份量或單位已改變。');
 return object;
}
function freshIdentity(id:string,context:FormationContext):void {
 if(context.world.objects?.some(object=>object.id===id)||context.world.supplies?.some(supply=>supply.id===id)||context.world.characters.some(actor=>actor.id===id)||regions.some(region=>region.id===id||region.location===id))context.fail('identity_used','形成身份已被使用。');
}
function deduct(object:WorldObject,quantity:Quantity,operation:'partition'|'transform'|'separate',context:FormationContext,disposition:'consumed'|'destroyed'='consumed'):void {
 const previous=object.quantity??{amount:1,unit:'item'};
 object.quantity={amount:previous.amount-quantity.amount,unit:previous.unit};object.revision++;
 if(object.quantity.amount===0){object.lifecycle=disposition;object.holder=null;if(operation!=='separate')object.endedByFormation={operation,at:context.world.minute,actorId:context.actor.id,disposition};}
}
export function applyFormation(effect:FormationEffect,context:FormationContext):string[] {
 const {world:w,actor:c,fail}=context;
 if(effect.kind==='separate'){
  const parent=sourceObject({objectId:effect.objectId,expectedRevision:effect.expectedRevision,quantity:effect.quantity,disposition:'consumed'},context,effect.access),quantity=amountOf(parent,fail);
  if(effect.quantity.amount>=quantity.amount)fail('separate_quantity','獨立細分必須留下原整體的其餘份量。');
  freshIdentity(effect.outputId,context);if((w.objects?.length||0)>=512)fail('object_capacity','具體物件已達保存容量。');
  const source:ObjectSource={type:'object',id:parent.id,revision:parent.revision,amount:effect.quantity.amount,unit:effect.quantity.unit,owner:parent.owner};
  const child:WorldObject={id:effect.outputId,source:parent.id,sources:[source],quantity:{...effect.quantity},formation:{operation:'separate',at:w.minute,inputs:[parent.id]},label:parent.label,region:parent.region,holder:parent.holder,owner:parent.owner,...(parent.coOwners?{coOwners:[...parent.coOwners]}:{}),revision:1,state:{...parent.state},...(parent.stateExposure?{stateExposure:{...parent.stateExposure}}:{}),lifecycle:'active',kind:parent.kind,...(parent.consumable===undefined?{}:{consumable:parent.consumable}),knownTo:[...parent.knownTo],allowedTo:[...parent.allowedTo],...(parent.stateTransitions?{stateTransitions:structuredClone(parent.stateTransitions)}:{})};
  if(effect.access==='physical')context.retainPhysical(parent,c,w.minute,'separate',parent.holder,context.hasPermission(parent,c.id));
  deduct(parent,effect.quantity,'separate',context);(w.objects??=[]).push(child);return [`${parent.label}已分出 ${effect.quantity.amount} ${effect.quantity.unit}，其餘份量保留`];
 }
 const inputs=effect.inputs.map(input=>({input,object:sourceObject(input,context,effect.access)}));
 if(effect.operation==='partition'&&effect.inputs[0].quantity.amount!==amountOf(inputs[0].object,fail).amount)fail('partition_quantity','分拆須承接完整原物，不能留下另一件完整原物。');
 if((w.objects?.length||0)+effect.outputs.length>512)fail('object_capacity','具體物件已達保存容量。');
 for(const output of effect.outputs)freshIdentity(output.id,context);
 const units=new Set([...effect.inputs.map(input=>input.quantity.unit),...effect.outputs.map(output=>output.quantity.unit)]);
 if(units.size===1&&effect.outputs.reduce((sum,output)=>sum+output.quantity.amount,0)>effect.inputs.reduce((sum,input)=>sum+input.quantity.amount,0))fail('quantity_creation','相同單位的產量不能大於來源消耗。');
 if(effect.outputs.reduce((sum,output)=>sum+output.quantity.amount,0)>formationLimits.maxAmount)fail('quantity_capacity','同批形成份量超出容量。');
 const coOwners=[...new Set(inputs.flatMap(({object})=>owners(object)))];
 if(coOwners.length>formationLimits.maxSources)fail('ownership_capacity','來源共有人超出有界容量。');
 const allowed=[...rights(inputs[0].object)].filter(actor=>inputs.every(({object})=>rights(object).has(actor)));
 const sources:ObjectSource[]=inputs.map(({input,object})=>({type:'object',id:object.id,revision:object.revision,amount:input.quantity.amount,unit:input.quantity.unit,owner:object.owner,disposition:input.disposition}));
 if(effect.access==='physical')for(const {object} of inputs)context.retainPhysical(object,c,w.minute,effect.operation,object.holder,context.hasPermission(object,c.id));
 for(const {input,object} of inputs)deduct(object,input.quantity,effect.operation,context,input.disposition);
 for(const output of effect.outputs){
  const object:WorldObject={id:output.id,source:inputs[0].object.id,sources:structuredClone(sources),quantity:{...output.quantity},formation:{operation:effect.operation,at:w.minute,inputs:inputs.map(({object})=>object.id)},label:output.label,region:regionOf(c),holder:c.id,owner:coOwners[0],...(coOwners.length>1?{coOwners:[...coOwners]}:{}),revision:1,state:Object.fromEntries(output.state.map(entry=>[entry.key,entry.value])),stateExposure:Object.fromEntries(output.state.map(entry=>[entry.key,entry.exposure])),lifecycle:'active',kind:output.kind,consumable:output.consumable,knownTo:[c.id],allowedTo:[...allowed]};
  (w.objects??=[]).push(object);
 }
 return effect.outputs.map(output=>`${output.label}已形成 ${output.quantity.amount} ${output.quantity.unit}`);
}
