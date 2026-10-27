import type { Character } from './world';
import { MemoryValidationError, memoryBytes } from './memory';

export type PreferenceReference = { kind: 'short' | 'long'; id: string; version: number };
export type Preference = { id: string; characterId: string; version: number; time: number; topic: string; context: string; text: string; references: PreferenceReference[]; reason: string };
type PreferenceTrace = { id: string; version: number; time: number; operation: 'upsert' | 'keep' | 'withdraw'; reason: string; references: PreferenceReference[] };
export type PreferenceState = { schemaVersion: 1; items: Preference[]; trace: PreferenceTrace[]; droppedTrace: number };
const text = (value: unknown, max: number, empty = false): value is string => typeof value === 'string' && new TextEncoder().encode(value).length <= max && (empty || !!value.trim());
const version = (value: unknown, min = 1): value is number => Number.isSafeInteger(value) && Number(value) >= min;
const fields = (value: object, keys: string[]) => Object.keys(value).every(key => keys.includes(key));
const referencesSchema = { type:'array',minItems:1,maxItems:8,items:{type:'object',properties:{kind:{type:'string',enum:['short','long']},id:{type:'string',minLength:1,maxLength:128},version:{type:'integer',minimum:1}},required:['kind','id','version'],additionalProperties:false} };
const common = { operation:{type:'string',enum:['upsert']},id:{type:'string',minLength:1,maxLength:128},version:{type:'integer',minimum:0},references:referencesSchema,reason:{type:'string',minLength:1,maxLength:256} };
export const preferenceUpdatesSchema = {type:'array',maxItems:4,items:{anyOf:[
 {type:'object',properties:{...common,topic:{type:'string',minLength:1,maxLength:128},context:{type:'string',maxLength:256},text:{type:'string',minLength:1,maxLength:512}},required:['operation','id','version','references','reason','topic','context','text'],additionalProperties:false},
 {type:'object',properties:{...common,operation:{type:'string',enum:['keep','withdraw']},version:{type:'integer',minimum:1}},required:['operation','id','version','references','reason'],additionalProperties:false},
]}};
export const preferencePrompt = 'preferenceUpdates 可在本次正常決策中明示保存主觀喜好，與信念確信、暫時 interpretation、習慣及世界成敗分開。upsert 填穩定 id、version（新項目0，修改用現行版本）、topic、context（適用情境）、text（自己偏愛或不喜歡的描述）、references、reason；保留或放下用 keep／withdraw，只有 id、version、references、reason。references 只引用本次 self.shortTerm／self.longTerm 中自己的可見經驗 id/version，kind=short/long，不能引用世界事件、裁定級別或他人的內情。一次鮮明經驗可以形成喜好，失敗也可以仍喜歡；不要求每次都改變，沒有操作回空陣列。現行喜好最多16筆，滿額需自己明示放下；與記憶選留、整理、認知及習慣候選共享同次心理工作量。喜好只供你自主考量，可以選擇不做，不能據此假定成功或改寫性格、目標。';

export function preferencesForDecision(c: Character) {
 return { items:(c.preferences?.items || []).map(item=>({...item})), capacity:16 };
}
function referenceFormat(ref: PreferenceReference) {
 return !!ref && typeof ref === 'object' && fields(ref,['kind','id','version']) && ['short','long'].includes(ref.kind) && text(ref.id,128) && version(ref.version);
}
function validReferences(refs: PreferenceReference[]) {
 return Array.isArray(refs) && refs.length > 0 && refs.length <= 8 && refs.every(referenceFormat) && new Set(refs.map(ref=>`${ref.kind}:${ref.id}:${ref.version}`)).size === refs.length;
}
export function updatePreferences(c: Character, value: unknown, time: number, visible: Character): PreferenceState | undefined {
 if (value === undefined || Array.isArray(value) && value.length === 0) return undefined;
 if (!Array.isArray(value) || value.length > 4 || memoryBytes(value) > 8192) throw new MemoryValidationError('喜好更新超限');
 const state:PreferenceState = structuredClone(c.preferences || {schemaVersion:1,items:[],trace:[],droppedTrace:0});
 const seen=new Set<string>();
 // Validate all operations against the dispatched snapshot, then apply removals
 // before additions so a full-capacity exchange is independent of array order.
 for (const item of value) {
  if (!item || typeof item !== 'object' || !['upsert','keep','withdraw'].includes(item.operation) || !text(item.id,128) || !version(item.version,0) || !text(item.reason,256) || seen.has(item.id) || !validReferences(item.references)) throw new MemoryValidationError('喜好更新格式無效');
  seen.add(item.id);
  const keys=['operation','id','version','references','reason',...(item.operation==='upsert'?['topic','context','text']:[])];
  if (!fields(item,keys) || item.operation==='upsert' && (!text(item.topic,128) || !text(item.context,256,true) || !text(item.text,512))) throw new MemoryValidationError('喜好欄位無效');
  const previous=state.items.find(current=>current.id===item.id);
  if (previous ? previous.version!==item.version || !visible.preferences?.items.some(current=>current.id===item.id&&current.version===item.version) : item.operation!=='upsert' || item.version!==0 || state.trace.some(trace=>trace.id===item.id)) throw new MemoryValidationError('喜好版本無效或本次未展示');
  for (const ref of item.references) {
   const list=ref.kind==='short'?visible.shortTerm:visible.longTerm;
   if (!list?.some(memory=>memory.id===ref.id&&memory.version===ref.version&&memory.characterId===c.id&&(!('state' in memory)||!memory.state||memory.state==='active')&&memory.time<=time)) throw new MemoryValidationError('喜好只能引用本次可見的本人經驗版本');
  }
 }
 for (const item of value.filter(item=>item.operation==='withdraw')) state.items=state.items.filter(current=>current.id!==item.id);
 for (const item of value) {
  if (item.operation==='upsert') {
   const duplicate=state.items.find(current=>current.id!==item.id&&current.topic.normalize('NFKC').trim().toLowerCase()===item.topic.normalize('NFKC').trim().toLowerCase()&&current.context.normalize('NFKC').trim().toLowerCase()===item.context.normalize('NFKC').trim().toLowerCase());
   if (duplicate) throw new MemoryValidationError('同主題情境的喜好應更新既有身份');
   const next:Preference={id:item.id,characterId:c.id,version:item.version+1,time,topic:item.topic,context:item.context,text:item.text,references:item.references,reason:item.reason};
   const index=state.items.findIndex(current=>current.id===item.id);if(index<0)state.items.push(next);else state.items[index]=next;
  }
  state.trace.push({id:item.id,version:item.operation==='upsert'?item.version+1:item.version,time,operation:item.operation,references:item.references,reason:item.reason});
 }
 while(state.trace.length>24||memoryBytes(state.trace)>16*1024){state.trace.shift();state.droppedTrace++;}
 validatePreferences({...c,preferences:state});
 return state;
}
export function validatePreferences(c: Character) {
 const state=c.preferences;if(!state)return;
 if(!fields(state,['schemaVersion','items','trace','droppedTrace'])||state.schemaVersion!==1||!Array.isArray(state.items)||!Array.isArray(state.trace)||!version(state.droppedTrace,0)||state.items.length>16||memoryBytes(state.items)>16*1024||state.trace.length>24||memoryBytes(state.trace)>16*1024||new Set(state.items.map(item=>item.id)).size!==state.items.length)throw new MemoryValidationError('喜好狀態或容量無效');
 for(const item of state.items)if(!fields(item,['id','characterId','version','time','topic','context','text','references','reason'])||!text(item.id,128)||item.characterId!==c.id||!version(item.version)||!Number.isFinite(item.time)||!text(item.topic,128)||!text(item.context,256,true)||!text(item.text,512)||!text(item.reason,256)||!validReferences(item.references))throw new MemoryValidationError('喜好內容或來源無效');
 for(const trace of state.trace)if(!fields(trace,['id','version','time','operation','reason','references'])||!text(trace.id,128)||!version(trace.version)||!Number.isFinite(trace.time)||!['upsert','keep','withdraw'].includes(trace.operation)||!text(trace.reason,256)||!validReferences(trace.references))throw new MemoryValidationError('喜好變更痕跡無效');
}
