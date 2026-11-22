import {z} from 'zod';
import {requestModel,type ModelService} from './model-adapter';
import type {CityDraft} from './city-draft';
import {cityWalkSchema} from './city-finalization';
import {openingRoadNetwork,walkPairKey} from './opening-road-network';

const repairSchema=z.object({walks:z.array(cityWalkSchema).max(28)}).strict();
const outputSchema={
 type:'object',additionalProperties:false,required:['walks'],properties:{
  walks:{type:'array',maxItems:28,items:{type:'object',additionalProperties:false,required:['places','minutes'],properties:{
   places:{type:'array',minItems:2,maxItems:2,items:{type:'string'}},
   minutes:{type:'integer',minimum:1,maximum:180},
  }}},
 },
};

export async function repairOpeningRoads(city:CityDraft,service:ModelService,options:Parameters<typeof requestModel>[3]){
 const {groups}=openingRoadNetwork(city);
 const walks=[...(city.finalization?.walks??[])];
 const input={task:'opening-road-repair-v1',places:city.places.map(({id,name})=>({id,name})),walks,
  isolatedPlaceIds:city.isolatedPlaceIds??[],groups};
 const raw=await requestModel(service,[
  {role:'system',content:'只建議讓不同分組之間可分段互達的最少跨場所步行道路。保留既有每一路段，不連往明示隔離的場所。使用提供的場所實例 ID 及 1 至 180 的步行分鐘，只回覆新增道路。'},
  {role:'user',content:JSON.stringify(input)},
 ],outputSchema,{...options,maxOutputTokens:2048});
 const proposed=repairSchema.parse(JSON.parse(raw));
 // Recheck after each accepted bridge: two suggestions can close the same gap.
 const occupied=new Set(walks.map(walk=>walkPairKey(walk.places)));
 const components=groups.map(group=>new Set(group));
 for(const walk of proposed.walks){
  const [a,b]=walk.places;
  const first=components.find(group=>group.has(a));
  const second=components.find(group=>group.has(b));
  if(!walk.minutes||!first||!second||first===second||occupied.has(walkPairKey(walk.places)))continue;
  walks.push(walk);
  for(const id of second)first.add(id);
  components.splice(components.indexOf(second),1);
 }
 return {...city,finalization:{spaces:city.finalization?.spaces??[],walks}};
}
