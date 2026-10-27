import type { Character, World } from './world';
import type { Arrangement, ArrangementCondition } from './arrangements';
import { isSleeping } from './needs';
import { regionOf, type Observation } from './perception';
export type ArrangementCueState={conditionKey:string;lastMatch:string|null;epoch:number;trigger?:{key:string;at:number;handledAt?:number}};
export type ArrangementCueReceipt={id:string;version:number;key:string;state:ArrangementCueState};
export type KnownConditionInput={observations:Pick<Observation,'kind'|'source'|'region'|'time'>[]};
export const conditionKey=(condition:ArrangementCondition)=>condition.kind==='time'?`time:${condition.minute}`:condition.kind==='context'?`context:${condition.region}`:`event:${condition.clueKind}:${condition.source}:${condition.region}`;
// Only an actor's submitted time and actual known sensory input participate.
// Rewording, unrelated revisions and hidden state never enter this key.
export function knownConditionSignal(world:World,actor:Character,condition:ArrangementCondition,input:KnownConditionInput,since=0):string|null|undefined{
 if(condition.kind==='time')return world.minute>=condition.minute?conditionKey(condition):null;
 if(condition.kind==='context')return regionOf(actor)===condition.region?conditionKey(condition):null;
 const observation=input.observations.filter(o=>o.time>=since&&o.kind===condition.clueKind&&(!condition.source||o.source===condition.source)).at(-1);
 if(!observation)return undefined;
 if(condition.region&&observation.region!==condition.region)return null;
 return `event:${observation.kind}:${observation.source||''}:${observation.region||''}`;
}
export function nextConditionCue(previous:ArrangementCueState|undefined,condition:ArrangementCondition,signal:string|null|undefined,minute:number):ArrangementCueState{
 const semantic=conditionKey(condition);
 const state:ArrangementCueState=previous?.conditionKey===semantic?structuredClone(previous):{conditionKey:semantic,lastMatch:null,epoch:0};
 if(signal!==undefined&&signal!==null&&signal!==state.lastMatch){state.epoch++;state.trigger={key:JSON.stringify([semantic,state.epoch,signal]),at:minute};}
 if(signal!==undefined)state.lastMatch=signal;
 return state;
}
type CueInput={self:{arrangements:{items:Arrangement[]};observations:KnownConditionInput['observations']}};
export function arrangementCuesForDecision(world:World,actor:Character,input:CueInput){
 if(isSleeping(actor))return [];
 return input.self.arrangements.items.filter(item=>item.status==='active').flatMap(item=>{
  const prior=actor.arrangements?.items.find(i=>i.id===item.id&&i.version===item.version);
  const state=nextConditionCue(prior?.cue,item.condition,knownConditionSignal(world,actor,item.condition,{observations:input.self.observations},prior?.conditionSince??item.time),world.minute);
  return state.trigger?.handledAt===undefined&&state.trigger?[{id:item.id,version:item.version,key:state.trigger.key,triggeredAt:state.trigger.at}]:[];
 });
}
export function refreshArrangementCues(world:World,actor:Character,input:CueInput){
 if(isSleeping(actor))return;
 for(const visible of input.self.arrangements.items){
  const item=actor.arrangements?.items.find(i=>i.id===visible.id&&i.version===visible.version);if(!item||item.status!=='active')continue;
  item.cue=nextConditionCue(item.cue,item.condition,knownConditionSignal(world,actor,item.condition,{observations:input.self.observations},item.conditionSince??item.time),world.minute);
 }
}
export function arrangementCueReceipts(world:World,actor:Character,input:CueInput & {self:{arrangementCues:{id:string;version:number;key:string}[]}}):ArrangementCueReceipt[]{
 return input.self.arrangementCues.map(handle=>{const item=actor.arrangements!.items.find(i=>i.id===handle.id&&i.version===handle.version)!;return {...handle,state:nextConditionCue(item.cue,item.condition,knownConditionSignal(world,actor,item.condition,{observations:input.self.observations},item.conditionSince??item.time),world.minute)};});
}
export function acknowledgeArrangementCues(actor:Character,receipts:ArrangementCueReceipt[]|undefined,minute:number){
 for(const receipt of receipts||[]){const item=actor.arrangements?.items.find(i=>i.id===receipt.id);if(!item||item.version<receipt.version||conditionKey(item.condition)!==receipt.state.conditionKey)continue;
  if(!item.cue||item.cue.epoch<=receipt.state.epoch)item.cue=structuredClone(receipt.state);
  if(item.cue.trigger?.key===receipt.key&&item.cue.trigger.handledAt===undefined)item.cue.trigger.handledAt=minute;}
}
