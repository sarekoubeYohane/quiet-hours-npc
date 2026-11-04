import { z } from 'zod';
import { characterPresets, listCharacterTemplates } from './character-template-store';
import { listSceneTemplates } from './scene-template-store';
import { cityLimits, type CityPreview } from './city-draft';
import { initialDirection } from './pursuits';
import { normalizeWorld, type Character, type World } from './world';
import type { WorldObject } from './world-effects';

const instanceId = z.string().regex(/^[a-zA-Z0-9_-]{1,24}$/);
const templateId = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
const version = z.number().int().positive().safe();
export const cityDraftSchema = z.object({
  places: z.array(z.object({ id: instanceId, templateId, version, name: z.string().trim().max(80) }).strict()).max(cityLimits.places),
  characters: z.array(z.object({
    templateId, version, placeId: z.union([instanceId, z.literal('')]), roomId: z.union([templateId, z.literal('')]),
    homeId: instanceId.optional(),
  }).strict()).max(cityLimits.characters),
}).strict();

const palette = ['#eb9e79', '#a2bdf0', '#d4c485', '#a5c9b3'];
const roomKey = (placeId: string, roomId: string) => placeId + ':room:' + roomId;

export async function prepareCity(owner: string, draft: z.infer<typeof cityDraftSchema>, previous: World) {
  const [scenes, savedCharacters] = await Promise.all([listSceneTemplates(owner), listCharacterTemplates(owner)]);
  const characters = [...characterPresets(), ...savedCharacters];
  const configuration: NonNullable<World['configuration']> = {
    locations: [], regions: [], doors: [], residences: {}, sceneSources: {},
  };
  const preview: CityPreview = { places: [], characters: [], issues: [] };
  const people: Character[] = [];
  const objects: WorldObject[] = [];
  if (!draft.places.length) preview.issues.push('至少選擇一個場所。');
  if (!draft.characters.length) preview.issues.push('至少選擇一位人物。');
  const placeIds = new Set<string>();
  for (const place of draft.places) {
    if (placeIds.has(place.id)) {
      preview.issues.push('每個場所都需要獨立的身分。');
      continue;
    }
    placeIds.add(place.id);
    const source = scenes.find(scene => scene.id === place.templateId && scene.version === place.version);
    if (!source) {
      preview.issues.push('找不到指定版本的場景範本，請重新選擇。');
      continue;
    }
    if (!place.name) preview.issues.push('請為每個場所填寫名稱。');
    const location = 'place:' + place.id;
    configuration.locations.push({ id: location, name: place.name, note: source.note });
    configuration.sceneSources![location] = { id:source.id, version:source.version, name:source.name, shared:source.shared };
    configuration.regions.push(...source.rooms.map(room => ({
      id: roomKey(location, room.id), location, name: room.name,
    })));
    configuration.doors.push(...source.connections.map(connection => ({
      id: location + ':door:' + connection.id, name: connection.name,
      regions: [roomKey(location, connection.rooms[0]), roomKey(location, connection.rooms[1])] as [string,string],
    })));
    objects.push(...source.objects.map(object => {
      const id = location + ':object:' + object.id;
      return {
        id, source:id, label:object.name, region:roomKey(location, object.roomId), holder:null, owner:'world',
        revision:1, state:{ ...object.state }, lifecycle:'active' as const, kind:'furnishing', knownTo:[], allowedTo:[],
      };
    }));
    preview.places.push({
      id: place.id, name: place.name, rooms: source.rooms,
      objects: source.objects.map(object => ({name: object.name, room: source.rooms.find(room=>room.id===object.roomId)!.name})),
    });
  }
  if (objects.length > cityLimits.objects) preview.issues.push('城市文字物件超出目前容量，請減少場所數量。');

  const selected = new Set<string>();
  const minute = 1260;
  for (const selection of draft.characters) {
    if (selected.has(selection.templateId)) {
      preview.issues.push('同一人物範本只能加入一次。');
      continue;
    }
    selected.add(selection.templateId);
    const template = characters.find(candidate => candidate.id === selection.templateId && candidate.version === selection.version);
    if (!template) {
      preview.issues.push('找不到指定版本的人物範本，請重新選擇。');
      continue;
    }
    const { fields } = template;
    const place = preview.places.find(candidate => candidate.id === selection.placeId);
    const room = place?.rooms.find(candidate => candidate.id === selection.roomId);
    const home = selection.homeId ? preview.places.find(candidate => candidate.id === selection.homeId) : undefined;
    preview.characters.push({ name:fields.name, place:place?.name??'', room:room?.name??'', home:home?.name, fields });
    if (selection.homeId && !home) preview.issues.push(fields.name + '的住處不在本次城市。');
    if (!place || !room) {
      preview.issues.push(fields.name + '需要有效的起始地點與房間。');
      continue;
    }
    const id = 'npc:' + (people.length + 1);
    const location = 'place:' + place.id;
    const actor: Character = {
      id, name:fields.name, color:palette[people.length % palette.length], location, region:roomKey(location, room.id),
      mood:'平靜', personality:fields.personality, goal:fields.directions, activity:'準備開始生活。',
      relationships:{}, memories:fields.initialMemories ? [{ time:minute, text:fields.initialMemories }] : [],
      abilityTags:fields.abilities.split(/\r?\n/).map(ability=>ability.trim()).filter(Boolean),
      profile:{ ...fields }, profileSource:{ id:template.id, version:template.version },
    };
    if (fields.directions.trim()) actor.intents = [initialDirection(actor)];
    people.push(actor);
    if (home) configuration.residences![id] = 'place:' + home.id;
  }
  if (preview.issues.length) return { preview };
  // Initial first-person knowledge comes from the actual room. Later opening
  // cognition may add familiar areas; it should never copy an entire city.
  for (const object of objects) {
    object.knownTo = people.filter(actor=>actor.region===object.region).map(actor=>actor.id);
    object.allowedTo = [...object.knownTo];
  }
  const world = normalizeWorld({
    configuration, minute, turn:0, lastMode:'demo', contextId:crypto.randomUUID(),
    pursuitVersion:1, pursuitContext:crypto.randomUUID(), characters:people, events:[], objects,
    aiUsage:previous.aiUsage && { ...structuredClone(previous.aiUsage), savedDecisions:0 },
    adjudication:previous.adjudication, modelPrices:previous.modelPrices, playerBudget:previous.playerBudget,
  });
  return { preview, world };
}
