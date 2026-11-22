import type {CityDraft, FinalizedObject} from './city-draft';
import {spaceNameKey} from './city-finalization';
import type {OpeningDraft} from './opening-drafts';
import type {SceneTemplate} from './scene-templates';

type CheckedRoom = {placeId:string; roomId:string};
type RoomInventory = CheckedRoom & {
  placeName:string;
  roomName:string;
  existing:Pick<FinalizedObject,'id'|'name'>[];
};
export type RoomItemReview = {
  rooms:(RoomInventory & {checked:boolean; suggestedIds:string[]})[];
  excludedItems:string[];
};
export const itemKey = (placeId:string, id:string) => placeId+':'+id;


function inventory(city:CityDraft, scenes:SceneTemplate[]):RoomInventory[] {
  return city.places.flatMap(place=>{
    const source=scenes.find(scene=>scene.id===place.templateId && scene.version===place.version);
    const space=city.finalization?.spaces.find(entry=>entry.placeId===place.id);
    const objects=[...(source?.objects??[]),...(space?.objects??[])];
    return [...(source?.rooms??[]),...(space?.rooms??[])].map(room=>({
      placeId:place.id, placeName:place.name, roomId:room.id, roomName:room.name,
      existing:objects.filter(object=>object.roomId===room.id).map(({id,name})=>({id,name})),
    }));
  });
}

/** Compare against the frozen draft. A missing room check is distinct from a checked, complete room. */
export function reviewRoomItems(draft:OpeningDraft, proposal:CityDraft, checkedRooms:CheckedRoom[]):RoomItemReview {
  const inventoryRooms=inventory(draft.body.city,draft.sources.scenes);
  const rooms=inventoryRooms.map(room=>({...room,
    checked:checkedRooms.some(check=>check.placeId===room.placeId && check.roomId===room.roomId), suggestedIds:[] as string[],
  }));
  for(const space of proposal.finalization?.spaces??[]){
    const originalObjects=draft.body.city.finalization?.spaces.find(original=>original.placeId===space.placeId)?.objects??[];
    space.objects=space.objects.filter(item=>{
      if(originalObjects.some(original=>original.id===item.id))return true;
      const room=rooms.find(room=>room.placeId===space.placeId && room.roomId===item.roomId);
      if(!room)return false;
      if(room.existing.some(existing=>spaceNameKey(existing.name)===spaceNameKey(item.name)))return false;
      if(space.objects.some(other=>room.suggestedIds.includes(other.id) && spaceNameKey(other.name)===spaceNameKey(item.name)))return false;
      room.suggestedIds.push(item.id);
      room.checked=true;
      return true;
    });
  }
  return {rooms,excludedItems:[]};
}

export function suggestedRoomItems(city:CityDraft, room:RoomItemReview['rooms'][number]){
  return city.finalization?.spaces.find(space=>space.placeId===room.placeId)?.objects
    .filter(item=>item.roomId===room.roomId && room.suggestedIds.includes(item.id))??[];
}

/** Add only selected items to rooms that still exist in the saved draft. */
export function applySelectedRoomItems(draft:OpeningDraft, proposal:CityDraft, review:RoomItemReview):CityDraft {
  const city=structuredClone(draft.body.city);
  const currentRooms=inventory(city,draft.sources.scenes);
  for(const room of review.rooms){
    const current=currentRooms.find(value=>value.placeId===room.placeId && value.roomId===room.roomId);
    if(!current)continue;
    for(const item of suggestedRoomItems(proposal,room)){
      if(review.excludedItems.includes(itemKey(room.placeId,item.id)))continue;
      if(current.existing.some(existing=>spaceNameKey(existing.name)===spaceNameKey(item.name)) ||
        currentRooms.some(other=>other.placeId===room.placeId && other.existing.some(existing=>existing.id===item.id)))continue;
      const finalization=city.finalization??={spaces:[],walks:[]};
      let space=finalization.spaces.find(value=>value.placeId===room.placeId);
      if(!space){space={placeId:room.placeId,rooms:[],objects:[],connections:[]};finalization.spaces.push(space);}
      space.objects.push(item);
      current.existing.push(item);
    }
  }
  return city;
}
