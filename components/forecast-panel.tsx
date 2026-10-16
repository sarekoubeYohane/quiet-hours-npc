'use client';
import { useEffect, useRef, useState } from 'react';
import { costSummary, type CostEstimate, type ModelPrice } from '@/lib/costs';
import type { AIUsage } from '@/lib/world';

type Sample = { at: number; minute: number; cost: CostEstimate };
const windowMs = 10 * 60 * 1000;

// Samples come only from completed world advances during this foreground run.
// The immutable cumulative API ledger makes repeated reads/replays cost-neutral.
export default function ForecastPanel({ usage, minute, automatic, provider, model, price }: {
  usage: AIUsage; minute: number; automatic: boolean; provider: string; model: string; price?: ModelPrice;
}) {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [clock, setClock] = useState(0);
  const running = useRef(false), lastMinute = useRef(minute);
  useEffect(() => {
    if (!automatic) return;
    // Expire stale evidence even while a long request has not finished. Stopping
    // the timer freezes the paused hypothetical rather than accruing idle time.
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [automatic]);
  useEffect(() => {
    if (!automatic) { running.current = false; return; }
    const next = { at: Date.now(), minute, cost: costSummary(usage).total };
    if (!running.current) {
      running.current = true; lastMinute.current = minute; setSamples([next]); return;
    }
    if (minute === lastMinute.current) return;
    const reset = minute < lastMinute.current;
    lastMinute.current = minute;
    setSamples(previous => {
      const first = previous[0];
      // A reset/clock correction or another model's dispatch is not comparable.
      const incompatible = first && next.cost.cohorts.some(c => {
        const before = first.cost.cohorts.find(p => p.provider === c.provider && p.model === c.model && p.price?.id === c.price?.id);
        return c.calls > (before?.calls || 0) && (c.provider !== provider || c.model !== model || c.price?.id !== price?.id);
      });
      if (reset || !first || next.at <= previous[previous.length - 1].at || next.cost.calls < first.cost.calls || next.cost.knownUsd < first.cost.knownUsd || next.cost.unknownCalls < first.cost.unknownCalls || incompatible) return [next];
      return [...previous.filter(s => s.at >= next.at - windowMs), next];
    });
  }, [automatic, minute, usage, provider, model, price]);
  const recent = samples.filter(s => s.at >= clock - windowMs);
  const first = recent[0], last = recent[recent.length - 1];
  const elapsed = first && last ? last.at - first.at : 0;
  const ready = recent.length >= 3 && elapsed >= 30000;
  const unknown = first && last ? last.cost.unknownCalls - first.cost.unknownCalls : 0;
  const partial = !price || !Number.isFinite(unknown) || unknown > 0;
  const amount = ready ? (last.cost.knownUsd - first.cost.knownUsd) * 3600000 / elapsed : NaN;
  const value = Number.isFinite(amount) ? Number(amount.toPrecision(2)).toLocaleString('en-US', { maximumSignificantDigits: 2 }) : null;
  return <section className="panel" style={{ padding: 20 }} aria-label="未來一小時費用推估">
    <h2>再持續運行一小時的預估新增費用</h2>
    <p>{!ready || value === null ? '資料不足：需同一設定下至少 2 個完成回合及 30 秒有效運行時間。' : partial ? amount > 0 ? `部分估算：預估新增 USD ${value}（僅已知小計）；單價或用量不完整，無法完整推估。` : '無法完整推估：單價或用量未知，不代表免費。' : `玩家預估新增 USD ${value}（估算，並非已發生費用）`}</p>
    <p>採樣 {Math.round(elapsed / 1000)} 秒 · {Math.max(0, recent.length - 1)} 個完成回合；最近 10 分鐘內本次前景自動運行的樣本，含正常等待間隔。</p>
    {!automatic && <p>假設恢復後持續運行；目前已暫停，沒有繼續累積採樣時間。</p>}
    <p className="usage-note">假設以目前供應商、模型、單價及推進節奏再運行一小時，角色決策頻率仍可能改變；玩家預算、站主服務限制或故障可能提前停止，並非保證扣款。站主服務費用未知，另外計量，不含於玩家推估。手動模式不累積速度樣本；恢復、重新載入或設定變更後重新採樣。推估只提供資訊，不改變預算、用量或運行控制。</p>
  </section>;
}
