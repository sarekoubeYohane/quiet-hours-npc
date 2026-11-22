'use client';
import {useLayoutEffect, useRef, useState} from 'react';
import type {CharacterCard} from '@/lib/character-cards';
import type {CityDraft, CitySpace, FinalizedConnection, FinalizedObject} from '@/lib/city-draft';
import type {SceneTemplate} from '@/lib/scene-templates';

const doorStates = {open:'開啟', closed:'關閉', blocked:'阻塞'};

export type RoomEditTarget = {placeId:string; roomId:string; objectId?:string};
type Props = {
  city:CityDraft;
  cards:CharacterCard[];
  scenes:SceneTemplate[];
  update:(city:CityDraft)=>void;
  onNavigate?:()=>void;
  initialTarget?:RoomEditTarget;
};

export function OpeningRoomEditor({city, cards, scenes, update, onNavigate, initialTarget}:Props) {
  const [selection, setSelection] = useState(initialTarget);
  const pendingFocus = useRef(initialTarget && (initialTarget.objectId ? 'object:'+initialTarget.objectId : 'room:'+initialTarget.roomId));
  const panel = useRef<HTMLElement>(null);
  const place = city.places.find(value => value.id === selection?.placeId) ?? city.places[0];
  const source = scenes.find(scene => scene.id === place?.templateId && scene.version === place?.version);
  const spaces = city.finalization?.spaces ?? [];
  const saved = spaces.find(value => value.placeId === place?.id);
  const space:CitySpace = saved ?? {placeId:place?.id ?? '', rooms:[], objects:[], connections:[]};
  const rooms = [...source?.rooms ?? [], ...space.rooms];
  const room = rooms.find(candidate => candidate.id === selection?.roomId && selection.placeId === place?.id) ?? rooms[0];

  useLayoutEffect(() => {
    if (!pendingFocus.current) return;
    const target = Array.from(panel.current?.querySelectorAll<HTMLElement>('[data-room-focus]') ?? [])
      .find(field => field.dataset.roomFocus === pendingFocus.current);
    if (target) {
      target.focus();
      if (target instanceof HTMLInputElement) target.select();
    }
    pendingFocus.current = undefined;
  });

  if (!place) return null;
  function patchSpace(patch:Partial<CitySpace>) {
    const next = {...space, ...patch};
    update({...city, finalization:{walks:[], ...city.finalization,
      spaces:saved ? spaces.map(value => value === saved ? next : value) : [...spaces, next]
    }});
  }
  const addRoom = () => {
    const id = 'room-' + crypto.randomUUID().slice(0, 8);
    pendingFocus.current = 'room:'+id;
    setSelection({placeId:place.id, roomId:id});
    patchSpace({rooms:[...space.rooms, {id, name:'新房間'}]});
  };
  const addObject = () => {
    const id = 'object-' + crypto.randomUUID().slice(0, 8);
    pendingFocus.current = 'object:'+id;
    patchSpace({objects:[...space.objects, {id, roomId:room.id, name:'新物件', state:{狀態:'良好'}}]});
  };
  const updateObject = (id:string, patch:Partial<FinalizedObject>) =>
    patchSpace({objects:space.objects.map(value => value.id === id ? {...value, ...patch} : value)});
  const doors = [...source?.connections ?? [], ...space.connections].filter(door => room && door.rooms.includes(room.id));
  const destinations = (doorId?:string) => rooms.filter(other => other.id !== room.id &&
    !doors.some(door => door.id !== doorId && door.rooms.includes(other.id)));
  function addDoor() {
    const other = destinations()[0];
    if (!other) return;
    const id = 'door-' + crypto.randomUUID().slice(0, 8);
    pendingFocus.current = 'door:'+id;
    patchSpace({connections:[...space.connections, {id, name:'新門', rooms:[room.id, other.id], state:'closed'}]});
  }
  const updateDoor = (id:string, patch:Partial<FinalizedConnection>) =>
    patchSpace({connections:space.connections.map(door => door.id === id ? {...door, ...patch} : door)});

  const objects = [...source?.objects ?? [], ...space.objects];
  const customRoom = space.rooms.find(value => value.id === room?.id);
  const roomUsed = customRoom && (objects.some(object => object.roomId === room.id)
    || space.connections.some(door => door.rooms.includes(room.id))
    || city.characters.some(actor => actor.placeId === place.id && actor.roomId === room.id || actor.homeId === place.id && actor.homeRoomId === room.id)
    || city.accessGrants?.some(grant => grant.placeId === place.id && grant.roomId === room.id));
  const switchTo = (placeId:string, roomId:string) => {
    setSelection({placeId, roomId});
    onNavigate?.();
  };

  return <section ref={panel} aria-label="房間與物件" className="opening-room-editor">
    <div className="opening-actions">
      <label>編輯場所<select aria-label="編輯場所" value={place.id} onChange={event => switchTo(event.target.value, '')}>
        {city.places.map((value, index) => <option key={value.id} value={value.id}>{value.name}{city.places.some(other => other.id !== value.id && other.name === value.name) ? '（場所 '+(index+1)+'）' : ''}</option>)}
      </select></label>
      <button onClick={addRoom}>在 {place.name} 新增房間</button>
    </div>
    <nav className="opening-actions" aria-label={place.name+'的房間'}>
      {rooms.map(value => <button key={value.id} aria-pressed={value.id === room?.id}
        onClick={() => switchTo(place.id, value.id)}>{value.name}（{objects.filter(object => object.roomId === value.id).length} 件物件）</button>)}
    </nav>
    {space.objects.filter(item => !rooms.some(value => value.id === item.roomId)).map(item =>
      <label key={item.id}>{item.name}的所在房間需重新指定
        <select value="" onChange={event => updateObject(item.id, {roomId:event.target.value})}>
          <option value="">請選擇</option>{rooms.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}
        </select>
      </label>
    )}
    {space.connections.filter(door => !rooms.some(value => door.rooms.includes(value.id))).map(door =>
      <fieldset key={door.id}><legend>{door.name}的連接房間需重新指定</legend>
        <label>連接起端<select value="" onChange={event => updateDoor(door.id, {rooms:[event.target.value, door.rooms[1]]})}>
          <option value="">請選擇</option>{rooms.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}
        </select></label>
        <button onClick={() => patchSpace({connections:space.connections.filter(value => value.id !== door.id)})}>移除{door.name}</button>
      </fieldset>
    )}

    {room && <section aria-label={place.name+'・'+room.name}>
      <h4 tabIndex={-1} data-room-focus={customRoom ? undefined : 'room:'+room.id}>{place.name}・{room.name}</h4>
      {customRoom && <fieldset><legend>房間設定</legend>
        <label>房間名稱<input aria-label="房間名稱" data-room-focus={'room:'+room.id} maxLength={80} value={room.name}
          onChange={event => patchSpace({rooms:space.rooms.map(value => value.id === room.id ? {...value, name:event.target.value} : value)})}/></label>
        <label>私人房間使用者<select value={customRoom.privateFor ?? ''}
          onChange={event => patchSpace({rooms:space.rooms.map(value => value.id === room.id ? {...value, privateFor:event.target.value || undefined} : value)})}>
          <option value="">共用房間</option>{city.characters.map(actor => <option key={actor.templateId} value={actor.templateId}>{cards.find(card => card.id === actor.templateId)?.fields.name ?? '人物'}</option>)}
        </select></label>
        <button disabled={!!roomUsed} onClick={() => patchSpace({rooms:space.rooms.filter(value => value.id !== room.id)})}>移除房間</button>
        {roomUsed && <p>請先移動或移除這間房的物件、門與人物安排，才能移除房間。</p>}
      </fieldset>}
      <h5>房門</h5>
      {doors.map(door => {
        const otherId = door.rooms[0] === room.id ? door.rooms[1] : door.rooms[0];
        const otherName = rooms.find(value => value.id === otherId)?.name ?? '未指定';
        const summary = door.name+' · 通往'+otherName+' · '+doorStates[door.state ?? 'open'];
        if (!space.connections.some(value => value.id === door.id)) return <p key={door.id}>{summary}（場景既有）</p>;
        return <fieldset key={door.id}>
          <legend>{summary}</legend>
          <label>門名稱<input aria-label="門名稱" data-room-focus={'door:'+door.id} maxLength={80} value={door.name}
            onChange={event => updateDoor(door.id, {name:event.target.value})}/></label>
          <label>從{room.name}連到<select aria-label="門的另一端" value={otherId}
            onChange={event => updateDoor(door.id, {rooms:door.rooms[0] === room.id ? [room.id, event.target.value] : [event.target.value, room.id]})}>
            {destinations(door.id).map(value => <option key={value.id} value={value.id}>{value.name}</option>)}
          </select></label>
          <label>門狀態<select aria-label="門狀態" value={door.state}
            onChange={event => updateDoor(door.id, {state:event.target.value as FinalizedConnection['state']})}>
            {Object.entries(doorStates).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          <button onClick={() => patchSpace({connections:space.connections.filter(value => value.id !== door.id)})}>移除{door.name}</button>
        </fieldset>;
      })}
      <button disabled={!destinations().length} onClick={addDoor}>連接房間</button>

      <h5>物件</h5>
      {source?.objects.filter(item => item.roomId === room.id).map(item => <details key={item.id}><summary data-room-focus={'object:'+item.id}>{item.name}（場景既有）</summary>
        <p>{item.hidden ? '開局不公開' : '公開'} · {Object.entries(item.state).map(([name,value]) => name+'：'+value).join('、') || '未指定狀態'}</p>
      </details>)}
      {space.objects.filter(item => item.roomId === room.id).map(item => <fieldset key={item.id}>
        <legend>{item.name || '物件'}</legend>
        <label>物件名稱<input aria-label="物件名稱" data-room-focus={'object:'+item.id} maxLength={80} value={item.name}
          onChange={event => updateObject(item.id, {name:event.target.value})}/></label>
        <details><summary>{item.name || '物件'}的詳情</summary>
          <label>所在房間<select value={item.roomId} onChange={event => updateObject(item.id, {roomId:event.target.value})}>
            {rooms.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}
          </select></label>
          <label><input type="checkbox" checked={item.hidden ?? false} onChange={event => updateObject(item.id, {hidden:event.target.checked})}/>開局不公開此物件</label>
          {Object.entries(item.state).map(([key, value]) => <div key={key}>
            <label>{key}<input value={value} onChange={event => updateObject(item.id, {state:{...item.state, [key]:event.target.value}})}/></label>
            <button onClick={() => updateObject(item.id, {state:Object.fromEntries(Object.entries(item.state).filter(([name]) => name !== key))})}>移除狀態 {key}</button>
          </div>)}
          <button onClick={() => {
            let index = 1;
            while (Object.hasOwn(item.state, '狀態'+index)) index++;
            updateObject(item.id, {state:{...item.state, ['狀態'+index]:'未指定'}});
          }}>新增物件狀態</button>
          <button onClick={() => patchSpace({objects:space.objects.filter(object => object.id !== item.id)})}>移除 {item.name || '物件'}</button>
        </details>
      </fieldset>)}
      <button onClick={addObject}>＋新增物件</button>
    </section>}
  </section>;
}
