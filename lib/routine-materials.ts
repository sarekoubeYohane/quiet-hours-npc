import type { WorldObject, SceneSupply } from './world-effects';

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
export function usableRoutineObject(object:WorldObject,actorId:string):boolean {
 return object.lifecycle==='active'&&object.state.condition!=='broken'&&object.state.available!=='no'&&(object.holder===null||object.holder===actorId)&&(object.owner===actorId||object.allowedTo.includes(actorId));
}
