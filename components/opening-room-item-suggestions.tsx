'use client';
import {useState} from 'react';
import type {CityDraft} from '@/lib/city-draft';
import type {SceneTemplate} from '@/lib/scene-templates';
import {currentRoomItemReview,itemKey, suggestedRoomItems, type RoomItemReview} from '@/lib/opening-room-items';

type Props={
  city:CityDraft;
  review:RoomItemReview;
  latest?:{city:CityDraft;scenes:SceneTemplate[]};
  adopted:boolean;
  disabled:boolean;
  onSubmit:(action:'selectItems'|'adoptItems',excluded:string[])=>Promise<boolean>;
};
export default function OpeningRoomItemSuggestions({city,review,latest,adopted,disabled,onSubmit}:Props){
  const [excluded,setExcluded]=useState(review.excludedItems);
  const [unsaved,setUnsaved]=useState(false);
  const visible=adopted?review:currentRoomItemReview(city,review,latest);
  const rows=visible.rooms.map(room=>{
    const items=suggestedRoomItems(city,room);
    const selected=items.filter(item=>!excluded.includes(itemKey(room.placeId,item.id))).length;
    return {room,items,selected};
  });
  const selected=rows.reduce((count,row)=>count+row.selected,0);
  async function select(next:string[]){
    setExcluded(next);
    setUnsaved(!await onSubmit('selectItems',next));
  }
  return <section aria-label="逐房物品建議">
    <h4>逐房物品建議</h4>
    {rows.map(({room,items,selected})=><details key={itemKey(room.placeId,room.roomId)}>
      <summary>{room.placeName}・{room.roomName}｜沿用 {room.existing.length} 件，{!room.checked?'尚未核對':items.length===0?'已齊備，新增 0 件':'本輪新增 '+items.length+' 件'}，選取 {selected} 件</summary>
      {room.existing.length>0&&<p>沿用物品：{room.existing.map(item=>item.name).join('、')}</p>}
      {items.map(item=>{
        const key=itemKey(room.placeId,item.id);
        return <label key={key} style={{display:'block'}}>
          <input type="checkbox" checked={!excluded.includes(key)} disabled={adopted||disabled}
            onChange={event=>void select(event.target.checked?excluded.filter(value=>value!==key):[...excluded,key])}/>{item.name}
        </label>;
      })}
    </details>)}
    {adopted?<p role="status">已採納所選物品{review.adoptedItemKeys?'（'+review.adoptedItemKeys.length+' 件）':''}</p>:<>
      {unsaved&&<button type="button" disabled={disabled} onClick={()=>void select(excluded)}>重試保存物品選擇</button>}
      <button type="button" disabled={disabled||!selected} onClick={()=>void onSubmit('adoptItems',excluded)}>採納所選物品（{selected} 件）</button>
    </>}
  </section>;
}
