import type {CityDraft, CityWalk} from './city-draft';

export const walkPairKey = (ids: [string, string]) => [...ids].sort().join(':');

export function validOpeningWalks(walks: CityWalk[], placeIds: Set<string>, issues: string[]) {
  const seen = new Set<string>();
  return walks.filter(({places, minutes}) => {
    const key = walkPairKey(places);
    const valid = places[0] !== places[1] && places.every(id => placeIds.has(id)) && !seen.has(key)
      && (minutes === null || (Number.isInteger(minutes) && minutes > 0 && minutes <= 180));
    if (!valid) issues.push('城市道路需要不同的已選場所、不得重複，步行時間為 1 至 180 分鐘。');
    seen.add(key);
    return valid;
  });
}

/** Only walkable inter-place segments connect the non-isolated places. */
export function openingRoadNetwork(city: CityDraft) {
  const placeIds = new Set(city.places.map(place => place.id));
  const isolated = new Set(city.isolatedPlaceIds ?? []);
  const problems: string[] = [];
  if ([...isolated].some(id => !placeIds.has(id))) problems.push('隔離設定包含已移除的場所。');
  const walks = validOpeningWalks(city.finalization?.walks ?? [], placeIds, problems);
  const neighbors = new Map(city.places.filter(place => !isolated.has(place.id)).map(place => [place.id, [] as string[]]));
  for (const {places: [from, to], minutes} of walks) {
    if (minutes === null || !neighbors.has(from) || !neighbors.has(to)) continue;
    neighbors.get(from)!.push(to);
    neighbors.get(to)!.push(from);
  }
  const groups: string[][] = [], visited = new Set<string>();
  for (const first of neighbors.keys()) {
    if (visited.has(first)) continue;
    const group = [first];
    visited.add(first);
    for (const id of group) {
      for (const next of neighbors.get(id)!) {
        if (visited.has(next)) continue;
        visited.add(next);
        group.push(next);
      }
    }
    groups.push(group);
  }
  if (groups.length > 1) {
    const names = new Map(city.places.map(place => [place.id, place.name]));
    problems.push('尚未連通的場所分組：' + groups.map(group => group.map(id => names.get(id)).join('、')).join(' ／ '));
  }
  return {groups, problems};
}

export function withOpeningRoads(city: CityDraft, proposal: CityDraft): CityDraft {
  return {...city, isolatedPlaceIds: proposal.isolatedPlaceIds,
    finalization: {spaces: city.finalization?.spaces ?? [], walks: proposal.finalization?.walks ?? []}};
}
