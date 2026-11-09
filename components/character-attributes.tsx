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
  <p className="hint">背景限制與領域熟練分開保留。這些是穩定人物資料；行動與感知尚沿既有判定，並非當前需求、喜好或必須採取的行動。</p>
 </>:<><p>尚未導入基本屬性；讀取與重載不會自動抽取。導入只形成人物資料，不啟用精神電量或改寫既有判定。</p>{onAdopt&&<Button variant="outline" disabled={disabled} onClick={()=>setEditing(!editing)}>設定並導入基本屬性</Button>}{editing&&<form onSubmit={event=>{event.preventDefault();void onAdopt?.(setup).then(ok=>{if(ok)setEditing(false);});}}><p>既有背景：{character.profile?.background||character.personality}</p><p>既有能力：{character.profile?.abilities||character.abilityTags?.join('、')||'未指定'}</p><CharacterAttributesEditor value={setup} onChange={setSetup}/><Button type="submit" disabled={disabled}>確認背景並導入一次</Button></form>}</>}
 </section>;
}
