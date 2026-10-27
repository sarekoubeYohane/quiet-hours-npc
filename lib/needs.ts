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
  let activeMinutes=activeBodyMinutes(actor,state.updatedAt,world.minute);
  if(actor.plan?.bodyActivity?.kind==='sleep'&&actor.plan.sleep?.naturalWakeAt===undefined&&actor.plan.sleep?.stimulusWakeAt===undefined){
   const remaining=sleepMinutesUntilWake(actor.plan.bodyActivity,state.values.sleep);
   if(remaining<=activeMinutes){activeMinutes=remaining;actor.plan.sleep={elapsedMinutes:actor.plan.sleep?.elapsedMinutes??0,naturalWakeAt:state.updatedAt+remaining};}
  }
  const delta:NeedValues={hunger:hourly.hunger*elapsed/60,thirst:hourly.thirst*elapsed/60,fatigue:hourly.fatigue*elapsed/60,sleep:hourly.sleep*elapsed/60};
  if(actor.plan?.bodyActivity){if(!validBodyActivity(actor.plan.bodyActivity))throw Error('既有活動需求後果無效。');delta.fatigue+=actor.plan.bodyActivity.fatiguePerHour*activeMinutes/60;delta.sleep+=actor.plan.bodyActivity.sleepPerHour*activeMinutes/60;}
  if(actor.plan?.bodyActivity?.kind==='sleep')actor.plan.sleep={...actor.plan.sleep,elapsedMinutes:(actor.plan.sleep?.elapsedMinutes??0)+activeMinutes};
  changeBodyNeeds(actor,world.minute,delta,'世界時間與實際活動');
  state.updatedAt=world.minute;
 }
}
export function bodyFeelings(actor:Character):{need:string;feeling:string}[] {
 if(!actor.needs)return [];
 const words:Record<Need,string[]>={hunger:['沒有明顯餓意','有些餓','明顯感到飢餓','強烈感到飢餓'],thirst:['沒有明顯渴意','有些口渴','明顯感到口渴','強烈感到口渴'],fatigue:['身體沒有明顯疲累','身體有些疲累','身體明顯疲累','身體十分疲累'],sleep:['沒有明顯睡意','有些睡意','明顯想睡','睡意強烈']};
 return needKeys.map(key=>({need:needLabels[key],feeling:words[key][stage(actor.needs!.values[key])]}));
}
export function hasUnevaluatedNeed(actor:Character):boolean {
 return !isSleeping(actor)&&!!actor.needs&&needKeys.some(key=>stage(actor.needs!.values[key])>actor.needs!.assessed[key]);
}
export function acknowledgeBodyNeeds(actor:Character):void {
 if(actor.needs)for(const key of needKeys)actor.needs.assessed[key]=stage(actor.needs.values[key]);
}

export type IngestEffect={kind:'ingest';version:1;objectId:string;expectedRevision:number;hungerRelief:number;thirstRelief:number};
export function validIngestEffect(value:unknown):value is IngestEffect {
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const item=value as Record<string,unknown>;
 return Object.keys(item).length===6&&item.kind==='ingest'&&item.version===1&&typeof item.objectId==='string'&&!!item.objectId&&item.objectId.length<=120&&Number.isSafeInteger(item.expectedRevision)&&(item.expectedRevision as number)>0&&[item.hungerRelief,item.thirstRelief].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=60)&&((item.hungerRelief as number)>0||(item.thirstRelief as number)>0);
}
export const ingestSchema={type:'object',properties:{kind:{type:'string',const:'ingest'},version:{type:'integer',const:1},objectId:{type:'string',minLength:1,maxLength:120},expectedRevision:{type:'integer',minimum:1},hungerRelief:{type:'number',minimum:0,maximum:60},thirstRelief:{type:'number',minimum:0,maximum:60}},required:['kind','version','objectId','expectedRevision','hungerRelief','thirstRelief'],additionalProperties:false};

export type BodyActivity={version:1;kind:'rest'|'exertion'|'sleep';fatiguePerHour:number;sleepPerHour:number};
export function validBodyActivity(value:unknown):value is BodyActivity {
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const item=value as Record<string,unknown>;
 if(Object.keys(item).length!==4||item.version!==1||typeof item.fatiguePerHour!=='number'||!Number.isFinite(item.fatiguePerHour)||typeof item.sleepPerHour!=='number'||!Number.isFinite(item.sleepPerHour))return false;
 if(item.kind==='rest')return item.fatiguePerHour>=-20&&item.fatiguePerHour<=0&&item.sleepPerHour===0;
 if(item.kind==='exertion')return item.fatiguePerHour>=0&&item.fatiguePerHour<=20&&item.sleepPerHour===0;
 return item.kind==='sleep'&&item.fatiguePerHour>=-20&&item.fatiguePerHour<=0&&item.sleepPerHour>=-20&&item.sleepPerHour<-4;
}
const profileVariant=(kind:string,fatigue:object,sleep:object)=>({type:'object',properties:{version:{type:'integer',const:1},kind:{type:'string',const:kind},fatiguePerHour:fatigue,sleepPerHour:sleep},required:['version','kind','fatiguePerHour','sleepPerHour'],additionalProperties:false});
export const bodyActivitySchema={anyOf:[profileVariant('rest',{type:'number',minimum:-20,maximum:0},{type:'number',const:0}),profileVariant('exertion',{type:'number',minimum:0,maximum:20},{type:'number',const:0}),profileVariant('sleep',{type:'number',minimum:-20,maximum:0},{type:'number',minimum:-20,exclusiveMaximum:-4})]};
export function applyBodyActivity(actor:Character,minute:number,profile:BodyActivity,elapsed:number,base?:Pick<NeedValues,'fatigue'|'sleep'>):number {
 if(!validBodyActivity(profile)||!Number.isFinite(elapsed)||elapsed<0)throw Error('活動需求後果超出有界契約。');
 if(!elapsed)return 0;
 const available=profile.kind==='sleep'?Math.min(elapsed,sleepMinutesUntilWake(profile,base?base.sleep-hourly.sleep*elapsed/60:actor.needs!.values.sleep)):elapsed;
 const fatigue=profile.fatiguePerHour*available/60,sleep=profile.sleepPerHour*available/60;
 changeBodyNeeds(actor,minute,base?{fatigue:clamp(base.fatigue+fatigue)-actor.needs!.values.fatigue,sleep:clamp(base.sleep+sleep)-actor.needs!.values.sleep}:{fatigue,sleep},`實際活動 ${profile.kind} ${available}分鐘`);
 return available;
}

// Preserve the unclamped integral for a newly confirmed first interval. Only
// fatigue/sleep are replaced; endpoint ingestion remains an independent fact.
export function bodyIntervalBase(actor:Character,minute:number):Pick<NeedValues,'fatigue'|'sleep'>|undefined {
 if(!actor.needs)return;
 const elapsed=minute-actor.needs.updatedAt,plan=actor.plan;
 const active=activeBodyMinutes(actor,actor.needs.updatedAt,minute);
 return {fatigue:actor.needs.values.fatigue+hourly.fatigue*elapsed/60+(plan?.bodyActivity?.fatiguePerHour??0)*active/60,sleep:actor.needs.values.sleep+hourly.sleep*elapsed/60+(plan?.bodyActivity?.sleepPerHour??0)*active/60};
}

export function isSleeping(actor:Character):boolean { return actor.plan?.bodyActivity?.kind==='sleep'&&actor.plan.sleep?.naturalWakeAt===undefined&&actor.plan.sleep?.stimulusWakeAt===undefined; }

export const naturalWakeLevel=20;
export function sleepMinutesUntilWake(profile:BodyActivity,sleepValue:number):number {
 if(!validBodyActivity(profile)||profile.kind!=='sleep')throw Error('睡眠需要已確認的恢復規則。');
 return Math.max(0,(sleepValue-naturalWakeLevel)*60/-(hourly.sleep+profile.sleepPerHour));
}

export function isSleepStimulus(observation:Pick<import('./perception').Observation,'sense'|'urgency'>):boolean {
 return observation.sense==='hearing'&&(observation.urgency==='strong'||observation.urgency==='danger')||observation.sense==='touch'&&observation.urgency==='direct';
}

export function activeBodyMinutes(actor:Character,from:number,to:number):number {
 const plan=actor.plan;if(!plan?.bodyActivity)return 0;
 const end=Math.min(to,plan.until,plan.sleep?.naturalWakeAt??Infinity,plan.sleep?.stimulusWakeAt??Infinity);
 const elapsed=Math.max(0,end-Math.max(from,plan.startedAt));
 return plan.bodyActivity.kind==='sleep'&&plan.sleep?.naturalWakeAt===undefined&&plan.sleep?.stimulusWakeAt===undefined&&actor.needs?Math.min(elapsed,sleepMinutesUntilWake(plan.bodyActivity,actor.needs.values.sleep)):elapsed;
}
