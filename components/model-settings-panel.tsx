'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useOriginalAccountScope } from '@/components/use-original-account-scope';
import { Button } from '@/components/ui/button';
import { modelRoleReady, modelSourceLabel, type ModelRoles, type ModelSettingsView } from '@/lib/model-settings';
import { modelMode, modelProviders, providerNames, type CatalogModel, type ModelProvider as Provider } from '@/lib/model-providers';
type Catalog = { loading?: boolean; models?: CatalogModel[]; error?: string };
const blank: Required<ModelRoles> = { npc: { provider: 'openai', model: '' }, adjudication: { provider: 'openai', model: '' } };
type Props = { originalAccountScope?: string; saveId?: string; onClose?: () => void; onSaved?: (settings: ModelSettingsView) => void; continuation?: { label: string; run: () => Promise<void> }; closeOnSaved?: boolean };
export default function ModelSettingsPanel({ saveId, onClose, onSaved, originalAccountScope, continuation, closeOnSaved }: Props) {
  const { capture, scoped } = useOriginalAccountScope(originalAccountScope);
  const alive = useRef(true), heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { alive.current = true; heading.current?.focus(); return () => { alive.current = false; }; }, []);
  const [scope, setScope] = useState<'account' | 'save'>(saveId ? 'save' : 'account');
  const [view, setView] = useState<ModelSettingsView>();
  const [models, setModels] = useState<Required<ModelRoles>>(blank);
  const touchedRoles = useRef(new Set<keyof ModelRoles>());
  const [inherit, setInherit] = useState(false);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
  const [keys, setKeys] = useState<Partial<Record<Provider, string>>>({});
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const endpoint = '/api/model-settings' + (scope === 'save' && saveId ? '?save=' + encodeURIComponent(saveId) : '');
  const [catalogs, setCatalogs] = useState<Partial<Record<Provider, Catalog>>>({});
  const catalogRequests = useRef(new Map<Provider, AbortController>());
  useEffect(() => {
    const requests = catalogRequests.current;
    return () => { for (const request of requests.values()) request.abort(); requests.clear(); };
  }, []);
  function invalidateCatalog(provider: Provider) {
    catalogRequests.current.get(provider)?.abort();
    catalogRequests.current.delete(provider);
    setCatalogs(previous => ({ ...previous, [provider]: undefined }));
  }
  async function loadCatalog(provider: Provider) {
    if (!view) return;
    catalogRequests.current.get(provider)?.abort();
    const controller = new AbortController();
    catalogRequests.current.set(provider, controller);
    setCatalogs(previous => ({ ...previous, [provider]: { loading: true } }));
    const key = keys[provider]?.trim();
    try {
      const response = await fetch(scoped('/api/model-settings'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ accountScope: view.accountScope, operation: 'list-models', provider, ...(key ? { key } : {}) }),
      });
      const result = await response.json() as { accountScope?: string; models?: CatalogModel[]; error?: string };
      if (controller.signal.aborted) return;
      if (!response.ok) throw Error(result.error || '暫時無法取得模型清單。');
      capture(result.accountScope);
      if (!Array.isArray(result.models)) throw Error('模型清單格式無法辨識。');
      setCatalogs(previous => ({ ...previous, [provider]: { models: result.models } }));
    } catch (cause) {
      if (!controller.signal.aborted) setCatalogs(previous => ({ ...previous, [provider]: { error: cause instanceof Error ? cause.message : '暫時無法取得模型清單。' } }));
    } finally { if (catalogRequests.current.get(provider) === controller) catalogRequests.current.delete(provider); }
  }
  const reload = useCallback(async (signal: AbortSignal) => {
    try {
      const response = await fetch(scoped(endpoint), { signal });
      const body = await response.json() as ModelSettingsView & { error?: string };
      if (!response.ok) throw Error(body.error || '無法讀取模型設定。');
      if (signal.aborted) return;
      capture(body.accountScope); setView(body); touchedRoles.current.clear();
      setModels({ npc: body.effective.npc ?? blank.npc, adjudication: body.effective.adjudication ?? blank.adjudication });
      setInherit(scope === 'save' && body.preference.mode === 'inherit'); setError('');
    } catch (cause) { if (!signal.aborted) setError(cause instanceof Error ? cause.message : '無法讀取模型設定。'); }
    finally { if (!signal.aborted) setLoading(false); }
  }, [endpoint, scope, capture, scoped]);
  useEffect(() => { const controller = new AbortController(); void reload(controller.signal); return () => controller.abort(); }, [reload]);
  async function writeKey(provider: Provider, clear: boolean, settings: ModelSettingsView) {
    const response = await fetch('/api/world?workspace=account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operationScope: settings.accountScope, operation: clear ? 'clear-model-key' : 'set-model-key', mode: modelMode(provider), ...(clear ? {} : { key: keys[provider] }) }) });
    const body = await response.json() as Pick<ModelSettingsView, 'modelKeys' | 'modelKeyStorageAvailable'> & { operationScope?: string; error?: string };
    if (!response.ok) throw Error(body.error || providerNames[provider] + ' Key 未確認保存，輸入已保留。');
    capture(body.operationScope);
    const next = { ...settings, modelKeys: body.modelKeys, modelKeyStorageAvailable: body.modelKeyStorageAvailable };
    if (alive.current) { if (clear) invalidateCatalog(provider); setView(next); setKeys(previous => ({ ...previous, [provider]: '' })); }
    return next;
  }
  async function save(continueAfter = false) {
    if (!view || saving) return;
    setSaving(true); setError(''); setNotice('');
    let savedModels = false;
    try {
      const preference = scope === 'save' && inherit ? { mode: 'inherit' } : { mode: 'custom', models };
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountScope: view.accountScope, version: view.version, ...preference }) });
      let next = await response.json() as ModelSettingsView & { error?: string };
      if (!response.ok) throw Error(next.error || '模型設定未同步，原輸入已保留。');
      capture(next.accountScope); if (!alive.current) return;
      savedModels = true; setView(next);
      for (const provider of requiredProviders) {
        if (keys[provider]?.trim()) next = await writeKey(provider, false, next);
      }
      if (!alive.current) return;
      setNotice('模型與已填的 Key 已保存。Key 加密保存 14 天；設定只影響後續新操作。');
      onSaved?.(next);
      // A caller that shows its own confirmation can ask the panel to get out of the way once the model is usable.
      if (closeOnSaved && onClose && !continueAfter && modelRoleReady(next, 'adjudication')) { onClose(); return; }
      if (continueAfter && continuation) {
        if (!modelRoleReady(next, 'adjudication')) throw Error('設定已保存；請補上天上意志服務的有效 API Key，再繼續。');
        await continuation.run();
      }
    } catch (cause) { if (alive.current) setError((savedModels ? '模型已保存；' : '') + (cause instanceof Error ? cause.message : '保存結果尚未確認，請重試。')); }
    finally { if (alive.current) setSaving(false); }
  }
  async function clearKey(provider: Provider) {
    if (!view || saving) return;
    setSaving(true); setError('');
    try { const next = await writeKey(provider, true, view); setNotice(providerNames[provider] + ' Key 已清除，這個帳號的所有瀏覽器都無法再用它發出新請求。'); onSaved?.(next); }
    catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : 'Key 清除結果尚未確認。'); }
    finally { if (alive.current) setSaving(false); }
  }
  const effective = scope === 'save' && inherit ? view?.accountModels : models;
  const requiredProviders = [...new Set(Object.values(effective ?? {}).map(choice => choice.provider))];
  const inheriting = scope === 'save' && inherit;
  const canSave = !!view && !saving && (['npc', 'adjudication'] as const).every(role => {
    const choice = effective?.[role], saved = view.effective[role];
    if (inheriting && (!choice || !keys[choice.provider]?.trim())) return true;
    if (!choice?.model) return false;
    if (!keys[choice.provider]?.trim() && saved?.provider === choice.provider && saved.model === choice.model) return true;
    return catalogs[choice.provider]?.models?.some(option => option.id === choice.model);
  });
  function chooseModel(role: keyof ModelRoles, model: string) {
    touchedRoles.current.add(role);
    const other = role === 'npc' ? 'adjudication' : 'npc';
    const fillOther = !!model && !models[other].model && !touchedRoles.current.has(other);
    const choice = { ...models[role], model };
    setModels(previous => ({ ...previous, [role]: choice, ...(fillOther ? { [other]: choice } : {}) }));
    if (fillOther) setNotice('已將同一模型填入另一個尚未設定的角色。兩個選單可分開更改。');
  }
  return <section className="panel model-setup" aria-label="模型設定面板">
    <header className="journey-panel-heading"><div><span className="eyebrow">模型與連線</span><h2 ref={heading} tabIndex={-1}>準備這次需要的模型</h2></div>{onClose && <Button type="button" variant="ghost" disabled={saving} onClick={onClose}>{notice ? '完成，關閉設定' : '關閉設定'}</Button>}</header>
    <p className="hint">先選服務，填入或沿用 API Key，再按「讀取模型」。人物補完與數值形成使用「天上意志」。</p>
    {saveId && <label>設定範圍<select aria-label="設定範圍" value={scope} disabled={saving} onChange={event => { setScope(event.target.value as 'account' | 'save'); setLoading(true); setNotice(''); }}><option value="save">這份存檔</option><option value="account">帳號預設</option></select></label>}
    {loading ? <p role="status">正在讀取設定…</p> : <>
      <p className="hint">生效來源：{view ? modelSourceLabel[view.source] : '尚未讀取'}</p>
      {scope === 'save' && <label className="check-label"><input type="checkbox" checked={inherit} disabled={saving} onChange={event => setInherit(event.target.checked)} />沿用帳號預設</label>}
      <div className="model-role-grid">{(['adjudication', 'npc'] as const).map(role => <fieldset key={role} disabled={saving || (scope === 'save' && inherit)}><legend>{role === 'npc' ? 'NPC 自主決策' : '天上意志 · 人物與世界製作'}</legend>
        <label>{role === 'npc' ? 'NPC 服務' : '天上意志服務'}<select aria-label={role === 'npc' ? 'NPC 服務' : '天上意志服務'} value={effective?.[role]?.provider ?? models[role].provider} onChange={event => {
          const provider = event.target.value as Provider;
          touchedRoles.current.add(role);
          setModels(previous => ({ ...previous, [role]: { provider, model: view?.effective[role]?.provider === provider ? view.effective[role]!.model : '' } }));
        }}>{modelProviders.map(provider => <option key={provider} value={provider}>{providerNames[provider]}</option>)}</select></label>
        <label>{role === 'npc' ? 'NPC 模型' : '天上意志模型'}<RoleModelSelect
          label={role === 'npc' ? 'NPC 模型' : '天上意志模型'} model={effective?.[role]?.model ?? ''}
          catalog={catalogs[effective?.[role]?.provider ?? models[role].provider]}
          onChange={model => chooseModel(role, model)} /></label>
      </fieldset>)}</div>
      {requiredProviders.map(provider => <fieldset key={provider} disabled={saving || !view?.modelKeyStorageAvailable}>
        <legend>{providerNames[provider]} API Key</legend>
        {provider === 'anthropic' && <p className="hint">請使用已綁定 Claude 工作區的 API Key。</p>}
        <p className="hint">{view?.modelKeys[provider]?.configured ? '已保存 Key，可留空沿用。填入新 Key 才會替換。' : '請貼上此服務的 Key，再讀取模型。'}</p>
        <label>{providerNames[provider]} 服務 API Key<input aria-label={providerNames[provider] + ' 服務 API Key'} type="password" value={keys[provider] ?? ''} autoComplete="off" maxLength={4096} onChange={event => {
          const key = event.target.value;
          invalidateCatalog(provider); setKeys(previous => ({ ...previous, [provider]: key }));
        }} /></label>
        <Button type="button" variant="outline" disabled={catalogs[provider]?.loading || !(keys[provider]?.trim() || view?.modelKeys[provider]?.configured)} onClick={() => void loadCatalog(provider)}>
          {catalogs[provider]?.loading ? '讀取中…' : catalogs[provider]?.models ? '重新讀取模型' : '讀取模型'}
        </Button>
        {catalogs[provider]?.error && <p role="alert">{catalogs[provider]?.error}</p>}
        {catalogs[provider]?.models && <p role="status">{catalogs[provider]!.models!.length ? '已取得 ' + catalogs[provider]!.models!.length + ' 個模型。供應商列出的模型仍須支援文字對話與 JSON 回覆。' : '供應商沒有列出可選模型。'}</p>}
      </fieldset>)}
      {view && !view.modelKeyStorageAvailable && <p role="alert">本站的 Key 保存服務尚未就緒。可先保存人物文字，待服務恢復再形成數值。</p>}
      <p className="hint">Key 只在本站同帳號、同服務共用，不放進人物卡、世界或草稿。規則模式推進世界不需要 Key。</p>
      <div className="opening-actions"><Button type="button" variant={continuation ? 'outline' : 'default'} disabled={!canSave} onClick={() => void save()}>{saving ? '保存中…' : '保存模型與 Key'}</Button>
        {continuation && <Button type="button" disabled={!canSave} onClick={() => void save(true)}>{continuation.label}</Button>}
      </div>
      <details><summary>管理已保存的服務 Key</summary><p className="hint">清除會停止同帳號所有瀏覽器後續的新請求；不撤銷已送出的請求。</p>{modelProviders.map(provider => <Button key={provider} type="button" variant="outline" disabled={saving || !view?.modelKeys[provider]?.expiresAt} onClick={() => void clearKey(provider)}>清除 {providerNames[provider]} Key</Button>)}</details>
    </>}
    {notice && <p role="status">{notice}</p>}{error && <p role="alert" className="error">{error}</p>}
    {!loading && !view && <Button onClick={() => { setLoading(true); void reload(new AbortController().signal); }}>重試讀取設定</Button>}
  </section>;
}

function RoleModelSelect({ label, model, catalog, onChange }: { label: string; model: string; catalog?: Catalog; onChange: (id: string) => void }) {
  const options = catalog?.models ?? [];
  return <select aria-label={label} value={model} onChange={event => onChange(event.target.value)} disabled={!options.length}>
    <option value="">{options.length ? '請選擇模型' : '請先讀取模型'}</option>
    {model && !options.some(option => option.id === model) && <option value={model}>{model}（目前設定{catalog?.models ? '，本次清單未列出' : ''}）</option>}
    {options.map(option => <option key={option.id} value={option.id}>{option.name === option.id ? option.id : option.name + ' · ' + option.id}</option>)}
  </select>;
}
