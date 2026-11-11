'use client';
import {fillUniqueStarts} from '@/lib/opening-authoring';
import {useDraftNavigation} from './use-draft-navigation';
import {boundPath} from '@/lib/bound-navigation';
import {saveUuidPattern} from '@/lib/save-identities';
import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import SaveNavigation from './save-navigation';
import {OpeningRelations,OpeningRoads,OpeningExtrasEditor} from './opening-configuration-controls';
import OpeningArrangementPanel from './opening-arrangement-panel';
import type {ArrangementView} from '@/lib/opening-arrangement-store';
import {CityAccessPreview} from './city-access-editor';
import type {CharacterCard} from '@/lib/character-cards';
import type {SceneTemplate} from '@/lib/scene-templates';
import type {CityDraft,CityPreview} from '@/lib/city-draft';
import type {World} from '@/lib/world';
type OpeningCharacter=CityDraft['characters'][number];
type OpeningCity=CityDraft;
type Body={name:string;step:number;description:string;city:OpeningCity};
type Draft={id:string;version:number;body:Body;sources:{cards:CharacterCard[];scenes:SceneTemplate[]};finalizedSaveId?:string};
type Reply={previousArrangement?:ArrangementView;arrangement?:ArrangementView;operationScope?:string;draft?:Draft;preview?:CityPreview;world?:World;error?:string};
const steps=['準備人物','場景與安排','核對並開始'];
const storedSteps=[1,3,4];
const stageOf=(step:number)=>step===1?1:step<=3?2:3;
const initial=():Body=>({name:'新的世界',step:1,description:'',city:{characters:[],places:[]}});
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const needs=[['hunger','飢餓'],['thirst','口渴'],['fatigue','體力疲勞'],['sleep','睡眠需求']] as const;
const defaults={hunger:20,thirst:20,fatigue:15,sleep:20};
function mergeSources<T extends {id:string;version:number}>(available:T[],saved:T[]){const result=new Map(available.map(value=>[JSON.stringify([value.id,value.version]),value]));for(const value of saved)result.set(JSON.stringify([value.id,value.version]),value);return [...result.values()];}
function unselectedCharacterReferences(city:OpeningCity){
 const selected=new Set(city.characters.map(actor=>actor.templateId));
 return !!(city.relationships?.some(relation=>!selected.has(relation.from)||relation.targetType==='character'&&!selected.has(relation.to))||city.accessGrants?.some(grant=>!selected.has(grant.characterTemplateId)));
}
function placeHasConfiguration(city:OpeningCity,id:string){
 return city.characters.some(actor=>actor.placeId===id||actor.homeId===id||actor.ownedPlaceIds?.includes(id)||actor.workplaceIds?.includes(id))||city.accessGrants?.some(grant=>grant.placeId===id)||city.finalization?.walks.some(walk=>walk.places.includes(id))||city.finalization?.spaces.some(space=>space.placeId===id&&(space.rooms.length||space.objects.length||space.connections.length));
}
export default function OpeningWizard({draftId,restartSaveId,owner,header}:{draftId?:string;restartSaveId?:string;owner:string;header?:ReactNode}){
 const router=useRouter();
 const [creating,setCreating]=useState(false);
 const [arrangement,setArrangement]=useState<ArrangementView>(),[previousArrangement,setPreviousArrangement]=useState<ArrangementView>();
 const [selectionNotice,setSelectionNotice]=useState('');
 const [id,setId]=useState(''),[body,setBody]=useState<Body>(initial),[sources,setSources]=useState<Draft['sources']>({cards:[],scenes:[]}),[library,setLibrary]=useState<Draft['sources']>({cards:[],scenes:[]}),[loading,setLoading]=useState(true),[status,setStatus]=useState(''),[error,setError]=useState(''),[failed,setFailed]=useState(false),[conflict,setConflict]=useState(false),[busy,setBusy]=useState(false),[preview,setPreview]=useState<CityPreview>(),[candidate,setCandidate]=useState<World>(),[finalized,setFinalized]=useState<string>();
 const current=useRef<Body>(initial()),version=useRef(0),alive=useRef(true),writing=useRef<Promise<boolean>|null>(null),dirty=useRef(false),pendingCreation=useRef<{id:string;draftId:string;draftVersion:number;operationScope:string}|undefined>(undefined),generation=useRef(0),accountScope=useRef(owner);
 const cards=mergeSources(library.cards,sources.cards),scenes=mergeSources(library.scenes,sources.scenes);
 const acceptArrangement=useCallback((data:Reply)=>{setArrangement(previous=>data.arrangement?.state==='failed'&&data.previousArrangement?.operationId===previous?.operationId?data.previousArrangement:data.arrangement);setPreviousArrangement(data.previousArrangement);},[]);
 const apply=useCallback((draft:Draft,replace=true)=>{version.current=draft.version;setSources(draft.sources);setFinalized(draft.finalizedSaveId);if(replace){current.current=draft.body;setBody(draft.body);dirty.current=false;}},[]);
 const loadLibrary=useCallback(async()=>{const expected='account-operations:'+accountScope.current;const suffix='?accountScope='+encodeURIComponent(expected);const [a,b]=await Promise.all([fetch('/api/character-cards'+suffix),fetch('/api/scene-templates'+suffix)]);const people=await a.json() as {accountScope?:string;cards?:CharacterCard[]},places=await b.json() as {accountScope?:string;presets?:SceneTemplate[];templates?:SceneTemplate[]};if(!a.ok||!b.ok||people.accountScope!==expected||places.accountScope!==expected)throw Error('無法讀取人物卡或場景來源。');if(alive.current)setLibrary({cards:people.cards??[],scenes:[...(places.presets??[]),...(places.templates??[])]});},[]);
 useEffect(()=>{alive.current=true;const token=++generation.current;const value=draftId||crypto.randomUUID();version.current=0;writing.current=null;pendingCreation.current=undefined;history.replaceState(null,'',boundPath('/new',owner,{draft:value,restart:restartSaveId}));void(async()=>{try{const scopeResponse=await fetch('/api/opening-drafts?operationScope='+encodeURIComponent(owner));const scope=await scopeResponse.json() as Reply;if(!scopeResponse.ok||scope.operationScope!==owner)throw Error('無法核對原帳號，請重新載入。');if(!alive.current||generation.current!==token)return;accountScope.current=scope.operationScope;setId(value);setLoading(true);setCreating(false);setFinalized(undefined);setError('');setConflict(false);setFailed(false);if(!saveUuidPattern.test(value))throw Error('開局草稿識別無效。');await loadLibrary();if(draftId||restartSaveId){const response=restartSaveId?await fetch('/api/opening-drafts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:value,version:0,restartSaveId,operationScope:accountScope.current})}):await fetch('/api/opening-drafts?id='+value+'&operationScope='+encodeURIComponent(owner));const data=await response.json() as Reply;if(!response.ok||!data.draft)throw Error(data.error||'無法讀取開局草稿。');if(alive.current&&generation.current===token){apply(data.draft);setPreview(data.preview);setCandidate(data.world);acceptArrangement(data);setStatus('已保存至帳號');if(restartSaveId)history.replaceState(null,'',boundPath('/new',owner,{draft:value}));}}else{current.current=initial();setBody(current.current);dirty.current=true;setStatus('等待保存');}}catch(cause){if(alive.current&&generation.current===token)setError(String(cause instanceof Error?cause.message:cause));}finally{if(alive.current&&generation.current===token)setLoading(false);}})();return()=>{alive.current=false;};},[draftId,restartSaveId,apply,loadLibrary,owner,acceptArrangement]);
 const change=(next:Body)=>{if(pendingCreation.current||finalized)return;setSelectionNotice('');current.current=next;dirty.current=true;setBody(next);setPreview(undefined);setCandidate(undefined);setStatus('等待保存');if(!conflict){setFailed(false);setError('');}};
 const save=useCallback(async function persist():Promise<boolean>{
  if(writing.current){const accepted=await writing.current;if(!accepted)return false;if(dirty.current)return persist();return true;}
  if(!id||!dirty.current)return !conflict;
  const snapshot=structuredClone(current.current),base=version.current,token=generation.current,requestScope=accountScope.current;setStatus('保存中');
  const work=(async()=>{try{
   const response=await fetch('/api/opening-drafts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,version:base,body:snapshot,operationScope:requestScope})});const data=await response.json() as Reply;
   if(!response.ok||!data.draft){if(response.status===409){setConflict(true);throw Error(data.error||'另一頁已修改草稿，原輸入已保留。');}throw Error(data.error||'草稿尚未同步。');}
   if(data.operationScope!==requestScope)throw Error('帳號已變更；原輸入尚未同步，請回到原帳號恢復。');
   if(!alive.current||generation.current!==token)return false;apply(data.draft,false);dirty.current=!same(current.current,snapshot);setPreview(data.preview);setCandidate(data.world);acceptArrangement(data);setFailed(false);setError('');setStatus(dirty.current?'等待保存':'已保存至帳號');return true;
  }catch(cause){if(alive.current&&generation.current===token){if(!(cause instanceof Error&&cause.message.includes('已變更'))){try{const recovered=await fetch('/api/opening-drafts?id='+id+'&operationScope='+encodeURIComponent(requestScope));const value=await recovered.json() as Reply;if(recovered.ok&&value.operationScope===requestScope&&value.draft&&same(value.draft.body,snapshot)&&alive.current&&generation.current===token){apply(value.draft,false);dirty.current=!same(current.current,snapshot);setPreview(value.preview);setCandidate(value.world);setFailed(false);setStatus(dirty.current?'等待保存':'已保存至帳號');return true;}}catch{/* Keep the original input and operation when recovery is also unavailable. */}}setFailed(true);setStatus('未同步');setError(cause instanceof Error?cause.message:'未同步：請保留原輸入並恢復保存。');}return false;}finally{if(generation.current===token)writing.current=null;}})();writing.current=work;return work;
 },[id,conflict,apply,acceptArrangement]);
 useEffect(()=>{if(loading||busy||failed||conflict||!dirty.current||!id)return;const timer=setTimeout(()=>void save(),500);return()=>clearTimeout(timer);},[body,id,loading,busy,failed,conflict,save]);
 const flush=async()=>{if(conflict)return false;let accepted=await save();while(accepted&&dirty.current)accepted=await save();return accepted;};
 useDraftNavigation(dirty.current||!!writing.current,flush);
 const stage=stageOf(body.step);
 const updateCity=(city:OpeningCity)=>change({...current.current,city});
 const updateCharacter=(index:number,value:Partial<OpeningCharacter>)=>updateCity({...body.city,characters:body.city.characters.map((actor,i)=>i===index?{...actor,...value}:actor)});
 const sceneFor=(placeId:string)=>{const place=body.city.places.find(value=>value.id===placeId);return place&&scenes.find(scene=>scene.id===place.templateId&&scene.version===place.version);};
 const roomsFor=(placeId:string)=>[...(sceneFor(placeId)?.rooms??[]),...(body.city.finalization?.spaces.find(space=>space.placeId===placeId)?.rooms??[])];
 const sourceName=(cardId:string)=>cards.find(card=>card.id===cardId)?.fields.name??cardId;
 const transition=async(step:number)=>{if(step>1&&!body.city.characters.length){setError('至少選擇一位完成人物卡。');return;}if(step>3&&!body.city.places.length){setError('至少選擇一處場景。');return;}setBusy(true);change({...current.current,step,...(step===3?{city:fillUniqueStarts(current.current.city,scenes)}:{})});if(await flush()){if(step>=4){try{const r=await fetch('/api/opening-drafts?id='+id+'&preview=1&operationScope='+encodeURIComponent(accountScope.current));const data=await r.json() as Reply;if(!r.ok)throw Error(data.error||'無法確認開局。');setPreview(data.preview);setCandidate(data.world);acceptArrangement(data);}catch(cause){setError(cause instanceof Error?cause.message:'無法確認開局。');}}}setBusy(false);requestAnimationFrame(()=>document.getElementById('opening-stage-title')?.focus());};
 const create=async()=>{const token=generation.current,requestScope=accountScope.current;const active=()=>alive.current&&generation.current===token&&accountScope.current===requestScope;setBusy(true);try{if(!pendingCreation.current){if(!await flush()||!active())return;if(!candidate||preview?.issues.length)throw Error('請先返回確認並修正開局問題。');pendingCreation.current={id,draftId:id,draftVersion:version.current,operationScope:accountScope.current};setCreating(true);}const response=await fetch('/api/saves',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pendingCreation.current)});const data=await response.json() as {save?:{id:string};error?:string};if(!response.ok||!data.save?.id)throw Error(data.error||'保存結果尚未確認，請恢復原存檔操作。');if(active())router.push(boundPath('/observe',requestScope,{save:data.save.id}));}catch(cause){if(active())setError(cause instanceof Error?cause.message:'尚未確認保存，原草稿與操作已保留。');}finally{if(active())setBusy(false);}};
 const author=async(path:string)=>{const token=generation.current,requestScope=accountScope.current;setBusy(true);const saved=await flush();if(!alive.current||generation.current!==token||accountScope.current!==requestScope)return;if(saved)router.push(boundPath(path,requestScope,{returnTo:boundPath('/new',requestScope,{draft:id})}));else setBusy(false);};
 const cardToggle=(card:CharacterCard,checked:boolean)=>updateCity({...body.city,characters:checked?[...body.city.characters,{templateId:card.id,version:card.version,placeId:'',roomId:'',openingNeeds:{...defaults}}]:body.city.characters.filter(value=>value.templateId!==card.id)});
 const clearUnselectedReferences=()=>{const selected=new Set(body.city.characters.map(actor=>actor.templateId));updateCity({...body.city,relationships:body.city.relationships?.filter(relation=>selected.has(relation.from)&&(relation.targetType!=='character'||selected.has(relation.to))),accessGrants:body.city.accessGrants?.filter(grant=>selected.has(grant.characterTemplateId))});};
 const addPlace=(scene:SceneTemplate)=>{let n=1;while(body.city.places.some(place=>place.id==='place-'+n))n++;updateCity(fillUniqueStarts({...body.city,places:[...body.city.places,{id:'place-'+n,templateId:scene.id,version:scene.version,name:scene.name}]},scenes));};
 const removePlace=(placeId:string)=>{if(placeHasConfiguration(body.city,placeId)){setSelectionNotice('此場所仍有已填起點、住處、所有權、工作、許可或空間／道路配置；尚未移除。請先返回世界配置明示核對或解除引用。');return;}updateCity({...body.city,places:body.city.places.filter(place=>place.id!==placeId),...(body.city.finalization?{finalization:{...body.city.finalization,spaces:body.city.finalization.spaces.filter(space=>space.placeId!==placeId)}}:{})});};
 const placeOptions=body.city.places.map((place,index)=><option key={place.id} value={place.id}>{place.name}{body.city.places.some(other=>other.id!==place.id&&other.name===place.name)?`（場所 ${index+1}）`:''}</option>);
 const refresh=async()=>{try{await loadLibrary();}catch(cause){setError(cause instanceof Error?cause.message:'來源未更新。');}};
 if(loading)return <main className="opening-wizard">{header}<SaveNavigation owner={owner}/><p role="status">正在讀取開局草稿…</p></main>;
 const missingStart=stage===2?body.city.characters.find(actor=>!actor.placeId||!actor.roomId):undefined;
 const missingStartLabel=missingStart?`${sourceName(missingStart.templateId)} 還沒選${missingStart.placeId?'起始房間':'起始場所'}`:'';
 const goToMissingStart=()=>{if(!missingStart)return;const field=document.querySelector(`select[aria-label="${CSS.escape(sourceName(missingStart.templateId)+(missingStart.placeId?'起始房間':'起始場所'))}"]`) as HTMLElement|null;field?.scrollIntoView({block:'center'});field?.focus();};
 const blockedReason=failed?'請先恢復草稿保存。':conflict?'請先處理草稿版本衝突。':
  arrangement?.state==='pending'?'AI 正在整理開局，請等待結果。':
  stage===1&&!body.city.characters.length?'至少選一位人物，才能前往場景。':
  stage===2&&!body.city.places.length?'先加入至少一個場所，再核對開局。':
  stage===2&&!body.name.trim()?'請填寫存檔名稱。':
  missingStart?missingStartLabel+'。':
  body.step>=4&&preview?.issues.length?'請修正上方列出的開局問題。':
  body.step>=4&&!candidate?'正在等待開局確認結果。':'';
 return <main className="opening-wizard">{header}<SaveNavigation owner={owner}/><h1 className="page-title">建立你的世界</h1>
  <div className="journey-heading"><p>先準備人物，再安排他們生活的地方。隨時可離開，從存檔頁接續。</p><p role="status" aria-live="polite" className="opening-status">{status}</p></div>{error&&<p role="alert">{error}</p>}{selectionNotice&&<p role="alert">{selectionNotice}</p>}{unselectedCharacterReferences(body.city)&&<section role="alert" aria-label="人物選擇變更需核對"><p>已保留原關係與許可，其中仍引用未選人物。請重新選取原人物，或明示移除這些引用；未核對完成不能建立世界。</p><button disabled={busy||conflict||creating||arrangement?.state==='pending'||!!finalized} onClick={clearUnselectedReferences}>明示移除未選人物的關係與許可</button></section>}
  {failed&&<button onClick={()=>{setFailed(false);void save();}} disabled={busy||conflict}>恢復草稿保存</button>}
  {conflict&&<button onClick={()=>window.location.reload()}>重新載入伺服器版本（捨棄本頁未同步修改）</button>}
  {finalized?<section className="panel"><p>這份開局已保存為世界，不會重複建立。</p><Link href={boundPath('/observe',owner,{save:finalized})}>繼續已保存的世界</Link></section>:<>
  <ol className="opening-progress" aria-label="三段開局">
   {steps.map((name,index)=><li key={name}>
    <button type="button" aria-current={stage===index+1?'step':undefined}
     disabled={busy||creating||arrangement?.state==='pending'||index+1>=stage}
     onClick={()=>void transition(storedSteps[index])}><span>{index+1}</span>{name}</button>
   </li>)}
  </ol>
  <fieldset className="opening-content" disabled={busy||conflict||creating||arrangement?.state==='pending'}>
   <section className="panel opening-stage">
    <h2 id="opening-stage-title" tabIndex={-1}>{steps[stage-1]}</h2>
    {stage===1&&<>
     <p className="hint">勾選要一起生活的人物卡；人物卡的數值不會因為選入而改變。</p>{!cards.length&&<aside className="journey-note"><strong>還沒有人物卡</strong><p>先到人物頁做一張，完成後會自動帶回這裡並勾選。第一次製作需要設定模型與 API Key，人物頁會帶你完成。</p></aside>}
     <div className="opening-actions">
      <button className={!cards.length?'opening-primary':undefined} onClick={()=>void author('/character-templates')}>{cards.length?'再做一張人物卡':'製作第一張人物卡'}</button>
      {!!cards.length&&<button onClick={()=>void refresh()}>重新讀取人物與場景庫</button>}
     </div>
     
     <div className="opening-grid">
      {cards.map(card=><article className="opening-option" key={card.id}>
       <label><input type="checkbox" checked={body.city.characters.some(actor=>actor.templateId===card.id)} onChange={event=>cardToggle(card,event.target.checked)}/>
        {card.fields.name}{cards.filter(other=>other.fields.name===card.fields.name).length>1?`（版本 ${card.version}）`:''}</label>
       {card.fields.background&&<p>{card.fields.background}</p>}
       <details><summary>查看人物數值</summary><p>力量 {card.values.strength}／耐力 {card.values.endurance}／靈巧 {card.values.dexterity}／感知 {card.values.perception}／外觀 {card.values.appearance}；精神容量 {card.capacity}</p></details>
      </article>)}
     </div>
    </>}
    {stage===2&&<>
     <p className="hint">從場景範本加入這次要用的場所。同一範本可以加入多次。</p>
     <div className="opening-actions">
      <button className={!scenes.length?'opening-primary':undefined} onClick={()=>void author('/scene-templates')}>建立場景並返回</button>
      {!!scenes.length&&<button onClick={()=>void refresh()}>重新讀取人物與場景庫</button>}
     </div>
     {!scenes.length&&<p className="opening-empty">目前沒有場景範本。先建立場所與至少一個房間，保存後直接帶回這次開局。</p>}
     <div className="opening-grid">
      {scenes.map(scene=><article className="opening-option" key={JSON.stringify([scene.id,scene.version])}>
       <h3>{scene.name}</h3><p>{scene.rooms.map(room=>room.name).join('、')}</p>
       <button disabled={body.city.places.length>=8} onClick={()=>addPlace(scene)}>加入 {scene.name}{scenes.filter(value=>value.id===scene.id).length>1?'（版本 '+scene.version+'）':''}</button>
      </article>)}
     </div>
     <h3 className="opening-section-title">本次場所（{body.city.places.length}／8）</h3>
     {!body.city.places.length&&<p className="opening-empty">尚未加入任何場所。</p>}
     {body.city.places.map((place,index)=><div className="opening-place-row" key={place.id}>
      <label>場所 {index+1} 名稱<input value={place.name} maxLength={80} onChange={event=>updateCity({...body.city,places:body.city.places.map(value=>value.id===place.id?{...value,name:event.target.value}:value)})}/></label>
      <button onClick={()=>removePlace(place.id)}>移除 {place.name}</button>
     </div>)}
    </>}
   {stage===2&&<><h3 className="opening-section-title">這次的生活起點</h3><label>存檔名稱<input name="opening-name" value={body.name} maxLength={80} onChange={event=>change({...body,name:event.target.value})}/></label><label>開局描述（選填）<textarea name="opening-description" value={body.description} maxLength={1600} onChange={event=>change({...body,description:event.target.value})}/></label><p className="hint">必填：每個人的起始場所與房間。只有一個選項時會先幫你選好；其他都是選填，可以之後再展開。</p>


    {body.city.characters.map((actor,index)=>{const card=cards.find(card=>card.id===actor.templateId);return <article className="panel" key={actor.templateId} style={{padding:16,marginBlock:16}}><h3>{sourceName(actor.templateId)}</h3>
     <label>起始場所（必填）<select aria-label={sourceName(actor.templateId)+'起始場所'} aria-invalid={!actor.placeId||undefined} value={actor.placeId} onChange={event=>updateCharacter(index,{placeId:event.target.value,roomId:roomsFor(event.target.value).length===1?roomsFor(event.target.value)[0].id:''})}><option value="">請選擇</option>{placeOptions}</select></label><label>起始房間（必填）<select aria-label={sourceName(actor.templateId)+'起始房間'} aria-invalid={!!actor.placeId&&!actor.roomId||undefined} value={actor.roomId} disabled={!actor.placeId} onChange={event=>updateCharacter(index,{roomId:event.target.value})}><option value="">請選擇</option>{roomsFor(actor.placeId).map(room=><option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
     <details className="opening-advanced"><summary>選填：調整本次需求與精神電量</summary><p className="hint">預設：飢餓 20、口渴 20、體力疲勞 15、睡眠需求 20；精神電量採容量七成。</p><fieldset><legend>本次需求（0–100，越高越強）</legend>{needs.map(([key,label])=><label key={key}>{label}<input aria-label={sourceName(actor.templateId)+label} type="number" min={0} max={100} step="0.01" value={actor.openingNeeds?.[key]??defaults[key]} onChange={event=>updateCharacter(index,{openingNeeds:{...defaults,...actor.openingNeeds,[key]:Number(event.target.value)}})}/></label>)}</fieldset>
     <label>目前精神電量（容量 {card?.capacity}，留空採七成）<input aria-label={sourceName(actor.templateId)+'目前精神電量'} type="number" min={0} max={card?.capacity} step={1} value={actor.mentalOpening?.current??''} onChange={event=>updateCharacter(index,{mentalOpening:event.target.value===''?{}:{current:Number(event.target.value)}})}/></label></details>
     <details><summary>選填：住處、工作、所有權與許可</summary><label>住處<select aria-label={sourceName(actor.templateId)+'住處'} value={actor.homeId??''} onChange={event=>updateCharacter(index,{homeId:event.target.value||undefined,homeRoomId:undefined})}><option value="">未指定</option>{placeOptions}</select></label><label>臥室<select aria-label={sourceName(actor.templateId)+'臥室'} value={actor.homeRoomId??''} onChange={event=>updateCharacter(index,{homeRoomId:event.target.value||undefined})}><option value="">未指定</option>{roomsFor(actor.homeId??'').map(room=><option key={room.id} value={room.id}>{room.name}</option>)}</select></label>{body.city.places.map(place=><div key={place.id}><b>{place.name}</b>{(['workplaceIds','ownedPlaceIds'] as const).map(key=><label key={key}><input type="checkbox" checked={actor[key]?.includes(place.id)??false} onChange={event=>updateCharacter(index,{[key]:event.target.checked?[...(actor[key]??[]),place.id]:(actor[key]??[]).filter(id=>id!==place.id)})}/>{key==='workplaceIds'?'工作場所':'所有場所'}</label>)}<label><input type="checkbox" checked={body.city.accessGrants?.some(grant=>grant.placeId===place.id&&!grant.roomId&&grant.characterTemplateId===actor.templateId)??false} onChange={event=>updateCity({...body.city,accessGrants:event.target.checked?[...(body.city.accessGrants??[]),{placeId:place.id,characterTemplateId:actor.templateId}]:(body.city.accessGrants??[]).filter(grant=>!(grant.placeId===place.id&&!grant.roomId&&grant.characterTemplateId===actor.templateId))})}/>個別建築進入許可</label>{roomsFor(place.id).map(room=><label key={room.id}><input type="checkbox" checked={body.city.accessGrants?.some(grant=>grant.placeId===place.id&&grant.roomId===room.id&&grant.characterTemplateId===actor.templateId)??false} onChange={event=>updateCity({...body.city,accessGrants:event.target.checked?[...(body.city.accessGrants??[]),{placeId:place.id,roomId:room.id,characterTemplateId:actor.templateId}]:(body.city.accessGrants??[]).filter(grant=>!(grant.placeId===place.id&&grant.roomId===room.id&&grant.characterTemplateId===actor.templateId))})}/>{room.name}個別許可</label>)}</div>)}<p>所有權、出入許可、實際道路與角色知情各自保存；授權不會打開門或給予全部知識。</p></details>
    </article>;})}
    <OpeningExtrasEditor city={body.city} cards={cards} scenes={scenes} update={updateCity}/><OpeningRelations city={body.city} cards={cards} update={updateCity}/><OpeningRoads city={body.city} update={updateCity}/>
   </>}
   {stage===3&&<><div className="journey-note"><h3>{body.name}</h3><p>{body.city.characters.length} 名人物 · {body.city.places.length} 個場所 · 第 0 回合</p><p>{body.description}</p><p>確認後保存並進入觀察。時間保持在開局，直到你主動推進。</p></div>{!preview&&<p>請等待草稿保存及確認結果。</p>}{preview?.issues.length? <div role="alert"><h3>建立前需修正</h3><ul>{preview.issues.map((issue,index)=><li key={index}>{issue}</li>)}</ul></div>:null}{candidate&&<><h3>本次實際人物與初值</h3>{candidate.characters.map(actor=><article key={actor.id}><h4>{actor.name} · 來源：{sources.cards.find(card=>card.id===actor.profileSource?.id&&card.version===actor.profileSource?.version)?.fields.name??'完成人物卡'}（版本 {actor.profileSource?.version}）</h4><p>{actor.profile?.background}</p><p>力量 {actor.attributes?.values.strength}／耐力 {actor.attributes?.values.endurance}／靈巧 {actor.attributes?.values.dexterity}／感知 {actor.attributes?.values.perception}／外觀 {actor.attributes?.values.appearance}（外觀不參與檢定）</p><p>精神容量 {actor.mentalEnergy?.policy.maximum}，目前 {actor.mentalEnergy?.value}</p><p>需求：飢餓 {actor.needs?.values.hunger}／口渴 {actor.needs?.values.thirst}／體力疲勞 {actor.needs?.values.fatigue}／睡眠 {actor.needs?.values.sleep}</p><p>起點：{preview?.characters.find(person=>person.templateId===actor.profileSource?.id)?.place}／{preview?.characters.find(person=>person.templateId===actor.profileSource?.id)?.room}</p><p>住處：{preview?.characters.find(person=>person.templateId===actor.profileSource?.id)?.home||'未指定'}；臥室：{preview?.characters.find(person=>person.templateId===actor.profileSource?.id)?.bedroom||'未指定'}；工作場所：{preview?.characters.find(person=>person.templateId===actor.profileSource?.id)?.workplaces?.join('、')||'未指定'}；所有場所：{preview?.characters.find(person=>person.templateId===actor.profileSource?.id)?.ownedPlaces?.join('、')||'未指定'}</p><p>需求特性：飢餓 {actor.needs?.personal?.traits.hunger}／口渴 {actor.needs?.personal?.traits.thirst}／睡眠 {actor.needs?.personal?.traits.sleep}</p></article>)}<h3>本次場所及連接</h3>{preview?.places.map(place=><article key={place.id}><h4>{place.name}（來源 {place.templateName}）</h4><p>房間：{place.rooms.map(room=>room.name).join('、')}</p><p>物件：{place.objects.map(object=>object.name).join('、')||'無'}</p><p>門：{place.connections.map(connection=>connection.name+'（'+(connection.state==='closed'?'關閉':connection.state==='open'?'開啟':connection.state)+'）').join('、')||'無'}</p></article>)}<p>跨場所道路：{preview?.walks?.map(walk=>walk.places.map(id=>body.city.places.find(place=>place.id===id)?.name).join(' ↔ ')+' '+(walk.minutes===null?'不可步行':walk.minutes+'分鐘')).join('；')||'未安排；場所間不可步行'}</p>{preview&&<CityAccessPreview preview={preview}/>}{preview?.relationships?.map((relation,index)=><p key={index}>{relation.from} → {relation.to}：{relation.description}</p>)}</>}</>}

  </section></fieldset>
  {stage===2&&<OpeningArrangementPanel key={id} owner={owner} draftId={id} arrangement={arrangement} previousArrangement={previousArrangement} cards={sources.cards} scenes={sources.scenes} onPrepare={async()=>{if(!await flush())return;return {version:version.current};}} onBusy={setBusy} onReply={data=>{if(data.draft){apply(data.draft);setStatus('已保存至帳號');}acceptArrangement(data);setPreview(data.preview);setCandidate(data.world);}}/>}
  <footer className="panel opening-footer">
   <p className="hint" id="opening-next-hint">{blockedReason||(
    stage===1?`已選 ${body.city.characters.length} 名人物`:
    stage===2?`已加入 ${body.city.places.length} 個場所`:'')}</p>
   <div className="opening-actions">
    {missingStart&&!failed&&!conflict&&<button type="button" disabled={busy} onClick={goToMissingStart}>帶我去填</button>}
    {stage>1&&<button disabled={busy||creating||arrangement?.state==='pending'} onClick={()=>void transition(storedSteps[stage-2])}>上一步，返回修改</button>}
    <button className="opening-primary" aria-describedby={blockedReason?'opening-next-hint':undefined}
     disabled={busy||Boolean(blockedReason)} onClick={()=>void(stage<3?transition(storedSteps[stage]):create())}>
     {busy?'處理中…':stage<3?`下一步：${steps[stage]}`:creating?'恢復原存檔操作':'確認開局，進入觀察'}
    </button>
   </div>
  </footer>
  </>}
 </main>;
}
