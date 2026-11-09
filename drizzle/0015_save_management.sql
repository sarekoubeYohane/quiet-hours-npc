CREATE TABLE save_operation_receipts (
  owner TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  request TEXT NOT NULL,
  result TEXT NOT NULL,
  cleanup TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY(owner, operation_id)
);
--> statement-breakpoint
CREATE TABLE deleted_world_usage (
  owner TEXT NOT NULL,
  storage_owner TEXT NOT NULL,
  usage TEXT NOT NULL,
  accounting TEXT NOT NULL DEFAULT '{}',
  deleted_at INTEGER NOT NULL,
  PRIMARY KEY(owner, storage_owner)
);
--> statement-breakpoint
CREATE TABLE save_tombstones (
  owner TEXT NOT NULL,
  id TEXT NOT NULL,
  deleted_at INTEGER NOT NULL,
  PRIMARY KEY(owner, id)
);
