'use client';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { modelSourceLabel, type ModelChoice, type ModelRoles, type ModelSettingsView } from '@/lib/model-settings';
const blank: Required<ModelRoles> = { npc: { provider: 'openai', model: 'gpt-6-luna' }, adjudication: { provider: 'openai', model: 'gpt-6.1-sol' } };
export default function ModelSettingsPanel({ saveId, onClose, onSaved }: { saveId?: string; onClose?: () => void; onSaved?: (settings: ModelSettingsView) => void }) {
  const [scope, setScope] = useState<'account' | 'save'>(saveId ? 'save' : 'account');
  const [view, setView] = useState<ModelSettingsView>();
  const [models, setModels] = useState<Required<ModelRoles>>(blank);
  const [inherit, setInherit] = useState(false);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
  const [provider, setProvider] = useState<ModelChoice['provider']>('openai'), [key, setKey] = useState('');
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const endpoint = '/api/model-settings' + (scope === 'save' && saveId ? '?save=' + encodeURIComponent(saveId) : '');
  const reload = useCallback(async (signal: AbortSignal) => {
    try {
      const response = await fetch(endpoint, { signal });
      const body = await response.json() as ModelSettingsView & { error?: string };
      if (!response.ok) throw Error(body.error || '無法讀取模型設定。');
      if (signal.aborted) return;
      setView(body); setModels({ npc: body.effective.npc ?? blank.npc, adjudication: body.effective.adjudication ?? blank.adjudication });
      setInherit(scope === 'save' && body.preference.mode === 'inherit'); setError('');
    } catch (cause) { if (!signal.aborted) setError(cause instanceof Error ? cause.message : '無法讀取模型設定。'); }
    finally { if (!signal.aborted) setLoading(false); }
  }, [endpoint, scope]);
  useEffect(() => { const controller = new AbortController(); queueMicrotask(() => { if (!controller.signal.aborted) void reload(controller.signal); }); return () => controller.abort(); }, [reload]);
  async function save() {
    if (!view || saving) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: view.version, ...(scope === 'save' && inherit ? { mode: 'inherit' } : { mode: 'custom', models }) }) });
      const body = await response.json() as ModelSettingsView & { error?: string };
      if (!response.ok) throw Error(body.error || '未同步：保存模型設定失敗，原輸入已保留。');
      setView(body); setNotice('模型設定已保存；僅供後續新操作使用。尚未呼叫模型或推進世界。');
      onSaved?.(body);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '未同步：保存結果尚未確認，請保留輸入並恢復保存。'); }
    finally { setSaving(false); }
  }
  async function manageKey(clear = false) {
    if (saving || (!clear && !key.trim())) return;
    setSaving(true); setError('');
    try {
      const response = await fetch('/api/world?workspace=account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation: clear ? 'clear-model-key' : 'set-model-key', mode: provider === 'openai' ? 'openai' : 'ai', ...(clear ? {} : { key }) }) });
      const body = await response.json() as Pick<ModelSettingsView, 'modelKeys' | 'modelKeyStorageAvailable'> & { error?: string };
      if (!response.ok) throw Error(body.error || 'Key 保存失敗，輸入仍保留。');
      setView(previous => previous && { ...previous, ...body }); setKey(''); setNotice(clear ? '此帳號的服務 Key 已清除。' : '服務 Key 已加密保存；固定 14 天，不會因讀取、使用或重新登入延長。');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Key 保存失敗，輸入仍保留。'); }
    finally { setSaving(false); }
  }
  return <section className="panel space-y-4 p-6" role={onClose ? 'dialog' : undefined} aria-modal={onClose ? true : undefined} aria-label="模型設定面板">
    <h2>模型設定</h2>
    <p>NPC 自主決策與天上意志分開設定。建角與世界配置使用天上意志；規則推進不需要模型。保存不會重送進行中的請求，也不會自動呼叫模型。</p>
    {saveId && <label>設定範圍<select aria-label="設定範圍" value={scope} disabled={saving} onChange={event => { setScope(event.target.value as 'account' | 'save'); setLoading(true); setNotice(''); }}><option value="save">這份存檔</option><option value="account">帳號預設</option></select></label>}
    {loading ? <p role="status">正在讀取設定…</p> : <>
      <p role="status">生效來源：{view ? modelSourceLabel[view.source] : '尚未讀取'}</p>
      <p>目前已保存：NPC {view?.effective.npc?.model || '尚未設定'}；天上意志 {view?.effective.adjudication?.model || '尚未設定'}。以下欄位需按保存才生效。</p>
      {scope === 'save' && <label><input type="checkbox" checked={inherit} disabled={saving} onChange={event => setInherit(event.target.checked)} />沿用帳號預設</label>}
      {(['npc', 'adjudication'] as const).map(role => <fieldset key={role} disabled={saving || (scope === 'save' && inherit)} className="space-y-2"><legend>{role === 'npc' ? 'NPC 自主決策' : '天上意志／建角與世界配置'}</legend>
        <label>{role === 'npc' ? 'NPC 服務' : '天上意志服務'}<select aria-label={role === 'npc' ? 'NPC 服務' : '天上意志服務'} value={models[role].provider} onChange={event => setModels(previous => ({ ...previous, [role]: { ...previous[role], provider: event.target.value as ModelChoice['provider'] } }))}><option value="openai">OpenAI</option><option value="openrouter">OpenRouter</option></select></label>
        <label>{role === 'npc' ? 'NPC 模型' : '天上意志模型'}<input aria-label={role === 'npc' ? 'NPC 模型' : '天上意志模型'} maxLength={120} value={models[role].model} onChange={event => setModels(previous => ({ ...previous, [role]: { ...previous[role], model: event.target.value } }))} /></label>
      </fieldset>)}
      <Button type="button" disabled={saving || !view} onClick={() => void save()}>{saving ? '正在保存…' : error ? '恢復保存模型設定' : '保存模型設定'}</Button>
      <fieldset disabled={saving || !view?.modelKeyStorageAvailable} className="space-y-2"><legend>帳號共用服務 Key</legend><p className="hint">Key 按本站、帳號與供應商加密保存，最長 14 天；不存入人物、世界、草稿或另存副本。</p>
        <label>Key 服務<select aria-label="Key 服務" value={provider} onChange={event => { setProvider(event.target.value as ModelChoice['provider']); setKey(''); }}><option value="openai">OpenAI</option><option value="openrouter">OpenRouter</option></select></label>
        <label>服務 API Key<input aria-label="服務 API Key" type="password" value={key} autoComplete="off" maxLength={4096} onChange={event => setKey(event.target.value)} /></label>
        <p role="status">{view?.modelKeys[provider]?.configured ? '此服務已有有效 Key' : '此服務尚無有效 Key'}</p>
        <Button type="button" disabled={!key.trim()} onClick={() => void manageKey()}>保存服務 Key</Button><Button type="button" variant="outline" disabled={!view?.modelKeys[provider]?.expiresAt} onClick={() => void manageKey(true)}>清除此服務 Key</Button>
      </fieldset>
    </>}
    {notice && <p role="status">{notice}</p>}{error && <p role="alert" className="error">{error}</p>}
    {onClose && <Button type="button" variant="outline" disabled={saving} onClick={onClose}>返回原流程</Button>}
  </section>;
}
