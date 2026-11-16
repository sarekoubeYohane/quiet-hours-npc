import { confirmOpening, formCharacterCard } from '../tooling/verification/opening-journey.mjs';
import '../tooling/verification/no-network.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { characterApiFixture } from './support/character-api-fixture.mjs';

// #316 定案數值（站主 2026-11-16 確認），作為獨立的預期來源。
const settled = {
 Cass:{values:{strength:7,endurance:9,dexterity:14,perception:15,appearance:11},total:56,capacity:50,needTraits:{hunger:.8,thirst:1,sleep:1.2}},
 Vera:{values:{strength:11,endurance:15,dexterity:15,perception:16,appearance:13},total:70,capacity:70,needTraits:{hunger:.8,thirst:.8,sleep:.8}},
 Kris:{values:{strength:10,endurance:12,dexterity:13,perception:14,appearance:13},total:62,capacity:75,needTraits:{hunger:1,thirst:1,sleep:1}},
 店主:{values:{strength:10,endurance:11,dexterity:12,perception:12,appearance:10},total:55,capacity:65,needTraits:{hunger:1,thirst:1,sleep:1}},
};
// 原固定世界（lib/world.ts 的 seedWorld 與 cafeOwner）的人物文字。
const original = {
 Cass:{personality:'努力保持冷靜；害怕被留下，但也想保有自己的選擇。',abilityTags:['不擅長髮飾設計'],memory:'與 Vera 約好暫時分開幾天。Kris 讓我先住下，接下來由我自己決定。',goal:'先安頓自己，慢慢想清楚接下來的生活。',asset:'cass'},
 Vera:{personality:'不善言詞，習慣以陪伴表達關心；正在練習不把所有責任攬在身上。',abilityTags:['擅長髮飾設計'],memory:'Cass 說需要幾天空間。我不知道她此刻在哪裡；我們可以用手機聯絡。',goal:'尊重 Cass 的空間，也試著做一件自己喜歡的事。',asset:'vera'},
 Kris:{personality:'成熟、務實，不替別人決定人生；先處理吃飯與休息等眼前的事情。',abilityTags:[],memory:'Cass 暫時借住。我可以幫她安頓，不必逼她今晚做出決定。',goal:'提供安全的暫住空間，讓 Cass 自己思考。',asset:'kris'},
 店主:{personality:'務實而溫和，喜歡把咖啡館打理舒適；尊重客人的空間，也會留意需要幫忙的人。',abilityTags:[],memory:'我是街角咖啡館的店主。這是獨立的測試角色，不屬於小說正史。',goal:'整理咖啡館，照顧自己的生活與來訪的客人。',asset:'owner'},
};
const exampleNames = Object.keys(settled);

async function fixture() {
 const f = await characterApiFixture();
 const library = async () => {
  const cards = await f.read(f.routes.cards, '/api/character-cards'), scenes = await f.read(f.routes.scenes, '/api/scene-templates');
  assert.equal(cards.status, 200); assert.equal(scenes.status, 200);
  return { cards: cards.body.cards, scenes: scenes.body.templates };
 };
 const apiRequest = async (path, payload) => {
  const route = path === '/api/saves' ? f.routes.saves : f.routes.openings;
  if (payload !== undefined) return f.post(route, payload, path);
  return f.read(route, path);
 };
 return { ...f, library, apiRequest };
}
const byName = (cards, name) => cards.find(card => card.fields.name === name);
const exampleScene = (scenes, name) => scenes.find(scene => scene.shared && scene.name === name);
const cafeCity = ({ cards, scenes }) => {
 const kris = exampleScene(scenes, 'Kris 的住處'), vera = exampleScene(scenes, 'Vera 的房間'), cafe = exampleScene(scenes, '街角咖啡館');
 const place = (id, scene) => ({ id, templateId: scene.id, version: scene.version, name: scene.name });
 const person = (name, placeId, roomId, homeId) => { const card = byName(cards, name); return { templateId: card.id, version: card.version, placeId, roomId: roomId ?? '', homeId }; };
 return {
  places: [place('kris-home', kris), place('vera-home', vera), place('cafe', cafe)],
  characters: [
   person('Cass', 'kris-home', kris.rooms[0].id, 'kris-home'),
   person('Vera', 'vera-home', vera.rooms[0].id, 'vera-home'),
   person('Kris', 'kris-home', kris.rooms[0].id, 'kris-home'),
   person('店主', 'cafe', cafe.rooms.find(room => room.name === '前台').id),
  ],
 };
};

test('範例可在開局中單獨選用，並能與自己的人物卡與場景混用', async () => {
 const f = await fixture(), oldFetch = globalThis.fetch;
 try {
  const before = await f.library();
  for (const name of exampleNames) assert.ok(byName(before.cards, name), name + ' 應在人物庫');
  for (const name of ['Kris 的住處', 'Vera 的房間', '街角咖啡館']) assert.ok(exampleScene(before.scenes, name), name + ' 應在場景庫');
  // 自己的人物卡與場景
  await f.request({ version: 0, mode: 'custom', models: { npc: { provider: 'openai', model: 'gpt-6-luna' }, adjudication: { provider: 'openai', model: 'gpt-6.1-sol' } } });
  await f.worldRequest({ operation: 'set-model-key', mode: 'openai', key: 'controlled-key' });
  globalThis.fetch = async () => Response.json({ usage: { prompt_tokens: 2, completion_tokens: 2 }, choices: [{ message: { content: '{"bonuses":[]}' } }] });
  const request = async (path, payload) => {
   const route = { '/api/world': f.routes.world, '/api/character-drafts': f.routes.drafts, '/api/character-drafts/form': f.routes.form, '/api/character-cards': f.routes.cards }[path.split('?')[0]];
   return payload === undefined ? f.read(route, path) : f.post(route, payload, path);
  };
  const own = await formCharacterCard(request, { name: '孟澄' });
  globalThis.fetch = oldFetch;
  const scene = await f.post(f.routes.scenes, { id: crypto.randomUUID(), version: 0, name: '孟澄的工作室', note: '', rooms: [{ id: 'desk', name: '工作桌' }], connections: [], objects: [] }, '/api/scene-templates');
  assert.equal(scene.status, 201);
  const after = await f.library();
  assert.equal(after.cards.length, before.cards.length + 1);
  const cafe = exampleScene(after.scenes, '街角咖啡館');
  const city = {
   places: [{ id: 'studio', templateId: scene.body.template.id, version: scene.body.template.version, name: '孟澄的工作室' }, { id: 'cafe', templateId: cafe.id, version: cafe.version, name: cafe.name }],
   characters: [{ templateId: own.id, version: own.version, placeId: 'studio', roomId: 'desk' }, { templateId: byName(after.cards, 'Vera').id, version: 1, placeId: 'cafe', roomId: cafe.rooms[0].id }],
  };
  const { saved } = await confirmOpening(f.apiRequest, { name: '混用', city });
  const world = (await f.worldRequest(undefined, saved.save.id)).body.world;
  assert.deepEqual(world.characters.map(actor => actor.name).sort(), ['Vera', '孟澄']);
 } finally { globalThis.fetch = oldFetch; f.db.close(); }
});

test('沒有模型 Key 也能用範例建立世界，世界採新規則並以規則模式推進', async () => {
 const f = await fixture();
 try {
  assert.equal((await f.worldRequest()).body.modelKeys.openai.configured, false);
  const { saved } = await confirmOpening(f.apiRequest, { name: '街角咖啡館', city: cafeCity(await f.library()) });
  assert.equal(saved.save.turn ?? 0, 0);
  const world = (await f.worldRequest(undefined, saved.save.id)).body.world;
  assert.equal(world.timeContract, 'five-minute-v1');
  for (const actor of world.characters) {
   const expected = settled[actor.name];
   assert.ok(expected, actor.name);
   assert.deepEqual(actor.attributes.values, expected.values, actor.name);
   assert.equal(Object.values(actor.attributes.values).reduce((a, b) => a + b, 0), expected.total);
   assert.equal(actor.attributes.version, 2); assert.equal(actor.attributes.authority, 'formed-card');
   assert.equal(actor.mentalEnergy.policy.maximum, expected.capacity, actor.name);
   assert.deepEqual(actor.needs.personal.traits, expected.needTraits, actor.name);
  }
  const minute = world.minute;
  const advanced = await f.worldRequest({ operation: 'advance', minutes: 5, mode: 'demo', timeContract: 'five-minute-v1' }, saved.save.id);
  assert.equal(advanced.status, 200, JSON.stringify(advanced.body));
  assert.equal((await f.worldRequest(undefined, saved.save.id)).body.world.minute, minute + 5);
 } finally { f.db.close(); }
});

test('範例人物保有原本的設定，範例場景保有原本的地圖', async () => {
 const f = await fixture();
 try {
  const { saved } = await confirmOpening(f.apiRequest, { name: '街角咖啡館', city: cafeCity(await f.library()) });
  const world = (await f.worldRequest(undefined, saved.save.id)).body.world;
  for (const actor of world.characters) {
   const expected = original[actor.name];
   assert.equal(actor.personality, expected.personality);
   assert.deepEqual(actor.abilityTags, expected.abilityTags);
   assert.deepEqual(actor.memories.map(memory => memory.text), [expected.memory]);
   assert.equal(actor.goal, expected.goal);
  }
  const places = world.configuration.locations.map(location => location.name).sort();
  assert.deepEqual(places, ['Kris 的住處', 'Vera 的房間', '街角咖啡館'].sort());
  const cafe = world.configuration.locations.find(location => location.name === '街角咖啡館');
  const rooms = world.configuration.regions.filter(region => region.location === cafe.id);
  assert.deepEqual(rooms.map(room => room.name).sort(), ['儲藏室', '前台'].sort());
  const doors = world.configuration.doors.filter(door => door.regions.every(region => rooms.some(room => room.id === region)));
  assert.deepEqual(doors.map(door => door.name), ['儲藏室門']);
 } finally { f.db.close(); }
});

test('使用者不能改動範例本身', async () => {
 const f = await fixture();
 try {
  const before = await f.library();
  const cafe = exampleScene(before.scenes, '街角咖啡館');
  const { id, version, shared, ...draft } = cafe; void shared;
  const changed = await f.post(f.routes.scenes, { ...draft, id, version, name: '改名的咖啡館' }, '/api/scene-templates');
  assert.equal(changed.status, 409);
  const card = byName(before.cards, 'Cass');
  const completed = await f.post(f.routes.cards, { id: card.id, version: card.version, operationScope: 'account-operations:' + f.context.owner }, '/api/character-cards');
  assert.notEqual(completed.status, 200);
  const after = await f.library();
  assert.deepEqual(after.cards, before.cards); assert.deepEqual(after.scenes, before.scenes);
  // 另一個帳號看到同一份範例，不受前一帳號影響。
  f.context.owner = 'another';
  const foreign = await f.library();
  assert.deepEqual(foreign.cards, before.cards); assert.deepEqual(foreign.scenes, before.scenes);
 } finally { f.db.close(); }
});
