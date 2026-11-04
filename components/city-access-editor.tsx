'use client';

import { useState } from 'react';
import type { CityDraft, CityPreview } from '@/lib/city-draft';
import type { SceneTemplate } from '@/lib/scene-templates';
import { entryRuleLabels, maxEntryGrants } from '@/lib/entry-rules';

export function CityAccessEditor({ draft, scenes, names, onChange }: {
  draft: CityDraft;
  scenes: SceneTemplate[];
  names: Map<string, string>;
  onChange: (draft: CityDraft) => void;
}) {
  const [placeId, setPlaceId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [characterTemplateId, setCharacterTemplateId] = useState('');
  const grants = draft.accessGrants ?? [];
  const place = draft.places.find(item => item.id === placeId);
  const roomsAt = (selection: CityDraft['places'][number] | undefined) => [
    ...(scenes.find(scene=>scene.id===selection?.templateId)?.rooms ?? []),
    ...(draft.finalization?.spaces.find(space=>space.placeId===selection?.id)?.rooms ?? []),
  ];
  const rooms = roomsAt(place);
  const scopeRoom = rooms.some(room => room.id === roomId) ? roomId : undefined;
  const chosen = draft.characters.some(person => person.templateId === characterTemplateId);
  const duplicate = grants.some(grant => grant.placeId === placeId && grant.roomId === scopeRoom &&
    grant.characterTemplateId === characterTemplateId);

  return <section aria-label="開局進出權限">
    <h2>個別進出授權</h2>
    <p>建築授權沿用至未另設權限的房間。指定房間可直接授權。</p>
    <div className="scene-template-controls">
      <label>人物<select aria-label="授權人物" value={chosen ? characterTemplateId : ''} onChange={event => setCharacterTemplateId(event.target.value)}>
        <option value="">選擇人物</option>
        {draft.characters.map(person => <option key={person.templateId} value={person.templateId}>{names.get(person.templateId)}</option>)}
      </select></label>
      <label>場所<select aria-label="授權場所" value={place?.id ?? ''} onChange={event => { setPlaceId(event.target.value); setRoomId(''); }}>
        <option value="">選擇場所</option>
        {draft.places.map(item => <option key={item.id} value={item.id}>{item.name || '未命名場所'}</option>)}
      </select></label>
      <label>範圍<select aria-label="授權房間" disabled={!place} value={scopeRoom ?? ''} onChange={event => setRoomId(event.target.value)}>
        <option value="">建築</option>
        {rooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}
      </select></label>
      <button type="button" disabled={!place || !chosen || duplicate || grants.length >= maxEntryGrants} onClick={() => {
        if (!place || !chosen || duplicate || grants.length >= maxEntryGrants) return;
        onChange({ ...draft, accessGrants:[...grants, { placeId, characterTemplateId, ...(scopeRoom ? {roomId:scopeRoom} : {}) }] });
      }}>新增個別授權</button>
    </div>
    <ul>{grants.map((grant, index) => {
      const grantedPlace = draft.places.find(item => item.id === grant.placeId);
      const grantedRoom = roomsAt(grantedPlace).find(room => room.id === grant.roomId);
      return <li key={JSON.stringify(grant)}>{names.get(grant.characterTemplateId)} · {grantedPlace?.name} · {grantedRoom?.name ?? '建築'}
        <button type="button" onClick={() => onChange({ ...draft, accessGrants:grants.filter((_, offset) => offset !== index) })}>
          移除授權 {index+1}
        </button>
      </li>;
    })}</ul>
  </section>;
}

export function CityAccessPreview({ preview }: { preview: CityPreview }) {
  if (!preview.access?.length) return null;
  return <section aria-label="有效進出權限">
    <h3>有效進出權限</h3>
    <ul>{preview.access.map(entry => {
      const place = preview.places.find(item => item.id === entry.placeId);
      const scope = entry.roomId ? place?.rooms.find(room => room.id === entry.roomId)?.name : '建築';
      return <li key={JSON.stringify([entry.placeId, entry.roomId])}>
        {place?.name} · {scope} · {entry.inherited && '沿用建築 · '}{entryRuleLabels[entry.rule]} · {entry.allowed.map(actor => actor.name).join('、') || '目前無授權人物'}
      </li>;
    })}</ul>
  </section>;
}
