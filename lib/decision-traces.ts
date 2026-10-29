import { isCandidateFailureReason } from './model-adapter';
// Private observer archive. This module is deliberately not reachable from
// World, recall, memory recovery or model-context construction.
export const decisionTraceLimits = Object.freeze({ recordBytes: 1024 * 1024, records: 64, worldBytes: 16 * 1024 * 1024 });

export type DecisionTrace = {
  schemaVersion: 1;
  operationId: string;
  requestId: string;
  contextId?: string;
  operation: string;
  baseVersion: number;
  resultVersion?: number;
  outcome: 'committed' | 'rolled-back' | 'not-committed' | 'unknown';
  lastKnownStage: string;
  dispatches: unknown[];
  [key: string]: unknown;
};
export type DecisionTraceSummary = {
  operationId: string; requestId: string; outcome: DecisionTrace['outcome'];
  lastKnownStage: string; createdAt: number; bytes: number; gap?: string;
};
export type TraceWriteResult =
  | { status: 'saved' | 'omitted'; trace: DecisionTrace; bytes: number }
  | { status: 'write-failed'; gap: 'trace-write-failed' };

type TraceDatabase = Pick<D1Database, 'prepare'>;
const encodedBytes = (body: string) => new TextEncoder().encode(body).byteLength;

export function omitDecisionTraceContent(trace: DecisionTrace, reason: string, unknownCredentials = false, originalBytes?: number): DecisionTrace {
  // Identity and the last durable world outcome remain useful when the private
  // transcript cannot fit. This is explicitly a gap, never a complete record.
  const receipts = trace.dispatches.slice(0, 64).map(value => {
    if (!value || typeof value !== 'object') return { gap: 'dispatch-details-omitted' };
    const dispatch = value as Record<string, unknown>;
    const receipt: Record<string, unknown> = { gap: 'dispatch-content-omitted' };
    for (const key of ['sequence', 'task', 'actorId', 'requestId', 'provider', 'model', 'startedAt', 'receivedAt', 'httpStatus', 'stage', 'receivedAt', 'headersReceivedAt', 'fetchStartedAt', 'usageKnownAt']) {
      if(unknownCredentials&&['actorId','requestId','provider','model'].includes(key))continue;
      const item = dispatch[key];
      if (typeof item === 'number' || typeof item === 'string' && item.length <= 256) receipt[key] = item;
    }
    if(dispatch.signal&&typeof dispatch.signal==='object')receipt.signal=dispatch.signal;
    if(!unknownCredentials&&dispatch.price&&typeof dispatch.price==='object')receipt.price=dispatch.price;
    for(const usageKind of ['usage','lateUsage'] as const)if (dispatch[usageKind] && typeof dispatch[usageKind] === 'object') {
      receipt[usageKind] = Object.fromEntries(Object.entries(dispatch[usageKind]).filter(([key, value]) =>
        ['inputTokens', 'outputTokens', 'cachedInputTokens'].includes(key) && typeof value === 'number' && Number.isFinite(value) && value >= 0));
    }
    if(dispatch.discarded===true)receipt.discarded=true;
    if(dispatch.failure&&typeof dispatch.failure==='object')receipt.failure=Object.fromEntries(Object.entries(dispatch.failure).filter(([key,value])=>(['kind','stage'].includes(key)&&typeof value==='string'&&value.length<=256)||(key==='reason'&&isCandidateFailureReason(value))));
    return receipt;
  });
  return {
    schemaVersion: 1, operationId: trace.operationId, requestId: trace.requestId,
    contextId: unknownCredentials?undefined:trace.contextId, operation: trace.operation, baseVersion: trace.baseVersion,
    resultVersion: trace.resultVersion, outcome: trace.outcome, lastKnownStage: trace.lastKnownStage,
    dispatches: receipts, dispatchCount: trace.dispatches.length,
    gap: reason, gaps: [reason,...(Array.isArray(trace.gaps)?trace.gaps.filter((gap):gap is string=>typeof gap==='string'&&gap.length<=256).slice(0,16):[])], steps: [], redacted: unknownCredentials||trace.redacted === true, omittedOriginalBytes: originalBytes,acceptedAt:trace.acceptedAt,checkpoints:trace.checkpoints,timePolicy:trace.timePolicy,accounting:trace.accounting,
  };
}

export async function saveDecisionTrace(db: TraceDatabase, owner: string, trace: DecisionTrace, existingOnly = false): Promise<TraceWriteResult> {
  try {
    let body = JSON.stringify(trace);
    const originalBytes = encodedBytes(body);
    if (originalBytes > decisionTraceLimits.recordBytes) body = JSON.stringify(omitDecisionTraceContent(trace, 'single-record-limit', false, originalBytes));
    // A same-ID request never replaces a different original request's evidence.
    // Eviction runs inside this SQLite statement via the migration's triggers;
    // a failed statement cannot leave an over-limit archive behind.
    if(existingOnly){
      await db.prepare('UPDATE decision_traces SET body = ?, bytes = ? WHERE owner = ? AND operation_id = ? AND request_id = ?')
        .bind(body, encodedBytes(body), owner, trace.operationId, trace.requestId).run();
    }else{
      await db.prepare(`INSERT INTO decision_traces
        (owner, context_id, operation_id, request_id, created_at, body, bytes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(owner, operation_id) DO UPDATE SET body = excluded.body, bytes = excluded.bytes
        WHERE decision_traces.request_id = excluded.request_id`)
        .bind(owner, trace.contextId || '', trace.operationId, trace.requestId, typeof trace.acceptedAt==='number'?trace.acceptedAt:Date.now(), body, encodedBytes(body)).run();
    }
    // An update to an older in-flight record may itself be evicted by the same
    // limit trigger. Confirm what remains durable before claiming capture.
    const saved = await readDecisionTrace(db, owner, trace.operationId);
    if (!saved) return { status: 'write-failed', gap: 'trace-write-failed' };
    return { status: saved.gap === 'single-record-limit' ? 'omitted' : 'saved', trace: saved, bytes: encodedBytes(JSON.stringify(saved)) };
  } catch {
    // The caller puts this gap in the independent operation receipt. Never log
    // the private transcript or replace the world's commit/replay semantics.
    return { status: 'write-failed', gap: 'trace-write-failed' };
  }
}

export async function readDecisionTrace(db: TraceDatabase, owner: string, operationId: string): Promise<DecisionTrace | null> {
  const row = await db.prepare('SELECT body FROM decision_traces WHERE owner = ? AND operation_id = ?')
    .bind(owner, operationId).first<{ body: string }>();
  return row ? JSON.parse(row.body) as DecisionTrace : null;
}

export async function listDecisionTraces(db: TraceDatabase, owner: string, contextId?: string) {
  const context = contextId || '';
  const rows = await db.prepare(`SELECT operation_id AS operationId, request_id AS requestId,
    json_extract(body, '$.outcome') AS outcome, json_extract(body, '$.lastKnownStage') AS lastKnownStage,
    created_at AS createdAt, bytes, json_extract(body, '$.gap') AS gap
    FROM decision_traces WHERE owner = ? AND (context_id = ? OR (context_id = '' AND json_extract(body, '$.gap') = 'credential-redaction-unavailable')) ORDER BY created_at DESC, rowid DESC`)
    .bind(owner, context).all<DecisionTraceSummary>();
  const totals = await db.prepare(`SELECT count(*) AS count, coalesce(sum(bytes), 0) AS bytes,
    min(created_at) AS firstAvailableAt, max(created_at) AS lastAvailableAt
    FROM decision_traces WHERE owner = ?`)
    .bind(owner).first<{ count: number; bytes: number; firstAvailableAt: number | null; lastAvailableAt: number | null }>();
  const history = await db.prepare('SELECT coalesce(sum(evicted), 0) AS evicted FROM decision_trace_retention WHERE owner = ?')
    .bind(owner).first<{ evicted: number }>();
  return { records: rows.results, retention: { scope: 'owner-world' as const, ...totals!, evicted: history?.evicted || 0, limits: decisionTraceLimits } };
}

export async function clearDecisionTraces(db: TraceDatabase, owner: string): Promise<{ status: 'cleared' | 'clear-failed' }> {
  try {
    // Records are removed first. A crash before metadata deletion can only leave
    // an explicit historical eviction count, never resurrect private contents.
    await db.prepare('DELETE FROM decision_traces WHERE owner = ?').bind(owner).run();
    await db.prepare('DELETE FROM decision_trace_retention WHERE owner = ?').bind(owner).run();
    return { status: 'cleared' };
  } catch { return { status: 'clear-failed' }; }
}
