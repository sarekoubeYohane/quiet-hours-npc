'use client';

import {useRouter} from 'next/navigation';
import {returnOpeningAsset} from '@/lib/opening-authoring';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useOriginalAccountScope } from '@/components/use-original-account-scope';
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

export default function SceneTemplateEditor({originalAccountScope,returnTo}:{originalAccountScope?:string;returnTo?:string}) {
  const router=useRouter();
  const [localStatus,setLocalStatus]=useState('');
  const [savedContent,setSavedContent]=useState('');
  const [returnPending,setReturnPending]=useState<SceneTemplate>();
  const {accountScope,capture,scoped}=useOriginalAccountScope(originalAccountScope);
  const alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const [templates, setTemplates] = useState<SceneTemplate[]>([]);
  const [draft, setDraft] = useState<Draft>();
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const reload = useCallback(async (signal?: AbortSignal) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(scoped('/api/scene-templates'), { signal, cache: 'no-store' });
      const body = await response.json() as { accountScope?:string; templates?: SceneTemplate[]; error?: string };
      if (!response.ok || !body.templates) throw Error(body.error ?? '場景範本讀取失敗。');
      if(!alive.current)return;capture(body.accountScope);
      setTemplates(body.templates);
      const cached=sessionStorage.getItem('quiet-hours:scene-draft:'+body.accountScope);
      if(cached){try{const restored=JSON.parse(cached) as Draft;if(restored.id&&Array.isArray(restored.rooms)&&Array.isArray(restored.objects)&&Array.isArray(restored.connections)){setDraft(restored);const stored=body.templates.find(item=>item.id===restored.id&&item.version===restored.version);if(stored){const normalized=editTemplate(stored);const semantic=(value:Draft)=>JSON.stringify({...value,objects:value.objects.map(object=>({...object,state:object.state.map(({key,value})=>({key,value}))}))});if(semantic(normalized)===semantic(restored))setSavedContent(JSON.stringify(restored));}setLocalStatus('已恢復本分頁的場景草稿；保存後才會同步至帳號。');}}catch{/* Malformed local drafts never replace server templates. */}}
      else setDraft(undefined);
    } catch (failure) {
      if (!signal?.aborted) setError(failure instanceof Error ? failure.message : '場景範本讀取失敗。');
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }, [capture,scoped]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) void reload(controller.signal); });
    return () => controller.abort();
  }, [reload]);

  useEffect(()=>{
    if(!draft||!accountScope)return;
    try{sessionStorage.setItem('quiet-hours:scene-draft:'+accountScope,JSON.stringify(draft));setLocalStatus(JSON.stringify(draft)===savedContent?'已保存至帳號':'草稿已保存在本分頁；按保存才會同步至帳號。');}
    catch{setLocalStatus('本機草稿未保存；離開前請先按保存場景。');}
  },[draft,accountScope,savedContent]);
  function open(next: Draft) {
    if(draft&&JSON.stringify(draft)!==savedContent&&!window.confirm('切換會取代目前場景草稿。確定要切換嗎？'))return;
    setSavedContent(next.version?JSON.stringify(next):'');setReturnPending(undefined);
    setDraft(next);
    setMessage('');
    setError('');
  }

  async function save(event: FormEvent, bringBack=false) {
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
        body: JSON.stringify({ ...draft, objects, accountScope }),
      });
      const body = await response.json() as { accountScope?:string; template?: SceneTemplate; error?: string };
      if (!response.ok || !body.template) throw Error(body.error ?? '場景範本保存失敗。');
      const saved = body.template;
      if(!alive.current)return;capture(body.accountScope);
      setTemplates(previous => [...previous.filter(template => template.id !== saved.id), saved]);
      const completed=editTemplate(saved);setDraft(completed);setSavedContent(JSON.stringify(completed));
      setMessage('場景範本已保存。');
      if(bringBack&&returnTo&&accountScope){setReturnPending(saved);const path=await returnOpeningAsset(returnTo,accountScope,{kind:'scene',scene:saved});setReturnPending(undefined);router.push(path);}
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
    <header className="journey-panel-heading"><div><span className="eyebrow">場景準備</span><h1>建立生活的地方</h1></div><p role="status" className="opening-status">{localStatus}</p></header>
    <p className="hint">先命名場所與房間，就能保存使用。房間連接、物件與權限可以按需要補充；同一場景能在開局加入多次。</p>
    <div className="scene-template-controls">
      <button type="button" disabled={busy} onClick={() => open(emptyDraft())}>新增場景範本</button>
      <button type="button" disabled={busy} onClick={() => void reload()}>重新讀取場景範本</button>
      {templates.map(template => <button type="button" key={template.id} disabled={busy} onClick={() => open(editTemplate(template))}>
        {template.shared ? template.name + '（複製共用範本）' : template.name}
      </button>)}
    </div>
    {message && <p role="status">{message}</p>}
    {error && <p role="alert" className="error">{error}</p>}
    {returnPending&&returnTo&&<button disabled={busy} onClick={async()=>{setBusy(true);try{const path=await returnOpeningAsset(returnTo,accountScope!,{kind:'scene',scene:returnPending});router.push(path);}catch(cause){setError(cause instanceof Error?cause.message:'尚未帶回開局');}finally{setBusy(false);}}}>重試帶回已保存的場景</button>}
    {draft && <form onSubmit={event=>void save(event,!!returnTo)}>
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
        <details><summary>房間連接與門（選填）</summary><p className="hint">至少有兩個房間才能新增連接。</p>
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
        </details><details><summary>物件與初始狀態（選填）</summary>
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
        </details><section className="scene-template-preview" aria-label="預設場景美術">
          <h2>{draft.name || '場所預覽'}</h2>
          {draft.rooms.map(room => <div key={room.id}>
            <h3>{room.name || '未命名房間'}</h3>
            <ul>{draft.objects.filter(object => object.roomId === room.id).map(object =>
              <li key={object.id}>{object.name || '未命名物件'}{object.state.map(({ id, key, value }) =>
                <span key={id}> · {key} {value}</span>)}</li>)}</ul>
          </div>)}
        </section>
        <div className="opening-actions">{returnTo&&<button type="button" onClick={event=>void save(event)}>只保存場景</button>}<button className="opening-primary" type="submit">{returnTo?'保存場景並帶回開局':'保存場景範本'}</button></div>
      </fieldset>
    </form>}
  </section>;
}
