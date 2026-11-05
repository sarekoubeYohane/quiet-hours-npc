import { shortMemoryTextMaxBytes } from './memory-limits';

export const characterTemplateFields = {
  name: { label: '姓名', maxLength: 80 },
  appearance: { label: '外觀', maxLength: 1200 },
  personality: { label: '性格', maxLength: 1200 },
  abilities: { label: '能力', maxLength: 1200 },
  background: { label: '背景經歷', maxLength: 2400 },
  initialMemories: { label: '初始記憶', maxLength: 2400 },
  beliefs: { label: '信念', maxLength: 1200 },
  preferences: { label: '喜好', maxLength: 1200 },
  directions: { label: '在意方向', maxLength: 1200 },
  startLocation: { label: '起始位置描述', maxLength: 300 },
} as const;

export type CharacterTemplateField = keyof typeof characterTemplateFields;
export type CharacterTemplateFields = Record<CharacterTemplateField, string>;
export type CharacterTemplate = { id: string; version: number; fields: CharacterTemplateFields };

export const characterTemplateFieldNames = Object.keys(characterTemplateFields) as CharacterTemplateField[];
export function blankCharacterTemplateFields(): CharacterTemplateFields {
  return Object.fromEntries(characterTemplateFieldNames.map(name => [name, ''])) as CharacterTemplateFields;
}

export const characterDescriptionMaxLength = 2400;

export class CharacterTemplateValidationError extends Error {}

export function initialMemoryCapacityError(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  const bytes = new TextEncoder().encode(value).length;
  if (bytes > shortMemoryTextMaxBytes) {
    return `初始記憶目前為 ${bytes} UTF-8 bytes，上限為 ${shortMemoryTextMaxBytes} bytes（另有 2,400 字元上限）。請到人物範本縮短「初始記憶」後保存，再重新選用；原文已保留，未截斷。`;
  }
}

export function readCharacterTemplateFields(value: unknown): CharacterTemplateFields | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return;
  const submitted = value as Record<string, unknown>;
  const accepted = blankCharacterTemplateFields();
  for (const field of characterTemplateFieldNames) {
    const input = submitted[field];
    if (typeof input !== 'string' || input.length > characterTemplateFields[field].maxLength) return;
    accepted[field] = input;
  }
  if (initialMemoryCapacityError(accepted.initialMemories)) return;
  return accepted;
}
