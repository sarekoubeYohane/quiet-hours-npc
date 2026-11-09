'use client';
import {useEffect,useState} from 'react';
import {useOriginalAccountScope} from './use-original-account-scope';
import BudgetControls from './budget-controls';
import CostPanel from './cost-panel';
import {Button} from './ui/button';
import type {PlayerAccountView} from '@/lib/player-account-budget';
import type {BudgetLimits} from '@/lib/activities';
import type {PriceInput} from '@/lib/costs';
export default function PlayerAccountSettings({owner}:{owner:string}){
 const {capture,scoped}=useOriginalAccountScope(owner);
 const [view,setView]=useState<PlayerAccountView>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function read(){try{const response=await fetch(scoped('/api/player-budget','operationScope'));const value=await response.json() as PlayerAccountView&{error?:string};if(!response.ok)throw Error(value.error);capture(value.accountOwner);setView(value);setError('');}catch(cause){setError(cause instanceof Error?cause.message:'帳號預算尚未同步。');}}
 useEffect(()=>{let active=true;fetch(scoped('/api/player-budget','operationScope')).then(async response=>{const value=await response.json() as PlayerAccountView&{error?:string};if(!response.ok)throw Error(value.error);if(active){capture(value.accountOwner);setView(value);}}).catch(cause=>{if(active)setError(cause instanceof Error?cause.message:'帳號預算尚未同步。');});return()=>{active=false;};},[capture,scoped]);
 async function save(input:{limits?:BudgetLimits;price?:PriceInput}){
  if(!view)return false;setBusy(true);setError('');setNotice('');
  try{const response=await fetch('/api/player-budget',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:view.version,operationScope:view.accountOwner,...input})});const value=await response.json() as PlayerAccountView&{error?:string};if(!response.ok)throw Error(value.error);capture(value.accountOwner);setView(value);setNotice('帳號玩家預算與價格已保存；沒有派送模型。');return true;}catch(cause){setError(cause instanceof Error?cause.message:'未同步：原設定輸入仍保留，可恢復保存。');return false;}finally{setBusy(false);}
 }
 return <section className="panel space-y-4" aria-label="帳號玩家預算與用量"><h2>帳號玩家預算與用量</h2><p>所有存檔與人物製作共用。切換、新開、另存或刪除故事不清除已發生費用；只有新的計量小時才重新開始。</p>
 {view&&<><p role="status">帳號本小時：{view.usage.calls} 次 AI 呼叫；已回報 {view.usage.inputTokens+view.usage.outputTokens} tokens。累計 {view.usage.totalCalls} 次；未收到供應商用量 {view.usage.totalUnknownCalls} 次。</p><BudgetControls key={'budget:'+view.version} limits={view.limits} automatic={false} disabled={busy} onApply={limits=>save({limits})}/><CostPanel key={'price:'+view.version} usage={view.usage} prices={view.prices} provider="openai" model="gpt-6.1-sol" disabled={busy} unresolvedUsageRecovery={view.unknownAccountingRanges>0} onApply={price=>save({price})}/></>}
 {notice&&<p role="status">{notice}</p>}{error&&<p role="alert">未同步：{error} 原輸入仍保留。</p>}<Button variant="outline" disabled={busy} onClick={()=>void read()}>重新讀取帳號預算</Button></section>;
}
