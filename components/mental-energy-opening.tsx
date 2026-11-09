'use client';
import {useState} from 'react';
import type {MentalOpeningInput,MentalAdoption} from '@/lib/formal-mental-enablement';
import type {Character} from '@/lib/world';
export function MentalEnergyOpeningEditor({value,onChange}:{value:MentalOpeningInput;onChange:(value:MentalOpeningInput)=>void}){
 const capacityMode=value.capacity!==undefined?'fixed':value.minimum!==undefined||value.maximum!==undefined?'range':'general';
 const currentMode=value.current!==undefined?'exact':value.stage!==undefined?'stage':'default';
 const number=(v:string)=>v===''?NaN:Number(v);
 const shown=(v:number|undefined)=>v===undefined||Number.isNaN(v)?'':v;
 const capacityChoice=(mode:string)=>{const next={...value};delete next.capacity;delete next.minimum;delete next.maximum;if(mode==='fixed')next.capacity=65;if(mode==='range'){next.minimum=40;next.maximum=90;}onChange(next);};
 return <div className="mental-opening"><p className="hint">背景限制優先；一般容量在開始生活時形成一次。未指定開局心力採個人容量七成，不由心情或睡醒推算。</p>
 <label>心力容量來源<select aria-label="心力容量來源" value={capacityMode} onChange={e=>capacityChoice(e.target.value)}><option value="general">一般範圍形成</option><option value="fixed">背景明示容量</option><option value="range">背景限定一般範圍</option></select></label>
 {capacityMode==='fixed'&&<label>精神電量容量<input aria-label="精神電量容量" type="number" min="1" step="1" value={shown(value.capacity)} onChange={e=>onChange({...value,capacity:number(e.target.value)})}/></label>}
 {capacityMode==='range'&&<><label>容量下限<input aria-label="容量下限" type="number" min="40" max="90" step="1" value={shown(value.minimum)} onChange={e=>onChange({...value,minimum:number(e.target.value)})}/></label><label>容量上限<input aria-label="容量上限" type="number" min="40" max="90" step="1" value={shown(value.maximum)} onChange={e=>onChange({...value,maximum:number(e.target.value)})}/></label></>}
 <label>開局心力來源<select aria-label="開局心力來源" value={currentMode} onChange={e=>onChange({...value,current:e.target.value==='exact'?0:undefined,stage:e.target.value==='stage'?'有餘':undefined})}><option value="default">預設七成</option><option value="exact">明示目前電量</option><option value="stage">明示感受階段</option></select></label>
 {currentMode==='exact'&&<label>開局精神電量<input aria-label="開局精神電量" type="number" min="0" step="1" value={shown(value.current)} onChange={e=>onChange({...value,current:number(e.target.value)})}/></label>}
 {currentMode==='stage'&&<label>開局心力階段<select aria-label="開局心力階段" value={value.stage} onChange={e=>onChange({...value,stage:e.target.value as MentalOpeningInput['stage']})}>{['充沛','有餘','尚可','吃緊','見底'].map(stage=><option key={stage}>{stage}</option>)}</select></label>}
 </div>;
}
export function MentalEnergyAdoptionPanel({character,busy,onEnable}:{character:Character;busy:boolean;onEnable:(items:MentalAdoption)=>Promise<boolean>}){
 const [opening,setOpening]=useState<MentalOpeningInput>({});
 if(character.mentalEnergy!==undefined)return null;
 return <details><summary>啟用正式精神電量</summary><MentalEnergyOpeningEditor value={opening} onChange={setOpening}/><p className="hint">從現在的世界時間開始，不補算以前心理歷史。確認後容量與起點將保存；已有正式資料不重抽，隔離測試資料不轉正式。</p><button type="button" disabled={busy} onClick={()=>void onEnable([{id:character.id,opening}])}>確認啟用此人物精神電量</button></details>;
}
