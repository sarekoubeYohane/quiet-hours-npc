import { isSleeping, isSleepStimulus } from './needs';
import { knownExternalState, type PhysicalState } from './world-state';
import { addExperience } from './memory';
import { judgeD20, rollD20, type Resolution, type Advantage, type Difficulty } from './d20';
import type { Character, World } from './world';
import { falsePerception, type FalsePerceptionDiagnostic } from './false-perception';

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
export type CurrentSensoryState = { presence: Record<string, { region: string; clue: string }>; activities: Record<string, { clue: string; region: string; action: import('./world').Action }> };
export type SceneState = { doors: Record<string, 'open' | 'closed'>; noise: Record<string, 'quiet' | 'loud'>; occluded: string[]; external?:Record<string,PhysicalState> };
export type Observation = { id: string; time: number; sense: 'sight' | 'hearing' | 'touch'; kind: 'person' | 'speech' | 'sound' | 'door' | 'activity'; text: string; clarity: 'clear' | 'vague'; source?: string; objectId?: string; supplyId?: string; region?: string; urgency?: 'danger' | 'strong' | 'direct' };
export class PerceptionCapacityError extends Error {}
// Confirmed by the existing world adjudication/routine binder, never an NPC
// wording, a clock value or an arbitrary caller-supplied retry token.
export type DiscoveryMethod = {version:1;kind:'activity'|'routine';key:string};
export function defaultRegion(location: string) { return regions.find(region => region.location === location)!.id; }
export function regionOf(character: Character) { return character.region || defaultRegion(character.location); }
export function normalizePerception(world: World) {
  world.perceptionTrials ??= {};
  world.probeResults ??= {};
  world.currentSensory ??= { presence: {}, activities: {} };
  world.scene ??= { doors: {}, noise: {}, occluded: [] };
  for (const door of doors) world.scene.doors[door.id] ??= 'open';
  for (const character of world.characters) {
    if (!regions.some(region => region.id === character.region && region.location === character.location)) character.region = defaultRegion(character.location);
    character.observations ??= [];
    if (!world.currentSensory.presence[character.id]) world.currentSensory.presence[character.id] = { region: regionOf(character), clue: `initial:${character.id}:${regionOf(character)}` };
  }
}
export function connectingDoor(from: string, to: string) { return doors.find(door => door.regions.includes(from) && door.regions.includes(to)); }
export function canSee(world: World, observer: Character, region: string) {
  if(isSleeping(observer))return false;
  const own = regionOf(observer);
  if (world.scene?.occluded.includes(region)) return false;
  if (own === region) return true;
  const door = connectingDoor(own, region);
  return !!door && (world.scene?.doors[door.id] || 'open') === 'open';
}

export type PerceptionTrace = { characterId: string; status: 'direct' | 'uncertain' | 'no-opportunity' | 'noticed' | 'missed'; observations: Observation[]; reason: string; opportunity?: string; resolution?: Resolution; falsePerception?: FalsePerceptionDiagnostic; reusedResources?:{objectId?:string;supplyId?:string;status:PerceptionTrace['status']}[]; factors?: { ability: number; attention: number; interference: string } };
export type PerceptionTrial = { opportunity: string; resolution: Resolution; factors: { ability: number; attention: number; interference: string }; candidates: SensoryCandidate[]; falsePerception?: FalsePerceptionDiagnostic };
export type SensoryCandidate = { sense: Observation['sense']; kind: Observation['kind']; text: string; clarity: Observation['clarity']; source?: string; objectId?: string; supplyId?: string; region?: string; urgency?: Observation['urgency']; direct: boolean; interference?: 'weak' | 'medium' | 'strong' };
// Keep the original tuple for people/sounds so persisted pre-discovery receipts
// retain their meaning. A resource identity extends only resource candidates.
function sensoryCandidateIdentity(candidate: SensoryCandidate) {
  return [candidate.sense, candidate.kind, candidate.text, candidate.source, candidate.region, ...(candidate.objectId ? [{ objectId: candidate.objectId }] : candidate.supplyId ? [{ supplyId: candidate.supplyId }] : [])];
}
export function canHear(world: World, observer: Character, region: string) {
  return regionOf(observer) === region || !!connectingDoor(regionOf(observer), region);
}
export function eventCandidates(world: World, observer: Character, event: import('./world').WorldEvent): SensoryCandidate[] {
  if(event.scene?.externalChanges){
    const clues:SensoryCandidate[]=[];
    for(const consequence of event.scene.externalChanges){
      if(consequence.target.type==='object'){
        const object=world.objects?.find(item=>item.id===consequence.target.id);
        if(object&&consequence.exposure==='public'&&(object.holder===observer.id||object.knownTo.includes(observer.id)&&canSee(world,observer,object.region)))clues.push({sense:'sight',kind:'activity',text:`${object.label} 的外在狀況：${consequence.changes.map(change=>`${change.key}：${change.value}`).join('，')}。`,clarity:'clear',region:object.region,direct:true});
      }else if(consequence.target.type==='body'){
        const target=world.characters.find(c=>c.id===consequence.target.id);if(!target)continue;
        const text=consequence.changes.map(change=>`${change.key}：${change.value}`).join('，');
        if(target.id===observer.id&&consequence.exposure!=='hidden')clues.push({sense:'touch',kind:'activity',text:`自己的身體狀況有變化：${text}。`,clarity:'clear',region:regionOf(target),urgency:'direct',direct:true});
        else if(consequence.exposure==='public'&&canSee(world,observer,regionOf(target)))clues.push({sense:'sight',kind:'activity',text:`${target.name} 的外在狀況：${text}。`,clarity:'clear',source:target.id,region:regionOf(target),direct:true});
      }else if(consequence.target.type==='environment'&&consequence.exposure==='public'&&canSee(world,observer,consequence.target.id)){
        clues.push({sense:'sight',kind:'activity',text:`${regions.find(r=>r.id===consequence.target.id)?.name||consequence.target.id}：${consequence.changes.map(change=>`${change.key}：${change.value}`).join('，')}。`,clarity:'clear',region:consequence.target.id,direct:true});
      }
    }
    return clues;
  }
  if(event.kind==='phone-notification'){
    const region=event.scene?.toRegion;if(!region||!canHear(world,observer,region))return [];
    const here=regionOf(observer),door=connectingDoor(here,region);
    if(here!==region&&door&&(world.scene?.doors[door.id]||'open')==='closed')return [];
    return [{sense:'hearing',kind:'sound',text:'附近一部手機響了一聲提示音。',clarity:'vague',region,direct:false,interference:world.scene?.noise[here]==='loud'?'strong':here===region?'weak':'medium'}];
  }
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
  if (['say', 'shout', 'attempt'].includes(event.kind) && event.scene.content && event.scene.target !== 'observer') {
    if (!audible) return [];
    const doorway = connectingDoor(here, destination);
    const content = event.scene.content;
    const clear = world.scene?.noise[here] !== 'loud' && (here === destination || !!doorway && world.scene?.doors[doorway.id] === 'open');
    const strong = event.kind === 'shout';
    // Scheduling urgency derives only from words actually perceived; a warning
    // remains someone's speech and never creates danger in the scene.
    const warning = clear && perceptionRules.warningPrefixes.some(prefix => content.startsWith(prefix));
    const direction = doorway ? `${doorway.name}方向` : '附近';
    const text = clear ? visible ? `${actor.name} 說：「${content}」` : `聽見有人說：「${content}」` :
      strong ? `${direction}傳來大聲喊叫。` : visible ? `${actor.name} 的說話聲被噪音蓋住，聽不清內容。` : `${direction}傳來模糊的說話聲。`;
    return [{ sense: 'hearing', kind: clear ? 'speech' : 'sound', text, clarity: clear ? 'clear' : 'vague',
      ...(visible ? { source: actor.id } : {}), region: destination,
      interference: world.scene?.noise[here] === 'loud' && !visible ? 'strong' : 'medium',
      ...(warning ? { urgency: 'danger' as const } : strong ? { urgency: 'strong' as const } : clear && event.scene.target === observer.id ? { urgency: 'direct' as const } : {}), direct: strong || clear }];
  }
  if (['work', 'rest', 'attempt'].includes(event.kind) && visible) return [{ sense: 'sight', kind: 'activity', text: event.text, clarity: 'clear', source: actor.id, region: destination, direct: true }];
  return [];
}
// Controlled configuration: prose personality and model output never grant abilities.
export const perceptionRules = {
  warningPrefixes: ['小心！', '小心!', '救命！', '救命!', '失火了！', '失火了!', '快躲開！', '快躲開!'],
  abilities: {
    sight: { '視覺敏銳': 2, '視覺極敏銳': 4, '視力較弱': -2, '視力很弱': -4 },
    touch: {},
    hearing: { '聽覺敏銳': 2, '聽覺極敏銳': 4, '聽力較弱': -2, '聽力很弱': -4 },
  } as Record<Observation['sense'], Record<string, number>>,
  difficulty: { weak: 8, medium: 12, strong: 16 } as const,
};
export function resolvePerception(world: World, character: Character, eventId: string, candidates: SensoryCandidate[], focused = false) {
  const here = regionOf(character);
  const interference = candidates.reduce<'weak' | 'medium' | 'strong'>((best, candidate) => perceptionRules.difficulty[candidate.interference || 'weak'] < perceptionRules.difficulty[best] ? candidate.interference || 'weak' : best, 'strong');
  const dc: Difficulty = perceptionRules.difficulty[interference];
  const ability = Math.max(...candidates.map(candidate => {
    const values = (character.abilityTags || []).map(tag => perceptionRules.abilities[candidate.sense][tag]).filter(value => value !== undefined);
    return values.length ? values.reduce((a, b) => Math.abs(a) >= Math.abs(b) ? a : b) : 0;
  }));
  const action = character.plan?.action;
  const observing = action?.type === 'observe' && candidates.some(candidate => candidate.sense === (action.content === 'hearing' ? 'hearing' : 'sight') &&
    (!action.target || action.target === candidate.region || action.target === candidate.source));
  const attention = focused || observing ? 2 : action && ['work', 'attempt', 'reflect'].includes(action.type) ? -2 : 0;
  const modifier = Math.max(-4, Math.min(4, ability + attention)) as Advantage;
  const opportunity = JSON.stringify([eventId, character.id, here, candidates.map(sensoryCandidateIdentity).sort(), interference, ability, attention]);
  const previous = world.perceptionTrials?.[opportunity];
  if (previous) return previous;
  const resolution = judgeD20(rollD20(), modifier, dc);
  const falseResult = resolution.outcome === 'critical-failure' ? falsePerception(world, character, candidates) : undefined;
  const selected = ['success', 'critical-success'].includes(resolution.outcome) ? candidates : resolution.outcome === 'mixed' ? candidates.map(candidate => ({ ...candidate, text: candidate.sense === 'hearing' ? '似乎聽見一點模糊的聲響。' : '似乎看見一點模糊的動靜。', clarity: 'vague' as const, source: undefined, objectId: undefined, supplyId: undefined })) : [];
  const trial: PerceptionTrial = { opportunity, resolution, factors: { ability, attention, interference }, candidates: falseResult ? [falseResult.candidate] : selected, ...(falseResult ? { falsePerception: falseResult.diagnostic } : {}) };
  (world.perceptionTrials ??= {})[opportunity] = trial;
  return trial;
}
export function remember(world: World, character: Character, text: string, event?: { id: string; actor: string }) {
  addExperience(character, world.minute, text, undefined, event);
}
export function saveObservation(world: World, character: Character, observation: Observation) {
  addExperience(character, world.minute, observation.text, observation);
  if (observation.objectId && observation.clarity === 'clear') {
    const object = world.objects?.find(item => item.id === observation.objectId);
    if (object && !object.knownTo.includes(character.id)) object.knownTo.push(character.id);
  }
  if (observation.supplyId && observation.clarity === 'clear') {
    const supply = world.supplies?.find(item => item.id === observation.supplyId);
    if (supply && !supply.knownTo.includes(character.id)) supply.knownTo.push(character.id);
  }
  if(isSleeping(character)&&isSleepStimulus(observation)&&character.plan)character.plan.sleep={...character.plan.sleep,elapsedMinutes:character.plan.sleep?.elapsedMinutes??0,stimulusWakeAt:world.minute};
}
// Passive events and active probes share the same subjective projection and
// persistence; only their observer-facing explanations differ.
function observationTrace(world: World, character: Character, event: import('./world').WorldEvent, candidates: SensoryCandidate[], trial?: PerceptionTrial, active = false): PerceptionTrace {
  const selected = [...candidates.filter(candidate => candidate.direct), ...(trial?.candidates || [])];
  const observations: Observation[] = selected.map(({ sense, kind, text, clarity, source, objectId, supplyId, region, urgency }, index) => ({ sense, kind, text, clarity, source, ...(objectId ? { objectId } : {}), ...(supplyId ? { supplyId } : {}), region, urgency, id: `${event.id}:${character.id}:${index}`, time: world.minute }));
  for (const observation of observations) saveObservation(world, character, observation);
  const status = trial ? observations.length ? 'noticed' : 'missed' : observations.length ? 'direct' : 'no-opportunity';
  const reason = active ? trial?.falsePerception ? '主動查探取得錯誤主觀感知' : observations.length ? '主動查探當前線索' : '主動查探沒有取得新線索' :
    trial?.falsePerception ? '取得錯誤主觀感知' : trial ? observations.length ? '察覺可接觸的線索' : '有感知機會但未察覺新線索' : observations.length ? '直接察覺' : '沒有可接觸的線索';
  return { characterId: character.id, status, observations, reason, ...(trial ? { opportunity: trial.opportunity, resolution: trial.resolution, factors: trial.factors, ...(trial.falsePerception ? { falsePerception: trial.falsePerception } : {}) } : {}) };
}
// Called only for newly confirmed events. Reload/normalization never replays history.
export function perceiveEvent(world: World, event: import('./world').WorldEvent, actorExperience?: string) {
  if (event.perception) return;
  normalizePerception(world);
  if (event.actor && event.scene && ['move', 'work', 'rest', 'reflect', 'observe', 'say', 'shout', 'attempt', 'door', 'message'].includes(event.kind)) {
    if (event.kind === 'move') world.currentSensory!.presence[event.actor] = { region: event.scene.toRegion!, clue: event.id };
    world.currentSensory!.activities[event.actor] = { clue: event.id, region: event.scene.toRegion!, action: { type: event.kind as import('./world').Action['type'], target: event.scene.target } };
  }
  const privateEvent = ['reflect', 'message', 'intervention', 'blocked', 'observe'].includes(event.kind) || event.scene?.target === 'observer';
  if (event.kind === 'continue') return;
  if (privateEvent || !event.scene) {
    for (const character of world.characters) if (event.audience.includes(character.id)&&(!isSleeping(character)||event.actor===character.id)) remember(world, character, character.id===event.actor?actorExperience??event.text:event.text, event);
    return;
  }
  for(const change of event.scene.externalChanges||[])if(change.target.type==='body'&&change.movement)world.currentSensory!.presence[change.target.id]={region:change.movement.toRegion,clue:event.id};
  event.perception = [];
  const audience: string[] = [];
  for (const character of world.characters) {
    if (character.id === event.actor && !event.scene.externalChanges) { remember(world, character, actorExperience ?? event.text, event); audience.push(character.id); continue; }
    const candidates = eventCandidates(world, character, event).filter(candidate=>!isSleeping(character)||isSleepStimulus(candidate));
    const uncertain = candidates.filter(item => !item.direct);
    const trial = uncertain.length ? resolvePerception(world, character, event.id, uncertain) : undefined;
    const trace = observationTrace(world, character, event, candidates, trial);
    if (trace.observations.length) audience.push(character.id);
    event.perception.push(trace);
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
  return { region: regions.find(r => r.id === here), external:canSee(world,character,here)?knownExternalState(world.scene?.external?.[here]):undefined,
    exits: doors.filter(d => d.regions.includes(here)).map(d => ({ id: d.id, name: d.name, state: world.scene?.doors[d.id] || 'open', destination: regions.find(r => r.id === d.regions.find(id => id !== here)) })),
  };
}

export function observationTargets(world: World, character: Character) {
  const scene = knownScene(world, character);
  return { regions: [scene.region!, ...scene.exits.map(exit => exit.destination!)], people: world.characters.filter(c => c.id !== character.id).map(c => ({ id: c.id, name: c.name })) };
}
export function validateProbe(world: World, character: Character, target?: string) {
  if (!target) return;
  const known = observationTargets(world, character);
  if (!known.regions.some(r => r.id === target) && !known.people.some(c => c.id === target)) throw Error('只能查探已知的附近區域或對象');
}
// World-side discovery input, never the NPC's known-object projection. No dice,
// memory or world writes occur here, so candidate validation can use a clone.
export function objectObservationCandidates(world: World, character: Character, ids?: string[]): SensoryCandidate[] {
  if ((world.objects?.length || 0) > 512) throw new PerceptionCapacityError('物品探索超過世界物件容量；未截斷執行依據。');
  return (world.objects || []).filter(object => (!ids || ids.includes(object.id)) && object.lifecycle === 'active' && canSee(world, character, object.region) &&
    (object.holder === null || world.characters.some(holder => holder.id === object.holder && regionOf(holder) === object.region)))
    .map(object => ({ sense: 'sight', kind: 'activity', objectId: object.id, region: object.region, clarity: 'clear',
      text: `看見${regions.find(region => region.id === object.region)?.name || '附近'}有${object.label}。`,
      direct: false, interference: 'medium' }));
}
export function supplyObservationCandidates(world: World, character: Character, ids?: string[]): SensoryCandidate[] {
  if ((world.supplies?.length || 0) > 512) throw new PerceptionCapacityError('供應探索超過世界供應容量；未截斷執行依據。');
  return (world.supplies || []).filter(supply => (!ids || ids.includes(supply.id)) && !supply.pending && (supply.availableAt === undefined || supply.availableAt <= world.minute) && canSee(world, character, supply.region))
    .map(supply => ({ sense: 'sight', kind: 'activity', supplyId: supply.id, region: supply.region, clarity: 'clear', text: '查看'+(regions.find(region => region.id === supply.region)?.name || '附近')+'，辨識到'+supply.label+'這個來源。', direct: false, interference: 'medium' }));
}
// Call only after the activity's facts commit; information does not transfer
// possession, rights, quantities or an object's physical revision.
export function discoverWorldObjects(world: World, character: Character, event: import('./world').WorldEvent, ids: string[]) {
  return discoverWorldResources(world, character, event, ids, []);
}
export function discoverWorldResources(world: World, character: Character, event: import('./world').WorldEvent, objectIds: string[], supplyIds: string[], method?:DiscoveryMethod) {
  const candidates = [...objectObservationCandidates(world, character, objectIds), ...supplyObservationCandidates(world, character, supplyIds)];
  return resolveProbe(world, character, event, 'sight', candidates, candidates.map(candidate => candidate.objectId ? 'object:'+candidate.objectId : 'supply:'+candidate.supplyId),method);
}
export function probeCurrent(world: World, character: Character, event: import('./world').WorldEvent) {
  const sense = event.scene?.content === 'hearing' ? 'hearing' : 'sight';
  const target = event.scene?.target;
  const here = regionOf(character);
  const candidates: SensoryCandidate[] = [];
  const clues: string[] = [];
  for (const other of world.characters) {
    const region = regionOf(other);
    if (other.id === character.id || target && target !== other.id && target !== region) continue;
    if (sense === 'sight') {
      const visible = canSee(world, character, region);
      const doorway = connectingDoor(here, region);
      const silhouette = world.scene?.occluded.includes(region) && (here === region || doorway && world.scene.doors[doorway.id] === 'open');
      if (!visible && !silhouette) continue;
      candidates.push({ sense, kind: 'person', text: visible ? `看見 ${other.name} 在${regions.find(r => r.id === region)?.name}。` : '遮擋處有人影晃動。', clarity: visible ? 'clear' : 'vague', ...(visible ? { source: other.id, region } : {}), direct: visible, interference: 'medium' });
      clues.push(world.currentSensory!.presence[other.id].clue);
    } else {
      const activity = world.currentSensory?.activities[other.id];
      // Only still-running, externally audible work has a current sound. Speech,
      // footsteps, private reflection and completed activities are never replayed.
      if (!activity || activity.action.type !== 'work' || other.plan?.action.type !== 'work' || other.plan.until <= world.minute || !canHear(world, character, region)) continue;
      const clear = canSee(world, character, region) && world.scene?.noise[here] !== 'loud';
      candidates.push({ sense, kind: 'sound', text: clear ? `${other.name} 做事時傳來一些動靜。` : '附近傳來做事的動靜。', clarity: clear ? 'clear' : 'vague', ...(clear ? { source: other.id, region } : {}), direct: clear, interference: world.scene?.noise[here] === 'loud' && !canSee(world, character, region) ? 'strong' : 'medium' });
      clues.push(activity.clue);
    }
  }
  if (sense === 'sight') for (const candidate of objectObservationCandidates(world, character).filter(candidate => !target || target === candidate.region)) {
    candidates.push(candidate); clues.push(`object:${candidate.objectId}`);
  }
  resolveProbe(world, character, event, sense, candidates, clues);
}
function resourceReceipt(trace:PerceptionTrace,candidate:SensoryCandidate,key:string):PerceptionTrace {
  const own=trace.observations.filter(observation=>candidate.objectId?observation.objectId===candidate.objectId:observation.supplyId===candidate.supplyId);
  return {characterId:trace.characterId,status:own.length?'noticed':'missed',observations:own,reason:'同一資源與確認方法的已保存結果。',opportunity:key,...(trace.resolution?{resolution:trace.resolution,factors:trace.factors}:{})};
}
function assertProbeCapacity(world:World,count:number,extra:unknown):void {
  if(Object.keys(world.probeResults||{}).length+count>2048||new TextEncoder().encode(JSON.stringify([world.probeResults,world.perceptionTrials,extra])).length>1024*1024)
    throw new PerceptionCapacityError('物品探索的感知保存容量已滿；保留既有結果，未重新擲骰或判定缺貨。');
}
function resolveProbe(world: World, character: Character, event: import('./world').WorldEvent, sense: 'sight' | 'hearing', candidates: SensoryCandidate[], clues: string[],method?:DiscoveryMethod) {
  const here = regionOf(character);
  const probeKey = JSON.stringify([character.id, here, sense, clues.sort(), candidates.map(c => [...sensoryCandidateIdentity(c), c.direct, c.interference]), sense === 'hearing' ? world.scene?.noise[here] || 'quiet' : '', (character.abilityTags || []).filter(tag => perceptionRules.abilities[sense][tag] !== undefined).sort(),...(method?[method]:[])]);
  const previous = world.probeResults?.[probeKey];
  if (previous) { event.perception = [{ ...previous, reason: '相同查探條件，沿用先前結果（不重新擲骰）' }]; return previous; }
  const abilities=(character.abilityTags || []).filter(tag => perceptionRules.abilities[sense][tag] !== undefined).sort();
  const resources=candidates.filter(candidate=>candidate.objectId||candidate.supplyId).map(candidate=>{
    const identity=[...sensoryCandidateIdentity(candidate),candidate.direct,candidate.interference];
    const legacyKey=JSON.stringify(['resource-probe.v1',character.id,here,sense,identity,abilities]);
    const key=method?JSON.stringify(['resource-probe.v2',character.id,here,sense,identity,abilities,method]):legacyKey;
    let prior=world.probeResults?.[key];
    // Original group receipts remain authoritative. Reuse them without a read
    // migration or a fresh die when a later search selects a different subset.
    const hasConfirmedScope=!!method&&Object.keys(world.probeResults||{}).some(storedKey=>{let stored:unknown;try{stored=JSON.parse(storedKey);}catch{return false;}return Array.isArray(stored)&&stored[0]==='resource-probe.v2'&&stored[1]===character.id&&stored[2]===here&&stored[3]===sense&&JSON.stringify(stored[4])===JSON.stringify(identity)&&JSON.stringify(stored[5])===JSON.stringify(abilities);});
    if(!prior&&!hasConfirmedScope)prior=world.probeResults?.[legacyKey];
    if(!prior&&!hasConfirmedScope)for(const [storedKey,result] of Object.entries(world.probeResults||{})){
      let stored:unknown;try{stored=JSON.parse(storedKey);}catch{continue;}
      if(Array.isArray(stored)&&stored.length===7&&stored[0]===character.id&&stored[1]===here&&stored[2]===sense&&Array.isArray(stored[4])&&JSON.stringify(stored[6])===JSON.stringify(abilities)&&stored[4].some(tuple=>JSON.stringify(tuple)===JSON.stringify(identity))){prior=resourceReceipt(result,candidate,key);break;}
    }
    return {candidate,key,prior,adopt:!!method&&!!prior&&!world.probeResults?.[key]};
  });
  const aliases=resources.filter(resource=>resource.adopt).map(({candidate,key,prior})=>[key,resourceReceipt(prior!,candidate,key)] as const);
  const reused=resources.filter(resource=>resource.prior);
  const fresh=resources.filter(resource=>!resource.prior);
  if(reused.length){
    const reusedCandidates=new Set(reused.map(resource=>resource.candidate));
    candidates=candidates.filter(candidate=>!reusedCandidates.has(candidate));
    const reusedClues=new Set(reused.map(({candidate})=>candidate.objectId?`object:${candidate.objectId}`:`supply:${candidate.supplyId}`));
    clues=clues.filter(clue=>!reusedClues.has(clue));
    if(!candidates.length){
      if(aliases.length){assertProbeCapacity(world,aliases.length,aliases);for(const [key,value] of aliases)(world.probeResults??={})[key]=value;}
      const trace:PerceptionTrace={characterId:character.id,status:'no-opportunity',observations:[],reason:'相同資源與接觸條件，沿用先前結果；沒有新增觀察經歷。',reusedResources:reused.map(({candidate,prior})=>({...(candidate.objectId?{objectId:candidate.objectId}:{supplyId:candidate.supplyId}),status:prior!.status}))};
      event.perception=[trace];return trace;
    }
  }
  // Keep prior receipts rather than evicting them and allowing reload/rewording
  // to farm a new roll. A capacity error is technical, never world absence.
  const reserved=fresh.map(({key,candidate})=>[key,{characterId:character.id,status:'noticed',observations:[{...candidate,id:'x'.repeat(128),time:world.minute}],reason:'主動查探取得錯誤主觀感知',opportunity:key,resolution:{roll:20,modifier:4,dc:16,total:24,outcome:'critical-success'},factors:{ability:4,attention:2,interference:'medium'}}]);
  if(resources.length)assertProbeCapacity(world,fresh.length+aliases.length+1,[probeKey,probeKey,probeKey,probeKey,candidates,candidates,candidates,reserved,aliases]);
  const uncertain = candidates.filter(c => !c.direct);
  const trial = uncertain.length ? resolvePerception(world, character, JSON.stringify(['probe', ...clues.sort(),...(method?[method]:[])]), uncertain, true) : undefined;
  const trace = observationTrace(world, character, event, candidates, trial, true);
  if(reused.length){trace.reason+='；部分資源沿用先前接觸結果，沒有重新擲骰或重寫經歷。';trace.reusedResources=reused.map(({candidate,prior})=>({...(candidate.objectId?{objectId:candidate.objectId}:{supplyId:candidate.supplyId}),status:prior!.status}));}
  const observations = trace.observations;
  event.perception = [trace];
  (world.probeResults ??= {})[probeKey] = event.perception[0];
  for(const [key,value] of aliases)world.probeResults![key]=value;
  for(const {key,candidate} of fresh){
    world.probeResults![key]=resourceReceipt(trace,candidate,key);
  }
  if (!observations.length) remember(world, character, sense === 'hearing' ? '專注聆聽後，沒有聽到新的線索。' : '仔細查看後，沒有發現新的線索。');
  return trace;
}
