import type { Character, Intent } from './world';
import type { PursuitReference } from './pursuits';
import { memoryBytes, MemoryValidationError } from './memory';

export const pursuitSelectionLimits={candidates:4,candidateBytes:2048,selectionBytes:1024} as const;
export type PursuitCandidate={id:string;kind:'direction'|'intent'|'task';content:string;scope:string;satisfaction:string|null;references:PursuitReference[]};
export type PursuitSelection={adoptions:{candidateId:string;pursuitId:string}[];declinedCandidateIds:string[];focus:{kind:'candidate'|'existing';id:string;version:number}|null;reason:string};
export type PursuitSelectionEvidence={candidates:PursuitCandidate[];selection:PursuitSelection;adopted:{candidate:PursuitCandidate;pursuit:Intent}[]};
const plain=(value:unknown,keys:readonly string[]):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&Object.keys(value).every(k=>keys.includes(k));
const text=(value:unknown,max:number,nonempty=false):value is string=>typeof value==='string'&&value.length<=max&&(!nonempty||!!value.trim());
function fail(message:string):never{throw new MemoryValidationError(message);}
const referenceSchema={type:'object',properties:{kind:{type:'string',enum:['short','long','belief','relationship']},id:{type:'string',minLength:1,maxLength:128},version:{type:'integer',minimum:1}},required:['kind','id','version'],additionalProperties:false};
export const pursuitCandidatesSchema={type:'array',maxItems:pursuitSelectionLimits.candidates,items:{type:'object',properties:{id:{type:'string',minLength:1,maxLength:64},kind:{type:'string',enum:['direction','intent','task']},content:{type:'string',minLength:1,maxLength:120},scope:{type:'string',minLength:1,maxLength:120},satisfaction:{type:['string','null'],maxLength:80},references:{type:'array',maxItems:4,items:referenceSchema}},required:['id','kind','content','scope','satisfaction','references'],additionalProperties:false}};
export const pursuitSelectionSchema={type:'object',properties:{adoptions:{type:'array',maxItems:pursuitSelectionLimits.candidates,items:{type:'object',properties:{candidateId:{type:'string',minLength:1,maxLength:64},pursuitId:{type:'string',minLength:1,maxLength:64}},required:['candidateId','pursuitId'],additionalProperties:false}},declinedCandidateIds:{type:'array',maxItems:pursuitSelectionLimits.candidates,items:{type:'string',minLength:1,maxLength:64}},focus:{anyOf:[{type:'object',properties:{kind:{type:'string',enum:['candidate','existing']},id:{type:'string',minLength:1,maxLength:64},version:{type:'integer',minimum:0}},required:['kind','id','version'],additionalProperties:false},{type:'null'}]},reason:{type:'string',maxLength:160}},required:['adoptions','declinedCandidateIds','focus','reason'],additionalProperties:false};
export const pursuitSelectionPrompt='同一次正常決策先依自己的性格、當前方向、本人可見記憶／信念／關係、需求感受、喜好、習慣、感知及已知方法，發散少量候選追求，再與既有追求和活動進度一起自主收斂，最後選一個具體方法及action。pursuitCandidates最多4項、整個JSON最多2048 UTF-8 bytes；每項id以自己的id加:candidate:開頭，含kind(direction/intent/task)、content（可能想達到什麼）、scope（可能承接到哪裡）、satisfaction（什麼算夠，可null）、references（最多4個當次實際可見short/long/belief/relationship的id/version，可空）。只列實質不同的可能性，不必湊數，不要求逐步內心推理或各候選另列方法。候選只是值得考慮／查證，不表示已核准可行、已承諾或已完成。pursuitSelection為收斂結果（整個JSON最多1024 UTF-8 bytes）：adoptions=[{candidateId,pursuitId}]把每個新承接候選一對一連到同次pursuitUpdates的新增upsert（version=0），正式pursuitId使用自己的id前綴但不使用:candidate:。可在承接時修訂scope／滿足標準，原候選與正式範圍會分開保存供觀察；修訂既有追求不必假裝新候選。declinedCandidateIds只列明示不願承接的本次候選；未選不等於拒絕。focus可為null，或{kind:candidate,id:本次已承接候選id,version:0}，或{kind:existing,id:當次可見有效追求id,version:當次原版本}；它須對應focusIntentId和methodAssessment.intentIds的唯一正式追求。reason只需一句必要選擇說明，可空。可以承接新追求但當下無焦點，也可以選既有追求而不承接任何新候選。沒有新念頭、等待、休息或續做時可pursuitCandidates=[]、adoptions=[]；無焦點仍可合法行動。未承接候選只留作有界私有當次證據，不是待辦、延期、經歷或下次提示；需要以後仍想做必須明示承接或沿既有安排路徑。選追求與替代方法分開，換方法仍可沿用同一追求；不因未選候選呼叫世界裁定。這些欄位與其他心理工作共用原8KiB包絡，不增加生成、評分、反思、修復或每層模型呼叫。';

export function parsePursuitSelection(c:Character,visible:Character,candidatesValue:unknown,selectionValue:unknown,updatesValue:unknown,next:Intent[],focusIntentId:unknown):PursuitSelectionEvidence{
 if(!Array.isArray(candidatesValue)||candidatesValue.length>pursuitSelectionLimits.candidates||memoryBytes(candidatesValue)>pursuitSelectionLimits.candidateBytes)fail('候選追求容量或集合無效');
 const candidates=candidatesValue as PursuitCandidate[],candidateIds=new Set<string>();
 for(const candidate of candidates){
  if(!plain(candidate,pursuitCandidatesSchema.items.required)||!text(candidate.id,64,true)||!candidate.id.startsWith(c.id+':candidate:')||candidateIds.has(candidate.id)||c.intents?.some(i=>i.id===candidate.id)||!['direction','intent','task'].includes(candidate.kind)||!text(candidate.content,120,true)||!text(candidate.scope,120,true)||candidate.satisfaction!==null&&!text(candidate.satisfaction,80)||!Array.isArray(candidate.references)||candidate.references.length>4)fail('候選追求身份或欄位無效');
  candidateIds.add(candidate.id);const refs=new Set<string>();
  for(const ref of candidate.references){
   const sources=ref.kind==='short'?visible.shortTerm:ref.kind==='long'?visible.longTerm:ref.kind==='belief'?visible.cognition?.beliefs:ref.kind==='relationship'?visible.cognition?.relationshipTags:[];
   const key=`${ref.kind}:${ref.id}:${ref.version}`;
   if(!plain(ref,referenceSchema.required)||!text(ref.id,128,true)||!Number.isSafeInteger(ref.version)||ref.version<1||refs.has(key)||!sources?.some(s=>s.id===ref.id&&s.version===ref.version&&s.characterId===c.id))fail('候選來源不是當次本人可見版本');
   refs.add(key);
  }
 }
 if(!plain(selectionValue,pursuitSelectionSchema.required)||memoryBytes(selectionValue)>pursuitSelectionLimits.selectionBytes)fail('追求收斂格式或容量無效');
 const selection=selectionValue as unknown as PursuitSelection;
 if(!Array.isArray(selection.adoptions)||selection.adoptions.length>pursuitSelectionLimits.candidates||!Array.isArray(selection.declinedCandidateIds)||selection.declinedCandidateIds.length>pursuitSelectionLimits.candidates||!text(selection.reason,160))fail('追求收斂欄位無效');
 const adopted:PursuitSelectionEvidence['adopted']=[],usedCandidates=new Set<string>(),usedPursuits=new Set<string>();
 const updates=Array.isArray(updatesValue)?updatesValue as {operation?:string;id?:string;version?:number}[]:[];
 for(const mapping of selection.adoptions){
  if(!plain(mapping,['candidateId','pursuitId'])||!text(mapping.candidateId,64,true)||!text(mapping.pursuitId,64,true)||!mapping.pursuitId.startsWith(c.id+':')||mapping.pursuitId.startsWith(c.id+':candidate:')||usedCandidates.has(mapping.candidateId)||usedPursuits.has(mapping.pursuitId))fail('候選承接映射無效或重複');
  const candidate=candidates.find(i=>i.id===mapping.candidateId),pursuit=next.find(i=>i.id===mapping.pursuitId);
  if(!candidate||!pursuit||pursuit.status!=='active'||c.intents?.some(i=>i.id===pursuit.id)||!updates.some(u=>u.operation==='upsert'&&u.id===pursuit.id&&u.version===0))fail('候選承接未對應同次新追求');
  usedCandidates.add(mapping.candidateId);usedPursuits.add(mapping.pursuitId);adopted.push({candidate,pursuit});
 }
 if(updates.some(u=>u.operation==='upsert'&&u.version===0&&(!u.id||!usedPursuits.has(u.id))))fail('新追求缺少候選承接映射');
 const declined=new Set<string>();
 for(const id of selection.declinedCandidateIds){if(!text(id,64,true)||!candidateIds.has(id)||declined.has(id)||usedCandidates.has(id))fail('候選拒絕引用無效');declined.add(id);}
 let actualId:string|null=null;
 if(selection.focus!==null){
  const focus=selection.focus;
  if(!plain(focus,['kind','id','version'])||!text(focus.id,64,true)||!Number.isSafeInteger(focus.version)||!['candidate','existing'].includes(focus.kind))fail('收斂焦點格式無效');
  if(focus.kind==='candidate'){
   const mapping=selection.adoptions.find(a=>a.candidateId===focus.id);
   if(focus.version!==0||!mapping)fail('焦點候選尚未承接');actualId=mapping.pursuitId;
  }else{
   if(!visible.intents?.some(i=>i.id===focus.id&&i.status==='active'&&i.version===focus.version))fail('既有焦點不屬於當次可見版本');actualId=focus.id;
  }
 }
 if(actualId!==focusIntentId||actualId!==null&&!next.some(i=>i.id===actualId&&i.status==='active'))fail('收斂與當下正式焦點不一致');
 return {candidates,selection,adopted};
}
