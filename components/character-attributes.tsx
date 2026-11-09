'use client';
import { useState } from 'react';
import type { Character } from '@/lib/world';
import { attributeLabels, attributeNames, type CharacterSetup } from '@/lib/character-attributes';
import CharacterAttributesEditor from './character-attributes-editor';
import { Button } from './ui/button';
export default function CharacterAttributes({character,disabled,onAdopt}:{character:Character;disabled?:boolean;onAdopt?:(setup:CharacterSetup)=>Promise<boolean>}) {
 const [editing,setEditing]=useState(false),[setup,setSetup]=useState<CharacterSetup>({});
 const data=character.attributes;
 return <section aria-label="人物基本屬性"><h2>基本屬性</h2>{data?<>
  <dl>{attributeNames.map(name=><div key={name}><dt>{attributeLabels[name]}</dt><dd>{data.values[name]}／5{data.constraints[name]&&`（確認背景：${data.constraints[name]?.min??1}–${data.constraints[name]?.max??5}${data.constraints[name]?.value!==undefined?'，指定'+data.constraints[name]?.value:''}）`}</dd></div>)}</dl>
  <h3>專長與感官特性</h3><p>{data.expertise.map(item=>`${item.scope} ${item.modifier>0?'+':''}${item.modifier}`).join('、')||'未確認專長數值'}</p><p>{data.senses.map(item=>`${({sight:'視覺',hearing:'聽覺',touch:'觸覺'})[item.scope]} ${item.modifier>0?'+':''}${item.modifier}`).join('、')||'未確認感官修正'}</p>
  <p className="hint">背景限制與領域熟練分開保留。這些是穩定人物資料；新確認行動與新感知機會採 d100；舊規則與既存結果保持原版，並非當前需求、喜好或必須採取的行動。</p>
  <p>感官硬限制：{(data.blockedSenses??[]).map(sense=>({sight:'視覺',hearing:'聽覺',touch:'觸覺'})[sense]).join('、')||'未設定'}</p>
  {onAdopt&&<><Button variant="outline" disabled={disabled} onClick={()=>{setSetup({blockedSenses:data.blockedSenses??[]});setEditing(!editing);}}>設定感官硬限制</Button>{editing&&<form onSubmit={event=>{event.preventDefault();void onAdopt(setup).then(ok=>{if(ok)setEditing(false);});}}>{(['sight','hearing','touch'] as const).map(sense=><label key={sense}><input type="checkbox" aria-label={({sight:'視覺',hearing:'聽覺',touch:'觸覺'})[sense]+'無感知機會'} checked={setup.blockedSenses?.includes(sense)??false} onChange={event=>setSetup({blockedSenses:event.target.checked?[...setup.blockedSenses??[],sense]:(setup.blockedSenses??[]).filter(item=>item!==sense)})}/>{({sight:'視覺',hearing:'聽覺',touch:'觸覺'})[sense]}無感知機會</label>)}<Button type="submit" disabled={disabled}>確認感官硬限制</Button></form>}</>}
 </>:<><p>尚未導入基本屬性；讀取與重載不會自動抽取。導入只形成人物資料，不啟用精神電量或改寫既有判定。</p>{onAdopt&&<Button variant="outline" disabled={disabled} onClick={()=>setEditing(!editing)}>設定並導入基本屬性</Button>}{editing&&<form onSubmit={event=>{event.preventDefault();void onAdopt?.(setup).then(ok=>{if(ok)setEditing(false);});}}><p>既有背景：{character.profile?.background||character.personality}</p><p>既有能力：{character.profile?.abilities||character.abilityTags?.join('、')||'未指定'}</p><CharacterAttributesEditor value={setup} onChange={setSetup}/><Button type="submit" disabled={disabled}>確認背景並導入一次</Button></form>}</>}
 </section>;
}
