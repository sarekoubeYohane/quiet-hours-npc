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
export type Observation = { id: string; time: number; sense: 'sight' | 'hearing'; kind: 'person' | 'speech' | 'sound' | 'door' | 'activity'; text: string; clarity: 'clear' | 'vague'; source?: string; region?: string };
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

export type PerceptionTrace = { characterId: string; status: 'direct' | 'uncertain' | 'no-opportunity'; observations: Observation[]; reason: string };
export type SensoryCandidate = { sense: Observation['sense']; kind: Observation['kind']; text: string; clarity: Observation['clarity']; source?: string; region?: string; direct: boolean };
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
    if (audible || canHear(world, observer, origin)) return [{ sense: 'hearing', kind: 'sound', text: '門外傳來腳步聲。', clarity: 'vague', direct: world.scene?.noise[here] !== 'loud' }];
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
    return [{ sense: 'hearing', kind: clear ? 'speech' : 'sound', text: clear ? `${actor.name} 說：「${event.scene.content}」` : '聽見模糊的說話聲。', clarity: clear ? 'clear' : 'vague', ...(clear ? { source: actor.id } : {}), region: here, direct: clear }];
  }
  if (['work', 'rest', 'attempt'].includes(event.kind) && visible) return [{ sense: 'sight', kind: 'activity', text: event.text, clarity: 'clear', source: actor.id, region: destination, direct: true }];
  return [];
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
    const observations: Observation[] = candidates.filter(item => item.direct).map(({ sense, kind, text, clarity, source, region }, index) => ({ sense, kind, text, clarity, source, region, id: `${event.id}:${character.id}:${index}`, time: world.minute }));
    for (const observation of observations) saveObservation(world, character, observation);
    if (observations.length) audience.push(character.id);
    event.perception.push({ characterId: character.id, status: observations.length ? 'direct' : candidates.length ? 'uncertain' : 'no-opportunity', observations, reason: observations.length ? '直接察覺' : candidates.length ? '線索不清楚，待感知判定' : '沒有可接觸的線索' });
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
