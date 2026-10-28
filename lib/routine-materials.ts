import type { RoutineBinding } from './routine-world-contract';
import {hasObjectPermission,type WorldObject,type SceneSupply} from './world-effects';

// Pure material and utensil qualifications. Callers retain their own visibility,
// locality, rights, finite availability and pending-output checks.
export function routineIngredient(operation:string,label:string):boolean {
 const pattern=operation==='tea'?/(茶葉|茶包|tea)/i:operation==='coffee'?/(咖啡|coffee)/i:/(簡餐|食物|餐點|food|meal)/i;
 return pattern.test(label);
}
export function rawRoutineMaterial(supply:SceneSupply,operation:string):boolean {
 return supply.kind==='food'&&!supply.initialState.vessel&&routineIngredient(operation,supply.label);
}
export function supportsRoutineDrink(values:string[]|undefined,contents:string):boolean {
 return !!values&&['water',contents].every(value=>values.includes(value));
}
export function emptyRoutineVessel(state:Record<string,string>):boolean {
 return state.contents==='empty'&&state.clean!=='no';
}
export function usableRoutineObject(object:WorldObject,actorId:string,access:'authorized'|'physical'='authorized'):boolean {
 return object.lifecycle==='active'&&object.state.condition!=='broken'&&object.state.available!=='no'&&(access==='physical'||(object.holder===null||object.holder===actorId)&&hasObjectPermission(object,actorId));
}

// A material role keeps its confirmed source semantics for concrete objects and
// supplies alike. Legacy food needs its subject because that kind covers meals
// and ingredients; newer kinds can carry the confirmed source category.
export function routineMaterialSourceMatches(source:WorldObject|SceneSupply,binding:RoutineBinding):boolean {
 if(binding.sourceRole!=='material')return true;
 const state='initialState' in source?source.initialState:source.state;
 const subject=!!binding.sourceSubject&&(source.label.includes(binding.sourceSubject)||['material','category'].some(key=>state[key]===binding.sourceSubject));
 const kind=binding.background?.kind??binding.kind;
 return source.kind==='food'||kind==='food'||!kind?subject:source.kind===kind||source.kind===binding.kind;
}
