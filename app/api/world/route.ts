import { dailyUsage, reserveDailyUsage, DailyLimitExceeded } from '@/lib/daily-usage';
import { MemoryValidationError } from '@/lib/memory';
import { getGitHubUser } from '@/lib/auth';
import { loadWorld, database } from '@/lib/store';
import { record, normalizeWorld, resetWorld, resolve, type Action, type AIUsage } from '@/lib/world';
import { aiDecision, directModels } from '@/lib/models';
import { advanceActivities, BudgetExceeded, currentUsage, defaultLimits, type BudgetLimits } from '@/lib/activities';
import { clearModelKey, saveModelKey, readModelKey, modelKeyStatus, modelKeyStorageAvailable, ModelKeyError } from '@/lib/model-keys';

export const dynamic = 'force-dynamic';
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
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
    ), version = version + 1 FROM paid WHERE owner = ?`)
    .bind(after.windowStartedAt, calls,
      after.totalInputTokens - (before?.totalInputTokens || 0),
      after.totalOutputTokens - (before?.totalOutputTokens || 0),
      after.totalUnknownCalls - (before?.totalUnknownCalls || 0), id).run();
}

export async function GET() {
  const id = await owner();
  if (id instanceof Response) return id;
  try {
    const loaded = await loadWorld(id);
    normalizeWorld(loaded.world);
    loaded.world.aiUsage = currentUsage(loaded.world);
    return reply({ ...loaded, dailyUsage: await dailyUsage(id).catch(() => null), operationScope: id, modelKeys: await modelKeyStatus(id), modelKeyStorageAvailable: modelKeyStorageAvailable() });
  } catch (error) { return reply({ error: error instanceof MemoryValidationError ? error.message : '暫時無法讀取世界，請稍後重試。' }, 503); }
}

type OperationResult = { status: number; body: Record<string, unknown> };
const settledReply = (result: OperationResult) => reply({ ...result.body, operationSettled: true }, result.status);
const uncertainResult: OperationResult = { status: 502, body: { error: '上次操作的結果無法確認，請重新讀取世界；此操作不會再次呼叫模型。', operationUncertain: true } };
const waiting = () => reply({ error: '世界正處理另一個回合，正在等待後重試。', retryable: true }, 409);
type Journal = { floor: number; results: Record<string, OperationResult | { pending: number }> };
function trimJournal(journal: Journal, maxResults: number, protectedId?: string) {
  const oldest = Object.keys(journal.results).filter(id => id !== protectedId).sort((a,b) => Number(a.split(':')[0]) - Number(b.split(':')[0]));
  while (oldest.length && (Object.keys(journal.results).length > maxResults || new TextEncoder().encode(JSON.stringify(journal)).byteLength > 500000)) {
    const id = oldest.shift()!;
    journal.floor = Math.max(journal.floor, Number(id.split(':')[0]));
    delete journal.results[id];
  }
}


export async function POST(request: Request) {
  const id = await owner();
  if (id instanceof Response) return id;
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: '請從觀察室操作。' }, 403);
  let locked = false, lease = 0;
  let journal: Journal = { floor: 0, results: {} }, operationId = '';
  try {
    const raw = await request.text();
    if (raw.length > 16000) return reply({ error: '輸入過長。' }, 400);
    let b: { operationScope?: string; operationId?: string; operation?: string; minutes?: number; mode?: string; key?: string; model?: string; text?: string; target?: string; limits?: BudgetLimits; action?: Action };
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
    if (!['advance', 'intervene', 'direct', 'takeover', 'return-control', 'reset'].includes(b.operation || '')) return reply({ error: '無效操作。' }, 400);
    if (!['ai', 'openai', 'demo'].includes(b.mode || '')) return reply({ error: '模式無效。' }, 400);
    const limits = b.limits || defaultLimits;
    if (!Number.isInteger(limits.calls) || limits.calls < 3 || limits.calls > 120 || !Number.isInteger(limits.tokens) || limits.tokens < 1000 || limits.tokens > 500000) return reply({ error: '請設定每小時 3–120 次呼叫、1,000–500,000 token 的上限。' }, 400);
    if (b.operation === 'advance') {
      if (![15, 30].includes(b.minutes || 0)) return reply({ error: '請選擇 15 或 30 分鐘。' }, 400);
      if (b.mode !== 'demo' && (typeof b.model !== 'string' || !b.model.trim())) return reply({ error: '請填入模型 ID。' }, 400);
      if (b.mode === 'openai' && !directModels.includes(b.model || '')) return reply({ error: '請選擇網站支援的 OpenAI 模型。' }, 400);

    }
    const loaded = await loadWorld(id);
    let world = loaded.world;
    const version = loaded.version;
    if (typeof b.operationId !== 'string' || !/^\d{13}:[0-9a-f-]{36}$/.test(b.operationId)) return reply({ error: '請更新頁面，使用有效的操作識別碼。' }, 400);
    operationId = b.operationId;
    const issuedAt = Number(operationId.split(':')[0]);
    if (issuedAt > Date.now() + 60000) return reply({ error: '裝置時間不正確，請校正時間後重試。' }, 400);
    const stored = await database().prepare('SELECT operations FROM worlds WHERE owner = ?').bind(id).first<{operations:string}>();
    const serializedJournal = stored!.operations;
    journal = JSON.parse(serializedJournal);
    const previous = journal.results[operationId];
    if (previous && 'status' in previous) return settledReply(previous);
    if (previous && 'pending' in previous) {
      if (previous.pending > Date.now()) return waiting();
      await database().prepare('UPDATE worlds SET operations = json_set(operations, ?, json(?)) WHERE owner = ? AND json_extract(operations, ?) = ?')
        .bind(`$.results."${operationId}"`, JSON.stringify(uncertainResult), id, `$.results."${operationId}".pending`, previous.pending).run();
      const latest = await database().prepare('SELECT operations FROM worlds WHERE owner = ?').bind(id).first<{operations:string}>();
      const settled = latest && (JSON.parse(latest.operations) as Journal).results[operationId];
      if (settled && 'status' in settled) return settledReply(settled);
      return reply(uncertainResult.body, uncertainResult.status);
    }
    if (issuedAt <= journal.floor || issuedAt < Date.now() - 86400000) return reply({ error: '操作識別碼已超過保留範圍；請重新讀取世界後再決定是否建立新操作。', operationExpired: true }, 410);
    trimJournal(journal, 7);
    if (b.operation === 'advance' && b.mode !== 'demo') await readModelKey(id, b.mode === 'openai' ? 'openai' : 'openrouter');

    normalizeWorld(world);
    const initialUsage = world.aiUsage && { ...world.aiUsage };
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
    journal.results[operationId] = { pending: lease };
    const pendingJournal = JSON.stringify(journal);
    const acquired = await db.prepare('UPDATE worlds SET locked_until = ?, operations = ? WHERE owner = ? AND locked_until < ? AND version = ? AND operations = ?').bind(lease, JSON.stringify(journal), id, Date.now(), version, serializedJournal).run();
    if (!acquired.meta.changes) return waiting();
    locked = true;
    let failure: Error | undefined;
    if (b.operation === 'takeover') {
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
        const reservation = b.mode === 'demo' ? undefined : await reserveDailyUsage(id, world.characters.filter(c => c.control?.mode !== 'taken-over' && !c.control?.pending && !c.control?.active).length, lease);
        try {
        await advanceActivities(world, {
          minutes: b.minutes!, mode: b.mode!, modelKey: b.mode === 'demo' ? 'demo' : `${b.mode}:${b.model}`,
          limits,
          beforeDecision: async () => {
            const held = await db.prepare('SELECT locked_until FROM worlds WHERE owner = ?').bind(id).first<{locked_until:number}>();
            if (held?.locked_until !== lease || lease <= Date.now()) throw Error('世界租約已到期，本回合停止新的模型呼叫。');
            dispatchKey = await readModelKey(id, b.mode === 'openai' ? 'openai' : 'openrouter'); },
          decide: (w, c, onUsage) => aiDecision(w, c, dispatchKey, b.model!.trim(), b.mode === 'openai' ? 'openai' : 'openrouter', fetch, onUsage, () => reservation!.dispatch()),
        });
        } finally { await reservation?.release(); }
      } catch (e) {
        // Roll back the incomplete round, but retain paid attempts and reported tokens.
        const usage = world.aiUsage;
        if (usage) usage.savedDecisions = before.aiUsage?.savedDecisions || 0;
        Object.assign(world, before, { aiUsage: usage });
        failure = e instanceof Error ? e : new Error('模型決策失敗，本回合沒有推進。');
      }
    }
    const usage = currentUsage(world);
    const result: OperationResult = failure
      ? { status: (failure instanceof BudgetExceeded || failure instanceof DailyLimitExceeded) ? 429 : 502, body: { world, version: version + 1, error: failure.name === 'TimeoutError' ? '模型回應逾時，本回合沒有推進。呼叫次數已記錄。' : failure.message, limitReached: failure instanceof BudgetExceeded || failure instanceof DailyLimitExceeded, dailyLimitReached: failure instanceof DailyLimitExceeded } }
      : { status: 200, body: { world, version: version + 1, limitReached: b.mode !== 'demo' && (usage.calls >= limits.calls || usage.inputTokens + usage.outputTokens >= limits.tokens) } };
    result.body.dailyUsage = await dailyUsage(id).catch(() => null);
    journal.results[operationId] = result;
    // The current exact response may exceed the historical byte budget by itself.
    trimJournal(journal, 8, operationId);
    const saved = await db.prepare('UPDATE worlds SET state = ?, version = version + 1, locked_until = 0, operations = ? WHERE owner = ? AND version = ? AND locked_until = ? AND locked_until > ? AND operations = ?').bind(JSON.stringify(world), JSON.stringify(journal), id, version, lease, Date.now(), pendingJournal).run();
    if (!saved.meta.changes) {
      await retainPaidUsage(db, id, initialUsage, world.aiUsage);
      throw Error('儲存衝突，請重新載入再試。');
    }
    return settledReply(result);
  } catch (e) {
    if (locked && operationId) {
      const result: OperationResult = { status: 502, body: { error: e instanceof Error ? e.message : '操作失敗，請重新讀取世界。' } };
      try {
        await database().prepare('UPDATE worlds SET operations = json_set(operations, ?, json(?)) WHERE owner = ? AND json_extract(operations, ?) = ?')
          .bind(`$.results."${operationId}"`, JSON.stringify(result), id, `$.results."${operationId}".pending`, lease).run();
        const row = await database().prepare('SELECT operations FROM worlds WHERE owner = ?').bind(id).first<{operations:string}>();
        const settled = row && (JSON.parse(row.operations) as Journal).results[operationId];
        if (settled && 'status' in settled) return settledReply(settled);
      } catch { /* Durable pending blocks re-execution even when storage is unavailable. */ }
      return reply(uncertainResult.body, uncertainResult.status);
    }
    if (e instanceof ModelKeyError) return reply({ error: e.message }, e.status);
    return reply({ error: e instanceof Error ? e.message : '操作失敗，請稍後再試。' }, 502);
  } finally {
    if (locked) try { await database().prepare('UPDATE worlds SET locked_until = 0 WHERE owner = ? AND locked_until = ?').bind(id, lease).run(); } catch { /* Lease expires; the operation remains durable. */ }
  }
}

