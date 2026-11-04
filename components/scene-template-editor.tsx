'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { stateChangeLimits } from '@/lib/adjudication-limits';
import { entryRules, entryRuleLabels, type EntryRule } from '@/lib/entry-rules';
import type { SceneTemplate } from '@/lib/scene-templates';

type Room = SceneTemplate['rooms'][number];
type Connection = SceneTemplate['connections'][number];
type ObjectDraft = Omit<SceneTemplate['objects'][number], 'state'> & {
  state: { id: string; key: string; value: string }[];
};
type Draft = Omit<SceneTemplate, 'id' | 'version' | 'shared' | 'objects'> & {
  id: string;
  version: number;
  objects: ObjectDraft[];
};

const newRoom = (): Room => ({ id: crypto.randomUUID(), name: '' });
const emptyDraft = (): Draft => ({ id:crypto.randomUUID(), version:0, name: '', note: '', rooms: [newRoom()], connections: [], objects: [] });

function editTemplate(template: SceneTemplate): Draft {
  const { id, version, shared, objects, ...draft } = template;
  return {
    ...draft,
    ...(shared ? { id:crypto.randomUUID(), version:0 } : { id, version }),
    objects: objects.map(object => ({
      ...object,
      state: Object.entries(object.state).map(([key, value]) => ({ id: crypto.randomUUID(), key, value })),
    })),
  };
}

function changeById<T extends { id: string }>(items: T[], id: string, update: Partial<T>): T[] {
  return items.map(item => item.id === id ? { ...item, ...update } : item);
}

function RoomSelect({ label, value, rooms, onChange }: {
  label: string; value: string; rooms: Room[]; onChange: (value: string) => void;
}) {
  return <select aria-label={label} value={value} onChange={event => onChange(event.target.value)}>
    {rooms.map((room, index) => <option key={room.id} value={room.id}>{room.name || '房間 ' + (index + 1)}</option>)}
  </select>;
}

export default function SceneTemplateEditor() {
  const [templates, setTemplates] = useState<SceneTemplate[]>([]);
  const [draft, setDraft] = useState<Draft>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const reload = useCallback(async (signal?: AbortSignal) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/scene-templates', { signal, cache: 'no-store' });
      const body = await response.json() as { templates?: SceneTemplate[]; error?: string };
      if (!response.ok || !body.templates) throw Error(body.error ?? '場景範本讀取失敗。');
      setTemplates(body.templates);
      setDraft(undefined);
    } catch (failure) {
      if (!signal?.aborted) setError(failure instanceof Error ? failure.message : '場景範本讀取失敗。');
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) void reload(controller.signal); });
    return () => controller.abort();
  }, [reload]);

  function open(next: Draft) {
    setDraft(next);
    setMessage('');
    setError('');
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || busy) return;
    setMessage('');
    setError('');
    const objects = [];
    for (const object of draft.objects) {
      const pairs = object.state.map(({ key, value }) => [key.trim(), value] as const);
      if (new Set(pairs.map(([key]) => key)).size !== pairs.length) {
        setError('同一物件的狀態名稱不能重複。');
        return;
      }
      objects.push({ ...object, state: Object.fromEntries(pairs) });
    }
    setBusy(true);
    try {
      const response = await fetch('/api/scene-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, objects }),
      });
      const body = await response.json() as { template?: SceneTemplate; error?: string };
      if (!response.ok || !body.template) throw Error(body.error ?? '場景範本保存失敗。');
      const saved = body.template;
      setTemplates(previous => [...previous.filter(template => template.id !== saved.id), saved]);
      setDraft(editTemplate(saved));
      setMessage('場景範本已保存。');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '場景範本保存失敗。');
    } finally {
      setBusy(false);
    }
  }

  function updateConnection(id: string, update: Partial<Connection>) {
    setDraft(previous => previous && { ...previous, connections: changeById(previous.connections, id, update) });
  }

  function updateObject(id: string, update: Partial<ObjectDraft>) {
    setDraft(previous => previous && { ...previous, objects: changeById(previous.objects, id, update) });
  }

  return <section className="panel scene-template-editor" aria-label="場景範本編輯器">
    <h1>場景範本</h1>
    <p>每份範本描述一處場所。可複製共用範本成為自己的版本。</p>
    <div className="scene-template-controls">
      <button type="button" disabled={busy} onClick={() => open(emptyDraft())}>新增場景範本</button>
      <button type="button" disabled={busy} onClick={() => void reload()}>重新讀取場景範本</button>
      {templates.map(template => <button type="button" key={template.id} disabled={busy} onClick={() => open(editTemplate(template))}>
        {template.shared ? template.name + '（複製共用範本）' : template.name}
      </button>)}
    </div>
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
    {draft && <form onSubmit={save}>
      <fieldset disabled={busy}>
        <legend>{draft.version ? '編輯場景範本' : '新場景範本'}</legend>
        <label>場所名稱<input aria-label="場所名稱" required maxLength={80} value={draft.name}
          onChange={event => setDraft({ ...draft, name: event.target.value })}/></label>
        <label>場所描述<textarea maxLength={600} value={draft.note}
          onChange={event => setDraft({ ...draft, note: event.target.value })}/></label>
        <label>建築預設進出權限<select aria-label="建築預設進出權限" value={draft.access?.building ?? 'public'}
          onChange={event => setDraft({ ...draft, access: { building:event.target.value as EntryRule, rooms:draft.access?.rooms ?? {} } })}>
          {entryRules.map(rule => <option key={rule} value={rule}>{entryRuleLabels[rule]}</option>)}
        </select></label>
        <h2>房間</h2>
        {draft.rooms.map((room, index) => <div className="scene-template-controls" key={room.id}>
          <label>房間 {index + 1} 名稱<input aria-label={'房間 ' + (index + 1) + ' 名稱'} required maxLength={80} value={room.name}
            onChange={event => setDraft({ ...draft, rooms: changeById(draft.rooms, room.id, { name: event.target.value }) })}/></label>
          <label>進出權限<select aria-label={'房間 ' + (index + 1) + ' 進出權限'} value={draft.access && Object.hasOwn(draft.access.rooms,room.id) ? draft.access.rooms[room.id] : ''}
            onChange={event => {
              const rules = { ...draft.access?.rooms };
              if (event.target.value) rules[room.id] = event.target.value as EntryRule;
              else delete rules[room.id];
              setDraft({ ...draft, access: { building:draft.access?.building ?? 'public', rooms:rules } });
            }}>
            <option value="">沿用建築</option>
            {entryRules.map(rule => <option key={rule} value={rule}>{entryRuleLabels[rule]}</option>)}
          </select></label>
          <button type="button" disabled={draft.rooms.length === 1 ||
            draft.connections.some(connection => connection.rooms.includes(room.id)) ||
            draft.objects.some(object => object.roomId === room.id)}
            onClick={() => {
              const access = draft.access && {
                ...draft.access,
                rooms:Object.fromEntries(Object.entries(draft.access.rooms).filter(([id]) => id !== room.id)),
              };
              setDraft({ ...draft, rooms: draft.rooms.filter(item => item.id !== room.id), access });
            }}>移除房間 {index + 1}</button>
        </div>)}
        <button type="button" disabled={draft.rooms.length >= 20}
          onClick={() => setDraft({ ...draft, rooms: [...draft.rooms, newRoom()] })}>新增房間</button>
        <h2>房間連接</h2>
        {draft.connections.map((connection, index) => <div className="scene-template-controls" key={connection.id}>
          <label>連接 {index + 1} 名稱<input aria-label={'連接 ' + (index + 1) + ' 名稱'} required maxLength={80} value={connection.name}
            onChange={event => updateConnection(connection.id, { name: event.target.value })}/></label>
          <label>初始通行狀態<select aria-label={'連接 ' + (index + 1) + ' 初始通行狀態'} value={connection.state ?? 'open'}
            onChange={event => updateConnection(connection.id, { state: event.target.value as Connection['state'] })}>
            <option value="open">開啟</option><option value="closed">關閉</option><option value="blocked">不通行</option>
          </select></label>
          <label>起點<RoomSelect label={'連接 ' + (index + 1) + ' 起點'} rooms={draft.rooms} value={connection.rooms[0]}
            onChange={room => updateConnection(connection.id, { rooms: [room, connection.rooms[1]] })}/></label>
          <label>終點<RoomSelect label={'連接 ' + (index + 1) + ' 終點'} rooms={draft.rooms} value={connection.rooms[1]}
            onChange={room => updateConnection(connection.id, { rooms: [connection.rooms[0], room] })}/></label>
          <button type="button" onClick={() => setDraft({ ...draft, connections: draft.connections.filter(item => item.id !== connection.id) })}>
            移除連接 {index + 1}
          </button>
        </div>)}
        <button type="button" disabled={draft.rooms.length < 2 || draft.connections.length >= 40}
          onClick={() => setDraft({ ...draft, connections: [...draft.connections, {
            id: crypto.randomUUID(), name: '', rooms: [draft.rooms[0].id, draft.rooms[1].id],
          }] })}>新增連接</button>
        <h2>文字物件</h2>
        {draft.objects.map((object, index) => <fieldset key={object.id}>
          <legend>物件 {index + 1}</legend>
          <div className="scene-template-controls">
            <label>名稱<input aria-label={'物件 ' + (index + 1) + ' 名稱'} required maxLength={80} value={object.name}
              onChange={event => updateObject(object.id, { name: event.target.value })}/></label>
            <label>所在房間<RoomSelect label={'物件 ' + (index + 1) + ' 所在房間'} rooms={draft.rooms} value={object.roomId}
              onChange={roomId => updateObject(object.id, { roomId })}/></label>
            <label><input type="checkbox" checked={!!object.hidden} onChange={event=>updateObject(object.id,{hidden:event.target.checked||undefined})}/>開局不讓人物知道此物件</label>
            <button type="button" onClick={() => setDraft({ ...draft, objects: draft.objects.filter(item => item.id !== object.id) })}>
              移除物件 {index + 1}
            </button>
          </div>
          {object.state.map((state, stateIndex) => <div className="scene-template-controls" key={state.id}>
            <label>狀態 {stateIndex + 1} 名稱<input aria-label={'物件 ' + (index + 1) + ' 狀態 ' + (stateIndex + 1) + ' 名稱'} required maxLength={stateChangeLimits.maxKeyLength} value={state.key}
              onChange={event => updateObject(object.id, { state: changeById(object.state, state.id, { key: event.target.value }) })}/></label>
            <label>狀態 {stateIndex + 1} 值<input aria-label={'物件 ' + (index + 1) + ' 狀態 ' + (stateIndex + 1) + ' 值'} required maxLength={stateChangeLimits.maxValueLength} value={state.value}
              onChange={event => updateObject(object.id, { state: changeById(object.state, state.id, { value: event.target.value }) })}/></label>
            <button type="button" onClick={() => updateObject(object.id, { state: object.state.filter(item => item.id !== state.id) })}>
              移除狀態 {stateIndex + 1}
            </button>
          </div>)}
          <button type="button" disabled={object.state.length >= stateChangeLimits.maxEntries}
            onClick={() => updateObject(object.id, { state: [...object.state, { id: crypto.randomUUID(), key: '', value: '' }] })}>
            新增狀態
          </button>
        </fieldset>)}
        <button type="button" disabled={draft.objects.length >= 80}
          onClick={() => setDraft({ ...draft, objects: [...draft.objects, {
            id: crypto.randomUUID(), name: '', roomId: draft.rooms[0].id, state: [],
          }] })}>新增文字物件</button>
        <section className="scene-template-preview" aria-label="預設場景美術">
          <h2>{draft.name || '場所預覽'}</h2>
          {draft.rooms.map(room => <div key={room.id}>
            <h3>{room.name || '未命名房間'}</h3>
            <ul>{draft.objects.filter(object => object.roomId === room.id).map(object =>
              <li key={object.id}>{object.name || '未命名物件'}{object.state.map(({ id, key, value }) =>
                <span key={id}> · {key} {value}</span>)}</li>)}</ul>
          </div>)}
        </section>
        <button type="submit">保存場景範本</button>
      </fieldset>
    </form>}
  </section>;
}
