'use client';
import {useEffect,useRef,useState} from 'react';
import {modelRoleReady,type ModelSettingsView} from '@/lib/model-settings';
import {roundClientMs} from '@/lib/round-time-policy';
import type {ArrangementView} from '@/lib/opening-arrangement-store';
import type {OpeningDraft} from '@/lib/opening-drafts';
import type {CharacterCard} from '@/lib/character-cards';
import type {SceneTemplate} from '@/lib/scene-templates';
import type {CityDraft,CityPreview} from '@/lib/city-draft';
import {reconcileOpeningRoads,roadBaseline} from '@/lib/opening-proposal-adoption';
import {openingRoadNetwork,withOpeningRoads} from '@/lib/opening-road-network';
import {openingStartLocks,protectOpeningStart} from '@/lib/opening-starts';
import type {World} from '@/lib/world';
import {OpeningExtrasEditor,OpeningRelations,OpeningRoads,OpeningGrantsEditor} from './opening-configuration-controls';
import OpeningRoomItemSuggestions from './opening-room-item-suggestions';
import ModelSettingsPanel from './model-settings-panel';
type Reply={previousArrangement?:ArrangementView;operationScope?:string;draft?:OpeningDraft;arrangement?:ArrangementView;preview?:CityPreview;world?:World;error?:string;modelSettingsRequired?:boolean;operationUncertain?:boolean};
type Pending={id:string;version:number;operationId:string;operationScope:string;worldContext?:string;supplyRooms?:boolean;recommendRoads?:boolean;repairOf?:{operationId:string;version:number}};
class RequestFailure extends Error{constructor(message:string,readonly status:number,readonly settled=false){super(message);}}
export default function OpeningArrangementPanel({owner,draftId,city,arrangement,previousArrangement,cards,scenes,onPrepare,onReply,onBusy}:{city:CityDraft;owner:string;draftId:string;arrangement?:ArrangementView;previousArrangement?:ArrangementView;cards:CharacterCard[];scenes:SceneTemplate[];onPrepare:()=>Promise<{version:number}|undefined>;onReply:(reply:Reply)=>void;onBusy:(busy:boolean)=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[models,setModels]=useState(false),[pending,setPending]=useState<Pending>(),[edited,setEdited]=useState<CityDraft>();
 const [unsavedSelectionFor,setUnsavedSelectionFor]=useState<string>();
 const [supplyRooms,setSupplyRooms]=useState(true);
 const [requestRoads,setRequestRoads]=useState(true);
 const multiplePlaces=city.places.length>1;
 const recommendRoads=multiplePlaces&&requestRoads;
 const roadCity=edited&&arrangement?.originalRoads?reconcileOpeningRoads(arrangement.originalRoads,city,edited):edited;
 const network=roadCity&&arrangement?.recommendRoads?openingRoadNetwork(roadCity):undefined;
 const roadProblems=arrangement?.receipts?.roads?[]:network?.problems??[];
 const alive=useRef(true),sequence=useRef(0);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const cityKey=JSON.stringify(arrangement?.city);useEffect(()=>{queueMicrotask(()=>{if(alive.current)setEdited(cityKey?JSON.parse(cityKey):undefined);});},[cityKey,arrangement?.operationId]);
 const dirty=!!edited&&JSON.stringify(edited)!==cityKey;
 const changed=(value:CityDraft)=>{setEdited(value);setNotice('建議修改尚未保存');setError('');};
 const working=(value:boolean)=>{setBusy(value);onBusy(value);};
 async function readOriginal(operation?:string){const response=await fetch('/api/opening-drafts?id='+encodeURIComponent(draftId)+'&operationScope='+encodeURIComponent(owner));const body=await response.json() as Reply;if(!response.ok||body.operationScope!==owner)throw new RequestFailure(body.error||'原帳號已變更，原輸入未同步。',response.status);if(operation&&body.arrangement?.operationId!==operation)return;return body;}
 async function post(input:object,active:()=>boolean){const response=await fetch('/api/opening-drafts/arrange',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(roundClientMs)});const body=await response.json() as Reply;if(!active())return;if(body.operationScope&&body.operationScope!==owner)throw new RequestFailure('原帳號已變更，原輸入未同步。',409);if(body.modelSettingsRequired)setModels(true);if(!response.ok){if(body.arrangement?.state==='failed'){onReply(body);if(body.previousArrangement)setNotice('原操作已停止：'+(body.error||'整理未完成')+'；前一份已保存建議保留。');}throw new RequestFailure(body.error||'AI整理結果尚未確認，請恢復原操作。',response.status,body.arrangement?.state==='failed');}return body;}
 async function generate(recover=false,repair=false){if(busy)return;const token=++sequence.current,active=()=>alive.current&&sequence.current===token;working(true);setError('');setNotice('');let input=pending,keepPending=false;
  try{
   if(!input&&recover&&arrangement?.state==='pending')input={id:draftId,version:arrangement.inputVersion,operationId:arrangement.operationId,operationScope:owner};
   if(!input){const prepared=await onPrepare();if(!prepared||!active())return;const expected='account-operations:'+owner;const settingsResponse=await fetch('/api/model-settings?accountScope='+encodeURIComponent(expected));const settings=await settingsResponse.json() as ModelSettingsView;if(!settingsResponse.ok||settings.accountScope!==expected)throw new RequestFailure('無法核對原帳號模型設定，原輸入已保留。',409);if(!modelRoleReady(settings,'adjudication')){setModels(true);return;}const contextResponse=await fetch('/api/world?workspace=account&operationScope='+encodeURIComponent(expected));const context=await contextResponse.json() as {operationScope?:string;world?:{contextId?:string}};if(!contextResponse.ok||context.operationScope!==expected||!context.world?.contextId)throw new RequestFailure('無法核對原帳號製作操作，請回原帳號恢復。',409);
    let repairOf:Pending['repairOf'];
    if(repair&&arrangement&&edited){
     let revision=arrangement.version;
     if(dirty||roadCity&&JSON.stringify(roadBaseline(roadCity))!==JSON.stringify(roadBaseline(edited))){
      const saved=await post({operationScope:owner,id:draftId,operationId:arrangement.operationId,version:prepared.version,proposalVersion:revision,action:'edit',city:roadCity?withOpeningRoads(edited,roadCity):edited},active);
      if(!saved?.arrangement)return;
      onReply(saved);
      revision=saved.arrangement.version;
     }
     repairOf={operationId:arrangement.operationId,version:revision};
    }
    input={id:draftId,version:prepared.version,operationId:Date.now()+':'+crypto.randomUUID(),operationScope:owner,worldContext:context.world.contextId,...(repairOf?{repairOf}:{supplyRooms,recommendRoads})};}
   if(!active())return;keepPending=true;setPending(input);const body=await post(input,active);if(!body)return;onReply(body);if(body.arrangement?.state==='pending'){setNotice('原整理仍在處理，請稍後明示恢復同一操作。');}else{keepPending=false;setPending(undefined);setNotice(body.arrangement?.state==='failed'?'': 'AI建議已保存，尚未採納；請查看與修改。');if(body.arrangement?.state==='failed')setError(body.arrangement.error||'整理未完成，原設定已保留。');}
  }catch(cause){if(!active())return;if(cause instanceof RequestFailure&&(cause.status<500||cause.settled)){keepPending=false;setPending(undefined);}setError(cause instanceof Error?cause.message:'結果尚未確認，原設定與操作已保留。');if(input&&!(cause instanceof RequestFailure&&(cause.status<500||cause.settled))){try{const recovered=await readOriginal(input.operationId);if(recovered&&active()){onReply(recovered);if(recovered.arrangement?.state!=='pending'){keepPending=false;setPending(undefined);if(recovered.arrangement?.state==='failed'){setError(recovered.arrangement.error||'整理未完成');setNotice('原操作已停止：已讀回失敗結果，已保存建議保留。');}else{setError('');setNotice('已讀回原整理結果，沒有新增模型請求。');}}}}catch{/* Keep the original operation and inputs when scoped read-back is unavailable. */}}}
  finally{if(active()){setBusy(false);onBusy(keepPending);}}
 }
 async function saveProposal(adopt:boolean|'roads'){if(!arrangement||!edited||busy)return;const token=++sequence.current,active=()=>alive.current&&sequence.current===token;working(true);setError('');setNotice('');const input={operationScope:owner,id:draftId,version:arrangement.inputVersion,operationId:arrangement.operationId,proposalVersion:arrangement.version,action:adopt==='roads'?'adoptRoads':adopt?'adopt':'edit',city:edited};
  try{const prepared=await onPrepare();if(!prepared||!active())return;if(adopt&&dirty){
     const editedReply=await post({...input,action:'edit',version:prepared.version},active);
     if(!editedReply?.arrangement)return;
     onReply(editedReply);
     input.proposalVersion=editedReply.arrangement.version;
    }
    const body=await post({...input,version:prepared.version},active);if(!body)return;onReply(body);setNotice(adopt==='roads'?'道路已採納，其餘建議可接續整理。':adopt?'建議已採納到本次開局草稿，仍可手動修改。':'建議修改已保存，尚未採納。');}
  catch(cause){if(!active())return;setError(cause instanceof Error?cause.message:'建議修改未同步，原輸入已保留。');if(!(cause instanceof RequestFailure&&(cause.status<500||cause.settled))){try{const recovered=await readOriginal(arrangement.operationId);if(recovered&&active()&&((adopt==='roads'&&recovered.arrangement?.receipts?.roads)||(adopt===true&&recovered.arrangement?.state==='adopted')||(!adopt&&JSON.stringify(recovered.arrangement?.city)===JSON.stringify(edited)))){onReply(recovered);setError('');setNotice('已恢復原先保存的建議操作，沒有呼叫模型。');}}catch{/* Do not overwrite unsynchronized local edits with another account or revision. */}}}
  finally{if(active())working(false);}
 }
 async function submitItems(action:'selectItems'|'adoptItems',excludedItems:string[]){
  if(!arrangement||busy)return false;
  if(action==='selectItems')setUnsavedSelectionFor(arrangement.operationId);
  const token=++sequence.current, active=()=>alive.current&&sequence.current===token;
  working(true);setError('');setNotice('');
  try{
   const prepared=await onPrepare();if(!prepared||!active())return false;
   let revision=arrangement.version;
   if(dirty&&edited){
    const saved=await post({operationScope:owner,id:draftId,version:prepared.version,operationId:arrangement.operationId,proposalVersion:revision,action:'edit',city:edited},active);
    if(!saved?.arrangement)return false;
    onReply(saved);
    revision=saved.arrangement.version;
   }
   const body=await post({operationScope:owner,id:draftId,version:prepared.version,operationId:arrangement.operationId,proposalVersion:revision,action,excludedItems},active);
   if(!body)return false;
   setUnsavedSelectionFor(undefined);onReply(body);setNotice(action==='adoptItems'?'所選物品已加入開局草稿。':'物品選擇已保存。');return true;
  }catch(cause){
   if(!active())return false;
   if(!(cause instanceof RequestFailure&&cause.status<500)){
    try{const restored=await readOriginal(arrangement.operationId);
     if(restored&&active()&&JSON.stringify(restored.arrangement?.roomItems?.excludedItems)===JSON.stringify(excludedItems)&&(action==='selectItems'||restored.arrangement?.receipts?.items)){
      setUnsavedSelectionFor(undefined);onReply(restored);setNotice('已讀回保存的物品選擇。');return true;
     }
    }catch{/* Keep local choices until a scoped read can confirm them. */}
   }
   if(active())setError(cause instanceof Error?cause.message:'物品選擇未同步。');
   return false;
  }finally{if(active())working(false);}
 }
 const pendingView=!!pending||arrangement?.state==='pending';
 return <section className="panel" style={{padding:16,marginBlock:16}} aria-label="AI整理世界配置"><h3>可選：AI整理開局</h3><p>使用本步驟的開局描述、已選人物卡與場景，保留已填安排。先保存建議，查看、修改及採納後才成為本次開局；不會建立世界或自動推進。</p>
  <label><input type="checkbox" checked={recommendRoads} disabled={!multiplePlaces||busy||pendingView} onChange={event=>setRequestRoads(event.target.checked)}/>建議跨場所步行道路</label>
  {!multiplePlaces&&<p>單一場所或尚未選場所時，道路整理不適用。</p>}
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  <label><input type="checkbox" checked={supplyRooms} disabled={busy||pendingView} onChange={event=>setSupplyRooms(event.target.checked)}/>逐房配置物品</label>
  {supplyRooms&&<p>依各房間用途核對現有物品，列出建議新增的物品供逐件勾選。開局描述可留白。</p>}
  {pendingView?<button disabled={busy} onClick={()=>void generate(true)}>恢復原AI整理操作</button>:<button disabled={busy||dirty} onClick={()=>void generate()}>{arrangement?'明示請AI另整理一份建議':'請AI整理本次開局'}</button>}
  {previousArrangement&&arrangement?.state==='failed'&&<button disabled={busy} onClick={()=>{onReply({arrangement:previousArrangement});setError('');setNotice('已讀回前一份保存建議，沒有重新呼叫模型。');}}>取回前一份已保存建議</button>}
  {arrangement?.state==='failed'&&<p>原操作已停止：{arrangement.error}。沒有自動重試；若要重新請求，請明示按整理按鈕。</p>}
  {arrangement?.state==='adopted'&&<p>這份建議已採納，後續以本次開局的手動配置為準。</p>}
  {arrangement?.state==='complete'&&edited&&<fieldset disabled={busy} style={{padding:16}}><legend>{arrangement.receipts?.items||arrangement.receipts?.roads?'已保存的AI建議（部分已採納）':'已保存的AI建議（尚未採納）'}</legend><p>可以先保存建議修改，或直接採納。採納時會保留草稿中後來的手動修改。</p>{edited.characters.map((actor,index)=>{
    const current=city.characters.find(person=>person.templateId===actor.templateId)??actor;
    const start=protectOpeningStart(current,actor), locks=openingStartLocks(current);
    const name=cards.find(card=>card.id===actor.templateId)?.fields.name??'人物';const rooms=(placeId:string)=>{const place=edited.places.find(place=>place.id===placeId);const source=scenes.find(scene=>scene.id===place?.templateId&&scene.version===place?.version);return [...(source?.rooms??[]),...(edited.finalization?.spaces.find(space=>space.placeId===placeId)?.rooms??[])];};const update=(patch:Partial<typeof actor>)=>changed({...edited,characters:edited.characters.map((value,i)=>i===index?{...value,...patch}:value)});return <article key={actor.templateId}><h4>{name}的建議安排</h4>{locks.keepPlace&&<p>{locks.keepRoom?'沿用草稿的起始場所與房間。':'沿用草稿的起始場所，可調整該處的房間。'}</p>}<label>建議起始場所<select aria-label={name+'建議起始場所'} disabled={locks.keepPlace} value={start.placeId} onChange={event=>update({placeId:event.target.value,roomId:''})}><option value="">未指定</option>{edited.places.map(place=><option key={place.id} value={place.id}>{place.name}</option>)}</select></label><label>建議起始房間<select aria-label={name+'建議起始房間'} disabled={locks.keepRoom||!start.placeId} value={start.roomId} onChange={event=>update({placeId:start.placeId,roomId:event.target.value})}><option value="">未指定</option>{rooms(start.placeId).map(room=><option key={room.id} value={room.id}>{room.name}</option>)}</select></label><label>建議住處<select aria-label={name+'建議住處'} value={actor.homeId??''} onChange={event=>update({homeId:event.target.value||undefined,homeRoomId:undefined})}><option value="">未指定</option>{edited.places.map(place=><option key={place.id} value={place.id}>{place.name}</option>)}</select></label><label>建議臥室<select aria-label={name+'建議臥室'} value={actor.homeRoomId??''} onChange={event=>update({homeRoomId:event.target.value||undefined})}><option value="">未指定</option>{rooms(actor.homeId??'').map(room=><option key={room.id} value={room.id}>{room.name}</option>)}</select></label><fieldset><legend>建議工作與所有權</legend>{(['workplaceIds','ownedPlaceIds'] as const).map(key=><div key={key}><button onClick={()=>update({[key]:[]})}>{key==='workplaceIds'?'清空建議工作':'清空建議所有權'}</button>{edited.places.map(place=><label key={place.id}><input type="checkbox" checked={actor[key]?.includes(place.id)??false} onChange={event=>update({[key]:event.target.checked?[...(actor[key]??[]),place.id]:(actor[key]??[]).filter(id=>id!==place.id)})}/>{name}的{place.name}{key==='workplaceIds'?'工作':'所有權'}</label>)}</div>)}</fieldset></article>;})}
   {arrangement.roomItems&&<OpeningRoomItemSuggestions key={arrangement.operationId} city={edited} review={arrangement.roomItems} adopted={!!arrangement.receipts?.items} disabled={busy} onSubmit={submitItems}/>}
   <OpeningGrantsEditor city={edited} cards={cards} scenes={scenes} update={changed}/><OpeningExtrasEditor city={edited} cards={cards} scenes={scenes} update={changed}/><OpeningRelations city={edited} cards={cards} update={changed}/>{arrangement.recommendRoads?<section aria-label="道路建議"><h4>跨場所步行道路</h4><p aria-live="polite">{roadProblems.join(' ')||'未隔離的場所可分段互達。'}</p>{(network?.groups.length??0)>1&&!arrangement.receipts?.roads&&<button type="button" disabled={busy} onClick={()=>void generate(false,true)}>請 AI 補路</button>}<OpeningRoads city={arrangement.receipts?.roads?city:roadCity??edited} update={value=>changed(withOpeningRoads(edited,value))} preview disabled={!!arrangement.receipts?.roads}/><button type="button" disabled={busy||!!arrangement.receipts?.roads||roadProblems.length>0} onClick={()=>void saveProposal('roads')}>{arrangement.receipts?.roads?'道路已採納':'採納道路'}</button></section>:arrangement.recommendRoads===undefined?<OpeningRoads city={edited} update={changed}/>:null}
   {arrangement.preview?.issues.length?<ul role="alert">{arrangement.preview.issues.map((issue,index)=><li key={index}>{issue}</li>)}</ul>:null}<button disabled={!dirty||busy} onClick={()=>void saveProposal(false)}>保存建議修改</button>{roadProblems.length>0&&<p id="opening-adopt-road-gap">採納道路與全部採納前，請補上連接或指定隔離。{roadProblems.join(' ')}</p>}<button aria-describedby={roadProblems.length?'opening-adopt-road-gap':undefined} disabled={busy||roadProblems.length>0||unsavedSelectionFor===arrangement.operationId} onClick={()=>void saveProposal(true)}>全部採納</button>
  </fieldset>}
  {models&&<ModelSettingsPanel originalAccountScope={'account-operations:'+owner} onClose={()=>setModels(false)}/>}
 </section>;
}
