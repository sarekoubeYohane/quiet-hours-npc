'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { blankCharacterTemplateFields, characterTemplateFieldNames, characterTemplateFields, type CharacterTemplate, type CharacterTemplateField } from '@/lib/character-templates';

type Library = { presets: CharacterTemplate[]; templates: CharacterTemplate[] };
const endpoint = '/api/character-templates';

function newDraft(fields = blankCharacterTemplateFields()): CharacterTemplate {
  return { id: crypto.randomUUID(), version: 0, fields: { ...fields } };
}

export default function CharacterTemplateEditor() {
  const [library, setLibrary] = useState<Library>({ presets: [], templates: [] });
  const [draft, setDraft] = useState<CharacterTemplate>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
    setError('');
    setFeedback('');
  }

  function update(field: CharacterTemplateField, value: string) {
    setDraft(previous => previous && ({ ...previous, fields: { ...previous.fields, [field]: value } }));
    setFeedback('');
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || saving || loading) return;
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
      <section className="panel space-y-4 p-6" aria-label="人物範本清單">
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={loading || saving} onClick={() => edit(newDraft())}>新建人物</Button>
          <Button type="button" variant="outline" disabled={loading || saving} onClick={() => {
            setLoading(true);
            void reload();
          }}>重新讀取人物範本</Button>
        </div>
        <div>
          <h2>我的人物</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {library.templates.map(template => (
              <Button key={template.id} type="button" variant="outline" disabled={saving || loading} onClick={() => edit(template)}>
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
              <Button key={template.id} type="button" variant="outline" disabled={saving || loading} onClick={() => edit(newDraft(template.fields))}>
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
          <fieldset disabled={saving || loading} className="grid gap-x-5 md:grid-cols-2">
            {characterTemplateFieldNames.map(field => {
              const { label, maxLength } = characterTemplateFields[field];
              return (
                <label key={field}>
                  {label}
                  {field === 'name' || field === 'startLocation'
                    ? <input name={field} maxLength={maxLength} required={field === 'name'} value={draft.fields[field]} onChange={event => update(field, event.target.value)} />
                    : <textarea name={field} maxLength={maxLength} rows={3} value={draft.fields[field]} onChange={event => update(field, event.target.value)} />}
                </label>
              );
            })}
          </fieldset>
          <Button type="submit" disabled={saving || loading || !draft.fields.name.trim()}>保存人物範本</Button>
        </form>
      )}
      {feedback && <p role="status">{feedback}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
