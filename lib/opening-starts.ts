import type { CityDraft } from './city-draft';

type Actor = CityDraft['characters'][number];
type Start = Pick<Actor, 'placeId' | 'roomId' | 'placeOrigin' | 'roomOrigin'>;

export function protectOpeningStart(current: Start, suggested: Start): Start {
  // A chosen room identifies its place instance, even when another place has the same room ID.
  const keepRoom = !!current.roomId && current.roomOrigin !== 'system';
  const keepPlace = keepRoom || (!!current.placeId && current.placeOrigin !== 'system');
  const placeId = keepPlace ? current.placeId : suggested.placeId;
  const roomId = !keepRoom && suggested.placeId === placeId ? suggested.roomId : current.roomId;
  return {
    placeId, roomId,
    ...(current.placeOrigin ? { placeOrigin: current.placeOrigin } : !current.placeId && placeId ? { placeOrigin: 'system' } : {}),
    ...(current.roomOrigin ? { roomOrigin: current.roomOrigin } : !current.roomId && roomId ? { roomOrigin: 'system' } : {}),
  };
}

export function reconcileOpeningStarts(proposal: CityDraft, latest: CityDraft): CityDraft {
  return { ...proposal, characters: proposal.characters.map(person => {
    const current = latest.characters.find(actor => actor.templateId === person.templateId);
    return current ? { ...person, ...protectOpeningStart(current, person) } : person;
  }) };
}

export function sameExceptOpeningStarts(first: CityDraft, second: CityDraft): boolean {
  const arrangements = (city: CityDraft) => ({ ...city, characters: city.characters.map(actor => ({
    ...actor, placeId: '', roomId: '', placeOrigin: undefined, roomOrigin: undefined,
  })) });
  return JSON.stringify(arrangements(first)) === JSON.stringify(arrangements(second));
}
