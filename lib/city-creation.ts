import { z } from 'zod';
import { characterPresets, listCharacterTemplates } from './character-template-store';
import { listSceneTemplates } from './scene-template-store';
import { cityLimits, type CityDraft, type CityPreview } from './city-draft';
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
    homeId: instanceId.optional(), homeRoomId: templateId.optional(),
    ownedPlaceIds: z.array(instanceId).max(cityLimits.places).optional(),
    workplaceIds: z.array(instanceId).max(cityLimits.places).optional(),
    homeDescription: z.string().trim().max(300).optional(), workDescription: z.string().trim().max(300).optional(),
  }).strict()).max(cityLimits.characters),
  backgroundPeople: z.array(z.object({
    id: instanceId, name: z.string().trim().min(1).max(60).refine(value => new TextEncoder().encode(value).length <= 128),
  }).strict()).max(cityLimits.backgroundPeople).optional(),
  relationships: z.array(z.object({
    from: templateId, to: templateId, targetType: z.enum(['character','background']),
    description: z.string().trim().min(1).max(256).refine(value => new TextEncoder().encode(value).length <= 256),
  }).strict()).max(cityLimits.relationships).optional(),
}).strict();

const palette = ['#eb9e79', '#a2bdf0', '#d4c485', '#a5c9b3'];
const roomKey = (placeId: string, roomId: string) => placeId + ':room:' + roomId;
const locationKey = (placeId: string) => 'place:' + placeId;
type Place = CityPreview['places'][number];
type Room = Place['rooms'][number];

function unique<T>(items: T[]): T | undefined {
  return items.length === 1 ? items[0] : undefined;
}

const ownBedroom = /(自己的|我的|自家).*(臥室|卧室|房間)|^my bedroom$/i;

function resolveStart(selection: CityDraft['characters'][number], description: string, places: Place[], home: Place | undefined,
    bedroom: Room | undefined, workplaces: Place[]) {
  if (selection.placeId || selection.roomId) {
    const place = places.find(item => item.id === selection.placeId);
    return { place, room: place?.rooms.find(item => item.id === selection.roomId) };
  }

  const label = description.trim().toLocaleLowerCase();
  if (!label) return {};
  if (ownBedroom.test(label)) return { place:home, room:bedroom };
  if (/^(家裡|家里|住處|自己的家|my home)$/.test(label)) return { place:home, room:home?.rooms[0] };
  if (/工作(的|地點|地方|場所)|^my workplace$/.test(label)) {
    const place = unique(workplaces);
    const room = place && (unique(place.rooms) ?? unique(place.rooms.filter(item => /前台|店面|工作間|工作區/.test(item.name))));
    return { place, room };
  }

  const matchingPlace = unique(places.filter(item => item.name.toLocaleLowerCase() === label));
  if (matchingPlace) return { place:matchingPlace, room:unique(matchingPlace.rooms) };
  return unique(places.flatMap(place => place.rooms
    .filter(room => [room.name, place.name + '的' + room.name].some(name => name.toLocaleLowerCase() === label))
    .map(room => ({ place, room })))) ?? {};
}

export async function prepareCity(owner: string, draft: z.infer<typeof cityDraftSchema>, previous: World) {
  const [scenes, savedCharacters] = await Promise.all([listSceneTemplates(owner), listCharacterTemplates(owner)]);
  const characters = [...characterPresets(), ...savedCharacters];
  const configuration: NonNullable<World['configuration']> = {
    locations: [], regions: [], doors: [], residences: {}, bedrooms: {}, ownerships: {}, workplaces: {}, sceneSources: {},
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
    const location = locationKey(place.id);
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
      id: place.id, name: place.name, templateName: source.name, rooms: source.rooms,
      objects: source.objects.map(object => ({name: object.name, room: source.rooms.find(room=>room.id===object.roomId)!.name})),
    });
  }
  if (objects.length > cityLimits.objects) preview.issues.push('城市文字物件超出目前容量，請減少場所數量。');

  const selected = new Set<string>();
  const byTemplate = new Map<string, Character>();
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
    const home = preview.places.find(candidate => candidate.id === selection.homeId);
    const bedroom = selection.homeRoomId ? home?.rooms.find(item => item.id === selection.homeRoomId)
      : home && ownBedroom.test(fields.startLocation.trim()) ? unique(home.rooms.filter(item => /臥室|卧室|bedroom/i.test(item.name))) : undefined;
    const roles = (ids: string[] | undefined, role: string) => [...new Set(ids)].flatMap(id => {
      const assigned = preview.places.find(candidate => candidate.id === id);
      if (!assigned) preview.issues.push(fields.name + '指定的' + role + '不在本次城市。');
      return assigned ? [assigned] : [];
    });
    const owned = roles(selection.ownedPlaceIds, '所有場所');
    const workplaces = roles(selection.workplaceIds, '工作場所');
    const { place, room } = resolveStart(selection, fields.startLocation, preview.places, home, bedroom, workplaces);
    preview.characters.push({
      templateId: template.id, name:fields.name, place:place?.name??'', room:room?.name??'', home:home?.name,
      bedroom:bedroom?.name, ownedPlaces:owned.map(item=>item.name), workplaces:workplaces.map(item=>item.name), fields,
    });
    if (selection.homeId && !home) preview.issues.push(fields.name + '的住處不在本次城市。');
    if (selection.homeRoomId && !bedroom) preview.issues.push(fields.name + '的私人房間需要位於住處。');
    if (!place || !room) {
      preview.issues.push(fields.name + '需要有效的起始地點與房間。');
      continue;
    }
    const id = 'npc:' + (people.length + 1);
    const location = locationKey(place.id);
    const actor: Character = {
      id, name:fields.name, color:palette[people.length % palette.length], location, region:roomKey(location, room.id),
      mood:'平靜', personality:fields.personality, goal:fields.directions, activity:'準備開始生活。',
      relationships:{}, memories:fields.initialMemories ? [{ time:minute, text:fields.initialMemories }] : [],
      abilityTags:fields.abilities.split(/\r?\n/).map(ability=>ability.trim()).filter(Boolean),
      profile:{ ...fields }, profileSource:{ id:template.id, version:template.version },
    };
    if (fields.directions.trim()) actor.intents = [initialDirection(actor)];
    people.push(actor);
    byTemplate.set(template.id, actor);
    if (home) configuration.residences![id] = locationKey(home.id);
    if (home && bedroom) configuration.bedrooms![id] = roomKey(locationKey(home.id), bedroom.id);
    if (owned.length) configuration.ownerships![id] = owned.map(item=>locationKey(item.id));
    if (workplaces.length) configuration.workplaces![id] = workplaces.map(item=>locationKey(item.id));
  }
  const backgroundPeople = new Map((draft.backgroundPeople ?? []).map(person => [person.id, person.name]));
  if (backgroundPeople.size !== (draft.backgroundPeople?.length ?? 0)) preview.issues.push('每位背景人物都需要獨立的身分。');
  configuration.backgroundPeople = [...backgroundPeople].map(([id,name]) => ({ id:'background:' + id, name }));
  preview.backgroundPeople = draft.backgroundPeople;
  preview.relationships = [];
  for (const relationship of draft.relationships ?? []) {
    const from = byTemplate.get(relationship.from);
    const target = relationship.targetType === 'character' ? byTemplate.get(relationship.to) : undefined;
    const backgroundName = relationship.targetType === 'background' ? backgroundPeople.get(relationship.to) : undefined;
    const targetId = target?.id ?? (backgroundName ? 'background:' + relationship.to : undefined);
    if (!from || !targetId || from.id === targetId) {
      if (from || !selected.has(relationship.from)) preview.issues.push('請為開局關聯指定本次人物或背景人物。');
      continue;
    }
    const cognition = from.cognition ??= { beliefs:[], relationshipTags:[], trace:[] };
    if (Object.hasOwn(from.relationships,targetId) || cognition.relationshipTags.length >= 8) {
      preview.issues.push(from.name + '的開局關聯重複或超過八項。');
      continue;
    }
    from.relationships[targetId] = relationship.description;
    cognition.relationshipTags.push({
      id:'opening:' + from.id + ':' + targetId, characterId:from.id, version:1, time:minute,
      person:targetId, topic:backgroundName ?? '', text:relationship.description, references:[], origin:'opening',
    });
    preview.relationships.push({ from:from.name, to:target?.name ?? backgroundName!, description:relationship.description });
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
