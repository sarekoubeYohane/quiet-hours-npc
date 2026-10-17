import { requiresWorldEffects, advanceFreePhases, commitFreeAction, EffectValidationError, type EffectCandidate } from './world-effects';
import { projectRelationships, type CognitiveState } from './cognition';
import { MemoryValidationError, validateMemoryState, consumeMemories, type LongMemory, type ShortMemory, type MemoryTrace } from './memory';
import { pendingObservations, observationAttention, noteAttention, type AttentionCondition } from './attention';
import { demoDecision, pendingInterventions, record, resolve, type Action, type AIUsage, type Character, type Intent, type World } from './world';
import { learnHabit } from './habits';

export type ActivityDecision = { freeCandidate?:EffectCandidate; longTerm?: LongMemory[]; cognition?: CognitiveState; interpretation?: string; shortTerm?: ShortMemory[]; memoryTrace?: MemoryTrace[]; action: Action; durationMinutes: number; intents?: Intent[]; attentionConditions?: AttentionCondition[]; attentionDiagnostics?: string[]; continueExisting?: boolean };
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
export const activityDurations = [15, 30, 60, 90];
const sustained = new Set<Action['type']>(['propose', 'rest', 'work', 'reflect', 'observe']);
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

export function canResumeActivity(world: World, character: Character, modelKey: string): boolean {
  const plan = character.plan;
  return !!plan && (!requiresWorldEffects(plan.action) || !!plan.phases) && sustained.has(plan.action.type) && plan.modelKey === modelKey &&
    (world.minute <= plan.until || !!plan.phases);
}

export function canContinue(world: World, character: Character, modelKey: string): boolean {
  return canResumeActivity(world, character, modelKey) && character.plan!.attention === attentionMarker(world, character) &&
    pendingInterventions(world, character).length === 0;
}

function mayChooseAutonomously(character: Character): boolean {
  return character.control?.mode !== 'taken-over' && !character.control?.pending && !character.control?.active;
}

export function plannedCalls(world: World, minutes: number, modelKey: string): number {
  const next = { ...world, minute: world.minute + minutes };
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
  decide: (world: World, character: Character, onUsage: (tokens: TokenUsage) => void) => Promise<ActivityDecision>;
}): Promise<void> {
  const { minutes, mode, modelKey, limits } = options;
  const ai = mode !== 'demo';
  const usage = currentUsage(world, options.now);
  world.aiUsage = usage;
  if (ai) {
    if (budgetReached(usage, limits)) throw new BudgetExceeded();
  }
  world.minute += minutes; world.lastMode = mode;
  const offset = world.turn % world.characters.length;
  const ordered = [...world.characters.slice(offset), ...world.characters.slice(0, offset)];
  for (const character of ordered) {
    const control = character.control;
    // Old tea plans have no validated effects. Replan without replaying their
    // historical success text or changing earlier committed story/memories.
    if (character.plan?.action.type === 'work' && character.plan.action.target === 'tea' && !character.plan.phases) {
      delete character.plan;
      if (control) delete control.active;
      character.activity = '泡茶尚未完成，需要重新確認物件條件。';
    }
    if (control?.pending) {
      const action = control.pending;
      delete control.pending; delete control.active; delete character.plan;
      try {
        resolve(world, character, action);
        if (sustained.has(action.type) && minutes < 60) {
          control.active = true;
          character.plan = { action, startedAt: world.minute - minutes, until: world.minute - minutes + 60, attention: attentionMarker(world, character), modelKey };
        }
      } catch (error) {
        if (error instanceof MemoryValidationError) throw error;
        record(world, character.id, `${character.name} 的指定行動未通過規則檢查，這段時間留在原地。`, 'blocked', [character.id]);
      }
      continue;
    }
    if (control?.active && character.plan) {
      const left = Math.max(0, character.plan.until - world.minute);
      record(world, character.id, `${character.name} 繼續指定活動${left ? `，還有約 ${left} 分鐘` : '，這段活動已完成'}。`, 'continue', [character.id], { from: character.location, to: character.location });
      if (!left) { delete control.active; delete character.plan; }
      continue;
    }
    if (control?.mode === 'taken-over') {
      character.activity = '待命，等待下一個指定行動。';
      continue;
    }
    if (canContinue(world, character, modelKey)) {
      if(character.plan?.phases){advanceFreePhases(world,character);if(ai)usage.savedDecisions++;continue;}
      const left = Math.max(0, character.plan!.until - world.minute);
      // Do not repeatedly say the same line, produce new thoughts, or add duplicate memories.
      record(world, character.id, `${character.name} 繼續原本的活動${left ? `，還有約 ${left} 分鐘` : '，這段活動已完成'}。`, 'continue', [character.id], { from: character.location, to: character.location });
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
    if (ai) {
      if (budgetReached(usage, limits)) throw new BudgetExceeded();
      await options.beforeDecision?.();
      // Count attempts before requesting, including errors whose usage is not returned.
      usage.calls++; usage.totalCalls++; usage.unknownCalls++; usage.totalUnknownCalls++;
      decision = await options.decide(world, character, tokens => accountUsage(usage, tokens));
      // The route rolls this back with the round on later model/save failure.
      if (control) delete control.experiences;
    } else {
      const action = demoDecision(world, character);
      decision = { action, durationMinutes: sustained.has(action.type) ? 60 : 15 };
    }
    character.observationCursor = observedCount;
    if (decision.longTerm) character.longTerm = decision.longTerm;
    if (decision.shortTerm) character.shortTerm = decision.shortTerm;
    if (decision.memoryTrace) character.memoryTrace = decision.memoryTrace;
    if (decision.cognition) { character.cognition = decision.cognition; projectRelationships(character); }
    consumeMemories(character);
    if (decision.attentionConditions) character.attentionConditions = decision.attentionConditions;
    for (const reason of decision.attentionDiagnostics || []) noteAttention(world, character, reason);
    if (decision.continueExisting) {
      if (!canResumeActivity(world, character, modelKey)) {
        throw Error('沒有可延續的原活動，請選擇新行動。');
      }
      if (decision.intents) character.intents = decision.intents;
      if (typeof decision.action.mood === 'string') character.mood = decision.action.mood;
      character.plan!.attention = attentionMarker(world, character);
      if(character.plan?.phases){record(world,character.id,`${character.name} 決定繼續原本的活動。`,'continue',[character.id],{from,to:character.location});advanceFreePhases(world,character);continue;}
      record(world, character.id, `${character.name} 決定繼續原本的活動，還有約 ${Math.max(0, character.plan!.until - world.minute)} 分鐘。`, 'continue', [character.id], { from, to: character.location });
      continue;
    }
    if (decision.intents) character.intents = decision.intents;
    delete character.plan;
    try {
      if(requiresWorldEffects(decision.action)){
        if(!decision.freeCandidate){
          if(ai)throw Error('物件行動缺少裁定。');
          character.activity='泡茶尚未完成：目前規則模式不支援這項物件活動。';
          record(world,character.id,`${character.name} ${character.activity}`,'unsupported',[character.id]);
          continue;
        }
        const phases=decision.freeCandidate.stages||[];
        if(phases.some(p=>p.afterMinutes>decision.durationMinutes))throw new EffectValidationError('活動階段時點超出本次計畫。',{reason:'phase_duration',durationMinutes:decision.durationMinutes});
        const accepted=commitFreeAction(world,character,decision.freeCandidate);
        if(accepted&&phases.length){character.plan={action:decision.action,startedAt:world.minute-minutes,until:world.minute-minutes+decision.durationMinutes,attention:attentionMarker(world,character),modelKey,phases:{stages:phases,cursor:0,origin:character.region!}};advanceFreePhases(world,character);}
      }
      else resolve(world, character, decision.action);
      if (ai && !respondingToUser) learnHabit(world, character, decision.action, from);
      const duration = activityDurations.includes(decision.durationMinutes) ? decision.durationMinutes : 30;
      if (!requiresWorldEffects(decision.action) && sustained.has(decision.action.type) && duration > minutes) {
        character.plan = { action: decision.action, startedAt: world.minute - minutes,
          until: world.minute - minutes + duration, attention: attentionMarker(world, character), modelKey };
      }
    } catch (error) {
      if (error instanceof MemoryValidationError || requiresWorldEffects(decision.action)) throw error;
      record(world, character.id, `${character.name} 的行動未通過規則檢查，這段時間留在原地。`, 'blocked', [character.id]);
    }
  }
  for (const character of world.characters) for (const observation of pendingObservations(character)) {
    const reason = observationAttention(character, observation);
    noteAttention(world, character, character.control?.mode === 'taken-over' || character.control?.active ? '使用者控制，等待指定行動' : reason ? `${reason}；留待下次決策` : '一般線索，等待正常決策', observation.id);
  }
  for (const character of world.characters) validateMemoryState(character);
  world.turn++;
}

