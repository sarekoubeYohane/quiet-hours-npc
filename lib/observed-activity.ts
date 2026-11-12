import type { Action, ActivityPlan, Character, World, WorldEvent } from './world';
import type { Outcome } from './d20';
import { worldDoors, worldLocations, worldRegions } from './world-configuration';

export type ObservedActivity = { id: string; label: string };
export type ActivityObservation = {
  activity: ObservedActivity;
  state: 'attempted' | 'started' | 'continuing' | 'progress' | 'completed' | 'period-ended' | 'attempt-ended' | 'partial' | 'not-started' | 'failed' | 'paused' | 'resumed' | 'stopped';
  detail?: string;
};
export type ActivityTransition = ActivityObservation & { actor: string; time: number; afterEventId?: string };

const excerpt = (value: string, limit: number) => value.replace(/\s+/g, ' ').trim().slice(0, limit);
const workLabels: Record<string, string> = {
  tea: '泡茶', tidy: '收拾桌面', craft: '繪製髮飾設計',
  'craft-challenge': '構思較困難的髮飾設計', 'craft-easy-challenge': '設計簡單的髮飾變化',
  'craft-expert-challenge': '設計複雜的髮飾樣式', 'study-craft': '研究布料與髮飾',
};

export function activityLabel(world: World, action: Action, confirmedLabel?: string): string {
  const id = action.target;
  const resources = [...(world.objects ?? []), ...(world.supplies ?? [])];
  const resource = id ? resources.find(item => item.id === id) : undefined;
  const matching = resource ? resources.filter(item => item.label === resource.label).map(item => item.id).sort() : [];
  const qualifier = resource && matching.length > 1 ? `（${excerpt(resource.label, 40)} · 第 ${matching.indexOf(resource.id) + 1} 件）` : '';
  const target = resource?.label ??
    world.characters.find(character => character.id === id)?.name ??
    worldDoors(world).find(door => door.id === id)?.name ??
    worldRegions(world).find(region => region.id === id)?.name ??
    worldLocations(world).find(place => place.id === id)?.name;
  switch (action.type) {
    case 'rest': return '休息';
    case 'reflect': return '思考';
    case 'observe': return (action.content === 'hearing' ? `專注聆聽${target ?? ''}附近的動靜` : `仔細查看${target ?? '附近的情況'}`) + qualifier;
    case 'door': return (action.content === 'close' ? '關上' : '打開') + (target ?? '指定的門');
    case 'move': return '前往' + (target ?? '目的地');
    case 'say': case 'shout': return (id === 'observer' ? '回覆觀察者' : `向${target ?? '對方'}${action.type === 'shout' ? '大聲說話' : '說話'}`);
    case 'persuade': return '試著說服' + (target ?? '對方');
    case 'message': return '傳訊息給' + (target ?? '對方');
    case 'phone': return '操作手機';
    case 'work': return confirmedLabel || (id && Object.hasOwn(workLabels, id) ? workLabels[id] : '工作');
    case 'propose': {
      const label = excerpt(confirmedLabel || (action.content ?? '').split(/[。！？；\n]|(?:，|,)\s*(?:希望|打算|以便|讓|使)/u)[0], 100) || '嘗試所提方法';
      const suffix = qualifier || (target && !label.includes(target) ? `（${excerpt(target, 64)}）` : '');
      return excerpt(label, 140 - suffix.length) + suffix;
    }
    case 'pause': return '暫停活動';
    case 'resume': return '恢復活動';
    case 'abandon': return '放棄活動';
  }
}

export function newObservedActivity(world: World, action: Action, label?: string): ObservedActivity {
  return newActivitySnapshot(activityLabel(world, action, label));
}

export function newActivitySnapshot(label: string): ObservedActivity {
  return { id: crypto.randomUUID(), label: excerpt(label, 140) };
}

export function activityEndState(outcome: Outcome | null | undefined,
  ending: 'completed' | 'period-ended' | 'attempt-ended'): ActivityObservation['state'] {
  // An open period ending says nothing about the goal. Any rolled result
  // remains visible in the committed event's detail and roll.
  if (ending === 'period-ended') return ending;
  if (outcome === 'failure' || outcome === 'critical-failure') return 'failed';
  if (outcome === 'mixed') return 'partial';
  return ending;
}

export function activityForPlan(world: World, character: Character, plan: ActivityPlan): ObservedActivity {
  return plan.observedActivity ?? {
    id: `legacy:${character.id}:${plan.startedAt}`,
    label: excerpt(activityLabel(world, plan.action), 140),
  };
}

// A control change can stop work without producing a sensory event.
export function saveActivityTransition(world: World, character: Character, observation: ActivityObservation): void {
  const previousEvent = world.events.at(-1);
  const afterEventId = previousEvent?.time === world.minute ? previousEvent.id : undefined;
  world.activityTransitions = [...(world.activityTransitions ?? []),
    { ...observation, actor: character.id, time: world.minute, afterEventId }].slice(-300);
}

export function observeActivity(event: WorldEvent | undefined, activity: ObservedActivity | undefined,
  state: ActivityObservation['state'], detail?: string): void {
  if (event && activity) event.activityObservation = { activity, state, ...(detail ? { detail: excerpt(detail, 480) } : {}) };
}

export function activityObservationText({ activity, state, detail }: ActivityObservation): string {
  const label = activity.label;
  const text: Record<ActivityObservation['state'], string> = {
    attempted: `嘗試「${label}」`,
    started: `開始「${label}」，尚未完成`,
    continuing: `正在「${label}」，尚未完成`,
    progress: `「${label}」有進展，活動尚未完成`,
    completed: `「${label}」已完成`,
    partial: `「${label}」已執行，只有部分成果`,
    'period-ended': `「${label}」的活動時段已結束`,
    'attempt-ended': `「${label}」的這次嘗試已結束`,
    'not-started': `未能開始「${label}」`,
    failed: `「${label}」執行後未能完成`,
    paused: `已暫停「${label}」`,
    resumed: `已恢復「${label}」，尚未完成`,
    stopped: `已停止「${label}」`,
  };
  return text[state] + (detail ? `：${detail}` : '。');
}

export function observedEventText(event: WorldEvent, actor?: Character): string {
  const observation = event.activityObservation;
  if (observation) return activityObservationText(observation.state === 'started' ? { ...observation, detail: undefined } : observation);
  const legacyFreeStart = event.kind === 'work' && event.text.endsWith('；活動尚未完成。');
  if (event.kind !== 'activity-start' && !legacyFreeStart) return event.text;
  const evidence = actor?.habitEvidence?.find(item => item.eventId === event.id && item.time === event.time &&
    item.started && !item.semanticGap);
  const label = excerpt(evidence?.confirmedIdentity?.label || evidence?.activityLabel || '', 140);
  if (label) {
    const start = activityObservationText({ activity: { id: event.id, label }, state: 'started' });
    if (!legacyFreeStart || event.text.endsWith(' 開始進行這項活動；活動尚未完成。')) return start;
    return `${start} ${event.text}`;
  }
  return event.text + '（活動內容未記錄）';
}

export function observedActivityStatus(world: World, character: Character): string {
  const plan = character.plan;
  if (plan?.observedActivity) return activityObservationText({ activity: plan.observedActivity, state: 'continuing' });
  if (plan?.deferredAction || plan?.phases) return `正在「${activityLabel(world, plan.action)}」，尚未完成。`;
  const recent = world.events.findLast(event => event.actor === character.id)?.activityObservation;
  if (!plan && recent && !['started', 'continuing', 'resumed', 'progress'].includes(recent.state) &&
      !/^(待命|已交還控制權)/.test(character.activity)) return activityObservationText(recent);
  return character.activity || '活動內容未記錄';
}
