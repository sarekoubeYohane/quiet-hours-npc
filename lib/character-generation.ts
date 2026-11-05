import { CharacterTemplateValidationError, initialMemoryCapacityError, characterDescriptionMaxLength, characterTemplateFieldNames, characterTemplateFields, readCharacterTemplateFields } from './character-templates';
import { requestModel, type ModelService } from './model-adapter';

export function readCharacterGeneration(value: unknown) {
  if (!value || typeof value !== 'object' || !('description' in value) || !('fields' in value)) return;
  const { description } = value;
  const fields = readCharacterTemplateFields(value.fields);
  if (!fields || typeof description !== 'string' || description.length > characterDescriptionMaxLength) return;
  if (!description.trim() && !characterTemplateFieldNames.some(field => fields[field].trim())) return;
  if (!characterTemplateFieldNames.some(field => fields[field] === '')) return;
  return { description, fields };
}

type Generation = NonNullable<ReturnType<typeof readCharacterGeneration>>;

export async function generateCharacterFields(input: Generation, service: ModelService, options: Parameters<typeof requestModel>[3]) {
  const blank = characterTemplateFieldNames.filter(field => input.fields[field] === '');
  const filled = Object.fromEntries(characterTemplateFieldNames.filter(field => input.fields[field] !== '').map(field => [field, input.fields[field]]));
  const properties = Object.fromEntries(blank.map(field => [field, { type: 'string', description: characterTemplateFields[field].label }]));
  const raw = await requestModel(service, [
    { role: 'system', content: '你協助玩家準備可編輯的人物範本。依描述及已填設定，只提議可填欄位。已填設定優先，即使很短或是「沒有」也不得重寫、擴寫或否定。保留描述中明示的事實；僅在沒有指定時補充相容內容。請回傳 JSON 物件，每個鍵對應一個可填欄位；明確寫無可用「沒有」，若仍應留空則回傳空字串。' },
    { role: 'user', content: JSON.stringify({ description: input.description, filled, blank }) },
  ], { type: 'object', properties, required: blank, additionalProperties: false }, { ...options, maxOutputTokens: 4096 });

  const invalid = () => Error('模型沒有回傳有效的人物草稿，原設定已保留。');
  let parsed: unknown;
  try {
    if (raw.length > 32000) throw invalid();
    parsed = JSON.parse(raw);
  } catch {
    throw invalid();
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw invalid();
  const candidate = parsed as Record<string, unknown>;
  if (Object.keys(candidate).some(key => !Object.hasOwn(characterTemplateFields, key))) throw invalid();
  const result = { ...input.fields };
  for (const field of blank) {
    if (!Object.hasOwn(candidate, field)) continue;
    const value = candidate[field];
    if (typeof value !== 'string' || value.length > characterTemplateFields[field].maxLength) throw invalid();
    result[field] = value;
  }
  const memoryError = initialMemoryCapacityError(result.initialMemories);
  if (memoryError) throw new CharacterTemplateValidationError(memoryError);
  return result;
}
