import { activeBodyMinutes } from './needs';
import type { Character } from './world';
import { MemoryValidationError } from './memory';
export type ProcessFeeling={direction:'positive'|'negative'|'neutral';level:0|1|2;reason:string};
export type MentalProcess={version:1;id:string;randomState:number;draws:number;effectiveAt:number;updatedAt:number;activeMinutes:number;revision:number;assessment?:ProcessFeeling;slot?:{index:number;draw:number;usedMinutes:number}};
export type ProcessSlice={from:number;to:number;rate:number;id:string;slot:number;draw:number;reason:string;revision:number};
export const processFeelingSchema={anyOf:[{type:'null'},{type:'object',properties:{direction:{type:'string',enum:['positive','negative','neutral']},level:{type:'integer',enum:[0,1,2]},reason:{type:'string',minLength:1,maxLength:256}},required:['direction','level','reason'],additionalProperties:false}]};
export const processFeelingPrompt=' processFeeling可為null保留原感受，或以direction=positive/negative/neutral、level=0/1/2及reason暫估自己對所選實際活動過程的享受或負擔。不由動作名稱、外在成功或持續低落自動推定。只有真正開始或恢復且仍在進行的活動才承接，於本次選擇邊界向後生效；不補發選擇前時間，不給未來收入、不改寫既有結算。重述或改評價不會重抽同一有效時段。這項也佔共同四項/8KiB心理工作量，不輸出點數、時段、骰值或別人的感受。';
export function parseProcessFeeling(actor:Character,value:unknown):ProcessFeeling|null{
 if(value===undefined||value===null)return null;
 if(!actor.mentalEnergy?.policy.process||!value||typeof value!=='object'||Array.isArray(value))throw new MemoryValidationError('未啟用有效活動感受政策');
 const p=value as ProcessFeeling;
 if(Object.keys(p).sort().join(',')!=='direction,level,reason'||!['positive','negative','neutral'].includes(p.direction)||![0,1,2].includes(p.level)||p.direction==='neutral'&&p.level!==0||p.direction!=='neutral'&&p.level===0||typeof p.reason!=='string'||!p.reason.trim()||new TextEncoder().encode(p.reason).length>256)throw new MemoryValidationError('活動感受只能給有界方向、等級及理由');
 return {...p};
}
/** A newly chosen activity never inherits the decision round's backdated time. */
export function applyProcessAssessment(actor:Character,feeling:ProcessFeeling|null,minute:number):void{
 const plan=actor.plan;if(!plan||!actor.mentalEnergy?.policy.process)return;
 if(!plan.mentalProcess){
  const energy=actor.mentalEnergy,sequence=(energy.processSequence??0)+1;
  if(!Number.isSafeInteger(sequence)||sequence<1)throw new MemoryValidationError('活動精神身份序號已達工程上界');
  energy.processSequence=sequence;let randomState=(energy.policy.process!.seed^sequence)>>>0;
  for(const code of actor.id)randomState=Math.imul(randomState^code.charCodeAt(0),16777619)>>>0;
  plan.mentalProcess={version:1,id:crypto.randomUUID(),randomState,draws:0,effectiveAt:minute,updatedAt:minute,activeMinutes:0,revision:0};
 }
 const process=plan.mentalProcess;
 if(feeling){process.assessment={...feeling};process.effectiveAt=minute;process.revision++;}
 // Resuming keeps the original effective progress and current slot, but the
 // paused wall-clock gap never becomes additional productive time.
 process.updatedAt=minute;
}
/** One persisted sample per fixed grid of assessed effective activity minutes. */
export function collectProcessSlices(actor:Character,from:number,to:number):ProcessSlice[]{
 const plan=actor.plan,process=plan?.mentalProcess,policy=actor.mentalEnergy?.policy.process;
 if(!plan||!process||!policy)return [];
 if(process.version!==1||typeof process.id!=='string'||!process.id||process.id.length>128||!Number.isFinite(process.effectiveAt)||process.effectiveAt>process.updatedAt||!Number.isFinite(process.updatedAt)||process.updatedAt>to||!Number.isFinite(process.activeMinutes)||process.activeMinutes<0||process.activeMinutes>0&&!process.slot||!Number.isSafeInteger(process.randomState)||process.randomState<0||process.randomState>0xffffffff||!Number.isSafeInteger(process.draws)||process.draws<0||!Number.isSafeInteger(process.revision)||process.revision<0||process.slot&&(!Number.isSafeInteger(process.slot.index)||process.slot.index<0||!policy.multipliers.includes(process.slot.draw)||!Number.isFinite(process.slot.usedMinutes)||process.slot.usedMinutes<0||process.slot.usedMinutes>policy.slotMinutes||Math.abs(process.activeMinutes-(process.slot.index*policy.slotMinutes+process.slot.usedMinutes))>1e-7))throw new MemoryValidationError('活動精神時間資料無效');
 if(process.assessment===undefined)return [];
 if(!process.assessment)throw new MemoryValidationError('活動感受保存格式無效');
 parseProcessFeeling(actor,process.assessment);
 const start=Math.max(from,process.updatedAt,process.effectiveAt,plan.startedAt),end=Math.min(to,plan.until,plan.sleep?.naturalWakeAt??Infinity,plan.sleep?.stimulusWakeAt??Infinity,plan.bodyActivity?.kind==='sleep'?from+activeBodyMinutes(actor,from,to):Infinity);
 const slices:ProcessSlice[]=[];let at=start;
 while(at<end){
  const index=Math.floor(process.activeMinutes/policy.slotMinutes),usedMinutes=process.activeMinutes-index*policy.slotMinutes;
  if(!process.slot||process.slot.index!==index){process.randomState=(Math.imul(process.randomState,1664525)+1013904223)>>>0;process.draws++;const draw=policy.multipliers[Math.floor(process.randomState/0x100000000*policy.multipliers.length)];process.slot={index,draw,usedMinutes};}
  const duration=Math.min(end-at,policy.slotMinutes-usedMinutes),assessment=process.assessment;
  const rate=policy.levels[assessment.level]/60*process.slot.draw*(assessment.direction==='negative'?-1:assessment.direction==='positive'?1:0);
  slices.push({from:at,to:at+duration,rate,id:process.id,slot:index,draw:process.slot.draw,reason:assessment.reason,revision:process.revision});
  process.activeMinutes+=duration;process.slot.usedMinutes=usedMinutes+duration;at+=duration;
 }
 process.updatedAt=to;
 return slices;
}

/** Only the actor's subjective appraisal leaves the observer accounting state. */
export function processFeelingForDecision(actor:Character){const process=actor.plan?.mentalProcess;return process?.assessment?{...process.assessment,effectiveAt:process.effectiveAt}:undefined;}
