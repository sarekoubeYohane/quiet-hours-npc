import { database } from './store';
import type { World } from './world';

export type WorldSave = { id:string; name:string; createdAt:number; turn:number; minute:number; version:number; originalOpeningAvailable:boolean };
export type SaveBinding = { accountOwner:string; storageOwner:string; saveId:string|null; accountWorkspace:boolean };
export class SaveAccessError extends Error {
  constructor(message:string,readonly status:number){super(message);}
}
const validId = /^(legacy|[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/;

/** Reconcile only an existing legacy row. Reading never installs a seed world. */
async function retainLegacySave(owner:string) {
  await database().prepare(`INSERT OR IGNORE INTO world_saves (owner,id,storage_owner,name,created_at)
    SELECT ?, 'legacy', owner, '原有存檔', 0 FROM worlds WHERE owner = ?`).bind(owner,owner).run();
}
export async function listWorldSaves(owner:string):Promise<WorldSave[]> {
  await retainLegacySave(owner);
  const {results}=await database().prepare(`SELECT s.id,s.name,s.created_at,s.original_opening,w.state,w.version
    FROM world_saves s JOIN worlds w ON w.owner = s.storage_owner WHERE s.owner = ? ORDER BY s.created_at,s.id`).bind(owner)
    .all<{id:string;name:string;created_at:number;original_opening:string|null;state:string;version:number}>();
  return results.map(row=>{const world=JSON.parse(row.state) as World;return {id:row.id,name:row.name,createdAt:row.created_at,
    turn:world.turn,minute:world.minute,version:row.version,originalOpeningAvailable:row.original_opening!==null};});
}

/** Resolve once per HTTP request, before any lease, async work or recovery. */
export async function bindWorldSave(accountOwner:string,request?:Request):Promise<SaveBinding> {
  const url=request&&new URL(request.url);
  if(url?.searchParams.get('workspace')==='account') {
    if(url.searchParams.has('save'))throw new SaveAccessError('請只指定一份操作來源。',400);
    const storageOwner='account-operations:'+accountOwner;
    return {accountOwner,storageOwner,saveId:null,accountWorkspace:true};
  }
  if(url&&(url.searchParams.getAll('save').length>1||url.searchParams.getAll('workspace').length>1))throw new SaveAccessError('請只指定一份存檔。',400);
  const supplied=url?.searchParams.get('save');
  if(supplied!==null&&supplied!==undefined&&!validId.test(supplied))throw new SaveAccessError('存檔識別碼無效。',400);
  if(supplied) {
    await retainLegacySave(accountOwner);
    const save=await database().prepare('SELECT storage_owner FROM world_saves WHERE owner = ? AND id = ?').bind(accountOwner,supplied).first<{storage_owner:string}>();
    if(!save)throw new SaveAccessError('找不到這份存檔，請回存檔頁選擇。',404);
    return {accountOwner,storageOwner:save.storage_owner,saveId:supplied,accountWorkspace:false};
  }
  // Old clients may still address their original world. This never chooses a
  // newly selected save and never creates one for an empty account.
  const original=await database().prepare('SELECT owner FROM worlds WHERE owner = ?').bind(accountOwner).first<{owner:string}>();
  if(!original)throw new SaveAccessError('請先從存檔頁選擇世界。',409);
  return {accountOwner,storageOwner:accountOwner,saveId:'legacy',accountWorkspace:false};
}

export type SavedWorld = { save:WorldSave; world:World; version:number };
export async function readSaveCreation(owner:string,id:string,creationRequest:string):Promise<SavedWorld|undefined> {
  const row=await database().prepare(`SELECT s.name,s.created_at,s.creation_request,s.original_opening,w.state,w.version
    FROM world_saves s JOIN worlds w ON w.owner=s.storage_owner WHERE s.owner=? AND s.id=?`).bind(owner,id)
    .first<{name:string;created_at:number;creation_request:string|null;original_opening:string|null;state:string;version:number}>();
  if(!row)return;
  if(row.creation_request!==creationRequest)throw new SaveAccessError('這個建立操作已使用不同內容保存，請保留輸入並重新核對。',409);
  const world=JSON.parse(row.state) as World;
  return {save:{id,name:row.name,createdAt:row.created_at,turn:world.turn,minute:world.minute,version:row.version,
    originalOpeningAvailable:row.original_opening!==null},world,version:row.version};
}

/** A single database transaction installs both story and owner-scoped identity. */
export async function createWorldSave(owner:string,input:{id:string;name:string;creationRequest:string;world:World;originalOpening?:unknown}):Promise<SavedWorld> {
  if(!validId.test(input.id)||input.id==='legacy')throw new SaveAccessError('建立操作識別碼無效。',400);
  const db=database(),storageOwner='save:'+owner+':'+input.id;
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO worlds (owner,state,version,locked_until,city_started) VALUES (?,?,0,0,1)').bind(storageOwner,JSON.stringify(input.world)),
    db.prepare(`INSERT OR IGNORE INTO world_saves (owner,id,storage_owner,name,created_at,creation_request,original_opening)
      VALUES (?,?,?,?,?,?,?)`).bind(owner,input.id,storageOwner,input.name,Date.now(),input.creationRequest,input.originalOpening===undefined?null:JSON.stringify(input.originalOpening)),
  ]);
  const saved=await readSaveCreation(owner,input.id,input.creationRequest);
  if(!saved)throw Error('無法確認存檔保存結果；請以原建立操作重新讀取。');
  return saved;
}

/** Compatibility ledger for standalone authoring consumers, never a playable world. */
export async function ensureAccountOperationLedger(binding:SaveBinding) {
  if(!binding.accountWorkspace)return;
  const empty:World={contextId:'account-authoring',minute:0,turn:0,lastMode:'demo',characters:[],events:[],
    configuration:{locations:[],regions:[],doors:[]}};
  await database().prepare('INSERT OR IGNORE INTO worlds (owner,state,version,locked_until) VALUES (?,?,0,0)').bind(binding.storageOwner,JSON.stringify(empty)).run();
}
