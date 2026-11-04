'use client';

import { Button } from '@/components/ui/button';
import type { CityDraft, CitySpace, CityWalk, FinalizedRoom } from '@/lib/city-draft';
import { stateChangeLimits } from '@/lib/adjudication-limits';

const newId = () => crypto.randomUUID().slice(0,24);

function RoomPicker({ rooms, label, value, onChange }: {
  rooms:FinalizedRoom[];label:string;value:string;onChange:(id:string)=>void;
}) {
  return <label>{label}<select aria-label={label} value={value} onChange={event=>onChange(event.target.value)}>
    <option value="">請選擇</option>
    {rooms.map(room=><option key={room.id} value={room.id}>{room.name}</option>)}
  </select></label>;
}

export default function CityFinalizationEditor({ draft, sourceRooms, names, onChange }: {
  draft:CityDraft;sourceRooms:Map<string,FinalizedRoom[]>;names:Map<string,string>;onChange:(draft:CityDraft)=>void;
}) {
  const finalization = draft.finalization ?? {spaces:[],walks:[]};
  function saveSpace(space:CitySpace, characters = draft.characters) {
    onChange({...draft,characters,finalization:{...finalization,spaces:[...finalization.spaces.filter(item=>item.placeId!==space.placeId),space]}});
  }
  function saveWalks(walks:CityWalk[]) {
    onChange({...draft,finalization:{...finalization,walks}});
  }
  function changeWalk(index:number, walk:CityWalk) {
    saveWalks(finalization.walks.map((item,i)=>i===index?walk:item));
  }

  return <>
    <h2>場所定稿</h2>
    <p>定稿補充只用於本次城市。可修改新房間、物件及連接，再重新預覽。</p>
    {draft.places.map(place=>{
      const space = finalization.spaces.find(item=>item.placeId===place.id) ?? {placeId:place.id,rooms:[],objects:[],connections:[]};
      const rooms = [...(sourceRooms.get(place.id)??[]),...space.rooms];
      return <fieldset key={place.id}>
        <legend>{place.name}的補充配置</legend>
        {space.rooms.map((room,index)=><div key={room.id} className="city-person">
          <label>房間 {index+1} 名稱<input aria-label={place.name+'房間 '+(index+1)+' 名稱'} value={room.name} maxLength={80}
            onChange={event=>saveSpace({...space,rooms:space.rooms.map(item=>item.id===room.id?{...item,name:event.target.value}:item)})}/></label>
          <label>私人使用者<select value={room.privateFor??''}
            onChange={event=>saveSpace({...space,rooms:space.rooms.map(item=>item.id===room.id?{...item,privateFor:event.target.value||undefined}:item)})}>
            <option value="">共用</option>
            {draft.characters.map(actor=><option key={actor.templateId} value={actor.templateId}>{names.get(actor.templateId)}</option>)}
          </select></label>
          <Button type="button" variant="outline" onClick={()=>saveSpace({...space,
            rooms:space.rooms.filter(item=>item.id!==room.id),
            objects:space.objects.filter(item=>item.roomId!==room.id),
            connections:space.connections.filter(item=>!item.rooms.includes(room.id)),
          },draft.characters.map(actor=>({...actor,
            ...(actor.placeId===place.id&&actor.roomId===room.id?{roomId:''}:{}),
            ...(actor.homeId===place.id&&actor.homeRoomId===room.id?{homeRoomId:undefined}:{}),
          })),room.id)}>移除補充房間</Button>
        </div>)}
        <Button type="button" variant="outline" disabled={space.rooms.length>=20}
          onClick={()=>saveSpace({...space,rooms:[...space.rooms,{id:newId(),name:'新房間'}]})}>新增房間</Button>
        {space.objects.map((object,index)=>{
          const change = (patch:Partial<typeof object>)=>saveSpace({...space,objects:space.objects.map(item=>item.id===object.id?{...item,...patch}:item)});
          return <div className="city-person" key={object.id}>
            <label>物件 {index+1} 名稱<input aria-label={place.name+'物件 '+(index+1)+' 名稱'} value={object.name} maxLength={80}
              onChange={event=>change({name:event.target.value})}/></label>
            <RoomPicker label={'物件 '+(index+1)+' 的房間'} rooms={rooms} value={object.roomId} onChange={roomId=>change({roomId})}/>
            {Object.entries(object.state).map(([key,value])=><label key={key}>{key}
              <input value={value} maxLength={stateChangeLimits.maxValueLength}
                onChange={event=>change({state:{...object.state,[key]:event.target.value}})}/>
            </label>)}
            <Button type="button" variant="outline" onClick={()=>saveSpace({...space,objects:space.objects.filter(item=>item.id!==object.id)})}>移除補充物件</Button>
          </div>;
        })}
        <Button type="button" variant="outline" disabled={!rooms.length||space.objects.length>=80}
          onClick={()=>saveSpace({...space,objects:[...space.objects,{id:newId(),name:'新物件',roomId:rooms[0].id,state:{}}]})}>新增文字物件</Button>
        {space.connections.map((connection,index)=>{
          const change = (patch:Partial<typeof connection>)=>saveSpace({...space,connections:space.connections.map(item=>item.id===connection.id?{...item,...patch}:item)});
          return <div className="city-person" key={connection.id}>
            <label>連接 {index+1} 名稱<input value={connection.name} maxLength={80} onChange={event=>change({name:event.target.value})}/></label>
            <RoomPicker label={'連接 '+(index+1)+' 起點'} rooms={rooms} value={connection.rooms[0]} onChange={room=>change({rooms:[room,connection.rooms[1]]})}/>
            <RoomPicker label={'連接 '+(index+1)+' 終點'} rooms={rooms} value={connection.rooms[1]} onChange={room=>change({rooms:[connection.rooms[0],room]})}/>
            <label>初始通行狀態<select value={connection.state} onChange={event=>change({state:event.target.value as typeof connection.state})}>
              <option value="open">開啟</option><option value="closed">關閉</option><option value="blocked">不通行</option>
            </select></label>
            <Button type="button" variant="outline" onClick={()=>saveSpace({...space,connections:space.connections.filter(item=>item.id!==connection.id)})}>移除補充連接</Button>
          </div>;
        })}
        <Button type="button" variant="outline" disabled={rooms.length<2||space.connections.length>=40}
          onClick={()=>saveSpace({...space,connections:[...space.connections,{id:newId(),name:'新通道',rooms:[rooms[0].id,rooms[1].id],state:'open'}]})}>新增房間連接</Button>
      </fieldset>;
    })}
    <h2>場所道路</h2>
    {finalization.walks.map((walk,index)=><div className="city-person" key={index}>
      {([0,1] as const).map(endpoint=><label key={endpoint}>道路 {index+1} {endpoint?'終點':'起點'}
        <select value={walk.places[endpoint]} onChange={event=>changeWalk(index,{...walk,
          places:endpoint?[walk.places[0],event.target.value]:[event.target.value,walk.places[1]],
        })}>
          {draft.places.map(place=><option key={place.id} value={place.id}>{place.name}</option>)}
        </select>
      </label>)}
      <label><input type="checkbox" checked={walk.minutes===null} onChange={event=>changeWalk(index,{...walk,minutes:event.target.checked?null:15})}/>不通行</label>
      {walk.minutes!==null && <label>步行分鐘<input type="number" min={1} max={180} value={walk.minutes}
        onChange={event=>changeWalk(index,{...walk,minutes:Number(event.target.value)})}/></label>}
      <Button type="button" variant="outline" onClick={()=>saveWalks(finalization.walks.filter((_,i)=>i!==index))}>移除道路</Button>
    </div>)}
    <Button type="button" variant="outline" disabled={draft.places.length<2||finalization.walks.length>=28}
      onClick={()=>saveWalks([...finalization.walks,{places:[draft.places[0].id,draft.places[1].id],minutes:15}])}>新增道路</Button>
  </>;
}
