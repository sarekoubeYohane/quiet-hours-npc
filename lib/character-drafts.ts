import { blankCharacterTemplateFields, characterTemplateFieldNames, characterTemplateFields, readCharacterTemplateFields, type CharacterTemplateFields } from './character-templates';

export const characterDraftFieldNames = characterTemplateFieldNames.filter(name => name !== 'startLocation');
export type CharacterDraftField = typeof characterDraftFieldNames[number];
export type TextProvenance = { kind: 'empty' | 'user' | 'ai'; aiText?: string; materiallyEdited: boolean; userText?: string };
export type CharacterDraft = {
  id: string; version: number; concept: string; fields: CharacterTemplateFields;
  provenance: Record<string, TextProvenance>;
  formation?:import('./character-cards').CardFormation;
  pendingFormation?:{operationId:string;operationScope:string;worldContext?:string;inputVersion:number};
  completedCard?:{id:string;version:number};
  completedGeneration?: { operationId: string; inputVersion: number };
  pendingGeneration?: { operationId: string; operationScope: string; worldContext?: string; baseVersion: number; concept: string; fields: CharacterTemplateFields };
};
export const characterTextGroups = [
  { title: '基本資料', fields: ['name', 'appearance'] },
  { title: '性格與生活', fields: ['personality', 'beliefs', 'preferences', 'directions'] },
  { title: '背景與記憶', fields: ['background', 'initialMemories'] },
  { title: '能力與需求', fields: ['abilities'] },
] as const;
export function newCharacterDraft(): CharacterDraft {
  return { id: crypto.randomUUID(), version: 0, concept: '', fields: blankCharacterTemplateFields(), provenance: {} };
}
export function missingCharacterText(fields: CharacterTemplateFields) {
  return characterDraftFieldNames.filter(field => !fields[field].trim()).map(field => characterTemplateFields[field].label);
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function readCharacterDraftInput(value: unknown) {
  if (!value || typeof value !== 'object') return;
  const input = value as Record<string, unknown>;
  if (typeof input.id !== 'string' || !UUID.test(input.id) || !Number.isSafeInteger(input.version) || Number(input.version) < 0 || Number(input.version) >= Number.MAX_SAFE_INTEGER || typeof input.concept !== 'string' || input.concept.length > 2400) return;
  const fields = readCharacterTemplateFields(input.fields);
  if (!fields) return;
  fields.startLocation = '';
  return { id: input.id, version: Number(input.version), concept: input.concept, fields };
}
// Punctuation/spacing alone cannot turn model-authored text into a user background.
const meaningfulText = (text: string) => text.normalize('NFKC').toLocaleLowerCase('und').replace(/[\p{P}\p{Z}\p{S}\p{Cf}\s]/gu, '');
export function userTextProvenance(previous: CharacterDraft | undefined, fields: CharacterTemplateFields) {
  return Object.fromEntries(characterDraftFieldNames.map(field => {
    const text = fields[field];
    const origin = previous?.provenance[field];
    if (!text.trim()) return [field, { kind: 'empty', materiallyEdited: false } satisfies TextProvenance];
    if (origin?.kind === 'ai') {
      const aiText = origin.aiText ?? previous!.fields[field];
      const materiallyEdited = meaningfulText(text) !== meaningfulText(aiText);
      return [field, { kind: 'ai', aiText, materiallyEdited, ...(materiallyEdited ? { userText: text } : {}) } satisfies TextProvenance];
    }
    return [field, { kind: 'user', materiallyEdited: true, userText: text } satisfies TextProvenance];
  }));
}

export function characterDraftForClient(draft:CharacterDraft):CharacterDraft {
 if(!draft.formation)return draft;
 const {private:omitted,operationId:operation,inputVersion:input,...formation}=draft.formation;void omitted;void operation;void input;
 return {...draft,formation};
}
