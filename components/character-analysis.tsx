'use client';
import {useState} from 'react';
import {Clock,MapPin} from 'lucide-react';
import type {World,Character} from '@/lib/world';
import {timeLabel,pendingInterventions} from '@/lib/world';
import {worldLocations,worldRegions,worldDoors} from '@/lib/world-configuration';
import {regionOf} from '@/lib/perception';
import {habitViews} from '@/lib/habits';
import {bodyFeelings,needKeys,needLabels,isSleeping} from '@/lib/needs';
import type {MentalAdoption} from '@/lib/formal-mental-enablement';
import type {BodyNeedsSetup} from '@/lib/body-needs-policy';
import {Button} from './ui/button';
import {PixelSprite} from './pixel-world';
import {MentalEnergyStatus} from './mental-energy-status';
import {MentalEnergyAdoptionPanel} from './mental-energy-opening';
import {BodyNeedsSetupPanel} from './body-needs-setup';
import PursuitsAnalysis from './pursuits-analysis';
import HabitAnalysis from './habit-analysis';
import CognitionAnalysis from './cognition-analysis';
import AttentionDetails from './attention-details';

const sections=[{id:'state',label:'近況與需求'},{id:'pursuits',label:'追求與生活'},{id:'memory',label:'記憶與信念'}] as const;
export default function CharacterAnalysis({world,character,onSelect,onProfile,busy,onEnableMental,onEnableNeeds}:{
 world:World;character:Character;onSelect:(id:string)=>void;onProfile:()=>void;busy:boolean;
 onEnableMental:(items:MentalAdoption)=>Promise<boolean>;onEnableNeeds:(items:BodyNeedsSetup[])=>Promise<boolean>;
}){
 const [section,setSection]=useState<typeof sections[number]['id']>('state');
 const locations=worldLocations(world),regions=worldRegions(world),doors=worldDoors(world);
 const pending=pendingInterventions(world,character),habits=habitViews(world,character).slice(0,5);
 return <section className="character-analysis" aria-label="人物分析">
  <aside className="panel analysis-person">
   <label>正在分析的人物<select value={character.id} onChange={e=>onSelect(e.target.value)}>{world.characters.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
   <div className="identity"><span className="initial" style={{color:character.color}}><PixelSprite id={character.id}/></span><div><h2>{character.name}</h2><span><MapPin size={14}/>{character.plan?.journey?'移動途中':[locations.find(l=>l.id===character.location)?.name,regions.find(r=>r.id===regionOf(character))?.name].filter(Boolean).join(' · ')}</span></div></div>
   <span className="analysis-mood">{character.mood}</span><p className="analysis-current">{character.activity}</p>
   <Button variant="outline" onClick={onProfile}>人物檔案</Button>
   <details><summary>人物設定摘要</summary><p>{character.personality}</p>{character.abilityTags?.length?<p>能力特質：{character.abilityTags.join('、')}</p>:null}</details>
  </aside>
  <div className="analysis-person-content">
   <nav className="analysis-subnav" aria-label="人物分析內容">{sections.map(item=><button key={item.id} type="button" aria-pressed={section===item.id} aria-controls={'character-'+item.id} onClick={()=>setSection(item.id)}>{item.label}</button>)}</nav>
   <div id="character-state" hidden={section!=='state'}>
    <section className="panel analysis-current-panel"><h2>此刻的狀態</h2><AttentionDetails character={character}/><p className="hint">{doors.filter(d=>d.regions.includes(regionOf(character))).map(d=>`${d.name}：${world.scene?.doors[d.id]==='closed'?'關閉':'開啟'}`).join(' · ')}</p>{character.plan&&character.plan.until>world.minute&&<div className="activity-plan"><Clock size={14}/><span>{isSleeping(character)?"睡眠延續中 · 自然醒或足夠刺激時結束":`活動延續中 · 約剩 ${character.plan.until-world.minute} 分鐘`}<br/>{character.plan.journey?'抵達後可開始下一個行動':character.control?.active?'指定活動由你控制':'關注線索或直接互動時重新評估'}</span></div>}{pending.length>0&&<div className="pending-request"><h3>等待下一回合回應</h3><p>{pending.at(-1)?.text}</p></div>}</section>
    <div className="analysis-needs"><MentalEnergyStatus character={character}/><MentalEnergyAdoptionPanel key={character.id} character={character} busy={busy} onEnable={onEnableMental}/><div className="detail"><h3>身體需求</h3><details><summary>需求特性與設定</summary><BodyNeedsSetupPanel key={character.id} character={character} busy={busy} onEnable={onEnableNeeds}/></details><p>睡眠狀態：{isSleeping(character)?"睡眠中":"清醒"}{character.plan?.sleep?`；本次已實際睡眠 ${Math.round(character.plan.sleep.elapsedMinutes)} 分鐘`:""}</p>{character.needs?<><p>{bodyFeelings(character).map(item=>item.feeling).join("；")}</p><p className="hint">觀察者數值：{needKeys.map(key=>`${needLabels[key]} ${character.needs!.values[key]}/100`).join(" · ")}。角色只收到本人感受。</p><p className="hint">從 D{Math.floor(character.needs.activatedAt/1440)+1} · {timeLabel(character.needs.activatedAt)} 啟用；未回填先前歷史。保留最近 {character.needs.history.length} 筆變化，已省略 {character.needs.dropped} 筆。</p><details><summary>最近的需求變化</summary>{[...character.needs.history].reverse().slice(0,5).map((entry,index)=><p className="hint" key={`${entry.minute}:${index}`}>D{Math.floor(entry.minute/1440)+1} · {timeLabel(entry.minute)} · {entry.reason}<br/>{needKeys.map(key=>`${needLabels[key]} ${entry.before[key]} → ${entry.after[key]}`).join(" · ")}</p>)}</details></>:<p className="hint">需求尚未啟用；首次成功推進時建立工程基線，不回填歷史。</p>}</div></div>
   </div>
   <section id="character-pursuits" className="panel" hidden={section!=='pursuits'}><PursuitsAnalysis character={character}/><div className="detail"><h3>設計成果 <span>最近 {character.projects?.length||0} 份</span></h3>{character.projects?.length?<div className="memories">{[...character.projects].reverse().slice(0,5).map(item=><div key={item.resultId}><p>{item.theme} · {({'finished-with-variation':'完成＋額外收穫',finished:'完成',draft:'初稿仍需調整',unfinished:'尚未完成',spoiled:'草稿受損'})[item.status]}</p><small>DC {item.dc}</small></div>)}</div>:<p className="hint">尚無設計成果。</p>}</div>
<div className="detail habit-detail"><h3>生活習慣 <span>從自主選擇累積</span></h3>{habits.length?<div className="habit-list">{habits.map(habit=><article key={habit.key}><div><span className={`habit-stage ${habit.established?'established':''}`}>{habit.fading?'正在淡化':habit.established?'已形成':'形成中'}</span><small>{habit.days} 個世界日出現</small></div><p>{habit.label}</p><small>最近出現：D{Math.floor(habit.lastSeen/1440)+1} · {timeLabel(habit.lastSeen)}</small></article>)}</div>:<p className="habit-empty">還在認識自己的生活節奏。AI 自主行動在不同世界日重複出現後，會逐漸累積習慣。</p>}<p className="habit-note">三個不同世界日出現後形成；久未出現會變淡。AI 可改變主意。規則模式、活動延續與回應你的要求不計入。</p></div><HabitAnalysis character={character} world={world}/></section>
   <section id="character-memory" className="panel" hidden={section!=='memory'}><CognitionAnalysis character={character} world={world}/></section>
  </div>
 </section>;
}
