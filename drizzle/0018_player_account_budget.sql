CREATE TABLE player_accounts (
  owner TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  settings_version INTEGER NOT NULL DEFAULT 0,
  last_request TEXT NOT NULL DEFAULT '',
  token TEXT NOT NULL,
  usage TEXT NOT NULL,
  budget TEXT NOT NULL,
  prices TEXT NOT NULL,
  initialized INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE player_usage_origins (
  owner TEXT NOT NULL,
  storage_owner TEXT NOT NULL,
  recovery TEXT NOT NULL,
  unknown_range INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(owner, storage_owner)
);
--> statement-breakpoint
CREATE TABLE player_dispatches (
  owner TEXT NOT NULL,
  storage_owner TEXT NOT NULL,
  request_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  token TEXT NOT NULL,
  usage TEXT NOT NULL,
  phase TEXT NOT NULL,
  pending_until INTEGER NOT NULL,
  PRIMARY KEY(owner, storage_owner, request_id)
);
--> statement-breakpoint
CREATE INDEX player_dispatch_pending ON player_dispatches(owner, phase, pending_until);
