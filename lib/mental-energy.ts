import { assertFormalMentalPolicy, assertFormalMentalEnergy, formalEnergyStageIndex, settleFormalMentalInterval, type FormalSettlement, type FormalDraw } from './formal-mental-policy';
import { appendMentalHistory } from './mental-history';
import { collectProcessSlices, parseProcessFeeling, processFeelingForDecision, type ProcessSlice } from './mental-process';
import type { Character, World } from './world';
import { activeBodyMinutes } from './needs';

/** Legacy isolated test policy and the separately validated formal policy share state writers. */
export type MentalEnergyPolicy={version:1;kind:'test'|'formal';id:string;initial:number;maximum:number;awakePerHour:number;regulationCost:number;lowAt:number;process?:{seed:number;slotMinutes:number;levels:number[];multipliers:number[]};experience?:{levels:number[]}};
export type MentalEnergy={formal?:FormalSettlement;controlAssessments?:import('./controlled-feelings').ControlledAssessmentState;processSequence?:number;version:1;policy:MentalEnergyPolicy;value:number;activatedAt:number;updatedAt:number;history:{draws?:FormalDraw[];sleepDelta?:number;rawDelta?:number;groupId?:string;kind:'natural'|'experience'|'process'|'regulation';source?:string;effort?:string;naturalDelta?:number;processDelta?:number;processMinutes?:number;processSlots?:{id:string;slot:number;draw:number}[];moodBefore?:string;moodAfter?:string;from:number;minute:number;reason:string;before:number;after:number;awakeMinutes:number}[];dropped:number;lastRegulationChoice?:string;experiences?:{receipts:import('./mental-experiences').FeelingReceipt[];dropped:number}};
export function readMentalEnergyTestPolicy(environment:{APP_ENV?:string;MENTAL_ENERGY_TEST_POLICY?:string},world:World):MentalEnergyPolicy|undefined {
 // Saved fixture policy remains authoritative, so environment isolation must
 // also protect reads-for-write when the activation binding has been removed.
 if((environment.MENTAL_ENERGY_TEST_POLICY||world.characters.some(actor=>actor.mentalEnergy?.policy.kind==='test'))&&!['local','test'].includes(environment.APP_ENV||''))throw Error('精神電量測試政策只允許隔離 local/test 環境。');
 if(!environment.MENTAL_ENERGY_TEST_POLICY)return;
 const p=JSON.parse(environment.MENTAL_ENERGY_TEST_POLICY) as MentalEnergyPolicy;
 if(!p||p.kind!=='test')throw Error('測試binding只接受test政策。');assertMentalEnergyPolicy(p);return p;
}
export function assertMentalEnergyPolicy(p:MentalEnergyPolicy):void {
 if(p?.kind==='formal'){assertFormalMentalPolicy({policy:p,formal:{sleepUnits:0}} as MentalEnergy);return;}
 if(!p||p.version!==1||p.kind!=='test'||typeof p.id!=='string'||!p.id||p.id.length>120||Object.keys(p).some(key=>!['version','kind','id','initial','maximum','awakePerHour','regulationCost','lowAt','experience','process'].includes(key))||![p.initial,p.maximum,p.awakePerHour,p.regulationCost,p.lowAt].every(Number.isFinite)||p.maximum<=0||p.initial<0||p.initial>p.maximum||p.awakePerHour<0||p.regulationCost<=0||p.regulationCost>p.maximum||p.lowAt<0||p.lowAt>p.maximum)throw Error('精神電量需要完整有效的明示測試政策。');
 if(p.process!==undefined&&(!p.process||Object.keys(p.process).sort().join(',')!=='levels,multipliers,seed,slotMinutes'||!Number.isSafeInteger(p.process.seed)||p.process.seed<0||p.process.seed>0xffffffff||!Number.isSafeInteger(p.process.slotMinutes)||p.process.slotMinutes<=0||p.process.slotMinutes>1440||!Array.isArray(p.process.levels)||p.process.levels.length!==3||p.process.levels[0]!==0||!p.process.levels.every(n=>Number.isFinite(n)&&n>=0)||!Array.isArray(p.process.multipliers)||!p.process.multipliers.length||p.process.multipliers.length>32||!p.process.multipliers.every(n=>Number.isFinite(n)&&n>=0&&p.process!.levels.every(level=>Number.isFinite(level*n)))))throw Error('活動感受必須明示有效時段、等級點數與抽樣幅度。');
 if(p.experience!==undefined&&(!p.experience||typeof p.experience!=='object'||Object.keys(p.experience).join(',')!=='levels'||!Array.isArray(p.experience.levels)||p.experience.levels.length!==3||p.experience.levels[0]!==0||!p.experience.levels.every(n=>Number.isFinite(n)&&n>=0)))throw Error('自然感受需要明示測試等級點數。');
}
export function activateMentalEnergy(world:World,policy?:MentalEnergyPolicy):void {
 if(!policy)return;
 if(policy.kind!=='test')throw Error('正式精神電量必須由明示開局factory形成。');
 for(const actor of world.characters)if(!actor.mentalEnergy)actor.mentalEnergy={version:1,policy:structuredClone(policy),value:policy.initial,activatedAt:world.minute,updatedAt:world.minute,history:[],dropped:0};
}
export function mentalEnergyFeeling(actor:Character):{feeling:string;canRegulate:boolean;activityFeeling?:ReturnType<typeof processFeelingForDecision>}|undefined {
 const s=actor.mentalEnergy;if(!s)return;
 if(s.policy.kind==='formal'){const names=['見底','吃緊','尚可','有餘','充沛'];return {feeling:names[formalEnergyStageIndex(s.value,s.policy.maximum)],canRegulate:s.value>=5,...(processFeelingForDecision(actor)?{activityFeeling:processFeelingForDecision(actor)}:{})};}
 return {feeling:s.value<s.policy.lowAt?'心力有些吃緊，可以考慮照顧自己；仍可自行取捨。':'心裡還有餘裕。',canRegulate:s.value>=s.policy.regulationCost,...(processFeelingForDecision(actor)?{activityFeeling:processFeelingForDecision(actor)}:{})};
}
export type MentalInterval={from:number;to:number;before:number;sleepMinutes:number;process:ProcessSlice[];sleepFrom?:number;formalProcesses?:{id:string;revision:number;direction:string;level:number;reason:string;from:number;to:number}[]};
export function mentalIntervals(world:World,to:number):Map<string,MentalInterval>{
 return new Map(world.characters.filter(c=>c.mentalEnergy).map(c=>{
  const s=c.mentalEnergy!;assertMentalEnergyPolicy(s.policy);if(s.version!==1||!Number.isFinite(s.value)||s.value<0||s.value>s.policy.maximum||!Number.isFinite(s.updatedAt)||to<s.updatedAt)throw Error('精神電量資料或世界時間無效。');
  if(s.policy.kind==='formal'){assertFormalMentalEnergy(c);if(world.timeContract!=='five-minute-v1'||to-s.updatedAt>5)throw Error('正式精神電量需要連續五分鐘時間契約。');const plan=c.plan,p=plan?.mentalProcess,assessment=p?.assessment,sleepMinutes=plan?.bodyActivity?.kind==='sleep'?activeBodyMinutes(c,s.updatedAt,to):0,sleepFrom=Math.max(s.updatedAt,plan?.startedAt??s.updatedAt);if(assessment)parseProcessFeeling(c,assessment);return [c.id,{from:s.updatedAt,to,before:s.value,process:[],sleepMinutes,sleepFrom,formalProcesses:p&&assessment?[{id:p.id,revision:p.revision,...assessment,from:Math.max(s.updatedAt,p.effectiveAt,plan!.startedAt),to:Math.min(to,plan!.until,plan!.sleep?.naturalWakeAt??Infinity,plan!.sleep?.stimulusWakeAt??Infinity)}]:[]}];}
  return [c.id,{from:s.updatedAt,to,before:s.value,process:collectProcessSlices(c,s.updatedAt,to),sleepMinutes:c.plan?.bodyActivity?.kind==='sleep'?activeBodyMinutes(c,s.updatedAt,to):0}];
 }));
}
/** Recompute this in-flight interval from its pre-clamp balance when first-interval sleep is confirmed. */
export function settleMentalInterval(actor:Character,interval:MentalInterval,additionalSleep=0):void {
 const s=actor.mentalEnergy;if(!s)return;
 if(s.policy.kind==='formal'){settleFormalMentalInterval(actor,interval);return;}
 const awakeMinutes=Math.max(0,interval.to-interval.from-interval.sleepMinutes-additionalSleep);
 const sleepRanges=[[interval.from,interval.from+interval.sleepMinutes],[interval.from+interval.sleepMinutes,interval.from+interval.sleepMinutes+additionalSleep]];
 const boundaries=[...new Set([interval.from,interval.to,...sleepRanges.flat(),...interval.process.flatMap(p=>[p.from,p.to])])].filter(t=>t>=interval.from&&t<=interval.to).sort((a,b)=>a-b);
 let value=interval.before,naturalDelta=0,processDelta=0;
 for(let i=1;i<boundaries.length;i++){const from=boundaries[i-1],to=boundaries[i],sleep=sleepRanges.some(([start,end])=>from>=start&&to<=end),natural=sleep?0:-s.policy.awakePerHour*(to-from)/60,process=interval.process.filter(p=>from>=p.from&&to<=p.to).reduce((sum,p)=>sum+p.rate*(to-from),0);naturalDelta+=natural;processDelta+=process;value=Math.max(0,Math.min(s.policy.maximum,value+natural+process));}
 // Replacing a first-sleep preview reuses the already sampled process slices.
 const previous=s.history.findIndex(entry=>['natural','process'].includes(entry.kind)&&entry.from===interval.from&&entry.minute===interval.to);
 if(previous>=0)s.history.splice(previous,1);
 s.value=value;s.updatedAt=interval.to;
 if(interval.to>interval.from){appendMentalHistory(s,{kind:interval.process.length?'process':'natural',from:interval.from,minute:interval.to,reason:interval.process.length?`實際活動過程：${[...new Set(interval.process.map(p=>p.reason))].join('；')}；與清醒時間共同結算`:awakeMinutes?'清醒世界時間自然消耗':'實際睡眠暫停自然消耗',before:interval.before,after:value,awakeMinutes,...(interval.process.length?{naturalDelta,processDelta,processMinutes:interval.process.reduce((sum,p)=>sum+p.to-p.from,0),processSlots:interval.process.map(p=>({id:p.id,slot:p.slot,draw:p.draw}))}:{})});}
}

/** Legacy worlds retain their old mood contract; active energy requires sourced writers. */
export function applyLegacyMood(actor:Character,mood:unknown):void {if(!actor.mentalEnergy&&typeof mood==='string')actor.mood=mood.slice(0,20);}
