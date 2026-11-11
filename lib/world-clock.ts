/** World minutes as people read them: day number and clock time. Kept tiny so list pages need not import the world engine. */
export const worldClock = (minute: number) =>
  `第 ${Math.floor(minute / 1440) + 1} 天 ${String(Math.floor((minute % 1440) / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
