import { entryPermission } from './city-access';
import { defaultRegion, worldRegions } from './world-configuration';
import { regionOf } from './perception';
import type { World, Character } from './world';
import type { RoutinePlace } from './routine-rules';

export function placeRoles(world:World,actorId:string,location:string):string[] {
  const configuration=world.configuration;
  return [configuration?.residences?.[actorId]===location?'resident':'',
    configuration?.ownerships?.[actorId]?.includes(location)?'owner':'',
    configuration?.workplaces?.[actorId]?.includes(location)?'worker':''].filter(Boolean);
}

// Admission, private-room scope and a physical path are separate from goods rights.
export function dailyRoomAccessible(world:World,actorId:string,regionId:string):boolean {
  const configuration=world.configuration,room=worldRegions(world).find(value=>value.id===regionId);
  if(!configuration||!room||!world.characters.some(actor=>actor.id===actorId))return false;
  const permitted=(id:string)=>entryPermission(world,actorId,room.location,id)?.allowed!==false&&
    (!configuration.privateRooms?.[id]||configuration.privateRooms[id]===actorId);
  const entrance=defaultRegion(room.location,world);
  if(!permitted(entrance)||!permitted(regionId))return false;
  const visited=new Set([entrance]),queue=[entrance];
  for(const current of queue)for(const door of configuration.doors){
    if(!door.regions.includes(current)||configuration.blockedRoomConnections?.some(pair=>pair.every(id=>door.regions.includes(id))))continue;
    for(const next of door.regions)if(!visited.has(next)&&permitted(next)&&worldRegions(world).some(value=>value.id===next&&value.location===room.location)){
      visited.add(next);queue.push(next);
    }
  }
  return visited.has(regionId);
}

export function customRoutinePlaces(world:World):RoutinePlace[] {
  return (world.configuration?.locations||[]).map(location=>({
    location:location.id,purpose:'custom',description:[location.name,location.note].filter(Boolean).join('：'),
    operators:world.characters.filter(actor=>placeRoles(world,actor.id,location.id).length>0).map(actor=>actor.id),
  }));
}

export function routinePlaceFor(world:World,actor:Character):RoutinePlace|undefined {
  const place=world.routinePlaces?.find(value=>value.location===actor.location&&value.operators.includes(actor.id));
  if(place?.purpose==='custom'&&(!placeRoles(world,actor.id,actor.location).length||!dailyRoomAccessible(world,actor.id,regionOf(actor))))return;
  return place;
}
