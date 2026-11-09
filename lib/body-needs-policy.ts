import type { Character, World } from './world';
import { activateBodyNeeds, changeBodyNeeds, isSleeping, validBodyActivity, needKeys, type Need, type NeedValues } from './needs';

export const personalNeedKeys = ['hunger', 'thirst', 'sleep'] as const;
type PersonalNeed = typeof personalNeedKeys[number];
export type NeedTraits = Record<PersonalNeed, number>;
export type PersonalNeeds = {
 version:2; status:'active'|'pending-sleep'; requestedAt:number; activatedAt?:number;
 source:string; traits:NeedTraits; constraints:Record<PersonalNeed,number[]>; seed:number;
 grid?:{start:number;dice:Record<Need,number>};
 // Fixed point: 60,000,000 units per point makes all approved five-minute
 // rates exact (micro-points per world-minute). Display rounding never feeds back.
 units:NeedValues;
};
export type BodyNeedsSetup={id:string;source?:string;traits?:Partial<Record<PersonalNeed,number[]>>;initial?:Partial<NeedValues>;feelings?:Partial<Record<Need,number>>};
const choices=[0.8,1,1.2];
const middle=[20,52.5,75,92.5];
const stage=(n:number)=>n<40?0:n<65?1:n<85?2:3;
export function validateBodyNeedsSetup(world:World,value:unknown):BodyNeedsSetup[]{
 if(!Array.isArray(value)||!value.length||value.length>world.characters.length)throw Error('請逐人確認需求設定。');
 const ids=new Set<string>();
 return value.map(raw=>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!['id','source','traits','initial','feelings'].includes(k)))throw Error('需求設定格式無效。');
  const item=raw as BodyNeedsSetup, actor=world.characters.find(c=>c.id===item.id);
  if(!actor||ids.has(item.id)||actor.needs?.personal)throw Error('人物不存在、重複或已確認需求政策；既有特性不重抽。');
  ids.add(item.id);
  if(item.source!==undefined&&(typeof item.source!=='string'||!item.source.trim()||item.source.length>500))throw Error('請提供有界背景設定來源。');
  for(const field of ['traits','initial','feelings'] as const){const values=item[field];if(values!==undefined&&(!values||typeof values!=='object'||Array.isArray(values)))throw Error('需求設定必須是逐項資料。');}
  if(item.traits&&Object.keys(item.traits).some(k=>!personalNeedKeys.includes(k as PersonalNeed)))throw Error('只提供飢餓、口渴及清醒睡意特性。');
  for(const key of personalNeedKeys){const allowed=item.traits?.[key];if(allowed!==undefined&&(!Array.isArray(allowed)||!allowed.length||new Set(allowed).size!==allowed.length||allowed.some(v=>!choices.includes(v))))throw Error('需求特性必須明示0.8、1、1.2的合法子集。');}
  for(const field of ['initial','feelings'] as const)if(item[field]&&Object.keys(item[field]!).some(k=>!needKeys.includes(k as Need)))throw Error('未知的身體需求。');
  for(const key of needKeys){
   const n=item.initial?.[key],feeling=item.feelings?.[key];
   if(n!==undefined&&(!Number.isFinite(n)||n<0||n>100||Math.abs(Math.round(n*100)-n*100)>1e-8))throw Error('開局需求值須為0至100、最多兩位小數。');
   if(feeling!==undefined&&(!Number.isInteger(feeling)||feeling<0||feeling>3))throw Error('需求感受區間無效。');
   if(n!==undefined&&feeling!==undefined&&stage(n)!==feeling)throw Error('開局需求值與感受矛盾，請先修正草稿。');
   const initial=n??(feeling===undefined?undefined:middle[feeling]);
   if(actor.needs&&initial!==undefined&&actor.needs.values[key]!==initial)throw Error('既有需求保持目前值，不能藉導入重設。');
  }
  return structuredClone(item);
 });
}
function sample():number {const n=Math.random();if(!Number.isFinite(n)||n<0||n>=1)throw Error('需求骰亂數無效。');return Math.floor(n*6)+1;}
export function enablePersonalNeeds(world:World,setups:BodyNeedsSetup[]):void{
 const validated=validateBodyNeedsSetup(world,setups);
 const absent=new Set(world.characters.filter(c=>!c.needs).map(c=>c.id));
 activateBodyNeeds({...world,characters:world.characters.filter(c=>validated.some(v=>v.id===c.id))});
 for(const setup of validated){
  const actor=world.characters.find(c=>c.id===setup.id)!,state=actor.needs!;
  if(absent.has(actor.id))for(const key of needKeys)state.values[key]=setup.initial?.[key]??(setup.feelings?.[key]===undefined?state.values[key]:middle[setup.feelings[key]!]);
  const constraints={} as Record<PersonalNeed,number[]>,traits={} as NeedTraits;
  for(const key of personalNeedKeys){const allowed=setup.traits?.[key]??choices;constraints[key]=[...allowed];traits[key]=allowed.length===1?allowed[0]:allowed[Math.floor((sample()-1)*allowed.length/6)];}
  state.personal={version:2,status:isSleeping(actor)?'pending-sleep':'active',requestedAt:world.minute,...(!isSleeping(actor)?{activatedAt:world.minute}:{}),source:setup.source?.trim()??'擁有者明示確認；未指定者採一般範圍',traits,constraints,seed:Math.floor(Math.random()*0xffffffff)+1,units:Object.fromEntries(needKeys.map(key=>[key,Math.round(state.values[key]*60000000)])) as NeedValues};
 }
}
export function finishPendingNeeds(world:World):void{
 for(const actor of world.characters){const p=actor.needs?.personal;if(p?.status==='pending-sleep'&&!isSleeping(actor)){p.status='active';p.activatedAt=world.minute;p.units=Object.fromEntries(needKeys.map(key=>[key,Math.round(actor.needs!.values[key]*60000000)])) as NeedValues;}}
}
export function personalNeedsActive(actor:Character):boolean{return actor.needs?.personal?.status==='active';}

// A persisted PRNG state is sampled only at a new effective time grid. Clone
// previews use the same sequence without consuming the authoritative stream.
function nextD6(p:PersonalNeeds):number{
 let n:number;
 do{let x=p.seed>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;p.seed=x>>>0;n=p.seed;}while(n>4294967292);
 return (n-1)%6+1;
}
export function needGrid(actor:Character,minute:number):Record<Need,number>{
 const p=actor.needs!.personal!,start=Math.floor(minute/5)*5;
 if(p.grid?.start!==start)p.grid={start,dice:Object.fromEntries(needKeys.map(key=>[key,nextD6(p)])) as Record<Need,number>};
 return p.grid.dice;
}
export function personalTimeDelta(actor:Character,from:number,to:number,profile?:import('./needs').BodyActivity):number{
 const state=actor.needs!,p=state.personal!;
 let slept=0;
 for(let at=from;at<to;){
  const end=Math.min(to,(Math.floor(at/5)+1)*5),dice=needGrid(actor,at),minutes=end-at;
  const currentProfile=profile?.kind==='sleep'&&Math.min(actor.plan?.sleep?.naturalWakeAt??Infinity,actor.plan?.sleep?.stimulusWakeAt??Infinity)<=at?undefined:profile;
  const actualSleep=currentProfile?.kind==='sleep';
  const awakeSleep=4*p.traits.sleep;
  const rates:NeedValues={hunger:3*p.traits.hunger,thirst:6*p.traits.thirst,fatigue:1+(currentProfile?.fatiguePerHour??0),sleep:actualSleep?4+currentProfile!.sleepPerHour:awakeSleep};
  const before={...state.values};
  for(const key of needKeys){const factor=choices[Math.floor((dice[key]-1)/2)];p.units[key]=Math.max(0,Math.min(6000000000,p.units[key]+Math.round(rates[key]*1000000)*factor*minutes));state.values[key]=Math.round(p.units[key]/600000)/100;}
  if(actualSleep){slept+=minutes;if(end%5===0&&p.units.sleep<=1200000000){actor.plan!.sleep={...actor.plan!.sleep,elapsedMinutes:actor.plan!.sleep?.elapsedMinutes??0,naturalWakeAt:end};}}
  // Reuse established history/assessment handling without reapplying the delta.
  const after={...state.values};state.values=before;changeBodyNeeds(actor,end,Object.fromEntries(needKeys.map(key=>[key,after[key]-before[key]])),'個人化需求與實際五分鐘時段',true);
  at=end;
 }
 return slept;
}

export function advancePersonalActor(actor:Character,to:number):void{
 validatePersonalNeeds(actor);
 if(actor.plan?.bodyActivity&&(!validBodyActivity(actor.plan.bodyActivity)||!Number.isFinite(actor.plan.startedAt)||!Number.isFinite(actor.plan.until)||[actor.plan.sleep?.naturalWakeAt,actor.plan.sleep?.stimulusWakeAt].some(t=>t!==undefined&&!Number.isFinite(t))))throw Error('已保存活動身體後果或時間無效。');
 const state=actor.needs!,from=state.updatedAt;
 if(to<from||!Number.isFinite(to))throw Error('身體需求時間不可倒退。');
 let slept=0;
 for(let at=from;at<to;){
  const plan=actor.plan,profile=plan?.bodyActivity;
  const start=plan?.startedAt??Infinity,end=Math.min(plan?.until??Infinity,plan?.sleep?.naturalWakeAt??Infinity,plan?.sleep?.stimulusWakeAt??Infinity);
  const active=profile&&at>=start&&at<end;
  const until=Math.min(to,at<start?start:end>at?end:to);
  slept+=personalTimeDelta(actor,at,until,active?profile:undefined);at=until;
 }
 if(actor.plan?.bodyActivity?.kind==='sleep')actor.plan.sleep={...actor.plan.sleep,elapsedMinutes:(actor.plan.sleep?.elapsedMinutes??0)+slept};
 state.updatedAt=to;
}

export function applyPersonalActivity(actor:Character,minute:number,profile:import('./needs').BodyActivity,elapsed:number,snapshot?:Character):number{
 if(!elapsed)return 0;
 // A legacy API may confirm a first activity interval after time was advanced.
 // Replay that uncommitted interval from its exact candidate snapshot with the
 // same persisted random stream, retaining endpoint ingestion and other needs.
 const replay=snapshot?structuredClone(snapshot):structuredClone(actor);
 const from=minute-elapsed;
 if(snapshot)advancePersonalActor(replay,from);
 replay.plan={...actor.plan!,bodyActivity:profile,startedAt:from,until:minute,sleep:profile.kind==='sleep'?{elapsedMinutes:0}:undefined};
 advancePersonalActor(replay,minute);
 const desired=replay.needs!,state=actor.needs!;
 const delta={fatigue:desired.values.fatigue-state.values.fatigue,sleep:desired.values.sleep-state.values.sleep};
 changeBodyNeeds(actor,minute,delta,`實際活動 ${profile.kind} ${elapsed}分鐘`,true);
 state.personal!.units.fatigue=desired.personal!.units.fatigue;state.personal!.units.sleep=desired.personal!.units.sleep;
 if(profile.kind==='sleep'&&actor.plan){actor.plan.sleep=replay.plan!.sleep;return replay.plan!.sleep!.elapsedMinutes;}
 return elapsed;
}
export function maximumSleepMinutes(actor:Character,profile:import('./needs').BodyActivity):number{
 const start=actor.needs!.updatedAt;
 const slowestMinutes=Math.max(0,actor.needs!.personal!.units.sleep/60000000-20)*60/(-(4+profile.sleepPerHour)*0.8);
 return Math.ceil((start+slowestMinutes)/5)*5-start;
}

export function validatePersonalNeeds(actor:Character):void{
 const p=actor.needs?.personal;
 if(!p)return;
 const finite=(n:unknown)=>typeof n==='number'&&Number.isFinite(n);
 if(p.version!==2||!['active','pending-sleep'].includes(p.status)||!finite(p.requestedAt)||(p.status==='active'&&!finite(p.activatedAt))||!Number.isSafeInteger(p.seed)||p.seed<=0||p.seed>0xffffffff||!p.units||needKeys.some(k=>!finite(p.units[k])||p.units[k]<0||p.units[k]>6000000000||(p.status==='active'&&Math.abs(Math.round(p.units[k]/600000)/100-actor.needs!.values[k])>1e-8))||!p.traits||!p.constraints||personalNeedKeys.some(k=>!choices.includes(p.traits[k])||!Array.isArray(p.constraints[k])||!p.constraints[k].length||p.constraints[k].some(n=>!choices.includes(n))||!p.constraints[k].includes(p.traits[k]))||typeof p.source!=='string'||!p.source||p.source.length>500)throw Error('個人化需求政策資料版本或有限範圍無效。');
 if(p.grid&&(!Number.isSafeInteger(p.grid.start)||p.grid.start%5!==0||p.grid.start>actor.needs!.updatedAt||p.status==='pending-sleep'||!p.grid.dice||needKeys.some(k=>!Number.isInteger(p.grid!.dice[k])||p.grid!.dice[k]<1||p.grid!.dice[k]>6)))throw Error('已保存需求時段骰果無效。');
}
