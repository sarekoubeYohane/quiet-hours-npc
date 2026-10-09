import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
export const worlds = sqliteTable('worlds', {owner:text('owner').primaryKey(),state:text('state').notNull(),version:integer('version').notNull().default(0),lockedUntil:integer('locked_until').notNull().default(0)});
export const authSessions = sqliteTable('auth_sessions', { tokenHash: text('token_hash').primaryKey(), userId: text('user_id').notNull(), displayName: text('display_name').notNull(), expiresAt: integer('expires_at').notNull() });
export const oauthAttempts = sqliteTable('oauth_attempts', { stateHash: text('state_hash').primaryKey(), verifier: text('verifier').notNull(), expiresAt: integer('expires_at').notNull() });
export const accountModelKeys = sqliteTable('account_model_keys', {
  scope: text('scope').notNull(), owner: text('owner').notNull(), provider: text('provider').notNull(),
  ciphertext: text('ciphertext').notNull(), nonce: text('nonce').notNull(), tag: text('tag').notNull(), expiresAt: integer('expires_at').notNull(),
}, table => [primaryKey({ columns: [table.scope, table.owner, table.provider] })]);

