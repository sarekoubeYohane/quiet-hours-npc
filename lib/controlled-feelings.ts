import type { Action, Character, World } from './world';
import { normalDecisionInput, boundDecisionRequest } from './npc-input';
import { feelingPromptFor, feelingSourceMinutes, feelingReceiptCapacity, feelingUpdatesSchema, visibleFeelingSources, parseFeelingUpdates, type PreparedFeelingUpdate } from './mental-experiences';
import { processFeelingSchemaFor, processFeelingPromptFor, parseProcessFeeling, type ProcessFeeling } from './mental-process';
import { MemoryValidationError, memoryBytes } from './memory';
import { modelRequestBody, requestModel, type ModelService, type ModelObserver } from './model-adapter';
import type { TokenUsage } from './activities';

export type ControlledAssessmentState={sources:{id:string;at:number}[];activities:{id:string;at:number}[];dropped:number};
export type ControlledFeelingCandidate={feelingUpdates:PreparedFeelingUpdate[];processFeeling:ProcessFeeling|null};
const contractVersion='controlled-feelings.v1';
const prompt='這是使用者控制後的本人感受評估，不是自主決策。玩家行動已實際執行，控制權仍屬使用者；只能回傳contractVersion=controlled-feelings.v1、feelingUpdates及processFeeling。可沒有心理變化。禁止輸出或替換action、控制權、意圖追求、記憶操作、習慣、回想或emotionRegulation；不得自行主動調節或花費調節電量，不產生自主選擇證據。';
function checkedState(actor:Character):ControlledAssessmentState{
 const state=actor.mentalEnergy?.controlAssessments??{sources:[],activities:[],dropped:0};
 if(!Number.isSafeInteger(state.dropped)||state.dropped<0||!Array.isArray(state.sources)||!Array.isArray(state.activities)||[state.sources,state.activities].some(items=>items.length>feelingReceiptCapacity||new Set(items.map(r=>r.id)).size!==items.length||items.some(r=>!r||Object.keys(r).sort().join(',')!=='at,id'||typeof r.id!=='string'||!r.id||r.id.length>128||!Number.isFinite(r.at))))throw new MemoryValidationError('接管感受處理紀錄無效');
 return state;
}
export function prepareControlledFeelings(world:World,actor:Character,modelKey:string,service:Pick<ModelService,'model'|'provider'>,controlledActivity?:{id:string;at:number;action:Pick<Action,'type'|'target'|'content'>}){
 if(!actor.mentalEnergy||!actor.mentalEnergy.policy.experience&&!actor.mentalEnergy.policy.process)return;
 const state=checkedState(actor),input={...normalDecisionInput(world,actor,modelKey),contractVersion,...(controlledActivity?{controlledActivity}:{})};
 // Control metadata is authority-side; only the current mode/active flag belongs
 // in a feelings view. MentalEnergy bookkeeping never enters this projection.
 input.self.control=actor.control?{mode:actor.control.mode,active:!!actor.control.active}:undefined;
 const activityId=actor.plan?.mentalProcess?.id;
 const opportunityId=activityId??controlledActivity?.id;
 const newActivity=!!opportunityId&&!state.activities.some(r=>r.id===opportunityId);
 const filterSources=()=>{for(const m of [...input.self.shortTerm,...input.self.longTerm])if(m.feelingSources)m.feelingSources=m.feelingSources.filter(id=>!state.sources.some(r=>r.id===id));};
 const sources=()=>actor.mentalEnergy?.policy.experience?visibleFeelingSources([...input.self.shortTerm,...input.self.longTerm]):[];
 const schemaFor=()=>({type:'object',properties:{contractVersion:{type:'string',const:contractVersion},feelingUpdates:feelingUpdatesSchema(sources(),actor.mentalEnergy?.policy.kind==='formal'),processFeeling:activityId&&actor.mentalEnergy?.policy.process?processFeelingSchemaFor(actor.mentalEnergy?.policy.kind==='formal'):{type:'null'}},required:['contractVersion','feelingUpdates','processFeeling'],additionalProperties:false});
 const messages=[{role:'system',content:prompt+feelingPromptFor(actor.mentalEnergy?.policy.kind==='formal')+processFeelingPromptFor(actor.mentalEnergy?.policy.kind==='formal')},{role:'user',content:''}];let schema=schemaFor();
 boundDecisionRequest(world,actor,input,()=>{filterSources();schema=schemaFor();messages[1].content=JSON.stringify(input);return new TextEncoder().encode(modelRequestBody(service,messages,schema)).length<164000;});
 const finalSources=sources();if(!newActivity&&!finalSources.length)return;
 const roots=[...(actor.shortTerm||[]),...(actor.longTerm||[])].flatMap(m=>m.feelingOrigins||[]);
 const offered=finalSources.map(id=>roots.find(r=>r.id===id&&r.actorId===actor.id)!).filter(Boolean);
 return {input,schema,messages,sources:offered,...(activityId?{activityId}:{}),...(opportunityId?{opportunityId}:{})};
}
export type ControlledFeelingRequest=NonNullable<ReturnType<typeof prepareControlledFeelings>>;
export async function requestControlledFeelings(actor:Character,minute:number,prepared:ControlledFeelingRequest,service:ModelService,options:{signal:AbortSignal;observer?:ModelObserver;requestId:string;fetcher?:typeof fetch;beforeDispatch?:Parameters<typeof requestModel>[3]['beforeDispatch'];onSettled?:()=>Promise<void>;onUsage:(tokens:TokenUsage)=>void|Promise<void>;verifyCurrent:()=>Promise<void>}):Promise<ControlledFeelingCandidate>{
 const raw=await requestModel(service,prepared.messages,prepared.schema,options);await options.verifyCurrent();
 try{
  const value=JSON.parse(raw);
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='contractVersion,feelingUpdates,processFeeling'||value.contractVersion!==contractVersion||!Array.isArray(value.feelingUpdates)||value.feelingUpdates.length+(value.processFeeling===null?0:1)>4||memoryBytes(value)>8192||value.processFeeling!==null&&!prepared.activityId)throw new MemoryValidationError('接管感受只允許合法經歷與實際活動感受，不能越權決策或調節');
  return {feelingUpdates:parseFeelingUpdates(actor,value.feelingUpdates,prepared.sources.map(r=>r.id),minute),processFeeling:parseProcessFeeling(actor,value.processFeeling)};
 }catch(error){try{await options.observer?.({kind:'failure',failure:error instanceof SyntaxError?'candidate-format':'candidate-validation',stage:'controlled-feelings-validation',reason:error instanceof SyntaxError?'json-parse':'field-format'});}catch{/* Preserve original candidate failure. */}if(error instanceof MemoryValidationError)throw error;throw new MemoryValidationError('接管感受回覆格式無效，本回合已回復');}
}
export function acknowledgeControlledFeelings(actor:Character,request:ControlledFeelingRequest,minute:number):void{
 const energy=actor.mentalEnergy!;const old=checkedState(actor),protectedActivities=new Set([actor.plan?.mentalProcess?.id,actor.pausedActivity?.plan.mentalProcess?.id]);
 const sources=old.sources.filter(r=>r.at+feelingSourceMinutes>minute),activities=old.activities.filter(r=>protectedActivities.has(r.id)||r.at+feelingSourceMinutes>minute);
 for(const root of request.sources)if(!sources.some(r=>r.id===root.id))sources.push({id:root.id,at:root.at});
 if(request.opportunityId&&!activities.some(r=>r.id===request.opportunityId))activities.push({id:request.opportunityId,at:minute});
 if(sources.length>feelingReceiptCapacity||activities.length>feelingReceiptCapacity)throw new MemoryValidationError('接管感受有效處理紀錄容量已滿，未淘汰仍有效來源');
 energy.controlAssessments={sources,activities,dropped:old.dropped+old.sources.length+old.activities.length-sources.filter(r=>old.sources.some(o=>o.id===r.id)).length-activities.filter(r=>old.activities.some(o=>o.id===r.id)).length};
}
