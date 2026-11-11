'use client';
import {boundPath} from '@/lib/bound-navigation';
import Link from 'next/link';
import { useEffect,useState } from 'react';
import type { WorldSave } from '@/lib/world-saves';
import type { EnvironmentView } from '@/lib/environment';
import SaveActions,{SaveOperationRecovery} from './save-actions';
import type {AccountUsageSummary} from '@/lib/save-management';
import SaveNavigation from './save-navigation';
import SiteHeader from './site-header';
import {worldClock} from '@/lib/world-clock';
export default function SavePicker({displayName,environment,owner,accountChanged=false}:{owner:string;accountChanged?:boolean;displayName:string;environment:EnvironmentView}) {
  const [saves,setSaves]=useState<WorldSave[]>(),[error,setError]=useState(''),[accountScope,setAccountScope]=useState(owner),[usage,setUsage]=useState<AccountUsageSummary>(),[drafts,setDrafts]=useState<{id:string;name:string;step:number}[]>([]),[draftError,setDraftError]=useState('');
  useEffect(()=>{
    const abort=new AbortController();
    async function load(){try{const response=await fetch('/api/saves?operationScope='+encodeURIComponent(owner),{credentials:'same-origin',signal:abort.signal});const value=await response.json() as {saves:WorldSave[];operationScope:string;accountUsage:AccountUsageSummary;error?:string};if(!response.ok||value.operationScope!==owner)throw Error(value.error||'無法讀取存檔。');if(!abort.signal.aborted){setSaves(value.saves);setAccountScope(value.operationScope);setUsage(value.accountUsage);}}catch(error){if(!abort.signal.aborted)setError(error instanceof Error?error.message:'無法讀取存檔。');}}
    const changed=()=>void load();void load();void fetch('/api/opening-drafts?operationScope='+encodeURIComponent(owner),{signal:abort.signal}).then(async response=>{const body=await response.json() as {operationScope?:string;error?:string;drafts?:{id:string;name:string;step:number}[]};if(!response.ok||body.operationScope!==owner)throw Error(body.error||'無法讀取開局草稿。');if(!abort.signal.aborted)setDrafts(body.drafts??[]);}).catch(cause=>{if(!abort.signal.aborted)setDraftError(cause instanceof Error?cause.message:'無法讀取開局草稿。');});window.addEventListener('quiet-hours:saves-changed',changed);
    return()=>{abort.abort();window.removeEventListener('quiet-hours:saves-changed',changed);};
  },[owner]);
  return <main className="save-home"><SiteHeader environment={environment} displayName={displayName}/>
    <SaveNavigation owner={owner}/><h1 className="page-title">你的世界</h1>{accountChanged&&<p role="alert">登入帳號已變更，原世界仍屬原帳號；請切回原帳號，或在此重新選檔。</p>}{accountScope&&<SaveOperationRecovery accountScope={accountScope}/>}
    {usage&&<details className="account-usage"><summary>帳號模型用量 · {usage.totalCalls} 次呼叫</summary><p aria-label="帳號累計模型用量">帳號累計：{usage.totalCalls} 次模型呼叫 · 已知費用 USD {usage.knownUsd.toFixed(6)}{usage.unknownCostCalls?` · ${usage.unknownCostCalls} 次費用未完整確定`:''}{usage.unknownAccountingRanges?' · 模型費用仍有未能核對的紀錄':''}。刪除存檔仍保留實際用量。</p></details>}
    {saves?.length===0&&drafts.length===0&&!draftError&&<section className="panel welcome-panel"><span className="eyebrow">從一個人物，開始一段生活</span><h2>歡迎來到 NPC 觀察室</h2><p>準備人物，安排生活的地方，再看看他們會如何度過每一天。</p><ol className="welcome-steps"><li><b>01</b><strong>準備人物</strong><span>撰寫設定，確認人物卡</span></li><li><b>02</b><strong>場景與安排</strong><span>選擇場所，安排生活起點</span></li><li><b>03</b><strong>核對並開始</strong><span>保存世界，從第 0 回合觀察</span></li></ol><Link className="journey-primary-link" href={boundPath('/new',owner)}>建立第一個世界 →</Link><p className="hint">製作新人物需要模型與 API Key；可以先保存草稿，稍後繼續。</p></section>}
    {(drafts.length>0||draftError)&&<section className="panel draft-list" aria-label="建立中的開局"><h2>繼續準備世界</h2><p className="hint">這些開局已保存在帳號，還沒有開始生活。</p>{draftError&&<p role="alert">{draftError}</p>}{drafts.map(draft=><article key={draft.id}><Link href={boundPath('/new',owner,{draft:draft.id})}>接續 {draft.name||'未命名開局'}</Link><p className="hint">{draft.step===1?'準備人物':draft.step<=3?'場景與安排':'核對並開始'} · 草稿已保存</p></article>)}</section>}
    {(saves?.length!==0||error)&&<section className="panel saved-worlds" aria-label="選擇存檔"><p>選擇要繼續的世界。選檔不會推進時間。</p>
      {error&&<p role="alert">{error}</p>}{!error&&!saves&&<p role="status">正在讀取存檔…</p>}
      {saves?.length===0&&<p>尚無世界存檔。從「＋新開存檔」開始建立第一份世界。</p>}
      {saves?.map(save=><article key={save.id}><h2>{save.name}</h2><p>{worldClock(save.minute)} · 已走過 {save.turn} 個回合</p><Link className="journey-primary-link" href={boundPath('/observe',owner,{save:save.id})}>繼續 {save.name}</Link>{save.savedFrom&&<p>另存來源：{save.savedFrom.name}，第 {save.savedFrom.turn} 回合（{worldClock(save.savedFrom.minute)}）。此為當時進度，不是原始開局。</p>}<details className="save-management"><summary>另存、重新開始與管理</summary>{accountScope&&<SaveActions save={save} accountScope={accountScope}/>}<hr/>{save.originalOpeningAvailable&&<Link href={boundPath('/new',owner,{restart:save.id})}>從 {save.name} 的原始開局重新開始</Link>}{!save.originalOpeningAvailable&&<p>原始開局不可用；既有進度仍可續玩。</p>}</details></article>)}
    </section>}</main>;
}
