import type { Action, Character, World } from './world';
import type { EffectCandidate } from './world-effects';
import { regionOf } from './perception';

// Reevaluate current relevant facts, rather than caching failed wording or a
// world-wide version. Repairs, replenishment and grants can therefore recover.
// Explanations disclose only what this actor can observe, never hidden owners,
// destinations, permissions or the system's diagnostic evidence.
export function routineObstacle(w:World,c:Character,a:Action,operation:string):string|undefined {
 if(!['tea','coffee','food'].includes(operation))return;
 const region=regionOf(c);
 const target=a.type==='propose'&&a.target&&a.target!==c.location&&a.target!==region?a.target:undefined;
 const objects=(w.objects||[]).filter(o=>o.region===region&&o.knownTo.includes(c.id)&&(!target||o.id===target));
 const supplies=(w.supplies||[]).filter(s=>s.region===region&&!s.background&&(!target||s.id===target));
 if(target&&!objects.length&&!supplies.some(s=>s.knownTo.includes(c.id)))return '目前找不到可用的指定物件。';
 const ingredient=operation==='tea'?/(茶葉|茶包|tea)/i:operation==='coffee'?/(咖啡|coffee)/i:/(簡餐|食物|餐點|food|meal)/i;
 const materials=(w.supplies||[]).filter(s=>s.region===region&&!s.background&&s.kind==='food'&&!('vessel' in s.initialState)&&ingredient.test(s.label));
 if(materials.length&&!materials.some(s=>s.remaining>0&&s.knownTo.includes(c.id)&&s.allowedTo.includes(c.id))){
  return materials.every(s=>s.knownTo.includes(c.id)&&s.remaining===0)?'已知的材料已用完，這次活動尚未完成。':'目前沒有可用的材料，這次活動尚未完成。';
 }
 if(operation==='food')return;
 const utensils=objects.filter(o=>o.kind==='utensil'&&'contents' in o.state);
 const usable=utensils.some(o=>o.lifecycle==='active'&&o.state.contents==='empty'&&o.state.condition!=='broken'&&(o.holder===null||o.holder===c.id)&&(o.owner===c.id||o.allowedTo.includes(c.id)));
 const finite=supplies.filter(s=>s.kind==='utensil'&&'contents' in s.initialState);
 if(usable||!target&&finite.some(s=>s.remaining>0&&s.knownTo.includes(c.id)&&s.allowedTo.includes(c.id)))return;
 if(utensils.some(o=>o.state.condition==='broken'))return '可知的器具已損壞，這次活動尚未完成。';
 if(utensils.some(o=>!(w.supplies||[]).some(s=>s.id===o.source&&s.background)))return '目前沒有可使用的空器具，這次活動尚未完成。';
 if(finite.length)return finite.every(s=>s.knownTo.includes(c.id)&&s.remaining===0)?'已知的器具供應已用完，這次活動尚未完成。':'目前沒有可使用的器具，這次活動尚未完成。';
}

export function blockedRoutine(w:World,c:Character,reason:string):EffectCandidate {
 const audit=w.routineAudit?.at(-1);
 if(audit&&audit.actorId===c.id&&audit.turn===w.turn){if(audit.result!=='approved')audit.result='blocked';audit.reason=reason;}
 return {status:'denied',effects:[],stages:[],check:null,blockedReason:`這次方法沒有成功：${reason}`};
}
