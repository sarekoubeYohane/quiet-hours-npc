import type { Character, World } from './world';
import { MemoryValidationError, memoryBytes, memoryStateBytes, boundMemoryWithMetadata, type LongMemory } from './memory';
import { database } from './store';
import { recallServices, recallBudgetDatabase, recordEmbeddingUsage } from './recall-services';

// Search results contain identifiers only. All readable content comes back from
// the authoritative committed world, never from service metadata.
export async function recallMemories(options: {
  owner: string; character: Character; snapshot: World; version: number;
  questions: string[]; workDeadline: number;
  guard: (kind: 'embedding' | 'index' | 'search', units: number) => Promise<string>;
}) {
  const { owner, character, snapshot, version, questions, guard } = options;
  const deadline = Math.min(options.workDeadline, Date.now() + 10000);
  const scope = { owner, world: 'primary', npc: character.id };
  const services = recallServices();
  const signal = () => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw Error('回想索引或搜尋逾時，本回合已回復。');
    return AbortSignal.timeout(remaining);
  };
  async function dispatch<T>(kind: 'embedding' | 'index' | 'search', units: number, action: (signal: AbortSignal, reservationId: string) => Promise<T>) {
    signal();
    const reservationId = await guard(kind, units);
    const abort = signal();
    // Native Vectorize bindings do not accept an AbortSignal; stop awaiting at
    // the deadline even when that provider cannot cancel its billed request.
    return Promise.race([action(abort, reservationId), new Promise<never>((_, reject) => abort.addEventListener('abort', () => reject(Error('回想索引或搜尋逾時，本回合已回復。')), { once: true }))]);
  }
  const committedCharacter = snapshot.characters.find(c => c.id === character.id);
  if (!committedCharacter) throw new MemoryValidationError('已提交世界中不存在此角色。');
  const memories = committedCharacter.longTerm || [];
  const recallable = (m: LongMemory) => m.characterId === character.id && (!('state' in m) || m.state === 'active');
  const ids = new Map<string, LongMemory>();
  for (const memory of memories.filter(recallable)) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([owner, 'primary', character.id, memory.id, memory.version])));
    ids.set(Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2, '0')).join(''), memory);
  }
  const plannedManifest = [...ids.entries()].map(([vector_id, m]) => ({vector_id, account_owner:owner, npc:character.id, memory_id:m.id, version:m.version}));
  // Derived writes survive rollback: both the current decision and the larger
  // committed baseline must remain valid before any index side effect.
  if (Math.max(memoryStateBytes(character), memoryStateBytes(committedCharacter))+memoryBytes(plannedManifest)>208*1024) throw new MemoryValidationError('索引中介資料使角色記憶總量超過208 KiB，未截斷資料。');
  const db = database();
  const manifest = await db.prepare('SELECT vector_id FROM recall_index_entries WHERE account_owner = ? AND npc = ?').bind(owner, character.id).all<{vector_id:string}>();
  const stale = manifest.results.map(row => row.vector_id).filter(id => !ids.has(id));
  for (let start = 0; start < stale.length; start += 8) {
    const batch = stale.slice(start, start + 8);
    await dispatch('index', batch.length, s => services.remove(batch, s));
    for (const id of batch) await db.prepare('DELETE FROM recall_index_entries WHERE vector_id = ? AND account_owner = ?').bind(id, owner).run();
  }
  const matches = (record: { id: string; metadata?: Record<string, unknown> }) => {
    const memory = ids.get(record.id), meta = record.metadata;
    return !!memory && meta?.owner === owner && meta.world === 'primary' && meta.npc === character.id && meta.memoryId === memory.id && meta.version === memory.version;
  };
  // Synchronize in bounded batches, only from the round's committed snapshot.
  for (let start = 0; start < ids.size; start += 8) {
    const batch = [...ids.entries()].slice(start, start + 8);
    let indexed = await dispatch('index', 1, s => services.get(batch.map(([id]) => id), s));
    const missing = batch.filter(([id]) => !indexed.some(r => r.id === id && matches(r)));
    if (missing.length) {
      const vectors = await dispatch('embedding', missing.reduce((sum, [, m]) => sum + new TextEncoder().encode(m.text).length, 0), (s, reservation) => services.embed(missing.map(([, m]) => m.text), s, tokens => recordEmbeddingUsage(recallBudgetDatabase(), reservation, tokens)));
      // Manifest precedes uncertain writes, so retries can clean up even a timed-out mutation.
      for (const [id, m] of missing) await db.prepare('INSERT OR IGNORE INTO recall_index_entries (vector_id, account_owner, npc, memory_id, version) VALUES (?, ?, ?, ?, ?)').bind(id, owner, character.id, m.id, m.version).run();
      await dispatch('index', missing.length, s => services.upsert(missing.map(([id, m], i) => ({ id, values: vectors[i], metadata: { ...scope, memoryId: m.id, version: m.version } })), s));
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      indexed = await dispatch('index', 1, s => services.get(batch.map(([id]) => id), s));
      let ready = batch.every(([id]) => indexed.some(r => r.id === id && matches(r)));
      if (ready) for (const [id, m] of batch) {
        if (!await dispatch('search', 1, s => services.ready(id, { ...scope, memoryId:m.id, version:m.version }, s))) { ready = false; break; }
      }
      if (ready) break;
      if (attempt === 2) throw Error('所需記憶版本的索引尚未就緒，本回合已回復。');
      const waiting = signal();
      await new Promise<void>((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(Error('回想索引等待逾時，本回合已回復。')); };
        const timer = setTimeout(() => { waiting.removeEventListener('abort', abort); resolve(); }, attempt === 0 ? 100 : 250);
        waiting.addEventListener('abort', abort, { once: true });
      });
    }
  }
  const vectors = await dispatch('embedding', questions.reduce((sum, q) => sum + new TextEncoder().encode(q).length, 0), (s, reservation) => services.embed(questions, s, tokens => recordEmbeddingUsage(recallBudgetDatabase(), reservation, tokens)));
  const found = new Map<string, LongMemory>();
  for (const vector of vectors) {
    const results = await dispatch('search', 1, s => services.search(vector, scope, s));
    if (results.length > 5 || results.some(r => !matches(r))) throw Error('回想結果範圍、版本或可回憶狀態無效，本回合已回復。');
    // Re-read D1 after search; do not trust the snapshot or vector metadata as
    // authority if another writer changed the world during the request.
    const current = await database().prepare('SELECT state, version FROM worlds WHERE owner = ?').bind(owner).first<{ state: string; version: number }>();
    if (!current || current.version !== version) throw Error('回想期間世界版本已改變，本回合已回復。');
    const authoritative = (JSON.parse(current.state) as World).characters.find(c => c.id === character.id)?.longTerm || [];
    for (const result of results) {
      const expected = ids.get(result.id)!;
      const memory = authoritative.find(m => m.id === expected.id && m.version === expected.version && recallable(m));
      if (!memory || memory.text !== expected.text) throw Error('回想記憶已改寫或遺忘，本回合已回復。');
      found.set(memory.id, memory);
    }
  }
  return [...found.values()].slice(0, 8).map(({ id, version, time, text, source }) => ({ id, version, time, text, source }));
}

export async function boundRecallStorage(world: World, owner: string) {
  for (const c of world.characters) {
    const manifest = await database().prepare('SELECT vector_id, account_owner, npc, memory_id, version FROM recall_index_entries WHERE account_owner = ? AND npc = ?').bind(owner, c.id).all();
    if (manifest.results.length > 64) throw new MemoryValidationError('索引中介資料超過64筆上限。');
    boundMemoryWithMetadata(c, memoryBytes(manifest.results));
  }
}
