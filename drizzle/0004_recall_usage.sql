CREATE TABLE recall_dispatch_usage (
  reservation_id TEXT PRIMARY KEY NOT NULL,
  account_owner TEXT NOT NULL,
  month TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('embedding', 'index', 'search', 'chat')),
  units INTEGER NOT NULL CHECK (units > 0),
  reserved_at INTEGER NOT NULL,
  known_input_tokens INTEGER CHECK (known_input_tokens IS NULL OR known_input_tokens >= 0)
);
--> statement-breakpoint
CREATE INDEX recall_usage_month_kind ON recall_dispatch_usage(month, kind, account_owner);
--> statement-breakpoint
CREATE TABLE recall_index_entries (
  vector_id TEXT PRIMARY KEY NOT NULL,
  account_owner TEXT NOT NULL,
  npc TEXT NOT NULL,
  memory_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0)
);
--> statement-breakpoint
CREATE INDEX recall_index_entries_account ON recall_index_entries(account_owner, npc, memory_id);
