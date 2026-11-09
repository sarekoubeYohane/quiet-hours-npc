'use client';
import Link from 'next/link';
export default function SaveNavigation({saveId,onNavigate}:{saveId?:string;onNavigate?:()=>void}) {
  const query=saveId?'?save='+encodeURIComponent(saveId):'';
  return <nav className="world-navigation" aria-label="共同導覽" style={{display:'flex',gap:16,flexWrap:'wrap',alignItems:'center'}} onClick={onNavigate}>
    <Link href="/">存檔</Link>
    <Link href={'/character-templates'+query}>人物</Link>
    <Link href={'/scene-templates'+query}>場景</Link>
    {saveId?<><Link href={'/observe'+query}>觀察</Link><Link href={'/observe'+query+'&view=analysis'}>分析</Link><Link href={'/observe'+query+'&view=settings'}>設定</Link></>:<><span aria-disabled="true">觀察（請先選檔）</span><span aria-disabled="true">分析（請先選檔）</span><Link href="/settings">設定</Link></>}
    <Link href="/new" style={{marginLeft:'auto'}}>＋新開存檔</Link>
  </nav>;
}
