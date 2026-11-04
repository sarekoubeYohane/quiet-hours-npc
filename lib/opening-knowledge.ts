import type { Character, World } from './world';
import type { Region, WorldConfiguration } from './world-configuration';
import type { WorldObject } from './world-effects';

export type OpeningKnowledge = {
  at:number;
  rooms:{id:string;name:string;location:string}[];
  objects:{id:string;name:string;roomId:string;state:Record<string,string>}[];
  omittedRooms:number;
  omittedObjects:number;
};

const privateName = /臥室|卧室|私人|bedroom|private/i;
const snapshotMaxBytes = 12 * 1024;
const size = (value:unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

function personalRoom(configuration:WorldConfiguration, region:Region, actorId?:string) {
  const owner = configuration.privateRooms?.[region.id];
  if (owner) return actorId===undefined || owner===actorId;
  return actorId===undefined
    ? Object.values(configuration.bedrooms??{}).includes(region.id)
    : configuration.bedrooms?.[actorId]===region.id;
}

function familiarRoom(configuration:WorldConfiguration, actor:Character, region:Region) {
  if (region.id===actor.region) return true;
  const resident = configuration.residences?.[actor.id]===region.location;
  const worker = !!configuration.workplaces?.[actor.id]?.includes(region.location);
  const owner = !!configuration.ownerships?.[actor.id]?.includes(region.location);
  if (!resident&&!worker&&!owner) return false;
  if (personalRoom(configuration,region)) return personalRoom(configuration,region,actor.id);
  if (privateName.test(region.name)) return false;
  const rule = (configuration.access?.[region.id]??configuration.access?.[region.location])?.rule;
  // A grant permits entry. Familiarity comes from the role or actual starting room.
  return !rule || rule==='public' || (rule==='residents'&&resident) || (rule==='workers'&&worker);
}

export function seedOpeningKnowledge(configuration:WorldConfiguration, actors:Character[], objects:WorldObject[], minute:number) {
  const knownRooms = new Map(actors.map(actor=>[actor.id,configuration.regions.filter(region=>familiarRoom(configuration,actor,region))]));
  for (const object of objects) {
    if (object.hiddenAtOpening) continue;
    object.knownTo = actors.filter(actor=>knownRooms.get(actor.id)?.some(room=>room.id===object.region)).map(actor=>actor.id);
    // Preserve the original local interaction permission without making
    // familiarity, or a building entry grant, a new object permission.
    object.allowedTo = actors.filter(actor=>actor.region===object.region).map(actor=>actor.id);
  }

  for (const actor of actors) {
    const rooms = knownRooms.get(actor.id) ?? [];
    const knowledge:OpeningKnowledge = {at:minute,rooms:[],objects:[],omittedRooms:0,omittedObjects:0};
    let remaining = snapshotMaxBytes-size(knowledge)-16;
    for (const room of rooms) {
      const bytes = size(room)+1;
      if (remaining<bytes) knowledge.omittedRooms++;
      else {
        knowledge.rooms.push(room);
        remaining -= bytes;
      }
    }
    for (const object of objects.filter(item=>item.knownTo.includes(actor.id))) {
      const state = Object.fromEntries(Object.entries(object.state).filter(([key])=>object.stateExposure?.[key]!=='hidden'));
      const entry = {id:object.id,name:object.label,roomId:object.region,state};
      const bytes = size(entry)+1;
      if (remaining<bytes || !knowledge.rooms.some(room=>room.id===object.region)) knowledge.omittedObjects++;
      else {
        knowledge.objects.push(entry);
        remaining -= bytes;
      }
    }
    actor.openingKnowledge = knowledge;
  }
}

export function canIdentifyOpeningDestination(world:World, actor:Character, region:Region) {
  const configuration = world.configuration;
  if (!configuration || !actor.openingKnowledge) return true;
  const rule = (configuration.access?.[region.id]??configuration.access?.[region.location])?.rule;
  if ((!rule||rule==='public')&&!privateName.test(region.name)&&!personalRoom(configuration,region)) return true;
  return actor.region===region.id || actor.openingKnowledge.rooms.some(room=>room.id===region.id) || familiarRoom(configuration,actor,region) ||
    actor.observations?.some(item=>item.region===region.id&&item.clarity==='clear'&&item.sense==='sight') ||
    world.events.some(event=>event.actor===actor.id&&event.kind==='move'&&event.scene?.toRegion===region.id);
}
