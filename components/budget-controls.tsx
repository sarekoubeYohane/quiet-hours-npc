'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { validBudgetLimits, type BudgetLimits } from '@/lib/activities';

const choices = { calls: [3,6,12,24,48,120,240,600,1200], tokens: [1000,10000,30000,60000,120000,500000,1000000,5000000,10000000] };
const label = (value: number | null) => value === null ? '無上限' : value.toLocaleString();
function budgetDraft(limits: BudgetLimits) {
  return {
    draft: { calls: limits.calls === null ? 'unlimited' : choices.calls.includes(limits.calls) ? String(limits.calls) : 'custom', tokens: limits.tokens === null ? 'unlimited' : choices.tokens.includes(limits.tokens) ? String(limits.tokens) : 'custom' },
    custom: { calls: String(limits.calls ?? ''), tokens: String(limits.tokens ?? '') },
  };
}
export default function BudgetControls({ limits, automatic, disabled, onApply }: {
  limits: BudgetLimits; automatic: boolean; disabled: boolean; onApply: (limits: BudgetLimits) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(() => budgetDraft(limits).draft);
  const [custom, setCustom] = useState(() => budgetDraft(limits).custom);
  const [error, setError] = useState('');
  const cancel = () => {
    const current = budgetDraft(limits);
    setDraft(current.draft);setCustom(current.custom);setError('');
  };
  async function apply() {
    const value = (kind: 'calls' | 'tokens') => {
      if (draft[kind] === 'unlimited') return null;
      const raw = draft[kind] === 'custom' ? custom[kind] : draft[kind];
      return /^\d+$/.test(raw) ? Number(raw) : NaN;
    };
    const next = { calls: value('calls'), tokens: value('tokens') };
    if (!validBudgetLimits(next)) { setError('請輸入大於 0 的安全整數；空白、負數、小數或過大數字無法套用。');return; }
    if (automatic && ((limits.calls !== null && next.calls === null) || (limits.tokens !== null && next.tokens === null)) && !window.confirm('解除玩家用量限制並繼續自動運行？可能持續產生 API 費用，站主服務預算仍然有效。')) return;
    setError('');await onApply(next);
  }
  return <div aria-label="玩家預算設定">
    <div className="automation-fields">{(['calls','tokens'] as const).map(kind => <label key={kind}>{kind === 'calls' ? '每小時 AI 呼叫上限' : '每小時 token 停止門檻'}
      <select aria-label={kind === 'calls' ? '每小時 AI 呼叫上限' : '每小時 token 停止門檻'} value={draft[kind]} disabled={disabled} onChange={event=>setDraft({...draft,[kind]:event.target.value})}>
        {choices[kind].map(value=><option key={value} value={value}>{value.toLocaleString()}{kind==='calls'?' 次':''}</option>)}<option value="custom">自訂</option><option value="unlimited">無上限</option>
      </select>
      {draft[kind]==='custom'&&<input aria-label={kind==='calls'?'自訂呼叫上限':'自訂 token 門檻'} inputMode="numeric" value={custom[kind]} disabled={disabled} onChange={event=>setCustom({...custom,[kind]:event.target.value})}/>}
    </label>)}</div>
    <p className="usage-note">有效玩家預算：每小時 {label(limits.calls)} 次呼叫 ／ {label(limits.tokens)} tokens。草稿須按套用才生效。</p>
    {error&&<p role="alert">{error}</p>}
    <Button disabled={disabled} onClick={()=>void apply()}>套用玩家預算</Button> <Button variant="ghost" disabled={disabled} onClick={cancel}>取消預算變更</Button>
  </div>;
}
