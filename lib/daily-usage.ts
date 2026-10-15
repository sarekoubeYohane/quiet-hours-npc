import { env } from 'cloudflare:workers';

export const DAILY_LIMIT = 144;
export type DailyUsage = { day: string; limit: number; used: number; reserved: number; remaining: number };
export class DailyLimitExceeded extends Error {
  constructor() { super('今日剩餘模型次數不足以完成一個回合。自動推進已暫停；可稍後重試或選擇規則模式。每日上限於台北午夜重置。'); }
}
function ledger() {
  if (!env.USAGE_DB) throw Error('每日用量帳本尚未設定，暫停模型請求；可選擇規則模式。');
  return env.USAGE_DB;
}
function taipeiDay(now = Date.now()) {
  return new Date(now + 8 * 3600000).toISOString().slice(0, 10);
}
export async function dailyUsage(owner: string): Promise<DailyUsage> {
  const day = taipeiDay();
  const row = await ledger().prepare(`SELECT coalesce(sum(used), 0) AS used,
    coalesce(sum(CASE WHEN expires_at > unixepoch() * 1000 THEN remaining ELSE 0 END), 0) AS reserved
    FROM daily_usage_reservations WHERE owner = ? AND day = ?`).bind(owner, day).first<{ used: number; reserved: number }>();
  const used = row?.used ?? 0, reserved = row?.reserved ?? 0;
  return { day, limit: DAILY_LIMIT, used, reserved, remaining: Math.max(0, DAILY_LIMIT - used - reserved) };
}

// Single-statement admission serializes competing environments in the shared D1.
// Each worker owns a unique reservation; retries never reuse another worker's budget.
export async function reserveDailyUsage(owner: string, count: number, expiresAt: number) {
  const db = ledger();
  let id = '', day = '', remaining = count;
  async function reserve() {
    const now = Date.now();
    if (now >= expiresAt) throw Error('世界租約已到期，停止新的模型呼叫。');
    day = taipeiDay(now); id = crypto.randomUUID();
    const result = await db.prepare(`INSERT INTO daily_usage_reservations (id, owner, day, remaining, expires_at)
      SELECT ?, ?, ?, ?, ? WHERE ? + (
        SELECT coalesce(sum(used + CASE WHEN expires_at > unixepoch() * 1000 THEN remaining ELSE 0 END), 0)
        FROM daily_usage_reservations WHERE owner = ? AND day = ?
      ) <= ?`).bind(id, owner, day, remaining, expiresAt, remaining, owner, day, DAILY_LIMIT).run();
    if (!result.meta.changes) throw new DailyLimitExceeded();
  }
  async function release() {
    if (id) await db.prepare('UPDATE daily_usage_reservations SET remaining = 0 WHERE id = ?').bind(id).run();
  }
  if (count > 0) await reserve();
  return {
    async dispatch() {
      if (remaining <= 0) throw new DailyLimitExceeded();
      if (day !== taipeiDay()) { await release(); await reserve(); }
      // Admission and consumption use database execution time, not a stale
      // Worker timestamp captured before a queued SQL statement runs.
      while (true) {
        const result = await db.prepare(`UPDATE daily_usage_reservations SET used = used + 1, remaining = remaining - 1
          WHERE id = ? AND remaining > 0 AND expires_at > unixepoch() * 1000`).bind(id).run();
        if (!result.meta.changes) throw Error('用量預留已到期，停止新的模型呼叫。');
        const now = Date.now();
        if (now < expiresAt && day === taipeiDay(now)) break;
        // Fetch has not run: this known-unsent attempt can be refunded. If the
        // database outcome is ambiguous, stop; never dispatch on uncertainty.
        await db.prepare('UPDATE daily_usage_reservations SET used = used - 1 WHERE id = ? AND used > 0').bind(id).run();
        await release();
        if (now >= expiresAt) throw Error('世界租約已到期，停止新的模型呼叫。');
        await reserve();
      }
      remaining--;
    },
    release,
  };
}
