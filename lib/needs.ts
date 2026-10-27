import type { Character, World } from './world';

export const needKeys = ['hunger', 'thirst', 'fatigue', 'sleep'] as const;
export type Need = typeof needKeys[number];
export type NeedValues = Record<Need, number>;
export type BodyNeeds = {version:1;activatedAt:number;updatedAt:number;values:NeedValues;assessed:NeedValues;history:{minute:number;reason:string;before:NeedValues;after:NeedValues}[];dropped:number};
export const needLabels:Record<Need,string> = {hunger:'飢餓',thirst:'口渴',fatigue:'體力疲勞',sleep:'睡眠需求'};
const initial:NeedValues={hunger:20,thirst:20,fatigue:15,sleep:20};
const hourly:NeedValues={hunger:3,thirst:6,fatigue:1,sleep:4};
const stage=(value:number)=>value<40?0:value<65?1:value<85?2:3;
const clamp=(value:number)=>Math.round(Math.max(0,Math.min(100,value))*100)/100;
export function activateBodyNeeds(world:World):void {
 for(const actor of world.characters)if(!actor.needs)actor.needs={version:1,activatedAt:world.minute,updatedAt:world.minute,values:{...initial},assessed:{hunger:0,thirst:0,fatigue:0,sleep:0},history:[],dropped:0};
}
export function changeBodyNeeds(actor:Character,minute:number,delta:Partial<NeedValues>,reason:string):void {
 const state=actor.needs;if(!state)throw Error('身體需求尚未啟用。');
 const before={...state.values};
 for(const key of needKeys){const amount=delta[key]??0;if(!Number.isFinite(amount))throw Error('需求後果不是有限數值。');state.values[key]=clamp(state.values[key]+amount);state.assessed[key]=Math.min(state.assessed[key],stage(state.values[key]));}
 if(needKeys.some(key=>before[key]!==state.values[key])){
  state.history.push({minute,reason,before,after:{...state.values}});state.dropped+=Math.max(0,state.history.length-32);state.history=state.history.slice(-32);
 }
}
export function advanceBodyNeeds(world:World):void {
 for(const actor of world.characters){
  const state=actor.needs;if(!state)continue;
  if(!Number.isFinite(world.minute)||world.minute<state.updatedAt)throw Error('身體需求的世界時間不可倒退。');
  if(state.version!==1||!Number.isFinite(state.activatedAt)||!Number.isFinite(state.updatedAt)||needKeys.some(key=>!Number.isFinite(state.values[key])||state.values[key]<0||state.values[key]>100||!Number.isInteger(state.assessed[key])||state.assessed[key]<0||state.assessed[key]>3))throw Error('身體需求資料超出版本或有限範圍。');
  const elapsed=world.minute-state.updatedAt;if(!elapsed)continue;
  changeBodyNeeds(actor,world.minute,Object.fromEntries(needKeys.map(key=>[key,hourly[key]*elapsed/60])),'世界時間');state.updatedAt=world.minute;
 }
}
export function bodyFeelings(actor:Character):{need:string;feeling:string}[] {
 if(!actor.needs)return [];
 const words:Record<Need,string[]>={hunger:['沒有明顯餓意','有些餓','明顯感到飢餓','強烈感到飢餓'],thirst:['沒有明顯渴意','有些口渴','明顯感到口渴','強烈感到口渴'],fatigue:['身體沒有明顯疲累','身體有些疲累','身體明顯疲累','身體十分疲累'],sleep:['沒有明顯睡意','有些睡意','明顯想睡','睡意強烈']};
 return needKeys.map(key=>({need:needLabels[key],feeling:words[key][stage(actor.needs!.values[key])]}));
}
export function hasUnevaluatedNeed(actor:Character):boolean {
 return !!actor.needs&&needKeys.some(key=>stage(actor.needs!.values[key])>actor.needs!.assessed[key]);
}
export function acknowledgeBodyNeeds(actor:Character):void {
 if(actor.needs)for(const key of needKeys)actor.needs.assessed[key]=stage(actor.needs.values[key]);
}
