'use client';
import {useState} from 'react';
import type {Character} from '@/lib/world';
import {needKeys,needLabels} from '@/lib/needs';
import {personalNeedKeys,type BodyNeedsSetup} from '@/lib/body-needs-policy';
export function BodyNeedsSetupPanel({character,busy,onEnable}:{character:Character;busy:boolean;onEnable:(setup:BodyNeedsSetup[])=>Promise<boolean>}){
 const [traits,setTraits]=useState<Record<string,string>>({}),[initial,setInitial]=useState<Record<string,string>>({}),[source,setSource]=useState('');
 const personal=character.needs?.personal;
 if(personal)return <div className="hint"><p>{personal.status==='pending-sleep'?'已確認個人化需求；本次既有睡眠結束並成功保存後啟用。':'個人化身體需求已啟用；重載不重抽。'}</p><p>穩定特性：{personalNeedKeys.map(key=>`${needLabels[key]}累積 ${personal.traits[key]===0.8?'較慢':personal.traits[key]===1?'一般':'較快'}`).join(' · ')}</p><p>設定依據：{personal.source}</p></div>;
 return <details key={character.id}><summary>確認並啟用個人化身體需求</summary><p className="hint">依人物已確認背景限制選擇；未指定者在一般範圍形成一次穩定差異。既有需求維持目前值，不回填歷史；正在睡眠者醒後才切換。</p><div>
 {personalNeedKeys.map(key=><label key={key}>{needLabels[key]}累積特性<select aria-label={`${needLabels[key]}累積特性`} value={traits[key]??'random'} onChange={e=>setTraits({...traits,[key]:e.target.value})}><option value="random">一般範圍隨機形成</option><option value="0.8">背景明示較慢</option><option value="1">背景明示一般</option><option value="1.2">背景明示較快</option></select></label>)}
 {!character.needs&&needKeys.map(key=><label key={key}>開局{needLabels[key]}<input aria-label={`開局${needLabels[key]}`} type="number" min="0" max="100" step="0.01" placeholder={key==='fatigue'?'15':'20'} value={initial[key]??''} onChange={e=>setInitial({...initial,[key]:e.target.value})}/></label>)}
 <label>設定依據<input aria-label="身體需求設定依據" maxLength={500} value={source} onChange={e=>setSource(e.target.value)} placeholder="可註明已確認的人物背景"/></label>
 <button type="button" disabled={busy} onClick={()=>void onEnable([{id:character.id,...(source.trim()?{source}:{}),traits:Object.fromEntries(personalNeedKeys.filter(key=>traits[key]&&traits[key]!=='random').map(key=>[key,[Number(traits[key])]])),...(!character.needs?{initial:Object.fromEntries(needKeys.filter(key=>initial[key]!==undefined&&initial[key]!=='').map(key=>[key,Number(initial[key])]))}:{})}])}>確認啟用此人物需求</button></div></details>;
}
