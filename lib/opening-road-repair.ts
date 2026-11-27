import {z} from 'zod';
import {requestModel,type ModelService} from './model-adapter';
import type {ModelTaskContent} from './model-task';
import {askDirectly,judgeBy} from './model-task-replies';
import type {CityDraft} from './city-draft';
import {cityWalkSchema} from './city-finalization';
import type {OpeningDraft} from './opening-drafts';
import {reconcileOpeningRoads,roadBaseline} from './opening-proposal-adoption';
import {openingRoadNetwork,walkPairKey,withOpeningRoads} from './opening-road-network';

const repairSchema=z.object({walks:z.array(cityWalkSchema).max(28)}).strict();
const outputSchema={
 type:'object',additionalProperties:false,required:['walks'],properties:{
  walks:{type:'array',maxItems:28,items:{type:'object',additionalProperties:false,required:['places','minutes'],properties:{
   places:{type:'array',minItems:2,maxItems:2,items:{type:'string'}},
   minutes:{type:'integer',minimum:1,maximum:180},
  }}},
 },
};

// Freeze the new road baseline while retaining the original baseline for other pending groups.
export function openingRepairSnapshot(original:OpeningDraft,latest:OpeningDraft):OpeningDraft {
 const city={...withOpeningRoads(original.body.city,latest.body.city),places:latest.body.city.places};
 return {...original,version:latest.version,body:{...original.body,city},sources:{...original.sources,scenes:latest.sources.scenes}};
}

export function openingRepairSource(original:OpeningDraft,latest:OpeningDraft,proposal:CityDraft):CityDraft {
 const roads=reconcileOpeningRoads(roadBaseline(original.body.city),latest.body.city,proposal);
 return {...withOpeningRoads(proposal,roads),places:roads.places};
}

/** 「補路建議」這項模型任務的內容：訊息、回覆契約、輸出上限與對回覆的判定。 */
export function openingRoadRepairTask(city:CityDraft):ModelTaskContent<CityDraft> {
 const {groups}=openingRoadNetwork(city);
 const existing=city.finalization?.walks??[];
 const input={task:'opening-road-repair-v1',places:city.places.map(({id,name})=>({id,name})),walks:[...existing],
  isolatedPlaceIds:city.isolatedPlaceIds??[],groups};
 return {messages:[
  {role:'system',content:'只建議讓不同分組之間可分段互達的最少跨場所步行道路。保留既有每一路段，不連往明示隔離的場所。使用提供的場所實例 ID 及 1 至 180 的步行分鐘，只回覆新增道路。'},
  {role:'user',content:JSON.stringify(input)},
 ],contract:outputSchema,maxOutputTokens:2048,judge:judgeBy(raw=>{
 const proposed=repairSchema.parse(JSON.parse(raw));
 const walks=[...existing];
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
 })};
}
/** 不經模型任務 module、直接呼叫模型傳輸的舊入口；只剩量測腳本使用（#411 第 5 段收尾）。 */
export const repairOpeningRoads=(city:CityDraft,service:ModelService,options:Parameters<typeof requestModel>[3])=>askDirectly(openingRoadRepairTask(city),service,options);
