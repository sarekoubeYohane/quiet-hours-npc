'use client';
import type {CityDraft, CityWalk} from '@/lib/city-draft';
import {openingRoadNetwork,walkPairKey} from '@/lib/opening-road-network';

export function OpeningRoads({city,update,preview=false,disabled=false}:{
 city:CityDraft; update:(city:CityDraft)=>void; preview?:boolean; disabled?:boolean
}){
 const walks=city.finalization?.walks??[], isolated=city.isolatedPlaceIds??[];
 const set=(next:CityWalk[])=>update({...city,finalization:{spaces:city.finalization?.spaces??[],walks:next}});
 const updateWalk=(index:number,row:CityWalk)=>set(walks.map((walk,i)=>i===index?row:walk));
 const used=new Set(walks.map(walk=>walkPairKey(walk.places)));
 const {groups}=openingRoadNetwork(city);
 const firstMissingPair=():[string,string]|undefined=>{
  const ids=groups.flat();
  for(const a of ids){
   for(const b of ids){
    if(a!==b&&!used.has(walkPairKey([a,b]))) return [a,b];
   }
  }
 };
 const newPair=firstMissingPair();
 const editor=<fieldset disabled={disabled}><legend>道路與隔離</legend>
  {city.places.length>1&&<fieldset><legend>刻意隔離的場所</legend>{city.places.map(place=><label key={place.id}>
   <input type="checkbox" checked={isolated.includes(place.id)} onChange={e=>update({...city,isolatedPlaceIds:e.target.checked?[...isolated,place.id]:isolated.filter(id=>id!==place.id)})}/>明示隔離 {place.name}
  </label>)}</fieldset>}
  {walks.map((walk,i)=><fieldset key={i} id={'opening-road-'+i}><legend>道路 {i+1}</legend>
   {([0,1] as const).map(side=><label key={side}>{side===0?'起點':'終點'}
    <select aria-label={'道路 '+(i+1)+(side===0?' 起點':' 終點')} value={walk.places[side]} onChange={e=>{
     const endpoints:[string,string]=[...walk.places];endpoints[side]=e.target.value;updateWalk(i,{...walk,places:endpoints});
    }}>{city.places.map(place=><option key={place.id} value={place.id}>{place.name}</option>)}</select>
   </label>)}
   <label>步行分鐘（留空表示不能步行）<input aria-label={'道路 '+(i+1)+' 步行分鐘'} type="number" min={1} max={180} step={1} value={walk.minutes??''}
    onChange={e=>updateWalk(i,{...walk,minutes:e.target.value===''?null:Number(e.target.value)})}/></label>
   <button type="button" aria-label={'移除道路 '+(i+1)} onClick={()=>set(walks.filter((_,index)=>index!==i))}>移除道路</button>
  </fieldset>)}
  <button type="button" disabled={!newPair} onClick={()=>newPair&&set([...walks,{places:newPair,minutes:5}])}>新增道路</button>
 </fieldset>;
 return preview?editor:<details><summary>可選：跨場所道路</summary>{editor}</details>;
}
