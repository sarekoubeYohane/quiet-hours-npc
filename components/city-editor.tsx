'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cityLimits, openingDescriptionMaxLength, type CityDraft, type CityPreview } from '@/lib/city-draft';
import type { CharacterTemplate } from '@/lib/character-templates';
import type { SceneTemplate } from '@/lib/scene-templates';
import type { World } from '@/lib/world';
import { readWorldResponse } from '@/lib/world-response';
import { roundClientMs, roundTimePolicy, timePolicyHeader } from '@/lib/round-time-policy';
import { MentalEnergyOpeningEditor } from './mental-energy-opening';
import CharacterAttributesEditor from './character-attributes-editor';
import OpeningPeopleEditor from './opening-people-editor';
import CityFinalizationEditor from './city-finalization-editor';
import { CityAccessEditor, CityAccessPreview } from './city-access-editor';

type CityContext = { worldContext?: string; expectedVersion: number; operationScope: string };
type LoadedTemplates = { scenes: SceneTemplate[]; characters: CharacterTemplate[] };

async function templateResponse<T>(path: string, signal: AbortSignal): Promise<T> {
  const result = await fetch(path, { signal });
  const body = await readWorldResponse<T & {error?:string}>(result);
  if (!result.ok) throw Error(body.error || '無法載入範本。');
  return body;
}

export default function CityEditor({ context, disabled, onStart, onClose, onMeteredResult }: {
  context: CityContext;
  disabled: boolean;
  onStart: (city: CityDraft, expectedVersion: number) => Promise<boolean>;
  onClose: () => void;
  onMeteredResult: (result: {world?:World;version?:number}) => void;
}) {
  const [templates, setTemplates] = useState<LoadedTemplates>();
  const [draft, setDraft] = useState<CityDraft>({places:[],characters:[]});
  const [result, setResult] = useState<{preview:CityPreview;version:number}>();
  const [working, setWorking] = useState(false);
  const [openingDescription, setOpeningDescription] = useState('');
  const [expectedVersion, setExpectedVersion] = useState(context.expectedVersion);
  const pendingSuggestion = useRef<{input:string;payload:string}>(null);
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
      ...(person.homeId&&removed.has(person.homeId)?{homeId:undefined,homeRoomId:undefined}:{}),
      ownedPlaceIds:person.ownedPlaceIds?.filter(id=>!removed.has(id)),
      workplaceIds:person.workplaceIds?.filter(id=>!removed.has(id)),
    }));
    const finalization = draft.finalization && {
      spaces:draft.finalization.spaces.filter(space=>!removed.has(space.placeId)),
      walks:draft.finalization.walks.filter(walk=>walk.places.every(id=>!removed.has(id))),
    };
    edit({ ...draft, places, characters, finalization, accessGrants:draft.accessGrants?.filter(grant=>!removed.has(grant.placeId)) });
  }

  function toggleCharacter(template: CharacterTemplate) {
    const characters = draft.characters.some(person=>person.templateId===template.id)
      ? draft.characters.filter(person=>person.templateId!==template.id)
      : [...draft.characters,{templateId:template.id,version:template.version,placeId:'',roomId:''}];
    const relationships = draft.relationships?.filter(item=>characters.some(person=>person.templateId===item.from) &&
      (item.targetType==='background'||characters.some(person=>person.templateId===item.to)));
    edit({ ...draft, characters, relationships, accessGrants:draft.accessGrants?.filter(grant=>characters.some(person=>person.templateId===grant.characterTemplateId)) });
  }

  function changeCharacter(id: string, update: Partial<CityDraft['characters'][number]>) {
    edit({ ...draft, characters: draft.characters.map(person=>person.templateId===id?{...person,...update}:person) });
  }

  async function generate(operation:'suggest-opening-relationships'|'initialize-city') {
    setWorking(true);
    setResult(undefined);
    setError('');
    try {
      const input = JSON.stringify({ operation, city:draft, openingDescription });
      if (pendingSuggestion.current?.input !== input) {
        pendingSuggestion.current = {input,payload:JSON.stringify({
          ...context, expectedVersion, operation, mode:'demo',
          operationId:Date.now()+':'+crypto.randomUUID(), city:draft, openingDescription,
        })};
      }
      const response = await fetch('/api/world', {
        method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json',[timePolicyHeader]:roundTimePolicy.version},
        signal:AbortSignal.timeout(roundClientMs), body:pendingSuggestion.current.payload,
      });
      const body = await readWorldResponse<{suggestedOpening?:CityDraft;finalizedCity?:CityDraft;preview?:CityPreview;world?:World;version?:number;error?:string;operationSettled?:boolean;retryable?:boolean;operationUncertain?:boolean}>(response);
      if (body.operationSettled || (!body.retryable && !body.operationUncertain)) pendingSuggestion.current = null;
      if (typeof body.version === 'number') {
        const version = body.version;
        setExpectedVersion(current=>Math.max(current,version));
        onMeteredResult(body);
      }
      const generated = operation==='initialize-city'?body.finalizedCity:body.suggestedOpening;
      if (!response.ok || !generated) throw Error(body.error || '無法更新開局配置。');
      edit(generated);
      if (body.preview && typeof body.version==='number') setResult({preview:body.preview,version:body.version});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '無法更新開局配置。');
    } finally {
      setWorking(false);
    }
  }

  async function preview() {
    setWorking(true);
    setResult(undefined);
    setError('');
    try {
      const response = await fetch('/api/world', {
        method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({...context,expectedVersion,operation:'preview-city',mode:'demo',city:draft}),
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
        const home = draft.places.find(place=>place.id===person?.homeId);
        const homeScene = templates.scenes.find(scene=>scene.id===home?.templateId);
        const startRooms = [...(scene?.rooms??[]),...(draft.finalization?.spaces.find(space=>space.placeId===place?.id)?.rooms??[])];
        const homeRooms = [...(homeScene?.rooms??[]),...(draft.finalization?.spaces.find(space=>space.placeId===home?.id)?.rooms??[])];
        return <div className="city-person" role="group" aria-label={name+'的人物設定'} key={template.id}>
          <label><input type="checkbox" aria-label={'選用'+name} checked={!!person} disabled={!person&&draft.characters.length>=cityLimits.characters} onChange={()=>toggleCharacter(template)}/>{name}</label>
          {person && <>
            <p>背景：{template.fields.background||'未指定'}</p><p>能力：{template.fields.abilities||'未指定'}</p><CharacterAttributesEditor value={person.characterSetup??{}} onChange={characterSetup=>changeCharacter(template.id,{characterSetup})}/><details><summary>開局精神電量</summary><MentalEnergyOpeningEditor value={person.mentalOpening??{}} onChange={mentalOpening=>changeCharacter(template.id,{mentalOpening})}/></details>
            {template.fields.startLocation && <p>範本起點描述：{template.fields.startLocation}</p>}
            <label>起始場所<select aria-label={name+'的起始場所'} value={person.placeId}
              onChange={event=>changeCharacter(template.id,{placeId:event.target.value,roomId:''})}>
              <option value="">請選擇</option>
              {draft.places.map(place=><option key={place.id} value={place.id}>{place.name}</option>)}
            </select></label>
            <label>起始房間<select aria-label={name+'的起始房間'} value={person.roomId} disabled={!scene}
              onChange={event=>changeCharacter(template.id,{roomId:event.target.value})}>
              <option value="">請選擇</option>
              {startRooms.map(room=><option key={room.id} value={room.id}>{room.name}</option>)}
            </select></label>
            <label>住處<select aria-label={name+'的住處'} value={person.homeId??''}
              onChange={event=>changeCharacter(template.id,{homeId:event.target.value||undefined,homeRoomId:undefined})}>
              <option value="">未指定</option>
              {draft.places.map(place=><option key={place.id} value={place.id}>{place.name}</option>)}
            </select></label>
            <label>住處的私人房間<select aria-label={name+'的私人房間'} value={person.homeRoomId??''} disabled={!homeScene}
              onChange={event=>changeCharacter(template.id,{homeRoomId:event.target.value||undefined})}>
              <option value="">依起點描述</option>
              {homeRooms.map(room=><option key={room.id} value={room.id}>{room.name}</option>)}
            </select></label>
            <label>既有住處描述<input aria-label={name+'的既有住處描述'} maxLength={300} value={person.homeDescription??''}
              onChange={event=>changeCharacter(template.id,{homeDescription:event.target.value})}/></label>
            <label>既有工作描述<input aria-label={name+'的既有工作描述'} maxLength={300} value={person.workDescription??''}
              onChange={event=>changeCharacter(template.id,{workDescription:event.target.value})}/></label>
            {([{field:'ownedPlaceIds',heading:'擁有場所',verb:'擁有'},{field:'workplaceIds',heading:'工作場所',verb:'工作於'}] as const).map(role=><fieldset key={role.field}>
              <legend>{role.heading}</legend>
              {draft.places.map(place=>{
                const selected = person[role.field] ?? [];
                return <label key={place.id}>
                  <input type="checkbox" aria-label={name+role.verb+place.name} checked={selected.includes(place.id)}
                    onChange={event=>changeCharacter(template.id,{[role.field]:event.target.checked?[...selected,place.id]:selected.filter(id=>id!==place.id)})}/>
                  {place.name}
                </label>;
              })}
            </fieldset>)}
          </>}
        </div>;
      })}
      <OpeningPeopleEditor draft={draft} names={new Map(templates.characters.map(template=>[template.id,template.fields.name]))} onChange={edit}/>
      <CityAccessEditor draft={draft} scenes={templates.scenes} names={new Map(templates.characters.map(template=>[template.id,template.fields.name]))} onChange={edit}/>
      <h2>自然語言整理</h2>
      <label>已明示的開局關聯<textarea aria-label="自然語言開局關聯" value={openingDescription} maxLength={openingDescriptionMaxLength}
        onChange={event=>setOpeningDescription(event.target.value)}/></label>
      <p>使用天上意志模型整理已填描述，計入玩家 AI 用量。可在開始前修改建議。</p>
      <Button type="button" variant="outline" disabled={!draft.places.length||!draft.characters.length} onClick={()=>void generate('suggest-opening-relationships')}>用 AI 整理開局關聯</Button>
      <CityFinalizationEditor draft={draft} sourceRooms={new Map(draft.places.map(place=>[place.id,templates.scenes.find(scene=>scene.id===place.templateId)?.rooms??[]]))}
        names={new Map(templates.characters.map(template=>[template.id,template.fields.name]))} onChange={edit}/>
      <p>初始化會請各人物描述熟悉的場所，再由天上意志整理，計入玩家 AI 用量。</p>
      <Button type="button" variant="outline" disabled={!draft.places.length||!draft.characters.length} onClick={()=>void generate('initialize-city')}>初始化場所</Button>
      <Button onClick={()=>void preview()}>預覽城市</Button>
    </fieldset>}
    {result && <section aria-label="城市預覽">
      <h2>城市預覽</h2>
      {result.preview.issues.length>0 && <ul role="alert">{result.preview.issues.map((issue,index)=><li key={index}>{issue}</li>)}</ul>}
      <ul>{result.preview.places.map(place=><li key={place.id}>{place.name} · {place.rooms.map(room=>room.name).join('、')}
        <ul>{place.objects.map(object=><li key={object.id}>{object.room} · {object.name}{Object.entries(object.state).map(([key,value])=>' · '+key+' '+value)}</li>)}</ul>
      </li>)}</ul>
      <ul>{result.preview.characters.map(person=><li key={person.templateId}>
        {person.name} · {person.place||'未指定場所'} · {person.room||'未指定房間'}{person.home&&' · 住在'+person.home}{person.bedroom&&'（'+person.bedroom+'）'}{person.ownedPlaces?.length?' · 擁有'+person.ownedPlaces.join('、'):''}{person.workplaces?.length?' · 工作於'+person.workplaces.join('、'):''}
        {person.openingKnowledge && <details aria-label={person.name+'的初始認知'}>
          <summary>{person.name}的初始認知</summary>
          <p>熟悉房間 · {person.openingKnowledge.rooms.map(room=>room.name).join('、')}</p>
          {!!person.openingKnowledge.objects.length && <p>熟悉物件 · {person.openingKnowledge.objects.map(object=>object.name).join('、')}</p>}
        </details>}
      </li>)}</ul>
      {!!result.preview.backgroundPeople?.length && <p>背景人物 · {result.preview.backgroundPeople.map(person=>person.name).join('、')}</p>}
      <ul>{result.preview.relationships?.map((item,index)=><li key={index}>{item.from} → {item.to} · {item.description}</li>)}</ul>
      <ul>{result.preview.walks?.map(walk=><li key={walk.places.join(':')}>{walk.places.map(id=>result.preview.places.find(place=>place.id===id)?.name).join(' ↔ ')} · {walk.minutes===null?'不通行':walk.minutes+' 分鐘'}</li>)}</ul>
      <CityAccessPreview preview={result.preview}/>
      {result.version!==expectedVersion && <p role="status">世界版本已變更，請重新預覽。</p>}
    </section>}
    <Button disabled={editingDisabled||!result||!!result.preview.issues.length||result.version!==expectedVersion}
      onClick={()=>{if(result)void onStart(draft,result.version);}}>開始世界</Button>
  </section>;
}
