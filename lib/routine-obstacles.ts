import type { Action, Character, World } from './world';
import type { EffectCandidate } from './world-effects';
import { regionOf } from './perception';
import { rawRoutineMaterial, supportsRoutineDrink, usableRoutineObject, emptyRoutineVessel } from './routine-materials';

// Reevaluate current relevant facts, rather than caching failed wording or a
// world-wide version. Repairs, replenishment and grants can therefore recover.
// Explanations disclose only what this actor can observe, never hidden owners,
// destinations, permissions or the system's diagnostic evidence.
export function routineObstacle(w:World,c:Character,a:Action,operation:string):string|undefined {
 if(!['tea','coffee','food'].includes(operation))return;
 const region=regionOf(c);
 const target=a.type==='propose'&&a.target&&a.target!==c.location&&a.target!==region?a.target:undefined;
 const targetTool=target?(w.objects||[]).find(o=>o.id===target&&o.kind==='utensil'&&!('contents' in o.state)):undefined;
 if(targetTool&&(targetTool.region!==region||!targetTool.knownTo.includes(c.id)))return '目前找不到可用的指定工具。';
 if(targetTool&&!usableRoutineObject(targetTool,c.id))return '目前沒有可使用的指定工具。';
 const vesselTarget=targetTool?undefined:target;
 const objects=(w.objects||[]).filter(o=>o.region===region&&o.knownTo.includes(c.id)&&(!vesselTarget||o.id===vesselTarget));
 const supplies=(w.supplies||[]).filter(s=>s.region===region&&!s.background&&(!vesselTarget||s.id===vesselTarget));
 if(target&&!objects.length&&!supplies.some(s=>s.knownTo.includes(c.id)))return '目前找不到可用的指定物件。';
 // Food serving binds its exact target or confirmed dish below in the routine
 // interpreter. A label-matched meal elsewhere cannot veto that source.
 if(operation==='food')return;
 const materials=(w.supplies||[]).filter(s=>s.region===region&&!s.background&&rawRoutineMaterial(s,operation));
 if(materials.length&&!materials.some(s=>s.remaining>0&&s.knownTo.includes(c.id)&&s.allowedTo.includes(c.id))){
  return materials.every(s=>s.knownTo.includes(c.id)&&s.remaining===0)?'已知的材料已用完，這次活動尚未完成。':'目前沒有可用的材料，這次活動尚未完成。';
 }
 const utensils=objects.filter(o=>o.kind==='utensil'&&'contents' in o.state);
 const supports=(values:string[]|undefined)=>supportsRoutineDrink(values,operation);
 if(utensils.length&&!utensils.some(o=>supports(o.stateTransitions?.contents)))return '目前的器具不能承接這次飲品，這次活動尚未完成。';
 const usable=utensils.some(o=>supports(o.stateTransitions?.contents)&&emptyRoutineVessel(o.state)&&usableRoutineObject(o,c.id));
 const finite=supplies.filter(s=>s.kind==='utensil'&&'contents' in s.initialState);
 if(!usable&&finite.length&&!finite.some(s=>supports(s.stateTransitions?.contents)))return '目前的器具供應不能承接這次飲品，這次活動尚未完成。';
 if(usable||!vesselTarget&&finite.some(s=>s.remaining>0&&emptyRoutineVessel(s.initialState)&&s.knownTo.includes(c.id)&&s.allowedTo.includes(c.id)))return;
 if(utensils.some(o=>o.state.condition==='broken'))return '可知的器具已損壞，這次活動尚未完成。';
 if((vesselTarget&&utensils.length)||utensils.some(o=>!usableRoutineObject(o,c.id)))return '目前沒有可使用的空器具，這次活動尚未完成。';
 if(finite.length)return finite.every(s=>s.knownTo.includes(c.id)&&s.remaining===0)?'已知的器具供應已用完，這次活動尚未完成。':'目前沒有可使用的器具，這次活動尚未完成。';
}

export function blockedRoutine(w:World,c:Character,reason:string):EffectCandidate {
 const audit=w.routineAudit?.at(-1);
 if(audit&&audit.actorId===c.id&&audit.turn===w.turn){if(audit.result!=='approved')audit.result='blocked';audit.reason=reason;}
 return {status:'denied',effects:[],stages:[],check:null,blockedReason:`這次方法沒有成功：${reason}`};
}
