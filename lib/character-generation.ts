import { CharacterTemplateValidationError, initialMemoryCapacityError, characterDescriptionMaxLength, characterTemplateFieldNames, characterTemplateFields, readCharacterTemplateFields } from './character-templates';
import { requestModel, type ModelService } from './model-adapter';
import type { ModelTaskContent } from './model-task';
import { askDirectly, judgeBy } from './model-task-replies';

export function readCharacterGeneration(value: unknown) {
  if (!value || typeof value !== 'object' || !('description' in value) || !('fields' in value)) return;
  const { description } = value;
  const fields = readCharacterTemplateFields(value.fields);
  if (!fields || typeof description !== 'string' || description.length > characterDescriptionMaxLength) return;
  if (!description.trim() && !characterTemplateFieldNames.some(field => fields[field].trim())) return;
  if (!characterTemplateFieldNames.some(field => fields[field] === '')) return;
  const purpose = 'purpose' in value && value.purpose === 'character-card' ? 'character-card' as const : undefined;
  return { description, fields, purpose };
}

type Generation = NonNullable<ReturnType<typeof readCharacterGeneration>>;

/** 「人物欄位補寫」這項模型任務的內容：訊息、回覆契約、輸出上限與對回覆的判定。 */
export function characterGenerationTask(input: Generation): ModelTaskContent<Generation['fields']> {
  const fieldNames = input.purpose === 'character-card' ? characterTemplateFieldNames.filter(field => field !== 'startLocation') : characterTemplateFieldNames;
  const blank = fieldNames.filter(field => input.fields[field] === '');
  const filled = Object.fromEntries(fieldNames.filter(field => input.fields[field] !== '').map(field => [field, input.fields[field]]));
  const properties = Object.fromEntries(blank.map(field => [field, { type: 'string', description: characterTemplateFields[field].label }]));
  return { messages: [
    { role: 'system', content: '你協助玩家準備可編輯的人物範本。依描述及已填設定，只提議可填欄位。已填設定優先，即使很短或是「沒有」也不得重寫、擴寫或否定。保留描述中明示的事實；僅在沒有指定時補充相容內容。請回傳 JSON 物件，每個鍵對應一個可填欄位；明確寫無可用「沒有」，若仍應留空則回傳空字串。' },
    { role: 'user', content: JSON.stringify({ description: input.description, filled, blank }) },
  ], contract: { type: 'object', properties, required: blank, additionalProperties: false }, maxOutputTokens: 4096, judge: judgeBy(raw => {
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
  }) };
}

/** 不經模型任務 module、直接呼叫模型傳輸的舊入口；只剩量測腳本使用（#411 第 5 段收尾）。 */
export const generateCharacterFields = (input: Generation, service: ModelService, options: Parameters<typeof requestModel>[3]) => askDirectly(characterGenerationTask(input), service, options);
