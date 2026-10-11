import { judgeD20, rollD20, type Resolution, type Advantage, type Difficulty } from './d20';
import type { Character, World } from './world';

export type Region = { id: string; location: string; name: string };
export type Door = { id: string; name: string; regions: [string, string] };
// Layout is replaceable data; sensory rules do not depend on room names or counts.
export const regions: Region[] = [
  { id: 'kris-home-main', location: 'kris-home', name: '室內' },
  { id: 'vera-home-main', location: 'vera-home', name: '室內' },
  { id: 'cafe-front', location: 'cafe', name: '前台' },
  { id: 'cafe-storeroom', location: 'cafe', name: '儲藏室' },
];
export const doors: Door[] = [{ id: 'cafe-door', name: '儲藏室門', regions: ['cafe-front', 'cafe-storeroom'] }];
export type SceneState = { doors: Record<string, 'open' | 'closed'>; noise: Record<string, 'quiet' | 'loud'>; occluded: string[] };
export type Observation = { id: string; time: number; sense: 'sight' | 'hearing'; kind: 'person' | 'speech' | 'sound' | 'door' | 'activity'; text: string; clarity: 'clear' | 'vague'; source?: string; region?: string; urgency?: 'danger' | 'strong' | 'direct' };
export function defaultRegion(location: string) { return regions.find(region => region.location === location)!.id; }
export function regionOf(character: Character) { return character.region || defaultRegion(character.location); }
export function normalizePerception(world: World) {
  world.scene ??= { doors: {}, noise: {}, occluded: [] };
  for (const door of doors) world.scene.doors[door.id] ??= 'open';
  for (const character of world.characters) {
    if (!regions.some(region => region.id === character.region && region.location === character.location)) character.region = defaultRegion(character.location);
    character.observations ??= [];
  }
}
export function connectingDoor(from: string, to: string) { return doors.find(door => door.regions.includes(from) && door.regions.includes(to)); }
export function canSee(world: World, observer: Character, region: string) {
  const own = regionOf(observer);
  if (world.scene?.occluded.includes(region)) return false;
  if (own === region) return true;
  const door = connectingDoor(own, region);
  return !!door && (world.scene?.doors[door.id] || 'open') === 'open';
}

export type PerceptionTrace = { characterId: string; status: 'direct' | 'uncertain' | 'no-opportunity' | 'noticed' | 'missed'; observations: Observation[]; reason: string; opportunity?: string; resolution?: Resolution; factors?: { ability: number; attention: number; interference: string } };
export type SensoryCandidate = { sense: Observation['sense']; kind: Observation['kind']; text: string; clarity: Observation['clarity']; source?: string; region?: string; urgency?: Observation['urgency']; direct: boolean; interference?: 'weak' | 'medium' | 'strong' };
export function canHear(world: World, observer: Character, region: string) {
  return regionOf(observer) === region || !!connectingDoor(regionOf(observer), region);
}
export function eventCandidates(world: World, observer: Character, event: import('./world').WorldEvent): SensoryCandidate[] {
  const actor = world.characters.find(c => c.id === event.actor);
  if (!actor || !event.scene) return [];
  const here = regionOf(observer), destination = event.scene.toRegion || regionOf(actor);
  const origin = event.scene.fromRegion || destination;
  const visible = canSee(world, observer, destination);
  const audible = canHear(world, observer, destination);
  if (event.kind === 'move') {
    if (visible) return [{ sense: 'sight', kind: 'person', text: `${actor.name} 來到了${regions.find(r => r.id === destination)?.name || '這裡'}。`, clarity: 'clear', source: actor.id, region: destination, direct: true }];
    if (canSee(world, observer, origin)) return [{ sense: 'sight', kind: 'person', text: `${actor.name} 離開了這裡。`, clarity: 'clear', source: actor.id, region: origin, direct: true }];
    const clues: SensoryCandidate[] = [];
    const doorway = connectingDoor(here, destination);
    if (world.scene?.occluded.includes(destination) && (here === destination || doorway && world.scene.doors[doorway.id] === 'open')) clues.push({ sense: 'sight', kind: 'person', text: '遮擋處有人影晃過。', clarity: 'vague', region: destination, direct: false, interference: 'medium' });
    if (audible || canHear(world, observer, origin)) clues.push({ sense: 'hearing', kind: 'sound', text: '附近傳來腳步聲。', clarity: 'vague', direct: world.scene?.noise[here] !== 'loud', interference: 'medium' });
    return clues;
  }
  if (event.kind === 'door') {
    const door = doors.find(d => d.id === event.scene?.target);
    if (!door?.regions.includes(here)) return [];
    const state = world.scene?.doors[door.id] === 'closed' ? '關上' : '打開';
    return [{ sense: visible ? 'sight' : 'hearing', kind: 'door', text: `${door.name}${state}了。`, clarity: 'clear', region: here, ...(visible ? { source: actor.id } : {}), direct: true }];
  }
  if (['say', 'attempt'].includes(event.kind) && event.scene.content && event.scene.target !== 'observer') {
    if (!audible) return [];
    const clear = visible && world.scene?.noise[here] !== 'loud';
    return [{ sense: 'hearing', kind: clear ? 'speech' : 'sound', text: clear ? `${actor.name} 說：「${event.scene.content}」` : '聽見模糊的說話聲。', clarity: clear ? 'clear' : 'vague', ...(clear ? { source: actor.id } : {}), region: here, interference: world.scene?.noise[here] === 'loud' && !visible ? 'strong' : 'medium', ...(clear && event.scene.target === observer.id ? { urgency: 'direct' as const } : {}), direct: clear }];
  }
  if (['work', 'rest', 'attempt'].includes(event.kind) && visible) return [{ sense: 'sight', kind: 'activity', text: event.text, clarity: 'clear', source: actor.id, region: destination, direct: true }];
  return [];
}
// Controlled configuration: prose personality and model output never grant abilities.
export const perceptionRules = {
  abilities: {
    sight: { '視覺敏銳': 2, '視覺極敏銳': 4, '視力較弱': -2, '視力很弱': -4 },
    hearing: { '聽覺敏銳': 2, '聽覺極敏銳': 4, '聽力較弱': -2, '聽力很弱': -4 },
  } as Record<Observation['sense'], Record<string, number>>,
  difficulty: { weak: 8, medium: 12, strong: 16 } as const,
};
export function resolvePerception(world: World, character: Character, eventId: string, candidates: SensoryCandidate[]) {
  const here = regionOf(character);
  const interference = candidates.reduce<'weak' | 'medium' | 'strong'>((best, candidate) => perceptionRules.difficulty[candidate.interference || 'weak'] < perceptionRules.difficulty[best] ? candidate.interference || 'weak' : best, 'strong');
  const dc: Difficulty = perceptionRules.difficulty[interference];
  const ability = Math.max(...candidates.map(candidate => {
    const values = (character.abilityTags || []).map(tag => perceptionRules.abilities[candidate.sense][tag]).filter(value => value !== undefined);
    return values.length ? values.reduce((a, b) => Math.abs(a) >= Math.abs(b) ? a : b) : 0;
  }));
  const action = character.plan?.action;
  const attention = action?.type === 'observe' && (!action.target || action.target === here) ? 2 : action && ['work', 'attempt', 'reflect'].includes(action.type) ? -2 : 0;
  const modifier = Math.max(-4, Math.min(4, ability + attention)) as Advantage;
  const resolution = judgeD20(rollD20(), modifier, dc);
  const opportunity = JSON.stringify([eventId, character.id, here, candidates.map(c => c.sense).sort(), interference, ability, attention]);
  const selected = ['success', 'critical-success'].includes(resolution.outcome) ? candidates : resolution.outcome === 'mixed' ? candidates.map(candidate => ({ ...candidate, text: candidate.sense === 'hearing' ? '似乎聽見一點模糊的聲響。' : '似乎看見一點模糊的動靜。', clarity: 'vague' as const, source: undefined })) : [];
  return { opportunity, resolution, factors: { ability, attention, interference }, candidates: selected };
}
export function remember(world: World, character: Character, text: string) {
  const memory = { time: world.minute, text };
  character.memories = [...character.memories, memory].slice(-80);
  if (character.control && (character.control.mode === 'taken-over' || character.control.experiences !== undefined)) character.control.experiences = [...(character.control.experiences || []), memory].slice(-80);
}
export function saveObservation(world: World, character: Character, observation: Observation) {
  character.observations ??= [];
  if (character.observations.some(item => item.id === observation.id)) return;
  character.observations.push(observation);
  remember(world, character, observation.text);
}
// Called only for newly confirmed events. Reload/normalization never replays history.
export function perceiveEvent(world: World, event: import('./world').WorldEvent) {
  if (event.perception) return;
  const privateEvent = ['reflect', 'message', 'intervention', 'blocked', 'observe'].includes(event.kind) || event.scene?.target === 'observer';
  if (event.kind === 'continue') return;
  if (privateEvent || !event.scene) {
    for (const character of world.characters) if (event.audience.includes(character.id)) remember(world, character, event.text);
    return;
  }
  event.perception = [];
  const audience: string[] = [];
  for (const character of world.characters) {
    if (character.id === event.actor) { remember(world, character, event.text); audience.push(character.id); continue; }
    const candidates = eventCandidates(world, character, event);
    const uncertain = candidates.filter(item => !item.direct);
    const trial = uncertain.length ? resolvePerception(world, character, event.id, uncertain) : undefined;
    const selected = [...candidates.filter(item => item.direct), ...(trial?.candidates || [])];
    const observations: Observation[] = selected.map(({ sense, kind, text, clarity, source, region, urgency }, index) => ({ sense, kind, text, clarity, source, region, urgency, id: `${event.id}:${character.id}:${index}`, time: world.minute }));
    for (const observation of observations) saveObservation(world, character, observation);
    if (observations.length) audience.push(character.id);
    event.perception.push({ characterId: character.id, status: trial ? observations.length ? 'noticed' : 'missed' : observations.length ? 'direct' : 'no-opportunity', observations, reason: trial ? observations.length ? '察覺可接觸的線索' : '有感知機會但未察覺新線索' : observations.length ? '直接察覺' : '沒有可接觸的線索', ...(trial ? { opportunity: trial.opportunity, resolution: trial.resolution, factors: trial.factors } : {}) });
  }
  // Entering a region or opening its door reveals current visible people, never old events.
  if (event.kind === 'move' || event.kind === 'door') {
    const affected = world.characters.filter(c => c.id === event.actor || doors.find(d => d.id === event.scene?.target)?.regions.includes(regionOf(c)));
    for (const character of affected) {
      const visible = world.characters.filter(other => other.id !== character.id && canSee(world, character, regionOf(other)));
      for (const other of visible) {
        const observation: Observation = { id: `${event.id}:${character.id}:present:${other.id}`, time: world.minute, sense: 'sight', kind: 'person', text: `看見 ${other.name} 在${regions.find(r => r.id === regionOf(other))?.name}。`, clarity: 'clear', source: other.id, region: regionOf(other) };
        saveObservation(world, character, observation);
        let trace = event.perception.find(t => t.characterId === character.id);
        if (!trace) { trace = { characterId: character.id, status: 'direct', observations: [], reason: '場景變化後直接看見' }; event.perception.push(trace); }
        trace.observations.push(observation); trace.status = 'direct';
      }
    }
  }
  event.audience = audience;
}
export function knownScene(world: World, character: Character) {
  const here = regionOf(character);
  return { region: regions.find(r => r.id === here),
    exits: doors.filter(d => d.regions.includes(here)).map(d => ({ id: d.id, name: d.name, state: world.scene?.doors[d.id] || 'open', destination: regions.find(r => r.id === d.regions.find(id => id !== here)) })),
  };
}
