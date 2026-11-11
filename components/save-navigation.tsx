'use client';
import {boundPath} from '@/lib/bound-navigation';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import type {MouseEvent} from 'react';
type WorldView='observation'|'analysis'|'settings';
export default function SaveNavigation({saveId,onNavigate,onViewChange,owner,view}:{view?:string;owner?:string;saveId?:string;onNavigate?:()=>void;onViewChange?:(view:WorldView)=>void}) {
  const pathname=usePathname();
  const query=saveId?'?save='+encodeURIComponent(saveId):'';
  function changeView(event:MouseEvent<HTMLAnchorElement>,next:WorldView){
    if(!onViewChange||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    event.preventDefault();onViewChange(next);
  }
  return <nav className="world-navigation" aria-label="共同導覽" style={{display:'flex',gap:16,flexWrap:'wrap',alignItems:'center'}} onClick={onNavigate}>
    <Link href="/" aria-current={pathname==='/'?'page':undefined}>存檔</Link>
    <Link aria-current={pathname==='/character-templates'?'page':undefined} href={boundPath('/character-templates'+query,owner)}>人物</Link>
    <Link aria-current={pathname==='/scene-templates'?'page':undefined} href={boundPath('/scene-templates'+query,owner)}>場景</Link>
    {saveId?<><Link onClick={event=>changeView(event,'observation')} aria-current={pathname==='/observe'&&(view==='observation'||view==='profile')?'page':undefined} href={boundPath('/observe'+query,owner)}>觀察</Link><Link onClick={event=>changeView(event,'analysis')} aria-current={pathname==='/observe'&&view==='analysis'?'page':undefined} href={boundPath('/observe'+query+'&view=analysis',owner)}>分析</Link><Link aria-current={pathname==='/settings'?'page':undefined} href={boundPath('/settings'+query,owner)}>帳號設定</Link></>:<><span aria-disabled="true" title="請先選擇世界存檔">觀察</span><span aria-disabled="true" title="請先選擇世界存檔">分析</span><Link aria-current={pathname==='/settings'?'page':undefined} href={boundPath('/settings',owner)}>帳號設定</Link></>}
    <Link aria-current={pathname==='/new'?'page':undefined} href={boundPath('/new',owner)} style={{marginLeft:'auto'}}>＋新開存檔</Link>
  </nav>;
}
