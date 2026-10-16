import type { Character, WorldEvent } from './world';
import { regions } from './perception';

export type Point = { x: number; y: number };
export const spriteIndex: Record<string, number> = { cass: 0, vera: 1, kris: 2, owner: 3 };
const spots: Record<string, Point[]> = {
  'kris-home': [{ x: 28, y: 28 }, { x: 32, y: 25 }, { x: 36, y: 28 }, { x: 23, y: 28 }],
  'vera-home': [{ x: 67, y: 28 }, { x: 74, y: 29 }, { x: 79, y: 26 }, { x: 63, y: 28 }],
  cafe: [{ x: 45, y: 77 }, { x: 49, y: 81 }, { x: 54, y: 77 }, { x: 57, y: 81 }],
  'cafe-storeroom': [{ x: 67, y: 77 }, { x: 70, y: 81 }, { x: 66, y: 83 }, { x: 69, y: 77 }],
};
const doors: Record<string, Point> = {
  'kris-home': { x: 28.5, y: 35.5 }, 'vera-home': { x: 72, y: 35.5 }, cafe: { x: 50, y: 56 },
};
export function characterRegion(character: Pick<Character, 'location' | 'region'>): string {
  return regions.find(region => region.id === character.region && region.location === character.location)?.id
    || regions.find(region => region.location === character.location)?.id || character.location;
}
export function position(character: Pick<Character, 'id' | 'location' | 'region'>): Point {
  const choices = spots[characterRegion(character)] || spots[character.location];
  // Future locations remain selectable even before their scene artwork arrives.
  return (choices || [{ x: 50, y: 46 }])[spriteIndex[character.id] ?? 0] || choices?.[0] || { x: 50, y: 46 };
}
export function walkRoute(id: string, from: string, to: string, fromRegion?: string, toRegion?: string): Point[] {
  const origin = position({ id, location: from, region: fromRegion }), destination = position({ id, location: to, region: toRegion });
  if (from === to) return fromRegion === toRegion ? [destination] : [{ x: 61.5, y: 79 }, destination];
  const exit = doors[from] || doors.cafe, entry = doors[to] || doors.cafe;
  // Cross each room's empty floor and use the shared street between doors.
  return [
    { x: exit.x, y: origin.y }, exit, { x: exit.x, y: 46 },
    { x: entry.x, y: 46 }, entry, { x: entry.x, y: destination.y }, destination,
  ].filter((p, i, all) => !i || p.x !== all[i - 1].x || p.y !== all[i - 1].y);
}
export function bubbleText(event: WorldEvent, characters: Character[]): string {
  if (event.kind === 'say') return event.scene?.content || event.text.match(/「([\s\S]*)」/)?.[1] || '說了一句話。';
  if (event.kind === 'message') return `傳送私訊給 ${characters.find(c => c.id === event.scene?.target)?.name || '朋友'}`;
  // Committed event prose is the generic activity adapter, including future kinds.
  return event.text || characters.find(character => character.id === event.actor)?.activity || '活動內容未記錄';
}
