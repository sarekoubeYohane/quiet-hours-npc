import type { MentalEnergy } from './mental-energy';

const historyCapacity=32;

/** Observer history retention is shared; each writer owns its authoritative changes. */
export function appendMentalHistory(state:Pick<MentalEnergy,'history'|'dropped'>,entry:MentalEnergy['history'][number]):void {
 state.history.push(entry);
 state.dropped+=Math.max(0,state.history.length-historyCapacity);
 state.history=state.history.slice(-historyCapacity);
}
