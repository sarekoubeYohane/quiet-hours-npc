'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { assetsForCharacter } from '@/lib/character-assets';
import { locations, type Character } from '@/lib/world';
import { regions, regionOf } from '@/lib/perception';

export default function CharacterProfile({character,onBack,onInteract,onAnalysis}:{character:Character;onBack:()=>void;onInteract:()=>void;onAnalysis:()=>void}) {
 const [failed,setFailed]=useState(false);
 const asset=assetsForCharacter(character.id);
 return <section className="character-profile panel" aria-label="人物檔案">
  <div className="profile-toolbar"><Button variant="outline" onClick={onBack}>返回觀察</Button><span>人物檔案</span></div>
  <div className="profile-layout"><div className="profile-visual" style={{borderColor:character.color}}>
   {asset&&!failed?<img src={asset.portrait} alt={`${character.name} 的人物圖`} onError={()=>setFailed(true)}/>:<div className="profile-fallback" role="img" aria-label={`${character.name} 的人物圖暫不可用`} style={{color:character.color}}>{character.name.slice(0,1)}</div>}
   <p>{asset&&!failed?'角色主視覺':'人物圖暫不可用；以名字辨識角色。'}</p>
  </div><div className="profile-content"><h1 style={{color:character.color}}>{character.name}</h1><h2>簡介</h2><p>{character.personality}</p>
   <h2>當前狀態</h2><p>{locations.find(l=>l.id===character.location)?.name||character.location} · {regions.find(r=>r.id===regionOf(character))?.name||regionOf(character)}</p><p>{character.activity}</p><p>心情：{character.mood}</p>
   <div className="profile-actions"><Button onClick={onInteract}>互動</Button><Button variant="outline" onClick={onAnalysis}>查看角色分析</Button></div>
   <p className="hint">{character.id==='owner'?'可進行單次指定、暫時接管與交還控制權。':'你的介入只提供角色知情事件；角色會自行判斷如何回應。'}</p>
  </div></div>
 </section>;
}
