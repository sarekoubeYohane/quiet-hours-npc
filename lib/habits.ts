import { locations, type Action, type Character, type Habit, type World } from './world';

export const habitPeriods = ['深夜', '上午', '下午', '晚上'];
const dayOf = (minute: number) => Math.floor(minute / 1440) + 1;
const periodOf = (minute: number) => Math.floor((minute % 1440) / 360);

// Only call after a valid, autonomous AI action. Continuation and user requests are excluded.
export function learnHabit(world: World, character: Character, action: Action, from: string): void {
  if (action.target === 'observer') return;
  const day = dayOf(world.minute), period = periodOf(world.minute);
  const target = ['move', 'say', 'persuade', 'message', 'work'].includes(action.type) ? action.target || '' : '';
  const key = `${period}:${from}:${action.type}:${target}`;
  const habits = (character.habits || []).filter(habit => world.minute - habit.lastSeen <= 30 * 1440);
  let habit = habits.find(habit => habit.key === key);
  if (!habit) {
    habit = { key, type: action.type, target, location: from, period, observedDays: [], lastSeen: world.minute };
    habits.push(habit);
  }
  // Repeating ten times in one day is still one day of evidence.
  habit.observedDays = [...new Set([...habit.observedDays.filter(d => d >= day - 20), day])].slice(-14);
  habit.lastSeen = world.minute;
  character.habits = habits.sort((a, b) => b.lastSeen - a.lastSeen).slice(0, 24);
}

export function habitStrength(habit: Habit, minute: number): number {
  const days = habit.observedDays.filter(day => day >= dayOf(minute) - 20).length;
  const age = Math.max(0, minute - habit.lastSeen) / 1440;
  return Math.min(1, days / 6) * Math.pow(0.5, age / 7);
}

export function habitLabel(habit: Habit, characters: Character[]): string {
  const place = locations.find(place => place.id === habit.location)?.name || habit.location;
  const destination = locations.find(place => place.id === habit.target)?.name || habit.target;
  const person = characters.find(character => character.id === habit.target)?.name || '朋友';
  const activity = habit.type === 'move' ? `前往${destination}` : habit.type === 'say' ? `與 ${person} 聊聊` :
    habit.type === 'reconsider' ? '重新思考自己的推測' : habit.type === 'persuade' ? `嘗試說服 ${person}` : habit.type === 'message' ? `傳訊息給 ${person}` : habit.type === 'work' ? ({ tea: '泡茶', tidy: '整理', craft: '畫髮飾' }[habit.target] || '工作') :
    ({ rest: '休息', reflect: '留些時間給自己', observe: '觀察周圍' }[habit.type] || '活動');
  return `${habitPeriods[habit.period]}在${place}，常會${activity}`;
}

export function habitViews(world: World, character: Character) {
  return (character.habits || []).map(habit => {
    const days = habit.observedDays.filter(day => day >= dayOf(world.minute) - 20).length;
    const strength = habitStrength(habit, world.minute);
    const established = days >= 3 && strength >= 0.2;
    return { ...habit, days, strength, established, label: habitLabel(habit, world.characters),
      fading: days >= 3 && world.minute - habit.lastSeen >= 7 * 1440 };
  }).filter(habit => habit.days > 0).sort((a, b) => Number(b.established) - Number(a.established) || b.strength - a.strength || b.lastSeen - a.lastSeen);
}

export function habitsForDecision(world: World, character: Character) {
  return habitViews(world, character).filter(habit => habit.established && habit.period === periodOf(world.minute) && habit.location === character.location)
    .slice(0, 5).map(habit => ({ tendency: habit.label, strength: Math.round(habit.strength * 100), observedDays: habit.days }));
}
