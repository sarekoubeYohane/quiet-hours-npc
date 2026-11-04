import { database } from '@/lib/store';
import { seedWorld } from '@/lib/world';
import { worldLocations } from '@/lib/world-configuration';
import { blankCharacterTemplateFields, characterTemplateFieldNames, characterTemplateFields, type CharacterTemplate, type CharacterTemplateFields } from '@/lib/character-templates';

type Row = { id: string; version: number; fields: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const asTemplate = (row: Row): CharacterTemplate => ({ ...row, fields: JSON.parse(row.fields) as CharacterTemplateFields });

export function characterPresets(): CharacterTemplate[] {
  const world = seedWorld();
  return world.characters.map(character => ({
    id: 'preset-' + character.id,
    version: 1,
    fields: {
      ...blankCharacterTemplateFields(),
      name: character.name,
      personality: character.personality,
      abilities: character.abilityTags?.join('\n') ?? '',
      initialMemories: character.memories.map(memory => memory.text).join('\n'),
      directions: character.goal,
      startLocation: worldLocations(world).find(place => place.id === character.location)?.name ?? '',
    },
  }));
}

export async function listCharacterTemplates(owner: string) {
  const { results } = await database().prepare('SELECT id, version, fields FROM character_templates WHERE owner = ? ORDER BY id').bind(owner).all<Row>();
  return results.map(asTemplate);
}

export function readCharacterTemplateSave(value: unknown) {
  if (typeof value !== 'object' || value === null || !('id' in value) || !('version' in value) || !('fields' in value)) return;
  const { id, version, fields } = value;
  if (typeof id !== 'string' || !UUID.test(id) || typeof version !== 'number' || !Number.isSafeInteger(version) ||
      version < 0 || version >= Number.MAX_SAFE_INTEGER || typeof fields !== 'object' || fields === null || Array.isArray(fields)) return;
  const submitted = fields as Record<string, unknown>;
  const accepted = blankCharacterTemplateFields();
  for (const field of characterTemplateFieldNames) {
    const input = submitted[field];
    if (typeof input !== 'string' || input.length > characterTemplateFields[field].maxLength) return;
    accepted[field] = input;
  }
  if (!accepted.name.trim()) return;
  return { id, version, fields: accepted };
}

export async function saveCharacterTemplate(owner: string, template: CharacterTemplate): Promise<CharacterTemplate | undefined> {
  const { id, version, fields } = template;
  const serialized = JSON.stringify(fields);
  const db = database();
  const changed = version === 0
    ? await db.prepare('INSERT OR IGNORE INTO character_templates (owner, id, version, fields) VALUES (?, ?, 1, ?) RETURNING id, version, fields')
      .bind(owner, id, serialized).first<Row>()
    : await db.prepare('UPDATE character_templates SET version = version + 1, fields = ? WHERE owner = ? AND id = ? AND version = ? RETURNING id, version, fields')
      .bind(serialized, owner, id, version).first<Row>();
  if (changed) return asTemplate(changed);

  // A retry of the most recent identical write can recover its original result.
  const current = await db.prepare('SELECT id, version, fields FROM character_templates WHERE owner = ? AND id = ?').bind(owner, id).first<Row>();
  if (current?.version === version + 1 && current.fields === serialized) return asTemplate(current);
}
