import type { Character } from './world';
import { MemoryValidationError, memoryBytes, type MemoryReview } from './memory';

export type CognitiveReference = { kind: 'short' | 'long' | 'belief' | 'relationship'; id: string; version: number };
export type Conviction = 'doubtful' | 'leaning' | 'certain';
export type Belief = { id: string; characterId: string; version: number; time: number; topic: string; text: string; conviction: Conviction; references: CognitiveReference[]; contradictions: string[]; reason: string };
export type RelationshipTag = { id: string; characterId: string; version: number; time: number; person: string; topic: string; text: string; references: CognitiveReference[]; reason?: string; origin?: 'legacy-unclassified' };
export type CognitiveTrace = { traceId: string; kind: 'belief' | 'relationship'; id: string; version: number; operation: 'upsert' | 'keep' | 'withdraw'; time: number; reason: string; references: CognitiveReference[]; conviction?: Conviction; nextVersion?: number };
export type CognitiveState = { beliefs: Belief[]; relationshipTags: RelationshipTag[]; trace: CognitiveTrace[] };
export type HistoryCandidate = Pick<CognitiveTrace, 'traceId' | 'kind' | 'id' | 'version' | 'operation'> & { required: boolean };
export type CognitiveDecisionContext = { visible: Character; knownPeople: string[]; historyCandidates: HistoryCandidate[]; memoryReview?: MemoryReview[] };
type CognitiveView = { beliefs: Belief[]; relationshipTags: RelationshipTag[]; historyCandidates?: HistoryCandidate[]; reviewCandidates?: { kind: 'belief' | 'relationship'; id: string; version: number }[] };
const byteLength = (text: string) => new TextEncoder().encode(text).length;
const boundedText = (value: unknown, limit: number, required = true): value is string => typeof value === 'string' && byteLength(value) <= limit && (!required || !!value.trim());
const validVersion = (value: unknown, minimum = 1): value is number => Number.isSafeInteger(value) && Number(value) >= minimum;
const referenceSchema = { type: 'array', maxItems: 8, items: { type: 'object', properties: { kind: { type: 'string', enum: ['short', 'long', 'belief', 'relationship'] }, id: { type: 'string', minLength: 1, maxLength: 128 }, version: { type: 'integer', minimum: 1 } }, required: ['kind', 'id', 'version'], additionalProperties: false } };
const beliefUpdateSchema = { type: 'object', properties: {
  kind: { type: 'string', enum: ['belief'] }, operation: { type: 'string', enum: ['upsert'] }, id: { type: 'string', minLength: 1, maxLength: 128 }, version: { type: 'integer', minimum: 0 }, topic: { type: 'string', minLength: 1, maxLength: 128 }, text: { type: 'string', minLength: 1, maxLength: 512 }, conviction: { type: 'string', enum: ['doubtful', 'leaning', 'certain'] }, references: referenceSchema, contradictions: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 128 } }, reason: { type: 'string', minLength: 1, maxLength: 256 },
}, required: ['kind', 'operation', 'id', 'version', 'topic', 'text', 'conviction', 'references', 'contradictions', 'reason'], additionalProperties: false };
const relationshipUpdateSchema = { type: 'object', properties: { kind: { type: 'string', enum: ['relationship'] }, operation: { type: 'string', enum: ['upsert'] }, id: { type: 'string', minLength: 1, maxLength: 128 }, version: { type: 'integer', minimum: 0 }, person: { type: 'string', minLength: 1, maxLength: 128 }, topic: { type: 'string', minLength: 1, maxLength: 128 }, text: { type: 'string', minLength: 1, maxLength: 256 }, references: referenceSchema, reason: { type: 'string', minLength: 1, maxLength: 256 } }, required: ['kind', 'operation', 'id', 'version', 'person', 'topic', 'text', 'references', 'reason'], additionalProperties: false };
const reviewSchema = { type: 'object', properties: { kind: { type: 'string', enum: ['belief', 'relationship'] }, operation: { type: 'string', enum: ['keep', 'withdraw'] }, id: { type: 'string', minLength: 1, maxLength: 128 }, version: { type: 'integer', minimum: 1 }, references: referenceSchema, reason: { type: 'string', minLength: 1, maxLength: 256 } }, required: ['kind', 'operation', 'id', 'version', 'references', 'reason'], additionalProperties: false };
const historySchema = { type: 'object', properties: { kind: { type: 'string', enum: ['history'] }, operation: { type: 'string', enum: ['forget'] }, id: { type: 'string', minLength: 1, maxLength: 128 }, version: { type: 'integer', enum: [1] }, reason: { type: 'string', minLength: 1, maxLength: 256 } }, required: ['kind', 'operation', 'id', 'version', 'reason'], additionalProperties: false };
export const cognitiveUpdatesSchema = { type: 'array', maxItems: 4, items: { anyOf: [beliefUpdateSchema, relationshipUpdateSchema, reviewSchema, historySchema] } };

function legacyState(c: Character): CognitiveState {
  return { beliefs: [], relationshipTags: Object.entries(c.relationships).map(([person, text]) => ({ id: `legacy:${c.id}:relationship:${person}`, characterId: c.id, version: 1, time: 0, person, topic: '', text, references: [], origin: 'legacy-unclassified' })), trace: [] };
}
export function cognitiveProjection(c: Character): CognitiveView {
  const state = c.cognition || legacyState(c);
  return { beliefs: state.beliefs, relationshipTags: state.relationshipTags };
}
export function cognitionForDecision(c: Character, contacts: { id: string; name: string }[], visiblePeople: { id: string }[]): CognitiveView {
  const intentions = (c.intents || []).map(item => `${item.content} ${item.context}`).join(' ');
  const current = cognitiveProjection(c);
  const relatedPeople = new Set([...visiblePeople.map(person => person.id), ...[...(c.shortTerm || []), ...(c.longTerm || [])].flatMap(item => item.source.person ? [item.source.person] : []), ...contacts.filter(person => intentions.includes(person.id) || intentions.includes(person.name)).map(person => person.id), ...current.relationshipTags.filter(tag => intentions.includes(tag.person) || (tag.person === 'observer' && intentions.includes('觀察者'))).map(tag => tag.person)]);
  const view: CognitiveView = { beliefs: current.beliefs, relationshipTags: current.relationshipTags.filter(tag => relatedPeople.has(tag.person)).slice(0, 8) };
  const trace = c.cognition?.trace || [], memoryTrace = (c as Character & { memoryTrace?: unknown[] }).memoryTrace || [];
  if (trace.length + memoryTrace.length >= 18 || memoryBytes([...trace, ...memoryTrace]) >= 9 * 1024) view.historyCandidates = trace.slice(0, 8).map(item => ({ traceId: item.traceId, kind: item.kind, id: item.id, version: item.version, operation: item.operation, required: traceRequired(item, c.cognition!) }));
  if (current.beliefs.length >= 18 || memoryBytes(current.beliefs) >= 12 * 1024 || current.relationshipTags.length >= 24 || memoryBytes(current.relationshipTags) >= 9 * 1024) view.reviewCandidates = [...view.beliefs.map(({ id, version }) => ({ kind: 'belief' as const, id, version })), ...view.relationshipTags.map(({ id, version }) => ({ kind: 'relationship' as const, id, version }))].slice(0, 8);
  if (view.historyCandidates?.length && view.reviewCandidates?.length) { view.historyCandidates = view.historyCandidates.slice(0, 4); view.reviewCandidates = view.reviewCandidates.slice(0, 4); }
  return view;
}
export function knownPeopleForDecision(visible: Character, contacts: string[]) {
  const senders = [...(visible.shortTerm || []), ...(visible.longTerm || [])].flatMap(item => item.source.person ? [item.source.person] : []);
  const tagged = cognitiveProjection(visible).relationshipTags.map(tag => tag.person);
  return [...new Set([...contacts, ...senders, ...tagged])].filter(person => !['world', 'system'].includes(person));
}
function traceRequired(trace: CognitiveTrace, state: CognitiveState) {
  const referenced = [...state.beliefs, ...state.relationshipTags].some(item => item.references.some(ref => ref.kind === trace.kind && ref.id === trace.id && ref.version === trace.version));
  if (!referenced || trace.operation !== 'keep') return referenced;
  // A keep does not create a new version. The current item, or its actual
  // changed/withdrawn version record, preserves the referenced identity.
  const current = trace.kind === 'belief' ? state.beliefs : state.relationshipTags;
  if (current.some(item => item.id === trace.id && item.version === trace.version)) return false;
  const sameVersion = state.trace.filter(item => item.kind === trace.kind && item.id === trace.id && item.version === trace.version);
  if (sameVersion.some(item => item.operation !== 'keep')) return false;
  return !sameVersion.length || sameVersion[0].traceId === trace.traceId;
}
export function relationshipsProjection(tags: RelationshipTag[]) {
  const relationships: Record<string, string> = {};
  for (const tag of tags) relationships[tag.person] = relationships[tag.person] ? `${relationships[tag.person]}；${tag.text}` : tag.text;
  return relationships;
}
export function projectRelationships(c: Character) {
  if (!c.cognition) return;
  c.relationships = relationshipsProjection(c.cognition.relationshipTags);
}
function referenceFormat(value: unknown): value is CognitiveReference {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const ref = value as CognitiveReference;
  return Object.keys(ref).every(key => ['kind', 'id', 'version'].includes(key)) && ['short', 'long', 'belief', 'relationship'].includes(ref.kind) && boundedText(ref.id, 128) && validVersion(ref.version);
}
function referencesVisible(value: unknown, visible: Character): CognitiveReference[] {
  if (!Array.isArray(value) || !value.length || value.length > 8) throw new MemoryValidationError('認知來源引用無效');
  for (const ref of value) {
    if (!referenceFormat(ref)) throw new MemoryValidationError('認知來源引用格式無效');
    const list = ref.kind === 'short' ? visible.shortTerm : ref.kind === 'long' ? visible.longTerm : ref.kind === 'belief' ? cognitiveProjection(visible).beliefs : cognitiveProjection(visible).relationshipTags;
    if (!list?.some(item => item.id === ref.id && item.version === ref.version && item.characterId === visible.id)) throw new MemoryValidationError('只能引用本次可見的自己的認知版本');
  }
  return value;
}
export function updateCognition(c: Character, value: unknown, time: number, context: CognitiveDecisionContext): CognitiveState | undefined {
  const { visible, knownPeople, historyCandidates } = context;
  if (value === undefined || (Array.isArray(value) && !value.length)) return undefined;
  if (!Array.isArray(value) || value.length > 4 || memoryBytes(value) > 8192) throw new MemoryValidationError('認知更新超限');
  const state: CognitiveState = structuredClone(c.cognition || legacyState(c));
  const changed = new Set<string>();
  const historyRemovals = new Set<string>();
  for (const item of value) {
    if (item?.kind === 'history') {
      if (Object.keys(item).some(key => !historySchema.required.includes(key)) || item.operation !== 'forget' || item.version !== 1 || !boundedText(item.id, 128) || !boundedText(item.reason, 256) || changed.has(`history:${item.id}`)) throw new MemoryValidationError('認知歷史整理格式無效');
      const trace = state.trace.find(trace => trace.traceId === item.id);
      if (!trace || !historyCandidates.some(candidate => candidate.traceId === item.id)) throw new MemoryValidationError('只能明示釋放本次可見的歷史中介資料');
      historyRemovals.add(item.id); changed.add(`history:${item.id}`); continue;
    }
    if (!item || typeof item !== 'object' || !['belief', 'relationship'].includes(item.kind) || !['upsert', 'keep', 'withdraw'].includes(item.operation) || !boundedText(item.id, 128) || !validVersion(item.version, 0) || !boundedText(item.reason, 256) || changed.has(`${item.kind}:${item.id}`)) throw new MemoryValidationError('認知更新格式無效');
    const keys = item.operation === 'upsert' ? item.kind === 'belief' ? beliefUpdateSchema.required : relationshipUpdateSchema.required : reviewSchema.required;
    if (Object.keys(item).some(key => !keys.includes(key))) throw new MemoryValidationError('認知更新欄位無效');
    changed.add(`${item.kind}:${item.id}`);
    const list = item.kind === 'belief' ? state.beliefs : state.relationshipTags;
    const visibleList = item.kind === 'belief' ? cognitiveProjection(visible).beliefs : cognitiveProjection(visible).relationshipTags;
    const previous = list.find(b => b.id === item.id), references = referencesVisible(item.references, visible);
    if (previous ? previous.version !== item.version || !visibleList.some(b => b.id === previous.id && b.version === item.version) : item.version !== 0 || item.operation !== 'upsert' || state.trace.some(t => t.kind === item.kind && t.id === item.id)) throw new MemoryValidationError('認知版本無效');
    if (item.operation === 'upsert' && item.kind === 'belief') {
      if (!boundedText(item.topic, 128) || !boundedText(item.text, 512) || !['doubtful', 'leaning', 'certain'].includes(item.conviction) || !Array.isArray(item.contradictions) || item.contradictions.length > 8 || new Set(item.contradictions).size !== item.contradictions.length || item.contradictions.some((id: unknown) => !boundedText(id, 128) || id === item.id || !cognitiveProjection(visible).beliefs.some(b => b.id === id))) throw new MemoryValidationError('信念更新或矛盾引用格式無效');
      if (!previous && state.beliefs.some(b => b.topic.normalize('NFKC').trim().toLowerCase() === item.topic.normalize('NFKC').trim().toLowerCase() && !item.contradictions.includes(b.id))) throw new MemoryValidationError('相同主題信念應更新既有身份，或明示未解矛盾');
      const next: Belief = { id: item.id, characterId: c.id, version: item.version + 1, time, topic: item.topic, text: item.text, conviction: item.conviction, references, contradictions: item.contradictions, reason: item.reason };
      if (previous) state.beliefs[state.beliefs.findIndex(b => b.id === item.id)] = next;
      else state.beliefs.push(next);
    } else if (item.operation === 'upsert') {
      if (!boundedText(item.person, 128) || !knownPeople.includes(item.person) || item.person === c.id || !boundedText(item.topic, 128) || !boundedText(item.text, 256) || (previous && (previous as RelationshipTag).person !== item.person)) throw new MemoryValidationError('關係標籤只能關聯已知人物');
      if (!previous && state.relationshipTags.some(tag => tag.person === item.person && tag.topic.normalize('NFKC').trim().toLowerCase() === item.topic.normalize('NFKC').trim().toLowerCase())) throw new MemoryValidationError('相同人物與主題標籤應更新既有身份');
      const next: RelationshipTag = { id: item.id, characterId: c.id, version: item.version + 1, time, person: item.person, topic: item.topic, text: item.text, references, reason: item.reason };
      if (previous) state.relationshipTags[state.relationshipTags.findIndex(tag => tag.id === item.id)] = next;
      else state.relationshipTags.push(next);
    } else if (item.operation === 'withdraw') list.splice(list.findIndex(b => b.id === item.id), 1);
    if (previous) state.trace.push({ traceId: crypto.randomUUID(), kind: item.kind, id: previous.id, version: previous.version, operation: item.operation, time, reason: item.reason, references, ...('conviction' in previous ? { conviction: previous.conviction } : {}), ...(item.operation === 'upsert' ? { nextVersion: previous.version + 1 } : {}) });
  }
  // Validate against the entire proposed state, so an explicit reference update
  // and its now-unneeded history release do not depend on response array order.
  const remainingTrace = state.trace.filter(trace => !historyRemovals.has(trace.traceId));
  for (const trace of state.trace) if (historyRemovals.has(trace.traceId) && traceRequired(trace, { ...state, trace: remainingTrace })) throw new MemoryValidationError('不能釋放最終現行認知仍需要的版本來源鏈');
  state.trace = remainingTrace;
  // Compose cognition with all same-decision memory changes before validating
  // the complete character at consumeMemories → validateMemoryState.
  return state;
}
export function validateCognition(c: Character) {
  if (!c.cognition) return;
  const state = c.cognition;
  if (Object.keys(state).some(key => !['beliefs', 'relationshipTags', 'trace'].includes(key)) || !Array.isArray(state.beliefs) || !Array.isArray(state.relationshipTags) || !Array.isArray(state.trace)) throw new MemoryValidationError('認知狀態無效');
  const unique = (items: { id: string }[]) => new Set(items.map(item => item.id)).size === items.length;
  if (!unique(state.beliefs) || !unique(state.relationshipTags) || new Set(state.trace.map(item => item.traceId)).size !== state.trace.length) throw new MemoryValidationError('認知身份重複');
  for (const belief of state.beliefs) {
    if (Object.keys(belief).some(key => !['id', 'characterId', 'version', 'time', 'topic', 'text', 'conviction', 'references', 'contradictions', 'reason'].includes(key)) || !boundedText(belief.id, 128) || belief.characterId !== c.id || !validVersion(belief.version) || !Number.isFinite(belief.time) || !boundedText(belief.topic, 128) || !boundedText(belief.text, 512) || !boundedText(belief.reason, 256) || !['doubtful', 'leaning', 'certain'].includes(belief.conviction) || !Array.isArray(belief.references) || belief.references.length > 8 || belief.references.some(ref => !referenceFormat(ref)) || !Array.isArray(belief.contradictions) || belief.contradictions.length > 8 || new Set(belief.contradictions).size !== belief.contradictions.length || belief.contradictions.some(id => !boundedText(id, 128))) throw new MemoryValidationError('信念狀態或來源無效');
    if (belief.contradictions.some(id => id === belief.id || !state.beliefs.some(other => other.id === id))) throw new MemoryValidationError('不能默默撤回未解矛盾的另一個看法');
  }
  for (const tag of state.relationshipTags) {
    if (Object.keys(tag).some(key => !['id', 'characterId', 'version', 'time', 'person', 'topic', 'text', 'references', 'reason', 'origin'].includes(key)) || !boundedText(tag.id, 128) || tag.characterId !== c.id || !validVersion(tag.version) || !Number.isFinite(tag.time) || !boundedText(tag.person, 128) || !boundedText(tag.topic, 128, false) || !boundedText(tag.text, 256) || (tag.reason !== undefined && !boundedText(tag.reason, 256)) || (tag.origin !== undefined && tag.origin !== 'legacy-unclassified') || !Array.isArray(tag.references) || tag.references.length > 8 || tag.references.some(ref => !referenceFormat(ref))) throw new MemoryValidationError('關係標籤狀態或來源無效');
  }
  for (const trace of state.trace) {
    if (Object.keys(trace).some(key => !['traceId', 'kind', 'id', 'version', 'operation', 'time', 'reason', 'references', 'conviction', 'nextVersion'].includes(key)) || !boundedText(trace.traceId, 128) || !['belief', 'relationship'].includes(trace.kind) || !boundedText(trace.id, 128) || !validVersion(trace.version) || !['upsert', 'keep', 'withdraw'].includes(trace.operation) || !Number.isFinite(trace.time) || !boundedText(trace.reason, 256) || !Array.isArray(trace.references) || trace.references.length > 8 || trace.references.some(ref => !referenceFormat(ref)) || (trace.conviction !== undefined && !['doubtful', 'leaning', 'certain'].includes(trace.conviction)) || (trace.nextVersion !== undefined && (!validVersion(trace.nextVersion) || trace.nextVersion !== trace.version + 1))) throw new MemoryValidationError('更正歷史只能保存有限身份、狀態、短理由及來源引用');
  }
  const memoryTrace = (c as Character & { memoryTrace?: unknown[] }).memoryTrace || [];
  if (state.beliefs.length > 24 || memoryBytes(state.beliefs) > 16 * 1024 || state.relationshipTags.length > 32 || memoryBytes(state.relationshipTags) > 12 * 1024 || state.trace.length + memoryTrace.length > 24 || memoryBytes([...state.trace, ...memoryTrace]) > 12 * 1024) throw new MemoryValidationError('認知容量超限，未刪除任何現行看法');
}
