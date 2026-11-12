import { activityObservationText, observedEventText } from './observed-activity';
/**
 * Observer-only projection of a saved world into one readable round log.
 * Pure: it reads events and the bounded per-character histories, and never
 * writes to the world or feeds anything back to NPC input (ADR 0004).
 */
import type { Resolution, Outcome } from './d20';
import type { World, WorldEvent, Character } from './world';
import { needKeys, needLabels } from './needs';

export type LogTone = 'good' | 'mixed' | 'bad' | 'neutral';
export type LogRoll = { context: string; who?: string; dice: string; result: string; tone: LogTone };
export type LogEntry = {
  id: string; time: number; actor: string; actorName: string; color?: string;
  source: 'event' | 'mental' | 'needs'; kind: string; text: string; rolls: LogRoll[]; event?: WorldEvent;
};
export type LogRound = { time: number; entries: LogEntry[] };

export const outcomeLabels: Record<Outcome, string> = {
  'critical-success': '大成功', success: '成功', mixed: '部分成功', failure: '失敗', 'critical-failure': '大失敗',
};
const outcomeTone: Record<Outcome, LogTone> = {
  'critical-success': 'good', success: 'good', mixed: 'mixed', failure: 'bad', 'critical-failure': 'bad',
};
const kindLabels: Record<string, string> = {
  say: '說話', shout: '大聲說話', persuade: '說服', message: '私人訊息', reflect: '私密想法', move: '移動', depart: '出發',
  door: '開關門', blocked: '規則攔截', intervention: '介入事件', continue: '延續活動', 'activity-start': '開始活動',
  observe: '主動查探', rest: '休息', work: '工作', phone: '手機', external: '外在變化',
};
const isD100 = (resolution: Resolution) => resolution.system === 'd100-v1' || resolution.system === 'd100-v2';
export const signed = (value: number) => (value > 0 ? '+' : value < 0 ? '−' : '±') + Math.abs(value);
const tenth = (value: number) => Math.round(value * 10) / 10;

export function eventKindLabel(event: WorldEvent): string {
  if (event.kind === 'say' && event.scene?.target === 'observer') return '回覆你';
  if (event.kind === 'attempt') return event.resolution && isD100(event.resolution) ? 'd100 判定' : 'D20 判定';
  return kindLabels[event.kind] ?? '生活片段';
}

export function rollOf(resolution: Resolution, context: string, who?: string): LogRoll {
  const dice = isD100(resolution)
    ? `d100 ${String(resolution.roll).padStart(2, '0')} ／ 門檻 ${resolution.threshold}`
    : `D20 ${resolution.roll}${resolution.modifier >= 0 ? '+' : '−'}${Math.abs(resolution.modifier)} 對 DC ${resolution.dc}`;
  return { context, who, dice, result: outcomeLabels[resolution.outcome], tone: outcomeTone[resolution.outcome] };
}

function eventEntry(world: World, event: WorldEvent): LogEntry {
  const actor = world.characters.find(c => c.id === event.actor);
  const rolls: LogRoll[] = [];
  if (event.resolution) rolls.push(rollOf(event.resolution, '行動檢定', actor?.name));
  for (const trace of event.perception ?? []) {
    if (trace.resolution) rolls.push(rollOf(trace.resolution, '感知', world.characters.find(c => c.id === trace.characterId)?.name));
  }
  return {
    id: 'event:' + event.id, time: event.time, actor: event.actor, color: actor?.color,
    actorName: actor?.name ?? (event.actor === 'observer' ? '觀察者' : '世界'),
    source: 'event', kind: eventKindLabel(event),
    text: observedEventText(event, actor), rolls, event,
  };
}

function eventEntries(world: World, event: WorldEvent): LogEntry[] {
  const observation = event.activityObservation;
  if (observation?.state === 'continuing') return [];
  const entry = eventEntry(world, event);
  if (observation?.state !== 'started' || !observation.detail) return [entry];
  return [entry, {
    ...entry, id: entry.id + ':progress', kind: '活動進展', rolls: [], event: undefined,
    text: activityObservationText({ ...observation, state: 'progress' }),
  }];
}

function activityEntries(world: World): LogEntry[] {
  const eventIds = new Set(world.events.map(event => event.id));
  const anchored = new Map<string, LogEntry[]>();
  const unanchored: LogEntry[] = [];
  for (const transition of world.activityTransitions ?? []) {
    const actor = world.characters.find(character => character.id === transition.actor);
    const entry: LogEntry = { id: `activity:${transition.activity.id}:${transition.state}`, time: transition.time,
      actor: transition.actor, actorName: actor?.name ?? '世界', color: actor?.color, source: 'event',
      kind: '活動狀態', text: activityObservationText(transition), rolls: [] };
    if (transition.afterEventId && eventIds.has(transition.afterEventId)) {
      anchored.set(transition.afterEventId, [...(anchored.get(transition.afterEventId) ?? []), entry]);
    } else unanchored.push(entry);
  }
  return [...unanchored, ...world.events.flatMap(event => [
    ...eventEntries(world, event), ...(anchored.get(event.id) ?? []),
  ])];
}

function mentalEntries(character: Character): LogEntry[] {
  const state = character.mentalEnergy;
  if (!state || !Array.isArray(state.history)) return [];
  type Entry = typeof state.history[number];
  const groups = new Map<string, Entry[]>();
  state.history.forEach((entry, index) => {
    const key = entry.groupId ?? `${entry.kind}:${entry.from}:${entry.minute}:${entry.kind === 'regulation' ? index : ''}`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  });
  return [...groups.entries()].flatMap(([key, entries]) => {
    const first = entries[0], last = entries.at(-1)!, draws = entries.flatMap(entry => entry.draws ?? []);
    const actual = last.after - first.before;
    if (!actual && !draws.length) return [];
    const reason = first.kind === 'regulation' ? `主動情緒調節：${first.reason}`
      : first.kind === 'experience' ? entries.map(entry => entry.reason).filter(Boolean).join('；') || '經歷帶來的感受'
      : draws.length ? '清醒與活動的自然收支' : first.reason;
    const sleep = first.sleepDelta ? `；睡眠回電 ${signed(first.sleepDelta)}` : '';
    return [{
      id: `mental:${character.id}:${key}`, time: last.minute, actor: character.id, actorName: character.name, color: character.color,
      source: 'mental' as const, kind: '精神電量',
      text: `精神電量 ${first.before} → ${last.after}（${signed(actual)}）· ${reason}${sleep}`,
      rolls: draws.map(draw => ({
        context: draw.die === 6 ? '自然消耗' : draw.reason ?? '主觀感受', who: character.name,
        dice: `d${draw.die} 骰出 ${draw.face}`, result: signed(draw.rawDelta),
        tone: draw.rawDelta > 0 ? 'good' as const : draw.rawDelta < 0 ? 'bad' as const : 'neutral' as const,
      })),
    }];
  });
}

function needEntries(character: Character): LogEntry[] {
  const history = character.needs?.history;
  if (!Array.isArray(history)) return [];
  return history.flatMap((entry, index) => {
    const changes = needKeys.flatMap(key => {
      const delta = tenth(entry.after[key] - entry.before[key]);
      return delta ? [`${needLabels[key]} ${signed(delta)}`] : [];
    });
    if (!changes.length) return [];
    return [{
      id: `needs:${character.id}:${entry.minute}:${index}`, time: entry.minute, actor: character.id, actorName: character.name,
      color: character.color, source: 'needs' as const, kind: '身體需求', text: `${changes.join(' · ')}（${entry.reason}）`, rolls: [],
    }];
  });
}

/** All entries, oldest first within a round; rounds are returned newest first. */
export function observationLog(world: World): LogRound[] {
  const entries = [
    ...activityEntries(world),
    ...world.characters.flatMap(mentalEntries),
    ...world.characters.flatMap(needEntries),
  ];
  const rounds = new Map<number, LogEntry[]>();
  for (const entry of entries) rounds.set(entry.time, [...(rounds.get(entry.time) ?? []), entry]);
  return [...rounds.entries()].sort((a, b) => b[0] - a[0]).map(([time, list]) => ({ time, entries: list }));
}

/** Net change recorded at the character's latest settled minute; undefined when nothing is recorded. */
export function latestMentalChange(character: Character): number | undefined {
  const history = character.mentalEnergy?.history;
  if (!Array.isArray(history) || !history.length) return undefined;
  const minute = history.at(-1)!.minute, recent = history.filter(entry => entry.minute === minute);
  return recent.at(-1)!.after - recent[0].before;
}
export function latestNeedChange(character: Character): Partial<Record<typeof needKeys[number], number>> | undefined {
  const history = character.needs?.history;
  if (!Array.isArray(history) || !history.length) return undefined;
  const minute = history.at(-1)!.minute, recent = history.filter(entry => entry.minute === minute);
  return Object.fromEntries(needKeys.map(key => [key, tenth(recent.at(-1)!.after[key] - recent[0].before[key])]));
}
