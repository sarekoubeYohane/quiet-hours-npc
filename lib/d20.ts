/**
 * The trusted world engine owns D20 results. NPC models may suggest an
 * action, but never choose the die face or its outcome.
 */
export type Outcome = 'critical-success' | 'success' | 'mixed' | 'failure' | 'critical-failure';
export type Advantage = -4 | -2 | 0 | 2 | 4;
export type Difficulty = 8 | 12 | 16;
export type Resolution = {
  roll: number;
  modifier: Advantage;
  dc: Difficulty;
  total: number;
  outcome: Outcome;
};

export function rollD20(random: () => number = Math.random): number {
  const sample = random();
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1) throw Error('無效的骰子亂數來源');
  return Math.floor(sample * 20) + 1;
}

export function judgeD20(roll: number, modifier: Advantage, dc: Difficulty): Resolution {
  if (!Number.isInteger(roll) || roll < 1 || roll > 20 ||
      ![-4, -2, 0, 2, 4].includes(modifier) || ![8, 12, 16].includes(dc)) {
    throw Error('行動判定參數無效');
  }
  const total = roll + modifier - dc;
  const outcome: Outcome = total >= 8 ? 'critical-success'
    : total >= 0 ? 'success'
    : total >= -6 ? 'mixed'
    : total >= -10 ? 'failure' : 'critical-failure';
  return { roll, modifier, dc, total, outcome };
}
