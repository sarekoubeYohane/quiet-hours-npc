'use client';
import Link from 'next/link';
import { useEffect,useState } from 'react';
import type { WorldSave } from '@/lib/world-saves';
import type { EnvironmentView } from '@/lib/environment';
import SaveActions,{SaveOperationRecovery} from './save-actions';
import type {AccountUsageSummary} from '@/lib/save-management';
import SaveNavigation from './save-navigation';
export default function SavePicker({displayName,environment}:{displayName:string;environment:EnvironmentView}) {
  const [saves,setSaves]=useState<WorldSave[]>(),[error,setError]=useState(''),[accountScope,setAccountScope]=useState(''),[usage,setUsage]=useState<AccountUsageSummary>(),[drafts,setDrafts]=useState<{id:string;name:string;step:number}[]>([]),[draftError,setDraftError]=useState('');
  useEffect(()=>{
    const abort=new AbortController();
    async function load(){try{const response=await fetch('/api/saves',{credentials:'same-origin',signal:abort.signal});const value=await response.json() as {saves:WorldSave[];operationScope:string;accountUsage:AccountUsageSummary;error?:string};if(!response.ok)throw Error(value.error||'無法讀取存檔。');if(!abort.signal.aborted){setSaves(value.saves);setAccountScope(value.operationScope);setUsage(value.accountUsage);}}catch(error){if(!abort.signal.aborted)setError(error instanceof Error?error.message:'無法讀取存檔。');}}
    const changed=()=>void load();void load();void fetch('/api/opening-drafts',{signal:abort.signal}).then(async response=>{const body=await response.json() as {error?:string;drafts?:{id:string;name:string;step:number}[]};if(!response.ok)throw Error(body.error||'無法讀取開局草稿。');if(!abort.signal.aborted)setDrafts(body.drafts??[]);}).catch(cause=>{if(!abort.signal.aborted)setDraftError(cause instanceof Error?cause.message:'無法讀取開局草稿。');});window.addEventListener('quiet-hours:saves-changed',changed);
    return()=>{abort.abort();window.removeEventListener('quiet-hours:saves-changed',changed);};
  },[]);
  return <main><header className="topbar"><h1>世界存檔</h1><div>{environment.caption} · {displayName}<form method="post" action="/api/auth/logout"><button type="submit">登出</button></form></div></header>
    <SaveNavigation/>{accountScope&&<SaveOperationRecovery accountScope={accountScope}/>}
    {usage&&<p aria-label="帳號累計模型用量">帳號累計：{usage.totalCalls} 次模型呼叫 · 已知費用 USD {usage.knownUsd.toFixed(6)}{usage.unknownCostCalls?` · ${usage.unknownCostCalls} 次費用未完整確定`:''}{usage.unknownAccountingRanges?' · 模型費用仍有未能核對的紀錄':''}。刪除存檔仍保留實際用量。</p>}
    <section className="panel" style={{padding:24}} aria-label="建立中的開局"><h2>建立中</h2>{draftError&&<p role="alert">{draftError}</p>}{drafts.map(draft=><article key={draft.id}><Link href={'/new?draft='+draft.id}>接續 {draft.name||'未命名開局'}</Link><p>第 {draft.step} 步，尚未開始世界生活。</p></article>)}</section>
    <section className="panel" style={{padding:24}} aria-label="選擇存檔"><p>選擇要繼續的世界。選檔不會推進時間。</p>
      {error&&<p role="alert">{error}</p>}{!error&&!saves&&<p role="status">正在讀取存檔…</p>}
      {saves?.length===0&&<p>尚無世界存檔。從「＋新開存檔」開始建立第一份世界。</p>}
      {saves?.map(save=><article key={save.id}><h2>{save.name}</h2><p>已走過 {save.turn} 個回合 · 世界時間 {save.minute} 分鐘</p><Link className="auth-link" href={'/observe?save='+encodeURIComponent(save.id)}>繼續 {save.name}</Link>{save.savedFrom&&<p>另存來源：{save.savedFrom.name}，第 {save.savedFrom.turn} 回合／{save.savedFrom.minute} 分鐘。此為當時進度，不是原始開局。</p>}{accountScope&&<SaveActions save={save} accountScope={accountScope}/>}<hr/>{save.originalOpeningAvailable&&<Link href={'/new?restart='+encodeURIComponent(save.id)}>從 {save.name} 的原始開局重新開始</Link>}{!save.originalOpeningAvailable&&<p>原始開局不可用；既有進度仍可續玩。</p>}</article>)}
    </section></main>;
}
