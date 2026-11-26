import { isModelProvider, modelMode, modelProviders, providerForMode, type ModelProvider } from './model-providers';
import { playerAccount, playerBilling, reconcileOperationUsage, type PlayerAccountView } from './player-account-budget';
import { readEffectiveModels } from './model-settings-store';
import { ensureAccountOperationLedger } from './world-saves';
import { type ModelObserver, ModelResponseTimeout } from './model-adapter';
import { recoverPaidUsage, paidDelta, emptyUsageReceipt, boundUsageReceipts, type UsageReceipt } from './usage-recovery';
import { roundTimePolicy, roundLeaseMs, roundClientMs, deadlineSignal, awaitSignal, checkSignal } from './round-time-policy';
import { createDecisionTrace } from './decision-trace-capture';
import { readDecisionTrace, saveDecisionTrace, type DecisionTrace } from './decision-traces';
import { createOperationEvidence, type OperationEvidence } from './operation-evidence';
import { currentEnvironment } from './environment';
import { worldForClient } from './acceptance-scene';
import { EffectValidationError } from './world-effects';
import { type AdjudicationFailure, type WorldTaskServices } from './adjudication';
import { type PriceInput } from './costs';
import { env } from 'cloudflare:workers';
import { boundRecallStorage } from './recall';
import { RecallServiceError } from './recall-services';
import { loadWorld, database } from './store';
import { normalizeWorld, type Action, type AIUsage, type World, type Character } from './world';
import { BudgetExceeded, currentUsage, validBudgetLimits, budgetReached, type BudgetLimits, type TokenUsage } from './activities';
import { readModelKey, modelKeyStatus, ModelKeyError } from './model-keys';
import type { SaveBinding } from './world-saves';

/**
 * 主持執行層（#338）：世界主持中由程式負責的底層。受理使用者的每一次操作，
 * 不決定世界裡發生什麼，也不決定要問模型什麼。
 *
 * 目前只有操作 journal：每列 `worlds.operations` 保存的收據、處理中標記與
 * 已付用量。journal 的格式只在這個檔案內解讀；受理、租約、提交與派送仍在
 * `app/api/world/route.ts`，後續會搬進來。
 */

/** 收據：一次已結算操作的原 HTTP 結果，同一操作身分重送時原樣回放。 */
export type OperationResult = { status: number; body: Record<string, unknown> };

export type Journal = {
  floor: number;
  results: Record<string, OperationResult | { pending: number }>;
  usage?: Record<string, UsageReceipt>;
  unresolvedUsageEvicted?: number;
};

/** 操作身分：13 位毫秒時間加 UUID。 */
export const operationIdPattern = /^\d{13}:[0-9a-f-]{36}$/;

export const isOperationExpired = (issuedAt: number, floor: number) => issuedAt <= floor || issuedAt < Date.now() - 86400000;

export const uncertainResult: OperationResult = { status: 502, body: { error: '上次操作的結果無法確認，請重新讀取世界；此操作不會再次呼叫模型。', operationUncertain: true } };

export function trimJournal(journal: Journal, maxResults: number, protectedId?: string) {
  const oldest = Object.keys(journal.results).filter(id => id !== protectedId).sort((a, b) => Number(a.split(':')[0]) - Number(b.split(':')[0]));
  while (oldest.length && (Object.keys(journal.results).length > maxResults || new TextEncoder().encode(JSON.stringify(journal)).byteLength > 500000)) {
    const id = oldest.shift()!;
    journal.floor = Math.max(journal.floor, Number(id.split(':')[0]));
    const removed = journal.results[id];
    if (journal.usage?.[id] && !journal.usage[id].finalized || 'status' in removed && removed.body.operationUncertain && !journal.usage?.[id]?.finalized) journal.unresolvedUsageEvicted = Math.min(Number.MAX_SAFE_INTEGER, (journal.unresolvedUsageEvicted || 0) + 1);
    delete journal.results[id];
    if (journal.usage) delete journal.usage[id];
  }
  // A confirmed conflict can retain paid usage after its HTTP journal was
  // lost. Keep those finalized orphan markers within the same existing cap;
  // absent-journal requests use the archive guard, never recovery or dispatch.
  boundUsageReceipts(journal, maxResults);
}

/**
 * 觀察者重讀世界時從 journal 看得到的內容。只讀：重新載入絕不派送一個可能
 * 沒有送達的請求。`contextId` 用來排除屬於前一個故事的收據。
 */
export function journalView(journal: Journal, contextId: string | undefined, operationId?: string) {
  const last = Object.values(journal.results).at(-1);
  const lastFailure = last && 'status' in last ? last.body.adjudicationFailure as AdjudicationFailure | undefined : undefined;
  const adjudicationFailure = lastFailure?.contextId === contextId ? lastFailure : undefined;
  const retained = Object.entries(journal.results).filter(([, result]) => 'status' in result) as [string, OperationResult][];
  const recentOperations = retained.map(([id, result]) => {
    const receipt = result.body.operationEvidence as OperationEvidence | undefined;
    return { operationId: id, operation: receipt?.operation, status: result.status, requestId: receipt?.requestId, version: receipt?.resultVersion, evidenceAvailable: !!receipt };
  }).reverse();
  const lastTraceStatus = last && 'status' in last ? last.body.decisionTraceStatus as { status?: string; gap?: string } | undefined : undefined;
  const operationEvidence = retained.map(([, result]) => result.body.operationEvidence as OperationEvidence | undefined).filter(receipt => receipt && receipt.contextId === contextId).at(-1);
  const result = operationId ? journal.results[operationId] : undefined;
  const operation = !operationId ? undefined
    : result && 'status' in result
      ? { state: result.body.operationUncertain ? 'uncertain' : 'settled', status: result.status, error: result.body.error, stopReason: result.body.stopReason, adjudicationFailure: result.body.adjudicationFailure, decisionTraceStatus: result.body.decisionTraceStatus, evidence: result.body.operationEvidence ?? null }
      : result && 'pending' in result
        ? { state: result.pending > Date.now() ? 'pending' : 'uncertain' }
        : { state: isOperationExpired(Number(operationId.split(':')[0]), journal.floor) ? 'expired' : 'unknown' };
  return { adjudicationFailure, recentOperations, operationEvidence, operation, lastTraceWriteFailed: lastTraceStatus?.status === 'write-failed' };
}

export type OperationReply = { status: number; body: Record<string, unknown> };
export type OperationBody = { resourceRequest?:unknown; mentalOpenings?:unknown; bodyNeeds?:unknown; characterSetup?:unknown; city?:unknown; expectedVersion?:number; worldContext?:string; adjudication?:{provider:ModelProvider;model:string}; operationScope?: string; operationId?: string; operation?: string; minutes?: number; timeContract?:'five-minute-v1'; mode?: string; key?: string; model?: string; text?: string; target?: string; limits?: BudgetLimits; price?: PriceInput; action?: Action; characterGeneration?:unknown; openingDescription?:unknown };
export type OperationInput = {
  accountId: string; binding: SaveBinding; body: OperationBody; bodyLength: number;
  /** 用戶端帶來的回合等待政策版本。 */
  timePolicy: string | null;
  signal: AbortSignal; responseSignal?: AbortSignal; receivedAt: number;
  trace: WorldTrace; services?: WorldTaskServices;
};
export const respond = (body: Record<string, unknown>, status = 200): OperationReply => ({ status, body });
export type OperationChecks = { b: OperationBody; accountId: string; binding: SaveBinding; id: string };
export type WorldChecks = OperationChecks & { world: World; version: number };
type Checked = OperationReply | void | undefined;
type Billing = ReturnType<typeof playerBilling>;
export type ModelDispatch = {
  observer: ModelObserver | undefined; fetcher: ReturnType<Billing['fetcher']>; beforeDispatch: ReturnType<Billing['beforeDispatch']>; onSettled: Billing['finish'];
  reportUsage: (...after: ((tokens: TokenUsage) => void)[]) => (tokens: TokenUsage) => Promise<void>;
};
/** 取得租約後交給 handler 的能力。派送模型只能經 `dispatchModel` 取得接線。 */
export type OperationContext = WorldChecks & {
  operationId: string; issuedAt: number; accountPlayer: PlayerAccountView; services?: WorldTaskServices; trace: WorldTrace;
  decisionTrace: ReturnType<typeof createDecisionTrace> | undefined; workDeadline: number;
  verifyLease: () => Promise<void>; workWait: <T>(promise: Promise<T>) => Promise<T>; modelSignal: () => AbortSignal;
  dispatchModel: (task: 'npc' | 'adjudication' | 'feelings', world: World, actor: Character | undefined, provider: ModelProvider, model: string, key: string, options: { evidence: boolean; withinWorkDeadline: boolean; forward?: typeof fetch }) => ModelDispatch;
  /** 切換故事後，讓較早的操作身分全部視為已過期。 */
  forgetEarlierOperations: () => void;
};
export type OperationOutcome = { world?: World; failure?: Error; adjudicationFailure?: AdjudicationFailure; extras?: Record<string, unknown> };
/**
 * 一項操作。檢查依序發生在：`immediate`（不進 journal、直接回應）→ `request`（讀世界前）→
 * `loaded`（讀到世界後）→ 重送回放 → `journaled` → 世界場景比對 → `context` → 過期與受理紀錄檢查 →
 * `accepted` → 模型設定解析 → `normalized`（世界正規化後）→ 取得租約 → `run`。
 * 任何檢查回傳回應就停止，且不佔用操作身分。
 */
export type OperationHandler = {
  kind?: 'setup' | 'advance'; accountWorkspace?: boolean; largeBody?: boolean; privateEvidence?: boolean;
  immediate?(checks: OperationChecks): Promise<OperationReply>;
  request?(checks: OperationChecks): Checked | Promise<Checked>;
  loaded?(checks: WorldChecks): Checked | Promise<Checked>;
  journaled?(checks: WorldChecks): Checked | Promise<Checked>;
  context?(checks: WorldChecks): Checked | Promise<Checked>;
  accepted?(checks: WorldChecks): Checked | Promise<Checked>;
  normalized?(checks: WorldChecks): Checked | Promise<Checked>;
  run?(context: OperationContext): OperationOutcome | void | Promise<OperationOutcome | void>;
};
/** 每次請求建立一個新的 handler，讓各時點之間可以保留該次操作自己的狀態。 */
export type OperationTable = Record<string, () => OperationHandler>;
const settledReply = (result: OperationResult) => respond({ ...result.body, operationSettled: true }, result.status);
const waiting = () => respond({ error: '世界正處理另一個回合，正在等待後重試。', retryable: true }, 409);

export function restoreWorld(world:World,snapshot:World):void {
  const usage=world.aiUsage;
  if(usage)usage.savedDecisions=snapshot.aiUsage?.savedDecisions||0;
  for(const key of Object.keys(world))delete (world as unknown as Record<string,unknown>)[key];
  Object.assign(world,snapshot,{aiUsage:usage});
}


// Accounting and its idempotency marker share one owner-row CAS. The story
// version and exact HTTP receipt are independent from this bookkeeping update.
async function retainPaidUsage(db: ReturnType<typeof database>, id: string, operationId:string, before:AIUsage|undefined, after:AIUsage|undefined) {
  if(after)await recoverPaidUsage(db,id,operationId,paidDelta(before,after),true);
}

export type WorldTrace = {
  requestId: string; operationId?: string; lease?: number; version?: number;
  stage: string; outcome?: string;
};
export function traceWorld(trace: WorldTrace, stage: string, extra: { outcome?: string; status?: number; durationMs?: number } = {}) {
  trace.stage = stage;
  if (extra.outcome) trace.outcome = extra.outcome;
  // Deliberate allowlist: no URL, headers, owner, error message, key or world payload.
  try {
    console.info({ event: 'world_api', requestId: trace.requestId, operationId: trace.operationId,
      stage, lease: trace.lease, version: trace.version, outcome: trace.outcome, status: extra.status, durationMs: extra.durationMs });
  } catch { /* Diagnostics must not change the operation's outcome. */ }
}

export function stopReason(error: unknown) {
  if (error instanceof EffectValidationError) return {scope:'adjudication',code:'candidate_contract'};
  if (error instanceof BudgetExceeded) return {scope:'player',code:'player_budget'};
  if (error instanceof RecallServiceError) return {scope:error.code === 'provider_limit' ? 'provider' : 'owner',code:error.code};
  if (error instanceof Error && (error as Error & {code?:string}).code === 'provider_limit') return {scope:'provider',code:'provider_limit'};
  return {scope:'technical',code:'technical_failure'};
}


/** 觀察一次請求：產生 requestId，記錄開始、回應與未處理錯誤。 */
export async function observeOperation<T extends { status: number }>(run: (trace: WorldTrace) => Promise<T>): Promise<{ result: T; requestId: string }> {
  const started = performance.now();
  const trace: WorldTrace = { requestId: crypto.randomUUID(), stage: 'start' };
  traceWorld(trace, 'start');
  try {
    const result = await run(trace);
    traceWorld(trace, 'response', { status: result.status, durationMs: Math.round(performance.now() - started) });
    return { result, requestId: trace.requestId };
  } catch (error) {
    traceWorld(trace, 'unhandled', { outcome: 'unhandled-error', durationMs: Math.round(performance.now() - started) });
    throw error;
  }
}

/** 不經 HTTP 受理一次操作：給已自行完成登入與來源檢查的 route 使用。 */
export function acceptOperation(request: { accountId: string; binding: SaveBinding; body: OperationBody; services?: WorldTaskServices }, operations: OperationTable): Promise<OperationReply> {
  const receivedAt = Date.now();
  const responseSignal = deadlineSignal(receivedAt + roundClientMs, 'http-response');
  return awaitSignal(observeOperation(trace => runOperation({ ...request, bodyLength: JSON.stringify(request.body).length, timePolicy: roundTimePolicy.version, signal: new AbortController().signal, responseSignal, receivedAt, trace }, operations)).then(observed => observed.result), responseSignal)
    .catch(() => respond({ ...uncertainResult.body, operationUncertain: true }, 502));
}

export async function runOperation({accountId,binding,body,bodyLength,timePolicy,signal,responseSignal,receivedAt,trace,services}:OperationInput,operations:OperationTable):Promise<OperationReply> {
  const id=binding.storageOwner;
  let locked = false, lease = 0, workDeadline=0;
  let workSignal:AbortSignal|undefined,finishSignal:AbortSignal|undefined;
  const workWait=<T,>(promise:Promise<T>)=>workSignal?awaitSignal(promise,workSignal):promise;
  const finishWait=<T,>(promise:Promise<T>)=>finishSignal?awaitSignal(promise,finishSignal):promise;
  // A call has no fixed total of its own: the transport enforces the first-response and idle waits,
  // and the call may use what is left of the round's work window.
  const modelSignal=()=>deadlineSignal(workDeadline,'round-work',workSignal);
  let decisionTrace:ReturnType<typeof createDecisionTrace>|undefined;
  let traceSaved=false,traceWriteFailed=false;
  let traceStatus:{status:string;gap?:string;lastKnownStage?:string}={status:'pending',gap:'world-and-trace-are-separate-transactions'};
  let candidateWorld:World|undefined,commitRejected=false;
  const writeTrace=async(value:DecisionTrace)=>{
    const written=await saveDecisionTrace(database(),id,value,traceSaved);
    traceStatus={...(written.status==='write-failed'?written:{status:written.status}),lastKnownStage:value.lastKnownStage};
    if(written.status==='write-failed'){traceWriteFailed=true;decisionTrace?.gap('checkpoint-write-failed');}
    else traceSaved=true;
  };
  const finishTrace=async(outcome:DecisionTrace['outcome'],world?:World,version?:number)=>{
    if(!decisionTrace)return traceStatus;
    decisionTrace.finish(outcome,world,version);
    try{await finishWait(decisionTrace.persist());}catch{traceWriteFailed=true;traceStatus={status:'write-failed',gap:'checkpoint-deadline',lastKnownStage:'finalization'};}
    return traceStatus;
  };
  let evidence: ReturnType<typeof createOperationEvidence> | undefined;
  const finishEvidence = (world:World|undefined,outcome:OperationEvidence['outcome'],version?:number) => {
    try{return evidence?.finish(world,outcome,version);}catch{return undefined;}
  };
  let paidBefore:AIUsage|undefined,paidAfter:AIUsage|undefined,paidRetained=false;
  let journal: Journal = { floor: 0, results: {} }, operationId = '';
  let billing:ReturnType<typeof playerBilling>|undefined;
  try {
    const b: OperationBody = { ...body };
    if(b.operationScope!==id)return respond({error:'登入帳號已變更或缺少原世界識別，請回到原帳號核對。',scopeMismatch:true},409);
    const handler = Object.hasOwn(operations, b.operation || '') ? operations[b.operation!]() : undefined;
    if(binding.accountWorkspace&&!handler?.accountWorkspace)return respond({error:'帳號製作操作空間不能推進或操作世界。'},400);
    if (!handler?.largeBody && bodyLength > 16000) return respond({ error: '輸入過長。' }, 400);
    const checks = { b, accountId, binding, id };
    if (handler?.immediate) return await handler.immediate(checks);
    if (b.key !== undefined) return respond({ error: '請先在模型設定保存 Key；推進回合不接受 API Key。' }, 400);
    if (!handler) return respond({ error: '無效操作。' }, 400);
    if (b.mode !== 'demo' && b.mode !== 'ai' && !isModelProvider(b.mode)) return respond({ error: '模式無效。' }, 400);
    if (b.limits !== undefined && !validBudgetLimits(b.limits)) return respond({ error: '有限預算必須是大於 0 的安全整數；無上限請明確選擇。' }, 400);
    { const blocked = await handler.request?.(checks); if (blocked) return blocked; }
    const generatingSetup = handler.kind === 'setup';
    // 會派送模型的兩種操作：準備工作，以及非規則模式的推進。
    const paidAdvance = handler.kind === 'advance' && b.mode !== 'demo';
    await ensureAccountOperationLedger(binding);
    const loaded = await loadWorld(id);
    let world = loaded.world;
    const version = loaded.version;
    { const blocked = await handler.loaded?.({ ...checks, world, version }); if (blocked) return blocked; }


    // Legacy request limits remain valid replay payloads, but only set-budget changes policy.
    const accountPlayer=await playerAccount(accountId);

    if (typeof b.operationId !== 'string' || !operationIdPattern.test(b.operationId)) return respond({ error: '請更新頁面，使用有效的操作識別碼。' }, 400);
    operationId = b.operationId;
    billing=playerBilling(accountId,id,operationId,accountPlayer.prices,accountPlayer.usage);
    trace.operationId = operationId; trace.version = version;
    traceWorld(trace, 'journal-read');
    const issuedAt = Number(operationId.split(':')[0]);
    if (issuedAt > Date.now() + 60000) return respond({ error: '裝置時間不正確，請校正時間後重試。' }, 400);
    const stored = await database().prepare('SELECT operations, locked_until, state, version FROM worlds WHERE owner = ?').bind(id).first<{operations:string;locked_until:number;state:string;version:number}>();
    const serializedJournal = stored!.operations;
    journal = JSON.parse(serializedJournal);
    const previous = journal.results[operationId];
    if (previous && 'status' in previous) { if(previous.body.operationUncertain)try{await recoverPaidUsage(database(),id,operationId);}catch{/* Immutable receipt is still authoritative; GET exposes the outstanding gap. */} traceWorld(trace, 'journal-replay', { outcome: previous.body.operationUncertain ? 'uncertain' : 'settled' }); return settledReply(previous); }
    if (previous && 'pending' in previous) {
      if (previous.pending > Date.now()) { trace.lease = previous.pending; traceWorld(trace, 'lease-wait', { outcome: 'pending' }); return waiting(); }
      traceWorld(trace, 'lease-expired', { outcome: 'uncertain' });
      try{await recoverPaidUsage(database(),id,operationId);}catch{/* Storage recovery remains visible and retryable through the same ID. */}
      await database().prepare('UPDATE worlds SET operations = json_set(operations, ?, json(?)) WHERE owner = ? AND json_extract(operations, ?) = ?')
        .bind(`$.results."${operationId}"`, JSON.stringify(uncertainResult), id, `$.results."${operationId}".pending`, previous.pending).run();
      const latest = await database().prepare('SELECT operations FROM worlds WHERE owner = ?').bind(id).first<{operations:string}>();
      const settled = latest && (JSON.parse(latest.operations) as Journal).results[operationId];
      if (settled && 'status' in settled) return settledReply(settled);
      return respond(uncertainResult.body, uncertainResult.status);
    }
    { const blocked = await handler.journaled?.({ ...checks, world, version }); if (blocked) return blocked; }
    if (b.worldContext !== world.contextId) return respond({ error:'世界場景已切換，請重新讀取後再操作。', contextMismatch:true }, 409);
    { const blocked = await handler.context?.({ ...checks, world, version }); if (blocked) return blocked; }


    if (isOperationExpired(issuedAt, journal.floor)) return respond({ error: '操作識別碼已超過保留範圍；請重新讀取世界後再決定是否建立新操作。', operationExpired: true }, 410);
    // An archive can outlive a lost journal receipt. It proves prior acceptance,
    // not the original HTTP result; never turn a diagnostic lookup into a retry.
    try{
      if(await readDecisionTrace(database(),id,operationId)){
        if(stored!.locked_until>Date.now())return waiting();
        return respond({...uncertainResult.body,decisionTraceStatus:{status:'saved',gap:'journal-receipt-unavailable'}},uncertainResult.status);
      }
    }catch{return respond({error:'暫時無法確認此操作先前是否已受理，已停止派送。請稍後以同一操作重新讀取。',operationUncertain:true,decisionTraceStatus:{status:'read-failed',gap:'prior-acceptance-unavailable',lastKnownStage:'before-acceptance'}},503);}
    // Usage-only recovery deliberately does not change the story version.
    // A row loaded before that recovery must not acquire a newer journal and
    // later commit its stale accounting. Compare the original snapshot before
    // normalization; the lease CAS below also protects this exact stored row.
    if(stored!.version!==version||JSON.stringify(JSON.parse(stored!.state))!==JSON.stringify(world))return waiting();
    if(((paidAdvance)||generatingSetup)&&timePolicy!==roundTimePolicy.version)return respond({error:'回合等待政策已更新，請重新載入觀察室後以原操作識別碼繼續。',clientUpdateRequired:true},426);
    { const blocked = await handler.accepted?.({ ...checks, world, version }); if (blocked) return blocked; }
    trimJournal(journal, 7);
    const originalAdjudication = world.adjudication && { ...world.adjudication };
    let ephemeralModels = false;
    // Resolve only after exact-ID journal recovery and before accepting a new
    // dispatch. Both roles are captured once; later account edits cannot change
    // this operation's model chain or manufacture another paid opportunity.
    if ((paidAdvance) || generatingSetup) {
      const settings = await readEffectiveModels(accountId, binding, world.adjudication ? { adjudication: world.adjudication } : undefined);
      if (settings.source === 'account' || settings.source === 'save' || settings.source === 'missing') {
        if (!settings.effective.adjudication || (!generatingSetup && !settings.effective.npc)) return respond({ error: '請在原流程補齊模型設定。', modelSettingsRequired: true }, 400);
        ephemeralModels = true;
        world.adjudication = { ...settings.effective.adjudication };
        if (!generatingSetup) { b.mode = modelMode(settings.effective.npc!.provider); b.model = settings.effective.npc!.model; }
      }
      if (!generatingSetup && (typeof b.model !== 'string' || !b.model.trim())) return respond({ error: '請填入模型 ID。', modelSettingsRequired: true }, 400);
    }
    if (paidAdvance) await readModelKey(accountId, providerForMode(b.mode));
    if(paidAdvance){
      if(!world.adjudication)return respond({error:'請先設定天上意志的裁定服務、模型與 API Key。'},400);
      const status=await modelKeyStatus(accountId);
      if(!status[world.adjudication.provider].configured)return respond({error:'請先保存裁定服務的 API Key。'},400);
    }

    if (generatingSetup && !world.adjudication) return respond({ error: '請先在觀察室設定天上意志的服務、模型與 API Key。' }, 400);
    if (generatingSetup && world.adjudication) await readModelKey(accountId, world.adjudication.provider);
    if (!generatingSetup) normalizeWorld(world);
    const initialUsage = world.aiUsage && structuredClone(world.aiUsage);
    paidBefore=initialUsage;
    { const blocked = await handler.normalized?.({ ...checks, world, version }); if (blocked) return blocked; }
    responseSignal?.throwIfAborted();signal.throwIfAborted();
    if(Date.now()>=receivedAt+roundTimePolicy.deliveryMs)throw new DOMException('受理準備逾時，未開始回合。','TimeoutError');
    const db = database();
    const leaseCreatedAt=Date.now();
    workDeadline=leaseCreatedAt+roundTimePolicy.workMs;
    lease=leaseCreatedAt+roundLeaseMs;
    workSignal=deadlineSignal(workDeadline,'round-work',AbortSignal.any([signal,...(responseSignal?[responseSignal]:[])]));
    finishSignal=deadlineSignal(lease,'fixed-lease');
    trace.lease = lease;
    journal.results[operationId] = { pending: lease };
    if((paidAdvance)||generatingSetup){journal.usage??={};journal.usage[operationId]=emptyUsageReceipt(currentUsage(world).windowStartedAt);}
    const pendingJournal = JSON.stringify(journal);
    const acquired = await db.prepare('UPDATE worlds SET locked_until = ?, operations = ? WHERE owner = ? AND locked_until < ? AND version = ? AND operations = ? AND state = ?').bind(lease, JSON.stringify(journal), id, Date.now(), version, serializedJournal,stored!.state).run();
    if (!acquired.meta.changes) { traceWorld(trace, 'lease-wait', { outcome: 'contended' }); return waiting(); }
    locked = true;
    responseSignal?.throwIfAborted();workSignal.throwIfAborted();
    if(Date.now()>=receivedAt+roundTimePolicy.deliveryMs)throw new DOMException('取得租約逾時，未開始回合。','TimeoutError');
    traceWorld(trace, 'lease-acquired', { outcome: 'processing' });
    const beforeOperation = structuredClone(world);
    evidence=createOperationEvidence({operationId,requestId:trace.requestId,operation:b.operation!,baseVersion:version,world:beforeOperation,deployment:currentEnvironment(),
      ...(handler.kind==='advance'?{replay:{operation:'advance',operationId,worldContext:b.worldContext,mode:b.mode!,model:b.model,minutes:b.minutes!}}:{})});
    decisionTrace=createDecisionTrace({operationId,requestId:trace.requestId,operation:b.operation!,baseVersion:version,contextId:world.contextId,outcome:'unknown',deployment:currentEnvironment(),timePolicy:{version:roundTimePolicy.version,leaseCreatedAt,workDeadline,leaseDeadline:lease,clientMs:roundClientMs},accounting:{windowStartedAt:currentUsage(world).windowStartedAt}},writeTrace);
    // All configured service credentials must be known before the first private
    // checkpoint: an NPC input can accidentally contain the other provider key.
    decisionTrace.step('time-policy',undefined,{version:roundTimePolicy.version,leaseCreatedAt,leaseAcquiredAt:Date.now(),workDeadline,leaseDeadline:lease,clientMs:roundClientMs});
    const configuredKeys=await workWait(modelKeyStatus(accountId));
    for(const provider of modelProviders)if(configuredKeys[provider].configured){try{decisionTrace.registerSecret(await workWait(readModelKey(accountId,provider)));}catch{decisionTrace.omitUnsafeContent();}}
    await workWait(decisionTrace.persist());
    const verifyLease = async () => {
      workSignal!.throwIfAborted();
      const held = await workWait(db.prepare('SELECT locked_until, version FROM worlds WHERE owner = ?').bind(id).first<{locked_until:number;version:number}>());
      workSignal!.throwIfAborted();
      if (held?.locked_until !== lease || held.version !== version || Date.now() >= workDeadline){decisionTrace?.discard('lease-invalid');decisionTrace?.step('lease-invalid',undefined,{expectedVersion:version,observedVersion:held?.version,leaseHeld:held?.locked_until===lease,deadlineExpired:Date.now()>=workDeadline});throw Error('世界租約或工作期限已到期，本回合停止付費請求。');}
    };
    // 派送模型的共同接線：帳號預算預留與結算、決策追溯與操作證據的 observer 都在這裡接上。
    // 各派送點的差異以參數明示（#338 對照表），這裡不改變任何一處的既有行為。
    const dispatchModel=(task:'npc'|'adjudication'|'feelings',w:World,actor:Character|undefined,provider:ModelProvider,model:string,key:string,options:{evidence:boolean;withinWorkDeadline:boolean;forward?:typeof fetch})=>{
      const observer:ModelObserver|undefined=decisionTrace?.observer(task,actor,{...w,modelPrices:accountPlayer.prices},provider,model,key,options.evidence&&actor?evidence?.observer(task,actor.id,provider,model,key):undefined);
      return {
        observer:options.withinWorkDeadline&&observer?((event:Parameters<ModelObserver>[0])=>workWait(Promise.resolve(observer(event)))) as ModelObserver:observer,
        fetcher:billing!.fetcher(options.forward),
        beforeDispatch:billing!.beforeDispatch(provider,model,task),
        onSettled:billing!.finish,
        /** 先結算帳號帳本，再依序回報世界內用量與費用。 */
        reportUsage:(...after:((tokens:TokenUsage)=>void)[])=>async(tokens:TokenUsage)=>{await billing!.report(tokens);for(const report of after)report(tokens);},
      };
    };
    let failure: Error | undefined;
    let adjudicationFailure: AdjudicationFailure | undefined;
    let extras: Record<string, unknown> = {};
    {
      const outcome = await handler.run?.({ ...checks, world, version, operationId, issuedAt, accountPlayer, services, trace, decisionTrace, workDeadline, verifyLease, workWait, modelSignal, dispatchModel, forgetEarlierOperations: () => { journal.floor = Math.max(journal.floor, issuedAt - 1); } });
      if (outcome?.world) world = outcome.world;
      failure = outcome?.failure; adjudicationFailure = outcome?.adjudicationFailure; extras = outcome?.extras ?? {};
    }
    if (!generatingSetup && env.RECALL_ENABLED === 'true' && !world.acceptance) {
      try { await workWait(boundRecallStorage(world, id, workSignal)); }
      catch (error) {
        restoreWorld(world,beforeOperation);
        failure = error instanceof Error ? error : new Error('記憶容量驗證失敗，本回合沒有推進。');
      }
    }
    // The final synchronous activity/effect/validation segment can outlast an
    // abort timer callback. Only a completed in-budget candidate may enter the
    // separate commit/rollback window.
    if(!failure){try{checkSignal(workSignal!);}catch(error){restoreWorld(world,beforeOperation);failure=error instanceof Error?error:new Error('世界工作期限已到期。');decisionTrace?.step('round-failure',undefined,{name:failure.name,stage:'work-complete'});}}
    // Effective account/save preferences belong to the captured dispatch, not
    // to a newly invented legacy world setting on a later read.
    if (ephemeralModels) { if (originalAdjudication) world.adjudication = originalAdjudication; else delete world.adjudication; }
    const settledAccount=await playerAccount(accountId);
    if(generatingSetup||paidAdvance)await reconcileOperationUsage(accountId,id,operationId,initialUsage,world);
    const result: OperationResult = failure
      ? { status: failure instanceof BudgetExceeded ? 429 : 502, body: { world:worldForClient(world), version: version + 1, accountPlayer:settledAccount, error: failure.name === 'TimeoutError' ? `模型回應逾時，本回合沒有推進。${failure instanceof ModelResponseTimeout ? failure.message : ''}呼叫次數已記錄。` : failure.message, limitReached: failure instanceof BudgetExceeded, stopReason: stopReason(failure), ...(adjudicationFailure?{adjudicationFailure}:{}) } }
      : { status: 200, body: { world:worldForClient(world), version: version + 1, accountPlayer:settledAccount, limitReached: (b.mode !== 'demo' || generatingSetup) && budgetReached(settledAccount.usage, settledAccount.limits), ...extras } };
    decisionTrace?.step('world-candidate',undefined,{outcome:failure?'rolled-back':'candidate',failure:failure?.message});
    candidateWorld=world;
    decisionTrace?.step('commit-start',undefined,{candidateOutcome:failure?'rolled-back':'committed',candidateVersion:version+1});
    paidAfter=world.aiUsage&&structuredClone(world.aiUsage);
    try{await finishWait(decisionTrace!.persist());}catch{traceWriteFailed=true;decisionTrace?.gap('checkpoint-deadline');}
    finishSignal!.throwIfAborted();responseSignal?.throwIfAborted();signal.throwIfAborted();
    result.body.decisionTraceStatus=traceWriteFailed?{status:'write-failed',gap:'trace-write-failed'}:{status:'pending',gap:'world-and-trace-are-separate-transactions'};
    result.body.operationEvidence=finishEvidence(world,failure?'rolled-back':'committed',version+1);
    if(handler.privateEvidence&&result.body.operationEvidence){const safe=result.body.operationEvidence as OperationEvidence;result.body.operationEvidence={...safe,dispatches:safe.dispatches.map(({candidate,...dispatch})=>{void candidate;return dispatch;})};}
    journal.results[operationId] = result;
    if(journal.usage?.[operationId])journal.usage[operationId]={applied:paidDelta(paidBefore,world.aiUsage!),finalized:true};
    // The current exact response may exceed the historical byte budget by itself.
    trimJournal(journal, 8, operationId);
    paidAfter=world.aiUsage&&structuredClone(world.aiUsage);
    traceWorld(trace, 'commit-start');
    const saved = await finishWait(db.prepare(`UPDATE worlds SET state = ?, version = version + 1, locked_until = 0, operations = ? WHERE owner = ? AND version = ? AND locked_until = ? AND locked_until > max(?, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)) AND ? > CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER) AND operations = ?`).bind(JSON.stringify(world), JSON.stringify(journal), id, version, lease, Date.now(), Math.min(lease,receivedAt+roundClientMs), pendingJournal).run());
    if (!saved.meta.changes) {
      commitRejected=true;decisionTrace?.step('commit-conflict',undefined,{worldCommitted:false});await finishTrace('not-committed');
      traceWorld(trace, 'commit-conflict', { outcome: 'not-committed' });
      await retainPaidUsage(db, id, operationId, initialUsage, world.aiUsage);
      paidRetained=true;
      throw Error('儲存衝突，請重新載入再試。');
    }

    decisionTrace?.step('world-commit-confirmed',undefined,{version:version+1,outcome:failure?'rolled-back':'committed',committedEvidence:result.body.operationEvidence});
    if(decisionTrace){result.body.decisionTraceStatus=await finishTrace(failure?'rolled-back':'committed',world,version+1);
      // Link only a bounded status receipt. Failure here cannot undo the already
      // confirmed world transaction or make the transcript part of NPC state.
      await db.prepare('UPDATE worlds SET operations = json_set(operations, ?, json(?)) WHERE owner = ? AND json_extract(operations, ?) = ?').bind(`$.results."${operationId}".body.decisionTraceStatus`,JSON.stringify(result.body.decisionTraceStatus),id,`$.results."${operationId}".body.operationEvidence.requestId`,trace.requestId).run();
    }
    trace.version = version + 1;
    traceWorld(trace, 'commit-complete', { outcome: failure ? 'failed-round' : 'success' });
    return settledReply(result);
  } catch (e) {
    traceWorld(trace, 'operation-error', { outcome: locked ? 'commit-or-operation-error' : 'before-acceptance-error' });
    if (locked && operationId) {
      const result: OperationResult = { status: 502, body: { error: e instanceof Error ? e.message : '操作失敗，請重新讀取世界。', stopReason:stopReason(e), operationEvidence:finishEvidence(undefined,'not-committed') } };
      try {
        // A thrown save may have committed. Read the durable operation receipt first:
        // settled means return it without adding usage a second time; our pending
        // marker confirms no world save, so known paid deltas can be retained.
        const observed=await database().prepare('SELECT operations FROM worlds WHERE owner = ?').bind(id).first<{operations:string}>();
        const receipt=observed&&(JSON.parse(observed.operations) as Journal).results[operationId];
        if(receipt&&'status' in receipt){
          // A different tab can settle an expired pending marker as uncertain
          // before this worker stops. That receipt has no committed paid ledger;
          // retain our measured/unknown attempts once without changing its body.
          if(receipt.body.operationUncertain&&!paidRetained&&paidAfter){await retainPaidUsage(database(),id,operationId,paidBefore,paidAfter);paidRetained=true;}
          const original=receipt.body.operationEvidence as OperationEvidence|undefined;
          const outcome=receipt.body.operationUncertain?'unknown':original?.outcome||'unknown';
          decisionTrace?.step('journal-confirmed',undefined,{outcome,resultVersion:original?.resultVersion});
          const settledTraceStatus=await finishTrace(outcome,outcome==='committed'||outcome==='rolled-back'?candidateWorld:undefined,original?.resultVersion);
          if(!receipt.body.operationUncertain)receipt.body.decisionTraceStatus=settledTraceStatus;
          traceWorld(trace,'journal-confirmed',{outcome:receipt.body.operationUncertain?'uncertain':'settled'});
          if(!receipt.body.operationUncertain)await database().prepare('UPDATE worlds SET operations = json_set(operations, ?, json(?)) WHERE owner = ? AND json_extract(operations, ?) = ?').bind(`$.results."${operationId}".body.decisionTraceStatus`,JSON.stringify(receipt.body.decisionTraceStatus),id,`$.results."${operationId}".body.operationEvidence.requestId`,trace.requestId).run();
          return settledReply(receipt);
        }
        if(!receipt||!('pending' in receipt)||receipt.pending!==lease){decisionTrace?.step('journal-unavailable',undefined,{gap:'original-operation-receipt-unavailable'});decisionTrace?.gap('original-operation-receipt-unavailable');await finishTrace(commitRejected?'not-committed':'unknown');return respond({...uncertainResult.body,decisionTraceStatus:traceStatus},uncertainResult.status);}
        if(!paidRetained&&paidAfter){await retainPaidUsage(database(),id,operationId,paidBefore,paidAfter);paidRetained=true;}
        decisionTrace?.step('world-not-committed',undefined,{pendingLeaseConfirmed:true});
        result.body.decisionTraceStatus=await finishTrace('not-committed');
        const current=await database().prepare('SELECT operations FROM worlds WHERE owner = ?').bind(id).first<{operations:string}>();
        const failedJournal=JSON.parse(current!.operations) as Journal;
        failedJournal.results[operationId]=result;
        trimJournal(failedJournal,8,operationId);
        // A failure receipt now contains bounded evidence too. Preserve the byte
        // budget and eviction watermark under the same observed-journal CAS;
        // a late writer cannot discard newer receipts or revive an evicted ID.
        await database().prepare('UPDATE worlds SET operations = ? WHERE owner = ? AND operations = ? AND json_extract(operations, ?) = ?')
          .bind(JSON.stringify(failedJournal),id,current!.operations,`$.results."${operationId}".pending`,lease).run();
        const row = await database().prepare('SELECT operations FROM worlds WHERE owner = ?').bind(id).first<{operations:string}>();
        const settled = row && (JSON.parse(row.operations) as Journal).results[operationId];
        if (settled && 'status' in settled) {
          traceWorld(trace, 'journal-confirmed', { outcome: settled.body.operationUncertain ? 'uncertain' : 'settled' });
          return settledReply(settled);
        }
      } catch { /* Durable pending blocks re-execution even when storage is unavailable. */ }
      decisionTrace?.step('commit-status-unknown',undefined,{gap:'journal-confirmation-unavailable'});decisionTrace?.gap('journal-confirmation-unavailable');await finishTrace('unknown');
      return respond({...uncertainResult.body,decisionTraceStatus:traceStatus}, uncertainResult.status);
    }
    if (e instanceof ModelKeyError) return respond({ error: e.message, modelSettingsRequired: true }, e.status);
    return respond({ error: e instanceof Error ? e.message : '操作失敗，請稍後再試。', stopReason:stopReason(e) }, 502);
  } finally {
    if(billing)try{await billing.finish();}catch{traceWorld(trace,'account-accounting-pending',{outcome:'unknown-usage-retained'});}
    if (locked) try { await finishWait(database().prepare('UPDATE worlds SET locked_until = 0 WHERE owner = ? AND locked_until = ?').bind(id, lease).run()); } catch { traceWorld(trace, 'lease-release-failed', { outcome: 'lease-will-expire' }); }
  }
}

