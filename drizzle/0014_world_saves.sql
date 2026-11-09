-- Existing world rows retain their identity, journal, values and memory scope.
CREATE TABLE world_saves (
  owner TEXT NOT NULL,
  id TEXT NOT NULL,
  storage_owner TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  creation_request TEXT,
  original_opening TEXT,
  saved_from TEXT,
  PRIMARY KEY (owner, id)
);
--> statement-breakpoint
INSERT INTO world_saves (owner,id,storage_owner,name,created_at)
  SELECT owner,'legacy',owner,'原有存檔',0 FROM worlds WHERE owner NOT LIKE 'account-operations:%';
