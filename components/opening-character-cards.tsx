'use client';
import { useState } from 'react';
import { assetsForCharacter } from '@/lib/character-assets';
import { cardAttributeLabels, cardAttributeNames, type CharacterCard } from '@/lib/character-cards';
import type { CityDraft } from '@/lib/city-draft';
import { openingEnergyValue } from '@/lib/formal-mental-policy';

type Actor = CityDraft['characters'][number];
type Tab = '能力' | '身體需求';
export const defaultOpeningNeeds = { hunger: 20, thirst: 20, fatigue: 15, sleep: 20 };
const needNames = { hunger: '飢餓', thirst: '口渴', fatigue: '體力疲勞', sleep: '睡眠需求' };

export function OpeningPortrait({card}:{card:CharacterCard}) {
  const asset = assetsForCharacter(card.id, card.id);
  const [failed, setFailed] = useState(false);
  return asset && !failed ? <img className="opening-portrait" src={asset.avatar} alt={card.fields.name+' 的人物圖'} onError={()=>setFailed(true)}/> : null;
}

function Meter({name, label, value, maximum}:{name:string; label:string; value:number; maximum:number}) {
  return <div className="meter">
    <span>{label}</span>
    <span className="meter-track" role="meter" aria-label={name+' '+label} aria-valuemin={0} aria-valuemax={maximum} aria-valuenow={value}>
      <span style={{width: Math.min(100,value/maximum*100)+'%'}}/>
    </span><span className="meter-value">{value}<small>/{maximum}</small></span>
  </div>;
}

export function OpeningCardDetails({card,actor,tab,onTab}:{card:CharacterCard;actor?:Actor;tab:Tab;onTab:(tab:Tab)=>void}) {
  const name=card.fields.name;
  return <section aria-label={name+' 詳情'}>
    <div className="opening-actions">{(['能力','身體需求'] as const).map(item=>
      <button type="button" key={item} aria-pressed={tab===item} onClick={()=>onTab(item)}>{item}</button>)}</div>
    {tab==='能力'?<>{cardAttributeNames.map(key=><Meter key={key} name={name} label={cardAttributeLabels[key]} value={card.values[key]} maximum={18}/>)}<p>外觀不參與檢定</p></>:
      Object.entries(needNames).map(([key,label])=><Meter key={key} name={name} label={label} maximum={100} value={(actor?.openingNeeds??defaultOpeningNeeds)[key as keyof typeof needNames]}/>)}
    <Meter name={name} label="精神電量" value={openingEnergyValue(card.capacity,actor?.mentalOpening)} maximum={card.capacity}/>
  </section>;
}

export function OpeningCardPicker({cards,city,startLabel,onToggle}:{cards:CharacterCard[];city:CityDraft;startLabel:(a:Actor)=>string;onToggle:(card:CharacterCard,joined:boolean)=>void}) {
  const [viewed,setViewed]=useState<string>();
  const [tab,setTab]=useState<Tab>('能力');
  return <div className="opening-grid">{cards.map(card=>{
    const actor=city.characters.find(person=>person.templateId===card.id);
    const name=card.fields.name;
    return <article key={card.id} className="opening-option">
      <OpeningPortrait card={card}/><h3>{name}</h3>
      <p>{card.fields.personality || card.fields.background || card.fields.abilities}</p>
      <small>精神容量 {card.capacity}</small>
      {actor&&<p>起點：{startLabel(actor)}</p>}
      <label><input aria-label={'加入 '+name} type="checkbox" checked={!!actor} onChange={e=>onToggle(card,e.target.checked)}/>加入本局</label>
      <button type="button" aria-expanded={viewed===card.id} onClick={()=>setViewed(viewed===card.id?undefined:card.id)}>{viewed===card.id?'收合 ':'查看 '}{name} 詳情</button>
      {viewed===card.id&&<OpeningCardDetails card={card} actor={actor} tab={tab} onTab={setTab}/>}
    </article>;
  })}</div>;
}
