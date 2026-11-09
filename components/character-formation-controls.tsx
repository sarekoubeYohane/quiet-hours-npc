'use client';
import { useEffect,useState } from 'react';
import { Button } from '@/components/ui/button';
import { cardAttributeLabels,cardAttributeNames,validCardAllocation,type CardValues } from '@/lib/character-cards';
import type { CharacterDraft } from '@/lib/character-drafts';
import { missingCharacterText } from '@/lib/character-drafts';
import { modelRoleReady,type ModelSettingsView } from '@/lib/model-settings';
import { roundClientMs } from '@/lib/round-time-policy';
type Reply={draft?:CharacterDraft;error?:string;modelSettingsRequired?:boolean};
class SaveFailure extends Error {constructor(message:string,readonly status:number){super(message);}}
export default function CharacterFormationControls({draft,onPrepare,onSaved,onBusy,onModels,disabled=false}:{disabled?:boolean;draft:CharacterDraft;onPrepare:()=>Promise<CharacterDraft|undefined>;onSaved:(draft:CharacterDraft)=>void;onBusy:(busy:boolean)=>void;onModels:()=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[allocation,setAllocation]=useState<CardValues>();
 const key=JSON.stringify(draft.formation?.values);
 useEffect(()=>{queueMicrotask(()=>setAllocation(key?JSON.parse(key):undefined));},[key,draft.id]);
 function working(value:boolean){setBusy(value);onBusy(value);}
 async function post(path:string,input:object){const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(roundClientMs)});const body=await response.json() as Reply;if(body.draft&&response.status!==409)onSaved(body.draft);if(body.modelSettingsRequired)onModels();if(!response.ok)throw new SaveFailure(body.error||'保存結果尚未確認，請恢復原操作。',response.status);return body;}
 async function recover(apply=true){try{const response=await fetch('/api/character-drafts');const data=await response.json() as {drafts?:CharacterDraft[]};const saved=data.drafts?.find(value=>value.id===draft.id);if(response.ok&&saved){if(apply)onSaved(saved);return saved;}}catch{/* Original inputs remain visible; recovery never dispatches a model. */}}
 async function form(){if(busy)return;working(true);setError('');setNotice('');try{
   const current=await onPrepare();if(!current)return;
   let payload:object;
   if(current.pendingFormation)payload={id:current.id,version:current.pendingFormation.inputVersion,operationId:current.pendingFormation.operationId,operationScope:current.pendingFormation.operationScope,worldContext:current.pendingFormation.worldContext};
   else{
    const availability=await fetch('/api/model-settings');const config=await availability.json() as ModelSettingsView;
    if(!availability.ok)throw Error('暫時無法讀取模型設定，文字已保留。');if(!modelRoleReady(config,'adjudication')){onModels();return;}
    const response=await fetch('/api/world?workspace=account');const context=await response.json() as {operationScope?:string;world?:{contextId?:string};error?:string};if(!response.ok||!context.operationScope||!context.world)throw Error(context.error||'暫時無法讀取形成操作設定。');
    if(current.accountScope&&current.accountScope!==context.operationScope)throw new SaveFailure('原帳號已變更，請回原帳號確認這份人物。',409);
    payload={id:current.id,version:current.version,operationId:Date.now()+':'+crypto.randomUUID(),operationScope:context.operationScope,worldContext:context.world.contextId};
   }
   await post('/api/character-drafts/form',payload);setNotice('數值已形成並保存；全部文字已鎖定。尚未保存為完成人物卡。');
  }catch(cause){setError(cause instanceof SaveFailure?cause.message:'形成回覆尚未確認，原輸入已保留；正在查詢原結果。');if(!(cause instanceof SaveFailure&&cause.status===409)){const restored=await recover();if(restored?.formation){setError('');setNotice('已恢復原先保存的形成結果，沒有重新取骰。');}}}finally{working(false);}}
 async function allocate(current:CharacterDraft){if(!allocation||!current.formation||!validCardAllocation(allocation,current.formation))throw Error('配點總分或界線不合法。');if(JSON.stringify(allocation)===JSON.stringify(current.formation.values))return current;const body=await post('/api/character-drafts/form',{action:'allocate',id:current.id,version:current.version,operationScope:current.accountScope,values:allocation});if(!body.draft)throw Error('配點保存結果尚未確認。');return body.draft;}
 async function save(complete:boolean){if(busy)return;working(true);setError('');setNotice('');try{const allocated=await allocate(draft);if(complete){await post('/api/character-cards',{id:allocated.id,version:allocated.version,operationScope:allocated.accountScope});setNotice('完成人物卡已保存，可供新世界選用。');}else setNotice('配點已保存，總分與容量保持原形成結果。');}catch(cause){setError(cause instanceof SaveFailure?cause.message:'保存回覆尚未確認，本頁配點已保留；正在查詢原結果。');if(!(cause instanceof SaveFailure&&cause.status===409)){const restored=await recover(false);if(restored?.completedCard&&complete){onSaved(restored);setError('');setNotice('已恢復原先保存的完成人物卡，沒有另建或重骰。');}else if(restored?.formation&&JSON.stringify(restored.formation.values)===JSON.stringify(allocation)){onSaved(restored);if(!complete){setError('');setNotice('已恢復原先保存的配點。');}}}}finally{working(false);}}
 const formed=draft.formation,values=allocation??formed?.values;
 return <section aria-label="人物數值形成與配點" className="space-y-3">
  {!formed?<><p>形成前可編輯文字。按「確認設定並產生數值」後，姓名、錯字與全部人物文字都會鎖定。沒有重骰按鈕；重載或尚未完成卡片也不會重抽。</p><Button type="button" disabled={disabled||busy||!!draft.pendingGeneration||(!draft.pendingFormation&&missingCharacterText(draft.fields).length>0)} onClick={()=>void form()}>{busy?'正在恢復或形成人物…':draft.pendingFormation?'恢復原形成操作':'確認設定並產生數值'}</Button></>:<>
   <h3>{draft.completedCard?'完成人物卡':'已形成，等待完成卡確認'}</h3><p>人物數值版本 2 · 文字已鎖定</p>
   <div className="grid gap-3 md:grid-cols-5">{cardAttributeNames.map(name=><label key={name}>{cardAttributeLabels[name]}<input aria-label={'配點'+cardAttributeLabels[name]} type="number" min={formed.minimums[name]} max={18} step={1} disabled={busy||!!draft.completedCard} value={values?.[name]??''} onChange={event=>setAllocation(previous=>({...previous??formed.values,[name]:Number(event.target.value)}))}/><span className="hint">可調範圍 {formed.minimums[name]}–18</span></label>)}</div>
   <p role="status">五項配點：{values?cardAttributeNames.reduce((sum,name)=>sum+values[name],0):0}／{formed.initialTotal}（初次總分固定）</p>
   <p>精神容量：{formed.capacity}（固定，不參與配點） · 需求特性：飢餓 {formed.needTraits.hunger}、口渴 {formed.needTraits.thirst}、睡意 {formed.needTraits.sleep}</p><p className="hint">外觀保存及展示，不參與行動或感知檢定。這些是穩定人物資料；位置、目前需求及精神電量在每份世界另行安排。</p>
   {!draft.completedCard?<><Button type="button" variant="outline" disabled={busy||!values||!validCardAllocation(values,formed)} onClick={()=>void save(false)}>保存配點</Button><Button type="button" disabled={busy||!values||!validCardAllocation(values,formed)} onClick={()=>void save(true)}>保存為完成人物卡</Button></>:<p role="status">完成人物卡已保存，可供新世界選用。</p>}
  </>}
  {notice&&<p role="status">{notice}</p>}{error&&<p role="alert" className="error">{error}</p>}
 </section>;
}
