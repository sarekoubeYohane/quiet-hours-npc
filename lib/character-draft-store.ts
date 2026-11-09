import { database } from './store';
import { userTextProvenance, type CharacterDraft, type readCharacterDraftInput } from './character-drafts';
type Row = { id: string; version: number; body: string };
const fromRow = (row: Row): CharacterDraft => ({ ...JSON.parse(row.body), id: row.id, version: row.version });
export async function listCharacterDrafts(owner: string) {
  const { results } = await database().prepare('SELECT id, version, body FROM character_drafts WHERE owner = ? ORDER BY id').bind(owner).all<Row>();
  return results.map(fromRow);
}
export async function loadCharacterDraft(owner: string, id: string) {
  const row = await database().prepare('SELECT id, version, body FROM character_drafts WHERE owner = ? AND id = ?').bind(owner, id).first<Row>();
  return row ? fromRow(row) : undefined;
}
export async function writeCharacterDraft(owner: string, next: CharacterDraft) {
  const { id, version, ...content } = next;
  const body = JSON.stringify(content);
  const changed = version === 0
    ? await database().prepare('INSERT OR IGNORE INTO character_drafts (owner, id, version, body) VALUES (?, ?, 1, ?) RETURNING id, version, body').bind(owner, id, body).first<Row>()
    : await database().prepare('UPDATE character_drafts SET version = version + 1, body = ? WHERE owner = ? AND id = ? AND version = ? RETURNING id, version, body').bind(body, owner, id, version).first<Row>();
  if (changed) return fromRow(changed);
  const current = await database().prepare('SELECT id, version, body FROM character_drafts WHERE owner = ? AND id = ?').bind(owner, id).first<Row>();
  if (current?.version === version + 1 && current.body === body) return fromRow(current);
}
export async function saveCharacterDraft(owner: string, input: NonNullable<ReturnType<typeof readCharacterDraftInput>>) {
  const current = await loadCharacterDraft(owner, input.id);
  const sameText = current && current.concept === input.concept && JSON.stringify(current.fields) === JSON.stringify(input.fields);
  if(current?.formation||current?.pendingFormation)return;
  if (sameText && (current.version === input.version || current.version === input.version + 1)) return current;
  if ((current?.version ?? 0) !== input.version) return;
  return writeCharacterDraft(owner, { ...input, provenance: userTextProvenance(current, input.fields), ...(current?.completedGeneration ? { completedGeneration: current.completedGeneration } : {}), ...(current?.pendingGeneration ? { pendingGeneration: current.pendingGeneration } : {}) });
}
