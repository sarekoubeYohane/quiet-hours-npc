import { naturalChangeLimits } from './adjudication-limits';
import { canSee, regionOf } from './perception';
import { applyWorldStateChange, commitWorldChanges, stateConditionsHold, worldTargetSnapshot, worldObjectContinuityProblem, type StateCondition, type WorldStateTarget, type StateExposure } from './world-state';
import type { Character, World } from './world';
import type { ChangeStateEffect, Effect, StateChange } from './world-effects';

export type NaturalStateChange = { target: WorldStateTarget; changes: StateChange[]; exposure: StateExposure };
export type ScheduleNaturalEffect = { kind: 'schedule-natural'; version: 1; delayMinutes: number; conditions: StateCondition[]; effects: NaturalStateChange[]; reason: string };
export type NaturalChange = {
  id: string; version: 1; source: { actorId: string; turn: number };
  scheduledAt: number; committedAt: number; nominalDueAt?: number; dueAt: number;
  conditions: StateCondition[]; effects: NaturalStateChange[]; reason: string;
  status: 'pending' | 'executed' | 'invalidated'; settledAt?: number; invalidatedAt?: number;
  invalidation?: 'conditions' | 'mechanical-precondition';
};

// The model's future `from` values are themselves continuous prerequisites.
// Never add an all-object revision guard: unrelated state stays unrelated.
function prerequisitesHold(world: World, change: Pick<NaturalChange, 'conditions' | 'effects'>): boolean {
  return stateConditionsHold(world, change.conditions) && change.effects.every(effect => {
    const current = worldTargetSnapshot(world, effect.target);
    return !!current && effect.changes.every(entry => (Object.hasOwn(current.state, entry.key) ? current.state[entry.key] : null) === entry.from);
  });
}
function retainBoundedReceipts(world: World): void {
  if (!world.naturalChanges) return;
  const settled = world.naturalChanges.filter(change => change.status !== 'pending').sort((a,b)=>(a.settledAt??a.committedAt)-(b.settledAt??b.committedAt)||a.id.localeCompare(b.id));
  const dropped=Math.max(0,settled.length-naturalChangeLimits.maxSettled);
  if(dropped)world.naturalChangesDropped=Math.min(Number.MAX_SAFE_INTEGER,(world.naturalChangesDropped||0)+dropped);
  const keep = new Set(settled.slice(-naturalChangeLimits.maxSettled).map(change => change.id));
  world.naturalChanges = world.naturalChanges.filter(change => change.status === 'pending' || keep.has(change.id));
}
export function invalidateNaturalChanges(world: World): void {
  for (const change of world.naturalChanges || []) if (change.status === 'pending' && !prerequisitesHold(world, change)) {
    change.status = 'invalidated'; change.invalidatedAt = world.minute; change.settledAt = world.minute; change.invalidation = 'conditions';
  }
  retainBoundedReceipts(world);
}
function applyNaturalBatch(world: World, effects: NaturalStateChange[]): void {
  for (const effect of effects) applyWorldStateChange(world, effect.target, effect.changes, effect.exposure);
  const problem = worldObjectContinuityProblem(world, new Set(effects.filter(effect => effect.target.type === 'object').map(effect => effect.target.id)));
  if (problem) throw Error(problem.message);
}
export function scheduleNaturalChange(world: World, actor: Character, effect: ScheduleNaturalEffect, nominalDueAt?: number): void {
  if ((world.naturalChanges || []).filter(change => change.status === 'pending').length >= naturalChangeLimits.maxPending) throw Error('自然變化安排已達容量。');
  if (!prerequisitesHold(world, effect)) throw Error('自然變化的當前前提不成立。');
  for (const target of [...effect.conditions.map(condition => condition.target), ...effect.effects.map(change => change.target)]) {
    const current = worldTargetSnapshot(world, target);
    if (!current || current.region !== regionOf(actor) || !canSee(world, actor, current.region) || target.type === 'object' && !world.objects?.find(object => object.id === target.id)?.knownTo.includes(actor.id)) throw Error('自然變化只能確認當前可接觸的已知對象。');
  }
  const written = new Set<string>();
  for (const future of effect.effects) for (const entry of future.changes) {
    const key = `${future.target.type}:${future.target.id}:${entry.key}`;
    if (written.has(key)) throw Error('自然變化同一狀態鍵不能重複寫入。');
    written.add(key);
  }
  applyNaturalBatch(structuredClone(world), effect.effects);
  (world.naturalChanges ??= []).push({
    id: crypto.randomUUID(), version: 1, source: { actorId: actor.id, turn: world.turn },
    scheduledAt: world.minute, committedAt: world.minute, ...(nominalDueAt === undefined ? {} : { nominalDueAt }), dueAt: world.minute + effect.delayMinutes,
    conditions: structuredClone(effect.conditions), effects: structuredClone(effect.effects), reason: effect.reason, status: 'pending',
  });
}
function currentStateEffects(world: World, change: NaturalChange): ChangeStateEffect[] {
  return change.effects.map(effect => ({ kind: 'change-state', version: 1, access: 'physical', target: effect.target, changes: effect.changes, exposure: effect.exposure, reason: change.reason, expectedRevision: worldTargetSnapshot(world, effect.target)!.revision }) as ChangeStateEffect);
}
export function advanceNaturalChanges(world: World, until: number, emit: (world: World, actorId: string, effects: Effect[]) => void): void {
  const due = (world.naturalChanges || []).filter(change => change.status === 'pending' && change.dueAt <= until).sort((a, b) => a.dueAt - b.dueAt || a.id.localeCompare(b.id)).map(change => change.id);
  try {
    for (const id of due) {
      const change = world.naturalChanges?.find(item => item.id === id);
      if (!change || change.status !== 'pending') continue;
      world.minute = change.dueAt;
      invalidateNaturalChanges(world);
      if (change.status !== 'pending') continue;
      const effects = currentStateEffects(world, change), clone = structuredClone(world);
      try { applyNaturalBatch(clone, change.effects); }
      catch { change.status = 'invalidated'; change.invalidatedAt = world.minute; change.settledAt = world.minute; change.invalidation = 'mechanical-precondition'; continue; }
      const saved = clone.naturalChanges!.find(item => item.id === id)!;
      saved.status = 'executed'; saved.settledAt = world.minute;
      invalidateNaturalChanges(clone);
      commitWorldChanges(world, clone);
      // The historical actor is provenance only, never the actor of nature.
      emit(world, 'world', effects);
    }
  } finally { world.minute = until; retainBoundedReceipts(world); }
}
