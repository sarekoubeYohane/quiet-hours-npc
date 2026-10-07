import type { Character, WorldEvent } from './world';

export type Point = { x: number; y: number };
export const spriteIndex: Record<string, number> = { cass: 0, vera: 1, kris: 2 };
const spots: Record<string, Point[]> = {
  'kris-home': [{ x: 28, y: 28 }, { x: 32, y: 25 }, { x: 36, y: 28 }],
  'vera-home': [{ x: 67, y: 28 }, { x: 74, y: 29 }, { x: 79, y: 26 }],
  cafe: [{ x: 45, y: 77 }, { x: 52, y: 77 }, { x: 59, y: 77 }],
};
const doors: Record<string, Point> = {
  'kris-home': { x: 28.5, y: 35.5 }, 'vera-home': { x: 72, y: 35.5 }, cafe: { x: 50, y: 56 },
};
export function position(character: Pick<Character, 'id' | 'location'>): Point {
  return (spots[character.location] || spots.cafe)[spriteIndex[character.id] ?? 0];
}
export function walkRoute(id: string, from: string, to: string): Point[] {
  if (from === to) return [position({ id, location: to })];
  const origin = position({ id, location: from }), destination = position({ id, location: to });
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
  const labels: Record<string, string> = {
    move: `前往${({ 'kris-home': 'Kris 的住處', 'vera-home': 'Vera 的房間', cafe: '街角咖啡館' } as Record<string, string>)[event.scene?.to || ''] || '另一個地點'}`,
    rest: '休息一會兒', reflect: '留點時間給自己…', observe: '看看周圍',
    work: event.scene?.target === 'tea' ? '泡一壺茶' : event.scene?.target === 'craft' ? '畫下髮飾的想法' : '整理眼前的小東西',
    blocked: '暫時留在原地', continue: '繼續原本的活動',
  };
  return labels[event.kind] || '安靜待著';
}
