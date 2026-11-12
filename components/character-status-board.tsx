'use client';
import { observedActivityStatus } from '@/lib/observed-activity';
import type { CSSProperties } from 'react';
import { timeLabel, type World, type Character } from '@/lib/world';
import { worldLocations, worldRegions } from '@/lib/world-configuration';
import { regionOf } from '@/lib/perception';
import { needKeys, needLabels, needStage, isSleeping, type Need } from '@/lib/needs';
import { latestMentalChange, latestNeedChange, signed } from '@/lib/observation-log';
import { PixelSprite } from './pixel-world';

const shortNeed: Record<Need, string> = { hunger: '飢餓', thirst: '口渴', fatigue: '疲勞', sleep: '睡意' };
const stageWords = ['平穩', '有感', '明顯', '強烈'];

export function whereabouts(world: World, character: Character): string {
  const journey = character.plan?.journey;
  if (journey) return `移動途中 → ${worldLocations(world).find(place => place.id === journey.location)?.name ?? '目的地'}`;
  const place = worldLocations(world).find(item => item.id === character.location)?.name;
  const room = worldRegions(world).find(item => item.id === regionOf(character))?.name;
  return [place, room].filter(Boolean).join(' · ') || character.location;
}
export function activityStatus(world: World, character: Character): string | undefined {
  if (isSleeping(character)) return '睡眠中';
  const plan = character.plan;
  if (!plan || !(plan.until > world.minute)) return undefined;
  return `約剩 ${plan.until - world.minute} 分鐘（到 ${timeLabel(plan.until)}）`;
}

/** Mental energy as an observer-facing meter; high is good, so the fill warns when it runs low. */
export function MentalMeter({ character, showDelta = true }: { character: Character; showDelta?: boolean }) {
  const state = character.mentalEnergy, maximum = state?.policy?.maximum;
  if (!state || !Number.isFinite(state.value) || !Number.isFinite(maximum) || !maximum) {
    return <div className="meter meter-mental is-off"><span className="meter-label">精神電量</span><span className="meter-off">{state ? '資料無法讀取' : '尚未啟用'}</span></div>;
  }
  const ratio = Math.max(0, Math.min(1, state.value / maximum)), delta = showDelta ? latestMentalChange(character) : undefined;
  return <div className={`meter meter-mental level-${ratio < .25 ? 'low' : ratio < .5 ? 'mid' : 'high'}`}>
    <span className="meter-label">精神電量</span>
    <span className="meter-track" role="meter" aria-label={`${character.name} 精神電量`} aria-valuemin={0} aria-valuemax={maximum} aria-valuenow={state.value}>
      <span style={{ width: `${ratio * 100}%` }}/>
    </span>
    <span className="meter-value">{state.value}<small>/{maximum}</small>{!!delta && <em className={delta > 0 ? 'up' : 'down'}>{signed(delta)}</em>}</span>
  </div>;
}

/** The four body needs; higher means a stronger need, so colour follows the stage the engine itself uses. */
export function NeedMeters({ character, showDelta = true }: { character: Character; showDelta?: boolean }) {
  const needs = character.needs;
  if (!needs?.values || needKeys.some(key => !Number.isFinite(needs.values[key]))) {
    return <p className="meter-off">{needs ? '身體需求資料無法讀取' : '身體需求尚未啟用'}</p>;
  }
  const change = showDelta ? latestNeedChange(character) : undefined;
  return <div className="need-meters" role="group" aria-label={`${character.name} 身體需求`}>{needKeys.map(key => {
    const value = needs.values[key], stage = needStage(character, key), delta = change?.[key];
    return <div className={`meter meter-need stage-${stage}`} key={key} title={`${needLabels[key]}：${stageWords[stage]}`}>
      <span className="meter-label">{shortNeed[key]}</span>
      <span className="meter-track" role="meter" aria-label={`${character.name} ${needLabels[key]}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}>
        <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }}/>
      </span>
      <span className="meter-value">{Math.round(value)}{!!delta && <em>{signed(delta)}</em>}</span>
    </div>;
  })}</div>;
}

/** Everyone at a glance: where they are, what they are doing, mood, mental energy and the four needs. */
export default function CharacterStatusBoard({ world, selected, onSelect }: { world: World; selected: string; onSelect: (id: string) => void }) {
  return <section className="panel status-board" aria-label="人物狀態">
    <div className="section-head"><h2>人物狀態</h2><span>觀察者數值 · {world.characters.length} 人</span></div>
    <ul>{world.characters.map(character => {
      const remaining = activityStatus(world, character);
      return <li key={character.id} className={selected === character.id ? 'is-selected' : ''} style={{ '--character-color': character.color } as CSSProperties} data-status-character={character.id}>
        <button type="button" className="status-head" aria-pressed={selected === character.id} onClick={() => onSelect(character.id)}>
          <span className="status-avatar"><PixelSprite id={character.id} name={character.name} sourceId={character.profileSource?.id}/></span>
          <span className="status-name"><strong>{character.name}</strong><small>{whereabouts(world, character)}</small></span>
          <span className="status-mood">{character.mood}</span>
        </button>
        <p className="status-activity">{observedActivityStatus(world, character)}{remaining && <small> · {remaining}</small>}</p>
        <MentalMeter character={character}/>
        <NeedMeters character={character}/>
      </li>;
    })}</ul>
  </section>;
}
