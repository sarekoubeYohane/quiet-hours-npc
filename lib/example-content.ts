import { validCardAllocation, type CardValues, type CharacterCard } from './character-cards';
import type { NeedTraits } from './body-needs-policy';
import type { SceneTemplate } from './scene-templates';
import { blankCharacterTemplateFields, type CharacterTemplateFields } from './character-templates';

/**
 * Built-in example content (ADR 0018, #317). Examples belong to no account and
 * are never written to D1, so they cannot be edited or deleted and do not count
 * against an account's own cards or scenes. Worlds built from them follow the
 * same rules as any other card-based world.
 *
 * Text follows the original fixed world (seedWorld / cafeOwner in lib/world.ts)
 * but is kept here as independent data so the old seed can be removed later.
 * Values are the #316 settled numbers: no dice, minimums are the general 3.
 */
type ExamplePerson = {
 asset: string; values: CardValues; capacity: number; needTraits: NeedTraits;
 fields: Pick<CharacterTemplateFields, 'name' | 'personality' | 'abilities' | 'initialMemories' | 'directions' | 'startLocation'>;
};
const people: ExamplePerson[] = [
 { asset: 'cass', values: { strength: 7, endurance: 9, dexterity: 14, perception: 15, appearance: 11 }, capacity: 50, needTraits: { hunger: .8, thirst: 1, sleep: 1.2 }, fields: {
  name: 'Cass', personality: '努力保持冷靜；害怕被留下，但也想保有自己的選擇。', abilities: '不擅長髮飾設計',
  initialMemories: '與 Vera 約好暫時分開幾天。Kris 讓我先住下，接下來由我自己決定。', directions: '先安頓自己，慢慢想清楚接下來的生活。', startLocation: 'Kris 的住處',
 } },
 { asset: 'vera', values: { strength: 11, endurance: 15, dexterity: 15, perception: 16, appearance: 13 }, capacity: 70, needTraits: { hunger: .8, thirst: .8, sleep: .8 }, fields: {
  name: 'Vera', personality: '不善言詞，習慣以陪伴表達關心；正在練習不把所有責任攬在身上。', abilities: '擅長髮飾設計',
  initialMemories: 'Cass 說需要幾天空間。我不知道她此刻在哪裡；我們可以用手機聯絡。', directions: '尊重 Cass 的空間，也試著做一件自己喜歡的事。', startLocation: 'Vera 的房間',
 } },
 { asset: 'kris', values: { strength: 10, endurance: 12, dexterity: 13, perception: 14, appearance: 13 }, capacity: 75, needTraits: { hunger: 1, thirst: 1, sleep: 1 }, fields: {
  name: 'Kris', personality: '成熟、務實，不替別人決定人生；先處理吃飯與休息等眼前的事情。', abilities: '',
  initialMemories: 'Cass 暫時借住。我可以幫她安頓，不必逼她今晚做出決定。', directions: '提供安全的暫住空間，讓 Cass 自己思考。', startLocation: 'Kris 的住處',
 } },
 { asset: 'owner', values: { strength: 10, endurance: 11, dexterity: 12, perception: 12, appearance: 10 }, capacity: 65, needTraits: { hunger: 1, thirst: 1, sleep: 1 }, fields: {
  name: '店主', personality: '務實而溫和，喜歡把咖啡館打理舒適；尊重客人的空間，也會留意需要幫忙的人。', abilities: '',
  initialMemories: '我是街角咖啡館的店主。這是獨立的測試角色，不屬於小說正史。', directions: '整理咖啡館，照顧自己的生活與來訪的客人。', startLocation: '街角咖啡館',
 } },
];
const minimums: CardValues = { strength: 3, endurance: 3, dexterity: 3, perception: 3, appearance: 3 };
const cardId = (asset: string) => 'card-example-' + asset;

export const exampleCharacterCards: readonly CharacterCard[] = people.map(person => ({
 id: cardId(person.asset), version: 1, shared: true,
 fields: { ...blankCharacterTemplateFields(), ...person.fields },
 formationVersion: 'character-card-v1', attributeVersion: 2,
 values: { ...person.values }, initialTotal: Object.values(person.values).reduce((sum, value) => sum + value, 0),
 minimums: { ...minimums }, capacity: person.capacity, needTraits: { ...person.needTraits },
}));

// Same allocation check as an account card; worlds then apply them through applyCharacterCard like any card.
for (const card of exampleCharacterCards) if (!validCardAllocation(card.values, { ...card, version: card.formationVersion })) throw Error('範例人物卡數值不合法：' + card.fields.name);

/** Example cards map back to the original character artwork keys in public/characters/manifest.json. */
export const exampleCardAssetKeys: Readonly<Record<string, string>> = Object.fromEntries(people.map(person => [cardId(person.asset), person.asset]));

export const exampleSceneTemplates: readonly SceneTemplate[] = [
 { id: 'example-kris-home', version: 1, shared: true, name: 'Kris 的住處', note: '一盞沒關的燈，一壺剛泡好的茶。',
  rooms: [{ id: 'main', name: '室內' }], connections: [], objects: [] },
 { id: 'example-vera-home', version: 1, shared: true, name: 'Vera 的房間', note: '布料、髮飾，與安靜的手機。',
  rooms: [{ id: 'main', name: '室內' }], connections: [], objects: [] },
 { id: 'example-cafe', version: 1, shared: true, name: '街角咖啡館', note: '熟悉的角落。坐下，也可能遇見人。',
  rooms: [{ id: 'front', name: '前台' }, { id: 'storeroom', name: '儲藏室' }],
  connections: [{ id: 'storeroom-door', name: '儲藏室門', rooms: ['front', 'storeroom'] }], objects: [] },
];
