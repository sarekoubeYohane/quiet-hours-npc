import {authoringScope} from './account-scope';
import { database } from './store';
import { modelKeyStatus, modelKeyStorageAvailable } from './model-keys';
import type { ModelPreference, ModelRoles, ModelSettingsView } from './model-settings';
import type { SaveBinding } from './world-saves';
type Row = { version: number; body: string };
const accountTarget = 'account';
const saveTarget = (id: string) => 'save:' + id;
async function read(owner: string, target: string) {
  return database().prepare('SELECT version, body FROM model_preferences WHERE owner = ? AND target = ?').bind(owner, target).first<Row>();
}
export async function readEffectiveModels(owner: string, binding?: SaveBinding, legacy?: ModelRoles) {
  const account = await read(owner, accountTarget);
  const accountModels: ModelRoles = account ? (JSON.parse(account.body) as { mode: 'custom'; models: ModelRoles }).models : {};
  const selected = binding?.saveId ? await read(owner, saveTarget(binding.saveId)) : account;
  const preference: ModelPreference = selected ? JSON.parse(selected.body) : { mode: 'inherit' };
  let source: ModelSettingsView['source'] = 'missing', effective: ModelRoles = {};
  if (binding?.saveId && preference.mode === 'custom') { source = 'save'; effective = preference.models; }
  else if (binding?.saveId && !selected && legacy?.adjudication) { source = 'legacy'; effective = legacy; }
  else if (account) { source = 'account'; effective = accountModels; }
  else if (preference.mode === 'inherit' && selected) { source = 'missing'; }
  else if (legacy?.adjudication || legacy?.npc) { source = 'legacy'; effective = legacy; }
  // A selected inherit record deliberately opts out of legacy per-world config.
  if (!account && binding?.saveId && selected && preference.mode === 'inherit') { source = 'missing'; effective = {}; }
  return { version: selected?.version ?? 0, preference, effective, accountVersion: account?.version ?? 0, accountModels, source };
}
export async function modelSettingsView(owner: string, binding?: SaveBinding) : Promise<ModelSettingsView> {
  let legacy: ModelRoles | undefined;
  const storage = binding?.storageOwner ?? 'account-operations:' + owner;
  const row = await database().prepare('SELECT state FROM worlds WHERE owner = ?').bind(storage).first<{ state: string }>();
  if (row) { const old = JSON.parse(row.state); if (old.adjudication) legacy = { adjudication: old.adjudication }; }
  return { accountScope:authoringScope(owner), ...await readEffectiveModels(owner, binding, legacy), modelKeys: await modelKeyStatus(owner), modelKeyStorageAvailable: modelKeyStorageAvailable() };
}
export async function saveModelPreference(owner: string, binding: SaveBinding | undefined, version: number, preference: ModelPreference) {
  const target = binding?.saveId ? saveTarget(binding.saveId) : accountTarget;
  const body = JSON.stringify(preference);
  const saveId = binding?.saveId;
  const changed = version === 0
    ? saveId
      ? await database().prepare('INSERT OR IGNORE INTO model_preferences (owner, target, version, body) SELECT ?, ?, 1, ? WHERE EXISTS (SELECT 1 FROM world_saves WHERE owner = ? AND id = ?) RETURNING version, body').bind(owner, target, body, owner, saveId).first<Row>()
      : await database().prepare('INSERT OR IGNORE INTO model_preferences (owner, target, version, body) VALUES (?, ?, 1, ?) RETURNING version, body').bind(owner, target, body).first<Row>()
    : saveId
      ? await database().prepare('UPDATE model_preferences SET version = version + 1, body = ? WHERE owner = ? AND target = ? AND version = ? AND EXISTS (SELECT 1 FROM world_saves WHERE owner = ? AND id = ?) RETURNING version, body').bind(body, owner, target, version, owner, saveId).first<Row>()
      : await database().prepare('UPDATE model_preferences SET version = version + 1, body = ? WHERE owner = ? AND target = ? AND version = ? RETURNING version, body').bind(body, owner, target, version).first<Row>();
  if (changed) return true;
  const current = await read(owner, target);
  return current?.version === version + 1 && current.body === body;
}
