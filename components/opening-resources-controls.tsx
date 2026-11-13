'use client';

import { useState } from 'react';
import type { World } from '@/lib/world';
import { worldRegions } from '@/lib/world-configuration';
import { Button } from './ui/button';

export default function OpeningResourcesControls({world,disabled,onPrepare}:{world:World;disabled:boolean;onPrepare:(request:string)=>Promise<boolean>}){
  const [request,setRequest]=useState('依各場所用途與負責者，備妥可直接飲用的水、即食餐點，並確認住戶的床與工作場所休息座位的使用權。讓角色知道自己可取用的物資位置。');
  if(!world.configuration)return null;
  const names=(ids:string[])=>ids.map(id=>world.characters.find(actor=>actor.id===id)?.name||id).join('、');
  const roomName=(id:string)=>{const room=worldRegions(world).find(room=>room.id===id);return [world.configuration!.locations.find(place=>place.id===room?.location)?.name,room?.name||id].filter(Boolean).join('／');};
  return <section aria-label="開局日常物資">
    <h3>開局日常物資</h3>
    {world.openingResources?<>
      <p>天上意志已確認開局物資；物資為有限存量，取用會扣除。準備時沒有推進時間或指定人物行動。</p>
      <ul>{world.openingResources.supplies.map(receipt=>{const item=world.supplies?.find(supply=>supply.id===receipt.id);return <li key={receipt.id}>{item?<><strong>{item.label}</strong>：{roomName(item.region)}，剩餘 {item.remaining} 份。知道位置：{names(item.knownTo)}；允許自行取用：{names(item.allowedTo)}。{receipt.reason}</>:<>供應已不存在。{receipt.reason}</>}</li>;})}
      {world.openingResources.furnishingGrants.map(grant=>{const item=world.objects?.find(object=>object.id===grant.objectId);return <li key={grant.objectId}>{item?.label||grant.objectId}：{item&&roomName(item.region)}；允許使用：{names(grant.allowedTo)}。{grant.reason}</li>;})}</ul>
      {!!world.openingResources.unavailable.length&&<><h4>未能配置</h4><ul>{world.openingResources.unavailable.map((reason,index)=><li key={index}>{reason}</li>)}</ul></>}
    </>:world.turn===0&&!world.acceptance?<>
      <p>由天上意志依場所用途、負責者及通行權確認實際可取用的飲水、食物與陳設使用權。會使用已設定的裁定模型與預算，完成後維持第 0 回合。</p>
      <label>物資需求<textarea value={request} maxLength={1600} disabled={disabled} onChange={event=>setRequest(event.target.value)} rows={4}/></label>
      <Button disabled={disabled} onClick={()=>void onPrepare(request)}>由天上意志準備日常物資</Button>
    </>:<p>開局備料只適用第 0 回合。已開始生活的世界由人物依現況提案與裁定。</p>}
  </section>;
}
