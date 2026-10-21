import { seedWorld, normalizeWorld, record, type World } from './world';

export const acceptanceSceneId = 'daily-life-v1';
// Bound the stored base64 backup, rather than rejecting uncompressed histories.
// A source world must already fit D1's 2,000,000-byte string/row limit.
const snapshotLimit = 512 * 1024;
const originalWorldLimit = 2_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Parsing JSON alone does not make it a world. Check the required story shape
// without normalizing, seeding or otherwise changing the paused original.
function originalWorld(value: unknown): World {
  const validTime = (time: unknown) => typeof time === 'number' && Number.isSafeInteger(time) && time >= 0;
  if (!isRecord(value) || !validTime(value.minute) || !validTime(value.turn) || typeof value.lastMode !== 'string' || value.acceptance !== undefined ||
    !Array.isArray(value.characters) || !value.characters.length || !value.characters.every(c => isRecord(c) &&
      ['id', 'name', 'color', 'location', 'mood', 'personality', 'goal', 'activity'].every(key => typeof c[key] === 'string') && c.id !== '' &&
      isRecord(c.relationships) && Object.values(c.relationships).every(label => typeof label === 'string') &&
      Array.isArray(c.memories) && c.memories.every(m => isRecord(m) && validTime(m.time) && typeof m.text === 'string')) ||
    !Array.isArray(value.events) || !value.events.every(e => isRecord(e) && validTime(e.time) &&
      ['id', 'actor', 'text', 'kind'].every(key => typeof e[key] === 'string') &&
      Array.isArray(e.audience) && e.audience.every(id => typeof id === 'string'))) {
    throw Error('原世界備份內容無效，未切換場景；原資料保持保存。');
  }
  return value as World;
}

async function readBounded(stream: ReadableStream<Uint8Array>, limit: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw Error('原世界備份超過安全容量，未切換場景；原資料保持保存。');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

async function packOriginal(original: World) {
  const bytes = new TextEncoder().encode(JSON.stringify(originalWorld(original)));
  if (bytes.byteLength > originalWorldLimit) throw Error('原世界超過儲存容量，未切換場景；原資料保持保存。');
  const compressed = await readBounded(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip')), snapshotLimit / 4 * 3);
  let binary = '';
  for (let offset = 0; offset < compressed.length; offset += 16384) binary += String.fromCharCode(...compressed.subarray(offset, offset + 16384));
  return { format: 'gzip-base64-v1' as const, data: btoa(binary) };
}

async function unpackOriginal(snapshot: NonNullable<World['acceptance']>['snapshot']): Promise<World> {
  if (!snapshot || snapshot.format !== 'gzip-base64-v1' || typeof snapshot.data !== 'string' || snapshot.data.length > snapshotLimit) throw Error('原世界備份格式無效，未切換場景；原資料保持保存。');
  try {
    const bytes = Uint8Array.from(atob(snapshot.data), char => char.charCodeAt(0));
    const restored = await readBounded(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')), originalWorldLimit);
    return originalWorld(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(restored)));
  } catch { throw Error('無法讀取原世界備份，未切換場景；原資料保持保存。'); }
}

// Account policy and paid receipts belong to the owner, not to either story.
function carryAccountSettings(previous: World, next: World, savedDecisions: number) {
  next.contextId = crypto.randomUUID();
  if (previous.aiUsage) next.aiUsage = { ...structuredClone(previous.aiUsage), savedDecisions };
  for (const key of ['adjudication', 'playerBudget', 'modelPrices'] as const) {
    if (previous[key] !== undefined) Object.assign(next, { [key]: structuredClone(previous[key]) });
  }
  return next;
}

export async function enterAcceptanceScene(previous: World): Promise<World> {
  if (previous.acceptance) throw Error('目前已在驗收場景，請先返回原世界。');
  const original = structuredClone(previous);
  // Do not duplicate the growing account ledger in the paused story.
  delete original.aiUsage;
  delete original.adjudication;
  delete original.playerBudget;
  delete original.modelPrices;
  const snapshot = await packOriginal(original);
  const world = seedWorld();
  world.minute = 12 * 60;
  world.events = [];
  for (const character of world.characters) {
    character.location = 'cafe'; character.region = 'cafe-front';
    character.memories = []; character.shortTerm = []; character.longTerm = [];
    character.memoryTrace = []; character.observations = []; character.observationCursor = 0;
    character.activity = '在咖啡館前台，看看今天想做什麼。';
  }
  world.characters.find(c => c.id === 'cass')!.intents = [{ id: 'acceptance-food', content: '吃點東西，照顧自己的肚子', intensity: 'high', importance: 'high', urgency: 'medium', context: '前台有一份已獲准給我的驗收餐點；是否現在吃由我決定。' }];
  world.characters.find(c => c.id === 'vera')!.intents = [{ id: 'acceptance-tea', content: '泡一杯茶，享受一點自己的時間', intensity: 'medium', importance: 'medium', urgency: 'low', context: '前台有熱水、茶包與茶具可用；杯子屬於店主，使用前要先徵得同意。' }];
  const people = world.characters.map(c => c.id);
  world.supplies = [{ id: 'acceptance-meal', label: '驗收餐點', region: 'cafe-front', remaining: 1, owner: 'owner', knownTo: people, allowedTo: ['cass'], kind: 'food', initialState: {} }];
  world.objects = [
    { id: 'acceptance-cup', source: 'acceptance-cup', label: '驗收杯子', region: 'cafe-front', holder: null, owner: 'owner', revision: 1, state: { contents: 'empty', clean: 'yes' }, lifecycle: 'active', kind: 'utensil', knownTo: people, allowedTo: ['owner'], stateTransitions: { contents: ['empty', 'water', 'tea', 'dirty'], clean: ['yes', 'no'] } },
    { id: 'acceptance-tea-kit', source: 'acceptance-tea-kit', label: '共用茶具（熱水與茶包）', region: 'cafe-front', holder: null, owner: 'owner', revision: 1, state: { available: 'yes' }, lifecycle: 'active', kind: 'utensil', knownTo: people, allowedTo: people },
  ];
  normalizeWorld(world);
  record(world, 'observer', '獨立日常驗收：大家在咖啡館前台。這裡只有一份可供 Cass 取得並食用的餐點，不會自動補貨。一只空杯屬於店主，借用需要店主自己同意；共用茶具、熱水與茶包已獲准使用。泡茶可留下加水、沖泡等中間狀態；餐點或杯子的結果須以實際物件變化為準。每人自行決定想做什麼，也可以拒絕、休息或離開。', 'intervention', people);
  world.acceptance = { id: acceptanceSceneId, snapshot, originalSavedDecisions: previous.aiUsage?.savedDecisions || 0 };
  return carryAccountSettings(previous, world, 0);
}

export async function exitAcceptanceScene(previous: World): Promise<World> {
  if (!previous.acceptance) throw Error('沒有可返回的原世界，未切換場景。');
  // Keep scenes saved by the previous release returnable without migration.
  const original = previous.acceptance.original ? originalWorld(structuredClone(previous.acceptance.original)) : await unpackOriginal(previous.acceptance.snapshot);
  return carryAccountSettings(previous, original, previous.acceptance.originalSavedDecisions || 0);
}

// Only the server's durable world contains the paused story. Neither the public
// world response nor journal response copies need its private memories.
export function worldForClient(world: World): World {
  return world.acceptance ? { ...world, acceptance: { id: world.acceptance.id } } : world;
}
