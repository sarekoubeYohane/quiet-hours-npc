import type { Character, World } from './world';
import { arrangementPursuitState, type Arrangement, type ArrangementCondition } from './arrangements';
import { isSleeping } from './needs';
import { initializeObservationOrder } from './memory';
import { regionOf, type Observation } from './perception';
export type KnownObservationCursor={id:string;time:number;sequence?:number};
export type ArrangementCueState={conditionKey:string;lastMatch:string|null;epoch:number;observationCursor?:KnownObservationCursor;trigger?:{key:string;at:number;handledAt?:number}};
export type ArrangementCueReceipt={pursuitId?:string;id:string;version:number;key:string;state:ArrangementCueState};
export type KnownConditionInput={observations:Pick<Observation,'kind'|'source'|'region'|'time'>[];memoryIds:string[]};
export const conditionKey=(condition:ArrangementCondition)=>condition.kind==='time'?`time:${condition.minute}`:condition.kind==='context'?`context:${condition.region}`:`event:${condition.clueKind}:${condition.source}:${condition.region}`;
// Only an actor's submitted time and actual known sensory input participate.
// Rewording, unrelated revisions and hidden state never enter this key.
type ConditionSignal=string|null|undefined|{events:{id:string;time:number;sequence:number;signal:string|null}[]};
// Upgrade old operational cursors before any new sensory event in a round.
// A forgotten old ID has no recoverable tie order, so baseline the already
// committed high water. New same-minute observations receive greater numbers.
export function initializeKnownConditionOrder(world:World){
 for(const actor of world.characters){
  initializeObservationOrder(actor);
  const bind=(cue:ArrangementCueState|undefined)=>{
   if(!cue||cue.observationCursor?.sequence!==undefined||!cue.observationCursor&&!cue.trigger)return;
   const cursor=cue.observationCursor;
   const sequence=cursor?actor.shortTerm?.find(m=>m.id===cursor.id)?.observationSequence:undefined;
   cue.observationCursor={id:cursor?.id||'baseline',time:cursor?.time??world.minute,sequence:sequence??actor.observationSequence??0};
  };
  for(const item of actor.arrangements?.items||[])bind(item.cue);
  for(const device of world.phones?.devices||[])if(world.objects?.find(o=>o.id===device.objectId)?.owner===actor.id)for(const record of device.calendar||[])bind(record.reminder?.cue);
 }
}
export function knownConditionSignal(world:World,actor:Character,condition:ArrangementCondition,input:KnownConditionInput,since=0,cursor?:KnownObservationCursor):ConditionSignal{
 if(condition.kind==='time')return world.minute>=condition.minute?conditionKey(condition):null;
 if(condition.kind==='context')return regionOf(actor)===condition.region?conditionKey(condition):null;
 // The structured clue projection omits observation IDs. Bind its shown clue
 // tuples and displayed memory handles back to this actor's immutable
 // observations solely for stable order.
 // No unshown clue, world event, or hidden source participates in the stream.
 const observations=actor.observations||[];
 const highWater=cursor?.sequence??(cursor?actor.shortTerm?.find(m=>m.id===cursor.id)?.observationSequence??actor.observationSequence??0:undefined);
 const events=observations.flatMap(o=>{
  if(!input.memoryIds.includes(o.id)||o.time<since||o.kind!==condition.clueKind||condition.source&&o.source!==condition.source||!input.observations.some(shown=>shown.time===o.time&&shown.kind===o.kind&&shown.source===o.source&&shown.region===o.region))return [];
  const sequence=actor.shortTerm?.find(m=>m.id===o.id)?.observationSequence;
  if(sequence===undefined||highWater!==undefined&&sequence<=highWater)return [];
  return [{id:o.id,time:o.time,sequence,signal:condition.region&&o.region!==condition.region?null:`event:${o.kind}:${o.source||''}:${o.region||''}`}];
 });
 return events.length?{events}:undefined;
}
export function nextConditionCue(previous:ArrangementCueState|undefined,condition:ArrangementCondition,signal:ConditionSignal,minute:number):ArrangementCueState{
 const semantic=conditionKey(condition);
 const state:ArrangementCueState=previous?.conditionKey===semantic?structuredClone(previous):{conditionKey:semantic,lastMatch:null,epoch:0};
 const apply=(value:string|null)=>{if(value!==null&&value!==state.lastMatch){state.epoch++;state.trigger={key:JSON.stringify([semantic,state.epoch,value]),at:minute};}state.lastMatch=value;};
 if(signal&&typeof signal==='object'){
  // A legacy handled cue has no trustworthy processed-history cursor. Its
  // first upgraded view establishes a baseline instead of replaying history.
  const events=state.trigger&&state.observationCursor?.sequence===undefined?signal.events.slice(-1):signal.events;
  for(const event of events){apply(event.signal);state.observationCursor={id:event.id,time:event.time,sequence:event.sequence};}
 }else if(signal!==undefined)apply(signal);
 return state;
}
type CueInput={self:{arrangements:{items:Arrangement[]};observations:KnownConditionInput['observations'];shortTerm:{id:string}[]}};
export function arrangementCuesForDecision(world:World,actor:Character,input:CueInput){
 if(isSleeping(actor))return [];
 return input.self.arrangements.items.filter(item=>item.status==='active'&&(!item.pursuit||arrangementPursuitState(actor,item)?.status==='active')).flatMap(item=>{
  const prior=actor.arrangements?.items.find(i=>i.id===item.id&&i.version===item.version);
  const state=nextConditionCue(prior?.cue,item.condition,knownConditionSignal(world,actor,item.condition,{observations:input.self.observations,memoryIds:input.self.shortTerm.map(m=>m.id)},prior?.conditionSince??item.time,prior?.cue?.observationCursor),world.minute);
  return state.trigger?.handledAt===undefined&&state.trigger?[{id:item.id,version:item.version,key:state.trigger.key,triggeredAt:state.trigger.at,...(item.pursuit?{pursuit:{id:item.pursuit.id,version:arrangementPursuitState(actor,item)!.currentVersion}}:{})}]:[];
 });
}
export function refreshArrangementCues(world:World,actor:Character,input:CueInput){
 if(isSleeping(actor))return;
 for(const visible of input.self.arrangements.items){
  const item=actor.arrangements?.items.find(i=>i.id===visible.id&&i.version===visible.version);if(!item||item.status!=='active'||item.pursuit&&arrangementPursuitState(actor,item)?.status!=='active')continue;
  item.cue=nextConditionCue(item.cue,item.condition,knownConditionSignal(world,actor,item.condition,{observations:input.self.observations,memoryIds:input.self.shortTerm.map(m=>m.id)},item.conditionSince??item.time,item.cue?.observationCursor),world.minute);
 }
}
export function arrangementCueReceipts(world:World,actor:Character,input:CueInput & {self:{arrangementCues:{id:string;version:number;key:string}[]}}):ArrangementCueReceipt[]{
 return input.self.arrangementCues.map(handle=>{const item=actor.arrangements!.items.find(i=>i.id===handle.id&&i.version===handle.version)!;return {...handle,pursuitId:item.pursuit?.id,state:nextConditionCue(item.cue,item.condition,knownConditionSignal(world,actor,item.condition,{observations:input.self.observations,memoryIds:input.self.shortTerm.map(m=>m.id)},item.conditionSince??item.time,item.cue?.observationCursor),world.minute)};});
}
export function acknowledgeArrangementCues(actor:Character,receipts:ArrangementCueReceipt[]|undefined,minute:number){
 for(const receipt of receipts||[]){const item=actor.arrangements?.items.find(i=>i.id===receipt.id);if(!item||item.version<receipt.version||conditionKey(item.condition)!==receipt.state.conditionKey||item.pursuit?.id!==receipt.pursuitId)continue;
  if(!item.cue||item.cue.epoch<=receipt.state.epoch)item.cue=structuredClone(receipt.state);
  if(item.cue.trigger?.key===receipt.key&&item.cue.trigger.handledAt===undefined)item.cue.trigger.handledAt=minute;}
}
