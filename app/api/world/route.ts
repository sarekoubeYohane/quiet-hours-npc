import { enterAcceptanceScene, exitAcceptanceScene, worldForClient } from '@/lib/acceptance-scene';
import { authorityForProposal, effectCandidateSchema, parseEffectCandidate, EffectValidationError } from '@/lib/world-effects';
import { requestAdjudication, buildAdjudicationInput, validateExistingAdjudication, captureAdjudicationFailure, type AdjudicationFailure, type WorldTaskServices } from '@/lib/adjudication';
import { validPrice, savePrice, beginCost, costSummary, type PriceInput } from '@/lib/costs';
import { env } from 'cloudflare:workers';
import { recallMemories, boundRecallStorage } from '@/lib/recall';
import { reserveRecallDispatch, recallBudgetLimits, recallUsage, recallBudgetDatabase, RecallServiceError } from '@/lib/recall-services';
import { MemoryValidationError } from '@/lib/memory';
import { getGitHubUser } from '@/lib/auth';
import { loadWorld, database } from '@/lib/store';
import { record, normalizeWorld, resetWorld, resolve, type Action, type AIUsage, type World } from '@/lib/world';
import { aiDecision, directModels } from '@/lib/models';
import { advanceActivities, BudgetExceeded, currentUsage, defaultLimits, validBudgetLimits, budgetReached, type BudgetLimits } from '@/lib/activities';
import { clearModelKey, saveModelKey, readModelKey, modelKeyStatus, modelKeyStorageAvailable, ModelKeyError } from '@/lib/model-keys';

export const dynamic = 'force-dynamic';
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
function restoreWorld(world:World,snapshot:World):void {
  const usage=world.aiUsage;
  if(usage)usage.savedDecisions=snapshot.aiUsage?.savedDecisions||0;
  for(const key of Object.keys(world))delete (world as unknown as Record<string,unknown>)[key];
  Object.assign(world,snapshot,{aiUsage:usage});
}

const owner = async () => {
  try {
    return (await getGitHubUser())?.userId ?? reply({ error: '網站登入已失效，請用 GitHub 重新登入。', signInRequired: true }, 401);
  } catch { return reply({ error: '登入驗證服務暫時無法使用，請稍後重試。' }, 503); }
};

// A confirmed failed CAS did not commit this round. Merge only its paid deltas
// into the latest owner's row; a thrown save has an unknown outcome and is not replayed.
async function retainPaidUsage(db: ReturnType<typeof database>, id: string, before: AIUsage | undefined, after: AIUsage | undefined) {
  if (!after) return;
  const calls = after.totalCalls - (before?.totalCalls || 0);
  if (calls <= 0) return;
  const counter = (name: string) => `coalesce(json_extract(state, '$.aiUsage.${name}'), 0)`;
  const window = counter('windowStartedAt');
  const hourly = (name: string, delta: string) => `CASE WHEN ${window} = paid.window THEN ${counter(name)} + paid.${delta} WHEN ${window} > paid.window THEN ${counter(name)} ELSE paid.${delta} END`;
  const costBinds: (string | number)[] = [];
  const costFields: string[] = [];
  // Each price cohort is an additive paid receipt. Merge into the latest row in
  // the same SQL update as token deltas, including reset/other-page races.
  for (const group of ['total', 'hour'] as const) {
    const pairs: string[] = [];
    for (const [key, cohort] of Object.entries(after.costs?.[group] || {})) {
      const old = group === 'hour' && before?.windowStartedAt !== after.windowStartedAt ? undefined : before?.costs?.[group]?.[key];
      if (cohort.calls <= (old?.calls || 0)) continue;
      const basePath = `$.aiUsage.costs.${group}.${JSON.stringify(key)}`;
      const empty = {...cohort,calls:0,input:0,output:0,cachedInput:0,knownUsd:0,unknownCalls:0};
      const entries: string[] = [];
      costBinds.push(`$.${JSON.stringify(key)}`,basePath,JSON.stringify(empty));
      for (const field of ['calls','input','output','cachedInput','knownUsd','unknownCalls'] as const) {
        const stored = `coalesce(json_extract(state, ?), 0)`;
        entries.push(`'$.${field}', ${group === 'hour' ? `CASE WHEN ${window} = paid.window THEN ${stored} + ? ELSE ? END` : `${stored} + ?`}`);
        const delta = cohort[field] - (old?.[field] || 0);
        costBinds.push(`${basePath}.${field}`,delta);
        if (group === 'hour') costBinds.push(delta);
      }
      entries.push("'$.lastDispatchAt', max(coalesce(json_extract(state, ?), 0), ?)");
      costBinds.push(`${basePath}.lastDispatchAt`,cohort.lastDispatchAt);
      pairs.push(`?, json_set(coalesce(json_extract(state, ?), json(?)), ${entries.join(',')})`);
    }
    if (pairs.length) costFields.push(`'$.aiUsage.costs.${group}', ${group === 'hour' ? `CASE WHEN ${window} > paid.window THEN coalesce(json_extract(state, '$.aiUsage.costs.hour'), json('{}')) ELSE ` : ''}json_set(${group === 'hour' ? `CASE WHEN ${window} = paid.window THEN coalesce(json_extract(state, '$.aiUsage.costs.hour'), json('{}')) ELSE json('{}') END` : `coalesce(json_extract(state, '$.aiUsage.costs.total'), json('{}'))`}, ${pairs.join(',')})${group === 'hour' ? ' END' : ''}`);
  }
  await db.prepare(`WITH paid(window, calls, input, output, unknown) AS (VALUES (?, ?, ?, ?, ?))
    UPDATE worlds SET state = json_set(state,
      '$.aiUsage.windowStartedAt', max(${window}, paid.window),
      '$.aiUsage.calls', ${hourly('calls', 'calls')},
      '$.aiUsage.inputTokens', ${hourly('inputTokens', 'input')},
      '$.aiUsage.outputTokens', ${hourly('outputTokens', 'output')},
      '$.aiUsage.unknownCalls', ${hourly('unknownCalls', 'unknown')},
      '$.aiUsage.totalCalls', ${counter('totalCalls')} + paid.calls,
      '$.aiUsage.totalInputTokens', ${counter('totalInputTokens')} + paid.input,
      '$.aiUsage.totalOutputTokens', ${counter('totalOutputTokens')} + paid.output,
      '$.aiUsage.totalUnknownCalls', ${counter('totalUnknownCalls')} + paid.unknown,
      '$.aiUsage.savedDecisions', ${counter('savedDecisions')}
      ${costFields.length ? ',' + costFields.join(',') : ''}
    ), version = version + 1 FROM paid WHERE owner = ?`)
    .bind(after.windowStartedAt, calls,
      after.totalInputTokens - (before?.totalInputTokens || 0),
      after.totalOutputTokens - (before?.totalOutputTokens || 0),
      after.totalUnknownCalls - (before?.totalUnknownCalls || 0), ...costBinds, id).run();
}

type WorldTrace = {
  requestId: string; operationId?: string; lease?: number; version?: number;
  stage: string; outcome?: string;
};
function traceWorld(trace: WorldTrace, stage: string, extra: { outcome?: string; status?: number; durationMs?: number } = {}) {
  trace.stage = stage;
  if (extra.outcome) trace.outcome = extra.outcome;
  // Deliberate allowlist: no URL, headers, owner, error message, key or world payload.
  try {
    console.info({ event: 'world_api', requestId: trace.requestId, operationId: trace.operationId,
      stage, lease: trace.lease, version: trace.version, outcome: trace.outcome, status: extra.status, durationMs: extra.durationMs });
  } catch { /* Diagnostics must not change the operation's outcome. */ }
}
async function observeWorldRequest(run: (trace: WorldTrace) => Promise<Response>) {
  const started = performance.now();
  const trace: WorldTrace = { requestId: crypto.randomUUID(), stage: 'start' };
  traceWorld(trace, 'start');
  try {
    const response = await run(trace);
    response.headers.set('X-World-Request-Id', trace.requestId);
    traceWorld(trace, 'response', { status: response.status, durationMs: Math.round(performance.now() - started) });
    return response;
  } catch (error) {
    traceWorld(trace, 'unhandled', { outcome: 'unhandled-error', durationMs: Math.round(performance.now() - started) });
    throw error;
  }
}
function stopReason(error: unknown) {
  if (error instanceof EffectValidationError) return {scope:'adjudication',code:'candidate_contract'};
  if (error instanceof BudgetExceeded) return {scope:'player',code:'player_budget'};
  if (error instanceof RecallServiceError) return {scope:error.code === 'provider_limit' ? 'provider' : 'owner',code:error.code};
  if (error instanceof Error && (error as Error & {code?:string}).code === 'provider_limit') return {scope:'provider',code:'provider_limit'};
  return {scope:'technical',code:'technical_failure'};
}

export async function GET(request?: Request) {
  return observeWorldRequest(trace => readWorld(request, trace));
}
export async function POST(request: Request, services?: WorldTaskServices) {
  return observeWorldRequest(trace => mutateWorld(request, trace, services));
}

async function readWorld(request: Request | undefined, trace: WorldTrace) {
  const id = await owner();
  if (id instanceof Response) return id;
  try {
    const operationId = request && new URL(request.url).searchParams.get('operationId');
    if (operationId && !operationIdPattern.test(operationId)) return reply({ error: '操作識別碼無效。' }, 400);
    if (operationId) trace.operationId = operationId;
    traceWorld(trace, 'world-read');
    const loaded = await loadWorld(id);
    let operation;
    const row = await database().prepare('SELECT operations, state, version FROM worlds WHERE owner = ?').bind(id).first<{operations:string;state:string;version:number}>();
    // Return the current story and diagnostics from the same committed row.
    loaded.world = JSON.parse(row!.state);
    loaded.version = row!.version;
    const journal = JSON.parse(row!.operations) as Journal;
    const last = Object.values(journal.results).at(-1);
    const lastFailure = last && 'status' in last ? last.body.adjudicationFailure as AdjudicationFailure | undefined : undefined;
    const adjudicationFailure = lastFailure?.contextId === loaded.world.contextId ? lastFailure : undefined;
    if (operationId) {
      // Read only: reload must never dispatch a request that may not have reached us.
      const result = journal.results[operationId];
      operation = result && 'status' in result
        ? { state: result.body.operationUncertain ? 'uncertain' : 'settled', status: result.status, error: result.body.error, stopReason: result.body.stopReason, adjudicationFailure: result.body.adjudicationFailure }
        : result && 'pending' in result
          ? { state: result.pending > Date.now() ? 'pending' : 'uncertain' }
          : { state: isOperationExpired(Number(operationId.split(':')[0]), journal.floor) ? 'expired' : 'unknown' };
    }
    trace.version = loaded.version;
    traceWorld(trace, 'world-read-complete', { outcome: operation?.state || 'read' });
    normalizeWorld(loaded.world);
    loaded.world.aiUsage = currentUsage(loaded.world);
    return reply({ ...loaded, world:worldForClient(loaded.world), costSummary:costSummary(loaded.world.aiUsage!), operation, adjudicationFailure, operationScope: id, modelKeys: await modelKeyStatus(id), modelKeyStorageAvailable: modelKeyStorageAvailable(), recallUsage: env.RECALL_ENABLED === 'true' && !loaded.world.acceptance ? await recallUsage(recallBudgetDatabase(), id) : { enabled: false } });
  } catch (error) { traceWorld(trace, 'world-read-failed', { outcome: 'read-error' }); return reply({ error: error instanceof MemoryValidationError ? error.message : '暫時無法讀取世界，請稍後重試。', stopReason:stopReason(error) }, 503); }
}

type OperationResult = { status: number; body: Record<string, unknown> };
const settledReply = (result: OperationResult) => reply({ ...result.body, operationSettled: true }, result.status);
const uncertainResult: OperationResult = { status: 502, body: { error: '上次操作的結果無法確認，請重新讀取世界；此操作不會再次呼叫模型。', operationUncertain: true } };
const waiting = () => reply({ error: '世界正處理另一個回合，正在等待後重試。', retryable: true }, 409);
const operationIdPattern = /^\d{13}:[0-9a-f-]{36}$/;
const isOperationExpired = (issuedAt: number, floor: number) => issuedAt <= floor || issuedAt < Date.now() - 86400000;
type Journal = { floor: number; results: Record<string, OperationResult | { pending: number }> };
function trimJournal(journal: Journal, maxResults: number, protectedId?: string) {
  const oldest = Object.keys(journal.results).filter(id => id !== protectedId).sort((a,b) => Number(a.split(':')[0]) - Number(b.split(':')[0]));
  while (oldest.length && (Object.keys(journal.results).length > maxResults || new TextEncoder().encode(JSON.stringify(journal)).byteLength > 500000)) {
    const id = oldest.shift()!;
    journal.floor = Math.max(journal.floor, Number(id.split(':')[0]));
    delete journal.results[id];
  }
}


async function mutateWorld(request: Request, trace: WorldTrace, services?: WorldTaskServices) {
  const id = await owner();
  if (id instanceof Response) return id;
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: '請從觀察室操作。' }, 403);
  let locked = false, lease = 0;
  let paidBefore:AIUsage|undefined,paidAfter:AIUsage|undefined,paidRetained=false;
  let journal: Journal = { floor: 0, results: {} }, operationId = '';
  try {
    const raw = await request.text();
    if (raw.length > 16000) return reply({ error: '輸入過長。' }, 400);
    let b: { worldContext?:string; adjudication?:{provider:'openai'|'openrouter';model:string}; operationScope?: string; operationId?: string; operation?: string; minutes?: number; mode?: string; key?: string; model?: string; text?: string; target?: string; limits?: BudgetLimits; price?: PriceInput; action?: Action };
    try { b = JSON.parse(raw); } catch { return reply({ error: '請傳送有效的 JSON。' }, 400); }
    if (!b || typeof b !== 'object' || Array.isArray(b)) return reply({ error: '請傳送有效的操作。' }, 400);
    if (['set-model-key', 'clear-model-key'].includes(b.operation || '')) {
      if (!['ai', 'openai'].includes(b.mode || '')) return reply({ error: '請選擇要設定 Key 的模型服務。' }, 400);
      const provider = b.mode === 'openai' ? 'openai' : 'openrouter';
      if (b.operation === 'set-model-key') await saveModelKey(id, provider, b.key);
      else await clearModelKey(id, provider);
      return reply({ modelKeys: await modelKeyStatus(id), modelKeyStorageAvailable: modelKeyStorageAvailable() });
    }
    if (b.operationScope !== undefined && b.operationScope !== id) return reply({ error: '登入帳號已變更，請重新讀取世界。', scopeMismatch: true }, 409);
    if (b.key !== undefined) return reply({ error: '請先在模型設定保存 Key；推進回合不接受 API Key。' }, 400);
    if (!['advance', 'intervene', 'direct', 'takeover', 'return-control', 'reset', 'set-budget', 'set-price', 'set-adjudication', 'enter-acceptance', 'exit-acceptance'].includes(b.operation || '')) return reply({ error: '無效操作。' }, 400);
    if (!['ai', 'openai', 'demo'].includes(b.mode || '')) return reply({ error: '模式無效。' }, 400);
    if (b.limits !== undefined && !validBudgetLimits(b.limits)) return reply({ error: '有限預算必須是大於 0 的安全整數；無上限請明確選擇。' }, 400);
    if (b.operation === 'set-budget' && !validBudgetLimits(b.limits)) return reply({ error: '請提供完整的玩家預算設定。' }, 400);
    if (b.operation === 'set-price' && !validPrice(b.price)) return reply({error:'請填寫有效的供應商、模型、非負有限 USD 單價、來源與日期。'},400);
    if (b.operation === 'advance') {
      if (![15, 30].includes(b.minutes || 0)) return reply({ error: '請選擇 15 或 30 分鐘。' }, 400);
      if (b.mode !== 'demo' && (typeof b.model !== 'string' || !b.model.trim())) return reply({ error: '請填入模型 ID。' }, 400);
      if (b.mode === 'openai' && !directModels.includes(b.model || '')) return reply({ error: '請選擇網站支援的 OpenAI 模型。' }, 400);

    }
    if(b.operation==='set-adjudication'&&(!b.adjudication||!['openai','openrouter'].includes(b.adjudication.provider)||typeof b.adjudication.model!=='string'||!b.adjudication.model.trim()||b.adjudication.model.length>120||Object.keys(b.adjudication).some(k=>!['provider','model'].includes(k)))) return reply({error:'請填寫裁定服務與模型。'},400);
    const loaded = await loadWorld(id);
    let world = loaded.world;
    const version = loaded.version;

    // Legacy request limits remain valid replay payloads, but only set-budget changes policy.
    const limits = b.operation === 'set-budget' ? b.limits! : validBudgetLimits(world.playerBudget) ? world.playerBudget : defaultLimits;
    if (typeof b.operationId !== 'string' || !operationIdPattern.test(b.operationId)) return reply({ error: '請更新頁面，使用有效的操作識別碼。' }, 400);
    operationId = b.operationId;
    trace.operationId = operationId; trace.version = version;
    traceWorld(trace, 'journal-read');
    const issuedAt = Number(operationId.split(':')[0]);
    if (issuedAt > Date.now() + 60000) return reply({ error: '裝置時間不正確，請校正時間後重試。' }, 400);
    const stored = await database().prepare('SELECT operations FROM worlds WHERE owner = ?').bind(id).first<{operations:string}>();
    const serializedJournal = stored!.operations;
    journal = JSON.parse(serializedJournal);
    const previous = journal.results[operationId];
    if (previous && 'status' in previous) { traceWorld(trace, 'journal-replay', { outcome: previous.body.operationUncertain ? 'uncertain' : 'settled' }); return settledReply(previous); }
    if (previous && 'pending' in previous) {
      if (previous.pending > Date.now()) { trace.lease = previous.pending; traceWorld(trace, 'lease-wait', { outcome: 'pending' }); return waiting(); }
      traceWorld(trace, 'lease-expired', { outcome: 'uncertain' });
      await database().prepare('UPDATE worlds SET operations = json_set(operations, ?, json(?)) WHERE owner = ? AND json_extract(operations, ?) = ?')
        .bind(`$.results."${operationId}"`, JSON.stringify(uncertainResult), id, `$.results."${operationId}".pending`, previous.pending).run();
      const latest = await database().prepare('SELECT operations FROM worlds WHERE owner = ?').bind(id).first<{operations:string}>();
      const settled = latest && (JSON.parse(latest.operations) as Journal).results[operationId];
      if (settled && 'status' in settled) return settledReply(settled);
      return reply(uncertainResult.body, uncertainResult.status);
    }
    if (b.worldContext !== world.contextId) return reply({ error:'世界場景已切換，請重新讀取後再操作。', contextMismatch:true }, 409);
    if (isOperationExpired(issuedAt, journal.floor)) return reply({ error: '操作識別碼已超過保留範圍；請重新讀取世界後再決定是否建立新操作。', operationExpired: true }, 410);
    if (b.operation === 'enter-acceptance' && world.acceptance) return reply({error:'目前已在驗收場景，請先返回原世界。'},400);
    if (b.operation === 'exit-acceptance' && !world.acceptance?.original && !world.acceptance?.snapshot) return reply({error:'沒有可返回的原世界。'},400);
    if (b.operation === 'reset' && world.acceptance) return reply({error:'驗收期間請使用「結束驗收並返回原世界」，原世界保持保存。'},400);
    trimJournal(journal, 7);
    if (b.operation === 'advance' && b.mode !== 'demo') await readModelKey(id, b.mode === 'openai' ? 'openai' : 'openrouter');
    if(b.operation==='advance'&&b.mode!=='demo'){
      if(!world.adjudication)return reply({error:'請先設定天上意志的裁定服務、模型與 API Key。'},400);
      const status=await modelKeyStatus(id);
      if(!status[world.adjudication.provider].configured)return reply({error:'請先保存裁定服務的 API Key。'},400);
    }

    normalizeWorld(world);
    const initialUsage = world.aiUsage && structuredClone(world.aiUsage);
    paidBefore=initialUsage;
    if (b.operation === 'intervene' && (typeof b.text !== 'string' || !b.text.trim() || b.text.length > 500 || (!world.characters.some(c => c.id === b.target) && b.target !== 'all'))) return reply({ error: '請填入 1–500 字的事件，並選擇對象。' }, 400);
    if (b.operation === 'direct') {
      try {
        if (b.target !== undefined && b.target !== 'owner') throw Error('只能直接控制咖啡店主');
        const action = b.action;
        if (!action || typeof action !== 'object' || Object.keys(action).some(k => !['type', 'target', 'content', 'mood'].includes(k)) ||
          (action.content !== undefined && (typeof action.content !== 'string' || action.content.length > 500)) ||
          (action.target !== undefined && typeof action.target !== 'string') ||
          (action.mood !== undefined && (typeof action.mood !== 'string' || action.mood.length > 20))) throw Error('行動格式無效');
        const check = structuredClone(world);
        resolve(check, check.characters.find(c => c.id === 'owner')!, action, { dryRun: true });
      } catch (e) { return reply({ error: e instanceof Error ? e.message : '指定行動無效。' }, 400); }
    }
    if (['takeover', 'return-control'].includes(b.operation || '') && b.target !== undefined && b.target !== 'owner') return reply({ error: '只能直接控制咖啡店主。' }, 400);
    const db = database();
    lease = Date.now() + 120000;
    trace.lease = lease;
    journal.results[operationId] = { pending: lease };
    const pendingJournal = JSON.stringify(journal);
    const acquired = await db.prepare('UPDATE worlds SET locked_until = ?, operations = ? WHERE owner = ? AND locked_until < ? AND version = ? AND operations = ?').bind(lease, JSON.stringify(journal), id, Date.now(), version, serializedJournal).run();
    if (!acquired.meta.changes) { traceWorld(trace, 'lease-wait', { outcome: 'contended' }); return waiting(); }
    locked = true;
    traceWorld(trace, 'lease-acquired', { outcome: 'processing' });
    const beforeOperation = structuredClone(world);
    let failure: Error | undefined;
    let adjudicationFailure: AdjudicationFailure | undefined;
    let adjudicationAttempt: { actorId:string; input:unknown; raw:string; secrets:string[]; stage:'parse'|'effects' } | undefined;
    if (b.operation === 'enter-acceptance' || b.operation === 'exit-acceptance') {
      try {
        world = await (b.operation === 'enter-acceptance' ? enterAcceptanceScene(world) : exitAcceptanceScene(world));
        journal.floor = Math.max(journal.floor, issuedAt - 1);
      } catch (error) { failure = error instanceof Error ? error : new Error('無法切換驗收場景。'); }
    } else if (b.operation === 'set-price') {
      savePrice(world,b.price!);
    } else if (b.operation === 'set-adjudication') {
      world.adjudication={provider:b.adjudication!.provider,model:b.adjudication!.model.trim()};
    } else if (b.operation === 'set-budget') {
      world.playerBudget = { ...b.limits! };
    } else if (b.operation === 'takeover') {
      const c = world.characters.find(c => c.id === 'owner')!;
      c.control!.mode = 'taken-over';
      c.control!.experiences ??= [];
      if (!c.control!.active) { delete c.plan; c.activity = '待命，等待下一個指定行動。'; }
    } else if (b.operation === 'return-control') {
      const c = world.characters.find(c => c.id === 'owner')!;
      const experiences = c.control!.experiences;
      c.control = { mode: 'autonomous', ...(experiences?.length ? { experiences } : {}) };
      delete c.plan;
      c.activity = '已交還控制權，等待下一次自主選擇。';
    } else if (b.operation === 'direct') {
      world.characters.find(c => c.id === 'owner')!.control!.pending = b.action!;
    } else if (b.operation === 'reset') {
      // Same lease, version check and journal as every other mutation: a round another page is
      // committing either finishes first or makes this save fail, never a half-reset world.
      world = resetWorld(world);
      // Operations issued before the reset belong to the old story. Raising the floor makes a
      // later retry of such an ID answer 410, so the page re-reads the fresh world instead of
      // applying an old intention to it. Settled results stay replayable; IDs from the same
      // millisecond as the reset are not treated as older.
      journal.floor = Math.max(journal.floor, issuedAt - 1);
    } else if (b.operation === 'intervene') {
      const targets = b.target === 'all' ? world.characters.map(c => c.id) : [b.target!];
      const name = world.characters.find(c => c.id === b.target)?.name;
      record(world, 'observer', b.target === 'all' ? `共同事件：${b.text!.trim()}` : `觀察者對 ${name} 說：「${b.text!.trim()}」`, 'intervention', targets);
    } else {
      const before = structuredClone(world);
      try {
        let dispatchKey = '';
        const verifyLease = async () => {
          const held = await db.prepare('SELECT locked_until, version FROM worlds WHERE owner = ?').bind(id).first<{locked_until:number;version:number}>();
          if (held?.locked_until !== lease || held.version !== version || Date.now() >= lease - 10000) throw Error('世界租約或工作期限已到期，本回合停止付費請求。');
        };
        await advanceActivities(world, {
          minutes: b.minutes!, mode: b.mode!, modelKey: b.mode === 'demo' ? 'demo' : `${b.mode}:${b.model}`,
          limits,
          beforeDecision: async () => {
            await verifyLease();
            if (env.RECALL_ENABLED === 'true' && (await reserveRecallDispatch(recallBudgetDatabase(), id, 'chat', `${operationId}:chat:${world.aiUsage?.totalCalls || 0}`, 1, {ownerMonthly:0,accountMonthly:0}, 'player')).replayed) throw Error('付費請求結果不明，禁止重送。');
            dispatchKey = await readModelKey(id, b.mode === 'openai' ? 'openai' : 'openrouter');
            await verifyLease();
            traceWorld(trace, 'model-dispatch'); },
          decide: async (w, c, onUsage) => {
            adjudicationAttempt = undefined;
            const provider=b.mode === 'openai' ? 'openai' : 'openrouter';
            const price=w.modelPrices?.find(p=>p.provider===provider && p.model===b.model!.trim());
            let reportCost=beginCost(w.aiUsage!,provider,b.model!.trim(),price);
            let dispatch = 0;
            const guard = async (kind: 'chat' | 'embedding' | 'index' | 'search', units: number) => {
              await verifyLease();
              // Keep the same logical-round ledger captured by advanceActivities.
              // A rolling-hour boundary may reset only the next round, not this guard.
              const usage = w.aiUsage!;
              if (kind === 'chat' && budgetReached(usage, limits)) throw new BudgetExceeded();
              const reservationId = `${operationId}:${c.id}:${dispatch++}`;
              if ((kind!=='chat'||env.RECALL_ENABLED==='true') && (await reserveRecallDispatch(recallBudgetDatabase(), id, kind, reservationId, units, kind === 'chat' ? {ownerMonthly:0,accountMonthly:0} : recallBudgetLimits(kind), kind === 'chat' ? 'player' : 'owner')).replayed) throw Error('付費請求結果不明，禁止重送。');
              await verifyLease();
              return reservationId;
            };
            const decision = await aiDecision(w, c, dispatchKey, b.model!.trim(), b.mode === 'openai' ? 'openai' : 'openrouter', fetch, tokens=>{onUsage(tokens);reportCost(tokens);}, {
              enabled: env.RECALL_ENABLED === 'true' && !w.acceptance,
              verifyCurrent: verifyLease,
              signal: () => { const remaining = lease - 10000 - Date.now(); if (remaining <= 0) throw Error('世界工作期限已到期，禁止新的模型請求。'); return AbortSignal.timeout(Math.min(25000, remaining)); },
              beforeContinuation: async () => {
                await guard('chat', 1);
                traceWorld(trace, 'model-continuation-dispatch');
                const usage = w.aiUsage!;
                usage.calls++; usage.totalCalls++; usage.unknownCalls++; usage.totalUnknownCalls++;
                reportCost=beginCost(usage,provider,b.model!.trim(),price);
              },
              search: questions => recallMemories({owner:id, character:c, snapshot:before, version, questions, workDeadline:lease-10000, guard}),
            });
            if(decision.action.type==='propose'){
              const config=w.adjudication!;
              await guard('chat',1);
              const key=await readModelKey(id,config.provider);
              await verifyLease();
              const usage=w.aiUsage!;usage.calls++;usage.totalCalls++;usage.unknownCalls++;usage.totalUnknownCalls++;
              const cost=beginCost(usage,config.provider,config.model,w.modelPrices?.find(p=>p.provider===config.provider&&p.model===config.model),'adjudication');
              const input={...buildAdjudicationInput(w,c,decision.action),...authorityForProposal(w,c),durationMinutes:decision.durationMinutes};
              // Freeze the exact input before effects mutate objects or permissions.
              const inputSnapshot=JSON.stringify(input);
              const raw=await requestAdjudication(input, {key,provider:config.provider,model:config.model}, effectCandidateSchema, {signal:AbortSignal.timeout(Math.min(25000,lease-10000-Date.now())),requestId:`${operationId}:${c.id}:adjudication`,onUsage:tokens=>{onUsage(tokens);cost(tokens);}});
              await verifyLease();
              adjudicationAttempt={actorId:c.id,input:inputSnapshot,raw,secrets:[key,dispatchKey],stage:'parse'};
              try{decision.freeCandidate=parseEffectCandidate(raw);}
              catch(error){throw new EffectValidationError(error instanceof Error?error.message:'裁定候選格式無效。',{reason:'candidate_format'});}
              adjudicationAttempt.stage='effects';
            }
            if (typeof services?.adjudicateExistingAction === 'function' && !decision.continueExisting) {
              const candidate = await services.adjudicateExistingAction(buildAdjudicationInput(w,c,decision.action));
              await verifyLease();
              validateExistingAdjudication(candidate);
            }
            return decision;
          },
        });
      } catch (e) {
        if(e instanceof EffectValidationError && adjudicationAttempt){
          const attempt=adjudicationAttempt;
          adjudicationFailure=captureAdjudicationFailure({operationId,requestId:trace.requestId,contextId:world.contextId,actorId:attempt.actorId,stage:attempt.stage},attempt.input,attempt.raw,e.details,attempt.secrets);
        }
        // Roll back the incomplete round, but retain paid attempts and reported tokens.
        restoreWorld(world,before);
        failure = e instanceof Error ? e : new Error('模型決策失敗，本回合沒有推進。');
      }
    }
    if (env.RECALL_ENABLED === 'true' && !world.acceptance) {
      try { await boundRecallStorage(world, id); }
      catch (error) {
        restoreWorld(world,beforeOperation);
        failure = error instanceof Error ? error : new Error('記憶容量驗證失敗，本回合沒有推進。');
      }
    }
    const usage = currentUsage(world);
    const result: OperationResult = failure
      ? { status: failure instanceof BudgetExceeded ? 429 : 502, body: { world:worldForClient(world), version: version + 1, error: failure.name === 'TimeoutError' ? '模型回應逾時，本回合沒有推進。呼叫次數已記錄。' : failure.message, limitReached: failure instanceof BudgetExceeded, stopReason: stopReason(failure), ...(adjudicationFailure?{adjudicationFailure}:{}) } }
      : { status: 200, body: { world:worldForClient(world), version: version + 1, limitReached: b.mode !== 'demo' && budgetReached(usage, limits) } };
    journal.results[operationId] = result;
    // The current exact response may exceed the historical byte budget by itself.
    trimJournal(journal, 8, operationId);
    paidAfter=world.aiUsage&&structuredClone(world.aiUsage);
    traceWorld(trace, 'commit-start');
    const saved = await db.prepare('UPDATE worlds SET state = ?, version = version + 1, locked_until = 0, operations = ? WHERE owner = ? AND version = ? AND locked_until = ? AND locked_until > ? AND operations = ?').bind(JSON.stringify(world), JSON.stringify(journal), id, version, lease, Date.now(), pendingJournal).run();
    if (!saved.meta.changes) {
      traceWorld(trace, 'commit-conflict', { outcome: 'not-committed' });
      await retainPaidUsage(db, id, initialUsage, world.aiUsage);
      paidRetained=true;
      throw Error('儲存衝突，請重新載入再試。');
    }
    trace.version = version + 1;
    traceWorld(trace, 'commit-complete', { outcome: failure ? 'failed-round' : 'success' });
    return settledReply(result);
  } catch (e) {
    traceWorld(trace, 'operation-error', { outcome: locked ? 'commit-or-operation-error' : 'before-acceptance-error' });
    if (locked && operationId) {
      const result: OperationResult = { status: 502, body: { error: e instanceof Error ? e.message : '操作失敗，請重新讀取世界。', stopReason:stopReason(e) } };
      try {
        // A thrown save may have committed. Read the durable operation receipt first:
        // settled means return it without adding usage a second time; our pending
        // marker confirms no world save, so known paid deltas can be retained.
        const observed=await database().prepare('SELECT operations FROM worlds WHERE owner = ?').bind(id).first<{operations:string}>();
        const receipt=observed&&(JSON.parse(observed.operations) as Journal).results[operationId];
        if(receipt&&'status' in receipt){traceWorld(trace,'journal-confirmed',{outcome:receipt.body.operationUncertain?'uncertain':'settled'});return settledReply(receipt);}
        if(!receipt||!('pending' in receipt)||receipt.pending!==lease)return reply(uncertainResult.body,uncertainResult.status);
        if(!paidRetained&&paidAfter){await retainPaidUsage(database(),id,paidBefore,paidAfter);paidRetained=true;}
        await database().prepare('UPDATE worlds SET operations = json_set(operations, ?, json(?)) WHERE owner = ? AND json_extract(operations, ?) = ?')
          .bind(`$.results."${operationId}"`, JSON.stringify(result), id, `$.results."${operationId}".pending`, lease).run();
        const row = await database().prepare('SELECT operations FROM worlds WHERE owner = ?').bind(id).first<{operations:string}>();
        const settled = row && (JSON.parse(row.operations) as Journal).results[operationId];
        if (settled && 'status' in settled) {
          traceWorld(trace, 'journal-confirmed', { outcome: settled.body.operationUncertain ? 'uncertain' : 'settled' });
          return settledReply(settled);
        }
      } catch { /* Durable pending blocks re-execution even when storage is unavailable. */ }
      return reply(uncertainResult.body, uncertainResult.status);
    }
    if (e instanceof ModelKeyError) return reply({ error: e.message }, e.status);
    return reply({ error: e instanceof Error ? e.message : '操作失敗，請稍後再試。', stopReason:stopReason(e) }, 502);
  } finally {
    if (locked) try { await database().prepare('UPDATE worlds SET locked_until = 0 WHERE owner = ? AND locked_until = ?').bind(id, lease).run(); } catch { traceWorld(trace, 'lease-release-failed', { outcome: 'lease-will-expire' }); }
  }
}

