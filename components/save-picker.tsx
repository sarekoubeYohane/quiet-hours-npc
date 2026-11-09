'use client';
import Link from 'next/link';
import { useEffect,useState } from 'react';
import type { WorldSave } from '@/lib/world-saves';
import type { EnvironmentView } from '@/lib/environment';
import SaveNavigation from './save-navigation';
export default function SavePicker({displayName,environment}:{displayName:string;environment:EnvironmentView}) {
  const [saves,setSaves]=useState<WorldSave[]>(),[error,setError]=useState('');
  useEffect(()=>{const abort=new AbortController();void fetch('/api/saves',{credentials:'same-origin',signal:abort.signal}).then(async response=>{const value=await response.json() as {saves:WorldSave[];error?:string};if(!response.ok)throw Error(value.error||'無法讀取存檔。');if(!abort.signal.aborted)setSaves(value.saves);}).catch(error=>{if(!abort.signal.aborted)setError(error.message);});return()=>abort.abort();},[]);
  return <main><header className="topbar"><h1>世界存檔</h1><div>{environment.caption} · {displayName}<form method="post" action="/api/auth/logout"><button type="submit">登出</button></form></div></header>
    <SaveNavigation/>
    <section className="panel" style={{padding:24}} aria-label="選擇存檔"><p>選擇要繼續的世界。選檔不會推進時間。</p>
      {error&&<p role="alert">{error}</p>}{!error&&!saves&&<p role="status">正在讀取存檔…</p>}
      {saves?.length===0&&<p>尚無世界存檔。你可以先準備人物與場景。</p>}
      {saves?.map(save=><article key={save.id}><h2>{save.name}</h2><p>已走過 {save.turn} 個回合 · 世界時間 {save.minute} 分鐘</p><Link className="auth-link" href={'/observe?save='+encodeURIComponent(save.id)}>繼續 {save.name}</Link>{!save.originalOpeningAvailable&&<p>原始開局不可用；既有進度仍可續玩。</p>}</article>)}
    </section></main>;
}
