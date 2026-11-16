import { playerAccount } from '@/lib/player-account-budget';
import { modelSettingsView } from '@/lib/model-settings-store';
import { bindWorldSave, ensureAccountOperationLedger, SaveAccessError } from '@/lib/world-saves';
import { recoveryStatus } from '@/lib/usage-recovery';
import { roundClientMs, timePolicyHeader, deadlineSignal, awaitSignal } from '@/lib/round-time-policy';
import { readDecisionTrace, listDecisionTraces, omitDecisionTraceContent } from '@/lib/decision-traces';
import { worldForClient } from '@/lib/acceptance-scene';
import { type WorldTaskServices } from '@/lib/adjudication';
import { costSummary } from '@/lib/costs';
import { env } from 'cloudflare:workers';
import { recallUsage, recallBudgetDatabase } from '@/lib/recall-services';
import { MemoryValidationError } from '@/lib/memory';
import { getGitHubUser } from '@/lib/auth';
import { loadWorld, database } from '@/lib/store';
import { normalizeWorld } from '@/lib/world';
import { currentUsage } from '@/lib/activities';
import { journalView, observeOperation, operationIdPattern, stopReason, traceWorld, uncertainResult, type Journal, type OperationBody, type WorldTrace } from '@/lib/host-runtime';
import { runHostOperation } from '@/lib/host-operations';
import { modelKeyStatus, modelKeyStorageAvailable } from '@/lib/model-keys';

export const dynamic = 'force-dynamic';
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const owner = async () => {
  try {
    return (await getGitHubUser())?.userId ?? reply({ error: '網站登入已失效，請用 GitHub 重新登入。', signInRequired: true }, 401);
  } catch { return reply({ error: '登入驗證服務暫時無法使用，請稍後重試。' }, 503); }
};

async function observed(run: (trace: WorldTrace) => Promise<Response>) {
  const { result, requestId } = await observeOperation(run);
  result.headers.set('X-World-Request-Id', requestId);
  return result;
}
export async function GET(request?: Request) {
  return observed(trace => readWorld(request, trace));
}
export async function POST(request: Request, services?: WorldTaskServices) {
  const receivedAt=Date.now();
  const responseDeadline=deadlineSignal(receivedAt+roundClientMs,'http-response');
  return awaitSignal(observed(trace => mutateWorld(request, trace, services,responseDeadline,receivedAt)),responseDeadline).catch(()=>reply({...uncertainResult.body,operationUncertain:true},502));
}

async function readWorld(request: Request | undefined, trace: WorldTrace) {
  const accountId = await owner();
  if (accountId instanceof Response) return accountId;
  let binding:Awaited<ReturnType<typeof bindWorldSave>>;
  try { binding=await bindWorldSave(accountId,request); } catch(error) { return reply({error:error instanceof Error?error.message:'無法讀取存檔。'},error instanceof SaveAccessError?error.status:503); }
  const id=binding.storageOwner;
  const readScope=request&&new URL(request.url).searchParams.get('operationScope');if((request&&new URL(request.url).searchParams.has('operationId')&&!readScope)||(readScope!==undefined&&readScope!==null&&readScope!==id))return reply({error:'原世界或帳號已變更，請回原帳號恢復。',scopeMismatch:true},409);
  try {
    const operationId = request && new URL(request.url).searchParams.get('operationId');
    if (operationId && !operationIdPattern.test(operationId)) return reply({ error: '操作識別碼無效。' }, 400);
    if (operationId) trace.operationId = operationId;
    traceWorld(trace, 'world-read');
    await ensureAccountOperationLedger(binding);
    const loaded = await loadWorld(id);
    let decisionTrace=null,decisionTraces;let traceReadFailed=false;
    try{decisionTraces=await listDecisionTraces(database(),id,loaded.world.contextId);if(operationId)decisionTrace=await readDecisionTrace(database(),id,operationId);}catch{traceReadFailed=true;decisionTraces={records:[],gap:'trace-read-failed'};}
    const row = await database().prepare('SELECT operations, state, version FROM worlds WHERE owner = ?').bind(id).first<{operations:string;state:string;version:number}>();
    // Return the current story and diagnostics from the same committed row.
    loaded.world = JSON.parse(row!.state);
    loaded.version = row!.version;
    const journal = JSON.parse(row!.operations) as Journal;
    const { adjudicationFailure, recentOperations, operationEvidence, operation, lastTraceWriteFailed } = journalView(journal, loaded.world.contextId, operationId || undefined);
    if(lastTraceWriteFailed&&decisionTraces)decisionTraces={...decisionTraces,gap:'trace-write-failed'};
    trace.version = loaded.version;
    traceWorld(trace, 'world-read-complete', { outcome: operation?.state || 'read' });
    normalizeWorld(loaded.world);
    loaded.world.aiUsage = currentUsage(loaded.world);
    const accountPlayer=await playerAccount(accountId);
    if(decisionTrace?.operation==='assess-character-card')decisionTrace=omitDecisionTraceContent(decisionTrace,'character-formation-private');
    const modelSettings = await modelSettingsView(accountId, binding);
    if (modelSettings.effective.adjudication) loaded.world.adjudication = { ...modelSettings.effective.adjudication };
    else if (modelSettings.source !== 'legacy') delete loaded.world.adjudication;
    return reply({ ...loaded, accountPlayer, modelSettings, decisionTrace, decisionTraces, world:worldForClient(loaded.world), costSummary:costSummary(loaded.world.aiUsage!), accountCostSummary:costSummary(accountPlayer.usage), usageRecovery:operationId?recoveryStatus(journal,operationId,decisionTrace,traceReadFailed):undefined, unresolvedUsageRecovery:!!journal.unresolvedUsageEvicted||Object.entries(journal.results).some(([key])=>{const status=recoveryStatus(journal,key,key===operationId?decisionTrace:null);return !!status?.unknownRange;}), operation, operationEvidence, recentOperations, adjudicationFailure, operationScope: id, modelKeys: await modelKeyStatus(accountId), modelKeyStorageAvailable: modelKeyStorageAvailable(), recallUsage: env.RECALL_ENABLED === 'true' && !loaded.world.acceptance ? await recallUsage(recallBudgetDatabase(), accountId) : { enabled: false } });
  } catch (error) { traceWorld(trace, 'world-read-failed', { outcome: 'read-error' }); return reply({ error: error instanceof MemoryValidationError ? error.message : '暫時無法讀取世界，請稍後重試。', stopReason:stopReason(error) }, 503); }
}



async function mutateWorld(request: Request, trace: WorldTrace, services?: WorldTaskServices,responseSignal?:AbortSignal,receivedAt=Date.now()) {
  const accountId = await owner();
  if (accountId instanceof Response) return accountId;
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: '請從觀察室操作。' }, 403);
  let binding:Awaited<ReturnType<typeof bindWorldSave>>;
  try { binding=await bindWorldSave(accountId,request); } catch(error) { return reply({error:error instanceof Error?error.message:'無法讀取存檔。'},error instanceof SaveAccessError?error.status:503); }
  let raw: string;
  try { raw = await request.text(); } catch (e) { return reply({ error: e instanceof Error ? e.message : '操作失敗，請稍後再試。', stopReason:stopReason(e) }, 502); }
  if (raw.length > 128000) return reply({ error: '輸入過長。' }, 400);
  let body: OperationBody;
  try { body = JSON.parse(raw); } catch { return reply({ error: '請傳送有效的 JSON。' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return reply({ error: '請傳送有效的操作。' }, 400);
  // 受理、租約、執行與提交都在主持執行層；這裡只負責 HTTP。
  const result = await runHostOperation({ accountId, binding, body, bodyLength: raw.length, timePolicy: request.headers.get(timePolicyHeader), signal: request.signal, responseSignal, receivedAt, trace, services });
  return reply(result.body, result.status);
}
