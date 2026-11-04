import type { Character, World } from './world';

export type Location = { id: string; name: string; note?: string };
export type Region = { id: string; location: string; name: string };
export type Door = { id: string; name: string; regions: [string, string] };

export type WorldConfiguration = {
  locations: Location[];
  regions: Region[];
  doors: Door[];
  residences?: Record<string, string>;
};

// Legacy saves omit configuration. Keep their layout and residence mapping as
// a single read-only fallback; explicit configurations never inherit entries.
const legacyConfiguration: WorldConfiguration = {
  locations: [
    { id: 'kris-home', name: 'Kris 的住處', note: '一盞沒關的燈，一壺剛泡好的茶。' },
    { id: 'vera-home', name: 'Vera 的房間', note: '布料、髮飾，與安靜的手機。' },
    { id: 'cafe', name: '街角咖啡館', note: '熟悉的角落。坐下，也可能遇見人。' },
  ],
  regions: [
    { id: 'kris-home-main', location: 'kris-home', name: '室內' },
    { id: 'vera-home-main', location: 'vera-home', name: '室內' },
    { id: 'cafe-front', location: 'cafe', name: '前台' },
    { id: 'cafe-storeroom', location: 'cafe', name: '儲藏室' },
  ],
  doors: [{ id: 'cafe-door', name: '儲藏室門', regions: ['cafe-front', 'cafe-storeroom'] }],
  residences: { cass: 'kris-home', kris: 'kris-home', vera: 'vera-home', owner: 'cafe' },
};

export const worldLocations = (world?: Pick<World, 'configuration'>): readonly Location[] =>
  (world?.configuration ?? legacyConfiguration).locations;
export const worldRegions = (world?: Pick<World, 'configuration'>): readonly Region[] =>
  (world?.configuration ?? legacyConfiguration).regions;
export const worldDoors = (world: Pick<World, 'configuration'>): readonly Door[] =>
  (world.configuration ?? legacyConfiguration).doors;

export function homeLocation(world: World, character: Character): string | undefined {
  const residences = (world.configuration ?? legacyConfiguration).residences;
  return residences && Object.hasOwn(residences, character.id) ? residences[character.id] : undefined;
}

export function defaultRegion(location: string, world?: Pick<World, 'configuration'>): string {
  const region = worldRegions(world).find(region => region.location === location);
  if (!region) throw Error('世界配置缺少地點的入口房間。');
  return region.id;
}

export function connectingDoor(world: World, from: string, to: string) {
  return worldDoors(world).find(door => door.regions.includes(from) && door.regions.includes(to));
}
