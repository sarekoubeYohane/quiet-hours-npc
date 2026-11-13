import type { World } from './world';

// Remember the opening fact, never reveal remote stock or later permission changes.
export function openingResourcesForActor(world:World,actorId:string){
  const setup=world.openingResources;
  if(!setup)return undefined;
  return {at:setup.minute,supplies:setup.supplies.filter(item=>item.allowedTo.includes(actorId))
    .map(({id,label,region,location})=>({id,label,region,location,placeName:world.configuration?.locations.find(place=>place.id===location)?.name,roomName:world.configuration?.regions.find(room=>room.id===region)?.name,permissionAtOpening:'可直接自行取用',availability:'尚需到場確認現況'}))};
}
