'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import ModelSettingsPanel from '@/components/model-settings-panel';
import { modelRoleReady, type ModelSettingsView } from '@/lib/model-settings';
import { Button } from '@/components/ui/button';
import { initialMemoryCapacityError, blankCharacterTemplateFields, characterDescriptionMaxLength, characterTemplateFieldNames, characterTemplateFields, readCharacterTemplateFields, type CharacterTemplate, type CharacterTemplateField } from '@/lib/character-templates';

import { roundClientMs, roundTimePolicy, timePolicyHeader } from '@/lib/round-time-policy';

type Library = { presets: CharacterTemplate[]; templates: CharacterTemplate[] };
const endpoint = '/api/character-templates';
const worldEndpoint = '/api/world?workspace=account';
type GenerationReceipt = { error?: string; retryable?: boolean; operationUncertain?: boolean; operationSettled?: boolean; generatedCharacter?: unknown };

function newDraft(fields = blankCharacterTemplateFields()): CharacterTemplate {
  return { id: crypto.randomUUID(), version: 0, fields: { ...fields } };
}

export default function CharacterTemplateEditor() {
  const [library, setLibrary] = useState<Library>({ presets: [], templates: [] });
  const [draft, setDraft] = useState<CharacterTemplate>();
  const [modelPanel, setModelPanel] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [description, setDescription] = useState('');
  const pendingGeneration = useRef<{ input: string; payload: string }>(null);
  const busy = saving || generating || loading;
  const memoryError = initialMemoryCapacityError(draft?.fields.initialMemories);
  const hasBlank = draft && characterTemplateFieldNames.some(field => draft.fields[field] === '');
  const hasInput = description.trim() || (draft && characterTemplateFieldNames.some(field => draft.fields[field].trim()));
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  const reload = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(endpoint, { signal });
      const body = await response.json() as Library & { error?: string };
      if (!response.ok) throw Error(body.error || '暫時無法讀取人物範本。');
      if (signal?.aborted) return;
      setLibrary(body);
      setError('');
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : '暫時無法讀取人物範本。');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) void reload(controller.signal); });
    return () => controller.abort();
  }, [reload]);

  function edit(template: CharacterTemplate) {
    setDraft(template);
    setDescription('');
    pendingGeneration.current = null;
    setError('');
    setFeedback('');
  }

  function update(field: CharacterTemplateField, value: string) {
    setDraft(previous => previous && ({ ...previous, fields: { ...previous.fields, [field]: value } }));
    setFeedback('');
  }

  async function generate() {
    if (!draft || busy || !hasBlank || !hasInput || memoryError) return;
    setGenerating(true);
    setError('');
    setFeedback('');
    try {
      const availabilityResponse = await fetch('/api/model-settings');
      const availability = await availabilityResponse.json() as ModelSettingsView;
      if (!availabilityResponse.ok) throw Error('暫時無法讀取模型設定。');
      if (!modelRoleReady(availability, 'adjudication')) { setModelPanel(true); return; }
      const characterGeneration = { description, fields: draft.fields };
      const input = JSON.stringify(characterGeneration);
      if (pendingGeneration.current?.input !== input) {
        const response = await fetch(worldEndpoint, { signal: AbortSignal.timeout(roundTimePolicy.deliveryMs) });
        const data = await response.json() as { error?: string; operationScope?: string; world?: { contextId?: string } };
        if (!response.ok || !data.operationScope || !data.world) throw Error(data.error || '暫時無法讀取生成設定。');
        pendingGeneration.current = {
          input,
          payload: JSON.stringify({
            operation: 'generate-character-template',
            operationId: Date.now() + ':' + crypto.randomUUID(),
            operationScope: data.operationScope,
            worldContext: data.world.contextId,
            mode: 'demo',
            characterGeneration,
          }),
        };
      }
      const response = await fetch(worldEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [timePolicyHeader]: roundTimePolicy.version },
        signal: AbortSignal.timeout(roundClientMs),
        body: pendingGeneration.current.payload,
      });
      const result = await response.json() as GenerationReceipt;
      if (result.operationSettled || (!result.retryable && !result.operationUncertain)) pendingGeneration.current = null;
      if (!response.ok) throw Error(result.error || '人物草稿未能生成，原設定已保留。');
      const fields = readCharacterTemplateFields(result.generatedCharacter);
      if (!fields) throw Error('模型沒有回傳有效的人物草稿，原設定已保留。');
      setDraft({ ...draft, fields });
      setFeedback('已更新空白欄位。檢查並修改後，可保存為人物範本。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '人物草稿未能生成，原設定已保留。');
    } finally {
      setGenerating(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || busy || memoryError) return;
    setSaving(true);
    setError('');
    setFeedback('');
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const body = await response.json() as { template: CharacterTemplate; error?: string };
      if (!response.ok) throw Error(body.error || '暫時無法保存人物範本。');
      const template: CharacterTemplate = body.template;
      setDraft(template);
      setLibrary(previous => ({
        ...previous,
        templates: [...previous.templates.filter(item => item.id !== template.id), template],
      }));
      setFeedback('已保存人物範本。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '暫時無法保存人物範本。');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 pb-10">
      {modelPanel && <ModelSettingsPanel onClose={() => setModelPanel(false)} />}
      <section className="panel space-y-4 p-6" aria-label="人物範本清單">
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={busy} onClick={() => edit(newDraft())}>新建人物</Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => {
            setLoading(true);
            void reload();
          }}>重新讀取人物範本</Button>
        </div>
        <div>
          <h2>我的人物</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {library.templates.map(template => (
              <Button key={template.id} type="button" variant="outline" disabled={busy} onClick={() => edit(template)}>
                {template.fields.name}
              </Button>
            ))}
            {!library.templates.length && <p className="hint">可以從空白建立人物，也可以編輯預設人物的私人副本。</p>}
          </div>
        </div>
        <div>
          <h2>預設人物</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {library.presets.map(template => (
              <Button key={template.id} type="button" variant="outline" disabled={busy} onClick={() => edit(newDraft(template.fields))}>
                使用 {template.fields.name} 範本
              </Button>
            ))}
          </div>
        </div>
      </section>
      {draft && (
        <form className="panel space-y-4 p-6" aria-label="人物編輯器" onSubmit={save}>
          <h2>{draft.version ? '編輯人物範本' : '新人物範本'}</h2>
          <p className="hint">只有姓名必填。起始位置可先用文字描述，建立世界時再對應到實際場所或房間。</p>
          <fieldset disabled={busy} className="space-y-2" aria-label="自然語言人物草稿">
            <label>
              人物描述
              <textarea name="characterDescription" rows={3} maxLength={characterDescriptionMaxLength} value={description}
                onChange={event => setDescription(event.target.value)} />
            </label>
            <p className="hint">生成使用觀察室的天上意志模型設定，計入玩家 AI 用量。已填欄位會原樣保留。</p>
            <Button type="button" variant="outline" disabled={busy || !hasBlank || !hasInput || !!memoryError} onClick={() => void generate()}>
              {generating ? '正在生成人物草稿…' : '用 AI 生成空白欄位'}
            </Button>
          </fieldset>
          <fieldset disabled={busy} className="grid gap-x-5 md:grid-cols-2">
            {characterTemplateFieldNames.map(field => {
              const { label, maxLength } = characterTemplateFields[field];
              return (
                <label key={field}>
                  {label}
                  {field === 'name' || field === 'startLocation'
                    ? <input name={field} maxLength={maxLength} required={field === 'name'} value={draft.fields[field]} onChange={event => update(field, event.target.value)} />
                    : <textarea aria-invalid={field === 'initialMemories' && !!memoryError} aria-describedby={field === 'initialMemories' ? 'initial-memory-capacity' : undefined} name={field} maxLength={maxLength} rows={3} value={draft.fields[field]} onChange={event => update(field, event.target.value)} />}
                </label>
              );
            })}
          </fieldset>
          <p id="initial-memory-capacity" className={memoryError ? 'error' : 'hint'} role={memoryError ? 'alert' : undefined}>
            {memoryError || '初始記憶上限為 4,096 UTF-8 bytes，且不超過 2,400 字元；一般中文字每字約 3 bytes。'}
          </p>
          <Button type="submit" disabled={busy || !!memoryError || !draft.fields.name.trim()}>保存人物範本</Button>
        </form>
      )}
      {feedback && <p role="status">{feedback}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
