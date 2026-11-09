import { awaitSignal,deadlineSignal } from './round-time-policy';
import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { database } from './store';
import { bindWorldSave,SaveAccessError,type WorldSave } from './world-saves';
import { copyWorldWithoutAccounting } from './acceptance-scene';
import type { World,AIUsage } from './world';
import { costSummary } from './costs';

const base={operationId:z.string().uuid().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),saveId:z.string().regex(/^(legacy|[0-9a-f-]{36})$/),expectedVersion:z.number().int().nonnegative().safe()};
export const saveManagementInput=z.discriminatedUnion('operation',[
  z.object({...base,operation:z.literal('copy'),name:z.string().trim().min(1).max(80)}).strict(),
  z.object({...base,operation:z.literal('delete')}).strict(),
]);
export type SaveManagementInput=z.infer<typeof saveManagementInput>;
export type SaveOperationResult={operation:'copy';save:WorldSave}|{operation:'delete';deleted:{id:string;name:string;version:number;turn:number;minute:number};externalCleanup?:'pending'};
type Source={storage_owner:string;name:string;original_opening:string|null;state:string;version:number;operations:string;locked_until:number};

export async function readSaveOperation(owner:string,operationId:string,request?:string):Promise<SaveOperationResult|undefined> {
  const row=await database().prepare('SELECT request,result FROM save_operation_receipts WHERE owner = ? AND operation_id = ?').bind(owner,operationId).first<{request:string;result:string}>();
  if(!row)return;
  if(request!==undefined&&row.request!==request)throw new SaveAccessError('原操作內容不同，請保留輸入並重新核對。',409);
  return JSON.parse(row.result) as SaveOperationResult;
}
async function sourceFor(owner:string,input:SaveManagementInput):Promise<Source> {
  await bindWorldSave(owner,new Request('https://internal.invalid/?save='+encodeURIComponent(input.saveId)));
  const row=await database().prepare(`SELECT s.storage_owner,s.name,s.original_opening,w.state,w.version,w.operations,w.locked_until
    FROM world_saves s JOIN worlds w ON w.owner=s.storage_owner WHERE s.owner=? AND s.id=?`).bind(owner,input.saveId).first<Source>();
  if(!row)throw new SaveAccessError('找不到這份存檔。',404);
  if(row.version!==input.expectedVersion)throw new SaveAccessError('存檔進度已變更；輸入仍保留，請重新讀取並核對後再操作。',409);
  const journal=JSON.parse(row.operations) as {results:Record<string,{pending?:number}>;usage?:Record<string,{finalized:boolean}>};
  if(row.locked_until>Date.now()||Object.values(journal.results).some(result=>result.pending!==undefined))throw new SaveAccessError('這份存檔還有未完成操作；請先恢復原操作並確認已保存進度。',409);
  if(input.operation==='delete'&&Object.values(journal.usage??{}).some(receipt=>!receipt.finalized))throw new SaveAccessError('原操作的實際用量仍待核對，請先恢復該操作再刪除；已知費用不會被清除。',409);
  return row;
}
const noReceipt='NOT EXISTS (SELECT 1 FROM save_operation_receipts WHERE owner=? AND operation_id=?)';
const sourceCondition=`s.owner=? AND s.id=? AND w.owner=? AND w.version=? AND w.state=? AND w.operations=? AND w.locked_until<=?`;

export async function copyWorldSave(owner:string,input:Extract<SaveManagementInput,{operation:'copy'}>):Promise<{result:SaveOperationResult;created:boolean}> {
  const request=JSON.stringify(input),previous=await readSaveOperation(owner,input.operationId,request);
  if(previous)return {result:previous,created:false};
  const source=await sourceFor(owner,input),world=JSON.parse(source.state) as World;
  const copied=await copyWorldWithoutAccounting(world),createdAt=Date.now(),storageOwner='save:'+owner+':'+input.operationId;
  const savedFrom={id:input.saveId,name:source.name,version:source.version,turn:world.turn,minute:world.minute};
  const result:SaveOperationResult={operation:'copy',save:{id:input.operationId,name:input.name,createdAt,turn:world.turn,minute:world.minute,version:0,originalOpeningAvailable:source.original_opening!==null,savedFrom}};
  const db=database(),basis=[owner,input.saveId,source.storage_owner,source.version,source.state,source.operations,Date.now(),owner,input.operationId];
  const gate=`${sourceCondition} AND ${noReceipt} AND NOT EXISTS (SELECT 1 FROM save_tombstones WHERE owner=? AND id=?)`;
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO worlds (owner,state,version,locked_until,city_started)
      SELECT ?,?,0,0,1 FROM worlds w JOIN world_saves s ON s.storage_owner=w.owner WHERE ${gate}`)
      .bind(storageOwner,JSON.stringify(copied),...basis,owner,input.operationId),
    db.prepare(`INSERT OR IGNORE INTO world_saves (owner,id,storage_owner,name,created_at,creation_request,original_opening,saved_from)
      SELECT ?,?,?,?,?,?,?,? FROM worlds w JOIN world_saves s ON s.storage_owner=w.owner WHERE ${gate}
      AND EXISTS (SELECT 1 FROM worlds WHERE owner=?)`)
      .bind(owner,input.operationId,storageOwner,input.name,createdAt,request,source.original_opening,JSON.stringify(savedFrom),...basis,owner,input.operationId,storageOwner),
    db.prepare(`INSERT OR IGNORE INTO save_operation_receipts (owner,operation_id,request,result)
      SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM world_saves WHERE owner=? AND id=? AND creation_request=?) AND ${noReceipt}`)
      .bind(owner,input.operationId,request,JSON.stringify(result),owner,input.operationId,request,owner,input.operationId),
  ]);
  const saved=await readSaveOperation(owner,input.operationId,request);
  if(!saved)throw new SaveAccessError('存檔在保存前已變更，沒有另存；請重新讀取並核對。',409);
  return {result:saved,created:true};
}

export type AccountUsageSummary={totalCalls:number;totalInputTokens:number;totalOutputTokens:number;totalUnknownCalls:number;knownUsd:number;unknownCostCalls:number;archivedWorlds:number};
export async function accountSavedUsage(owner:string):Promise<AccountUsageSummary> {
  const db=database();
  // One SQLite snapshot avoids counting the same bill both before and after a
  // concurrent deletion moves it from the active row into the account archive.
  const {results}=await db.prepare(`SELECT json_extract(w.state,'$.aiUsage') AS usage,0 AS archived FROM worlds w JOIN world_saves s ON s.storage_owner=w.owner WHERE s.owner=?
    UNION ALL SELECT json_extract(state,'$.aiUsage') AS usage,0 AS archived FROM worlds WHERE owner=?
    UNION ALL SELECT usage,1 AS archived FROM deleted_world_usage WHERE owner=?`).bind(owner,'account-operations:'+owner,owner).all<{usage:string|null;archived:number}>();
  const summary:AccountUsageSummary={totalCalls:0,totalInputTokens:0,totalOutputTokens:0,totalUnknownCalls:0,knownUsd:0,unknownCostCalls:0,archivedWorlds:0};
  for(const row of results){summary.archivedWorlds+=row.archived;const usage=row.usage?JSON.parse(row.usage) as AIUsage|null:null;if(usage){for(const key of ['totalCalls','totalInputTokens','totalOutputTokens','totalUnknownCalls'] as const)summary[key]+=usage[key]??0;const cost=costSummary(usage).total;summary.knownUsd+=cost.knownUsd;summary.unknownCostCalls+=cost.unknownCalls;}}
  return summary;
}

/** External index IDs are cleanup receipts, never copied story or recall scope. */
async function finishIndexCleanup(owner:string,operationId:string):Promise<SaveOperationResult> {
  const db=database();
  const row=await db.prepare('SELECT result,cleanup FROM save_operation_receipts WHERE owner=? AND operation_id=?').bind(owner,operationId).first<{result:string;cleanup:string}>();
  if(!row)throw Error('刪除結果尚無法確認，請恢復原操作。');
  const result=JSON.parse(row.result) as SaveOperationResult,ids=JSON.parse(row.cleanup) as string[];
  if(result.operation!=='delete'||!ids.length)return result;
  try {
    if(!env.MEMORY_VECTOR_INDEX)throw Error('Index unavailable');
    const signal=deadlineSignal(Date.now()+10000,'save-index-cleanup');
    for(let start=0;start<ids.length;start+=8)await awaitSignal(Promise.resolve(env.MEMORY_VECTOR_INDEX.deleteByIds(ids.slice(start,start+8))),signal);
    delete result.externalCleanup;
    await db.prepare('UPDATE save_operation_receipts SET cleanup = ?,result = ? WHERE owner=? AND operation_id=? AND cleanup=?').bind('[]',JSON.stringify(result),owner,operationId,row.cleanup).run();
    return result;
  }catch{
    result.externalCleanup='pending';
    await db.prepare('UPDATE save_operation_receipts SET result = ? WHERE owner=? AND operation_id=? AND cleanup=?').bind(JSON.stringify(result),owner,operationId,row.cleanup).run();
    return result;
  }
}

export async function deleteWorldSave(owner:string,input:Extract<SaveManagementInput,{operation:'delete'}>):Promise<SaveOperationResult> {
  const request=JSON.stringify(input),previous=await readSaveOperation(owner,input.operationId,request);
  if(previous)return finishIndexCleanup(owner,input.operationId);
  const source=await sourceFor(owner,input),world=JSON.parse(source.state) as World,db=database();
  const vectors=await db.prepare('SELECT vector_id FROM recall_index_entries WHERE account_owner=?').bind(source.storage_owner).all<{vector_id:string}>();
  const result:SaveOperationResult={operation:'delete',deleted:{id:input.saveId,name:source.name,version:source.version,turn:world.turn,minute:world.minute}};
  const basis=[owner,input.saveId,source.storage_owner,source.version,source.state,source.operations,Date.now(),owner,input.operationId];
  const gate=`${sourceCondition} AND ${noReceipt}`,now=Date.now();
  const accepted=`EXISTS (SELECT 1 FROM save_operation_receipts WHERE owner=? AND operation_id=? AND request=?)`;
  const receipt=[owner,input.operationId,request];
  await db.batch([
    // The original bill remains an account record after the story is removed.
    db.prepare(`INSERT OR IGNORE INTO deleted_world_usage (owner,storage_owner,usage,deleted_at)
      SELECT ?,?,?,? FROM worlds w JOIN world_saves s ON s.storage_owner=w.owner WHERE ${gate}`)
      .bind(owner,source.storage_owner,JSON.stringify(world.aiUsage??null),now,...basis),
    db.prepare(`INSERT OR IGNORE INTO save_tombstones (owner,id,deleted_at)
      SELECT ?,?,? FROM worlds w JOIN world_saves s ON s.storage_owner=w.owner WHERE ${gate}`).bind(owner,input.saveId,now,...basis),
    db.prepare(`INSERT OR IGNORE INTO save_operation_receipts (owner,operation_id,request,result,cleanup)
      SELECT ?,?,?,?,? FROM worlds w JOIN world_saves s ON s.storage_owner=w.owner WHERE ${gate}`)
      .bind(owner,input.operationId,request,JSON.stringify(result),JSON.stringify(vectors.results.map(row=>row.vector_id)),...basis),
    db.prepare(`DELETE FROM decision_traces WHERE owner=? AND ${accepted}`).bind(source.storage_owner,...receipt),
    db.prepare(`DELETE FROM decision_trace_retention WHERE owner=? AND ${accepted}`).bind(source.storage_owner,...receipt),
    db.prepare(`DELETE FROM world_before_city WHERE owner=? AND ${accepted}`).bind(source.storage_owner,...receipt),
    db.prepare(`DELETE FROM recall_index_entries WHERE account_owner=? AND ${accepted}`).bind(source.storage_owner,...receipt),
    db.prepare(`DELETE FROM worlds WHERE owner=? AND version=? AND state=? AND operations=? AND locked_until<=? AND ${accepted}`)
      .bind(source.storage_owner,source.version,source.state,source.operations,Date.now(),...receipt),
    db.prepare(`DELETE FROM world_saves WHERE owner=? AND id=? AND storage_owner=? AND ${accepted}
      AND NOT EXISTS (SELECT 1 FROM worlds WHERE owner=?)`).bind(owner,input.saveId,source.storage_owner,...receipt,source.storage_owner),
  ]);
  const saved=await readSaveOperation(owner,input.operationId,request);
  if(!saved)throw new SaveAccessError('存檔在刪除前已變更，沒有刪除；請重新讀取並核對。',409);
  return finishIndexCleanup(owner,input.operationId);
}
