import type { Character, World } from './world';
import { regions, doors, regionOf, defaultRegion, type Observation } from './perception';

export const clueKinds = ['person', 'speech', 'sound', 'door', 'activity'] as const;
export type AttentionCondition = { kind: Observation['kind']; source: string; region: string };
export type AttentionDiagnostic = { time: number; observationId?: string; reason: string };
export function pendingObservations(character: Character) {
  return (character.observations || []).slice(character.observationCursor || 0);
}
export function decisionObservations(character: Character) {
  const observations = character.observations || [], cursor = character.observationCursor || 0;
  return observations.slice(Math.max(0, cursor - 12));
}
export function matchesAttentionCondition(character: Character, observation: Pick<Observation, 'kind' | 'source' | 'region'>) {
  return !!character.attentionConditions?.some(condition => condition.kind === observation.kind &&
    (!condition.source || condition.source === observation.source) && (!condition.region || condition.region === observation.region));
}
export function observationAttention(character: Character, observation: Observation): string | undefined {
  if (observation.urgency) return { direct: '直接互動', strong: '強烈刺激', danger: '已察覺危險' }[observation.urgency];
  if (matchesAttentionCondition(character, observation)) return '符合關注條件';
}
export function parseAttention(world: World, character: Character, value: unknown): { conditions: AttentionCondition[]; diagnostics: string[] } {
  if (value === undefined) return { conditions: [], diagnostics: [] };
  if (!Array.isArray(value) || value.length > 12) throw Error('關注條件格式無效');
  // Contacts are already explicitly exposed by the established model interface.
  const knownPeople = new Set(world.characters.map(c => c.id));
  const knownRegions = new Set(regions.filter(r => r.id === defaultRegion(r.location) || r.id === regionOf(character) || doors.some(d => d.regions.includes(regionOf(character)) && d.regions.includes(r.id))).map(r => r.id));
  for (const observation of character.observations || []) if (observation.region) knownRegions.add(observation.region);
  const conditions: AttentionCondition[] = [], diagnostics: string[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some(k => !['kind', 'source', 'region'].includes(k)) ||
      !clueKinds.includes(item.kind) || typeof item.source !== 'string' || typeof item.region !== 'string' ||
      (item.source && !knownPeople.has(item.source)) || (item.region && !knownRegions.has(item.region))) {
      diagnostics.push('捨棄未知或越界的關注條件'); continue;
    }
    conditions.push({ kind: item.kind, source: item.source, region: item.region });
  }
  return { conditions, diagnostics };
}
export function noteAttention(world: World, character: Character, reason: string, observationId?: string) {
  if (observationId && character.attentionDiagnostics?.some(entry => entry.observationId === observationId && entry.reason === reason)) return;
  character.attentionDiagnostics = [...(character.attentionDiagnostics || []), { time: world.minute, observationId, reason }].slice(-80);
}
