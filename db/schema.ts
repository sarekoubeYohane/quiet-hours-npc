import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
export const worlds = sqliteTable('worlds', {owner:text('owner').primaryKey(),cityStarted:integer('city_started').notNull().default(0),state:text('state').notNull(),operations:text('operations').notNull().default('{"floor":0,"results":{}}'),version:integer('version').notNull().default(0),lockedUntil:integer('locked_until').notNull().default(0)});
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


export const characterTemplates = sqliteTable('character_templates', {
  owner: text('owner').notNull(), id: text('id').notNull(),
  version: integer('version').notNull(), fields: text('fields').notNull(),
}, table => [primaryKey({ columns: [table.owner, table.id] })]);

export const sceneTemplates = sqliteTable('scene_templates', {
  owner: text('owner').notNull(),
  id: text('id').notNull(),
  version: integer('version').notNull(),
  body: text('body').notNull(),
}, table => [primaryKey({ columns: [table.owner, table.id] })]);

export const worldBeforeCity = sqliteTable('world_before_city', {
  owner: text('owner').primaryKey(), state: text('state').notNull(), version: integer('version').notNull(),
});

export const characterDrafts = sqliteTable('character_drafts', {
  owner: text('owner').notNull(), id: text('id').notNull(),
  version: integer('version').notNull(), body: text('body').notNull(),
}, table => [primaryKey({ columns: [table.owner, table.id] })]);
// The account identity is separate from world-local leases, journals and memory.
export const worldSaves = sqliteTable('world_saves', {
  owner:text('owner').notNull(), id:text('id').notNull(), storageOwner:text('storage_owner').notNull().unique(),
  name:text('name').notNull(),createdAt:integer('created_at').notNull(),creationRequest:text('creation_request'),
  originalOpening:text('original_opening'),savedFrom:text('saved_from'),
},table=>[primaryKey({columns:[table.owner,table.id]})]);

export const modelPreferences = sqliteTable('model_preferences', {
  owner: text('owner').notNull(), target: text('target').notNull(),
  version: integer('version').notNull(), body: text('body').notNull(),
}, table => [primaryKey({ columns: [table.owner, table.target] })]);

export const characterCards = sqliteTable('character_cards', {owner:text('owner').notNull(),id:text('id').notNull(),version:integer('version').notNull(),body:text('body').notNull()},table=>[primaryKey({columns:[table.owner,table.id]})]);
export const characterCardAssessments = sqliteTable('character_card_assessments', {owner:text('owner').notNull(),draftId:text('draft_id').notNull(),operationId:text('operation_id').notNull(),body:text('body').notNull()},table=>[primaryKey({columns:[table.owner,table.draftId,table.operationId]})]);
