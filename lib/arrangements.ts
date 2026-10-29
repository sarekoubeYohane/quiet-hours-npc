import type { Character, Intent, World } from './world';
import { MemoryValidationError, memoryBytes, type ShortMemory } from './memory';
import { regions } from './perception';
import { conditionKey, type ArrangementCueState } from './arrangement-cues';
import type { PreferenceReference } from './preferences';

export type ArrangementCondition = { kind:'time'; minute:number } | { kind:'event'; clueKind:'person'|'speech'|'sound'|'door'|'activity'; source:string; region:string } | { kind:'context'; region:string };
export type ArrangementPursuit={id:string;version:number};
export type ArrangementPursuitState={status:'active'|'ended'|'missing';currentVersion:number|null};
export type Arrangement = {pursuit?:ArrangementPursuit|null; id:string;characterId:string;version:number;time:number;text:string;condition:ArrangementCondition;status:'active'|'completed'|'dropped';references:PreferenceReference[];memory:{id:string;version:number};conditionSince?:number;cue?:ArrangementCueState };
export type ArrangementState = {schemaVersion:1;items:Arrangement[];archived?:{id:string;version:number}[]};
export const arrangementCapacity=16;
const bounded=(v:unknown,max:number):v is string=>typeof v==='string'&&!!v.trim()&&new TextEncoder().encode(v).length<=max;
const fields=(v:object,keys:string[])=>Object.keys(v).every(key=>keys.includes(key));
export function arrangementExperience(item:Pick<Arrangement,'id'|'version'|'text'|'condition'|'status'|'pursuit'>){return `我的柔性安排 ${item.id} v${item.version}（${item.status}）：${item.text}；條件：${JSON.stringify(item.condition)}${item.pursuit?`；關聯追求：${item.pursuit.id}`:''}`;}
// Identity is insufficient: rewritten/forgotten detail must never be revived
// from the observer's arrangement index. Only the complete dispatched episode
// authorizes the corresponding exact arrangement body.
export function arrangementPursuitState(c:Character,item:Pick<Arrangement,'pursuit'>):ArrangementPursuitState|null{
 if(!item.pursuit)return null;
 const endpoint=c.intents?.find(node=>node.id===item.pursuit!.id);
 return {status:!endpoint?'missing':endpoint.status==='active'?'active':'ended',currentVersion:endpoint?.version??null};
}
export function arrangementsForDecision(c:Character, visible:Pick<Character,'shortTerm'|'longTerm'>=c){
 const memories=[...(visible.shortTerm||[]),...(visible.longTerm||[]).filter(m=>!m.state||m.state==='active')];
 return {items:(c.arrangements?.items||[]).filter(item=>item.characterId===c.id&&memories.some(m=>m.characterId===c.id&&m.text===arrangementExperience(item)&&(m.id===item.memory.id&&m.version===item.memory.version||'origin'in m&&m.origin.id===item.memory.id&&m.origin.version===item.memory.version))).map(item=>{const projected={...item,pursuitState:arrangementPursuitState(c,item)};delete projected.cue;delete projected.conditionSince;return projected;}),capacity:arrangementCapacity};
}
const referenceSchema={type:'array',minItems:1,maxItems:8,items:{type:'object',properties:{kind:{type:'string',enum:['short','long']},id:{type:'string'},version:{type:'integer',minimum:1}},required:['kind','id','version'],additionalProperties:false}};
export const arrangementConditionSchema={anyOf:[{type:'object',properties:{kind:{type:'string',enum:['time']},minute:{type:'integer',minimum:0}},required:['kind','minute'],additionalProperties:false},{type:'object',properties:{kind:{type:'string',enum:['event']},clueKind:{type:'string',enum:['person','speech','sound','door','activity']},source:{type:'string'},region:{type:'string'}},required:['kind','clueKind','source','region'],additionalProperties:false},{type:'object',properties:{kind:{type:'string',enum:['context']},region:{type:'string'}},required:['kind','region'],additionalProperties:false}]};
const pursuitLinkSchema={anyOf:[{type:'object',properties:{id:{type:'string',minLength:1,maxLength:64},version:{type:'integer',minimum:0}},required:['id','version'],additionalProperties:false},{type:'null'}]};
export const arrangementUpdatesSchema={type:'array',maxItems:4,items:{type:'object',properties:{operation:{type:'string',enum:['upsert','keep','complete','drop','archive']},id:{type:'string'},version:{type:'integer',minimum:0},text:{type:'string'},condition:arrangementConditionSchema,references:referenceSchema,reason:{type:'string'},pursuit:pursuitLinkSchema},required:['operation','id','version','text','condition','references','reason','pursuit'],additionalProperties:false}};
export const arrangementPrompt='pursuit 為 null（獨立安排）或 {id,version}（連結自己的正式追求）：upsert新同批追求版本0、既有用本次self.intents版本，程式保存連結當時版本；安排投影的pursuitState.currentVersion另表示目前版本，不因無關版本升級失效或重新喚起。keep/complete/drop/archive保留原pursuit關聯，失效仍可結束或歸檔；upsert可用null明示解除連結。ended/missing只停止此追求的再考慮線索，不自動完成/放下安排，也不復活追求。已結束後的新追求須新身份明示承接。追求只提供關聯，安排精確內容仍須本次完整經歷，不能只憑追求ID復活已忘安排或未讀手機正文。 ' + 'arrangementUpdates 是同次正常決策中的柔性安排更新，不是強制作息。upsert 使用穩定id、新項目version=0／修改用本次self.arrangements的版本、text、condition、references（本次本人可見short／long記憶id/version）、reason。condition 為 {kind:"time",minute:世界絕對分鐘}、{kind:"event",clueKind:"person|speech|sound|door|activity",source:已知人物id或空字串,region:已知區域或空字串} 或 {kind:"context",region:已知區域}。keep／complete／drop／archive 同樣帶回本次可見原text與condition、有效來源與理由；可用upsert明示延期。沒有更新回空陣列。安排、需求、喜好與習慣由你自行取捨並排列intents，沒有安排也合法。安排不複製活動進度。安排最多16筆（含已完成／放下的身份）；已完成／放下可明示archive釋放索引，仍有效安排不可歸檔；容量滿須保留資料並在後續決策取捨，不能默默刪除。內在安排只有實際可見記憶保留完整內容時才展示，未展示不是已放下；到期不代表你已察覺錯過，也不強制執行。';
export function validArrangementCondition(value:ArrangementCondition){
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 if(value.kind==='time')return fields(value,['kind','minute'])&&Number.isSafeInteger(value.minute)&&value.minute>=0;
 if(value.kind==='context')return fields(value,['kind','region'])&&bounded(value.region,128);
 return value.kind==='event'&&fields(value,['kind','clueKind','source','region'])&&['person','speech','sound','door','activity'].includes(value.clueKind)&&typeof value.source==='string'&&typeof value.region==='string'&&memoryBytes(value)<=512;
}
export function validateArrangementConditionScope(w:World,c:Character,condition:ArrangementCondition){
  if(condition.kind==='event'&&condition.source&&!w.characters.some(p=>p.id===condition.source))throw new MemoryValidationError('安排人物未知');
  if(condition.kind!=='time'&&condition.region&&!regions.some(r=>r.id===condition.region)){
   // Static scene regions are checked against the same known scene projection.
   const knownRegions=new Set([c.region,c.location,...w.characters.filter(p=>p.id===c.id).map(p=>p.region)]);
   if(!knownRegions.has(condition.region))throw new MemoryValidationError('安排區域未知');
  }
}
export function updateArrangements(w:World,c:Character,value:unknown,visible:Character,nextIntents:Intent[]=c.intents||[]):{arrangements?:ArrangementState;experiences:ShortMemory[]}{
 if(value===undefined||Array.isArray(value)&&value.length===0)return {experiences:[]};
 if(!Array.isArray(value)||value.length>4||memoryBytes(value)>8192)throw new MemoryValidationError('安排更新超限');
 const state:ArrangementState=structuredClone(c.arrangements||{schemaVersion:1,items:[]}),experiences:ShortMemory[]=[],seen=new Set();
 const shown=arrangementsForDecision(c,visible).items.filter(i=>visible.arrangements?.items.some(shown=>shown.id===i.id&&shown.version===i.version));
 for(const item of value){
  if(!item||typeof item!=='object'||!fields(item,['operation','id','version','text','condition','references','reason','pursuit'])||!['upsert','keep','complete','drop','archive'].includes(item.operation)||!bounded(item.id,128)||!Number.isSafeInteger(item.version)||item.version<0||!bounded(item.text,512)||!bounded(item.reason,256)||!validArrangementCondition(item.condition)||!Array.isArray(item.references)||!item.references.length||item.references.length>8||seen.has(item.id))throw new MemoryValidationError('安排候選格式無效');
  seen.add(item.id);
  const old=state.items.find(i=>i.id===item.id);
  if(old?old.version!==item.version||!shown.some(i=>i.id===item.id&&i.version===item.version):item.version!==0||item.operation!=='upsert'||state.archived?.some(i=>i.id===item.id))throw new MemoryValidationError('安排版本過期或本次未展示');
  for(const ref of item.references){
   if(!ref||typeof ref!=='object'||Array.isArray(ref)||!bounded(ref.id,128)||!Number.isSafeInteger(ref.version)||ref.version<1||!fields(ref,['kind','id','version'])||!['short','long'].includes(ref.kind)||!(ref.kind==='short'?visible.shortTerm:visible.longTerm)?.some(m=>m.characterId===c.id&&m.id===ref.id&&m.version===ref.version&&(!('state'in m)||!m.state||m.state==='active')))throw new MemoryValidationError('安排只能引用本次本人可見經歷');
  }
  const condition=item.condition as ArrangementCondition;
  validateArrangementConditionScope(w,c,condition);
  const proposed=item.pursuit===undefined?old?.pursuit??null:item.pursuit;
  let pursuit:ArrangementPursuit|null=null;
  if(proposed!==null){
   if(typeof proposed!=='object'||Array.isArray(proposed)||Object.keys(proposed).sort().join(',')!=='id,version'||!bounded(proposed.id,64)||!proposed.id.startsWith(c.id+':')||!Number.isSafeInteger(proposed.version)||proposed.version<0)throw new MemoryValidationError('安排追求關聯格式或本人範圍無效');
   if(item.operation==='upsert'&&item.pursuit!==undefined){
    const original=c.intents?.find(node=>node.id===proposed.id),endpoint=nextIntents.find(node=>node.id===proposed.id);
    if(!endpoint||endpoint.status!=='active'||(original?original.version!==proposed.version||!visible.intents?.some(node=>node.id===original.id&&node.version===original.version):proposed.version!==0))throw new MemoryValidationError('安排追求端點不存在、已結束、過期或本次未展示');
    pursuit={id:endpoint.id,version:endpoint.version!};
   }else pursuit={id:proposed.id,version:proposed.version};
  }
  if(old&&item.operation!=='upsert'&&JSON.stringify(pursuit)!==JSON.stringify(old.pursuit??null))throw new MemoryValidationError('安排完成／放下不能暗改追求關聯');
  if(item.operation==='keep')continue;
  if(item.operation==='archive'){if(!old||old.status==='active')throw new MemoryValidationError('不能歸檔未完成安排');state.items=state.items.filter(i=>i.id!==item.id);state.archived=[...(state.archived||[]),{id:old.id,version:old.version}].slice(-24);continue;}
  if(old&&item.operation!=='upsert'&&(item.text!==old.text||conditionKey(condition)!==conditionKey(old.condition)))throw new MemoryValidationError('完成／放下不能暗改安排');
  const next:Arrangement={pursuit,id:item.id,characterId:c.id,version:item.version+1,time:w.minute,text:item.text,condition,status:item.operation==='complete'?'completed':item.operation==='drop'?'dropped':'active',references:item.references,conditionSince:old&&conditionKey(old.condition)===conditionKey(condition)?old.conditionSince??old.time:w.minute,...(old?.cue&&conditionKey(old.condition)===conditionKey(condition)?{cue:old.cue}:{}),memory:{id:crypto.randomUUID(),version:1}};
  const index=state.items.findIndex(i=>i.id===next.id);if(index<0)state.items.push(next);else state.items[index]=next;
  experiences.push({id:next.memory.id,version:1,characterId:c.id,time:w.minute,text:arrangementExperience(next),source:{kind:'experience'}});
 }
 validateArrangements({...c,arrangements:state});return {arrangements:state,experiences};
}
export function validateArrangements(c:Character){
 const state=c.arrangements;if(!state)return;
 if(state.archived&&(!Array.isArray(state.archived)||state.archived.length>24||state.archived.some(i=>!i||!bounded(i.id,128)||!Number.isSafeInteger(i.version)||i.version<1)))throw new MemoryValidationError('安排歸檔身份無效');
 if(state.schemaVersion!==1||!fields(state,['schemaVersion','items','archived'])||!Array.isArray(state.items)||state.items.length>arrangementCapacity||memoryBytes({...state,items:state.items.map(item=>{const core={...item};delete core.cue;return core;})})>24*1024||memoryBytes(state)>40*1024||new Set(state.items.map(i=>i.id)).size!==state.items.length)throw new MemoryValidationError('安排容量或狀態無效');
 for(const item of state.items){
  if(item.conditionSince!==undefined&&(!Number.isFinite(item.conditionSince)||item.conditionSince<0||item.conditionSince>item.time))throw new MemoryValidationError('安排條件啟用時間無效');
  if(item.pursuit&&(typeof item.pursuit!=='object'||Array.isArray(item.pursuit)||Object.keys(item.pursuit).sort().join(',')!=='id,version'||!bounded(item.pursuit.id,64)||!item.pursuit.id.startsWith(c.id+':')||!Number.isSafeInteger(item.pursuit.version)||item.pursuit.version<1))throw new MemoryValidationError('安排保存追求關聯無效');
  const cue=item.cue;
  if(cue&&(memoryBytes(cue)>1024||!fields(cue,['conditionKey','lastMatch','epoch','trigger','observationCursor'])||cue.conditionKey!==conditionKey(item.condition)||cue.lastMatch!==null&&!bounded(cue.lastMatch,1024)||!Number.isSafeInteger(cue.epoch)||cue.epoch<0||cue.observationCursor&&(!fields(cue.observationCursor,['id','time','sequence'])||!bounded(cue.observationCursor.id,128)||!Number.isFinite(cue.observationCursor.time)||cue.observationCursor.time<0||cue.observationCursor.sequence!==undefined&&(!Number.isSafeInteger(cue.observationCursor.sequence)||cue.observationCursor.sequence<0))||cue.trigger&&(!fields(cue.trigger,['key','at','handledAt'])||!bounded(cue.trigger.key,2048)||!Number.isFinite(cue.trigger.at)||cue.trigger.handledAt!==undefined&&!Number.isFinite(cue.trigger.handledAt))))throw new MemoryValidationError('安排喚起游標無效');
  if(item.characterId!==c.id||!bounded(item.id,128)||!Number.isSafeInteger(item.version)||item.version<1||!Number.isFinite(item.time)||!bounded(item.text,512)||!validArrangementCondition(item.condition)||!['active','completed','dropped'].includes(item.status)||!bounded(item.memory?.id,128)||item.memory.version!==1)throw new MemoryValidationError('安排狀態無效');
 }
}
