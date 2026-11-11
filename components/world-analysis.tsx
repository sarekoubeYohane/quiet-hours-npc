'use client';
import {useState} from 'react';
import {timeLabel,type World} from '@/lib/world';
import {Button} from './ui/button';
import {RoutineStatus} from './routine-status';
import ActionResolution from './action-resolution';
import PerceptionDetails from './perception-details';

export default function WorldAnalysis({world}:{world:World}){
 const [section,setSection]=useState('events'),[actor,setActor]=useState('all'),[limit,setLimit]=useState(20);
 const events=[...world.events].reverse().filter(event=>actor==='all'||event.actor===actor);
 return <section aria-label="世界紀錄" className="world-analysis">
  <nav className="analysis-subnav" aria-label="世界紀錄內容">
   <button aria-pressed={section==='events'} onClick={()=>setSection('events')}>事件與感知</button>
   <button aria-pressed={section==='routine'} onClick={()=>setSection('routine')}>日常與物件</button>
  </nav>
  <section className="panel analysis-events" hidden={section!=='events'}>
   <div className="analysis-section-heading"><div><h2>行動與感知詳情</h2><p>由新到舊 · 已保存 {events.length} 則</p></div>
    <label>篩選事件人物<select value={actor} onChange={e=>{setActor(e.target.value);setLimit(20);}}><option value="all">所有人物與世界</option>{world.characters.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}<option value="observer">觀察者</option></select></label>
   </div>
   {events.slice(0,limit).map(event=><article key={event.id}><div className="analysis-event-meta"><time>D{Math.floor(event.time/1440)+1} · {timeLabel(event.time)}</time><strong>{world.characters.find(c=>c.id===event.actor)?.name||(event.actor==='observer'?'觀察者':'世界')}</strong></div><p>{event.text}</p>{event.resolution&&<ActionResolution resolution={event.resolution}/>}<PerceptionDetails event={event} world={world}/></article>)}
   {!events.length&&<p className="analysis-empty">目前沒有符合的生活紀錄。回到觀察頁推進世界後，再查看已發生的行動。</p>}
   {events.length>limit&&<Button variant="outline" onClick={()=>setLimit(value=>value+20)}>顯示更多紀錄（尚有 {events.length-limit} 則）</Button>}
  </section>
  <div hidden={section!=='routine'}><RoutineStatus world={world}/></div>
 </section>;
}
