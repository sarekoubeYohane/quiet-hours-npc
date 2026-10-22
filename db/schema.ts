import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
export const worlds = sqliteTable('worlds', {owner:text('owner').primaryKey(),state:text('state').notNull(),operations:text('operations').notNull().default('{"floor":0,"results":{}}'),version:integer('version').notNull().default(0),lockedUntil:integer('locked_until').notNull().default(0)});
export const authSessions = sqliteTable('auth_sessions', { tokenHash: text('token_hash').primaryKey(), userId: text('user_id').notNull(), displayName: text('display_name').notNull(), expiresAt: integer('expires_at').notNull() });
export const oauthAttempts = sqliteTable('oauth_attempts', { stateHash: text('state_hash').primaryKey(), verifier: text('verifier').notNull(), expiresAt: integer('expires_at').notNull() });
export const accountModelKeys = sqliteTable('account_model_keys', {
  scope: text('scope').notNull(), owner: text('owner').notNull(), provider: text('provider').notNull(),
  ciphertext: text('ciphertext').notNull(), nonce: text('nonce').notNull(), tag: text('tag').notNull(), expiresAt: integer('expires_at').notNull(),
}, table => [primaryKey({ columns: [table.scope, table.owner, table.provider] })]);

// SQL migration 0005 also installs byte checks and atomic retention triggers.
// These are observer records, intentionally separate from World JSON.
export const decisionTraces = sqliteTable('decision_traces', {
  owner: text('owner').notNull(), contextId: text('context_id').notNull(),
  operationId: text('operation_id').notNull(), requestId: text('request_id').notNull(),
  createdAt: integer('created_at').notNull(), body: text('body').notNull(), bytes: integer('bytes').notNull(),
}, table => [primaryKey({ columns: [table.owner, table.operationId] })]);
export const decisionTraceRetention = sqliteTable('decision_trace_retention', {
  owner: text('owner').primaryKey(), evicted: integer('evicted').notNull().default(0),
});

