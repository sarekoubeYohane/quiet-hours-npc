import type { Character, World } from './world';
import { activeBodyMinutes } from './needs';

/** No product balance is defined here. Only explicitly configured isolated tests activate v1. */
export type MentalEnergyPolicy={version:1;kind:'test';id:string;initial:number;maximum:number;awakePerHour:number;regulationCost:number;lowAt:number};
export type MentalEnergy={version:1;policy:MentalEnergyPolicy;value:number;activatedAt:number;updatedAt:number;history:{kind:'natural';from:number;minute:number;reason:string;before:number;after:number;awakeMinutes:number}[];dropped:number};
export function readMentalEnergyTestPolicy(environment:{APP_ENV?:string;MENTAL_ENERGY_TEST_POLICY?:string},world:World):MentalEnergyPolicy|undefined {
 // Saved fixture policy remains authoritative, so environment isolation must
 // also protect reads-for-write when the activation binding has been removed.
 if((environment.MENTAL_ENERGY_TEST_POLICY||world.characters.some(actor=>actor.mentalEnergy?.policy.kind==='test'))&&!['local','test'].includes(environment.APP_ENV||''))throw Error('精神電量測試政策只允許隔離 local/test 環境。');
 if(!environment.MENTAL_ENERGY_TEST_POLICY)return;
 const p=JSON.parse(environment.MENTAL_ENERGY_TEST_POLICY) as MentalEnergyPolicy;
 assertMentalEnergyPolicy(p);return p;
}
export function assertMentalEnergyPolicy(p:MentalEnergyPolicy):void {
 if(!p||p.version!==1||p.kind!=='test'||typeof p.id!=='string'||!p.id||p.id.length>120||Object.keys(p).sort().join(',')!=='awakePerHour,id,initial,kind,lowAt,maximum,regulationCost,version'||![p.initial,p.maximum,p.awakePerHour,p.regulationCost,p.lowAt].every(Number.isFinite)||p.maximum<=0||p.initial<0||p.initial>p.maximum||p.awakePerHour<0||p.regulationCost<=0||p.regulationCost>p.maximum||p.lowAt<0||p.lowAt>p.maximum)throw Error('精神電量需要完整有效的明示測試政策。');
}
export function activateMentalEnergy(world:World,policy?:MentalEnergyPolicy):void {
 if(!policy)return;
 for(const actor of world.characters)if(!actor.mentalEnergy)actor.mentalEnergy={version:1,policy:structuredClone(policy),value:policy.initial,activatedAt:world.minute,updatedAt:world.minute,history:[],dropped:0};
}
export function mentalEnergyFeeling(actor:Character):{feeling:string;canRegulate:boolean}|undefined {
 const s=actor.mentalEnergy;if(!s)return;
 return {feeling:s.value<s.policy.lowAt?'心力有些吃緊，可以考慮照顧自己；仍可自行取捨。':'心裡還有餘裕。',canRegulate:s.value>=s.policy.regulationCost};
}
export type MentalInterval={from:number;to:number;before:number;sleepMinutes:number};
export function mentalIntervals(world:World,to:number):Map<string,MentalInterval>{
 return new Map(world.characters.filter(c=>c.mentalEnergy).map(c=>{
  const s=c.mentalEnergy!;assertMentalEnergyPolicy(s.policy);if(s.version!==1||!Number.isFinite(s.value)||s.value<0||s.value>s.policy.maximum||!Number.isFinite(s.updatedAt)||to<s.updatedAt)throw Error('精神電量資料或世界時間無效。');
  return [c.id,{from:s.updatedAt,to,before:s.value,sleepMinutes:c.plan?.bodyActivity?.kind==='sleep'?activeBodyMinutes(c,s.updatedAt,to):0}];
 }));
}
/** Recompute this in-flight interval from its pre-clamp balance when first-interval sleep is confirmed. */
export function settleMentalInterval(actor:Character,interval:MentalInterval,additionalSleep=0):void {
 const s=actor.mentalEnergy;if(!s)return;
 const awakeMinutes=Math.max(0,interval.to-interval.from-interval.sleepMinutes-additionalSleep);
 const value=Math.max(0,Math.min(s.policy.maximum,interval.before-s.policy.awakePerHour*awakeMinutes/60));
 // The preview is replaced, never refunded as a second income source.
 const previous=s.history.findIndex(entry=>entry.kind==='natural'&&entry.from===interval.from&&entry.minute===interval.to);
 if(previous>=0)s.history.splice(previous,1);
 s.value=value;s.updatedAt=interval.to;
 if(interval.to>interval.from){s.history.push({kind:'natural',from:interval.from,minute:interval.to,reason:awakeMinutes?'清醒世界時間自然消耗':'實際睡眠暫停自然消耗',before:interval.before,after:value,awakeMinutes});s.dropped+=Math.max(0,s.history.length-32);s.history=s.history.slice(-32);}
}
