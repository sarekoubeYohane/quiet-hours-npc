// One fixed policy for new operations. Absolute deadlines stored in old journals
// remain authoritative; publishing this module never extends an accepted lease.
// Model calls stream: a call is not cut for its total length. It must show
// activity within modelFirstByteMs of being sent, and again within modelIdleMs of each piece;
// otherwise it is bounded only by the round's remaining work window. The capacity derivation is in
// docs/design/round-time-budget.md.
export const roundTimePolicy = Object.freeze({
  // round-v2 (2026-11-26): the work window grew from 400 to 610 seconds, so a page still waiting
  // 445 seconds is asked to reload before it can start a paid round.
  version: 'round-v2', modelFirstByteMs: 30_000, modelIdleMs: 15_000, recallMs: 10_000,
  workMs: 610_000,
  finishMs: 30_000, deliveryMs: 15_000,
});
export const roundLeaseMs = roundTimePolicy.workMs + roundTimePolicy.finishMs;
export const roundClientMs = roundLeaseMs + roundTimePolicy.deliveryMs;
export const timePolicyHeader = 'X-World-Time-Policy';
const limits = new WeakMap<AbortSignal, {createdAt:number;deadline:number;source:string}>();
export function deadlineSignal(deadline:number, source:string, parent?:AbortSignal):AbortSignal {
  const createdAt=Date.now();
  if(deadline<=createdAt)throw new DOMException('工作期限已到期。','TimeoutError');
  const timer=AbortSignal.timeout(deadline-createdAt);
  const signal=parent?AbortSignal.any([timer,parent]):timer;
  limits.set(signal,{createdAt,deadline,source});
  return signal;
}
export const signalTiming=(signal:AbortSignal)=>limits.get(signal);
export const signalExpired=(signal:AbortSignal)=>signal.aborted||(limits.get(signal)?.deadline??Infinity)<=Date.now();
export function checkSignal(signal:AbortSignal):void{if(signalExpired(signal))throw signal.reason??new DOMException('工作期限已到期。','TimeoutError');}
// Reject waiting without pretending the underlying write was cancelled. Callers
// retain their original queue; no continuation from this promise can run effects.
export function awaitSignal<T>(work:Promise<T>,signal:AbortSignal):Promise<T>{
  return new Promise((resolve,reject)=>{
    const abort=()=>reject(signal.reason??new DOMException('工作期限已到期。','TimeoutError'));
    if(signalExpired(signal)){work.catch(()=>{});abort();return;}
    signal.addEventListener('abort',abort,{once:true});
    work.then(value=>{if(signalExpired(signal))abort();else resolve(value);},reject).finally(()=>signal.removeEventListener('abort',abort));
  });
}
