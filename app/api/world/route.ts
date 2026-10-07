import { getChatGPTUser } from '@/app/chatgpt-auth';
import { loadWorld, database } from '@/lib/store';
import { record } from '@/lib/world';
import { aiDecision, directModels } from '@/lib/models';
import { advanceActivities, BudgetExceeded, currentUsage, defaultLimits, type BudgetLimits } from '@/lib/activities';

export const dynamic = 'force-dynamic';
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const owner = async () => (await getChatGPTUser())?.userId;

export async function GET() {
  const id = await owner();
  if (!id) return reply({ error: '網站登入尚未完成，請按「用 ChatGPT 重新登入」。', signInRequired: true }, 401);
  try {
    const loaded = await loadWorld(id);
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
    const b = JSON.parse(raw) as { operation?: string; minutes?: number; mode?: string; key?: string; model?: string; text?: string; target?: string; limits?: BudgetLimits };
    if (!['advance', 'intervene'].includes(b.operation || '')) return reply({ error: '無效操作。' }, 400);
    if (!['ai', 'openai', 'demo'].includes(b.mode || '')) return reply({ error: '模式無效。' }, 400);
    const limits = b.limits || defaultLimits;
    if (!Number.isInteger(limits.calls) || limits.calls < 3 || limits.calls > 120 || !Number.isInteger(limits.tokens) || limits.tokens < 1000 || limits.tokens > 500000) return reply({ error: '請設定每小時 3–120 次呼叫、1,000–500,000 token 的上限。' }, 400);
    if (b.operation === 'advance') {
      if (![15, 30].includes(b.minutes || 0)) return reply({ error: '請選擇 15 或 30 分鐘。' }, 400);
      if (b.mode !== 'demo' && (typeof b.key !== 'string' || !b.key.trim() || typeof b.model !== 'string' || !b.model.trim())) return reply({ error: '請填入 API Key 與模型 ID。' }, 400);
      if (b.mode === 'openai' && !directModels.includes(b.model || '')) return reply({ error: '請選擇網站支援的 OpenAI 模型。' }, 400);
    }
    const { world, version } = await loadWorld(id);
    if (b.operation === 'intervene' && (typeof b.text !== 'string' || !b.text.trim() || b.text.length > 500 || (!world.characters.some(c => c.id === b.target) && b.target !== 'all'))) return reply({ error: '請填入 1–500 字的事件，並選擇對象。' }, 400);
    const db = database();
    lease = Date.now() + 120000;
    const acquired = await db.prepare('UPDATE worlds SET locked_until = ? WHERE owner = ? AND locked_until < ? AND version = ?').bind(lease, id, Date.now(), version).run();
    if (!acquired.meta.changes) return reply({ error: '世界正處理另一個回合，請稍候再試。' }, 409);
    locked = true;
    let failure: Error | undefined;
    if (b.operation === 'intervene') {
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
    if (!saved.meta.changes) throw Error('儲存衝突，請重新載入再試。');
    if (failure) return reply({ world, version: version + 1, error: failure.name === 'TimeoutError' ? '模型回應逾時，本回合沒有推進。呼叫次數已記錄。' : failure.message, limitReached: failure instanceof BudgetExceeded }, failure instanceof BudgetExceeded ? 429 : 502);
    const usage = currentUsage(world);
    return reply({ world, version: version + 1, limitReached: b.mode !== 'demo' && (usage.calls >= limits.calls || usage.inputTokens + usage.outputTokens >= limits.tokens) });
  } catch (e) {
    return reply({ error: e instanceof Error ? e.message : '操作失敗，請稍後再試。' }, 502);
  } finally {
    if (locked) await database().prepare('UPDATE worlds SET locked_until = 0 WHERE owner = ? AND locked_until = ?').bind(id, lease).run();
  }
}
