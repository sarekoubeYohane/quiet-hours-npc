import type { Character } from './world';
import { MemoryValidationError } from './memory';
export type FeelingOrigin={id:string;actorId:string;version:1;at:number;kind:'experience'|'result'};
export type FeelingUpdate={source:string;direction:'positive'|'negative'|'neutral';level:0|1|2;reason:string;mood:string|null};
export type PreparedFeelingUpdate=FeelingUpdate & {originAt:number;originKind:FeelingOrigin['kind']};
export type FeelingReceipt=FeelingUpdate & {originKind?:FeelingOrigin['kind'];at:number;expiresAt:number;before:number;after:number;moodBefore:string;moodAfter:string};
/** Fixed engineering window and capacity; these are not product reward values. */
export const feelingSourceMinutes=7*1440, feelingReceiptCapacity=256;
export const feelingPrompt=' 頂層mood只是舊欄位相容建議，不會自行改寫心情；自然變化須用feelingUpdates的合法來源。成果只引用真正已發生且本人可知的result來源；提案、預告完成、外在成功標籤或追求狀態改寫本身都不發獎，失敗可有收穫而成功也可能耗神。結果與過程是不同事實，同一份感受不得改名重領；補足電量不會完成、取消或復活追求，仍可自主續做、延期或明示放下。feelingUpdates只評估本次shortTerm/longTerm明示feelingSources的新經歷。每項只提供source、direction=positive/negative/neutral、level=0/1/2、reason與mood（自然情緒文字或null表示不改變）。方向與等級依自己的喜好、關係及感受，不由動作名稱、成功或身體需求恢復推定。自然情緒和補耗電可分開，零電量也可自然好轉。不得靠自我安撫、想開、回想或重述舊成果冒充新自然來源；主動心理努力需另外的付費契約。只能引用明示來源，不猜隱藏消息；同一來源只評估一次，無新感受回傳空陣列。未列來源或舊資料的來源缺口不代表可以補造歷史。feelingUpdates與其餘心理更新共用四項及8KiB工作量。';
export function feelingOrigin(actor:Character,id:string,at:number,kind:FeelingOrigin['kind']='experience'):FeelingOrigin{return {id,actorId:actor.id,version:1,at,kind};}
export function validFeelingOrigins(origins:FeelingOrigin[]|undefined,actorId:string):boolean{return origins===undefined||Array.isArray(origins)&&origins.length<=8&&new Set(origins.map(o=>o.id)).size===origins.length&&origins.every(o=>o&&Object.keys(o).sort().join(',')==='actorId,at,id,kind,version'&&o.actorId===actorId&&typeof o.id==='string'&&o.id.length>0&&o.id.length<=128&&o.version===1&&Number.isFinite(o.at)&&['experience','result'].includes(o.kind));}
export function mergeFeelingOrigins(items:{feelingOrigins?:FeelingOrigin[]}[]):FeelingOrigin[]{const origins=[...new Map(items.flatMap(m=>m.feelingOrigins||[]).map(o=>[o.id,o])).values()];if(origins.length>8)throw new MemoryValidationError('心理來源合併超過工程容量，未改寫來源。');return origins;}
/** Eligibility is shared by the visible offer and backend authority validation. */
export function eligibleFeelingOrigin(actor:Character,origin:FeelingOrigin,minute:number):boolean {
 const state=actor.mentalEnergy;
 return !!state?.policy.experience&&origin.actorId===actor.id&&origin.version===1&&origin.at>=state.activatedAt&&origin.at<=minute&&origin.at+feelingSourceMinutes>minute&&!state.experiences?.receipts.some(r=>r.source===origin.id)&&!state.controlAssessments?.sources.some(r=>r.id===origin.id);
}
export function offeredFeelingSources(actor:Character,origins:FeelingOrigin[]|undefined):string[]{return (origins||[]).filter(o=>eligibleFeelingOrigin(actor,o,actor.mentalEnergy?.updatedAt??0)).map(o=>o.id);}
export function visibleFeelingSources(items:{feelingSources?:string[]}[]):string[]{return [...new Set(items.flatMap(m=>m.feelingSources||[]))];}
export function feelingUpdatesSchema(sources:string[]){return {type:'array',maxItems:sources.length?4:0,items:{type:'object',properties:{source:{type:'string',...(sources.length?{enum:sources}:{})},direction:{type:'string',enum:['positive','negative','neutral']},level:{type:'integer',enum:[0,1,2]},reason:{type:'string',minLength:1,maxLength:256},mood:{type:['string','null'],minLength:1,maxLength:20}},required:['source','direction','level','reason','mood'],additionalProperties:false}};}
/** Validate against the final provider view before memory operations mutate its handles. */
export function parseFeelingUpdates(actor:Character,value:unknown,visibleSources:string[],minute:number):PreparedFeelingUpdate[]{
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.length>4)throw new MemoryValidationError('自然感受格式無效');
 if(!value.length)return [];
 const state=actor.mentalEnergy;if(!state?.policy.experience)throw new MemoryValidationError('未啟用明示自然感受測試政策');
 const origins=[...(actor.shortTerm||[]),...(actor.longTerm||[])].flatMap(m=>m.feelingOrigins||[]),seen=new Set<string>();
 for(const u of value){if(!u||typeof u!=='object'||Object.keys(u).sort().join(',')!=='direction,level,mood,reason,source'||typeof u.source!=='string'||seen.has(u.source)||!['positive','negative','neutral'].includes(u.direction)||![0,1,2].includes(u.level)||u.direction==='neutral'&&u.level!==0||u.direction!=='neutral'&&u.level===0||typeof u.reason!=='string'||!u.reason.trim()||new TextEncoder().encode(u.reason).length>256||u.mood!==null&&(typeof u.mood!=='string'||!u.mood.trim()||u.mood.length>20))throw new MemoryValidationError('自然感受格式無效');seen.add(u.source);
 const origin=origins.find(o=>o.id===u.source&&o.actorId===actor.id&&o.version===1);
 if(!visibleSources.includes(u.source)||!origin||!eligibleFeelingOrigin(actor,origin,minute))throw new MemoryValidationError('自然感受只能引用本次可見、有效且未結算的本人來源');
 }
 return (value as FeelingUpdate[]).map(u=>({...u,originAt:origins.find(o=>o.id===u.source)!.at,originKind:origins.find(o=>o.id===u.source)!.kind}));
}
export function applyFeelingUpdates(actor:Character,updates:PreparedFeelingUpdate[],minute:number){
 const state=actor.mentalEnergy;if(!state)return;
 const ledger=state.experiences??={receipts:[],dropped:0};
 const expired=ledger.receipts.filter(r=>r.expiresAt<=minute);ledger.dropped+=expired.length;ledger.receipts=ledger.receipts.filter(r=>r.expiresAt>minute);
 if(ledger.receipts.length+updates.length>feelingReceiptCapacity)throw new MemoryValidationError('自然感受有效收據容量已滿，未淘汰仍有效來源');
 for(const prepared of updates){const {originAt,...update}=prepared;
 const before=state.value,moodBefore=actor.mood,magnitude=state.policy.experience!.levels[update.level],delta=update.direction==='negative'?-magnitude:update.direction==='positive'?magnitude:0;
 state.value=Math.max(0,Math.min(state.policy.maximum,before+delta));if(update.mood!==null)actor.mood=update.mood;
 const receipt={...update,at:minute,expiresAt:originAt+feelingSourceMinutes,before,after:state.value,moodBefore,moodAfter:actor.mood};ledger.receipts.push(receipt);
 state.history.push({kind:'experience',minute,from:minute,reason:update.reason,before,after:state.value,awakeMinutes:0,source:update.source,moodBefore,moodAfter:actor.mood});state.dropped+=Math.max(0,state.history.length-32);state.history=state.history.slice(-32);
 }
}
