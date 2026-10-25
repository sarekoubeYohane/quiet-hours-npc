// One fixed policy for new operations. Absolute deadlines stored in old journals
// remain authoritative; publishing this module never extends an accepted lease.
export const roundTimePolicy = Object.freeze({
  version: 'round-v1', modelMs: 25_000, recallMs: 10_000,
  workMs: 12 * 25_000 + 4 * 10_000 + 60_000,
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
