'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { MessageCircle, Pause, Smartphone } from 'lucide-react';
import { locations, type World, type WorldEvent, timeLabel } from '@/lib/world';
import { regions, doors } from '@/lib/perception';
import { assetsForCharacter } from '@/lib/character-assets';
import { bubbleText, characterRegion, position, walkRoute, type Point } from '@/lib/pixel-scene';

export function PixelSprite({ id, className = '' }: { id: string; className?: string }) {
  const [failedSrc, setFailedSrc] = useState('');
  const src = assetsForCharacter(id)?.pixel;
  return <span className={`pixel-sprite ${className}`} aria-hidden="true" data-asset-character={id} data-asset-use="pixel">
    {!src || failedSrc === src ? <span className="pixel-sprite-fallback">{id.slice(0, 1).toUpperCase()}</span> : <img src={src} alt="" draggable={false} onError={() => setFailedSrc(src)}/>}
  </span>;
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
  useEffect(() => { callback.current = onPlayingChange; }, [onPlayingChange]);

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
    if (!events.length || document.visibilityState === 'hidden' || before.turn > world.turn || events.length > 12) { settle(); return; }
    const hidden = () => { if (document.visibilityState === 'hidden') { cancelled = true; if (timer) clearTimeout(timer); settle(); } };
    document.addEventListener('visibilitychange', hidden);
    const replay = async () => {
      setPlaying(true); callback.current(true);
      for (const event of events) {
        if (cancelled) return;
        setActive(event);
        if (event.kind === 'move') {
          const c = world.characters.find(c => c.id === event.actor)!;
          const from = event.scene?.from || before.characters.find(old => old.id === c.id)?.location || c.location;
          const route = walkRoute(c.id, from, event.scene?.to || c.location, event.scene?.fromRegion, event.scene?.toRegion);
          setWalking(reduced ? '' : c.id);
          if (reduced) { setDuration(0); setPoints(p => ({ ...p, [c.id]: position(c) })); }
          else {
            let last = position({ id: c.id, location: from, region: event.scene?.fromRegion });
            for (const step of route) {
              if (cancelled) return;
              const ms = Math.min(350, Math.max(80, Math.hypot(step.x - last.x, step.y - last.y) * 18));
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
    return () => { cancelled = true; if (timer) clearTimeout(timer); document.removeEventListener('visibilitychange', hidden); callback.current(false); };
  }, [world]);

  const actor = world.characters.find(c => c.id === active?.actor);
  const period = (world.minute % 1440) >= 360 && (world.minute % 1440) < 1080 ? 'day' : 'night';
  const places = [...locations, ...[...new Set(world.characters.map(c => c.location))].filter(id => !locations.some(place => place.id === id)).map(id => ({id, name:id}))];
  return <section role="region" aria-label="世界像素地圖" data-period={period}>
    <div className="map-time">第 {Math.floor(world.minute / 1440) + 1} 天 · {timeLabel(world.minute)} · {period === 'day' ? '白天' : '夜晚'}</div>
    <div className={`pixel-scene period-${period}`} data-period={period}>
      <img className="pixel-map" src="/pixel/night-map.png" alt="像素場景底圖；時間、分區與門狀態以覆蓋標示及下方文字為準。" onError={() => setArtFailed(true)} draggable={false}/>
      {artFailed && <div className="map-error">地圖載入失敗，請重新整理。下方仍可點選角色。</div>}
      <span className="room-label room-kris">Kris 的住處</span><span className="room-label room-vera">Vera 的房間</span><span className="room-label room-cafe">街角咖啡館</span>
      <span className="map-region region-kris">室內</span><span className="map-region region-vera">室內</span>
      <span className="map-region region-cafe">前台</span><span className="map-region region-storeroom">儲藏室</span>
      <span className="storeroom-boundary" aria-hidden="true"/>
      {doors.map(door => <span key={door.id} className={`map-door ${(world.scene?.doors[door.id] || 'open') === 'open' ? 'open' : 'closed'}`} data-door-id={door.id} aria-label={`${door.name}：${world.scene?.doors[door.id] === 'closed' ? '關閉' : '開啟'}`}>{world.scene?.doors[door.id] === 'closed' ? '▮' : '⌜'}</span>)}
      {world.characters.map(c => {
        const p = points[c.id] || position(c);
        const speaking = active?.actor === c.id;
        return <button key={c.id} type="button" className={`map-character ${p.y > 55 ? 'in-cafe' : ''} ${selected === c.id ? 'selected' : ''} ${walking === c.id ? 'walking' : ''} ${speaking ? 'acting' : ''}`}
          data-character-id={c.id} data-region={characterRegion(c)} onClick={() => onSelect(c.id)} aria-pressed={selected === c.id} aria-label={`${c.name}，${regions.find(region => region.id === characterRegion(c))?.name || c.location}，${c.activity}，點選查看狀態`}
          style={{ left: `${p.x}%`, top: `${p.y}%`, '--character-color': c.color, '--walk-duration': `${duration}ms`, zIndex: Math.round(p.y) } as CSSProperties}>
          {speaking && <span className={`sprite-bubble ${active.kind === 'say' ? 'speech' : ''}`}>{active.kind === 'message' && <Smartphone size={14}/>}<span>{bubbleText(active, world.characters)}</span></span>}
          <span className="sprite-shadow"/><PixelSprite id={c.id}/><span className="sprite-name">{c.name}</span>
        </button>;
      })}
      <span className="map-playback">{playing ? <MessageCircle size={14}/> : <Pause size={14}/>} {playing ? `${actor?.name || ''} 的行動` : '點角色查看狀態'}</span>
    </div>
    <div className="map-door-status">{doors.map(door => <span key={door.id}>{door.name}：{world.scene?.doors[door.id] === 'closed' ? '關閉' : '開啟'}（{door.regions.map(id => regions.find(region => region.id === id)?.name || id).join(' ↔ ')}）</span>)}<span>分區邊界為示意；角色位置與門狀態來自世界。</span></div>
    <div className="pixel-locations">{places.map(place => <div className="pixel-location" key={place.id}><h2>{place.name}</h2><div>{world.characters.filter(c => c.location === place.id).map(c => <button key={c.id} onClick={() => onSelect(c.id)} aria-pressed={selected === c.id} className={selected === c.id ? 'active' : ''}><span style={{background:c.color}}/><strong>{c.name}</strong><small>{regions.find(region => region.id === characterRegion(c))?.name || c.location} · {c.activity || '活動內容未記錄'}</small></button>)}{!world.characters.some(c => c.location === place.id) && <span className="empty-place">此刻沒有人</span>}</div></div>)}</div>
    <div className="scene-caption" aria-live="polite">{active ? `已提交行動回放 · ${actor?.name} · ${bubbleText(active, world.characters)}` : `角色會隨回合行動。延續活動不重新詢問 AI；當面對話顯示在地圖上。`}</div>
  </section>;
}
