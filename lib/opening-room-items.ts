import type {CityDraft, FinalizedObject, FinalizedRoom} from './city-draft';
import {spaceNameKey} from './city-finalization';
import type {OpeningDraft} from './opening-drafts';
import type {SceneTemplate} from './scene-templates';

type CheckedRoom = {placeId:string; roomId:string};
type RoomInventory = CheckedRoom & {
  placeName:string;
  roomName:string;
  existing:Pick<FinalizedObject,'id'|'name'>[];
  proposedRoom?:FinalizedRoom;
};
export type RoomItemReview = {
  rooms:(RoomInventory & {checked:boolean; suggestedIds:string[]})[];
  excludedItems:string[];
  candidateKeys?:string[];
  adoptedItemKeys?:string[];
  createdRooms?:CheckedRoom[];
};
export const itemKey = (placeId:string, id:string) => placeId+':'+id;


function inventory(city:CityDraft, scenes:SceneTemplate[], proposal:CityDraft, reviewed?:RoomInventory[]):RoomInventory[] {
  return city.places.flatMap(place=>{
    const source=scenes.find(scene=>scene.id===place.templateId && scene.version===place.version);
    const space=city.finalization?.spaces.find(entry=>entry.placeId===place.id);
    const objects=[...(source?.objects??[]),...(space?.objects??[])];
    const rooms:RoomInventory[]=[...(source?.rooms??[]),...(space?.rooms??[])].map(room=>({
      placeId:place.id, placeName:place.name, roomId:room.id, roomName:room.name,
      existing:objects.filter(object=>object.roomId===room.id).map(({id,name})=>({id,name})),
    }));
    if(!proposal.places.some(p=>p.id===place.id && p.templateId===place.templateId && p.version===place.version))return rooms;
    const suggested=proposal.finalization?.spaces.find(entry=>entry.placeId===place.id);
    for(const room of suggested?.rooms??[]){
      if(rooms.some(row=>row.roomId===room.id))continue;
      if(room.privateFor && !city.characters.some(actor=>actor.templateId===room.privateFor))continue;
      // A room the player deleted after generation is not a new AI room.
      if(reviewed && !reviewed.some(row=>row.placeId===place.id && row.roomId===room.id && row.proposedRoom))continue;
      rooms.push({placeId:place.id,placeName:place.name,roomId:room.id,roomName:room.name,existing:[],proposedRoom:room});
    }
    return rooms;
  });
}

/** Compare against the frozen draft. A missing room check is distinct from a checked, complete room. */
export function reviewRoomItems(draft:OpeningDraft, proposal:CityDraft, checkedRooms:CheckedRoom[]):RoomItemReview {
  const inventoryRooms=inventory(draft.body.city,draft.sources.scenes,proposal);
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

export function roomItemKeys(review:RoomItemReview):string[] {
  return review.candidateKeys??review.rooms.flatMap(room=>room.suggestedIds.map(id=>itemKey(room.placeId,id)));
}

/** Candidate identity belongs to its place. Its room, availability and displayed count follow the edited proposal and live inventory. */
export function currentRoomItemReview(proposal:CityDraft,review:RoomItemReview,latest?:{city:CityDraft;scenes:SceneTemplate[]}):RoomItemReview {
  const candidateKeys=roomItemKeys(review);
  const known=new Set(candidateKeys);
  const current=latest?inventory(latest.city,latest.scenes,proposal,review.rooms):review.rooms;
  const existingKeys=new Set(current.flatMap(room=>room.existing.map(item=>itemKey(room.placeId,item.id))));
  const rooms=current.map(room=>{
    const checked=review.rooms.some(old=>old.placeId===room.placeId&&old.roomId===room.roomId&&old.checked);
    const names=new Set(room.existing.map(item=>spaceNameKey(item.name)));
    const space=proposal.finalization?.spaces.find(entry=>entry.placeId===room.placeId);
    const suggestedIds:string[]=[];
    for(const item of space?.objects??[]){
      const key=itemKey(room.placeId,item.id),name=spaceNameKey(item.name);
      if(item.roomId!==room.roomId||!known.has(key)||existingKeys.has(key)||names.has(name))continue;
      suggestedIds.push(item.id);names.add(name);
    }
    return {...room,checked:checked||suggestedIds.length>0,suggestedIds};
  });
  return {...review,candidateKeys,rooms};
}

export function suggestedRoomItems(city:CityDraft,room:RoomItemReview['rooms'][number]){
  return city.finalization?.spaces.find(space=>space.placeId===room.placeId)?.objects
    .filter(item=>item.roomId===room.roomId&&room.suggestedIds.includes(item.id))??[];
}

export function applySelectedRoomItems(draft:OpeningDraft,proposal:CityDraft,review:RoomItemReview) {
  const city=structuredClone(draft.body.city);
  const roomItems=currentRoomItemReview(proposal,review,{city,scenes:draft.sources.scenes});
  const adoptedItemKeys:string[]=[];
  const createdRooms:CheckedRoom[]=[];
  for(const room of roomItems.rooms){
    const selected=suggestedRoomItems(proposal,room).filter(item=>!roomItems.excludedItems.includes(itemKey(room.placeId,item.id)));
    if(!selected.length)continue;
    const finalization=city.finalization??={spaces:[],walks:[]};
    let space=finalization.spaces.find(value=>value.placeId===room.placeId);
    if(!space){space={placeId:room.placeId,rooms:[],objects:[],connections:[]};finalization.spaces.push(space);}
    if(room.proposedRoom){
      space.rooms.push(room.proposedRoom);
      createdRooms.push({placeId:room.placeId,roomId:room.roomId});
    }
    space.objects.push(...selected);
    adoptedItemKeys.push(...selected.map(item=>itemKey(room.placeId,item.id)));
  }
  return {city,roomItems:{...roomItems,adoptedItemKeys,createdRooms}};
}
