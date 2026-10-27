import type { Action, Character, World } from './world';
import type { WorldObject } from './world-effects';
import { canSee, regionOf } from './perception';
import { addExperience, MemoryValidationError } from './memory';

export type PhoneRecord={id:string;version:number;text:string;createdAt:number;updatedAt:number;sharedWith:string[];readers:{actorId:string;at:number;version:number}[]};
export type PhoneData={objectId:string;memos:PhoneRecord[];screen:{collection:string;id:string;version:number}[];presentations?:{actorId:string;memoryId:string;collection:string;id:string;version:number}[]};
export type PhoneState={schemaVersion:1;activatedAt:number;devices:PhoneData[]};
export const phoneLimits={records:32,textCharacters:300,textBytes:1024,screen:4,sharedReaders:8};
// Only called on a mutable round candidate. Never normalize on GET.
export function activatePhones(w:World){
 if(w.phones)return;
 w.phones={schemaVersion:1,activatedAt:w.minute,devices:[]};w.objects??=[];
 for(const c of w.characters){
  let object=w.objects.find(o=>o.kind==='phone'&&o.owner===c.id);
  if(!object){
   const id=`phone:${c.id}:${crypto.randomUUID()}`;
   object={id,source:'phone-baseline-v1',label:`${c.name} 的手機`,kind:'phone',region:regionOf(c),holder:c.id,owner:c.id,revision:1,state:{condition:'sound'},lifecycle:'active',knownTo:[c.id],allowedTo:[c.id]};
   w.objects.push(object);
  }
  w.phones.devices.push({objectId:object.id,memos:[],screen:[]});
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
export function validatePhoneActionReferences(w:World,c:Character,a:Action){
 if(a.type!=='phone')return;
 let p:Record<string,unknown>;try{p=JSON.parse(a.content||'');}catch{throw new MemoryValidationError('手機操作JSON無效。');}
 if(p.operation==='list'||p.operation==='create')return;
 if(!phoneRecordReferences(w,c,a.target||'').some(r=>r.collection===p.collection&&r.id===p.id&&r.version===p.version))throw new MemoryValidationError('手機引用未出現在本次可知經歷。請先查看列表。');
}
function phoneExperience(w:World,c:Character,d:PhoneData,text:string,records:PhoneRecord[]){
 addExperience(c,w.minute,text);const memoryId=c.shortTerm!.at(-1)!.id;
 d.presentations??=[];
 for(const r of records){d.presentations=d.presentations.filter(p=>!(p.actorId===c.id&&p.collection==='memos'&&p.id===r.id));d.presentations.push({actorId:c.id,memoryId,collection:'memos',id:r.id,version:r.version});}
}
export function canReadPhoneRecord(c:Character,o:WorldObject,d:PhoneData,collection:string,r:PhoneRecord){
 return o.owner===c.id||r.sharedWith.includes(c.id)||d.screen.some(s=>s.collection===collection&&s.id===r.id&&s.version===r.version);
}
export function notePhoneReading(w:World,c:Character,r:PhoneRecord,label:string){
 r.readers=r.readers.filter(reader=>reader.actorId!==c.id);r.readers.push({actorId:c.id,at:w.minute,version:r.version});
 addExperience(c,w.minute,`我在手機上實際讀到${label} ${r.id} v${r.version}「${r.text}」。`);
}
export const phonePrompt=' 手機不是遠端知識：phones 只列現在可操作裝置。type=phone、target=objectId，content為JSON字串 {"collection":"memos","operation":"list|read|create|update|delete|share|display","id":"穩定id","version":0,"text":"原文","reader":"聯絡人id"}。list可填offset（預設0，每頁8筆），只取得有限身份和版本，不讀正文；read指定id/version才真正閱讀。create用新id和version=0與text，update/delete/share/display用本次實際看過的有效版本。share須由物主指定reader，只分享該項；display由物主展示該項於有限畫面，其他實際接觸者才能讀，不能假設解鎖或同意。備忘錄每機32筆、每筆300字/1024bytes，content JSON仍最多500字。一次只操作一項，固定15分鐘，不追加決策；外部原文不隨遺忘模糊，讀到不等於相信、回覆或完成安排。沒有實際閱讀不能宣稱知道內容。';
export function applyPhoneAction(w:World,c:Character,a:Action,dryRun=false){
 let request:Record<string,unknown>;try{request=JSON.parse(a.content||'');}catch{throw new MemoryValidationError('手機操作JSON無效。');}
 const o=reachablePhone(w,c,a.target||'',request.operation==='read'||request.operation==='list');if(!o)throw new MemoryValidationError('目前無法操作這部手機。');
 const d=phoneData(w,o.id);let p:Record<string,unknown>;
 try{p=JSON.parse(a.content||'');}catch{throw new MemoryValidationError('手機操作JSON無效。');}
 if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!['collection','operation','id','version','text','reader','offset'].includes(k))||p.collection!=='memos')throw new MemoryValidationError('手機操作欄位無效。');
 const operation=p.operation;if(!['list','read','create','update','delete','share','display'].includes(operation as string))throw new MemoryValidationError('手機操作無效。');
 const owner=o.owner===c.id;
 if(operation!=='read'&&operation!=='list'&&o.holder!==null&&o.holder!==c.id)throw new MemoryValidationError('目前只能閱讀展示的畫面，無法操作別人手中的手機。');
 validatePhoneActionReferences(w,c,a);
 if(operation==='list'){
  const visible=d.memos.filter(r=>canReadPhoneRecord(c,o,d,'memos',r));
  const offset=p.offset===undefined?0:p.offset;if(typeof offset!=='number'||!Number.isSafeInteger(offset)||offset<0)throw new MemoryValidationError('列表offset無效。');
  const page=visible.slice(offset,offset+8);
  if(!dryRun)phoneExperience(w,c,d,`我查看手機備忘錄列表（不含正文）：${page.map(r=>`${r.id} v${r.version}`).join('、')||'沒有可讀項目'}。${visible.length>offset+8?`另有${visible.length-offset-8}項未展示，可用offset=${offset+8}接續。`:''}`,page);
  return;
 }
 if(typeof p.id!=='string'||!/^[A-Za-z0-9_.:-]{1,64}$/.test(p.id)||!Number.isSafeInteger(p.version))throw new MemoryValidationError('手機資料引用無效。');
 const r=d.memos.find(r=>r.id===p.id);
 if(operation==='create'){
  if(!owner||r||p.version!==0||d.memos.length>=phoneLimits.records)throw new MemoryValidationError('無法新增備忘錄：權限、身份或容量不符。');
 }else if(!r||r.version!==p.version)throw new MemoryValidationError('手機資料不存在或版本已過期。');
 if(operation==='read'){
  if(!canReadPhoneRecord(c,o,d,'memos',r!))throw new MemoryValidationError('沒有此內容的可讀條件。');
  if(!dryRun){notePhoneReading(w,c,r!,'備忘錄');phoneExperience(w,c,d,`我取得備忘錄 ${r!.id} v${r!.version} 的閱讀經歷。`,[r!]);}return;
 }
 if(!owner)throw new MemoryValidationError('沒有修改私人資料的權限。');
 if(operation==='create'||operation==='update'){
  if(typeof p.text!=='string'||!p.text.trim()||p.text.length>phoneLimits.textCharacters||new TextEncoder().encode(p.text).length>phoneLimits.textBytes)throw new MemoryValidationError('備忘錄原文超過容量或為空。');
 }
 if(operation==='share'&&(typeof p.reader!=='string'||!w.characters.some(actor=>actor.id===p.reader)||!r!.sharedWith.includes(p.reader)&&r!.sharedWith.length>=phoneLimits.sharedReaders))throw new MemoryValidationError('分享讀者無效或超限。');
 if(operation==='display'&&d.screen.length>=phoneLimits.screen&&!d.screen.some(s=>s.collection==='memos'&&s.id===p.id))throw new MemoryValidationError('可讀畫面已滿，未覆蓋既有項目。');
 if(dryRun)return;
 if(operation==='create')d.memos.push({id:p.id,version:1,text:p.text as string,createdAt:w.minute,updatedAt:w.minute,sharedWith:[],readers:[]});
 else if(operation==='update'){r!.text=p.text as string;r!.version++;r!.updatedAt=w.minute;d.screen=d.screen.filter(s=>s.collection!=='memos'||s.id!==p.id);}
 else if(operation==='delete'){d.memos=d.memos.filter(item=>item.id!==p.id);d.presentations=d.presentations?.filter(item=>item.collection!=='memos'||item.id!==p.id);d.screen=d.screen.filter(s=>s.collection!=='memos'||s.id!==p.id);}
 else if(operation==='share'){if(!r!.sharedWith.includes(p.reader as string))r!.sharedWith.push(p.reader as string);r!.version++;d.screen=d.screen.filter(s=>s.collection!=='memos'||s.id!==p.id);}
 else if(operation==='display'){for(const actor of w.characters)if(regionOf(actor)===o.region&&canSee(w,actor,o.region)&&!o.knownTo.includes(actor.id))o.knownTo.push(actor.id);d.screen=d.screen.filter(s=>s.collection!=='memos'||s.id!==p.id);d.screen.push({collection:'memos',id:r!.id,version:r!.version});}
 phoneExperience(w,c,d,`我已在手機完成備忘錄 ${operation}：${p.id} v${operation==='create'?1:r!.version}${operation==='create'||operation==='update'?`，原文「${p.text}」`:''}。`,operation==='delete'?[]:[d.memos.find(item=>item.id===p.id)!]);
}
