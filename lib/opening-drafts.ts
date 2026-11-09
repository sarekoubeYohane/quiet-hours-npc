import { z } from 'zod';
import { database } from './store';
import { cityDraftSchema,prepareCity } from './city-creation';
import { listCharacterCards } from './character-card-store';
import { listSceneTemplates } from './scene-template-store';
import type { CharacterCard } from './character-cards';
import type { SceneTemplate } from './scene-templates';
import type { World } from './world';
import type { CityPreview } from './city-draft';
import { readSaveCreation,SaveAccessError } from './world-saves';
export const openingBodySchema=z.object({name:z.string().trim().max(80),description:z.string().max(1600),step:z.number().int().min(1).max(5),city:cityDraftSchema}).strict();
const identity=z.string().uuid();
export const openingInputSchema=z.union([
 z.object({id:identity,version:z.number().int().nonnegative(),body:openingBodySchema}).strict(),
 z.object({id:identity,version:z.literal(0),restartSaveId:z.string().min(1).max(64)}).strict(),
]);
type Body=z.infer<typeof openingBodySchema>;
type Sources={cards:CharacterCard[];scenes:SceneTemplate[]};
type Candidate={preview:CityPreview;world?:World};
type Row={id:string;version:number;body:string;sources:string;candidate:string;last_request:string;finalized_save_id:string|null};
export type OpeningDraft={id:string;version:number;body:Body;sources:Sources;finalizedSaveId?:string};
const client=(row:Row):OpeningDraft=>({id:row.id,version:row.version,body:JSON.parse(row.body),sources:JSON.parse(row.sources),...(row.finalized_save_id?{finalizedSaveId:row.finalized_save_id}:{})});
async function rowFor(owner:string,id:string){return database().prepare('SELECT * FROM opening_drafts WHERE owner=? AND id=?').bind(owner,id).first<Row>();}
export async function listOpeningDrafts(owner:string){const {results}=await database().prepare('SELECT * FROM opening_drafts WHERE owner=? AND finalized_save_id IS NULL ORDER BY rowid DESC').bind(owner).all<Row>();return results.map(row=>{const draft=client(row);return {id:draft.id,version:draft.version,name:draft.body.name,step:draft.body.step};});}
export async function readOpeningDraft(owner:string,id:string){const row=await rowFor(owner,id);if(!row)throw new SaveAccessError('找不到這份開局草稿。',404);return {draft:client(row),...JSON.parse(row.candidate) as Candidate};}
async function selectedSources(owner:string,body:Body,old?:Sources):Promise<Sources>{
 const [cards,scenes]=await Promise.all([listCharacterCards(owner),listSceneTemplates(owner)]);
 const pick=<T extends {id:string;version:number}>(refs:{templateId:string;version:number}[],saved:T[],live:T[])=>refs.map(ref=>saved.find(item=>item.id===ref.templateId&&item.version===ref.version)??live.find(item=>item.id===ref.templateId&&item.version===ref.version)).filter((item):item is T=>!!item);
 return {cards:pick(body.city.characters,old?.cards??[],cards),scenes:pick(body.city.places,old?.scenes??[],scenes)};
}
export async function saveOpeningDraft(owner:string,input:z.infer<typeof openingInputSchema>){
 const previous=await rowFor(owner,input.id),request=JSON.stringify(input);
 if(previous?.last_request===request)return readOpeningDraft(owner,input.id);
 if(previous?.finalized_save_id||previous&&previous.version!==input.version||!previous&&input.version!==0)throw new SaveAccessError('未同步：開局草稿已變更，原輸入已保留，請重新核對。',409);
 let body:Body,sources:Sources;
 if('restartSaveId' in input){
  const original=await database().prepare('SELECT original_opening FROM world_saves WHERE owner=? AND id=?').bind(owner,input.restartSaveId).first<{original_opening:string|null}>();
  if(!original)throw new SaveAccessError('找不到原存檔。',404);
  if(!original.original_opening)throw new SaveAccessError('這份舊存檔沒有原始開局，無法重新開始。',409);
  const snapshot=JSON.parse(original.original_opening) as {version:string;body:Body;sources:Sources};
  if(snapshot.version!=='opening-v1')throw new SaveAccessError('原始開局版本不可用。',409);
  body={...snapshot.body,step:1};sources=snapshot.sources;
 }else{body=input.body;sources=await selectedSources(owner,body,previous?JSON.parse(previous.sources):undefined);}
 const candidate=await prepareCity(owner,body.city,{minute:1260,turn:0,characters:[],events:[],lastMode:'demo'},sources);
 if(body.city.characters.some(ref=>!sources.cards.some(card=>card.id===ref.templateId&&card.version===ref.version))){candidate.preview.issues.push('請選用已完成人物卡；文字範本及未形成草稿不能進入世界。');delete candidate.world;}
 if(candidate.world)candidate.world.timeContract='five-minute-v1';
 await database().prepare(`INSERT INTO opening_drafts (owner,id,version,body,sources,candidate,last_request) VALUES (?,?,1,?,?,?,?)
  ON CONFLICT(owner,id) DO UPDATE SET version=opening_drafts.version+1,body=excluded.body,sources=excluded.sources,candidate=excluded.candidate,last_request=excluded.last_request
  WHERE opening_drafts.version=? AND opening_drafts.finalized_save_id IS NULL`).bind(owner,input.id,JSON.stringify(body),JSON.stringify(sources),JSON.stringify(candidate),request,input.version).run();
 const stored=await rowFor(owner,input.id);
 if(stored?.last_request!==request)throw new SaveAccessError('未同步：另一頁已修改開局草稿，請保留輸入重新核對。',409);
 return readOpeningDraft(owner,input.id);
}
export const confirmOpeningSchema=z.object({id:identity,draftId:identity,draftVersion:z.number().int().positive()}).strict();
/** The candidate shown at confirmation is the exact immutable world installed in one transaction. */
export async function confirmOpening(owner:string,input:z.infer<typeof confirmOpeningSchema>){
 const request=JSON.stringify(input),previous=await readSaveCreation(owner,input.id,request);
 if(previous)return {saved:previous,created:false};
 const row=await rowFor(owner,input.draftId);
 if(!row)throw new SaveAccessError('找不到開局草稿。',404);
 if(row.version!==input.draftVersion||row.finalized_save_id)throw new SaveAccessError('開局草稿已變更或已建立，請恢復原建立操作。',409);
 const draft=client(row),candidate=JSON.parse(row.candidate) as Candidate;
 if(!draft.body.name||!candidate.world||candidate.preview.issues.length)throw new SaveAccessError(candidate.preview.issues.join(' ')||'請確認存檔名稱與完整開局。',400);
 const db=database(),storage='save:'+owner+':'+input.id;
 const guard='EXISTS (SELECT 1 FROM opening_drafts WHERE owner=? AND id=? AND version=? AND finalized_save_id IS NULL) AND NOT EXISTS (SELECT 1 FROM save_tombstones WHERE owner=? AND id=?)';
 const bindings=[owner,input.draftId,input.draftVersion,owner,input.id];
 const original=JSON.stringify({version:'opening-v1',body:draft.body,sources:draft.sources});
 await db.batch([
  db.prepare(`INSERT OR IGNORE INTO worlds(owner,state,version,locked_until,city_started) SELECT ?,?,0,0,1 WHERE ${guard}`).bind(storage,JSON.stringify(candidate.world),...bindings),
  db.prepare(`INSERT OR IGNORE INTO world_saves(owner,id,storage_owner,name,created_at,creation_request,original_opening) SELECT ?,?,?,?,?,?,? WHERE ${guard}`).bind(owner,input.id,storage,draft.body.name,Date.now(),request,original,...bindings),
  db.prepare('UPDATE opening_drafts SET finalized_save_id=? WHERE owner=? AND id=? AND version=? AND finalized_save_id IS NULL AND EXISTS (SELECT 1 FROM world_saves WHERE owner=? AND id=? AND creation_request=?)').bind(input.id,owner,input.draftId,input.draftVersion,owner,input.id,request),
 ]);
 const saved=await readSaveCreation(owner,input.id,request);
 if(!saved)throw new SaveAccessError('開局草稿已變更，未建立世界；請保留輸入重新核對。',409);
 return {saved,created:true};
}
