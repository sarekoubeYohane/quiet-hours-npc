import { validateCalendarRequest, applyCalendarMetadata, calendarReadingDetails, type PhoneCalendarRecord } from './phone-calendar';
import { emitPhoneNotification, cancelPhoneRecordNotifications, type PhoneNotification, type PhoneNotificationDedup } from './phone-notifications';
import type { Action, Character, World } from './world';
import type { WorldObject } from './world-effects';
import { canSee, regionOf } from './perception';
import { addExperience, MemoryValidationError } from './memory';

export type PhoneRecord={id:string;version:number;text:string;createdAt:number;updatedAt:number;sharedWith:string[];readers:{actorId:string;at:number;version:number}[]};
export type PhoneMessage=PhoneRecord&{from:string;to:string;deliveredAt:number};
export type PhoneData={objectId:string;notifications?:PhoneNotification[];notificationDedup?:PhoneNotificationDedup[];notificationHistoryDropped?:number;memos:PhoneRecord[];calendar?:PhoneCalendarRecord[];inbox?:PhoneMessage[];inboxActivatedAt?:number;screen:{collection:string;id:string;version:number}[];presentations?:{actorId:string;memoryId:string;collection:string;id:string;version:number}[]};
export type PhoneState={schemaVersion:1;activatedAt:number;devices:PhoneData[]};
export const phoneLimits={records:32,textCharacters:300,textBytes:1024,screen:4,sharedReaders:8,inbox:64};
// Only called on a mutable round candidate. Never normalize on GET.
export function activatePhones(w:World){
 if(w.phones){for(const d of w.phones.devices)if(!d.inbox){d.inbox=[];d.inboxActivatedAt=w.minute;}return;}
 w.phones={schemaVersion:1,activatedAt:w.minute,devices:[]};w.objects??=[];
 for(const c of w.characters){
  let object=w.objects.find(o=>o.kind==='phone'&&o.owner===c.id);
  if(!object){
   const id=`phone:${c.id}:${crypto.randomUUID()}`;
   object={id,source:'phone-baseline-v1',label:`${c.name} 的手機`,kind:'phone',region:regionOf(c),holder:c.id,owner:c.id,revision:1,state:{condition:'sound'},lifecycle:'active',knownTo:[c.id],allowedTo:[c.id]};
   w.objects.push(object);
  }
  w.phones.devices.push({objectId:object.id,memos:[],inbox:[],inboxActivatedAt:w.minute,screen:[]});
 }
}
export function reachablePhone(w:World,c:Character,id:string,readScreen=false):WorldObject|undefined{
 const o=w.objects?.find(o=>o.id===id&&o.kind==='phone');
 return o&&o.lifecycle==='active'&&o.state.condition!=='broken'&&o.region===regionOf(c)&&(o.holder===null||o.holder===c.id||readScreen)&&canSee(w,c,o.region)&&(o.owner===c.id||o.knownTo.includes(c.id))?o:undefined;
}
export function phoneForActor(w:World,c:Character){
 return w.phones?.devices.filter(d=>reachablePhone(w,c,d.objectId)||d.screen.length&&reachablePhone(w,c,d.objectId,true)).map(d=>({objectId:d.objectId,owner:w.objects!.find(o=>o.id===d.objectId)!.owner,records:phoneRecordReferences(w,c,d.objectId)} ))||[];
}
export function phoneData(w:World,id:string):PhoneData{
 const data=w.phones?.devices.find(d=>d.objectId===id);if(!data)throw new MemoryValidationError('手機資料不存在於目前世界。');return data;
}
export function phoneRecordReferences(w:World,c:Character,objectId:string){
 return (phoneData(w,objectId).presentations||[]).filter(p=>{
  if(p.actorId!==c.id)return false;
  const marker=`${p.id} v${p.version}`;
  return (c.shortTerm||[]).some(m=>m.id===p.memoryId&&m.text.includes(marker))||(c.longTerm||[]).some(m=>(!m.state||m.state==='active')&&m.text.includes(marker)&&(m.origin.id===p.memoryId||(m.origins||[]).some(o=>o.id===p.memoryId)));
 }).map(({collection,id,version})=>({collection,id,version}));
}
function parsePhoneRequest(a:Action):Record<string,unknown>{
 let p:Record<string,unknown>;
 try{p=JSON.parse(a.content||'');}catch{throw new MemoryValidationError('手機操作JSON無效。');}
 if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!['collection','operation','id','version','text','reader','offset','condition','arrangement','reminder'].includes(k))||!['memos','inbox','calendar'].includes(p.collection as string))throw new MemoryValidationError('手機操作欄位無效。');
 if(!['list','read','create','update','delete','share','display','reminder'].includes(p.operation as string))throw new MemoryValidationError('手機操作無效。');
 if(p.collection!=='calendar'&&['condition','arrangement','reminder'].some(k=>k in p))throw new MemoryValidationError('此集合不接受行事曆設定。');
 if(p.collection==='inbox'&&['create','update'].includes(p.operation as string))throw new MemoryValidationError('來訊正文不能由收件人建立或修改。');
 if(p.operation==='reminder'&&p.collection!=='calendar')throw new MemoryValidationError('提醒操作僅供行事曆');
 return p;
}
function validatePhoneReferences(w:World,c:Character,a:Action,p:Record<string,unknown>,shown?:ReturnType<typeof phoneForActor>){
 validateCalendarRequest(w,c,p);
 if(p.operation==='list'||p.operation==='create')return;
 if(shown&&!shown.find(d=>d.objectId===a.target)?.records.some(r=>r.collection===p.collection&&r.id===p.id&&r.version===p.version))throw new MemoryValidationError('手機引用未在本次實際輸入展示。');
 if(!phoneRecordReferences(w,c,a.target||'').some(r=>r.collection===p.collection&&r.id===p.id&&r.version===p.version))throw new MemoryValidationError('手機引用未出現在本次可知經歷。請先查看列表。');
}
export function validatePhoneActionReferences(w:World,c:Character,a:Action,shown?:ReturnType<typeof phoneForActor>){
 if(a.type==='phone')validatePhoneReferences(w,c,a,parsePhoneRequest(a),shown);
}

export function phoneExperience(w:World,c:Character,d:PhoneData,text:string,records:PhoneRecord[],collection="memos"){
 addExperience(c,w.minute,text);const memoryId=c.shortTerm!.at(-1)!.id;
 d.presentations??=[];
 for(const r of records){d.presentations=d.presentations.filter(p=>!(p.actorId===c.id&&p.collection===collection&&p.id===r.id));d.presentations.push({actorId:c.id,memoryId,collection,id:r.id,version:r.version});}
}
export function canReadPhoneRecord(c:Character,o:WorldObject,d:PhoneData,collection:string,r:PhoneRecord){
 const displayed=d.screen.some(s=>s.collection===collection&&s.id===r.id&&s.version===r.version);
 if(o.holder!==null&&o.holder!==c.id)return displayed;
 return o.owner===c.id||r.sharedWith.includes(c.id)||displayed;
}
export function notePhoneReading(w:World,c:Character,r:PhoneRecord,label:string){
 r.readers=r.readers.filter(reader=>reader.actorId!==c.id);r.readers.push({actorId:c.id,at:w.minute,version:r.version});
 addExperience(c,w.minute,`我在手機上實際讀到${label} ${r.id} v${r.version}「${r.text}」。`);
}
export const phonePrompt=' 手機行事曆collection=calendar沿同一list/read/create/update/delete/share/display；可選condition為內在安排同款time/event/context條件，arrangement={id,version}只連結本次實際可見的本人安排，不自動形成意圖或接受邀請。create/update可明示reminder=true以該condition設定提醒，預設不設。單獨設定或延期用operation=reminder並填condition；取消用condition=null。每機最多32筆行事曆。外部原文不隨遺忘改變，實際read才知道完整資料；通知只是一聲線索。'+' 手機收件匣collection=inbox只可list/read/delete/share/display，不可create/update正文。list不標已讀，只有指定read才建立本人閱讀，重讀不發送訊息，閱讀不代表相信、同意或回覆。message沿既有聯絡人入口送達對方裝置，必須有本人可操作發訊手機和有效收件裝置；對方不會因送達直接知道正文。收件匣最多64則，滿時明示失敗，不靜默丟未讀。啟用前歷史閱讀狀態未知，不從舊事件補造。 手機不是遠端知識：phones 只列現在可操作裝置。type=phone、target=objectId，content為JSON字串 {"collection":"memos","operation":"list|read|create|update|delete|share|display","id":"穩定id","version":0,"text":"原文","reader":"聯絡人id"}。list可填offset（預設0，每頁8筆），只取得有限身份和版本，不讀正文；read指定id/version才真正閱讀。create用新id和version=0與text，update/delete/share/display用本次實際看過的有效版本。share須由物主指定reader，只分享該項；display由物主展示該項於有限畫面，其他實際接觸者才能讀，不能假設解鎖或同意。備忘錄每機32筆、每筆300字/1024bytes，content JSON仍最多500字。一次只操作一項，固定15分鐘，不追加決策；外部原文不隨遺忘模糊，讀到不等於相信、回覆或完成安排。沒有實際閱讀不能宣稱知道內容。';
export function applyPhoneAction(w:World,c:Character,a:Action,dryRun=false){
 const p=parsePhoneRequest(a);
 const o=reachablePhone(w,c,a.target||'',p.operation==='read'||p.operation==='list');if(!o)throw new MemoryValidationError('目前無法操作這部手機。');
 const d=phoneData(w,o.id);
 const collection=p.collection as 'memos'|'inbox'|'calendar';const records:PhoneRecord[]=collection==='memos'?d.memos:collection==='calendar'?(d.calendar||[]):(d.inbox||[]);
 const operation=p.operation;
 const label=collection==='memos'?'備忘錄':collection==='calendar'?'行事曆':'收件匣';
 const owner=o.owner===c.id;
 if(operation!=='read'&&operation!=='list'&&o.holder!==null&&o.holder!==c.id)throw new MemoryValidationError('目前只能閱讀展示的畫面，無法操作別人手中的手機。');
 validatePhoneReferences(w,c,a,p);
 if(operation==='list'){
  const visible=records.filter(r=>canReadPhoneRecord(c,o,d,collection,r));
  const offset=p.offset===undefined?0:p.offset;if(typeof offset!=='number'||!Number.isSafeInteger(offset)||offset<0)throw new MemoryValidationError('列表offset無效。');
  const page=visible.slice(offset,offset+8);
  if(!dryRun)phoneExperience(w,c,d,`我查看手機${label}列表（不含正文）：${page.map(r=>`${r.id} v${r.version}${collection==='inbox'?`（${r.readers.some(reader=>reader.actorId===(r as PhoneMessage).to)?'收訊人已讀':'收訊人未讀'}）`:''}`).join('、')||'沒有可讀項目'}。${visible.length>offset+8?`另有${visible.length-offset-8}項未展示，可用offset=${offset+8}接續。`:''}`,page,collection);
  return;
 }
 if(typeof p.id!=='string'||!/^[A-Za-z0-9_.:-]{1,64}$/.test(p.id)||!Number.isSafeInteger(p.version))throw new MemoryValidationError('手機資料引用無效。');
 const r=records.find(r=>r.id===p.id);
 if(operation==='create'){
  if(!owner||r||p.version!==0||records.length>=phoneLimits.records)throw new MemoryValidationError('無法新增備忘錄：權限、身份或容量不符。');
 }else if(!r||r.version!==p.version)throw new MemoryValidationError('手機資料不存在或版本已過期。');
 if(operation==='read'){
  if(!canReadPhoneRecord(c,o,d,collection,r!))throw new MemoryValidationError('沒有此內容的可讀條件。');
  if(!dryRun){notePhoneReading(w,c,r!,collection==='inbox'?`來自 ${w.characters.find(actor=>actor.id===(r as PhoneMessage).from)?.name||'已知聯絡人'} 的私人訊息`:label);if(collection==='calendar')addExperience(c,w.minute,calendarReadingDetails(r as PhoneCalendarRecord));phoneExperience(w,c,d,`我取得${label} ${r!.id} v${r!.version} 的閱讀經歷。`,[r!],collection);}return;
 }
 if(!owner)throw new MemoryValidationError('沒有修改私人資料的權限。');
 if(operation==='create'||operation==='update'){
  if(typeof p.text!=='string'||!p.text.trim()||p.text.length>phoneLimits.textCharacters||new TextEncoder().encode(p.text).length>phoneLimits.textBytes)throw new MemoryValidationError('備忘錄原文超過容量或為空。');
 }
 if(operation==='share'&&(typeof p.reader!=='string'||!w.characters.some(actor=>actor.id===p.reader)||!r!.sharedWith.includes(p.reader)&&r!.sharedWith.length>=phoneLimits.sharedReaders))throw new MemoryValidationError('分享讀者無效或超限。');
 if(operation==='display'&&d.screen.length>=phoneLimits.screen&&!d.screen.some(s=>s.collection===collection&&s.id===p.id))throw new MemoryValidationError('可讀畫面已滿，未覆蓋既有項目。');
 if(dryRun)return;
 if(operation==='create'){if(collection==='calendar')d.calendar=records as PhoneCalendarRecord[];records.push({id:p.id,version:1,text:p.text as string,createdAt:w.minute,updatedAt:w.minute,sharedWith:[],readers:[]});}
 else if(operation==='update'){r!.text=p.text as string;r!.version++;r!.updatedAt=w.minute;d.screen=d.screen.filter(s=>s.collection!==collection||s.id!==p.id);}
 else if(operation==='delete'){if(collection==='inbox')cancelPhoneRecordNotifications(d,'message',p.id,w.minute,{deleted:true});if(collection==='calendar'){cancelPhoneRecordNotifications(d,'reminder',p.id,w.minute,{deleted:true});d.calendar=d.calendar?.filter(item=>item.id!==p.id);}else if(collection==='memos')d.memos=d.memos.filter(item=>item.id!==p.id);else d.inbox=d.inbox?.filter(item=>item.id!==p.id);d.presentations=d.presentations?.filter(item=>item.collection!==collection||item.id!==p.id);d.screen=d.screen.filter(s=>s.collection!==collection||s.id!==p.id);}
 else if(operation==='share'){if(!r!.sharedWith.includes(p.reader as string))r!.sharedWith.push(p.reader as string);r!.version++;d.screen=d.screen.filter(s=>s.collection!==collection||s.id!==p.id);}
 else if(operation==='reminder'){r!.version++;r!.updatedAt=w.minute;d.screen=d.screen.filter(s=>s.collection!==collection||s.id!==p.id);}
 else if(operation==='display'){for(const actor of w.characters)if(regionOf(actor)===o.region&&canSee(w,actor,o.region)&&!o.knownTo.includes(actor.id))o.knownTo.push(actor.id);d.screen=d.screen.filter(s=>s.collection!==collection||s.id!==p.id);d.screen.push({collection,id:r!.id,version:r!.version});}
 if(collection==='calendar'&&operation!=='delete'&&operation!=='display'){const calendar=records.find(item=>item.id===p.id)! as PhoneCalendarRecord;applyCalendarMetadata(w,d,calendar,p);addExperience(c,w.minute,`我已成功保存${calendarReadingDetails(calendar)}`);}
 phoneExperience(w,c,d,`我已在手機完成${label} ${operation}：${p.id} v${operation==='create'?1:r!.version}${operation==='create'||operation==='update'?`，原文「${p.text}」`:''}。`,operation==='delete'?[]:[(collection==='memos'?d.memos:collection==='calendar'?d.calendar||[]:d.inbox||[]).find(item=>item.id===p.id)!],collection);
}

// Delivery is a story mutation on the same round candidate, not perception or reading.
export function deliverPhoneMessage(w:World,sender:Character,recipient:Character,text:string,dryRun=false){
 const source=w.phones?.devices.find(d=>{const o=reachablePhone(w,sender,d.objectId);return o?.owner===sender.id;});
 if(!source)throw new MemoryValidationError('沒有目前可操作的本人手機，訊息尚未傳送。');
 const destination=w.phones?.devices.find(d=>{const o=w.objects?.find(o=>o.id===d.objectId);return o?.owner===recipient.id&&o.kind==='phone'&&o.lifecycle==='active'&&o.state.condition!=='broken';});
 if(!destination?.inbox)throw new MemoryValidationError('收訊裝置目前不可用，訊息尚未送達。');
 if(destination.inbox.length>=phoneLimits.inbox)throw new MemoryValidationError('收件匣已滿，未刪除未讀或原文，訊息尚未送達。');
 if(dryRun)return;
 const message:PhoneMessage={id:crypto.randomUUID(),version:1,text,createdAt:w.minute,updatedAt:w.minute,from:sender.id,to:recipient.id,deliveredAt:w.minute,sharedWith:[],readers:[]};
 destination.inbox.push(message);emitPhoneNotification(w,destination,{kind:'message',recordId:message.id,recordVersion:message.version});return {device:destination,message};
}
