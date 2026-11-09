import { readDecisionTrace } from './decision-traces';
import { database } from './store';
import { accountUsage, budgetReached, BudgetExceeded, currentUsage, defaultLimits, validBudgetLimits, type BudgetLimits, type TokenUsage } from './activities';
import { beginCost, savePrice, type ModelPrice, type PriceInput } from './costs';
import { emptyUsageReceipt, mergePaid, paidDelta, type UsageReceipt } from './usage-recovery';
import type { AIUsage, World } from './world';
import { roundLeaseMs } from './round-time-policy';

export type PlayerAccountView = { accountOwner:string; version:number; accountingVersion:number; usage:AIUsage; limits:BudgetLimits; prices:ModelPrice[]; unknownAccountingRanges:number };
type Row={version:number;settings_version:number;last_request:string;token:string;usage:string;budget:string;prices:string;initialized:number};
type LegacyRecovery=Record<string,UsageReceipt|null>;
const empty=(at=0)=>emptyUsageReceipt(at).applied;
const worldFor=(usage:AIUsage)=>({aiUsage:usage} as World);
async function rowFor(owner:string){const row=await database().prepare('SELECT version,settings_version,last_request,token,usage,budget,prices,initialized FROM player_accounts WHERE owner=?').bind(owner).first<Row>();if(!row)throw Error('帳號玩家預算尚未保存。');return row;}
function addInitial(target:AIUsage,source:AIUsage) {
  for(const key of ['totalCalls','totalInputTokens','totalOutputTokens','totalUnknownCalls'] as const)target[key]+=source[key]??0;
  const active=Date.now()>=source.windowStartedAt&&Date.now()-source.windowStartedAt<3600000;
  if(active)for(const key of ['calls','inputTokens','outputTokens','unknownCalls'] as const)target[key]+=source[key]??0;
  for(const group of ['total','hour'] as const){if(group==='hour'&&!active)continue;for(const [key,value] of Object.entries(source.costs?.[group]??{})){
    const bucket=target.costs![group][key]??={...value,calls:0,input:0,output:0,cachedInput:0,knownUsd:0,unknownCalls:0};
    for(const field of ['calls','input','output','cachedInput','knownUsd','unknownCalls'] as const)bucket[field]+=value[field]??0;
    bucket.lastDispatchAt=Math.max(bucket.lastDispatchAt,value.lastDispatchAt);
  }}
}
async function initialize(owner:string) {
  const db=database();
  if((await db.prepare('SELECT initialized FROM player_accounts WHERE owner=?').bind(owner).first<{initialized:number}>())?.initialized)return;
  // A single snapshot includes a bill either in its source or in its deletion
  // archive. New worlds/copies are never adopted again after initialization.
  const {results}=await db.prepare(`SELECT w.owner AS storage_owner,json_extract(w.state,'$.aiUsage') AS usage,json_extract(w.state,'$.playerBudget') AS budget,json_extract(w.state,'$.modelPrices') AS prices,w.operations AS accounting
    FROM worlds w WHERE w.owner=? OR w.owner=? OR EXISTS(SELECT 1 FROM world_saves s WHERE s.owner=? AND s.storage_owner=w.owner)
    UNION ALL SELECT storage_owner,usage,NULL,NULL,accounting FROM deleted_world_usage WHERE owner=?`).bind(owner,'account-operations:'+owner,owner,owner).all<{storage_owner:string;usage:string|null;budget:string|null;prices:string|null;accounting:string}>();
  results.sort((a,b)=>Number(b.storage_owner===owner)-Number(a.storage_owner===owner));
  const usages=results.flatMap(value=>value.usage&&value.usage!=='null'?[JSON.parse(value.usage) as AIUsage]:[]);
  const active=usages.filter(value=>value.windowStartedAt<=Date.now()&&Date.now()-value.windowStartedAt<3600000&&value.calls>0);
  const usage=empty(active.length?Math.min(...active.map(value=>value.windowStartedAt)):0);
  for(const value of usages)addInitial(usage,value);
  const limits=results.map(value=>value.budget&&JSON.parse(value.budget)).find(validBudgetLimits)??defaultLimits;
  const prices=Object.values(Object.fromEntries(results.flatMap(value=>value.prices?JSON.parse(value.prices) as ModelPrice[]:[]).sort((a,b)=>a.savedAt-b.savedAt).map(value=>[value.provider+':'+value.model,value])));
  const token=crypto.randomUUID();
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO player_accounts(owner,version,token,usage,budget,prices,initialized) VALUES(?,0,?,?,?,?,0)').bind(owner,token,JSON.stringify(usage),JSON.stringify({calls:limits.calls,tokens:limits.tokens}),JSON.stringify(prices)),
    ...results.map(value=>{
      const journal=JSON.parse(value.accounting) as {usage?:Record<string,UsageReceipt>;results?:Record<string,{pending?:number;body?:{operationUncertain?:boolean}}>;operations?:{id:string;marker?:UsageReceipt}[];unknownRange?:boolean;unresolvedUsageEvicted?:number};
      const recovery:LegacyRecovery={};
      for(const [id,marker] of Object.entries(journal.usage??{}))if(!marker.finalized)recovery[id]=marker;
      for(const [id,result] of Object.entries(journal.results??{}))if(result.pending!==undefined||result.body?.operationUncertain)recovery[id]??=journal.usage?.[id]??null;
      for(const entry of journal.operations??[])if(!entry.marker?.finalized)recovery[entry.id]=entry.marker??null;
      return db.prepare('INSERT OR IGNORE INTO player_usage_origins(owner,storage_owner,recovery,unknown_range) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM player_accounts WHERE owner=? AND token=? AND initialized=0)').bind(owner,value.storage_owner,JSON.stringify(recovery),Number(!!journal.unknownRange||!!journal.unresolvedUsageEvicted),owner,token);
    }),
    db.prepare('UPDATE player_accounts SET initialized=1 WHERE owner=? AND token=?').bind(owner,token),
  ]);
}
async function reconcileLegacy(owner:string) {
  const db=database();
  const {results}=await db.prepare('SELECT storage_owner,recovery FROM player_usage_origins WHERE owner=?').bind(owner).all<{storage_owner:string;recovery:string}>();
  for(const source of results){
    const recovery=JSON.parse(source.recovery) as LegacyRecovery;if(!Object.keys(recovery).length)continue;
    const active=await db.prepare('SELECT operations FROM worlds WHERE owner=?').bind(source.storage_owner).first<{operations:string}>();
    const archived=!active&&await db.prepare('SELECT accounting FROM deleted_world_usage WHERE owner=? AND storage_owner=?').bind(owner,source.storage_owner).first<{accounting:string}>();
    const journal=JSON.parse(active?.operations||(archived&&archived.accounting)||'{}') as {usage?:Record<string,UsageReceipt>;operations?:{id:string;marker?:UsageReceipt}[];unknownRange?:boolean;unresolvedUsageEvicted?:number};
    const latest=journal.usage??Object.fromEntries((journal.operations??[]).map(value=>[value.id,value.marker]));
    if(!Object.keys(recovery).some(id=>latest[id]&&JSON.stringify(latest[id])!==JSON.stringify(recovery[id])))continue;
    for(let attempt=0;attempt<5;attempt++){
      const row=await rowFor(owner),target=worldFor(JSON.parse(row.usage));
      const next={...recovery};
      for(const id of Object.keys(recovery))if(latest[id]){mergePaid(target,latest[id]!.applied,recovery[id]?.applied);next[id]=latest[id]!;}
      const token=crypto.randomUUID();
      await db.batch([
        db.prepare('UPDATE player_accounts SET usage=?,version=version+1,token=? WHERE owner=? AND version=? AND EXISTS(SELECT 1 FROM player_usage_origins WHERE owner=? AND storage_owner=? AND recovery=?)').bind(JSON.stringify(target.aiUsage),token,owner,row.version,owner,source.storage_owner,source.recovery),
        db.prepare('UPDATE player_usage_origins SET recovery=? WHERE owner=? AND storage_owner=? AND recovery=? AND EXISTS(SELECT 1 FROM player_accounts WHERE owner=? AND token=?)').bind(JSON.stringify(next),owner,source.storage_owner,source.recovery,owner,token),
      ]);
      if((await rowFor(owner)).token===token)break;
    }
  }
}
export async function playerAccount(owner:string):Promise<PlayerAccountView> {
  await initialize(owner);await reconcileLegacy(owner);await recoverDispatches(owner);
  const row=await rowFor(owner);
  const pending=await database().prepare("SELECT COUNT(*) AS count FROM player_dispatches WHERE owner=? AND phase IN ('unknown','pending')").bind(owner).first<{count:number}>();
  const legacy=await database().prepare('SELECT recovery,unknown_range FROM player_usage_origins WHERE owner=?').bind(owner).all<{recovery:string;unknown_range:number}>();
  const legacyGaps=legacy.results.filter(value=>value.unknown_range||Object.values(JSON.parse(value.recovery) as LegacyRecovery).some(marker=>!marker?.finalized)).length;
  return {accountOwner:owner,version:row.settings_version,accountingVersion:row.version,usage:currentUsage(worldFor(JSON.parse(row.usage))),limits:JSON.parse(row.budget),prices:JSON.parse(row.prices),unknownAccountingRanges:(pending?.count??0)+legacyGaps};
}
export async function setPlayerAccount(owner:string,input:{limits?:BudgetLimits;price?:PriceInput},version?:number) {
  // Legacy callers may carry extra JSON keys. Only explicit billing fields
  // enter the account settings or lost-response fingerprint.
  input={...(input.limits?{limits:{calls:input.limits.calls,tokens:input.limits.tokens}}:{}),...(input.price?{price:{provider:input.price.provider,model:input.price.model,input:input.price.input,output:input.price.output,...(input.price.cachedInput===undefined?{}:{cachedInput:input.price.cachedInput}),source:input.price.source,date:input.price.date}}:{})};
  await initialize(owner);
  for(let attempt=0;attempt<5;attempt++){
    const row=await rowFor(owner);
    const request=JSON.stringify({version,input});
    if(version!==undefined&&version!==row.settings_version){if(row.last_request===request)return playerAccount(owner);throw Object.assign(Error('帳號預算或價格已變更；輸入仍保留，請重新核對。'),{status:409});}
    const target={modelPrices:JSON.parse(row.prices)} as World;if(input.price)savePrice(target,input.price);
    const result=await database().prepare('UPDATE player_accounts SET budget=?,prices=?,last_request=?,settings_version=settings_version+1,version=version+1 WHERE owner=? AND version=?').bind(JSON.stringify(input.limits??JSON.parse(row.budget)),JSON.stringify(target.modelPrices),request,owner,row.version).run();
    if(result.meta.changes)return playerAccount(owner);
  }
  throw Error('帳號預算保存遇到競爭，請重新核對。');
}

function knownDispatchUsage(previous:AIUsage,tokens:TokenUsage){
  const desired=empty(previous.windowStartedAt);desired.calls=desired.totalCalls=desired.unknownCalls=desired.totalUnknownCalls=1;
  const cohort=Object.values(previous.costs!.total)[0];
  const cost=beginCost(desired,cohort.provider,cohort.model,cohort.price??undefined,cohort.task,cohort.lastDispatchAt);
  accountUsage(desired,tokens);cost(tokens);return desired;
}
async function recoverDispatches(owner:string){
  const {results}=await database().prepare("SELECT storage_owner,request_id,operation_id FROM player_dispatches WHERE owner=? AND (phase='unknown' OR phase='pending' AND pending_until<=?)").bind(owner,Date.now()).all<{storage_owner:string;request_id:string;operation_id:string}>();
  for(const entry of results){
    let trace;try{trace=await readDecisionTrace(database(),entry.storage_owner,entry.operation_id);}catch{continue;}
    const dispatch=trace?.dispatches.find(value=>value&&typeof value==='object'&&(value as {requestId?:string}).requestId===entry.request_id) as {usage?:TokenUsage}|undefined;
    const tokens=dispatch?.usage;
    if(tokens&&[tokens.inputTokens,tokens.outputTokens].every(value=>typeof value==='number'&&Number.isFinite(value)&&value>=0))await settleAccountDispatch(owner,entry.storage_owner,entry.request_id,previous=>knownDispatchUsage(previous,tokens),'known');
  }
}
async function settleAccountDispatch(owner:string,storageOwner:string,requestId:string,desiredFor:(previous:AIUsage)=>AIUsage,phase:'known'|'cancelled') {
    const db=database();
    for(let attempt=0;attempt<5;attempt++){
      const dispatch=await db.prepare('SELECT usage,phase FROM player_dispatches WHERE owner=? AND storage_owner=? AND request_id=?').bind(owner,storageOwner,requestId).first<{usage:string;phase:string}>();
      if(!dispatch||['known','cancelled'].includes(dispatch.phase)){return;}
      const previous=JSON.parse(dispatch.usage) as AIUsage,desired=desiredFor(previous);
      const row=await rowFor(owner),target=worldFor(JSON.parse(row.usage));mergePaid(target,desired,previous);
      const token=crypto.randomUUID();
      await db.batch([
        db.prepare('UPDATE player_accounts SET usage=?,version=version+1,token=? WHERE owner=? AND version=? AND EXISTS(SELECT 1 FROM player_dispatches WHERE owner=? AND storage_owner=? AND request_id=? AND usage=?)').bind(JSON.stringify(target.aiUsage),token,owner,row.version,owner,storageOwner,requestId,dispatch.usage),
        db.prepare("UPDATE player_dispatches SET usage=?,phase=?,pending_until=0 WHERE owner=? AND storage_owner=? AND request_id=? AND usage=? AND EXISTS(SELECT 1 FROM player_accounts WHERE owner=? AND token=?)").bind(JSON.stringify(desired),phase,owner,storageOwner,requestId,dispatch.usage,owner,token),
      ]);
      if((await rowFor(owner)).token===token){return;}
    }
    throw Error('已知帳號用量尚未同步；請沿原操作核對。');
  }

export function playerBilling(owner:string,storageOwner:string,operationId:string,prices:ModelPrice[]) {
  let pending:string|undefined,sent=false;
  async function finish(){if(pending&&!sent){await settle(previous=>empty(previous.windowStartedAt),'cancelled');return;}if(pending){await database().prepare("UPDATE player_dispatches SET phase='unknown',pending_until=0 WHERE owner=? AND storage_owner=? AND request_id=? AND phase='pending'").bind(owner,storageOwner,pending).run();pending=undefined;}}
  const beforeDispatch=(provider:'openai'|'openrouter',model:string,task:'npc'|'adjudication'|'feelings')=>async(requestId:string|undefined,signal:AbortSignal)=>{
    if(!requestId)throw Error('帳號模型派送缺少原請求身分。');
    signal.throwIfAborted();
    sent=false;
    for(let attempt=0;attempt<5;attempt++){
      const account=await playerAccount(owner),row=await rowFor(owner);
      if(row.version!==account.accountingVersion)continue;
      if(budgetReached(account.usage,account.limits))throw Object.assign(new BudgetExceeded(),{code:'player_budget'});
      const exists=await database().prepare('SELECT phase FROM player_dispatches WHERE owner=? AND storage_owner=? AND request_id=?').bind(owner,storageOwner,requestId).first();
      if(exists)throw Error('此模型派送已受理；請恢復原操作，不得重新派送。');
      const delta=empty(account.usage.windowStartedAt);delta.calls=delta.totalCalls=delta.unknownCalls=delta.totalUnknownCalls=1;
      beginCost(delta,provider,model,prices.find(value=>value.provider===provider&&value.model===model),task);
      const target=worldFor(structuredClone(account.usage));mergePaid(target,delta,undefined);
      const token=crypto.randomUUID(),db=database();
      signal.throwIfAborted();
      pending=requestId;
      await db.batch([
        db.prepare("UPDATE player_accounts SET usage=?,version=version+1,token=? WHERE owner=? AND version=? AND NOT EXISTS(SELECT 1 FROM player_dispatches WHERE owner=? AND phase='pending' AND pending_until>?) AND NOT EXISTS(SELECT 1 FROM player_dispatches WHERE owner=? AND storage_owner=? AND request_id=?)").bind(JSON.stringify(target.aiUsage),token,owner,row.version,owner,Date.now(),owner,storageOwner,requestId),
        db.prepare("INSERT OR IGNORE INTO player_dispatches(owner,storage_owner,request_id,operation_id,token,usage,phase,pending_until) SELECT ?,?,?,?,?,?,'pending',? WHERE EXISTS(SELECT 1 FROM player_accounts WHERE owner=? AND token=?)").bind(owner,storageOwner,requestId,operationId,token,JSON.stringify(delta),Date.now()+roundLeaseMs,owner,token),
      ]);
      const accepted=await db.prepare('SELECT token FROM player_dispatches WHERE owner=? AND storage_owner=? AND request_id=?').bind(owner,storageOwner,requestId).first<{token:string}>();
      if(accepted?.token!==token)continue;
      if(signal.aborted){await settleAccountDispatch(owner,storageOwner,requestId,previous=>empty(previous.windowStartedAt),'cancelled');pending=undefined;signal.throwIfAborted();}
      return;
    }
    throw Object.assign(Error('帳號正在處理另一個模型請求；本次未派送，請等待原操作完成後核對。'),{code:'account_budget_busy'});
  };
  const fetcher=(forward:typeof fetch=fetch):typeof fetch=>(url,init)=>{init?.signal?.throwIfAborted();sent=true;return forward(url,init);};
  async function settle(desiredFor:(previous:AIUsage)=>AIUsage,phase:'known'|'cancelled'){if(!pending)throw Error('找不到原帳號模型派送。');await settleAccountDispatch(owner,storageOwner,pending,desiredFor,phase);pending=undefined;}
  const report=(tokens:TokenUsage)=>settle(previous=>knownDispatchUsage(previous,tokens),'known');
  return {beforeDispatch,fetcher,report,finish};
}

/** Keep world-local diagnostics faithful without making them the account authority. */
export async function reconcileOperationUsage(owner:string,storageOwner:string,operationId:string,before:AIUsage|undefined,world:World){
  const {results}=await database().prepare('SELECT usage FROM player_dispatches WHERE owner=? AND storage_owner=? AND operation_id=?').bind(owner,storageOwner,operationId).all<{usage:string}>();
  const desired=empty(world.aiUsage?.windowStartedAt??Date.now());
  for(const row of results)addInitial(desired,JSON.parse(row.usage));
  mergePaid(world,desired,paidDelta(before,world.aiUsage??empty(desired.windowStartedAt)));
}
