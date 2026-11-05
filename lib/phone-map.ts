import type { Character, World } from './world';
import type { PhoneData } from './phones';
import { addExperience } from './memory';
import { cityLimits } from './city-draft';

type PublicPlace = { id: string; name: string };
export type PhoneMapRead = {
  actorId: string;
  at: number;
  offset: number;
  pageCount: number;
  place?: PublicPlace;
  roads: (PublicPlace & { minutes: number })[];
};

export const phoneMapPrompt = ' 可操作手機若有 mapAvailable，可用 type=phone、target=objectId、content={"collection":"map","operation":"read","offset":0} 查閱城市地圖。每次實際讀取一頁公開場所及其公開道路。offset 從 0 起，依閱讀經歷中的頁數查下一頁。可用讀到的場所 id 嘗試步行；地圖資訊不包含私有室內或進入許可。';

export function validPhoneMapOffset(offset: unknown): offset is number {
  return typeof offset === 'number' && Number.isSafeInteger(offset) && offset >= 0 && offset < cityLimits.places;
}

export function readPhoneMap(world: World, actor: Character, device: PhoneData, offset: number): void {
  const configuration = world.configuration!;
  const publicPlaces = configuration.locations.filter(place => {
    const building = configuration.access?.[place.id];
    return !building || building.rule === 'public';
  }).map(({ id, name }) => ({ id, name }));
  const place = publicPlaces[offset];
  const roads: PhoneMapRead['roads'] = [];
  if (place) {
    for (const walk of configuration.walks ?? []) {
      if (walk.minutes === null || !walk.locations.includes(place.id)) continue;
      const endpoint = publicPlaces.find(other => other.id !== place.id && walk.locations.includes(other.id));
      if (endpoint) roads.push({ ...endpoint, minutes: walk.minutes });
    }
  }
  const page = place
    ? `公開場所 ${place.name}（場所 ID ${place.id}）。${roads.length ? roads.map(road =>
      `公開道路通往 ${road.name}（場所 ID ${road.id}），步行約 ${road.minutes} 分鐘。`).join('') : '此頁沒有已列出的公開道路。'}`
    : '此頁沒有公開場所。';
  addExperience(actor, world.minute, `我實際查閱手機地圖第 ${offset + 1} 頁（共 ${publicPlaces.length} 頁）。${page}`);
  const receipt: PhoneMapRead = { actorId: actor.id, at: world.minute, offset, pageCount: publicPlaces.length,
    ...(place ? { place } : {}), roads };
  device.mapReads = [...(device.mapReads ?? []).filter(read => read.actorId !== actor.id || read.offset !== offset), receipt]
    .slice(-(cityLimits.places * cityLimits.characters));
}
