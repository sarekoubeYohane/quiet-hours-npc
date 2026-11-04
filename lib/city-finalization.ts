import { z } from 'zod';
import { assertBoundedState } from './adjudication-contract';
import { cityLimits, type CityDraft, type CityPreview } from './city-draft';

const placeId = z.string().regex(/^[a-zA-Z0-9_-]{1,24}$/);
const localId = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
const label = z.string().trim().min(1).max(80);
const state = z.custom<Record<string,string>>(value => {
  try {
    assertBoundedState(value);
    return true;
  } catch {
    return false;
  }
});
export const finalRoomSchema = z.object({ id:localId, name:label, privateFor:localId.optional() }).strict();
export const finalConnectionSchema = z.object({
  id:localId, name:label, rooms:z.tuple([localId,localId]), state:z.enum(['open','closed','blocked']),
}).strict();
export const cityWalkSchema = z.object({
  places:z.tuple([placeId,placeId]), minutes:z.number().int().min(1).max(180).nullable(),
}).strict();
export const cityFinalizationSchema = z.object({
  spaces:z.array(z.object({
    placeId,
    rooms:z.array(finalRoomSchema).max(20),
    objects:z.array(z.object({ id:localId, roomId:localId, name:label, state }).strict()).max(80),
    connections:z.array(finalConnectionSchema).max(40),
  }).strict()).max(cityLimits.places),
  walks:z.array(cityWalkSchema).max(28),
}).strict();

export const pairKey = (ids: [string,string]) => [...ids].sort().join(':');
export const spaceNameKey = (name: string) => name.trim().normalize('NFKC').toLowerCase();

export function applyCitySpace(draft: CityDraft, base: CityPreview['places'][number], issues: string[]) {
  const extras = draft.finalization?.spaces.find(space=>space.placeId===base.id);
  if (!extras) return base;
  const rooms = [...base.rooms];
  const objects = [...base.objects];
  const connections = [...base.connections];

  for (const room of extras.rooms) {
    if (rooms.some(item=>item.id===room.id) ||
        (room.privateFor && !draft.characters.some(actor=>actor.templateId===room.privateFor &&
          (actor.homeId===base.id || actor.ownedPlaceIds?.includes(base.id))))) {
      issues.push(base.name+'有重複的房間或未綁定的私人房間。');
      continue;
    }
    rooms.push(room);
  }
  for (const object of extras.objects) {
    const room = rooms.find(item=>item.id===object.roomId);
    if (!room || objects.some(item=>item.id===object.id)) {
      issues.push(base.name+'有重複的物件或無效的所在房間。');
      continue;
    }
    objects.push({...object,room:room.name});
  }
  for (const connection of extras.connections) {
    const [a,b] = connection.rooms;
    if (a===b || !connection.rooms.every(id=>rooms.some(room=>room.id===id)) ||
        connections.some(item=>item.id===connection.id || pairKey(item.rooms)===pairKey(connection.rooms))) {
      issues.push(base.name+'有重複的連接或無效的房間端點。');
      continue;
    }
    connections.push(connection);
  }
  return {...base,rooms,objects,connections};
}

export function cityWalksForPreview(draft: CityDraft, preview: CityPreview) {
  const spaceIds = draft.finalization?.spaces.map(space=>space.placeId) ?? [];
  const placeIds = new Set(preview.places.map(place=>place.id));
  if (new Set(spaceIds).size!==spaceIds.length || spaceIds.some(id=>!placeIds.has(id))) {
    preview.issues.push('定稿需對應本次城市中各個不同的已選場所。');
  }
  const keys = new Set<string>();
  return (draft.finalization?.walks ?? []).filter(walk=>{
    const key = pairKey(walk.places);
    const valid = walk.places[0]!==walk.places[1] && walk.places.every(id=>placeIds.has(id)) && !keys.has(key);
    if (!valid) preview.issues.push('城市道路需要不同的已選場所，且不能重複。');
    keys.add(key);
    return valid;
  });
}
