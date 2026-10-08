import { getChatGPTUser } from '@/app/chatgpt-auth';
import { loadWorld, database } from '@/lib/store';
import { record, normalizeWorld, resolve, type Action, type AIUsage } from '@/lib/world';
import { aiDecision, directModels } from '@/lib/models';
import { advanceActivities, BudgetExceeded, currentUsage, defaultLimits, type BudgetLimits } from '@/lib/activities';

export const dynamic = 'force-dynamic';
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const owner = async () => (await getChatGPTUser())?.userId;

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
  if (!id) return reply({ error: '網站登入尚未完成，請按「用 ChatGPT 重新登入」。', signInRequired: true }, 401);
  try {
    const loaded = await loadWorld(id);
    normalizeWorld(loaded.world);
    loaded.world.aiUsage = currentUsage(loaded.world);
    return reply(loaded);
  } catch { return reply({ error: '暫時無法讀取世界，請稍後重試。' }, 503); }
}

export async function POST(request: Request) {
  const id = await owner();
  if (!id) return reply({ error: '網站登入已失效，請重新登入。', signInRequired: true }, 401);
  if (request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: '請從觀察室操作。' }, 403);
  let locked = false, lease = 0;
  try {
    const raw = await request.text();
    if (raw.length > 16000) return reply({ error: '輸入過長。' }, 400);
    const b = JSON.parse(raw) as { operation?: string; minutes?: number; mode?: string; key?: string; model?: string; text?: string; target?: string; limits?: BudgetLimits; action?: Action };
    if (!['advance', 'intervene', 'direct', 'takeover', 'return-control'].includes(b.operation || '')) return reply({ error: '無效操作。' }, 400);
    if (!['ai', 'openai', 'demo'].includes(b.mode || '')) return reply({ error: '模式無效。' }, 400);
    const limits = b.limits || defaultLimits;
    if (!Number.isInteger(limits.calls) || limits.calls < 3 || limits.calls > 120 || !Number.isInteger(limits.tokens) || limits.tokens < 1000 || limits.tokens > 500000) return reply({ error: '請設定每小時 3–120 次呼叫、1,000–500,000 token 的上限。' }, 400);
    if (b.operation === 'advance') {
      if (![15, 30].includes(b.minutes || 0)) return reply({ error: '請選擇 15 或 30 分鐘。' }, 400);
      if (b.mode !== 'demo' && (typeof b.key !== 'string' || !b.key.trim() || typeof b.model !== 'string' || !b.model.trim())) return reply({ error: '請填入 API Key 與模型 ID。' }, 400);
      if (b.mode === 'openai' && !directModels.includes(b.model || '')) return reply({ error: '請選擇網站支援的 OpenAI 模型。' }, 400);
    }
    const { world, version } = await loadWorld(id);
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
    const acquired = await db.prepare('UPDATE worlds SET locked_until = ? WHERE owner = ? AND locked_until < ? AND version = ?').bind(lease, id, Date.now(), version).run();
    if (!acquired.meta.changes) return reply({ error: '世界正處理另一個回合，請稍候再試。' }, 409);
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
    } else if (b.operation === 'intervene') {
      const targets = b.target === 'all' ? world.characters.map(c => c.id) : [b.target!];
      const name = world.characters.find(c => c.id === b.target)?.name;
      record(world, 'observer', b.target === 'all' ? `共同事件：${b.text!.trim()}` : `觀察者對 ${name} 說：「${b.text!.trim()}」`, 'intervention', targets);
    } else {
      const before = structuredClone(world);
      try {
        await advanceActivities(world, {
          minutes: b.minutes!, mode: b.mode!, modelKey: b.mode === 'demo' ? 'demo' : `${b.mode}:${b.model}`,
          limits, decide: (w, c, onUsage) => aiDecision(w, c, b.key!.trim(), b.model!.trim(), b.mode === 'openai' ? 'openai' : 'openrouter', fetch, onUsage),
        });
      } catch (e) {
        // Roll back the incomplete round, but retain paid attempts and reported tokens.
        const usage = world.aiUsage;
        if (usage) usage.savedDecisions = before.aiUsage?.savedDecisions || 0;
        Object.assign(world, before, { aiUsage: usage });
        failure = e instanceof Error ? e : new Error('模型決策失敗，本回合沒有推進。');
      }
    }
    const saved = await db.prepare('UPDATE worlds SET state = ?, version = version + 1, locked_until = 0 WHERE owner = ? AND version = ? AND locked_until = ?').bind(JSON.stringify(world), id, version, lease).run();
    if (!saved.meta.changes) {
      await retainPaidUsage(db, id, initialUsage, world.aiUsage);
      throw Error('儲存衝突，請重新載入再試。');
    }
    if (failure) return reply({ world, version: version + 1, error: failure.name === 'TimeoutError' ? '模型回應逾時，本回合沒有推進。呼叫次數已記錄。' : failure.message, limitReached: failure instanceof BudgetExceeded }, failure instanceof BudgetExceeded ? 429 : 502);
    const usage = currentUsage(world);
    return reply({ world, version: version + 1, limitReached: b.mode !== 'demo' && (usage.calls >= limits.calls || usage.inputTokens + usage.outputTokens >= limits.tokens) });
  } catch (e) {
    return reply({ error: e instanceof Error ? e.message : '操作失敗，請稍後再試。' }, 502);
  } finally {
    if (locked) await database().prepare('UPDATE worlds SET locked_until = 0 WHERE owner = ? AND locked_until = ?').bind(id, lease).run();
  }
}
