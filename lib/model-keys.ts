import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from 'cloudflare:workers';
import { database } from './store';

export type ModelProvider = 'openai' | 'openrouter';
export type ModelKeyStatus = Record<ModelProvider, { configured: boolean; expiresAt: number | null }>;
export class ModelKeyError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
const lifetime = 24 * 60 * 60 * 1000;
function scope() {
  if (!['local', 'test', 'production'].includes(env.APP_ENV || '') || !env.AUTH_ORIGIN) throw new ModelKeyError('Key 保存服務尚未設定完成。', 503);
  return JSON.stringify([env.APP_ENV, env.AUTH_ORIGIN]);
}
function encryptionKey() {
  const secret = env.MODEL_KEY_ENCRYPTION_SECRET;
  if (!secret || !/^[a-f\d]{64}$/i.test(secret)) throw new ModelKeyError('Key 保存服務尚未設定完成，請聯絡管理者。', 503);
  return Buffer.from(secret, 'hex');
}
export function modelKeyStorageAvailable() {
  try { scope(); encryptionKey(); return true; } catch { return false; }
}
const context = (owner: string, provider: ModelProvider, expiresAt: number) => Buffer.from(JSON.stringify(['model-key-v1', scope(), owner, provider, expiresAt]));
async function purgeExpired() {
  await database().prepare('DELETE FROM account_model_keys WHERE scope = ? AND expires_at <= ?').bind(scope(), Date.now()).run();
}
export async function modelKeyStatus(owner: string): Promise<ModelKeyStatus> {
  await purgeExpired();
  const status: ModelKeyStatus = { openai: { configured: false, expiresAt: null }, openrouter: { configured: false, expiresAt: null } };
  for (const provider of ['openai', 'openrouter'] as const) {
    const row = await database().prepare('SELECT expires_at FROM account_model_keys WHERE scope = ? AND owner = ? AND provider = ? AND expires_at > ?')
      .bind(scope(), owner, provider, Date.now()).first<{ expires_at: number }>();
    if (row) status[provider] = { configured: modelKeyStorageAvailable(), expiresAt: row.expires_at };
  }
  return status;
}
export async function saveModelKey(owner: string, provider: ModelProvider, value: unknown) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 4096 || /[\s\x00-\x1f\x7f]/.test(value.trim())) throw new ModelKeyError('請貼上有效的 API Key，最多 4,096 字元，不能包含空白或換行。');
  const expiresAt = Date.now() + lifetime;
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), nonce);
  cipher.setAAD(context(owner, provider, expiresAt));
  const ciphertext = Buffer.concat([cipher.update(value.trim(), 'utf8'), cipher.final()]).toString('base64');
  await purgeExpired();
  await database().prepare(`INSERT INTO account_model_keys (scope, owner, provider, ciphertext, nonce, tag, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(scope, owner, provider) DO UPDATE SET ciphertext = excluded.ciphertext, nonce = excluded.nonce, tag = excluded.tag, expires_at = excluded.expires_at`)
    .bind(scope(), owner, provider, ciphertext, nonce.toString('base64'), cipher.getAuthTag().toString('base64'), expiresAt).run();
}
export async function clearModelKey(owner: string, provider: ModelProvider) {
  await database().prepare('DELETE FROM account_model_keys WHERE scope = ? AND owner = ? AND provider = ?').bind(scope(), owner, provider).run();
}
// Plaintext is used only for a server-side provider dispatch, never returned by an API.
export async function readModelKey(owner: string, provider: ModelProvider): Promise<string> {
  const key = encryptionKey();
  await purgeExpired();
  const row = await database().prepare('SELECT ciphertext, nonce, tag, expires_at FROM account_model_keys WHERE scope = ? AND owner = ? AND provider = ? AND expires_at > ?')
    .bind(scope(), owner, provider, Date.now()).first<{ ciphertext: string; nonce: string; tag: string; expires_at: number }>();
  if (!row || row.expires_at <= Date.now()) throw new ModelKeyError('尚未保存 API Key，或 Key 已到期／清除。請在模型設定重新保存。');
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(row.nonce, 'base64'), { authTagLength: 16 });
    decipher.setAAD(context(owner, provider, row.expires_at));
    decipher.setAuthTag(Buffer.from(row.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(row.ciphertext, 'base64')), decipher.final()]).toString('utf8');
  } catch { throw new ModelKeyError('無法讀取已保存的 API Key，請清除後重新保存。', 503); }
}
