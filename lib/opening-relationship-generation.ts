import { z } from 'zod';
import { cityLimits, openingDescriptionMaxLength, type CityDraft, type CityPreview } from './city-draft';
import { requestModel, type ModelService } from './model-adapter';

const kinds = ['home', 'owned', 'work', 'start', 'background', 'relationship'] as const;
const responseSchema = z.object({ updates: z.array(z.object({
  kind: z.enum(kinds), from: z.string().max(64), to: z.string().max(64), room: z.string().max(64), quote: z.string().trim().min(1).max(256),
}).strict()).max(48) }).strict();

const candidateSchema = {
  type: 'object',
  properties: { updates: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        kind: { type:'string', enum:kinds },
        from: { type:'string' }, to: { type:'string' }, room: { type:'string' }, quote: { type:'string' },
      },
      required: ['kind','from','to','room','quote'],
      additionalProperties: false,
    },
  } },
  required: ['updates'],
  additionalProperties: false,
};

export function readOpeningDescription(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length <= openingDescriptionMaxLength) return value.trim();
}

export async function suggestOpeningRelationships(draft: CityDraft, preview: CityPreview, description: string,
    service: ModelService, options: Parameters<typeof requestModel>[3]): Promise<CityDraft> {
  const people = preview.characters.map(({ templateId, name, fields }) => ({
    id: templateId, name, background: fields.background, startDescription: fields.startLocation,
    selected: draft.characters.find(actor => actor.templateId === templateId),
  }));
  const places = preview.places.map(({ id, name, templateName, rooms }) => ({ id, name, templateName, rooms }));
  const raw = await requestModel(service, [
    { role:'system', content:'整理玩家已明示的開局關聯。直接欄位優先。只在有逐字原文依據時提出建議；不得創造職業、住處、所有權、人物、地點或關係。可以從同類已選場所選一個符合既定描述的實例，不採用過去經歷中的舊工作。輸出 JSON {updates:[{kind,from,to,room,quote}]}。from 是選用人物 ID，to 是已選場所 ID、已選人物 ID、已知背景人物 ID 或原文出現的背景人物姓名。home/owned/work 可引用該人物明示描述或背景中目前的設定，start 只配對玩家明示的具體場所與房間；「自己的臥室」或「工作的店裡」留由已選關聯動態解析。background 的 to 是原文姓名，relationship 需引用同時提及雙方及關係的原句。quote 一律逐字引用，未使用的 from 或 room 回傳空字串。' },
    { role:'user', content:JSON.stringify({ description, people, places, backgroundPeople:draft.backgroundPeople, relationships:draft.relationships }) },
  ], candidateSchema, { ...options, maxOutputTokens:4096 });
  if (raw.length > 32000) throw Error('開局關聯回覆過長。');
  const { updates } = responseSchema.parse(JSON.parse(raw));

  const result = structuredClone(draft);
  const background = result.backgroundPeople ??= [];
  const relationships = result.relationships ??= [];
  const byPerson = new Map(people.map(person => [person.id, person]));
  const originalByPerson = new Map(draft.characters.map(person => [person.templateId, person]));
  const nextByPerson = new Map(result.characters.map(person => [person.templateId, person]));
  const activeNames = new Set(people.map(person => person.name));
  for (const update of updates.filter(item => item.kind === 'background')) {
    const name = update.to.trim();
    if (!name || name.length > 60 || new TextEncoder().encode(name).length > 128 ||
        !update.quote.includes(name) || !description.includes(update.quote) || activeNames.has(name) ||
        !/認識|朋友|親人|家人|老師|鄰居|同事|同學|兄|弟|姊|妹|父|母|教|friend|family|teacher|neighbor/i.test(update.quote) ||
        background.some(item => item.name === name) || background.length >= cityLimits.backgroundPeople) continue;
    background.push({ id:crypto.randomUUID().slice(0,24), name });
  }

  for (const { kind, from, to, room, quote } of updates) {
    const person = byPerson.get(from);
    const original = originalByPerson.get(from);
    const next = nextByPerson.get(from);
    if (!person || !original || !next) continue;
    const fromDescription = description.includes(quote) && quote.includes(person.name);
    if (kind === 'relationship') {
      const active = byPerson.get(to);
      const other = active ? undefined : background.find(item => item.id === to || item.name === to);
      const target = active ?? other;
      if (!target || from === target.id || !fromDescription || !quote.includes(target.name) ||
          new TextEncoder().encode(quote).length > 256 || relationships.length >= cityLimits.relationships ||
          relationships.filter(item => item.from === from).length >= 8) continue;
      const targetType = active ? 'character' : 'background';
      if (!relationships.some(item => item.from === from && item.to === target.id && item.targetType === targetType)) {
        relationships.push({ from, to:target.id, targetType, description:quote });
      }
      continue;
    }

    const place = places.find(item => item.id === to);
    if (!place) continue;
    const namedPlaces = places.filter(item => item.name && quote.includes(item.name));
    const compatible = namedPlaces.length ? namedPlaces.some(item => item.id === to) : quote.includes(place.templateName);
    const includesRoom = room && place.rooms.some(item => item.id === room);
    if (!compatible) continue;

    if (kind === 'start' && !next.placeId && !next.roomId && fromDescription && quote.includes(place.name) && /起點|起始|開始|start/i.test(quote) && includesRoom) {
      next.placeId = to;
      next.roomId = room;
    } else if (kind === 'home' && !next.homeId &&
        (original.homeDescription?.includes(quote) ||
          (person.background.includes(quote) || fromDescription) && /住|家|resid|live/i.test(quote) && !/曾經|以前|曾住/.test(quote))) {
      next.homeId = to;
      if (!next.homeRoomId && includesRoom) next.homeRoomId = room;
    } else if (kind === 'owned' && original.ownedPlaceIds === undefined && fromDescription && /擁有|屋主|店主|own/i.test(quote)) {
      next.ownedPlaceIds = [...new Set([...(next.ownedPlaceIds ?? []), to])];
    } else if (kind === 'work' && original.workplaceIds === undefined &&
        (original.workDescription?.includes(quote) ||
          (person.background.includes(quote) || fromDescription) && /工作|任職|店員|上班|受僱|work|employee/i.test(quote) && !/曾經|以前|曾在|曾任/.test(quote))) {
      next.workplaceIds = [...new Set([...(next.workplaceIds ?? []), to])];
    }
  }

  return result;
}
