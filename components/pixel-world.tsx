'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { MessageCircle, Pause, Smartphone } from 'lucide-react';
import { locations, type World, type WorldEvent } from '@/lib/world';
import { bubbleText, position, walkRoute, type Point } from '@/lib/pixel-scene';

export function PixelSprite({ id, className = '' }: { id: string; className?: string }) {
  return <span className={`pixel-sprite ${className}`} aria-hidden="true"><img src={`/pixel/${id}.${id==='owner'?'svg':'png'}`} alt="" draggable={false}/></span>;
}

export default function PixelWorld({ world, selected, onSelect, onPlayingChange }: {
  world: World; selected: string; onSelect: (id: string) => void; onPlayingChange: (playing: boolean) => void;
}) {
  const [points, setPoints] = useState<Record<string, Point>>(() => Object.fromEntries(world.characters.map(c => [c.id, position(c)])));
  const [active, setActive] = useState<WorldEvent | null>(null);
  const [walking, setWalking] = useState('');
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [artFailed, setArtFailed] = useState(false);
  const previous = useRef(world);
  const callback = useRef(onPlayingChange);
  callback.current = onPlayingChange;

  useEffect(() => {
    const before = previous.current;
    previous.current = world;
    const ids = new Set(before.events.map(e => e.id));
    const events = world.events.filter(e => !ids.has(e.id) && world.characters.some(c => c.id === e.actor));
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const wait = (ms: number) => new Promise<void>(resolve => { timer = setTimeout(resolve, ms); });
    const settle = () => {
      setDuration(0); setPoints(Object.fromEntries(world.characters.map(c => [c.id, position(c)])));
      setActive(null); setWalking(''); setPlaying(false); callback.current(false);
    };
    if (!events.length) { settle(); return; }
    const replay = async () => {
      setPlaying(true); callback.current(true);
      for (const event of events) {
        if (cancelled) return;
        setActive(event);
        if (event.kind === 'move') {
          const c = world.characters.find(c => c.id === event.actor)!;
          const from = event.scene?.from || before.characters.find(old => old.id === c.id)?.location || c.location;
          const route = walkRoute(c.id, from, event.scene?.to || c.location);
          setWalking(reduced ? '' : c.id);
          if (reduced) { setDuration(0); setPoints(p => ({ ...p, [c.id]: position(c) })); }
          else {
            let last = position({ id: c.id, location: from });
            for (const step of route) {
              if (cancelled) return;
              const ms = Math.max(120, Math.hypot(step.x - last.x, step.y - last.y) * 38);
              setDuration(ms); setPoints(p => ({ ...p, [c.id]: step }));
              await wait(ms); last = step;
            }
          }
          setWalking('');
        }
        await wait(reduced ? 300 : event.kind === 'say' ? 2300 : 1100);
      }
      if (!cancelled) settle();
    };
    void replay();
    return () => { cancelled = true; if (timer) clearTimeout(timer); callback.current(false); };
  }, [world]);

  const actor = world.characters.find(c => c.id === active?.actor);
  return <>
    <div className="pixel-scene" aria-label="三個地點的像素地圖，點選角色查看狀態">
      <img className="pixel-map" src="/pixel/night-map.png" alt="夜裡的三個相連空間：左上是 Kris 的住處，右上是 Vera 的房間，下方是街角咖啡館。" onError={() => setArtFailed(true)} draggable={false}/>
      {artFailed && <div className="map-error">地圖載入失敗，請重新整理。下方仍可點選角色。</div>}
      <span className="room-label room-kris">Kris 的住處</span><span className="room-label room-vera">Vera 的房間</span><span className="room-label room-cafe">街角咖啡館</span>
      {world.characters.map(c => {
        const p = points[c.id] || position(c);
        const speaking = active?.actor === c.id;
        return <button key={c.id} type="button" className={`map-character ${p.y > 55 ? 'in-cafe' : ''} ${selected === c.id ? 'selected' : ''} ${walking === c.id ? 'walking' : ''} ${speaking ? 'acting' : ''}`}
          onClick={() => onSelect(c.id)} aria-pressed={selected === c.id} aria-label={`${c.name}，${c.mood}，點選查看狀態`}
          style={{ left: `${p.x}%`, top: `${p.y}%`, '--character-color': c.color, '--walk-duration': `${duration}ms`, zIndex: Math.round(p.y) } as CSSProperties}>
          {speaking && <span className={`sprite-bubble ${active.kind === 'say' ? 'speech' : ''}`}>{active.kind === 'message' && <Smartphone size={14}/>}<span>{bubbleText(active, world.characters)}</span></span>}
          <span className="sprite-shadow"/><PixelSprite id={c.id}/><span className="sprite-name">{c.name}</span>
        </button>;
      })}
      <span className="map-playback">{playing ? <MessageCircle size={14}/> : <Pause size={14}/>} {playing ? `${actor?.name || ''} 的行動` : '點角色查看狀態'}</span>
    </div>
    <div className="pixel-locations">{locations.map(place => <div className="pixel-location" key={place.id}><h2>{place.name}</h2><div>{world.characters.filter(c => c.location === place.id).map(c => <button key={c.id} onClick={() => onSelect(c.id)} aria-pressed={selected === c.id} className={selected === c.id ? 'active' : ''}><span style={{background:c.color}}/>{c.name}</button>)}{!world.characters.some(c => c.location === place.id) && <span className="empty-place">此刻沒有人</span>}</div></div>)}</div>
    <div className="scene-caption" aria-live="polite">{active ? `${actor?.name} · ${bubbleText(active, world.characters)}` : `角色會隨回合行動。延續活動不重新詢問 AI；當面對話顯示在地圖上。`}</div>
  </>;
}
