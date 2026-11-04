'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cityLimits, type CityDraft, type CityPreview } from '@/lib/city-draft';
import type { CharacterTemplate } from '@/lib/character-templates';
import type { SceneTemplate } from '@/lib/scene-templates';
import { readWorldResponse } from '@/lib/world-response';

type CityContext = { worldContext?: string; expectedVersion: number; operationScope: string };
type LoadedTemplates = { scenes: SceneTemplate[]; characters: CharacterTemplate[] };

async function templateResponse<T>(path: string, signal: AbortSignal): Promise<T> {
  const result = await fetch(path, { signal });
  const body = await readWorldResponse<T & {error?:string}>(result);
  if (!result.ok) throw Error(body.error || '無法載入範本。');
  return body;
}

export default function CityEditor({ context, disabled, onStart, onClose }: {
  context: CityContext;
  disabled: boolean;
  onStart: (city: CityDraft, expectedVersion: number) => Promise<boolean>;
  onClose: () => void;
}) {
  const [templates, setTemplates] = useState<LoadedTemplates>();
  const [draft, setDraft] = useState<CityDraft>({places:[],characters:[]});
  const [result, setResult] = useState<{preview:CityPreview;version:number}>();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const abort = new AbortController();
    void Promise.all([
      templateResponse<{templates:SceneTemplate[]}>('/api/scene-templates', abort.signal),
      templateResponse<{templates:CharacterTemplate[];presets:CharacterTemplate[]}>('/api/character-templates', abort.signal),
    ]).then(([scenes, people]) => {
      if (!abort.signal.aborted) setTemplates({ scenes:scenes.templates, characters:[...people.templates, ...people.presets] });
    }, error => {
      if (!abort.signal.aborted) setError(error.message);
    });
    return () => abort.abort();
  }, []);

  function edit(next: CityDraft) {
    setDraft(next);
    setResult(undefined);
    setError('');
  }

  function setQuantity(template: SceneTemplate, quantity: number) {
    const current = draft.places.filter(place=>place.templateId===template.id);
    const added = Array.from({length:Math.max(0,quantity-current.length)},(_,index)=>({
      id:crypto.randomUUID().slice(0,24), templateId:template.id, version:template.version,
      name:template.name + (quantity>1?' ' + (current.length+index+1):''),
    }));
    const removed = new Set(current.slice(quantity).map(place=>place.id));
    const places = [...draft.places.filter(place=>!removed.has(place.id)), ...added];
    const characters = draft.characters.map(person=>({
      ...person,
      ...(removed.has(person.placeId)?{placeId:'',roomId:''}:{}),
      ...(person.homeId&&removed.has(person.homeId)?{homeId:undefined}:{}),
    }));
    edit({ places, characters });
  }

  function toggleCharacter(template: CharacterTemplate) {
    const characters = draft.characters.some(person=>person.templateId===template.id)
      ? draft.characters.filter(person=>person.templateId!==template.id)
      : [...draft.characters,{templateId:template.id,version:template.version,placeId:'',roomId:''}];
    edit({ ...draft, characters });
  }

  function changeCharacter(id: string, update: Partial<CityDraft['characters'][number]>) {
    edit({ ...draft, characters: draft.characters.map(person=>person.templateId===id?{...person,...update}:person) });
  }

  async function preview() {
    setWorking(true);
    setResult(undefined);
    setError('');
    try {
      const response = await fetch('/api/world', {
        method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({...context,operation:'preview-city',mode:'demo',city:draft}),
      });
      const body = await readWorldResponse<{preview:CityPreview;version:number;error?:string}>(response);
      if (!response.ok || !body.preview) throw Error(body.error || '無法預覽城市。');
      setResult(body);
    } catch (error) {
      setError(error instanceof Error ? error.message : '無法預覽城市。');
    } finally {
      setWorking(false);
    }
  }

  const editingDisabled = disabled || working;
  return <section className="panel city-editor" aria-label="建立城市">
    <div className="section-head"><h1>建立城市</h1><Button variant="outline" onClick={onClose} disabled={working}>返回觀察</Button></div>
    <p>選擇場所和人物，確認預覽後再開始。開始時會保存原世界的資料。</p>
    {error && <p role="alert">{error}</p>}
    {templates && <fieldset disabled={editingDisabled}>
      <legend>城市開局設定</legend>
      <h2>場所數量</h2>
      {templates.scenes.map(template=>{
        const count = draft.places.filter(place=>place.templateId===template.id).length;
        const max = cityLimits.places - draft.places.length + count;
        return <label key={template.id}>{template.name}
          <select aria-label={template.name+'數量'} value={count} onChange={event=>setQuantity(template,Number(event.target.value))}>
            {Array.from({length:max+1},(_,quantity)=><option key={quantity} value={quantity}>{quantity}</option>)}
          </select>
        </label>;
      })}
      {draft.places.map((place,index)=><label key={place.id}>場所 {index+1} 名稱
        <input aria-label={'場所 '+(index+1)+' 名稱'} value={place.name} maxLength={80}
          onChange={event=>edit({...draft,places:draft.places.map(item=>item.id===place.id?{...item,name:event.target.value}:item)})}/>
      </label>)}
      <h2>選用人物</h2>
      {templates.characters.map(template=>{
        const person = draft.characters.find(person=>person.templateId===template.id);
        const name = template.fields.name;
        const place = draft.places.find(place=>place.id===person?.placeId);
        const scene = templates.scenes.find(scene=>scene.id===place?.templateId);
        return <div className="city-person" key={template.id}>
          <label><input type="checkbox" aria-label={'選用'+name} checked={!!person} disabled={!person&&draft.characters.length>=cityLimits.characters} onChange={()=>toggleCharacter(template)}/>{name}</label>
          {person && <>
            {template.fields.startLocation && <p>範本起點描述：{template.fields.startLocation}</p>}
            <label>起始場所<select aria-label={name+'的起始場所'} value={person.placeId}
              onChange={event=>changeCharacter(template.id,{placeId:event.target.value,roomId:''})}>
              <option value="">請選擇</option>
              {draft.places.map(place=><option key={place.id} value={place.id}>{place.name}</option>)}
            </select></label>
            <label>起始房間<select aria-label={name+'的起始房間'} value={person.roomId} disabled={!scene}
              onChange={event=>changeCharacter(template.id,{roomId:event.target.value})}>
              <option value="">請選擇</option>
              {scene?.rooms.map(room=><option key={room.id} value={room.id}>{room.name}</option>)}
            </select></label>
            <label>住處<select aria-label={name+'的住處'} value={person.homeId??''}
              onChange={event=>changeCharacter(template.id,{homeId:event.target.value||undefined})}>
              <option value="">未指定</option>
              {draft.places.map(place=><option key={place.id} value={place.id}>{place.name}</option>)}
            </select></label>
          </>}
        </div>;
      })}
      <Button onClick={()=>void preview()}>預覽城市</Button>
    </fieldset>}
    {result && <section aria-label="城市預覽">
      <h2>城市預覽</h2>
      {result.preview.issues.length>0 && <ul role="alert">{result.preview.issues.map((issue,index)=><li key={index}>{issue}</li>)}</ul>}
      <ul>{result.preview.places.map(place=><li key={place.id}>{place.name} · {place.rooms.map(room=>room.name).join('、')}
        <ul>{place.objects.map((object,index)=><li key={index}>{object.room} · {object.name}</li>)}</ul>
      </li>)}</ul>
      <ul>{result.preview.characters.map((person,index)=><li key={index}>{person.name} · {person.place||'未指定場所'} · {person.room||'未指定房間'}{person.home&&' · 住在'+person.home}</li>)}</ul>
      {result.version!==context.expectedVersion && <p role="status">世界版本已變更，請重新預覽。</p>}
    </section>}
    <Button disabled={editingDisabled||!result||!!result.preview.issues.length||result.version!==context.expectedVersion}
      onClick={()=>{if(result)void onStart(draft,result.version);}}>開始世界</Button>
  </section>;
}
