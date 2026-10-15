import { validateCognition, projectRelationships, relationshipsProjection, type Belief, type RelationshipTag } from './cognition';
import type { Character } from './world';
import type { Observation } from './perception';

export type MemorySource = { kind: 'legacy-unclassified' | 'experience' | 'observation'; person?: string; region?: string; sense?: Observation['sense']; clarity?: Observation['clarity'] };
export type ShortMemory = { id: string; characterId: string; version: number; time: number; text: string; source: MemorySource; eventId?: string; observation?: Observation; consumed?: boolean; controlled?: boolean };
export type LongMemory = { id: string; characterId: string; version: number; time: number; text: string; source: MemorySource; origin: { id: string; version: number }; reason: string };
export class MemoryValidationError extends Error {}
export const memoryBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;
const textBytes = (value: string) => new TextEncoder().encode(value).length;
function observationSource(observation: Observation): MemorySource {
  return { kind: 'observation', ...(observation.source ? { person: observation.source } : {}), ...(observation.region ? { region: observation.region } : {}), sense: observation.sense, clarity: observation.clarity };
}
function validateShort(item: ShortMemory) {
  if (textBytes(item.text) > 4096) throw new MemoryValidationError('短期經歷超過 4096 bytes；保留原資料，未截斷文字。');
}
// The legacy arrays are compatibility projections, never independent stores.
export function projectMemories(c: Character) {
  const items = c.shortTerm || [];
  c.memories = items.map(({ id, time, text }) => ({ id, time, text }));
  c.observations = items.flatMap(item => item.observation ? [item.observation] : []);
  c.observationCursor = items.filter(item => item.observation && item.consumed).length;
  if (c.control && (c.control.experiences !== undefined || items.some(item => item.controlled))) c.control.experiences = items.filter(item => item.controlled).map(({ id, time, text }) => ({ id, time, text }));
}
function boundShort(c: Character, extraBytes = 0) {
  const items = c.shortTerm!;
  // Invalid legacy text must be reported, not silently hidden by FIFO eviction.
  for (const item of items) validateShort(item);
  while (items.length > 80 || memoryBytes(items) > 64 * 1024) items.shift();
  projectMemories(c);
  while (items.length && memoryStateBytes(c) + extraBytes > 208 * 1024) { items.shift(); projectMemories(c); }
  validateMemoryState(c);
  if (memoryStateBytes(c) + extraBytes > 208*1024) throw new MemoryValidationError('索引中介資料使角色記憶總量超過208 KiB，未刪除長期資料。');
}
export function boundMemoryWithMetadata(c: Character, extraBytes: number) {
  if (!Number.isSafeInteger(extraBytes) || extraBytes < 0) throw new MemoryValidationError('索引中介資料容量無效');
  normalizeMemory(c);
  boundShort(c, extraBytes);
}
export function normalizeMemory(c: Character) {
  if (!c.shortTerm) {
    const observations = c.observations || [], seen = new Set<string>();
    const items: ShortMemory[] = c.memories.map((m, index) => ({ id: m.id || `legacy:${c.id}:memory:${index}:${m.time}`, characterId: c.id, version: 1, time: m.time, text: m.text, source: { kind: 'legacy-unclassified' } }));
    observations.forEach((o, index) => {
      if (seen.has(o.id)) return; seen.add(o.id);
      const linked = items.findIndex(item => item.id === o.id);
      if (linked >= 0) items.splice(linked, 1);
      items.push({ id: o.id, characterId: c.id, version: 1, time: o.time, text: o.text, source: observationSource(o), observation: o, consumed: index < (c.observationCursor || 0) });
    });
    for (const [index, m] of (c.control?.experiences || []).entries()) {
      const match = m.id && items.find(item => item.id === m.id);
      if (match) match.controlled = true;
      else items.push({ id: m.id || `legacy:${c.id}:control:${index}:${m.time}`, characterId: c.id, version: 1, time: m.time, text: m.text, source: { kind: 'legacy-unclassified' }, controlled: true });
    }
    c.shortTerm = items.sort((a, b) => a.time - b.time);
  }
  c.longTerm ??= [];
  projectRelationships(c);
  boundShort(c);
}
export function addExperience(c: Character, time: number, text: string, observation?: Observation, event?: { id: string; actor: string }) {
  normalizeMemory(c);
  const id = observation?.id || crypto.randomUUID();
  if (c.shortTerm!.some(item => item.id === id)) return;
  const item: ShortMemory = { id, characterId: c.id, version: 1, time, text, source: observation ? observationSource(observation) : { kind: 'experience', ...(event ? { person: event.actor, region: c.region || c.location } : {}) }, ...(event ? { eventId: event.id } : {}), ...(observation ? { observation } : {}), ...(c.control && (c.control.mode === 'taken-over' || c.control.experiences !== undefined) ? { controlled: true } : {}) };
  validateShort(item);
  c.shortTerm!.push(item); boundShort(c);
}
export const memorySelectionSchema = { type: 'array', maxItems: 4, items: { type: 'object', properties: { id: { type: 'string', maxLength: 128 }, version: { type: 'integer', minimum: 1 }, reason: { type: 'string', maxLength: 256 } }, required: ['id', 'version', 'reason'], additionalProperties: false } };
export function selectMemories(c: Character, value: unknown): LongMemory[] {
  if (value === undefined) return c.longTerm || [];
  if (!Array.isArray(value) || value.length > 4 || memoryBytes(value) > 8192) throw new MemoryValidationError('記憶選留超限');
  const result = [...(c.longTerm || [])], seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== 'object' || Object.keys(item).some(key => !['id', 'version', 'reason'].includes(key)) || typeof item.id !== 'string' || textBytes(item.id) > 128 || !Number.isSafeInteger(item.version) || typeof item.reason !== 'string' || !item.reason.trim() || textBytes(item.reason) > 256 || seen.has(item.id)) throw new MemoryValidationError('記憶選留格式無效');
    seen.add(item.id);
    const source = c.shortTerm?.find(m => m.id === item.id && m.version === item.version && m.characterId === c.id);
    if (!source) throw new MemoryValidationError('只能選留本次自己的短期經歷版本');
    if (!result.some(m => m.origin.id === source.id && m.origin.version === source.version)) result.push({ id: crypto.randomUUID(), characterId: c.id, version: 1, time: source.time, text: source.text, source: { ...source.source }, origin: { id: source.id, version: source.version }, reason: item.reason });
  }
  if (result.length > 64 || memoryBytes(result) > 64 * 1024) throw new MemoryValidationError('長期記憶已滿，需要明示重新評估，不能自動刪除');
  return result;
}
export function consumeMemories(c: Character) {
  for (const item of c.shortTerm || []) { if (item.observation) item.consumed = true; delete item.controlled; }
  projectMemories(c);
  validateMemoryState(c);
}
export function memoryProjection(c: Character) {
  return (c.shortTerm || []).map(({ id, version, time, text, source, controlled }) => ({ id, version, time, text, source, ...(controlled ? { controlled: true } : {}) }));
}
export function budgetMemoryInput<T extends { self: { shortTerm: unknown[]; longTerm: LongMemory[] | undefined; cognition?: { beliefs: Belief[]; relationshipTags: RelationshipTag[]; reviewCandidates?: { kind: 'belief' | 'relationship'; id: string; version: number }[] }; memories: unknown[]; observations: unknown[]; relationships: Record<string, string> }; knownControlExperiences?: unknown[]; pendingInterventions: unknown[] }>(input: T, recalledMemories?: unknown): T {
  const candidates = input.self.longTerm || [];
  const cognition = input.self.cognition;
  const beliefs = cognition?.beliefs || [], tags = cognition?.relationshipTags || [];
  if (cognition) { cognition.beliefs = []; cognition.relationshipTags = []; input.self.relationships = {}; }
  input.self.longTerm = [];
  const payload = () => recalledMemories ? { input, recalledMemories } : ({ shortTerm: input.self.shortTerm, longTerm: input.self.longTerm, cognition: input.self.cognition, memories: input.self.memories, observations: input.self.observations, relationships: input.self.relationships, knownControlExperiences: input.knownControlExperiences, pendingInterventions: input.pendingInterventions });
  // Compatibility text duplicates may be omitted; their canonical short-term
  // identities, source, and control provenance remain visible in full.
  if (memoryBytes(payload()) > 88 * 1024) input.self.memories = [];
  if (memoryBytes(payload()) > 88 * 1024) input.knownControlExperiences = [];
  if (memoryBytes(payload()) > 88 * 1024) input.self.observations = [];
  if (memoryBytes(payload()) > 88 * 1024) input.pendingInterventions = input.pendingInterventions.map(item => {
    const request = item as { id: string; time: number; memoryId?: string };
    return request.memoryId ? { id: request.id, time: request.time, memoryId: request.memoryId } : item;
  });
  if (memoryBytes(payload()) > 88 * 1024) throw new MemoryValidationError('記憶輸入超過 88 KiB');
  if (cognition) {
    for (const belief of beliefs) { cognition.beliefs.push(belief); if (memoryBytes(payload()) > 88 * 1024) cognition.beliefs.pop(); }
    for (const tag of tags) {
      cognition.relationshipTags.push(tag); input.self.relationships = relationshipsProjection(cognition.relationshipTags);
      if (memoryBytes(payload()) > 88 * 1024) { cognition.relationshipTags.pop(); input.self.relationships = relationshipsProjection(cognition.relationshipTags); }
    }
  }
  for (const candidate of candidates) {
    input.self.longTerm.push(candidate);
    if (memoryBytes(payload()) > 88 * 1024) input.self.longTerm.pop();
  }
  if (cognition?.reviewCandidates) cognition.reviewCandidates = cognition.reviewCandidates.filter(candidate => (candidate.kind === 'belief' ? cognition.beliefs : cognition.relationshipTags).some(item => item.id === candidate.id && item.version === candidate.version));
  return input;
}
export function validateMemoryState(c: Character) {
  validateCognition(c);
  const boundedId = (value: unknown) => typeof value === 'string' && value.length > 0 && textBytes(value) <= 128;
  const validSource = (source: MemorySource) => source && ['legacy-unclassified', 'experience', 'observation'].includes(source.kind) && (!source.person || boundedId(source.person)) && (!source.region || boundedId(source.region));
  const shortIds = new Set<string>();
  for (const item of c.shortTerm || []) {
    if (shortIds.has(item.id)) throw new MemoryValidationError('短期記憶身份重複');
    shortIds.add(item.id);
    if (item.observation && (item.observation.id !== item.id || item.observation.text !== item.text || item.observation.time !== item.time || item.observation.source !== item.source.person || item.observation.region !== item.source.region || item.observation.sense !== item.source.sense || item.observation.clarity !== item.source.clarity)) throw new MemoryValidationError('主觀觀察投影不一致');
    if (!boundedId(item.id) || item.characterId !== c.id || !Number.isSafeInteger(item.version) || item.version < 1 || !Number.isFinite(item.time) || !validSource(item.source) || (item.eventId && !boundedId(item.eventId))) throw new MemoryValidationError('短期記憶身份或來源無效');
    validateShort(item);
  }
  const long = c.longTerm || [], ids = new Set<string>();
  for (const item of long) {
    if (!boundedId(item.id) || ids.has(item.id) || item.characterId !== c.id || !Number.isSafeInteger(item.version) || item.version < 1 || !Number.isFinite(item.time) || !validSource(item.source) || typeof item.text !== 'string' || textBytes(item.text) > 4096 || typeof item.reason !== 'string' || textBytes(item.reason) > 256 || !boundedId(item.origin?.id) || !Number.isSafeInteger(item.origin.version) || item.origin.version < 1) throw new MemoryValidationError('長期記憶格式或文字超限');
    ids.add(item.id);
  }
  if (long.length > 64 || memoryBytes(long) > 64 * 1024) throw new MemoryValidationError('長期記憶容量超限，未刪除任何資料');
  // Existing relationship text remains unchanged; no belief/tag conversion.
  if (Object.keys(c.relationships).length > 32 || memoryBytes(c.relationships) > 12 * 1024 || Object.entries(c.relationships).some(([id, text]) => !boundedId(id) || typeof text !== 'string' || (!c.cognition && textBytes(text) > 256))) throw new MemoryValidationError('既有關係文字超過記憶契約，未截斷資料');
  if (memoryStateBytes(c) > 208 * 1024) throw new MemoryValidationError('角色記憶總量超過 208 KiB，未截斷資料');
}
export function memoryStateBytes(c: Character) {
  const state = { shortTerm: c.shortTerm, longTerm: c.longTerm, cognition: c.cognition, memoryTrace: 'memoryTrace' in c ? c.memoryTrace : undefined, memories: c.memories, observations: c.observations, observationCursor: c.observationCursor, controlExperiences: c.control?.experiences, relationships: c.relationships };
  return memoryBytes(state);
}
