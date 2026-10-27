'use client';
import type { Character, World } from '@/lib/world';
import { timeLabel } from '@/lib/world';
import { habitViews,eventHabitViews } from '@/lib/habits';

export default function HabitAnalysis({character,world}:{character:Character;world:World}){
 const views=habitViews(world,character);
 const events=eventHabitViews(world,character);
 return <details className="detail" aria-label="自主習慣證據"><summary>自主習慣證據</summary>
 <p className="hint">開始不代表完成、有效或喜歡。保留最近 96 次開始及最多 24 個情境；舊版泛稱資料不補造來源。已淘汰 {character.habitEvidenceDropped||0} 次來源。尚無穩定語義的開始 {character.habitEvidence?.filter(item=>item.semanticGap).length||0} 次，不合併成習慣。</p>
 {views.map(habit=><article key={habit.key}><p>{habit.label} · {habit.established?'已形成':'形成中'} · {habit.days} 個世界日</p><small>語義版本：{habit.activityKey?'activity.v1':'舊版未細分'}</small><ul>{(habit.evidenceIds||[]).map(id=>{const source=character.habitEvidence?.find(item=>item.id===id);return <li key={id}>{source?`D${Math.floor(source.time/1440)+1} ${timeLabel(source.time)} · 真正開始 ${source.activityLabel} · ${source.memory?`${source.memory.id} v${source.memory.version}`:'未保留經歷引用'}`:'開始來源已超出有限保留範圍'}</li>;})}</ul>{!habit.evidenceIds?.length&&<p className="hint">舊資料未保留可查來源，不還原歷史。</p>}</article>)}
 <h4>事件型候選</h4><p className="hint">最多 12 個候選，僅跨日來源成立後形成；關聯不是因果或喜歡。</p>{events.map(habit=><article key={habit.key}><p>{habit.label} · {habit.established?'已形成':'形成中候選'} · {habit.days} 個世界日</p><details><summary>已核對來源</summary><ul>{habit.links.map((link,i)=><li key={i}>觸發 {link.trigger.id} v{link.trigger.version} → 自主開始 {link.action.id} v{link.action.version}{character.habitEvidence?.some(e=>e.id===link.evidenceId)?'':' · 原開始資料已超出有限保留範圍'}</li>)}</ul></details></article>)}
 </details>;
}
