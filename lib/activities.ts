import { requiresWorldEffects, cancelActivity, advanceFreePhases, commitFreeAction, EffectValidationError, type EffectCandidate } from './world-effects';
import { bindRoutine } from './routine-rules';
import { projectRelationships, type CognitiveState } from './cognition';
import { MemoryValidationError, validateMemoryState, consumeMemories, type LongMemory, type ShortMemory, type MemoryTrace } from './memory';
import { pendingObservations, observationAttention, noteAttention, type AttentionCondition } from './attention';
import { demoDecision, pendingInterventions, record, resolve, type Action, type AIUsage, type Character, type Intent, type World } from './world';
import { learnHabit } from './habits';

export type TimeIntent = {kind: 'completion' | 'open-ended'; maxMinutes: number | null};
export type ActivityDecision = { timeIntent?: TimeIntent; freeCandidate?:EffectCandidate; longTerm?: LongMemory[]; cognition?: CognitiveState; interpretation?: string; shortTerm?: ShortMemory[]; memoryTrace?: MemoryTrace[]; action: Action; durationMinutes: number; intents?: Intent[]; attentionConditions?: AttentionCondition[]; attentionDiagnostics?: string[]; continueExisting?: boolean };
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
export const activityDurations = [15, 30, 45, 60, 75, 90];
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
  return !!plan && (!requiresWorldEffects(plan.action) || !!plan.phases) && (sustained.has(plan.action.type) || plan.timeIntent?.kind==='open-ended') && plan.modelKey === modelKey &&
    (world.minute <= plan.until || !!plan.phases);
}

export function canContinue(world: World, character: Character, modelKey: string): boolean {
  return (canResumeActivity(world, character, modelKey) || !!character.plan && character.plan.timeIntent?.kind==='open-ended' && character.plan.modelKey===modelKey) && character.plan!.attention === attentionMarker(world, character) &&
    pendingInterventions(world, character).length === 0;
}

function mayChooseAutonomously(character: Character): boolean {
  return character.control?.mode !== 'taken-over' && !character.control?.pending && !character.control?.active;
}

export function plannedCalls(world: World, minutes: number, modelKey: string): number {
  const next = { ...world, minute: world.minute + minutes };
  return next.characters.filter(character => mayChooseAutonomously(character) && !canContinue(next, character, modelKey)).length;
}

function expireOpenPeriod(world:World,character:Character):boolean {
 if(character.plan?.timeIntent?.kind!=='open-ended'||world.minute<character.plan.until)return false;
 character.activity='自己選定的活動時段已到期，接下來可重新安排。';
 record(world,character.id,`${character.name} ${character.activity}`,'continue',[character.id]);
 cancelActivity(world,character);
 return true;
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
      cancelActivity(world,character);
      character.activity = '泡茶尚未完成，需要重新確認物件條件。';
    }
    let controlledDecision:ActivityDecision|undefined;
    if (control?.pending) {
      const action=control.pending;
      delete control.pending;
      cancelActivity(world,character);
      const openEnded=['rest','reflect'].includes(action.type);
      controlledDecision={action,durationMinutes:openEnded?60:15,timeIntent:{kind:openEnded?'open-ended':'completion',maxMinutes:null}};
    }
    if (!controlledDecision && control?.active && character.plan) {
      if(character.plan.phases){advanceFreePhases(world,character);if(!character.plan)delete control.active;continue;}
      if(expireOpenPeriod(world,character))continue;
      const left = Math.max(0, character.plan.until - world.minute);
      record(world, character.id, `${character.name} 繼續指定活動${left ? `，還有約 ${left} 分鐘` : '，這段活動已完成'}。`, 'continue', [character.id], { from: character.location, to: character.location });
      if (!left) cancelActivity(world,character);
      continue;
    }
    if (!controlledDecision && control?.mode === 'taken-over') {
      character.activity = '待命，等待下一個指定行動。';
      continue;
    }
    if (!controlledDecision && canContinue(world, character, modelKey)) {
      if(character.plan?.phases){advanceFreePhases(world,character);if(ai)usage.savedDecisions++;continue;}
      const left = Math.max(0, character.plan!.until - world.minute);
      if (expireOpenPeriod(world,character)) {
        if(ai)usage.savedDecisions++;
        continue;
      }
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
      decision = { action, durationMinutes: sustained.has(action.type) ? 60 : 15 };
    }
    if((controlledDecision||!ai)&&requiresWorldEffects(decision.action)){
      decision.freeCandidate=bindRoutine(world,character,decision.action,decision.durationMinutes,undefined,minutes,decision.timeIntent?.maxMinutes)??{status:'unsupported',effects:[],stages:[],check:null};
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
      if(expireOpenPeriod(world,character))continue;
      record(world, character.id, `${character.name} 決定繼續原本的活動，還有約 ${Math.max(0, character.plan!.until - world.minute)} 分鐘。`, 'continue', [character.id], { from, to: character.location });
      continue;
    }
    if (decision.intents) character.intents = decision.intents;
    cancelActivity(world,character);
    try {
      if(requiresWorldEffects(decision.action)){
        if(!decision.freeCandidate){
          if(ai)throw Error('物件行動缺少裁定。');
          character.activity='泡茶尚未完成：目前規則模式不支援這項物件活動。';
          record(world,character.id,`${character.name} ${character.activity}`,'unsupported',[character.id]);
          continue;
        }
        let candidate=decision.freeCandidate;
        if(decision.timeIntent?.kind==='completion'&&candidate.status==='accepted'){
          const instantaneousRights=candidate.effects.length>0&&candidate.effects.every(effect=>effect.kind==='grant'||effect.kind==='consent')&&!(candidate.stages?.length);
          if(candidate.confirmedDurationMinutes===undefined&&instantaneousRights)candidate={...candidate,confirmedDurationMinutes:15};
          if(candidate.confirmedDurationMinutes===undefined)throw new EffectValidationError('完成目標缺少世界確認耗時。',{reason:'completion_time_missing'});
          const duration=candidate.confirmedDurationMinutes;
          if(instantaneousRights&&duration!==15)throw new EffectValidationError('授權與同意是一次性選擇。',{reason:'rights_duration'});
          if(!(candidate.stages?.length)&&duration>minutes)candidate={...candidate,effects:[],stages:[{afterMinutes:duration,preconditions:[],effects:candidate.effects}]};
          if(candidate.stages?.length&&candidate.stages.at(-1)!.afterMinutes!==duration)throw new EffectValidationError('最後階段須與確認完成時間一致。',{reason:'completion_phase_time'});
          if(decision.timeIntent.maxMinutes!==null&&duration>decision.timeIntent.maxMinutes){
            const validation=structuredClone(world),actor=validation.characters.find(c=>c.id===character.id)!;
            commitFreeAction(validation,actor,{...candidate,check:null});
            candidate={status:'denied',effects:[],stages:[],check:null,blockedReason:`這項活動需要 ${duration} 分鐘，超過自己設定的投入上限 ${decision.timeIntent.maxMinutes} 分鐘；尚未開始，可自行重新安排。`};
          }
        }
        const phases=candidate.stages||[];
        const duration=candidate.confirmedDurationMinutes??decision.durationMinutes;
        if(phases.some(p=>p.afterMinutes>duration))throw new EffectValidationError('活動階段時點超出本次計畫。',{reason:'phase_duration',durationMinutes:decision.durationMinutes});
        const accepted=commitFreeAction(world,character,candidate);
        if(accepted&&phases.length){character.plan={action:decision.action,startedAt:world.minute-minutes,until:world.minute-minutes+duration,attention:attentionMarker(world,character),modelKey,...(decision.timeIntent?{timeIntent:decision.timeIntent}:{}),phases:{stages:phases,cursor:0,origin:character.region!}};advanceFreePhases(world,character);}
      }
      else {
        if(decision.timeIntent?.kind==='completion'){
          if(decision.action.type==='rest'||decision.action.type==='reflect'){
            character.activity='目前不支援以這個方法確認完成目標，可改用明確方法或自行選定活動時段。';
            record(world,character.id,`${character.name} ${character.activity}`,'unsupported',[character.id]);
            continue;
          }
          if(decision.timeIntent.maxMinutes!==null&&decision.timeIntent.maxMinutes<15){
            const validation=structuredClone(world),actor=validation.characters.find(c=>c.id===character.id)!;
            resolve(validation,actor,decision.action,{dryRun:true});
            character.activity=`這項活動需要 15 分鐘，超過自己設定的投入上限 ${decision.timeIntent.maxMinutes} 分鐘；尚未開始，可自行重新安排。`;
            record(world,character.id,`${character.name} ${character.activity}`,'blocked',[character.id]);
            continue;
          }
        }
        resolve(world, character, decision.action);
      }
      if (ai && !controlledDecision && !respondingToUser) learnHabit(world, character, decision.action, from);
      const duration = decision.timeIntent?.kind==='completion'?15:activityDurations.includes(decision.durationMinutes) ? decision.durationMinutes : 30;
      if (!requiresWorldEffects(decision.action) && (sustained.has(decision.action.type) || decision.timeIntent?.kind==='open-ended') && duration > minutes) {
        character.plan = { action: decision.action, startedAt: world.minute - minutes,
          until: world.minute - minutes + duration, attention: attentionMarker(world, character), modelKey, ...(decision.timeIntent?{timeIntent:decision.timeIntent}:{}) };
        if(decision.timeIntent?.kind==='open-ended')character.activity=`正在進行自己選定的活動時段，約剩 ${duration-minutes} 分鐘。`;
      }else if(decision.timeIntent?.kind==='open-ended'&&!requiresWorldEffects(decision.action)){
        character.activity='自己選定的活動時段已到期，接下來可重新安排。';
      }
      if(controlledDecision&&character.plan)control!.active=true;
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

