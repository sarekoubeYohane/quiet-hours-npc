import { demoDecision, pendingInterventions, record, resolve, type Action, type AIUsage, type Character, type Intent, type World } from './world';
import { learnHabit } from './habits';

export type ActivityDecision = { action: Action; durationMinutes: number; intents?: Intent[] };
export type TokenUsage = { inputTokens: number; outputTokens: number };
export type BudgetLimits = { calls: number; tokens: number };
export const defaultLimits: BudgetLimits = { calls: 12, tokens: 30000 };
export const activityDurations = [15, 30, 60, 90];
const sustained = new Set<Action['type']>(['rest', 'work', 'reflect', 'observe']);
const attentionKinds = new Set(['say', 'message', 'intervention', 'move']);

export class BudgetExceeded extends Error {
  constructor() { super('已達 AI 用量上限，或剩餘呼叫次數不足以完成一個回合。自動運行已暫停；可調整上限或切換規則試玩。'); }
}

export function currentUsage(world: World, now = Date.now()): AIUsage {
  const existing = world.aiUsage;
  if (existing && now - existing.windowStartedAt < 3600000 && now >= existing.windowStartedAt) return existing;
  return {
    windowStartedAt: now, calls: 0, inputTokens: 0, outputTokens: 0, unknownCalls: 0,
    totalCalls: existing?.totalCalls || 0, totalInputTokens: existing?.totalInputTokens || 0,
    totalOutputTokens: existing?.totalOutputTokens || 0, totalUnknownCalls: existing?.totalUnknownCalls || 0,
    savedDecisions: existing?.savedDecisions || 0,
  };
}

// Only events this character knows can interrupt their activity. Private thoughts stay private.
export function attentionMarker(world: World, character: Character): string {
  return world.events.findLast(event => event.actor !== character.id && attentionKinds.has(event.kind) && event.audience.includes(character.id))?.id || '';
}

export function canContinue(world: World, character: Character, modelKey: string): boolean {
  const plan = character.plan;
  return !!plan && sustained.has(plan.action.type) && plan.modelKey === modelKey &&
    world.minute <= plan.until && plan.attention === attentionMarker(world, character) &&
    pendingInterventions(world, character).length === 0;
}

export function plannedCalls(world: World, minutes: number, modelKey: string): number {
  const next = { ...world, minute: world.minute + minutes };
  return next.characters.filter(character => !canContinue(next, character, modelKey)).length;
}

export function accountUsage(usage: AIUsage, tokens: TokenUsage): void {
  usage.inputTokens += tokens.inputTokens; usage.outputTokens += tokens.outputTokens;
  usage.totalInputTokens += tokens.inputTokens; usage.totalOutputTokens += tokens.outputTokens;
  usage.unknownCalls--; usage.totalUnknownCalls--;
}

export async function advanceActivities(world: World, options: {
  minutes: number; mode: string; modelKey: string; limits: BudgetLimits; now?: number;
  decide: (world: World, character: Character, onUsage: (tokens: TokenUsage) => void) => Promise<ActivityDecision>;
}): Promise<void> {
  const { minutes, mode, modelKey, limits } = options;
  const ai = mode !== 'demo';
  const usage = currentUsage(world, options.now);
  world.aiUsage = usage;
  if (ai) {
    const needed = plannedCalls(world, minutes, modelKey);
    // Any new dialogue can interrupt later characters in this same round. Reserve a full round.
    if (usage.calls >= limits.calls || usage.inputTokens + usage.outputTokens >= limits.tokens ||
      (needed > 0 && usage.calls + world.characters.length > limits.calls)) throw new BudgetExceeded();
  }
  world.minute += minutes; world.lastMode = mode;
  const offset = world.turn % world.characters.length;
  const ordered = [...world.characters.slice(offset), ...world.characters.slice(0, offset)];
  for (const character of ordered) {
    if (canContinue(world, character, modelKey)) {
      const left = Math.max(0, character.plan!.until - world.minute);
      // Do not repeatedly say the same line, produce new thoughts, or add duplicate memories.
      record(world, character.id, `${character.name} 繼續原本的活動${left ? `，還有約 ${left} 分鐘` : '，這段活動已完成'}。`, 'continue', [character.id], { from: character.location, to: character.location });
      if (ai) usage.savedDecisions++;
      continue;
    }
    delete character.plan;
    const respondingToUser = pendingInterventions(world, character).length > 0;
    const from = character.location;
    let decision: ActivityDecision;
    if (ai) {
      if (usage.calls >= limits.calls || usage.inputTokens + usage.outputTokens >= limits.tokens) throw new BudgetExceeded();
      // Count attempts before requesting, including errors whose usage is not returned.
      usage.calls++; usage.totalCalls++; usage.unknownCalls++; usage.totalUnknownCalls++;
      decision = await options.decide(world, character, tokens => accountUsage(usage, tokens));
    } else {
      const action = demoDecision(world, character);
      decision = { action, durationMinutes: sustained.has(action.type) ? 60 : 15 };
    }
    if (decision.intents) character.intents = decision.intents;
    try {
      resolve(world, character, decision.action);
      if (ai && !respondingToUser) learnHabit(world, character, decision.action, from);
      const duration = activityDurations.includes(decision.durationMinutes) ? decision.durationMinutes : 30;
      if (sustained.has(decision.action.type) && duration > minutes) {
        character.plan = { action: decision.action, startedAt: world.minute - minutes,
          until: world.minute - minutes + duration, attention: attentionMarker(world, character), modelKey };
      }
    } catch {
      record(world, character.id, `${character.name} 的行動未通過規則檢查，這段時間留在原地。`, 'blocked', [character.id]);
    }
  }
  world.turn++;
}
