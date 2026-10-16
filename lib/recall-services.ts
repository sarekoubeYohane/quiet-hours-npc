import { env } from 'cloudflare:workers';
import type { database } from './store';

export type RecallUsageKind = 'embedding' | 'index' | 'search' | 'chat';
export type RecallMetadata = { owner: string; world: string; npc: string; memoryId: string; version: number };
export type RecallRecord = { id: string; metadata: RecallMetadata };
export type RecallVector = RecallRecord & { values: number[] };
export type RecallBudgetLimits = { ownerMonthly: number; accountMonthly: number; month?: string };
type RecallDB = ReturnType<typeof database>;
export class RecallServiceError extends Error {
  constructor(message: string, readonly code: 'owner_budget' | 'owner_unavailable' | 'provider_limit') { super(message); }
}

/** One shared billing ledger across every environment using the site owner's services. */
export function recallBudgetDatabase(): RecallDB {
  if (env.RECALL_ENABLED !== 'true' || !env.RECALL_USAGE_DB) throw new RecallServiceError('站主回想服務尚未啟用或設定未完成', 'owner_unavailable');
  return env.RECALL_USAGE_DB;
}

export async function recordEmbeddingUsage(db: RecallDB, reservationId: string, tokens: number) {
  if (!Number.isSafeInteger(tokens) || tokens < 0) throw Error('Embedding 用量回覆無效');
  const result = await db.prepare(`UPDATE recall_dispatch_usage SET known_input_tokens = ?
    WHERE reservation_id = ? AND kind = 'embedding' AND (known_input_tokens IS NULL OR known_input_tokens = ?)`)
    .bind(tokens, reservationId, tokens).run();
  if (result.meta.changes !== 1) throw Error('Embedding 用量記錄不存在或衝突');
}


/** Conservative dispatch units, never represented as provider tokens or currency. */
export function recallBudgetLimits(kind: RecallUsageKind): RecallBudgetLimits {
  const parse = (value: string | undefined, fallback: number) => {
    if (value === undefined) return fallback;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 0) throw Error('回想預算設定無效');
    return parsed;
  };
  const limits = env.RECALL_BUDGET_LIMITS ? JSON.parse(env.RECALL_BUDGET_LIMITS) as Partial<Record<RecallUsageKind, { ownerMonthly: number; accountMonthly: number }>> : {};
  const configured = limits[kind];
  return {
    ownerMonthly: parse(configured?.ownerMonthly === undefined ? undefined : String(configured.ownerMonthly), kind === 'embedding' ? 1_000_000 : 10_000),
    accountMonthly: parse(configured?.accountMonthly === undefined ? undefined : String(configured.accountMonthly), kind === 'embedding' ? 100_000 : 1_000),
  };
}

/** Independent from world CAS: paid or uncertain attempts remain reserved after rollback. */
export async function reserveRecallDispatch(db: RecallDB, owner: string, kind: RecallUsageKind, reservationId: string, units: number, limits: RecallBudgetLimits = recallBudgetLimits(kind), payer: 'owner' | 'player' = 'owner') {
  if (payer === 'player' && kind !== 'chat') throw Error('此服務沒有玩家付費憑證');
  const month = limits.month ?? new Date().toISOString().slice(0, 7);
  if (!owner || !reservationId || !Number.isSafeInteger(units) || units < 1 || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !['embedding', 'index', 'search', 'chat'].includes(kind) || ![limits.ownerMonthly, limits.accountMonthly].every(limit => Number.isSafeInteger(limit) && limit >= 0)) throw Error('回想預算保留無效');
  const existing = await db.prepare('SELECT account_owner, month, kind, units FROM recall_dispatch_usage WHERE reservation_id = ?').bind(reservationId).first<{account_owner:string;month:string;kind:string;units:number}>();
  if (existing) {
    if (existing.account_owner !== owner || existing.kind !== kind || existing.units !== units) throw Error('回想預算識別碼衝突');
    return { kind, units, month: existing.month, reservationId, replayed: true };
  }
  // A single SQLite write statement serializes concurrent accounts against the shared site budget.
  const result = await db.prepare(`INSERT OR IGNORE INTO recall_dispatch_usage (reservation_id, account_owner, month, kind, units, reserved_at)
    SELECT ?, ?, ?, ?, ?, ? WHERE ? = 1 OR (
    COALESCE((SELECT SUM(units) FROM recall_dispatch_usage WHERE month = ? AND kind = ?), 0) + ? <= ? AND
    COALESCE((SELECT SUM(units) FROM recall_dispatch_usage WHERE month = ? AND kind = ? AND account_owner = ?), 0) + ? <= ?)`)
    .bind(reservationId, owner, month, kind, units, Date.now(), payer === 'player' ? 1 : 0, month, kind, units, limits.ownerMonthly, month, kind, owner, units, limits.accountMonthly).run();
  if (result.meta.changes === 0) {
    const raced = await db.prepare('SELECT account_owner, month, kind, units FROM recall_dispatch_usage WHERE reservation_id = ?').bind(reservationId).first<{account_owner:string;month:string;kind:string;units:number}>();
    if (raced && raced.account_owner === owner && raced.kind === kind && raced.units === units) return { kind, units, month: raced.month, reservationId, replayed: true };
    throw new RecallServiceError('站主回想服務預算不足，本回合未推進；提高玩家預算不能解除站主限制。', 'owner_budget');
  }
  return { kind, units, month, reservationId, replayed: false };
}

export async function recallUsage(db: RecallDB, owner: string) {
  const month = new Date().toISOString().slice(0, 7);
  const rows = await db.prepare('SELECT kind, SUM(units) AS units, SUM(known_input_tokens) AS known_input_tokens FROM recall_dispatch_usage WHERE account_owner = ? AND month = ? GROUP BY kind').bind(owner, month).all<{kind:RecallUsageKind;units:number;known_input_tokens:number|null}>();
  return { month, payer: 'owner' as const, playerPaidChatCalls: rows.results.find(row => row.kind === 'chat')?.units ?? 0, ownerUnits: Object.fromEntries(['embedding', 'index', 'search'].map(kind => [kind, rows.results.find(row => row.kind === kind)?.units ?? 0])) as Record<'embedding' | 'index' | 'search', number>, knownEmbeddingInputTokens: rows.results.find(row => row.kind === 'embedding')?.known_input_tokens ?? 0, units: Object.fromEntries(['embedding', 'index', 'search', 'chat'].map(kind => [kind, rows.results.find(row => row.kind === kind)?.units ?? 0])) as Record<RecallUsageKind, number> };
}

function metadata(value: unknown): RecallMetadata {
  if (!value || typeof value !== 'object') throw Error('向量服務回傳無效範圍');
  const item = value as Record<string, unknown>;
  if (['owner', 'world', 'npc', 'memoryId'].some(key => typeof item[key] !== 'string' || !item[key]) || !Number.isSafeInteger(item.version) || (item.version as number) < 1) throw Error('向量服務回傳無效範圍');
  return { owner: item.owner as string, world: item.world as string, npc: item.npc as string, memoryId: item.memoryId as string, version: item.version as number };
}
function vector(values: number[]) {
  if (values.length !== 1536 || !values.every(value => typeof value === 'number' && Number.isFinite(value))) throw Error('Embedding 維度或數值無效');
  return values;
}
/** Vectorize bindings have no abort parameter. Stop waiting, retaining uncertain dispatch usage. */
function abortable<T>(run: () => Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason ?? Error('回想服務已取消'));
    signal.addEventListener('abort', abort, { once: true });
    run().then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

/** Transport only. Callers must reserve usage and revalidate the lease before each dispatch. */
export function recallServices() {
  const configured = () => {
    if (env.RECALL_ENABLED !== 'true' || !env.RECALL_USAGE_DB || !env.MEMORY_VECTOR_INDEX || !env.OWNER_EMBEDDING_KEY) throw new RecallServiceError('站主回想服務尚未啟用或設定未完成', 'owner_unavailable');
    return env.MEMORY_VECTOR_INDEX;
  };
  return {
    async embed(texts: string[], signal: AbortSignal, onUsage?: (tokens: number) => Promise<void>): Promise<number[][]> {
      configured();
      signal.throwIfAborted();
      if (!texts.length || texts.length > 8 || texts.some(text => !text.trim() || new TextEncoder().encode(text).byteLength > 4096)) throw Error('Embedding 輸入超出限制');
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST', redirect: 'manual', signal,
        headers: { Authorization: `Bearer ${env.OWNER_EMBEDDING_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'text-embedding-3-small', dimensions: 1536, encoding_format: 'float', input: texts }),
      });
      if (!response.ok) throw new RecallServiceError(response.status === 429 || response.status === 402 ? '站主 Embedding 供應商額度不足或暫時限流。' : '站主 Embedding 服務失敗。', response.status === 429 || response.status === 402 ? 'provider_limit' : 'owner_unavailable');
      const body = await response.json() as {data?: {index:number;embedding:number[]}[];usage?:{total_tokens?:number}};
      if (body.usage?.total_tokens !== undefined) {
        if (!Number.isSafeInteger(body.usage.total_tokens) || body.usage.total_tokens < 0) throw Error('Embedding 用量回覆無效');
        await onUsage?.(body.usage.total_tokens);
      }
      if (!Array.isArray(body.data) || body.data.length !== texts.length) throw Error('Embedding 回覆無效');
      return texts.map((_, index) => {
        const matches = body.data!.filter(item => item.index === index);
        if (matches.length !== 1 || !Array.isArray(matches[0].embedding)) throw Error('Embedding 回覆無效');
        return vector(matches[0].embedding);
      });
    },
    async upsert(records: RecallVector[], signal: AbortSignal): Promise<void> {
      const index = configured();
      if (!records.length || records.length > 8) throw Error('向量同步數量超出限制');
      const vectors = records.map(record => ({ id: record.id, values: vector(record.values), metadata: metadata(record.metadata) }));
      await abortable(() => index.upsert(vectors), signal);
    },
    async remove(ids: string[], signal: AbortSignal): Promise<void> {
      const index = configured();
      if (!ids.length || ids.length > 8) throw Error('向量清除數量超出限制');
      await abortable(() => index.deleteByIds(ids), signal);
    },
    async get(ids: string[], signal: AbortSignal): Promise<RecallRecord[]> {
      const index = configured();
      if (!ids.length || ids.length > 8) throw Error('向量版本查詢數量超出限制');
      const records = await abortable(() => index.getByIds(ids), signal);
      return records.map(record => ({ id: record.id, metadata: metadata(record.metadata) }));
    },
    async ready(id: string, expected: RecallMetadata, signal: AbortSignal): Promise<boolean> {
      const index = configured();
      const scope = metadata(expected);
      const result = await abortable(() => index.queryById(id, {
        topK: 1, returnValues: false, returnMetadata: 'all',
        filter: { owner: { $eq: scope.owner }, world: { $eq: scope.world }, npc: { $eq: scope.npc }, memoryId: { $eq: scope.memoryId }, version: { $eq: scope.version } },
      }), signal);
      return result.matches.some(record => {
        const actual = metadata(record.metadata);
        return record.id === id && actual.owner === scope.owner && actual.world === scope.world && actual.npc === scope.npc && actual.memoryId === scope.memoryId && actual.version === scope.version;
      });
    },
    async search(values: number[], scope: {owner:string;world:string;npc:string}, signal: AbortSignal): Promise<RecallRecord[]> {
      const index = configured();
      if (!scope.owner || !scope.world || !scope.npc) throw Error('回想範圍無效');
      const result = await abortable(() => index.query(vector(values), { topK: 5, returnValues: false, returnMetadata: 'all', filter: { owner: { $eq: scope.owner }, world: { $eq: scope.world }, npc: { $eq: scope.npc } } }), signal);
      return result.matches.map(record => ({ id: record.id, metadata: metadata(record.metadata) }));
    },
  };
}
