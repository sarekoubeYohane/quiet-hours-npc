import { managePausedActivity } from './paused-activities';
import { activateBodyNeeds, advanceBodyNeeds, isSleeping, activeBodyMinutes, bodyIntervalBase, hasUnevaluatedNeed, acknowledgeBodyNeeds } from './needs';
import { advanceNaturalChanges } from './natural-changes';
import { emitExternalConsequences } from './world-effects';
import { requiresWorldEffects, type EffectCandidate } from './world-effects';
import { sustainedActions, canResumeActivity, cancelActivity, progressActivity, discardLegacyActivity, wakeSleepingActivity, startActivity } from './activity-lifecycle';
export { activityDurations, canResumeActivity } from './activity-lifecycle';
import { bindRoutine } from './routine-rules';
import { projectRelationships, type CognitiveState } from './cognition';
import { MemoryValidationError, validateMemoryState, consumeMemories, type LongMemory, type ShortMemory, type MemoryTrace } from './memory';
import { pendingObservations, observationAttention, noteAttention, type AttentionCondition } from './attention';
import { demoDecision, pendingInterventions, record, type Action, type AIUsage, type Character, type Intent, type World } from './world';
import { learnHabit } from './habits';

export type TimeIntent = {kind: 'completion' | 'open-ended'; maxMinutes: number | null};
export type ActivityDecision = { eventHabits?:import('./world').EventHabit[]; preferences?:import('./preferences').PreferenceState; timeIntent?: TimeIntent; freeCandidate?:EffectCandidate; longTerm?: LongMemory[]; cognition?: CognitiveState; interpretation?: string; shortTerm?: ShortMemory[]; memoryTrace?: MemoryTrace[]; action: Action; durationMinutes: number; intents?: Intent[]; attentionConditions?: AttentionCondition[]; attentionDiagnostics?: string[]; continueExisting?: boolean };
export type TokenUsage = { inputTokens: number; outputTokens: number; cachedInputTokens?: number };
export type BudgetLimits = { calls: number | null; tokens: number | null };
export const defaultLimits: BudgetLimits = { calls: 12, tokens: 30000 };
export function validBudgetLimits(value: unknown): value is BudgetLimits {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const limits = value as BudgetLimits;
  return [limits.calls, limits.tokens].every(limit => limit === null || (typeof limit === 'number' && Number.isSafeInteger(limit) && limit > 0));
}
export function budgetReached(usage: AIUsage, limits: BudgetLimits): boolean {
  return (limits.calls !== null && usage.calls >= limits.calls) ||
    (limits.tokens !== null && usage.inputTokens + usage.outputTokens >= limits.tokens);
}
const attentionKinds = new Set(['message', 'intervention']);

export class BudgetExceeded extends Error {
  constructor() { super('已達玩家 AI 用量上限。自動運行已暫停；可調整上限或切換規則試玩。'); }
}

export function currentUsage(world: World, now = Date.now()): AIUsage {
  const existing = world.aiUsage;
  if (existing && now - existing.windowStartedAt < 3600000 && now >= existing.windowStartedAt) return existing;
  return {
    windowStartedAt: now, calls: 0, inputTokens: 0, outputTokens: 0, unknownCalls: 0,
    totalCalls: existing?.totalCalls || 0, totalInputTokens: existing?.totalInputTokens || 0,
    totalOutputTokens: existing?.totalOutputTokens || 0, totalUnknownCalls: existing?.totalUnknownCalls || 0,
    savedDecisions: existing?.savedDecisions || 0,
    ...(existing?.costs ? {costs:{total:existing.costs.total,hour:{}}} : {}),
  };
}

// Only events this character knows can interrupt their activity. Private thoughts stay private.
export function attentionMarker(world: World, character: Character): string {
  return pendingObservations(character).findLast(observation => observationAttention(character, observation))?.id || world.events.findLast(event => event.actor !== character.id && attentionKinds.has(event.kind) && event.audience.includes(character.id))?.id || '';
}

export function canContinue(world: World, character: Character, modelKey: string): boolean {
  if(character.plan?.bodyActivity?.kind==='sleep')return isSleeping(character);
  return (canResumeActivity(world, character, modelKey) || !!character.plan && character.plan.timeIntent?.kind==='open-ended' && character.plan.modelKey===modelKey) && character.plan!.attention === attentionMarker(world, character) &&
    pendingInterventions(world, character).length === 0 && !hasUnevaluatedNeed(character);
}

function mayChooseAutonomously(character: Character): boolean {
  return character.control?.mode !== 'taken-over' && !character.control?.pending && !character.control?.active;
}

export function plannedCalls(world: World, minutes: number, modelKey: string): number {
  const next = structuredClone(world);
  activateBodyNeeds(next);next.minute += minutes;advanceBodyNeeds(next);
  return next.characters.filter(character => mayChooseAutonomously(character) && !canContinue(next, character, modelKey)).length;
}

export function accountUsage(usage: AIUsage, tokens: TokenUsage): void {
  usage.inputTokens += tokens.inputTokens; usage.outputTokens += tokens.outputTokens;
  usage.totalInputTokens += tokens.inputTokens; usage.totalOutputTokens += tokens.outputTokens;
  usage.unknownCalls--; usage.totalUnknownCalls--;
}

export async function advanceActivities(world: World, options: {
  minutes: number; mode: string; modelKey: string; limits: BudgetLimits; now?: number;
  beforeDecision?: () => Promise<void>;
  onActor?: (world:World,character:Character)=>void;
  decide: (world: World, character: Character, onUsage: (tokens: TokenUsage) => void) => Promise<ActivityDecision>;
}): Promise<void> {
  const { minutes, mode, modelKey, limits } = options;
  const ai = mode !== 'demo';
  const usage = currentUsage(world, options.now);
  world.aiUsage = usage;
  if (ai) {
    if (budgetReached(usage, limits)) throw new BudgetExceeded();
  }
  activateBodyNeeds(world);
  const bodyBases=new Map(world.characters.map(actor=>[actor.id,bodyIntervalBase(actor,world.minute+minutes)]));
  const bodyMinutes=new Map(world.characters.map(actor=>[actor.id,minutes-activeBodyMinutes(actor,world.minute,world.minute+minutes)]));
  world.minute += minutes; world.lastMode = mode;
  advanceNaturalChanges(world,world.minute,emitExternalConsequences);
  advanceBodyNeeds(world);
  const offset = world.turn % world.characters.length;
  const ordered = [...world.characters.slice(offset), ...world.characters.slice(0, offset)];
  for (const character of ordered) {
    try {
    const control = character.control;
    discardLegacyActivity(world,character);
    wakeSleepingActivity(world,character);
    let controlledDecision:ActivityDecision|undefined;
    if (control?.pending) {
      const action=control.pending;
      delete control.pending;
      cancelActivity(world,character);
      const openEnded=['rest','reflect'].includes(action.type);
      controlledDecision={action,durationMinutes:openEnded?60:15,timeIntent:{kind:openEnded?'open-ended':'completion',maxMinutes:null}};
    }
    if (!controlledDecision && control?.active && character.plan) {
      progressActivity(world,character,'controlled');
      continue;
    }
    if (!controlledDecision && control?.mode === 'taken-over') {
      character.activity = '待命，等待下一個指定行動。';
      continue;
    }
    if (!controlledDecision && canContinue(world, character, modelKey)) {
      progressActivity(world,character,'automatic');
      if (ai) usage.savedDecisions++;
      continue;
    }
    const observedCount = character.observations?.length || 0;
    noteAttention(world, character, '正常決策或重新評估時取得待用觀察');
    for (const observation of pendingObservations(character)) {
      const reason = observationAttention(character, observation);
      if (reason) noteAttention(world, character, reason, observation.id);
    }
    const respondingToUser = pendingInterventions(world, character).length > 0;
    const from = character.location;
    let decision: ActivityDecision;
    if(controlledDecision)decision=controlledDecision;
    else if (ai) {
      if (budgetReached(usage, limits)) throw new BudgetExceeded();
      await options.beforeDecision?.();
      // Count attempts before requesting, including errors whose usage is not returned.
      usage.calls++; usage.totalCalls++; usage.unknownCalls++; usage.totalUnknownCalls++;
      decision = await options.decide(world, character, tokens => accountUsage(usage, tokens));
      // The route rolls this back with the round on later model/save failure.
      if (control) delete control.experiences;
    } else {
      const action = demoDecision(world, character);
      decision = { action, durationMinutes: sustainedActions.has(action.type) ? 60 : 15 };
    }
    if((controlledDecision||!ai)&&requiresWorldEffects(decision.action)){
      decision.freeCandidate=bindRoutine(world,character,decision.action,decision.durationMinutes,undefined,minutes,decision.timeIntent?.maxMinutes)??{status:'unsupported',effects:[],stages:[],check:null};
    }
    acknowledgeBodyNeeds(character);
    character.observationCursor = observedCount;
    if (decision.eventHabits) character.eventHabits=decision.eventHabits;
    if (decision.longTerm) character.longTerm = decision.longTerm;
    if (decision.shortTerm) character.shortTerm = decision.shortTerm;
    if (decision.memoryTrace) character.memoryTrace = decision.memoryTrace;
    if (decision.cognition) { character.cognition = decision.cognition; projectRelationships(character); }
    if (decision.preferences) character.preferences = decision.preferences;
    consumeMemories(character);
    if (decision.attentionConditions) character.attentionConditions = decision.attentionConditions;
    for (const reason of decision.attentionDiagnostics || []) noteAttention(world, character, reason);
    if (['pause','resume','abandon'].includes(decision.action.type)) {
      if (decision.intents) character.intents=decision.intents;
      managePausedActivity(world,character,decision.action.type as 'pause'|'resume'|'abandon',decision.action.target,modelKey,attentionMarker(world,character));
      continue;
    }
    if (decision.continueExisting) {
      if (!canResumeActivity(world, character, modelKey)) {
        throw Error('沒有可延續的原活動，請選擇新行動。');
      }
      if (decision.intents) character.intents = decision.intents;
      if (typeof decision.action.mood === 'string') character.mood = decision.action.mood;
      character.plan!.attention = attentionMarker(world, character);
      progressActivity(world,character,'chosen');
      continue;
    }
    if (decision.intents) character.intents = decision.intents;
    try {
      if(!startActivity(world,character,decision,{minutes,modelKey,attention:attentionMarker(world,character),ai,bodyMinutes:bodyMinutes.get(character.id),bodyBase:bodyBases.get(character.id)}))continue;
      if (ai && !controlledDecision && !respondingToUser) learnHabit(world, character, decision.action, from, decision.freeCandidate);
      if(controlledDecision&&character.plan)control!.active=true;
    } catch (error) {
      if (error instanceof MemoryValidationError || requiresWorldEffects(decision.action)) throw error;
      record(world, character.id, `${character.name} 的行動未通過規則檢查，這段時間留在原地。`, 'blocked', [character.id]);
    }
    } finally {try{options.onActor?.(world,character);}catch{/* Observer cannot change execution. */}}
  }
  for (const character of world.characters) for (const observation of pendingObservations(character)) {
    const reason = observationAttention(character, observation);
    noteAttention(world, character, character.control?.mode === 'taken-over' || character.control?.active ? '使用者控制，等待指定行動' : reason ? `${reason}；留待下次決策` : '一般線索，等待正常決策', observation.id);
  }
  for (const character of world.characters) validateMemoryState(character);
  world.turn++;
}

