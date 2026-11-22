'use client';
import {useRef,useState} from 'react';
import type {CityDraft, CityPreview} from '@/lib/city-draft';
import type {CharacterCard} from '@/lib/character-cards';
import type {World} from '@/lib/world';
import {openingRoadNetwork} from '@/lib/opening-road-network';
import {entryRuleLabels, type EntryPreview} from '@/lib/entry-rules';
import {OpeningCardDetails, OpeningPortrait} from './opening-character-cards';

export type ReviewTarget =
  | {kind:'actor'; actorId:string}
  | {kind:'room'; placeId:string; roomId:string; objectId?:string}
  | {kind:'road'|'relation'; index:number};
export type ReviewBookmark = {target:ReviewTarget; expanded:string[]; tab:'能力'|'身體需求'; top:number};

export function focusReviewEditor(target:ReviewTarget) {
  const stage = document.querySelector('.opening-stage');
  let field:HTMLElement | null | undefined;
  if (target.kind === 'actor') field = document.getElementById('opening-start-place-'+target.actorId);
  else if (target.kind === 'room') {
    const key = target.objectId ? 'object:'+target.objectId : 'room:'+target.roomId;
    field = Array.from(stage?.querySelectorAll<HTMLElement>('[data-room-focus]') ?? []).find(node => node.dataset.roomFocus === key);
  } else field = stage?.querySelector<HTMLElement>('#opening-'+target.kind+'-'+target.index+' select');
  if (!field) return;
  for (let p = field.parentElement; p; p = p.parentElement) if (p.tagName === 'DETAILS') (p as HTMLDetailsElement).open = true;
  field.focus();
  field.scrollIntoView({block:'center'});
}

export function restoreReviewPosition(bookmark:ReviewBookmark) {
  const target = JSON.stringify(bookmark.target);
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-review-action]')).find(node=>node.dataset.reviewAction === target);
  if (!button) {document.getElementById('opening-stage-title')?.focus(); return;}
  button.focus({preventScroll:true});
  window.scrollBy(0, button.getBoundingClientRect().top-bookmark.top);
}


type Props = {name:string; description:string; city:CityDraft; preview?:CityPreview; world?:World; cards:CharacterCard[]; bookmark?:ReviewBookmark; onEdit:(bookmark:ReviewBookmark)=>void};

export function OpeningReview({name, description, city, preview, world, cards, bookmark, onEdit}:Props) {
  const panel = useRef<HTMLElement>(null);
  const [tab, setTab] = useState<'能力'|'身體需求'>(bookmark?.tab ?? '能力');
  const details = (id:string) => ({'data-review-panel':id, open:bookmark?.expanded.includes(id)});
  function editButton(target:ReviewTarget, label:string) {
    return <button type="button" data-review-action={JSON.stringify(target)} onClick={event => onEdit({
      target, tab, top:event.currentTarget.getBoundingClientRect().top,
      expanded:Array.from(panel.current?.querySelectorAll<HTMLDetailsElement>('details[open]') ?? []).map(node => node.dataset.reviewPanel ?? ''),
    })}>{label}</button>;
  }

  const placeName = (id:string) => {
    const index = city.places.findIndex(place => place.id === id);
    const place = city.places[index];
    if (!place) return '未指定場所';
    return city.places.some(other => other.id !== id && other.name === place.name)
      ? place.name+'（場所 '+(index+1)+'）' : place.name;
  };
  const personName = (id:string) => preview?.characters.find(person=>person.templateId===id)?.name
    ?? city.backgroundPeople?.find(person=>person.id===id)?.name ?? '尚未指定';
  const walks = city.finalization?.walks ?? [];

  const starts = new Map<string,{label:string;names:string[]}>();
  for (const actor of preview?.characters ?? []) {
    const selected = city.characters.find(person => person.templateId === actor.templateId);
    const key = JSON.stringify([selected?.placeId || actor.place, selected?.roomId || actor.room]);
    const group = starts.get(key) ?? {label:(selected?.placeId ? placeName(selected.placeId) : actor.place)+'・'+actor.room, names:[]};
    group.names.push(actor.name);
    starts.set(key, group);
  }
  const network = openingRoadNetwork(city);
  const isolation = (city.isolatedPlaceIds ?? []).map(placeName);
  const exceptions = (preview?.access ?? []).filter(entry =>
    (!entry.inherited && (entry.rule !== 'public' || !!entry.roomId))
    || city.accessGrants?.some(grant => grant.placeId === entry.placeId && grant.roomId === entry.roomId));
  const regular = (preview?.access ?? []).filter(entry => !exceptions.includes(entry));
  const accessRow = (entry:EntryPreview) => {
    const room = preview?.places.find(place => place.id === entry.placeId)?.rooms.find(room => room.id === entry.roomId);
    return <li key={JSON.stringify([entry.placeId,entry.roomId])}>{placeName(entry.placeId)}・{room?.name ?? '整棟'} · {entryRuleLabels[entry.rule]}
      {entry.inherited && '（沿用建築）'} · {entry.allowed.map(person => person.name).join('、') || '目前無人可進入'}</li>;
  };
  return <section ref={panel} aria-label="核對開局內容" className="opening-review">
    <section aria-label="開局摘要" className="journey-note">
      <h3>{name}</h3>
      <ul>{[...starts.entries()].map(([key, group]) => <li key={key}>{group.names.length > 1 ? group.names.length+' 人同在'+group.label+'：'+group.names.join('、') : group.names[0]+'：'+group.label}</li>)}</ul>
      <p>{network.groups.length > 1 ? '未連通的場所分組' : '可達場所'}：{network.groups.map(group => group.map(placeName).join('、')).join(' ／ ') || '無'}</p>
      <p>刻意隔離：{isolation.join('、') || '無'}</p>
      {description && <p>{description}</p>}
    </section>
    {!preview && <p role="status">正在核對已保存的草稿。</p>}
    {!!preview?.issues.length && <div role="alert"><h3>建立前需修正</h3><ul>{preview.issues.map((issue,i)=><li key={i}>{issue}</li>)}</ul></div>}
    {preview && <>
      <h3>人物與起點</h3>
      <div className="opening-grid">{preview.characters.map(person => {
        const selected = city.characters.find(value => value.templateId === person.templateId);
        const card = cards.find(value => value.id === person.templateId && value.version === selected?.version);
        const actual = world?.characters.find(value => value.profileSource?.id === person.templateId);
        return <article className="opening-option" key={person.templateId}>
          {card && <OpeningPortrait card={card}/>}<h4>{person.name}</h4>
          <p>起點：{selected?.placeId ? placeName(selected.placeId) : person.place}・{person.room}</p>
          {editButton({kind:'actor',actorId:person.templateId},'修改'+person.name+'起點')}
          <details {...details('actor:'+person.templateId)}><summary>能力、需求與初值</summary>
            {card && <OpeningCardDetails card={card} actor={selected} tab={tab} onTab={setTab}/>}
            <p>{actual?.profile?.background}</p>
            <p>住處：{person.home || '未指定'}；臥室：{person.bedroom || '未指定'}；工作場所：{person.workplaces?.join('、') || '未指定'}；所有場所：{person.ownedPlaces?.join('、') || '未指定'}</p>
            {actual?.needs?.personal && <p>需求特性：飢餓 {actual.needs.personal.traits.hunger}／口渴 {actual.needs.personal.traits.thirst}／睡眠 {actual.needs.personal.traits.sleep}</p>}
            {card && <p>來源：{card.fields.name}（版本 {card.version}）</p>}
          </details>
        </article>;
      })}</div>
      {world?.openingResources&&<section aria-label="開局物資"><h3>開局物資</h3>
        <ul>{world.supplies?.map(item=><li key={item.id}>{world.configuration?.regions.find(room=>room.id===item.region)?.name} · {item.label} {item.remaining} 份</li>)}</ul>
      </section>}
      <h3>場所與房間</h3>
      {preview.places.map(place => <section key={place.id}>
        <h4>{placeName(place.id)}</h4>
        {place.rooms.map(room => {
          const items = place.objects.filter(item => item.roomId === room.id);
          const doors = place.connections.filter(door => door.rooms.includes(room.id));
          return <details key={room.id} {...details(JSON.stringify([place.id,room.id]))}><summary>{room.name}（{items.length} 件物件、{doors.length} 扇門）</summary>
            {editButton({kind:'room',placeId:place.id,roomId:room.id},'編輯'+placeName(place.id)+'・'+room.name)}
            <ul>{items.map(item => {
              const editable = city.finalization?.spaces.find(space => space.placeId === place.id)?.objects.some(value => value.id === item.id);
              return <li key={item.id}>{editButton({kind:'room',placeId:place.id,roomId:room.id,objectId:item.id},
                (editable ? '修改' : '查看')+placeName(place.id)+'・'+room.name+'的'+item.name)}</li>;
            })}</ul>
            {doors.map(door => <p key={door.id}>{door.name} · 通往{place.rooms.find(other => other.id !== room.id && door.rooms.includes(other.id))?.name} · {{open:'開啟',closed:'關閉',blocked:'阻塞'}[door.state]}</p>)}
          </details>;
        })}
        <details {...details('source:'+place.id)}><summary>場景來源</summary>{place.templateName}（版本 {city.places.find(value => value.id === place.id)?.version}）</details>
      </section>)}
      <section aria-label="跨場所道路"><h3>跨場所道路</h3>
        {walks.length ? walks.map((walk,index) => <p key={index}>{walk.places.map(placeName).join(' ↔ ')} · {walk.minutes === null ? '不可步行' : walk.minutes+' 分鐘'} {editButton({kind:'road',index},'修改道路 '+(index+1))}</p>) : <p>未安排道路</p>}
      </section>
      <section aria-label="權限例外"><h3>權限例外</h3>
        {exceptions.length ? <ul>{exceptions.map(accessRow)}</ul> : <p>沒有個別例外</p>}
        {!!regular.length && <details {...details('access')}><summary>一般進出權限</summary><ul>{regular.map(accessRow)}</ul></details>}
      </section>
      <details {...details('relationships')}><summary>人物關係（{city.relationships?.length ?? 0}）</summary>
        {city.relationships?.map((relation,index) => <p key={index}>{personName(relation.from)} → {personName(relation.to)}：{relation.description} {editButton({kind:'relation',index},'修改關係 '+(index+1))}</p>)}
      </details>
    </>}
  </section>;
}
