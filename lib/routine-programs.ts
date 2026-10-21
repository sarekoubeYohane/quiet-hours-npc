import type { Character, World } from './world';
import { regionOf } from './perception';
import { commitActivityPhase, EffectValidationError, type ActivityPhase, type Effect, type EffectCandidate, type WorldObject } from './world-effects';

import type { RoutineProgram } from './routine-program-contract';

// The legacy binder supplies current authorized references, never its effects.
// Programs choose the actual effects and their times; this adapter only resolves
// optional roles and sequential guards before the existing validator executes.
export function bindRoutineProgram(w:World,c:Character,legacy:EffectCandidate,program:RoutineProgram):EffectCandidate {
 if(legacy.status!=='accepted')return legacy;
 if(program.branches){
  const branches=program.branches.map(branch=>{
   const compiled=bindRoutineProgram(w,c,legacy,{operation:program.operation,effects:branch.effects,stages:branch.stages});
   return {...compiled.branches![0],outcomes:branch.outcomes};
  });
  const effects=[...legacy.effects,...(legacy.stages||[]).flatMap(s=>s.effects)];
  const vessels=effects.flatMap(e=>e.kind==='state'?[e.objectId]:[]);
  const materialized=effects.flatMap(e=>e.kind==='materialize'?[e.supplyId]:[]);
  const existing=effects.flatMap(e=>'objectId' in e&&w.objects?.some(o=>o.id===e.objectId)?[e.objectId]:[]);
  const references=[...new Set([...existing,...vessels,...materialized,...(legacy.stages||[]).flatMap(s=>s.requiredTools||[])])].filter(id=>!w.supplies?.find(s=>s.id===id)?.pending).sort();
  const vessel=vessels[0]||materialized.find(id=>w.supplies?.find(s=>s.id===id)?.kind==='utensil');
  const subject=vessel||references[0];if(!subject)throw Error('日常判定缺少受信任的本次對象。');
  return {status:'accepted',effects:[],stages:[],check:program.check||null,confirmedDurationMinutes:legacy.confirmedDurationMinutes,preparationSupplies:legacy.preparationSupplies,branches,trialBinding:{operation:program.operation,subject,references},pendingResultSupplies:materialized.filter(id=>w.supplies?.find(s=>s.id===id)?.pending)};
 }

 const all=[...legacy.effects,...(legacy.stages||[]).flatMap(s=>s.effects)],roles=new Map<string,string>();
 for(const phase of legacy.stages||[])for(const condition of phase.preconditions){const o=w.objects?.find(o=>o.id===condition.objectId);if(o?.kind==='utensil'&&'contents' in o.state)roles.set('vessel',o.id);}
 for(const e of all){
  if(e.kind==='materialize'){
   const s=w.supplies!.find(s=>s.id===e.supplyId)!;
   const role=s.kind==='utensil'?'vesselSupply':legacy.preparationSupplies?.includes(s.id)?'materialSupply':'productSupply';roles.set(role,s.id);roles.set(role==='vesselSupply'?'vessel':role==='materialSupply'?'material':'product',`${s.id}:${s.background?.sequence??s.remaining}`);
  }else if(e.kind==='transfer'){const o=w.objects?.find(o=>o.id===e.objectId);if(o)roles.set(o.kind==='utensil'?'vessel':'drink',o.id);}
  else if(e.kind==='state'&&e.key==='contents')roles.set('vessel',e.objectId);
  else if(e.kind==='consume')roles.set(legacy.preparationSupplies?.some(id=>e.objectId.startsWith(id+':'))?'material':'drink',e.objectId);
 }
 const tools=[...new Set((legacy.stages||[]).flatMap(s=>s.requiredTools||[]))];
 const sim=structuredClone(w),actor=sim.characters.find(x=>x.id===c.id)!,stages:ActivityPhase[]=[];
 for(const stage of [...(program.effects?.length?[{afterMinutes:0,effects:program.effects}]:[]),...program.stages]){
  const bindings=new Map<string,WorldObject>();for(const [role,id] of roles){const o=sim.objects?.find(o=>o.id===id);if(o?.lifecycle==='active')bindings.set(role,structuredClone(o));}
  const effects:Effect[]=[];
  const guards=[...new Set([...bindings.values()].map(o=>o.id))].filter(id=>!roles.get('product')||id!==roles.get('product')).map(id=>{const o=sim.objects!.find(o=>o.id===id)!;return {objectId:id,revision:o.revision,region:o.region,holder:o.holder,state:{...o.state}};});
  for(const step of stage.effects){
   const id=roles.get(step.role);if(!id)continue; // Server-owned optional roles only.
   if(step.kind==='materialize'){
    const s=sim.supplies!.find(s=>s.id===id)!;effects.push({kind:'materialize',supplyId:id,expectedRemaining:s.remaining});
    const role=step.role==='vesselSupply'?'vessel':step.role==='materialSupply'?'material':'product';
    bindings.set(role,{id:roles.get(role)!,revision:1,holder:c.id,state:{...s.initialState}} as WorldObject);
   }else{
    const o=bindings.get(step.role);if(!o)throw new EffectValidationError('日常角色尚未取得。',{reason:'routine_role',role:step.role});
    if(step.kind==='transfer'){const holder=step.toHolder==='actor'?c.id:null;if(o.holder===holder)continue;effects.push({kind:'transfer',objectId:id,expectedRevision:o.revision++,toHolder:holder,toRegion:regionOf(c)});o.holder=holder;}
    else if(step.kind==='consume')effects.push({kind:'consume',objectId:id,expectedRevision:o.revision++});
    else {if(o.state[step.key]===step.value||step.key==='clean'&&o.state.clean===undefined)continue;effects.push({kind:'state',objectId:id,expectedRevision:o.revision++,key:step.key,value:step.value});o.state[step.key]=step.value;}
   }
  }
  if(effects.length>4||guards.length>4)throw Error('綁定後日常階段超出既有效果容量。');
  const phase={afterMinutes:stage.afterMinutes,preconditions:guards,effects,...(tools.length?{requiredTools:tools}:{})};
  sim.minute=stage.afterMinutes===0?w.minute:w.minute-15+stage.afterMinutes;commitActivityPhase(sim,actor,phase,stages.length);stages.push(phase);
  const product=sim.objects?.find(o=>o.id===roles.get('product'));
  if(product?.state.vessel){const vessel=sim.objects?.find(o=>o.id===product.state.vessel);if(!vessel||vessel.state.contents!==product.state.beverage||vessel.holder!==product.holder||vessel.region!==product.region)throw new EffectValidationError('飲品與容器的結果不一致。',{reason:'vessel_continuity'});}

 }
 const initial=stages[0]?.afterMinutes===0?stages.shift()!.effects:[];
 if(!stages.length)stages.push({afterMinutes:legacy.confirmedDurationMinutes!,preconditions:[],effects:[]});
 return {status:'accepted',effects:[],stages:[],check:null,confirmedDurationMinutes:legacy.confirmedDurationMinutes,preparationSupplies:legacy.preparationSupplies,branches:[{outcomes:['critical-success','success','mixed','failure','critical-failure'],effects:initial,stages}]};
}
