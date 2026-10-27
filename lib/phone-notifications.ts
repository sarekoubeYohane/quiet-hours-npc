import type { Character, World } from './world';
import { record } from './world';
import type { PhoneData } from './phones';
import { regions } from './perception';
import { isSleeping } from './needs';
import { MemoryValidationError, memoryBytes } from './memory';

export type PhoneNoticeExposure={actorId:string;status:'direct'|'uncertain'|'no-opportunity'|'noticed'|'missed';observationIds:string[];reevaluationOfferedAt?:number;handledAt?:number};
export type PhoneNotification={id:string;kind:'message'|'reminder';recordId:string;recordVersion:number;key:string;generation:number;cancelledAt?:number;emittedAt:number;eventId:string;exposures:PhoneNoticeExposure[]};
export type PhoneNotificationDedup={kind:PhoneNotification['kind'];recordId:string;recordVersion:number;generation:number;key:string};
export const phoneNotificationLimits={records:128,perInput:4};
// This creates an external stimulus only. Its content is never the private record.
// Reusing the same record/version/condition key returns the original sound.
export function emitPhoneNotification(w:World,device:PhoneData,source:{kind:PhoneNotification['kind'];recordId:string;recordVersion:number;key?:string;generation?:number}){
 const key=source.key||'delivery',generation=source.generation??1;
 if(!Number.isSafeInteger(generation)||generation<1||!Number.isSafeInteger(source.recordVersion)||source.recordVersion<1||key.length>2048)throw new MemoryValidationError('通知版本或條件引用無效。');
 const previous=device.notifications?.find(n=>n.cancelledAt===undefined&&n.kind===source.kind&&n.recordId===source.recordId&&n.recordVersion===source.recordVersion&&n.key===key);if(previous)return previous;
 const prior=device.notificationDedup?.find(n=>n.kind===source.kind&&n.recordId===source.recordId);
 if(prior&&(source.recordVersion<prior.recordVersion||source.recordVersion===prior.recordVersion&&generation<=prior.generation))return;
 if(!prior&&(device.notificationDedup?.length||0)>=phoneNotificationLimits.records)throw new MemoryValidationError('通知來源已滿，未刪除有效去重資料。');
 const object=w.objects?.find(o=>o.id===device.objectId&&o.kind==='phone'&&o.lifecycle==='active'&&o.state.condition!=='broken');
 if(!object)throw new MemoryValidationError('裝置不可用，無法產生手機通知。');
 while((device.notifications?.length||0)>=phoneNotificationLimits.records){
  const index=device.notifications!.findIndex(n=>n.cancelledAt!==undefined||n.exposures.every(e=>!e.observationIds.length||e.handledAt!==undefined));
  if(index<0)throw new MemoryValidationError('手機通知待處理紀錄已滿，請明示處理或刪除對應資料。');
  device.notifications!.splice(index,1);device.notificationHistoryDropped=(device.notificationHistoryDropped||0)+1;
 }
 const location=regions.find(r=>r.id===object.region)?.location;if(!location)throw new MemoryValidationError('手機通知位置無效。');
 record(w,'device','一部手機發出一聲提示音。','phone-notification',[],{from:location,to:location,fromRegion:object.region,toRegion:object.region,target:object.id});
 const event=w.events.at(-1)!;
 const notification:PhoneNotification={id:crypto.randomUUID(),...source,key,generation,emittedAt:w.minute,eventId:event.id,exposures:(event.perception||[]).map(p=>({actorId:p.characterId,status:p.status,observationIds:p.observations.map(o=>o.id)}))};
 (device.notifications??=[]).push(notification);device.notificationDedup=(device.notificationDedup||[]).filter(n=>n.kind!==source.kind||n.recordId!==source.recordId);device.notificationDedup.push({kind:source.kind,recordId:source.recordId,recordVersion:source.recordVersion,generation,key});return notification;
}
function allNotices(w:World){return (w.phones?.devices||[]).flatMap(d=>d.notifications||[]);}
type NoticeInput={self:{shortTerm:{id:string;observation?:{id:string}}[];observations:{time:number;kind:string}[]}};
export function phoneNotificationsForDecision(w:World,c:Character,input:NoticeInput){
 if(isSleeping(c))return [];
 const visibleIds=new Set(input.self.shortTerm.flatMap(m=>[m.id,...(m.observation?[m.observation.id]:[])]));
 return allNotices(w).filter(n=>n.cancelledAt===undefined).flatMap(n=>{const exposure=n.exposures.find(e=>e.actorId===c.id);if(!exposure||exposure.handledAt!==undefined)return [];
  const ids=exposure.observationIds.filter(id=>visibleIds.has(id));return ids.length?[{id:n.id,observationIds:ids}]:[];});
}
export function boundPhoneNotifications<T extends NoticeInput & {self:{noticeOpportunities:{id:string;observationIds:string[]}[];noticeOpportunityGap:number}}>(w:World,c:Character,input:T,extra?:unknown){
 const all=phoneNotificationsForDecision(w,c,input);input.self.noticeOpportunities=all.slice(0,phoneNotificationLimits.perInput);
 while(input.self.noticeOpportunities.length&&memoryBytes({input,...(extra?{extra}:{})})>88*1024-512)input.self.noticeOpportunities.pop();
 input.self.noticeOpportunityGap=all.length-input.self.noticeOpportunities.length;
}
export function hasUnevaluatedPhoneNotification(w:World,c:Character,shown:{id:string}[]){
 if(isSleeping(c))return false;
 return shown.some(handle=>allNotices(w).find(n=>n.id===handle.id)?.exposures.some(e=>e.actorId===c.id&&e.reevaluationOfferedAt===undefined&&e.handledAt===undefined));
}
// A normal decision is one scheduling opportunity for the currently noticed
// batch. Omitted rows remain unhandled and can surface at a later normal slot.
export function acknowledgePhoneNotifications(w:World,c:Character,receipts:string[]|undefined,minute:number){
 if(receipts===undefined)return;
 for(const n of allNotices(w)){
  const exposure=n.exposures.find(e=>e.actorId===c.id);if(!exposure||!exposure.observationIds.length)continue;
  exposure.reevaluationOfferedAt??=minute;
  if(receipts.includes(n.id))exposure.handledAt??=minute;
 }
}

export function cancelPhoneRecordNotifications(device:PhoneData,kind:PhoneNotification['kind'],recordId:string,minute:number,options:{deleted?:boolean;olderThanVersion?:number}={}){
 for(const notification of device.notifications||[])if(notification.kind===kind&&notification.recordId===recordId&&(options.olderThanVersion===undefined||notification.recordVersion<options.olderThanVersion))notification.cancelledAt??=minute;
 if(options.deleted)device.notificationDedup=device.notificationDedup?.filter(n=>n.kind!==kind||n.recordId!==recordId);
}
