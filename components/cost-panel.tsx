'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { costSummary, validPrice, type ModelPrice, type PriceInput, type CostEstimate } from '@/lib/costs';
import type { AIUsage } from '@/lib/world';
const usd=(value:number)=>`USD ${value.toLocaleString('en-US',{maximumSignificantDigits:8})}`;
function Estimate({label,value}:{label:string;value:CostEstimate}) {
  return <p>{label}：{value.complete?`估算 ${usd(value.knownUsd)}`:value.knownUsd>0?`部分估算：已知小計 ${usd(value.knownUsd)}`:'無法完整估算'}{!value.complete&&`；${value.unknownCalls} 次價格、快取單價或用量不完整`}</p>;
}
export default function CostPanel({usage,prices,provider,model,disabled,onApply,view='all'}:{view?:'all'|'settings'|'analysis';usage:AIUsage;prices:ModelPrice[];provider:'openai'|'openrouter';model:string;disabled:boolean;onApply:(price:PriceInput)=>Promise<boolean>}){
  const existing=prices.find(p=>p.provider===provider&&p.model===model);
  const defaults=()=>({provider,model,input:existing?String(existing.input):'',output:existing?String(existing.output):'',cachedInput:existing?.cachedInput===undefined?'':String(existing.cachedInput),source:existing?.source||'',date:existing?.date||new Date().toISOString().slice(0,10)});
  const [draft,setDraft]=useState(defaults),[error,setError]=useState('');
  const set=(key:keyof typeof draft,value:string)=>setDraft({...draft,[key]:value});
  const apply=async()=>{
    const amount=(text:string)=>text.trim()===''?NaN:Number(text);
    const price={...draft,input:amount(draft.input),output:amount(draft.output),cachedInput:draft.cachedInput.trim()===''?undefined:amount(draft.cachedInput)};
    if(!validPrice(price)){setError('請填寫供應商、模型、非負有限 USD 單價、來源與有效日期；空白不代表零。');return;}
    setError('');await onApply(price);
  };
  const summary=costSummary(usage);
  return <section className="panel automation" aria-label="已發生費用估算">
    <div hidden={view==='settings'}><h2>已發生費用估算</h2><Estimate label="玩家本小時已發生" value={summary.hour}/><Estimate label="玩家累計已發生" value={summary.total}/>
    <p className="usage-note">NPC 決策與世界裁定共用玩家預算，明細分開列出。這是本站已記錄聊天請求的 USD 估算，並非供應商完整帳單；不扣款，也不增加金額限制。站主共用服務另外計量：費用未知，請見站主用量。未回報快取拆分時按已回報輸入估算，可能未反映折扣；可辨識的快取若未填單價，僅顯示已知小計。</p>
    </div><details hidden={view==='analysis'} open={view==='settings'}><summary>自訂模型單價（USD／每百萬 tokens）</summary>
      <p>由你提供價格與來源，不會自動查價；儲存後只適用新請求，歷史價格保留。</p>
      <div className="automation-fields"><label>價格供應商<select aria-label="價格供應商" disabled={disabled} value={draft.provider} onChange={e=>set('provider',e.target.value)}><option value="openai">OpenAI</option><option value="openrouter">OpenRouter</option></select></label>
        <label>價格模型<input aria-label="價格模型" disabled={disabled} value={draft.model} onChange={e=>set('model',e.target.value)}/></label>
        {(['input','output','cachedInput'] as const).map((field)=><label key={field}>{field==='input'?'輸入單價':field==='output'?'輸出單價':'快取輸入單價（可留白）'}<input aria-label={field==='input'?'輸入 USD 單價':field==='output'?'輸出 USD 單價':'快取輸入 USD 單價'} inputMode="decimal" disabled={disabled} value={draft[field]} onChange={e=>set(field,e.target.value)}/></label>)}
        <label>價格來源<input aria-label="價格來源" disabled={disabled} value={draft.source} onChange={e=>set('source',e.target.value)}/></label><label>價格更新日期<input aria-label="價格更新日期" type="date" disabled={disabled} value={draft.date} onChange={e=>set('date',e.target.value)}/></label></div>
      {error&&<p role="alert">{error}</p>}<Button disabled={disabled} onClick={()=>void apply()}>保存自訂單價</Button> <Button variant="ghost" disabled={disabled} onClick={()=>{setDraft(defaults());setError('');}}>取消單價變更</Button>
      {prices.map(p=><p key={p.id}>{p.provider}／{p.model} · 自訂 · 輸入 {usd(p.input)}／輸出 {usd(p.output)}／快取 {p.cachedInput===undefined?'未知':usd(p.cachedInput)} 每百萬 tokens · 來源：{p.source} · 更新日期 {p.date}</p>)}
    </details>
    {summary.total.cohorts.length>0&&<details hidden={view==='settings'}><summary>已發生用量與當時價格依據</summary>{summary.total.cohorts.map((c,i)=><p key={i}>{c.task==='adjudication'?'世界裁定':'NPC 決策'} · {c.provider}／{c.model} · {c.calls} 次 · 輸入 {c.input}／輸出 {c.output} tokens（輸入含快取 {c.cachedInput}） · {c.price?`自訂：輸入 ${usd(c.price.input)}／輸出 ${usd(c.price.output)}／快取 ${c.price.cachedInput===undefined?'未知':usd(c.price.cachedInput)} 每百萬 tokens；來源 ${c.price.source}；更新日期 ${c.price.date}`:'當時價格未知'} · 已知小計 {usd(c.knownUsd)}{c.unknownCalls?`；${c.unknownCalls} 次部分未知`:''}</p>)}</details>}
  </section>;
}
