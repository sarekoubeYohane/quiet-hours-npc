import type { Character } from './world';
import { MemoryValidationError } from './memory';

export type EmotionRegulation={effort:string;reason:string;mood:string};
export const emotionRegulationSchema={anyOf:[{type:'null'},{type:'object',properties:{effort:{type:'string',minLength:1,maxLength:256},reason:{type:'string',minLength:1,maxLength:256},mood:{type:'string',minLength:1,maxLength:20}},required:['effort','reason','mood'],additionalProperties:false}]};
export const emotionRegulationPrompt=' emotionRegulation為null表示保留電量，或明示一次{effort,reason,mood}進行基本主動情緒調節：effort說明自我安撫、重新理解等心理努力；reason說明為何投入；mood為努力後的文字感受。目標是至少小幅緩和，到自己覺得能承受即可，不保證立刻開心或問題解決。每次完整正常選擇（含回想與續答）最多一次，這一項與feelingUpdates等心理更新共用最多四項及8KiB工作量，只在最終回答選擇，回想要求不夾帶調節。固定費用由後端檢查足額才支付，不能自行報點數、透支或重複調節。先結算已發生時間及合法獨立經歷的補耗電，再檢查付款；self.mentalEnergy.canRegulate是此次輸入時的足額感受，同輪新經歷若補足仍可提出一次，由後端核對。若你覺得心情很差且取得新電量，優先考慮是否調節，但可以保留電量、不花或保留餘額，不由系統替你分配。不要求另開活動、停工或換行動。自然好轉可在零電量透過合法feelingUpdates表達，不收調節費，也不要求一定補電。調節本身的緩和不能作為新的自然補電來源；只有同輪其他獨立合法經歷仍可補耗電。';
export function parseEmotionRegulation(actor:Character,value:unknown):EmotionRegulation|undefined {
 if(value===undefined||value===null)return;
 if(!actor.mentalEnergy||actor.control?.mode==='taken-over'||actor.control?.pending||actor.control?.active)throw new MemoryValidationError('只有正常自主選擇可明示付費情緒調節');
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='effort,mood,reason')throw new MemoryValidationError('情緒調節每次只能明示一份努力、理由與文字心情');
 const item=value as Record<string,unknown>;
 if(!['effort','reason','mood'].every(key=>typeof item[key]==='string'&&(item[key] as string).trim()&&(item[key] as string).length<=(key==='mood'?20:256)))throw new MemoryValidationError('情緒調節文字超出有界契約');
 return value as EmotionRegulation;
}
/** Called once for the complete normal choice, after real-time and independent income. */
export function applyEmotionRegulation(actor:Character,value:EmotionRegulation|undefined,minute:number,choiceId:string):void {
 if(!value)return;
 const state=actor.mentalEnergy;if(!state||actor.control?.mode==='taken-over'||actor.control?.pending||actor.control?.active)throw new MemoryValidationError('接管或未啟用角色不能自行付費調節');
 if(state.lastRegulationChoice===choiceId)throw new MemoryValidationError('同次完整選擇不能再次調節');
 const cost=state.policy.regulationCost;if(state.value<cost)throw new MemoryValidationError('精神電量不足額，未支付也未取得調節結果');
 const before=state.value,moodBefore=actor.mood;state.value-=cost;actor.mood=value.mood;state.lastRegulationChoice=choiceId;
 state.history.push({kind:'regulation',from:minute,minute,reason:value.reason,effort:value.effort,before,after:state.value,awakeMinutes:0,moodBefore,moodAfter:actor.mood});state.dropped+=Math.max(0,state.history.length-32);state.history=state.history.slice(-32);
}
