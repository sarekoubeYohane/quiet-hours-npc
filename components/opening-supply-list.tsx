import type {CityDraft} from '@/lib/city-draft';
import type {CharacterCard} from '@/lib/character-cards';
import type {SceneTemplate} from '@/lib/scene-templates';
import {cityLocationId,cityRegionId} from '@/lib/world-configuration';

export function OpeningSupplyList({city,cards,scenes,update}:{city:CityDraft;cards:CharacterCard[];scenes:SceneTemplate[];update:(city:CityDraft)=>void}){
  const plan=city.resourcePlan??{supplies:[],furnishingGrants:[],unavailable:[]};
  const rooms=city.places.flatMap(place=>{
    const scene=scenes.find(scene=>scene.id===place.templateId&&scene.version===place.version);
    return [...scene?.rooms??[],...city.finalization?.spaces.find(space=>space.placeId===place.id)?.rooms??[]].map(room=>({
      id:cityRegionId(cityLocationId(place.id),room.id),name:place.name+'／'+room.name
    }));
  });
  const people=city.characters.map(actor=>({id:actor.templateId,name:cards.find(card=>card.id===actor.templateId)?.fields.name??actor.templateId}));
  const set=(supplies:typeof plan.supplies)=>update({...city,resourcePlan:{...plan,supplies}});
  const patch=(i:number,change:Partial<typeof plan.supplies[number]>)=>set(plan.supplies.map((item,index)=>index===i?{...item,...change}:item));
  return <>
    {!plan.supplies.length&&<p>尚未配置食物或飲水。</p>}
    {plan.supplies.map((item,i)=><fieldset key={i}><legend>物資 {i+1}</legend>
      <label>名稱<input value={item.label} maxLength={80} onChange={e=>patch(i,{label:e.target.value})}/></label>
      <label>類別<select value={item.kind} onChange={e=>patch(i,{kind:e.target.value as 'food'|'water'})}><option value="food">即食食物</option><option value="water">飲水</option></select></label>
      <label>所在房間<select value={item.region} onChange={e=>patch(i,{region:e.target.value})}>{rooms.map(room=><option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
      <label>份數<input type="number" min={1} max={100} value={item.portions} onChange={e=>patch(i,{portions:Math.min(100,Math.max(1,Number(e.target.value)))})}/></label>
      <label>物資負責者<select value={item.responsible} onChange={e=>patch(i,{responsible:e.target.value})}><option value="world">場所管理者</option>{people.map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
      <fieldset><legend>知道位置且可取用的人物</legend>{people.map(person=><label key={person.id}><input type="checkbox" checked={item.allowedTo.includes(person.id)} onChange={e=>patch(i,{allowedTo:e.target.checked?[...item.allowedTo,person.id]:item.allowedTo.filter(id=>id!==person.id)})}/>{person.name}</label>)}</fieldset>
      <p>{item.reason}</p><button onClick={()=>set(plan.supplies.filter((_,index)=>index!==i))}>移除這項物資</button>
    </fieldset>)}
    <button disabled={!rooms.length||!people.length||plan.supplies.length>=32} onClick={()=>set([...plan.supplies,{region:rooms[0].id,kind:'food',label:'即食餐點',portions:1,responsible:'world',allowedTo:[people[0].id],reason:'玩家指定的開局物資'}])}>手動新增物資</button>
    {plan.furnishingGrants.map(grant=><p key={grant.objectId}>{grant.reason}</p>)}
    {plan.unavailable.map((reason,index)=><p key={index}>未能配置：{reason}</p>)}
  </>;
}
