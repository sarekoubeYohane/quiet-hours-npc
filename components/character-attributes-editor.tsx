'use client';
import { attributeLabels, attributeNames, type CharacterSetup } from '@/lib/character-attributes';
const senses = {sight:'視覺',hearing:'聽覺',touch:'觸覺'} as const;
export default function CharacterAttributesEditor({value,onChange}:{value:CharacterSetup;onChange:(value:CharacterSetup)=>void}) {
 return <fieldset aria-label="人物基本屬性設定"><legend>基本屬性與背景範圍</legend>
  <p>1–5 級，3 為一般；未指定時以兩顆三面骰形成一次。請依背景核對範圍；此處確認的數值隨開始／導入保存，不改寫背景限制。</p>
  {attributeNames.map(name=><fieldset key={name}><legend>{attributeLabels[name]}</legend>{([{key:'value',label:'指定值'},{key:'min',label:'背景下限'},{key:'max',label:'背景上限'}] as const).map(({key,label})=><label key={key}>{label}<input type="number" min={1} max={5} step={1} aria-label={attributeLabels[name]+label} value={value.attributes?.[name]?.[key]??''} placeholder={key==='value'?'未指定':key==='min'?'1':'5'} onChange={event=>onChange({...value,attributes:{...value.attributes,[name]:{...value.attributes?.[name],[key]:event.target.value===''?undefined:Number(event.target.value)}}})}/></label>)}</fieldset>)}
  <h4>已確認專長</h4><p>僅填與背景相容的領域與修正；空白不授予數值。相同領域不可重複。</p>
  {(value.expertise??[]).map((item,index)=><div key={index}><label>領域<input maxLength={80} aria-label={'專長領域'+(index+1)} value={item.scope} onChange={event=>onChange({...value,expertise:value.expertise!.map((old,i)=>i===index?{...old,scope:event.target.value}:old)})}/></label><label>修正<select aria-label={'專長修正'+(index+1)} value={item.modifier} onChange={event=>onChange({...value,expertise:value.expertise!.map((old,i)=>i===index?{...old,modifier:Number(event.target.value) as typeof old.modifier}:old)})}>{[-20,-10,0,10,20].map(n=><option key={n} value={n}>{n>0?'+':''}{n}</option>)}</select></label><button type="button" onClick={()=>onChange({...value,expertise:value.expertise!.filter((_,i)=>i!==index)})}>移除專長</button></div>)}
  <button type="button" disabled={(value.expertise?.length??0)>=16} onClick={()=>onChange({...value,expertise:[...value.expertise??[],{scope:'',modifier:0}]})}>新增專長</button>
  <h4>已確認感官修正</h4><p>修正不移除失明等硬限制。已用於屬性的同一弱點不可再次扣分。</p>
  {Object.entries(senses).map(([scope,label])=><label key={scope}>{label}<select aria-label={label+'修正'} value={value.senses?.find(item=>item.scope===scope)?.modifier??0} onChange={event=>onChange({...value,senses:[...(value.senses??[]).filter(item=>item.scope!==scope),{scope:scope as keyof typeof senses,modifier:Number(event.target.value) as -20|-10|0|10|20}]})}>{[-20,-10,0,10,20].map(n=><option key={n} value={n}>{n>0?'+':''}{n}</option>)}</select></label>)}
  <h4>背景的感官硬限制</h4><p>只確認實際無法使用的感官；不是能力較弱，也不從自由文字自動推定。</p>
  {Object.entries(senses).map(([scope,label])=><label key={'blocked-'+scope}><input type="checkbox" aria-label={label+'無感知機會'} checked={value.blockedSenses?.includes(scope as keyof typeof senses)??false} onChange={event=>onChange({...value,blockedSenses:event.target.checked?[...value.blockedSenses??[],scope as keyof typeof senses]:(value.blockedSenses??[]).filter(item=>item!==scope)})}/>{label}無感知機會</label>)}
 </fieldset>;
}
