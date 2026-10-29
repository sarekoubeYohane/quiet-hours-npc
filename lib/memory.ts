import { arrangementsForDecision, validateArrangements, type Arrangement } from './arrangements';
import { validatePreferences, type Preference } from './preferences';
import { validateCognition, projectRelationships, relationshipsProjection, type Belief, type RelationshipTag } from './cognition';
import type { Character } from './world';
import type { Observation } from './perception';

export type MemorySource = { kind: 'legacy-unclassified' | 'experience' | 'observation'; person?: string; object?: string; supply?: string; region?: string; sense?: Observation['sense']; clarity?: Observation['clarity'] };
export type ShortMemory = { id: string; characterId: string; version: number; time: number; text: string; source: MemorySource; eventId?: string; observation?: Observation; observationSequence?: number; consumed?: boolean; controlled?: boolean };
export type MemoryRef = { id: string; version: number };
export type RememberedSource = MemoryRef & { source: MemorySource };
export type MemoryTraceOperation = 'merge' | 'rewrite' | 'forget' | 'forget-source' | 'keep';
export type MemoryTrace = { id: string; version: number; type: MemoryTraceOperation; from: MemoryRef[]; to?: MemoryRef; reason: string };
export type LongMemory = { id: string; characterId: string; version: number; time: number; text: string; source: MemorySource; origin: MemoryRef; reason: string; kind?: 'episode' | 'summary'; state?: 'active' | 'superseded' | 'forgotten'; rememberedSources?: RememberedSource[]; origins?: MemoryRef[]; unresolved?: MemoryRef[] };
export class MemoryValidationError extends Error {}
export class MemorySelectionReferenceError extends MemoryValidationError {}
export class MemorySelectionFormatError extends MemoryValidationError {}
export const memoryBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;
const textBytes = (value: string) => new TextEncoder().encode(value).length;
function validRef(value: unknown): value is MemoryRef {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const ref = value as MemoryRef;
  return Object.keys(value).every(key => ['id', 'version'].includes(key)) && typeof ref.id === 'string' && ref.id.length > 0 && textBytes(ref.id) <= 128 && Number.isSafeInteger(ref.version) && ref.version > 0;
}
function validRefs(value: unknown): value is MemoryRef[] {
  return Array.isArray(value) && value.length <= 8 && value.every(validRef) && new Set(value.map(item => `${item.id}:${item.version}`)).size === value.length;
}
function observationSource(observation: Observation): MemorySource {
  return { kind: 'observation', ...(observation.source ? { person: observation.source } : {}), ...(observation.objectId ? { object: observation.objectId } : {}), ...(observation.supplyId ? { supply: observation.supplyId } : {}), ...(observation.region ? { region: observation.region } : {}), sense: observation.sense, clarity: observation.clarity };
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
// Local sensory order is operational metadata, independent of whether the
// experience is later selected, rewritten, forgotten, or evicted by FIFO.
// Never called by GET normalization; activation belongs to a writable candidate.
export function initializeObservationOrder(c:Character){
 let sequence=c.observationSequence??0;
 if(!Number.isSafeInteger(sequence)||sequence<0)throw new MemoryValidationError('感知順序高水位無效');
 for(const item of c.shortTerm||[])if(item.observationSequence!==undefined)sequence=Math.max(sequence,item.observationSequence);
 for(const item of c.shortTerm||[])if(item.observation&&item.observationSequence===undefined){
  if(sequence>=Number.MAX_SAFE_INTEGER)throw new MemoryValidationError('感知順序已達工程上界');
  item.observationSequence=++sequence;
 }
 if(sequence>0||c.observationSequence!==undefined)c.observationSequence=sequence;
 // Metadata uses the same FIFO and total capacity as every short experience.
 if(c.shortTerm)boundShort(c);
}
export function addExperience(c: Character, time: number, text: string, observation?: Observation, event?: { id: string; actor: string }) {
  normalizeMemory(c);
  const id = observation?.id || crypto.randomUUID();
  if (c.shortTerm!.some(item => item.id === id)) return;
  if(observation){initializeObservationOrder(c);if((c.observationSequence??0)>=Number.MAX_SAFE_INTEGER)throw new MemoryValidationError('感知順序已達工程上界');c.observationSequence=(c.observationSequence??0)+1;}
  const item: ShortMemory = { id, characterId: c.id, version: 1, time, text, source: observation ? observationSource(observation) : { kind: 'experience', ...(event ? { person: event.actor, region: c.region || c.location } : {}) }, ...(event ? { eventId: event.id } : {}), ...(observation ? { observation,observationSequence:c.observationSequence } : {}), ...(c.control && (c.control.mode === 'taken-over' || c.control.experiences !== undefined) ? { controlled: true } : {}) };
  validateShort(item);
  c.shortTerm!.push(item); boundShort(c);
}
export const memorySelectionSchema = { type: 'array', maxItems: 4, items: { type: 'object', properties: { id: { type: 'string', maxLength: 128 }, version: { type: 'integer', minimum: 1 }, reason: { type: 'string', maxLength: 256 } }, required: ['id', 'version', 'reason'], additionalProperties: false } };
// Every branch binds one identity and version; separate enums would admit
// pairings that were never sent. Empty input retains a valid object item schema
// for strict providers, but maxItems=0 admits only an empty selection.
export function memorySelectionSchemaFor(refs: MemoryRef[]) {
  return refs.length ? {
    ...memorySelectionSchema,
    items: { anyOf: refs.map(({ id, version }) => ({
      ...memorySelectionSchema.items,
      properties: { ...memorySelectionSchema.items.properties,
        id: { type: 'string', enum: [id] }, version: { type: 'integer', enum: [version] },
      },
    })) },
  } : { ...memorySelectionSchema, maxItems: 0 };
}
const memoryRefSchema = { type: 'object', properties: { id: { type: 'string', minLength: 1, maxLength: 128 }, version: { type: 'integer', minimum: 1 } }, required: ['id', 'version'], additionalProperties: false };
export const memoryOperationSchema = { type: 'array', maxItems: 4, items: {
  type: 'object', properties: {
    type: { type: 'string', enum: ['merge', 'rewrite', 'forget', 'forget-source', 'keep', 'compact-trace'] },
    targets: { type: 'array', minItems: 1, maxItems: 8, items: memoryRefSchema },
    text: { type: 'string', maxLength: 4096 },
    unresolved: { type: 'array', maxItems: 8, items: memoryRefSchema },
    reason: { type: 'string', minLength: 1, maxLength: 256 },
  }, required: ['type', 'targets', 'text', 'unresolved', 'reason'], additionalProperties: false,
} };
function selectedMemories(c: Character, value: unknown, visibleShort: MemoryRef[] = c.shortTerm || []): LongMemory[] {
  if (value === undefined) return c.longTerm || [];
  if (!Array.isArray(value) || value.length > 4 || memoryBytes(value) > 8192) throw new MemorySelectionFormatError('記憶選留超限');
  const result = [...(c.longTerm || [])], seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== 'object' || Object.keys(item).some(key => !['id', 'version', 'reason'].includes(key)) || typeof item.id !== 'string' || textBytes(item.id) > 128 || !Number.isSafeInteger(item.version) || typeof item.reason !== 'string' || !item.reason.trim() || textBytes(item.reason) > 256 || seen.has(item.id)) throw new MemorySelectionFormatError('記憶選留格式無效');
    seen.add(item.id);
    const source = c.shortTerm?.find(m => m.id === item.id && m.version === item.version && m.characterId === c.id);
    if (!source || !visibleShort.some(ref => ref.id === item.id && ref.version === item.version)) throw new MemorySelectionReferenceError('只能選留本次自己的短期經歷版本');
    if (!result.some(m => m.origin.id === source.id && m.origin.version === source.version)) result.push({ id: crypto.randomUUID(), characterId: c.id, version: 1, time: source.time, text: source.text, source: { ...source.source }, origin: { id: source.id, version: source.version }, reason: item.reason });
  }
  return result;
}
export function selectMemories(c: Character, value: unknown): LongMemory[] {
  const result = selectedMemories(c, value);
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
function sourceProjection(source: MemorySource): MemorySource {
  return { kind: source.kind, ...(source.person ? { person: source.person } : {}), ...(source.object ? { object: source.object } : {}), ...(source.supply ? { supply: source.supply } : {}), ...(source.region ? { region: source.region } : {}), ...(source.sense ? { sense: source.sense } : {}), ...(source.clarity ? { clarity: source.clarity } : {}) };
}
function rememberedSources(item: LongMemory): RememberedSource[] {
  return item.rememberedSources ?? [{ id: item.id, version: item.version, source: item.source }];
}
export function recallableMemoryProjection(c: Character) {
  return (c.longTerm || []).filter(item => !item.state || item.state === 'active').map(item => ({ id: item.id, version: item.version, time: item.time, text: item.text, kind: item.kind || 'episode', state: 'active' as const, source: sourceProjection(item.source), rememberedSources: rememberedSources(item).map(ref => ({ id: ref.id, version: ref.version, source: sourceProjection(ref.source) })), ...(item.unresolved?.length ? { unresolved: item.unresolved.map(({ id, version }) => ({ id, version })) } : {}) }));
}
export type MemoryProjection = ReturnType<typeof recallableMemoryProjection>;
export type MemoryReview = MemoryRef & { kind: 'short' | 'long' | 'trace'; required?: boolean };
export type MemoryCandidate = Pick<Character, 'longTerm' | 'shortTerm' | 'memoryTrace'>;
type CognitiveMemoryReferences = { cognition?: { beliefs?: { references?: (MemoryRef & { kind: string })[] }[]; relationshipTags?: { references?: (MemoryRef & { kind: string })[] }[]; trace?: unknown[] } };
function traceRequired(trace: MemoryTrace, c: Character): boolean {
  const cognition = (c as Character & CognitiveMemoryReferences).cognition;
  const refs = [...(c.longTerm || []).filter(item => !item.state || item.state === 'active').flatMap(item => [{ id: item.id, version: item.version }, ...(item.unresolved || [])]), ...[...(cognition?.beliefs || []), ...(cognition?.relationshipTags || [])].flatMap(item => (item.references || []).filter(ref => ref.kind === 'long'))];
  return refs.some(ref => {
    if (trace.type === 'keep' && (c.longTerm || []).some(item => (!item.state || item.state === 'active') && item.id === ref.id && item.version === ref.version)) return false;
    if (trace.type === 'keep' && (c.memoryTrace || []).some(other => other.id !== trace.id && [...other.from, ...(other.to ? [other.to] : [])].some(anchor => anchor.id === ref.id && anchor.version === ref.version))) return false;
    return [...trace.from, ...(trace.to ? [trace.to] : [])].some(anchor => anchor.id === ref.id && anchor.version === ref.version);
  });
}
export function evaluateMemories(c: Character, selections: unknown, operations: unknown, visible: MemoryProjection, review: MemoryReview[] = [], visibleShort: MemoryRef[] = c.shortTerm || []): MemoryCandidate {
  if (operations === undefined) operations = [];
  if (!Array.isArray(operations) || operations.length + (Array.isArray(selections) ? selections.length : 0) > 4 || memoryBytes({ selections: selections ?? [], operations }) > 8192) throw new MemoryValidationError('記憶整理超過單次工作量');
  const candidate: Character = structuredClone(c);
  candidate.longTerm = selectedMemories(c, selections, visibleShort);
  candidate.memoryTrace ??= [];
  const removedTraces: MemoryTrace[] = [];
  const removedOrigins: MemoryRef[] = [], changed = new Set<string>();
  for (const operation of operations) {
    if (!operation || typeof operation !== 'object' || !['merge', 'rewrite', 'forget', 'forget-source', 'keep', 'compact-trace'].includes(operation.type) || Object.keys(operation).some(key => !['type', 'targets', 'text', 'unresolved', 'reason'].includes(key)) || !Array.isArray(operation.targets) || operation.targets.length < (operation.type === 'merge' ? 2 : 1) || operation.targets.length > 8 || !Array.isArray(operation.unresolved) || operation.unresolved.length > 8 || typeof operation.text !== 'string' || (['merge', 'rewrite'].includes(operation.type) ? !operation.text.trim() : operation.type !== 'forget-source' && operation.text !== '') || (operation.type === 'forget-source' && operation.text !== '' && !operation.text.trim()) || textBytes(operation.text) > 4096 || typeof operation.reason !== 'string' || !operation.reason.trim() || textBytes(operation.reason) > 256) throw new MemoryValidationError('記憶整理格式無效');
    if (!['merge', 'rewrite'].includes(operation.type) && operation.unresolved.length) throw new MemoryValidationError('只有摘要可新增或帶回未解矛盾引用');
    if (!validRefs(operation.targets) || !validRefs(operation.unresolved)) throw new MemoryValidationError('記憶整理引用格式無效');
    const refs = operation.targets as MemoryRef[], seen = new Set<string>();
    if (operation.type === 'compact-trace') {
      for (const ref of refs) {
        const trace = candidate.memoryTrace.find(item => item.id === ref.id && item.version === ref.version);
        if (!trace || !review.some(item => item.kind === 'trace' && item.id === ref.id && item.version === ref.version) || operation.unresolved.length || seen.has(ref.id)) throw new MemoryValidationError('只能精簡本次明示的來源追溯');
        seen.add(ref.id); removedTraces.push(trace);
      }
      candidate.memoryTrace = candidate.memoryTrace.filter(item => !seen.has(item.id));
      continue;
    }
    const items = refs.map(ref => {
      if (!ref || Object.keys(ref).some(key => !['id', 'version'].includes(key)) || typeof ref.id !== 'string' || textBytes(ref.id) > 128 || !Number.isSafeInteger(ref.version) || ref.version < 1 || seen.has(ref.id)) throw new MemoryValidationError('記憶整理引用無效');
      seen.add(ref.id);
      const item = candidate.longTerm!.find(m => m.id === ref.id && m.version === ref.version && m.characterId === c.id);
      if (!item || !visible.some(m => m.id === ref.id && m.version === ref.version)) throw new MemoryValidationError('只能整理本次可見的自己記憶版本');
      return item;
    });
    const sources = items.flatMap(rememberedSources);
    if (sources.length > 8) throw new MemoryValidationError('摘要來源超過 8 筆');
    const inherited = items.flatMap(item => item.unresolved || []);
    const available = [...refs, ...sources, ...inherited];
    if (operation.unresolved.some((ref: MemoryRef) => !available.some(target => target.id === ref?.id && target.version === ref.version))) throw new MemoryValidationError('矛盾只能引用本次整理來源');
    if (['merge', 'rewrite'].includes(operation.type) && inherited.some(ref => !operation.unresolved.some((item: MemoryRef) => item.id === ref.id && item.version === ref.version))) throw new MemoryValidationError('摘要不能默默解決仍未一致的主觀來源');
    const first = items[0], origins = items.flatMap(item => item.origins ?? [item.origin]);
    if (operation.type === 'keep') {
      if (items.length !== 1 || operation.unresolved.length) throw new MemoryValidationError('保留每項只處理一筆記憶');
      candidate.memoryTrace.push({ id: crypto.randomUUID(), version: 1, type: 'keep', from: refs, to: refs[0], reason: operation.reason });
      continue;
    }
    const updated: LongMemory = ['merge', 'rewrite'].includes(operation.type)
      ? { ...first, version: first.version + 1, kind: 'summary', state: 'active', text: operation.text, rememberedSources: sources, origins, unresolved: operation.unresolved, reason: operation.reason }
      : { ...first, version: first.version + 1, state: 'active', ...(operation.text ? { text: operation.text } : {}), source: { kind: first.source.kind, ...(first.source.sense ? { sense: first.source.sense } : {}), ...(first.source.clarity ? { clarity: first.source.clarity } : {}) }, rememberedSources: [], reason: operation.reason };
    if (operation.type !== 'merge' && items.length !== 1) throw new MemoryValidationError('來源遺忘每項只處理一筆記憶');
    for (const item of items) changed.add(item.id);
    removedOrigins.push(...origins);
    candidate.longTerm = candidate.longTerm!.filter(item => !seen.has(item.id)); if (operation.type !== 'forget') candidate.longTerm.push(updated);
    candidate.shortTerm = candidate.shortTerm!.filter(item => !origins.some(ref => ref.id === item.id && ref.version === item.version));
    candidate.memoryTrace.push({ id: crypto.randomUUID(), version: 1, type: operation.type, from: refs, ...(operation.type !== 'forget' ? { to: { id: updated.id, version: updated.version } } : {}), reason: operation.reason });
  }
  if (candidate.longTerm.some(item => !changed.has(item.id) && (item.origins || [item.origin]).some(ref => removedOrigins.some(origin => origin.id === ref.id && origin.version === ref.version)))) throw new MemoryValidationError('同源內容仍在另一筆未整理記憶中，需明示一起處理');
  if (removedTraces.some(trace => traceRequired(trace, candidate))) throw new MemoryValidationError('仍被現行版本或未解矛盾引用的追溯不能釋放');
  projectMemories(candidate);
  validateMemoryState(candidate);
  return { shortTerm: candidate.shortTerm, longTerm: candidate.longTerm, memoryTrace: candidate.memoryTrace };
}
export type LastKnownEntry = { reference: MemoryRef & { kind: 'short' | 'long' }; time: number; text?: string; textLocation?: 'self.longTerm'; source: MemorySource };
export type LastKnownState = { entries: LastKnownEntry[]; capacity: number; omitted: number; gap: string };
// A view of accounts already present in this request, never an independent
// store. In particular no World, trace or forgotten memory is available here.
function lastKnownState(short: ReturnType<typeof memoryProjection>, long: MemoryProjection, topics: string[], byteLimit: number, recalled: MemoryProjection = []): LastKnownState {
  const state: LastKnownState = { entries: [], capacity: 8, omitted: 0, gap: '僅整理本次可見的主觀來源；未列出、已忘或未得知的狀態與後續補充仍未知，所知狀態不證明受阻原因。' };
  const accounts = [...short.map(item => ({ ...item, kind: 'short' as const })), ...[...recalled, ...long].map(item => ({ ...item, kind: 'long' as const }))];
  const latest = [...accounts].sort((a,b) => b.time-a.time).slice(0,4).map(item=>item.text).join('\n');
  // Reconnect explicit identities retained in accounts even after their object
  // leaves the active list. These tokens only rank already-visible sources.
  for (const item of accounts) for (const match of item.text.matchAll(/\[([^\[\]\s]{1,128})\]/g)) {
    const id=match[1];
    if (latest.includes(' '+id+' ') || latest.includes('['+id+']')) topics.push(id);
  }
  const requested = (item: {id:string;version:number}) => recalled.some(ref=>ref.id===item.id&&ref.version===item.version);
  const relevant = (text: string) => topics.some(topic => topic.length > 1 && text.includes(topic));
  // Exact known identities/labels are relevance hints, not semantic matching or
  // truth correction. Keep competing subjective accounts instead of collapsing
  // them into one authoritative assertion.
  accounts.sort((a, b) => Number(requested(b)) - Number(requested(a)) || Number(relevant(b.text)) - Number(relevant(a.text)) || b.time - a.time);
  for (const item of accounts) {
    if (state.entries.length === state.capacity) break;
    const entry = { reference: { kind: item.kind, id: item.id, version: item.version }, time: item.time, ...(requested(item) ? {textLocation: 'self.longTerm' as const} : {text: item.text}), source: item.source };
    state.entries.push(entry);
    if (memoryBytes(state) > byteLimit) state.entries.pop();
  }
  state.omitted = accounts.length - state.entries.length;
  return state;
}
export function budgetMemoryInput<T extends { self: { arrangements?:{items:Arrangement[];capacity:number}; lastKnownState?: LastKnownState; plan?: {action: {target?: string}}; intents?: {content:string;context:string}[]; preferences?: {items:Preference[];capacity:number}; shortTerm: unknown[]; longTerm: MemoryProjection | undefined; memories: unknown[]; observations: unknown[]; relationships: Record<string, string>; cognition?: { beliefs: Belief[]; relationshipTags: RelationshipTag[]; historyCandidates?: unknown[]; reviewCandidates?: { kind: 'belief' | 'relationship'; id: string; version: number }[] }; memoryReview?: MemoryReview[] }; knownControlExperiences?: unknown[]; learnedHabits?: unknown[]; pendingInterventions: unknown[] }>(input: T, character?: Character, recalledMemories?: unknown): T & { self: { arrangements?:{items:Arrangement[];capacity:number}; lastKnownState?: LastKnownState } } {
  input.self.lastKnownState = undefined;
  if(input.self.arrangements)input.self.arrangements.items=[];
  const candidates = input.self.longTerm || [];
  const tendencies = input.learnedHabits || [];
  if(input.learnedHabits) input.learnedHabits = [];
  const preferences = input.self.preferences?.items || [];
  if(input.self.preferences) input.self.preferences.items = [];
  const cognition = input.self.cognition;
  const beliefs = cognition?.beliefs || [], tags = cognition?.relationshipTags || [];
  if (cognition) { cognition.beliefs = []; cognition.relationshipTags = []; input.self.relationships = {}; }
  input.self.longTerm = [];
  const underPressure = (items: unknown[], count: number, bytes: number) => items.length >= count * .75 || memoryBytes(items) >= bytes * .75;
  const short = character?.shortTerm || [];
  const traces = [...(character?.memoryTrace || []), ...((character as Character & CognitiveMemoryReferences | undefined)?.cognition?.trace || [])];
  const pressureQueues: MemoryReview[][] = character ? [
    underPressure(short, 80, 64 * 1024) ? short.filter(item => !item.consumed).map(({ id, version }) => ({ kind: 'short' as const, id, version })) : [],
    underPressure(character.longTerm || [], 64, 64 * 1024) ? candidates.map(({ id, version }) => ({ kind: 'long' as const, id, version })) : [],
    underPressure(traces, 24, 12 * 1024) ? (character.memoryTrace || []).map(trace => ({ kind: 'trace' as const, id: trace.id, version: trace.version, required: traceRequired(trace, character) })) : [],
  ].filter(queue => queue.length > 0) : [];
    const reviewWithin = (limit: number) => {
    const result: MemoryReview[] = [];
    for (let offset = 0; result.length < limit && pressureQueues.some(queue => offset < queue.length); offset++) {
      for (const queue of pressureQueues) if (queue[offset] && result.length < limit) result.push(queue[offset]);
    }
    return result;
  };
  input.self.memoryReview = reviewWithin(8);
  if (cognition && input.self.memoryReview.length && ((cognition.historyCandidates?.length || 0) + (cognition.reviewCandidates?.length || 0))) {
    input.self.memoryReview = reviewWithin(4);
    const historyQuota = cognition.historyCandidates?.length && cognition.reviewCandidates?.length ? 2 : 4;
    if (cognition.historyCandidates) cognition.historyCandidates = cognition.historyCandidates.slice(0, historyQuota);
    if (cognition.reviewCandidates) cognition.reviewCandidates = cognition.reviewCandidates.slice(0, 4 - (cognition.historyCandidates?.length || 0));
  }
  const budgetBytes=88*1024-1536;
  const payload = () => recalledMemories ? { input, recalledMemories } : {input};
  // Compatibility text duplicates may be omitted; their canonical short-term
  // identities, source, and control provenance remain visible in full.
  if (memoryBytes(payload()) > budgetBytes) input.self.memories = [];
  if (memoryBytes(payload()) > budgetBytes) input.knownControlExperiences = [];
  if (memoryBytes(payload()) > budgetBytes) input.self.observations = [];
  if (memoryBytes(payload()) > budgetBytes) input.pendingInterventions = input.pendingInterventions.map(item => {
    const request = item as { id: string; time: number; memoryId?: string };
    return request.memoryId ? { id: request.id, time: request.time, memoryId: request.memoryId } : item;
  });
  if (memoryBytes(payload()) > budgetBytes) throw new MemoryValidationError('記憶輸入超過 88 KiB');
  // A recalled source and the exact arrangement it makes readable compete as
  // one priority projection, before optional original long memories fill space.
  const recalled=(recalledMemories as {memories?:MemoryProjection}|undefined)?.memories||[];
  if(input.self.arrangements&&character&&recalled.length){
    const visible={shortTerm:character.shortTerm?.filter(m=>(input.self.shortTerm as MemoryRef[]).some(r=>r.id===m.id&&r.version===m.version)),longTerm:character.longTerm?.filter(m=>recalled.some(r=>r.id===m.id&&r.version===m.version))};
    for(const item of arrangementsForDecision(character,visible).items){if(!input.self.arrangements.items.some(shown=>shown.id===item.id&&shown.version===item.version)){input.self.arrangements.items.push(item);if(memoryBytes(payload())>budgetBytes)input.self.arrangements.items.pop();}}
  }
  if (cognition) {
    for (const belief of beliefs) { cognition.beliefs.push(belief); if (memoryBytes(payload()) > budgetBytes) cognition.beliefs.pop(); }
    for (const tag of tags) { cognition.relationshipTags.push(tag); input.self.relationships = relationshipsProjection(cognition.relationshipTags); if (memoryBytes(payload()) > budgetBytes) { cognition.relationshipTags.pop(); input.self.relationships = relationshipsProjection(cognition.relationshipTags); } }
  }
  for (const candidate of candidates) {
    input.self.longTerm.push(candidate);
    if (memoryBytes(payload()) > budgetBytes) input.self.longTerm.pop();
  }
  input.self.memoryReview = input.self.memoryReview.filter(ref => ref.kind === 'trace' || (ref.kind === 'short' ? input.self.shortTerm as MemoryRef[] : input.self.longTerm!).some(item => item.id === ref.id && item.version === ref.version));
  if (cognition?.reviewCandidates) cognition.reviewCandidates = cognition.reviewCandidates.filter(candidate => (candidate.kind === 'belief' ? cognition.beliefs : cognition.relationshipTags).some(item => item.id === candidate.id && item.version === candidate.version));
  if(input.self.preferences) for(const preference of preferences){input.self.preferences.items.push(preference);if(memoryBytes(payload())>budgetBytes)input.self.preferences.items.pop();}
  if(input.learnedHabits) for(const tendency of tendencies){input.learnedHabits.push(tendency);if(memoryBytes(payload())>budgetBytes)input.learnedHabits.pop();}
  if(input.self.arrangements&&character)for(const item of arrangementsForDecision(character,{shortTerm:character.shortTerm?.filter(m=>(input.self.shortTerm as MemoryRef[]).some(r=>r.id===m.id&&r.version===m.version)),longTerm:character.longTerm?.filter(m=>input.self.longTerm?.some(r=>r.id===m.id&&r.version===m.version))}).items){if(!input.self.arrangements.items.some(shown=>shown.id===item.id&&shown.version===item.version)){input.self.arrangements.items.push(item);if(memoryBytes(payload())>budgetBytes)input.self.arrangements.items.pop();}}
  const topicWords = [input.self.plan?.action.target || '', ...(input.self.intents || []).flatMap(intent => [intent.content, intent.context])];
  const topics = topicWords.filter(Boolean);
  const available = Math.min(8192, budgetBytes - memoryBytes(payload()) - 64);
  // Leave canonical sources intact under capacity pressure; the view is a
  // duplicate that may be omitted, and explicitly records its source gap.
  if (available >= 512) input.self.lastKnownState = lastKnownState(input.self.shortTerm as ReturnType<typeof memoryProjection>, input.self.longTerm, topics, available, (recalledMemories as { memories?: MemoryProjection } | undefined)?.memories || []);
  Object.assign(input,{projectionGaps:{longTerm:candidates.length-(input.self.longTerm?.length||0),beliefs:beliefs.length-(cognition?.beliefs.length||0),relationships:tags.length-(cognition?.relationshipTags.length||0),preferences:preferences.length-(input.self.preferences?.items.length||0),habits:tendencies.length-(input.learnedHabits?.length||0)}});
  return input;
}
export function validateMemoryState(c: Character) {
  validateArrangements(c);
  validateCognition(c);
  validatePreferences(c);
  const boundedId = (value: unknown) => typeof value === 'string' && value.length > 0 && textBytes(value) <= 128;
  const validSource = (source: MemorySource) => source && typeof source === 'object' && !Array.isArray(source) && Object.keys(source).every(key => ['kind', 'person', 'object', 'supply', 'region', 'sense', 'clarity'].includes(key)) && ['legacy-unclassified', 'experience', 'observation'].includes(source.kind) && (source.person === undefined || boundedId(source.person)) && (source.object === undefined || boundedId(source.object)) && (source.supply === undefined || boundedId(source.supply)) && (source.region === undefined || boundedId(source.region)) && (source.sense === undefined || ['sight', 'hearing', 'touch'].includes(source.sense)) && (source.clarity === undefined || ['clear', 'vague'].includes(source.clarity));
  if(c.observationSequence!==undefined&&(!Number.isSafeInteger(c.observationSequence)||c.observationSequence<0))throw new MemoryValidationError('感知順序高水位無效');
  const shortIds = new Set<string>(),observationSequences=new Set<number>();
  for (const item of c.shortTerm || []) {
    if (shortIds.has(item.id)) throw new MemoryValidationError('短期記憶身份重複');
    shortIds.add(item.id);
    if(item.observationSequence!==undefined){if(!item.observation||!Number.isSafeInteger(item.observationSequence)||item.observationSequence<1||observationSequences.has(item.observationSequence)||c.observationSequence!==undefined&&item.observationSequence>c.observationSequence)throw new MemoryValidationError('感知順序無效或重複');observationSequences.add(item.observationSequence);}
    if (item.observation && (item.observation.id !== item.id || item.observation.text !== item.text || item.observation.time !== item.time || item.observation.source !== item.source.person || item.observation.objectId !== item.source.object || item.observation.supplyId !== item.source.supply || item.observation.region !== item.source.region || item.observation.sense !== item.source.sense || item.observation.clarity !== item.source.clarity)) throw new MemoryValidationError('主觀觀察投影不一致');
    if (!boundedId(item.id) || item.characterId !== c.id || !Number.isSafeInteger(item.version) || item.version < 1 || !Number.isFinite(item.time) || !validSource(item.source) || (item.eventId && !boundedId(item.eventId))) throw new MemoryValidationError('短期記憶身份或來源無效');
    validateShort(item);
  }
  const long = c.longTerm || [], ids = new Set<string>();
  for (const item of long) {
    if (!boundedId(item.id) || ids.has(item.id) || item.characterId !== c.id || !Number.isSafeInteger(item.version) || item.version < 1 || !Number.isFinite(item.time) || !validSource(item.source) || typeof item.text !== 'string' || textBytes(item.text) > 4096 || typeof item.reason !== 'string' || textBytes(item.reason) > 256 || !boundedId(item.origin?.id) || !Number.isSafeInteger(item.origin.version) || item.origin.version < 1) throw new MemoryValidationError('長期記憶格式或文字超限');
    ids.add(item.id);
    if ((item.kind !== undefined && !['episode', 'summary'].includes(item.kind)) || (item.state !== undefined && !['active', 'superseded', 'forgotten'].includes(item.state)) || (item.origins !== undefined && !validRefs(item.origins)) || (item.unresolved !== undefined && !validRefs(item.unresolved)) || (item.rememberedSources !== undefined && (!Array.isArray(item.rememberedSources) || item.rememberedSources.length > 8 || item.rememberedSources.some(ref => !validRef({ id: ref?.id, version: ref?.version }) || Object.keys(ref).some(key => !['id', 'version', 'source'].includes(key)) || !validSource(ref.source))))) throw new MemoryValidationError('摘要來源、矛盾或狀態格式無效');
  }
  if (long.length > 64 || memoryBytes(long) > 64 * 1024) throw new MemoryValidationError('長期記憶容量超限，未刪除任何資料');
  const combinedTrace = [...(c.memoryTrace || []), ...((c as Character & CognitiveMemoryReferences).cognition?.trace || [])];
  if (combinedTrace.length > 24 || memoryBytes(combinedTrace) > 12 * 1024) throw new MemoryValidationError('記憶及認知追溯容量已滿，需要明示精簡');
  const traceIds = new Set<string>();
  for (const trace of c.memoryTrace || []) {
    if (!boundedId(trace.id) || traceIds.has(trace.id) || !Number.isSafeInteger(trace.version) || trace.version < 1 || !['merge', 'rewrite', 'forget', 'forget-source', 'keep'].includes(trace.type) || !validRefs(trace.from) || trace.from.length === 0 || (trace.to !== undefined && !validRef(trace.to)) || typeof trace.reason !== 'string' || !trace.reason.trim() || textBytes(trace.reason) > 256 || Object.keys(trace).some(key => !['id', 'version', 'type', 'from', 'to', 'reason'].includes(key))) throw new MemoryValidationError('記憶追溯格式或引用無效');
    traceIds.add(trace.id);
  }
  // Existing relationship text remains unchanged; no belief/tag conversion.
  if (Object.keys(c.relationships).length > 32 || memoryBytes(c.relationships) > 12 * 1024 || Object.entries(c.relationships).some(([id, text]) => !boundedId(id) || typeof text !== 'string' || (!c.cognition && textBytes(text) > 256))) throw new MemoryValidationError('既有關係文字超過記憶契約，未截斷資料');
  if (memoryStateBytes(c) > 208 * 1024) throw new MemoryValidationError('角色記憶總量超過 208 KiB，未截斷資料');
}
export function memoryStateBytes(c: Character) {
  const state = { arrangements:c.arrangements, preferences:c.preferences, shortTerm: c.shortTerm, longTerm: c.longTerm, memoryTrace: c.memoryTrace, cognition: (c as Character & CognitiveMemoryReferences).cognition, memories: c.memories, observations: c.observations, observationSequence:c.observationSequence, observationCursor: c.observationCursor, controlExperiences: c.control?.experiences, relationships: c.relationships };
  return memoryBytes(state);
}
