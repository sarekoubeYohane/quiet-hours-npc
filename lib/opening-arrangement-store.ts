import {database} from './store';
import {SaveAccessError} from './world-saves';
import {prepareCity} from './city-creation';
import type {OpeningDraft} from './opening-drafts';
import type {CityDraft,CityPreview} from './city-draft';
import type {World} from './world';
export type ArrangementRequest={id:string;version:number;operationId:string;operationScope:string;worldContext?:string};
type Result={city:CityDraft;preview:CityPreview;world?:World};
export type ArrangementRow={owner:string;draft_id:string;operation_id:string;input_version:number;revision:number;request:string;snapshot:string;state:'pending'|'complete'|'failed'|'adopted';result:string|null;error:string|null;adoption_request:string|null};
export const arrangementForClient=(row:ArrangementRow)=>({operationId:row.operation_id,version:row.revision,inputVersion:row.input_version,state:row.state,...(row.state!=='pending'&&row.result?JSON.parse(row.result) as Result:{}),...(row.error?{error:row.error}:{})});
export type ArrangementView=ReturnType<typeof arrangementForClient>;
export async function readArrangement(owner:string,draftId:string,operationId:string){return database().prepare('SELECT * FROM opening_arrangements WHERE owner=? AND draft_id=? AND operation_id=?').bind(owner,draftId,operationId).first<ArrangementRow>();}
export async function latestArrangement(owner:string,draftId:string){const row=await database().prepare('SELECT * FROM opening_arrangements WHERE owner=? AND draft_id=? ORDER BY rowid DESC LIMIT 1').bind(owner,draftId).first<ArrangementRow>();return row?arrangementForClient(row):undefined;}
export async function reserveArrangement(owner:string,input:ArrangementRequest,draft:OpeningDraft){
 const request=JSON.stringify(input),existing=await readArrangement(owner,input.id,input.operationId);if(existing){if(existing.request!==request)throw new SaveAccessError('原整理操作內容不符，請恢復原操作。',409);return existing;}
 await database().prepare(`INSERT OR IGNORE INTO opening_arrangements(owner,draft_id,operation_id,input_version,request,snapshot,state) SELECT ?,?,?,?,?,?,'pending' FROM opening_drafts WHERE owner=? AND id=? AND version=? AND finalized_save_id IS NULL`).bind(owner,input.id,input.operationId,input.version,request,JSON.stringify(draft),owner,input.id,input.version).run();
 const row=await readArrangement(owner,input.id,input.operationId);if(!row)throw new SaveAccessError('草稿已變更或已有整理操作，請保留輸入並恢復原操作。',409);return row;
}
/** Called only after the trusted model transport, under the account operation lease. */
export async function storeArrangementResult(owner:string,draftId:string,operationId:string,city:CityDraft){
 const row=await readArrangement(owner,draftId,operationId);if(!row||row.state!=='pending')throw Error('原開局整理操作已變更。');
 const draft=JSON.parse(row.snapshot) as OpeningDraft;const candidate=await prepareCity(owner,city,{minute:1260,turn:0,characters:[],events:[],lastMode:'demo'},draft.sources);
 if(candidate.world)candidate.world.timeContract='five-minute-v1';
 await database().prepare('UPDATE opening_arrangements SET result=? WHERE owner=? AND draft_id=? AND operation_id=? AND state=\'pending\' AND result IS NULL').bind(JSON.stringify({city,...candidate}),owner,draftId,operationId).run();
}
export async function settleArrangement(owner:string,draftId:string,operationId:string,state:'complete'|'failed',error?:string){
 const row=await readArrangement(owner,draftId,operationId);if(!row)return;
 if(state==='complete'&&!row.result)throw Error('整理結果尚未保存，請恢復原操作。');
 await database().prepare('UPDATE opening_arrangements SET state=?,error=? WHERE owner=? AND draft_id=? AND operation_id=? AND state=\'pending\'').bind(state,error??null,owner,draftId,operationId).run();
}

export async function editArrangement(owner:string,row:ArrangementRow,revision:number,city:CityDraft){
 if(row.state!=='complete')throw new SaveAccessError('這份建議已採納或未完成，請恢復原操作。',409);
 if(row.revision===revision+1&&row.result&&JSON.stringify(JSON.parse(row.result).city)===JSON.stringify(city))return row;
 const draft=JSON.parse(row.snapshot) as OpeningDraft;
 const candidate=await prepareCity(owner,city,{minute:1260,turn:0,characters:[],events:[],lastMode:'demo'},draft.sources);if(candidate.world)candidate.world.timeContract='five-minute-v1';
 const changed=await database().prepare("UPDATE opening_arrangements SET result=?,revision=revision+1 WHERE owner=? AND draft_id=? AND operation_id=? AND revision=? AND state='complete' AND EXISTS (SELECT 1 FROM opening_drafts d WHERE d.owner=opening_arrangements.owner AND d.id=opening_arrangements.draft_id AND d.version=opening_arrangements.input_version AND d.finalized_save_id IS NULL) AND NOT EXISTS (SELECT 1 FROM opening_arrangements a WHERE a.owner=opening_arrangements.owner AND a.draft_id=opening_arrangements.draft_id AND a.state='pending') RETURNING operation_id").bind(JSON.stringify({city,...candidate}),owner,row.draft_id,row.operation_id,revision).first();
 if(!changed)throw new SaveAccessError('另一頁已修改建議或開局，原輸入已保留；請核對已存版本。',409);
 return (await readArrangement(owner,row.draft_id,row.operation_id))!;
}
