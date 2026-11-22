import type {CityDraft, CitySpace} from './city-draft';
import type {OpeningDraft} from './opening-drafts';
import {reconcileOpeningStarts} from './opening-starts';
import {applySelectedRoomItems, itemKey, type RoomItemReview} from './opening-room-items';
import {walkPairKey} from './opening-road-network';

const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);

/** Preserve later changes and deletions. A proposal can replace an unchanged row or add a new one. */
function mergeRows<T>(original:readonly T[]=[], current:readonly T[]=[], proposal:readonly T[]=[], key:(value:T)=>string):T[]{
  if(same(original,current))return [...proposal];
  if(same(original,proposal))return [...current];
  const base=new Map(original.map(value=>[key(value),value]));
  const next=new Map(proposal.map(value=>[key(value),value]));
  const merged=new Map(current.map(value=>[key(value),value]));
  for(const [id,value] of base){
    if(!merged.has(id)||!same(merged.get(id),value))continue;
    if(next.has(id))merged.set(id,next.get(id)!);
    else merged.delete(id);
  }
  for(const [id,value] of next)if(!base.has(id)&&!merged.has(id))merged.set(id,value);
  return [...merged.values()];
}
export type OpeningRoadBaseline={walks:NonNullable<CityDraft['finalization']>['walks'];isolatedPlaceIds?:string[]};
export function roadBaseline(city:CityDraft):OpeningRoadBaseline {
  return {walks:city.finalization?.walks??[],isolatedPlaceIds:city.isolatedPlaceIds};
}
export function reconcileOpeningRoads(base:OpeningRoadBaseline, current:CityDraft, proposal:CityDraft):CityDraft {
  const walks=mergeRows(base.walks,current.finalization?.walks,proposal.finalization?.walks,walk=>walkPairKey(walk.places));
  const isolatedPlaceIds=mergeRows(base.isolatedPlaceIds,current.isolatedPlaceIds,proposal.isolatedPlaceIds,id=>id);
  return {...current,...(isolatedPlaceIds.length||current.isolatedPlaceIds||proposal.isolatedPlaceIds?{isolatedPlaceIds}:{}),
    finalization:{spaces:current.finalization?.spaces??[],walks}};
}

type Groups={roomItems?:RoomItemReview;receipts?:Partial<Record<'items'|'roads',string>>};
const byId=(value:{id:string})=>value.id;

export function reconcileOpeningProposal(original:CityDraft, current:OpeningDraft, proposal:CityDraft, groups:Groups):CityDraft {
  const latest=current.body.city;
  const rows=groups.roomItems?.rooms??[];
  // Item suggestions have their own selection and receipt. Merge everything else before applying them.
  const itemKeys=new Set(rows.flatMap(room=>room.suggestedIds.map(id=>itemKey(room.placeId,id))));
  const spaces:CitySpace[]=latest.places.flatMap(place=>{
    const space=(city:CityDraft)=>city.finalization?.spaces.find(row=>row.placeId===place.id);
    const base=space(original),live=space(latest),next=space(proposal);
    if(!base&&!live&&!next)return [];
    const outsideItemGroup=(item:{id:string})=>!itemKeys.has(itemKey(place.id,item.id));
    return [{placeId:place.id,
      rooms:mergeRows(base?.rooms,live?.rooms,next?.rooms,byId),
      objects:mergeRows(base?.objects.filter(outsideItemGroup),live?.objects,next?.objects.filter(outsideItemGroup),byId),
      connections:mergeRows(base?.connections,live?.connections,next?.connections,byId),
    }];
  });
  const characters=latest.characters.map(actor=>{
    const base=original.characters.find(person=>person.templateId===actor.templateId);
    const next=proposal.characters.find(person=>person.templateId===actor.templateId);
    if(!next||!base||base.version!==actor.version)return actor;
    // Keep the player's latest values field by field, including needs, energy and assignments.
    const result={...next};
    for(const field of Object.keys({...base,...actor}) as (keyof typeof actor)[]){
      if(!same(base[field],actor[field])){
        if(Object.hasOwn(actor,field))Object.assign(result,{[field]:actor[field]});
        else delete result[field];
      }
    }
    return result;
  });
  const roads=groups.receipts?.roads?latest:reconcileOpeningRoads(roadBaseline(original),latest,proposal);
  const city=reconcileOpeningStarts({...roads,characters,finalization:{spaces,walks:roads.finalization?.walks??[]},
    backgroundPeople:mergeRows(original.backgroundPeople,latest.backgroundPeople,proposal.backgroundPeople,byId),
    relationships:mergeRows(original.relationships,latest.relationships,proposal.relationships,r=>JSON.stringify([r.from,r.to,r.targetType])),
    accessGrants:mergeRows(original.accessGrants,latest.accessGrants,proposal.accessGrants,r=>JSON.stringify([r.placeId,r.roomId,r.characterTemplateId])),
  },latest);
  return groups.roomItems&&!groups.receipts?.items?applySelectedRoomItems({...current,body:{...current.body,city}},proposal,groups.roomItems):city;
}
