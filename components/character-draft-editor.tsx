'use client';
import {useRouter} from 'next/navigation';
import {returnOpeningAsset} from '@/lib/opening-authoring';
import {useDraftNavigation} from './use-draft-navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useOriginalAccountScope } from '@/components/use-original-account-scope';
import CharacterFormationControls from '@/components/character-formation-controls';
import ModelSettingsPanel from '@/components/model-settings-panel';
import { modelRoleReady, type ModelSettingsView } from '@/lib/model-settings';
import { Button } from '@/components/ui/button';
import { characterDraftFieldNames, characterTextGroups, missingCharacterText, newCharacterDraft, type CharacterDraft } from '@/lib/character-drafts';
import { characterTemplateFields, initialMemoryCapacityError, type CharacterTemplateField, type CharacterTemplate } from '@/lib/character-templates';
import { roundClientMs } from '@/lib/round-time-policy';
const endpoint = '/api/character-drafts';
const workspace = '/api/world?workspace=account';
type DraftReply = { accountScope?: string; draft?: CharacterDraft; error?: string };
export default function CharacterDraftEditor({originalAccountScope,returnTo}:{originalAccountScope?:string;returnTo?:string}) {
  const router=useRouter();
  const [modelReady,setModelReady]=useState<boolean>();
  const [resumeModel,setResumeModel]=useState<(()=>Promise<void>)>();
  const [returning,setReturning]=useState(false);
  const { accountScope, capture, scoped } = useOriginalAccountScope(originalAccountScope);
  const pendingTemplate=useRef<{id:string;templateId:string;templateVersion:number;operationScope:string}>(null);
  const [templatePending,setTemplatePending]=useState(false);
  const [sources, setSources] = useState<CharacterTemplate[]>([]);
  const [drafts, setDrafts] = useState<CharacterDraft[]>([]);
  const [draft, setDraft] = useState<CharacterDraft>();
  const current = useRef<CharacterDraft>(undefined);
  const [modelPanel, setModelPanel] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [forming, setForming] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const writing=useRef<Promise<CharacterDraft|undefined>|null>(null);
  const failedSave = useRef<CharacterDraft>(undefined);
  const alive = useRef(true);
  const show = useCallback((value: CharacterDraft) => { const next={...value,accountScope:value.accountScope??(current.current?.id===value.id?current.current.accountScope:undefined)};current.current = next;setDraft(next); }, []);
  const record = useCallback((value: CharacterDraft) => setDrafts(items => [...items.filter(item => item.id !== value.id), value]), []);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(scoped(endpoint));
      const body = await response.json() as { accountScope?: string; drafts?: CharacterDraft[]; error?: string };
      if (!response.ok || !body.drafts) throw Error(body.error || '無法讀取建角草稿。');
      if (!alive.current) return;
      capture(body.accountScope);
      setDrafts(body.drafts); setError('');
      const settingsResponse=await fetch(scoped('/api/model-settings'));
      if(settingsResponse.ok){const settings=await settingsResponse.json() as ModelSettingsView;capture(settings.accountScope);if(alive.current)setModelReady(modelRoleReady(settings,'adjudication'));}
      const selected=new URLSearchParams(location.search).get('characterDraft');
      const resumed=body.drafts.find(item=>item.id===selected);if(resumed){show(resumed);setStatus('已保存至帳號');}
      const libraryResponse=await fetch(scoped('/api/character-templates'));const library=await libraryResponse.json() as {accountScope?:string;presets?:CharacterTemplate[];templates?:CharacterTemplate[]};if(libraryResponse.ok&&alive.current){capture(library.accountScope);setSources([...(library.presets??[]),...(library.templates??[])]);}
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : '無法讀取建角草稿。'); }
    finally { if (alive.current) setLoading(false); }
  }, [capture, scoped, show]);
  useEffect(() => { alive.current = true; queueMicrotask(() => { if (alive.current) void load(); }); return () => { alive.current = false; }; }, [load]);
  async function save(value = failedSave.current ?? current.current) {
    if(writing.current)return writing.current;
    const task=persist(value);writing.current=task;
    try{return await task;}finally{writing.current=null;}
  }
  async function persist(value:CharacterDraft|undefined) {
    if (!value) return;
    setSaving(true); setStatus('保存中');
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
      const body = await response.json() as DraftReply;
      if (!response.ok || !body.draft) { setConflict(response.status === 409); throw Error(body.error || '未同步：保存失敗，原輸入已保留。'); }
      if (!alive.current) return body.draft;
      capture(body.accountScope);
      capture(body.draft.accountScope);
      const saved = body.draft;
      record(saved); failedSave.current = undefined; setSaveFailed(false); setConflict(false);
      if (current.current?.id === value.id) {
        const unchanged = current.current.concept === value.concept && JSON.stringify(current.current.fields) === JSON.stringify(value.fields);
        show(unchanged ? saved : { ...current.current, version: saved.version, provenance: saved.provenance });
        setDirty(!unchanged); setStatus(unchanged ? '已保存至帳號' : '保存中');
      }
      setError(''); return saved;
    } catch (cause) {
      if (alive.current) { failedSave.current = value; setSaveFailed(true); setStatus('未同步'); setError(cause instanceof Error ? cause.message : '未同步：保存失敗，原輸入已保留。'); }
    } finally { if (alive.current) setSaving(false); }
  }
  useEffect(() => {
    if (!dirty || saving || generating || forming || error || !draft || draft.pendingGeneration || draft.formation || draft.pendingFormation) return;
    const timer = setTimeout(() => { void save(); }, 500);
    return () => clearTimeout(timer);
  });
  function edit(value: CharacterDraft) {
    if (saving || generating || dirty || failedSave.current) return;
    show(value);const url=new URL(location.href);url.searchParams.set('characterDraft',value.id);history.replaceState(null,'',url.pathname+url.search); setError(''); setStatus(value.version ? '已保存至帳號' : '保存中'); setDirty(value.version === 0);
  }
  function update(field: CharacterTemplateField | 'concept', value: string) {
    if (!current.current) return;
    show(field === 'concept' ? { ...current.current, concept: value } : { ...current.current, fields: { ...current.current.fields, [field]: value } });
    setDirty(true); setStatus('保存中');
  }
  async function fromTemplate(source?:CharacterTemplate) {
    if(saving||generating||forming||(!pendingTemplate.current&&!canSwitch))return;
    setSaving(true);setError('');
    try{
      if(!pendingTemplate.current){if(!source)return;const scopeResponse=await fetch(scoped('/api/world?workspace=account','operationScope'));const scope=await scopeResponse.json() as {operationScope?:string};if(!scopeResponse.ok||!scope.operationScope)throw Error('無法確認原帳號，來源文字已保留。');capture(scope.operationScope);pendingTemplate.current={id:crypto.randomUUID(),templateId:source.id,templateVersion:source.version,operationScope:scope.operationScope};setTemplatePending(true);}
      const response=await fetch('/api/character-drafts/from-template',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pendingTemplate.current)});const body=await response.json() as DraftReply;
      if(!response.ok||!body.draft)throw Error(body.error||'草稿尚未保存，請恢復原操作。');
      if(!alive.current)return;capture(body.draft.accountScope);
      pendingTemplate.current=null;setTemplatePending(false);show(body.draft);record(body.draft);setDirty(false);setStatus('已保存至帳號');
    }catch(cause){setStatus('未同步');setError(cause instanceof Error?cause.message:'無法建立範本草稿，請恢復原操作。');}finally{setSaving(false);}
  }
  async function generate(discard = false) {
    if (saving || generating || !current.current) return;
    setGenerating(true); setError('');
    try {
      let input = current.current;
      if (dirty || !input.version) {
        const saved = await save(input);
        if (!saved) return;
        input = saved;
      }
      let payload: object;
      if (discard) payload = { id: input.id, version: input.version, operationScope: input.accountScope, discard: true };
      else if (input.pendingGeneration) payload = { id: input.id, version: input.pendingGeneration.baseVersion, ...input.pendingGeneration };
      else {
        const availabilityResponse = await fetch(scoped('/api/model-settings'));
        const availability = await availabilityResponse.json() as ModelSettingsView;
        if (!availabilityResponse.ok) throw Error('暫時無法讀取模型設定，原輸入已保留。');
        capture(availability.accountScope);
        if (!modelRoleReady(availability, 'adjudication')) { openModels(()=>generate()); return; }
        const response = await fetch(scoped(workspace,'operationScope'));
        const settings = await response.json() as { operationScope?: string; world?: { contextId?: string }; error?: string };
        if (!response.ok || !settings.operationScope || !settings.world) throw Error(settings.error || '暫時無法讀取帳號模型設定。');
        capture(settings.operationScope);
        payload = { id: input.id, version: input.version, operationId: Date.now() + ':' + crypto.randomUUID(), operationScope: settings.operationScope, worldContext: settings.world.contextId };
      }
      const response = await fetch(endpoint + '/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(roundClientMs) });
      const body = await response.json() as DraftReply;
      if (!alive.current) return;
      if(body.draft)capture(body.draft.accountScope);
      if (body.draft && current.current?.id === input.id) { show(body.draft); record(body.draft); setDirty(false); setStatus('已保存至帳號'); }
      if (!response.ok) throw Error(body.error || 'AI 補完失敗，原輸入已保留。');
      setStatus(discard ? '已保留草稿並放棄套用原 AI 結果' : '已補完空白並保存至帳號');
    } catch (cause) {
      if (!alive.current) return;
      setError(cause instanceof Error ? cause.message : 'AI 結果尚未確認，原輸入已保留。');
      // Read recovery metadata only; reload must never dispatch another model request.
      try {
        const response = await fetch(scoped(endpoint)); const body = await response.json() as { accountScope?:string; drafts?: CharacterDraft[] };
        if(!response.ok)return;capture(body.accountScope);
        const saved = body.drafts?.find(item => item.id === current.current?.id);
        if (response.ok && saved?.pendingGeneration && current.current) show({ ...current.current, version: saved.version, pendingGeneration: saved.pendingGeneration });
      } catch { /* Keep the original input; explicit reload can recover account state. */ }
    } finally { if (alive.current) setGenerating(false); }
  }
  useDraftNavigation(dirty||saving||saveFailed,async()=>{
    for(;;){
      const saved=await save();
      if(!saved||!current.current)return false;
      if(current.current.id===saved.id&&current.current.concept===saved.concept&&JSON.stringify(current.current.fields)===JSON.stringify(saved.fields))return true;
    }
  });
  async function bringBack(value:CharacterDraft){
    if(!returnTo||!value.completedCard||!accountScope||returning)return;
    setReturning(true);setError('');
    try{const path=await returnOpeningAsset(returnTo,accountScope,{kind:'card',...value.completedCard});router.push(path);}
    catch(cause){setError(cause instanceof Error?cause.message:'人物卡已保存，尚未帶回開局。請重試。');}
    finally{if(alive.current)setReturning(false);}
  }
  function openModels(resume?:()=>Promise<void>){
    const snapshot=current.current;
    setResumeModel(resume?()=>async()=>{
      if(!snapshot||current.current?.id!==snapshot.id||current.current.version!==snapshot.version||JSON.stringify(current.current.fields)!==JSON.stringify(snapshot.fields))throw Error('人物草稿已變更，請重新核對並按原操作；尚未呼叫模型。');
      await resume();
    }:undefined);
    setModelPanel(true);
  }
  const memoryError = initialMemoryCapacityError(draft?.fields.initialMemories);
  const missing = draft ? missingCharacterText(draft.fields) : [];
  const locked = modelPanel || generating || forming || !!draft?.pendingGeneration || !!draft?.formation || !!draft?.pendingFormation;
  const canSwitch = !modelPanel && !templatePending && !saving && !generating && !forming && !dirty && !saveFailed;
  const textGroups = draft ? characterTextGroups.map(group => <details key={group.title} open={!draft.formation} className="space-y-2">
        <summary>{group.title}：{group.fields.map(field => draft.fields[field].trim() ? draft.fields[field].slice(0, 24) : `${characterTemplateFields[field].label}未填`).join('／')}</summary>
        <fieldset disabled={locked} className="grid gap-3 md:grid-cols-2">
          {group.fields.map(field => <label key={field}>{characterTemplateFields[field].label}
            {field === 'name' ? <input name={'draft-' + field} maxLength={characterTemplateFields[field].maxLength} value={draft.fields[field]} onChange={event => update(field, event.target.value)} /> : <textarea name={'draft-' + field} maxLength={characterTemplateFields[field].maxLength} rows={3} value={draft.fields[field]} onChange={event => update(field, event.target.value)} />}
            <span className="hint">{draft.provenance[field]?.kind === 'ai' ? (draft.provenance[field].materiallyEdited ? 'AI 補完，使用者已有實質修改' : 'AI 補完') : draft.provenance[field]?.kind==='unknown' ? (draft.provenance[field].materiallyEdited?'範本文字，使用者已有實質修改':'來源範本文字（來源未記錄）') : draft.fields[field].trim() ? '使用者文字' : '留白'}</span>
          </label>)}
        </fieldset>
      </details>) : null;
  return <section className="panel character-authoring space-y-4 p-6" aria-label="建角文字草稿">
    <header className="journey-panel-heading"><div><span className="eyebrow">人物準備</span><h2>製作人物卡</h2></div><p role="status" aria-live="polite" className="opening-status">{status}</p></header>
    {modelReady?<p className="model-ready-line"><span>模型已就緒</span><Button variant="ghost" disabled={forming||generating} onClick={()=>{setResumeModel(undefined);setModelPanel(true);}}>調整模型與 Key</Button></p>:<aside className="journey-note"><strong>產生數值前，需要先設定模型與 API Key</strong><p>文字可以先寫、先存草稿；即使全部手填，產生數值時仍需要模型判讀背景。</p><Button variant="outline" disabled={forming||generating} onClick={()=>{setResumeModel(undefined);setModelPanel(true);}}>設定模型與 Key</Button></aside>}
    {modelPanel && <ModelSettingsPanel originalAccountScope={accountScope} closeOnSaved onClose={() => {setModelPanel(false);setResumeModel(undefined);}} onSaved={settings=>{const ready=modelRoleReady(settings,'adjudication');setModelReady(ready);if(ready)setStatus('模型與 Key 已保存');}} continuation={resumeModel?{label:'保存並繼續這次操作',run:async()=>{setModelPanel(false);setResumeModel(undefined);await resumeModel();}}:undefined} />}
    <p className="hint">三步完成一張人物卡：寫設定 → 產生數值 → 完成。草稿會自動保存，完成後才能選進世界；起始位置之後在開局時安排。</p>
    <div className="flex flex-wrap gap-2">
      <Button type="button" disabled={loading || !accountScope || !canSwitch} onClick={() => edit({...newCharacterDraft(),accountScope})}>＋ 從空白開始</Button>
      <Button type="button" variant="ghost" disabled={!canSwitch} onClick={() => void load()}>重新讀取</Button>
    </div>
    {!!drafts.length&&<div className="draft-list" role="group" aria-label="我的草稿與人物卡"><span className="eyebrow">我的草稿與人物卡</span>
      {drafts.map(item => <button key={item.id} type="button" disabled={!canSwitch} aria-pressed={draft?.id===item.id} onClick={() => edit(item)}><strong>{item.fields.name || item.concept.slice(0, 20) || '未命名草稿'}</strong><small className={item.completedCard?'is-card':''}>{item.completedCard?'人物卡':item.formation?'草稿 · 已有數值':'草稿 · 撰寫中'}</small></button>)}
    </div>}
    {templatePending&&<Button type="button" disabled={saving} onClick={()=>void fromTemplate()}>恢復原範本建角</Button>}
    <details><summary>或從範本開始</summary><p className="hint">複製範本的文字成為一份新草稿，之後修改不影響範本；數值仍要自己產生。</p><div className="flex flex-wrap gap-2">{sources.map(source=><Button key={source.id} type="button" variant="outline" disabled={!canSwitch} onClick={()=>void fromTemplate(source)}>用 {source.fields.name} 的設定開始</Button>)}</div></details>
    {draft && <div className="space-y-4" aria-label="建角編輯器">
      <div className="authoring-progress" aria-label="人物製作進度"><span aria-current={!draft.formation?"step":undefined}>1 寫設定</span><span aria-current={draft.formation&&!draft.completedCard?"step":undefined}>2 產生數值與配點</span><span aria-current={draft.completedCard?"step":undefined}>3 完成人物卡</span></div>{draft.formation?<details className="locked-text"><summary>人物設定（已鎖定，展開查看）</summary>{textGroups}</details>:<><label>人物概念（選填，可請 AI 補完）<textarea name="draftConcept" maxLength={2400} rows={3} value={draft.concept} disabled={locked} onChange={event => update('concept', event.target.value)} /></label>
      <p className="hint">AI 只補空白，已填內容（包含「沒有」）原樣保留。使用帳號現有天上意志模型設定；不會自動重試付費請求。</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={modelPanel || saving || generating || forming || !!draft.formation || !!draft.pendingFormation || saveFailed || !!memoryError || (!draft.pendingGeneration && !draft.concept.trim() && !characterDraftFieldNames.some(field => draft.fields[field].trim())) || (!draft.pendingGeneration && !missing.length)} onClick={() => void generate()}>{generating ? '正在補完…' : draft.pendingGeneration ? '恢復原 AI 補完操作' : '用 AI 補完空白文字'}</Button>
        {draft.pendingGeneration && <Button type="button" variant="outline" disabled={saving || generating} onClick={() => void generate(true)}>放棄套用原 AI 結果</Button>}
      </div>
      {textGroups}
      <p className="hint">形成數值前須完成九項文字；適用時可如實填寫「沒有特殊設定」。形成後所有文字都會鎖定，請先核對姓名及錯字。</p>
      {!!missing.length && <p role="status">待完成：{missing.join('、')}</p>}
      {memoryError && <p role="alert" className="error">{memoryError}</p>}
      <Button type="button" disabled={modelPanel || saving || generating || forming || !!draft.formation || !!draft.pendingFormation || !!memoryError || !!draft.pendingGeneration} onClick={() => void save()}>{saveFailed ? '恢復草稿保存' : '立即保存草稿'}</Button></>}
      <CharacterFormationControls key={draft.id} draft={draft} disabled={modelPanel||saving||generating||loading||saveFailed} onBusy={setForming} onModels={openModels} completeLabel={returnTo?'保存人物卡並帶回開局':undefined} onCompleted={returnTo?bringBack:undefined} onSaved={value => { if(!alive.current)return;capture(value.accountScope);show(value); record(value); setDirty(false); setStatus('已保存至帳號'); }} onPrepare={async () => { if (!current.current) return; if (dirty || !current.current.version) return save(current.current); return current.current; }} />
      {returnTo&&draft.completedCard&&<Button disabled={returning} onClick={()=>void bringBack(draft)}>{returning?'正在選入開局…':'帶回本次開局'}</Button>}
      {conflict && <p className="hint">本頁文字仍保留。請另開人物頁核對帳號已保存版本，再決定如何處理變更；不會自動覆寫或另建副本。</p>}
    </div>}
    {error && <p role="alert" className="error">{error}</p>}
  </section>;
}
