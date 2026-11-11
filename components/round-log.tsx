'use client';
import { useMemo, useState } from 'react';
import { Dices } from 'lucide-react';
import { timeLabel, type World } from '@/lib/world';
import { observationLog, type LogEntry, type LogRoll } from '@/lib/observation-log';
import { Button } from './ui/button';
import ActionResolution from './action-resolution';
import PerceptionDetails from './perception-details';

const scopes = [
  { id: 'all', label: '全部' },
  { id: 'event', label: '行動與事件' },
  { id: 'rolls', label: '只看擲骰' },
  { id: 'state', label: '數值變化' },
] as const;
type Scope = typeof scopes[number]['id'];
const inScope = (entry: LogEntry, scope: Scope) => scope === 'all' || (scope === 'event' ? entry.source === 'event'
  : scope === 'rolls' ? entry.rolls.length > 0 : entry.source !== 'event');

function RollChip({ roll }: { roll: LogRoll }) {
  return <span className={`roll-chip tone-${roll.tone}`} data-roll>
    <Dices size={13} aria-hidden="true"/>
    <span className="roll-context">{roll.context}{roll.who ? ` · ${roll.who}` : ''}</span>
    <b>{roll.dice}</b><em>{roll.result}</em>
  </span>;
}

function Entry({ entry, world }: { entry: LogEntry; world: World }) {
  const event = entry.event;
  const audience = event?.audience.map(id => world.characters.find(c => c.id === id)?.name).filter(Boolean).join('、');
  return <li className={`log-entry source-${entry.source}`} data-log-source={entry.source} data-log-actor={entry.actor}>
    <span className="log-marker" style={{ background: entry.color || '#98a4b7' }} aria-hidden="true"/>
    <div>
      <div className="log-meta"><b style={{ color: entry.color }}>{entry.actorName}</b><span>{entry.kind}</span></div>
      <p>{entry.text}</p>
      {!!entry.rolls.length && <div className="log-rolls">{entry.rolls.map((roll, index) => <RollChip key={index} roll={roll}/>)}</div>}
      {event && <details className="log-detail"><summary>明細</summary>
        {event.resolution && <p><ActionResolution resolution={event.resolution}/></p>}
        <PerceptionDetails event={event} world={world}/>
        <small className="audience">知情：{audience || '無'}</small>
      </details>}
    </div>
  </li>;
}

/** The observation page's log: who did what, what was rolled, and what changed, grouped by world time. */
export default function RoundLog({ world, selected }: { world: World; selected: string }) {
  const [scope, setScope] = useState<Scope>('all'), [actor, setActor] = useState('all'), [limit, setLimit] = useState(6);
  const rounds = useMemo(() => observationLog(world), [world]);
  const filtered = rounds.map(round => ({
    ...round, entries: round.entries.filter(entry => inScope(entry, scope) && (actor === 'all' || entry.actor === actor)),
  })).filter(round => round.entries.length);
  const total = filtered.reduce((sum, round) => sum + round.entries.length, 0);
  return <section className="panel round-log" aria-label="回合紀錄">
    <div className="section-head"><h2>回合紀錄</h2><span>由新到舊 · {total} 則</span></div>
    <div className="log-filters">
      <div role="group" aria-label="紀錄類型">{scopes.map(item => <button key={item.id} type="button" aria-pressed={scope === item.id}
        onClick={() => { setScope(item.id); setLimit(6); }}>{item.label}</button>)}</div>
      <label>人物<select aria-label="篩選紀錄人物" value={actor} onChange={event => { setActor(event.target.value); setLimit(6); }}>
        <option value="all">所有人</option>
        {world.characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select></label>
      {actor !== selected && world.characters.some(c => c.id === selected) &&
        <Button variant="ghost" size="sm" onClick={() => { setActor(selected); setLimit(6); }}>只看 {world.characters.find(c => c.id === selected)?.name}</Button>}
    </div>
    {filtered.slice(0, limit).map(round => <section className="log-round" key={round.time} aria-label={`第 ${Math.floor(round.time / 1440) + 1} 天 ${timeLabel(round.time)}`}>
      <h3><time>{timeLabel(round.time)}</time><small>第 {Math.floor(round.time / 1440) + 1} 天</small></h3>
      <ul>{round.entries.map(entry => <Entry key={entry.id} entry={entry} world={world}/>)}</ul>
    </section>)}
    {!filtered.length && <p className="log-empty">{rounds.length ? '目前的篩選沒有符合的紀錄。' : '還沒有紀錄。按「下一回合」後，這裡會列出每個人做了什麼、擲了什麼骰、數值怎麼變。'}</p>}
    {filtered.length > limit && <div className="log-more"><Button variant="outline" onClick={() => setLimit(value => value + 6)}>顯示更早的紀錄（尚有 {filtered.length - limit} 個時間點）</Button></div>}
  </section>;
}
