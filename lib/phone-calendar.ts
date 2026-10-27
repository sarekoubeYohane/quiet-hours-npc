import type { Character, World } from './world';
import type { PhoneData, PhoneRecord } from './phones';
import { arrangementsForDecision, validArrangementCondition, validateArrangementConditionScope, type ArrangementCondition } from './arrangements';
import { knownConditionSignal, nextConditionCue, type ArrangementCueState } from './arrangement-cues';
import { normalDecisionInput } from './npc-input';
import { reachablePhone } from './phones';
import { isSleeping } from './needs';
import { emitPhoneNotification, cancelPhoneRecordNotifications } from './phone-notifications';
import { MemoryValidationError } from './memory';
export type PhoneCalendarRecord=PhoneRecord&{schedule?:ArrangementCondition;arrangement?:{id:string;version:number};reminder?:{version:number;enabled:boolean;condition:ArrangementCondition;conditionSince:number;cue?:ArrangementCueState;emittedKey?:string}};
export function validateCalendarRequest(w:World,c:Character,p:Record<string,unknown>){
 if(p.collection!=='calendar')return;
 if(!['create','update','reminder'].includes(p.operation as string)&&['condition','arrangement','reminder'].some(k=>k in p))throw new MemoryValidationError('此行事曆操作不修改設定');
 if(p.condition!==undefined&&p.condition!==null&&!validArrangementCondition(p.condition as ArrangementCondition))throw new MemoryValidationError('行事曆條件格式無效');
 const condition=p.condition as ArrangementCondition|undefined;
 if(condition)validateArrangementConditionScope(w,c,condition);
 if(p.reminder!==undefined&&typeof p.reminder!=='boolean')throw new MemoryValidationError('提醒設定須明示開啟或關閉');
 if(p.operation==='reminder'&&p.condition===undefined||p.reminder===true&&!condition)throw new MemoryValidationError('設定提醒必須明示條件，取消使用condition=null');
 if(p.arrangement!==undefined&&p.arrangement!==null){
  const ref=p.arrangement as {id:string;version:number};
  if(!ref||typeof ref!=='object'||Array.isArray(ref)||Object.keys(ref).some(k=>!['id','version'].includes(k))||!arrangementsForDecision(c).items.some(i=>i.id===ref.id&&i.version===ref.version)||!c.arrangements?.items.some(i=>i.id===ref.id&&i.version===ref.version))throw new MemoryValidationError('行事曆只能連結本次實際可見的本人有效安排');
 }
}
export function applyCalendarMetadata(w:World,d:PhoneData,r:PhoneCalendarRecord,p:Record<string,unknown>){
 if(p.arrangement===null)delete r.arrangement;else if(p.arrangement!==undefined)r.arrangement=structuredClone(p.arrangement as PhoneCalendarRecord['arrangement']);
 if(p.condition===null&&p.operation!=='reminder')delete r.schedule;else if(p.condition!==undefined&&p.condition!==null)r.schedule=structuredClone(p.condition as ArrangementCondition);
 const explicit=p.operation==='reminder'||p.reminder!==undefined;
 if(explicit){
  const enabled=p.operation==='reminder'?p.condition!==null:p.reminder===true;
  cancelPhoneRecordNotifications(d,'reminder',r.id,w.minute);
  const condition=(p.condition||r.reminder?.condition||r.schedule) as ArrangementCondition|undefined;
  if(enabled&&!condition)throw new MemoryValidationError('啟用提醒缺少明示條件');
  if(condition)r.reminder={version:r.version,enabled,condition:structuredClone(condition),conditionSince:w.minute};else delete r.reminder;
 }else if(r.reminder){
  // A text/share revision invalidates old notification handles but is not a
  // fresh reminder. The semantic cue and emitted key survive unchanged.
  r.reminder.version=r.version;
  cancelPhoneRecordNotifications(d,'reminder',r.id,w.minute,{olderThanVersion:r.version});
 }
}
export function calendarReadingDetails(record:PhoneCalendarRecord){
 return `行事曆條件：${record.schedule?JSON.stringify(record.schedule):'未另設條件'}；提醒：${record.reminder?.enabled?JSON.stringify(record.reminder.condition):'未開啟或已取消'}${record.arrangement?`；保存時連結紀錄者安排 ${record.arrangement.id} v${record.arrangement.version}（不自動接受或完成）`:''}。`;
}
function candidates(w:World){
 return (w.phones?.devices||[]).flatMap(device=>{
  const object=w.objects?.find(o=>o.id===device.objectId&&o.lifecycle==='active'&&o.state.condition!=='broken');if(!object)return [];
  const actor=w.characters.find(c=>c.id===object.owner);if(!actor)return [];
  return (device.calendar||[]).filter(record=>record.reminder?.enabled).map(record=>{
   const reminder=record.reminder!;
   // The device has a clock. Event/context settings have no omniscient feed:
   // only actual known input while the awake owner can access this device.
   const hasInput=reminder.condition.kind==='time'||!isSleeping(actor)&&!!reachablePhone(w,actor,device.objectId);
   const input=hasInput&&reminder.condition.kind!=='time'?normalDecisionInput(w,actor,actor.plan?.modelKey||'demo'):undefined;
   const signal=hasInput?knownConditionSignal(w,actor,reminder.condition,{observations:input?.self.observations||[]},reminder.conditionSince):undefined;
   const cue=nextConditionCue(reminder.cue,reminder.condition,signal,w.minute);
   return {device,record,reminder,cue};
  });
 });
}
export function hasDueCalendarReminder(w:World){return candidates(w).some(({reminder,cue})=>cue.trigger&&reminder.emittedKey!==cue.trigger.key);}
export function advanceCalendarReminders(w:World){
 for(const {device,record,reminder,cue} of candidates(w)){
  reminder.cue=cue;
  if(!cue.trigger||reminder.emittedKey===cue.trigger.key)continue;
  emitPhoneNotification(w,device,{kind:'reminder',recordId:record.id,recordVersion:reminder.version,key:cue.trigger.key,generation:cue.epoch});
  reminder.emittedKey=cue.trigger.key;
 }
}
