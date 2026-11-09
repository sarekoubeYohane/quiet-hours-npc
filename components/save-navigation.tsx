'use client';
import {boundPath} from '@/lib/bound-navigation';
import Link from 'next/link';
export default function SaveNavigation({saveId,onNavigate,owner}:{owner?:string;saveId?:string;onNavigate?:()=>void}) {
  const query=saveId?'?save='+encodeURIComponent(saveId):'';
  return <nav className="world-navigation" aria-label="共同導覽" style={{display:'flex',gap:16,flexWrap:'wrap',alignItems:'center'}} onClick={onNavigate}>
    <Link href="/">存檔</Link>
    <Link href={boundPath('/character-templates'+query,owner)}>人物</Link>
    <Link href={boundPath('/scene-templates'+query,owner)}>場景</Link>
    {saveId?<><Link href={boundPath('/observe'+query,owner)}>觀察</Link><Link href={boundPath('/observe'+query+'&view=analysis',owner)}>分析</Link><Link href={boundPath('/observe'+query+'&view=settings',owner)}>設定</Link></>:<><span aria-disabled="true">觀察（請先選檔）</span><span aria-disabled="true">分析（請先選檔）</span><Link href={boundPath('/settings',owner)}>設定</Link></>}
    <Link href={boundPath('/new',owner)} style={{marginLeft:'auto'}}>＋新開存檔</Link>
  </nav>;
}
