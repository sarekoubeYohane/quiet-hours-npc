import { seedWorld, normalizeWorld, record, type World } from './world';

export const acceptanceSceneId = 'daily-life-v1';
const originalWorldLimit = 512 * 1024;

// Account policy and paid receipts belong to the owner, not to either story.
function carryAccountSettings(previous: World, next: World, savedDecisions: number) {
  next.contextId = crypto.randomUUID();
  if (previous.aiUsage) next.aiUsage = { ...structuredClone(previous.aiUsage), savedDecisions };
  for (const key of ['adjudication', 'playerBudget', 'modelPrices'] as const) {
    if (previous[key] !== undefined) Object.assign(next, { [key]: structuredClone(previous[key]) });
  }
  return next;
}

export function enterAcceptanceScene(previous: World): World {
  if (previous.acceptance) throw Error('目前已在驗收場景，請先返回原世界。');
  const original = structuredClone(previous);
  // Do not duplicate the growing account ledger in the paused story.
  delete original.aiUsage;
  delete original.adjudication;
  delete original.playerBudget;
  delete original.modelPrices;
  if (new TextEncoder().encode(JSON.stringify(original)).byteLength > originalWorldLimit) {
    throw Error('原世界超過驗收暫存上限，未切換場景；請保留原世界並使用獨立測試環境。');
  }
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
    { id: 'acceptance-cup', source: 'acceptance-cup', label: '驗收杯子', region: 'cafe-front', holder: null, owner: 'owner', revision: 1, state: { contents: 'empty', clean: 'yes' }, lifecycle: 'active', kind: 'utensil', knownTo: people, allowedTo: ['owner'], stateTransitions: { contents: ['empty', 'water', 'tea'], clean: ['yes', 'no'] } },
    { id: 'acceptance-tea-kit', source: 'acceptance-tea-kit', label: '共用茶具（熱水與茶包）', region: 'cafe-front', holder: null, owner: 'owner', revision: 1, state: { available: 'yes' }, lifecycle: 'active', kind: 'utensil', knownTo: people, allowedTo: people },
  ];
  normalizeWorld(world);
  record(world, 'observer', '獨立日常驗收：大家在咖啡館前台。這裡只有一份可供 Cass 取得並食用的餐點，不會自動補貨。一只空杯屬於店主，借用需要店主自己同意；共用茶具、熱水與茶包已獲准使用。泡茶可留下加水、沖泡等中間狀態；餐點或杯子的結果須以實際物件變化為準。每人自行決定想做什麼，也可以拒絕、休息或離開。', 'intervention', people);
  world.acceptance = { id: acceptanceSceneId, original, originalSavedDecisions: previous.aiUsage?.savedDecisions || 0 };
  return carryAccountSettings(previous, world, 0);
}

export function exitAcceptanceScene(previous: World): World {
  if (!previous.acceptance?.original) throw Error('沒有可返回的原世界，未切換場景。');
  return carryAccountSettings(previous, structuredClone(previous.acceptance.original), previous.acceptance.originalSavedDecisions || 0);
}

// Only the server's durable world contains the paused story. Neither the public
// world response nor journal response copies need its private memories.
export function worldForClient(world: World): World {
  return world.acceptance ? { ...world, acceptance: { id: world.acceptance.id } } : world;
}
