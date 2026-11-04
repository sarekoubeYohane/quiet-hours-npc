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

export function readCharacterTemplateFields(value: unknown): CharacterTemplateFields | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return;
  const submitted = value as Record<string, unknown>;
  const accepted = blankCharacterTemplateFields();
  for (const field of characterTemplateFieldNames) {
    const input = submitted[field];
    if (typeof input !== 'string' || input.length > characterTemplateFields[field].maxLength) return;
    accepted[field] = input;
  }
  return accepted;
}
