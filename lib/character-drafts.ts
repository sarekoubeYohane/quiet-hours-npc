import { blankCharacterTemplateFields, characterTemplateFieldNames, characterTemplateFields, readCharacterTemplateFields, type CharacterTemplateFields } from './character-templates';

export const characterDraftFieldNames = characterTemplateFieldNames.filter(name => name !== 'startLocation');
export type CharacterDraftField = typeof characterDraftFieldNames[number];
export type TextProvenance = { kind: 'empty' | 'user' | 'ai' | 'unknown'; aiText?: string; aiHistory?: string[]; sourceText?: string; materiallyEdited: boolean; userText?: string };
export type CharacterDraft = {
  accountScope?:string;
  id: string; version: number; concept: string; fields: CharacterTemplateFields;
  provenance: Record<string, TextProvenance>;
  sourceTemplate?:{id:string;version:number};
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
function aiLineage(origin: TextProvenance | undefined, previousText = '') {
  return [...new Set([...(origin?.aiHistory ?? []), ...(origin?.aiText !== undefined ? [origin.aiText] : origin?.kind === 'ai' ? [previousText] : [])])];
}
export function generatedTextProvenance(origin: TextProvenance | undefined, text: string): TextProvenance {
  const history = aiLineage(origin).filter(value => meaningfulText(value) !== meaningfulText(text));
  return { kind: 'ai', ...(origin?.sourceText!==undefined?{sourceText:origin.sourceText}:{}), aiText: text, ...(history.length ? { aiHistory: history } : {}), materiallyEdited: false };
}
export function userTextProvenance(previous: CharacterDraft | undefined, fields: CharacterTemplateFields) {
  return Object.fromEntries(characterDraftFieldNames.map(field => {
    const text = fields[field];
    const origin = previous?.provenance[field];
    const known = aiLineage(origin, previous?.fields[field]);
    const lineage = { ...(known.length ? { aiText: known.at(-1)!, ...(known.length > 1 ? { aiHistory: known.slice(0, -1) } : {}) } : {}), ...(origin?.sourceText!==undefined?{sourceText:origin.sourceText}:{}) };
    if (!text.trim()) return [field, { ...lineage, kind: 'empty', materiallyEdited: false } satisfies TextProvenance];
    if (known.length) {
      const materiallyEdited = ![...known,...(origin?.sourceText?[origin.sourceText]:[])].some(value => meaningfulText(text) === meaningfulText(value));
      return [field, { kind: 'ai', ...lineage, materiallyEdited, ...(materiallyEdited ? { userText: text } : {}) } satisfies TextProvenance];
    }
    if(origin?.sourceText?.trim()){const materiallyEdited=meaningfulText(text)!==meaningfulText(origin.sourceText);return [field,{...lineage,kind:'unknown',materiallyEdited,...(materiallyEdited?{userText:text}:{})} satisfies TextProvenance];}
    return [field, { kind: 'user', materiallyEdited: true, userText: text } satisfies TextProvenance];
  }));
}

export function characterDraftForClient(draft:CharacterDraft,owner?:string):CharacterDraft {
 const scope=owner?{accountScope:'account-operations:'+owner}:{};
 if(!draft.formation)return {...draft,...scope};
 const {private:omitted,operationId:operation,inputVersion:input,...formation}=draft.formation;void omitted;void operation;void input;
 return {...draft,...scope,formation};
}
