-- Private evidence is not part of worlds.state or its short replay journal.
CREATE TABLE decision_traces (
  owner TEXT NOT NULL,
  context_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  body TEXT NOT NULL CHECK (json_valid(body)),
  bytes INTEGER NOT NULL CHECK (bytes = length(CAST(body AS BLOB)) AND bytes <= 1048576),
  PRIMARY KEY (owner, operation_id)
);
--> statement-breakpoint
CREATE INDEX decision_traces_owner_context ON decision_traces(owner, context_id, created_at);
--> statement-breakpoint
CREATE TABLE decision_trace_retention (
  owner TEXT PRIMARY KEY NOT NULL,
  evicted INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TRIGGER decision_trace_deleted AFTER DELETE ON decision_traces BEGIN
  INSERT INTO decision_trace_retention(owner, evicted) VALUES (OLD.owner, 1)
  ON CONFLICT(owner) DO UPDATE SET evicted = evicted + 1;
END;
--> statement-breakpoint
CREATE TRIGGER decision_trace_insert_limit AFTER INSERT ON decision_traces BEGIN
  DELETE FROM decision_traces WHERE rowid IN (
    SELECT trace_row FROM (
      SELECT rowid AS trace_row,
        row_number() OVER (ORDER BY created_at DESC, rowid DESC) AS newest_rank,
        sum(bytes) OVER (ORDER BY created_at DESC, rowid DESC) AS newest_bytes
      FROM decision_traces WHERE owner = NEW.owner
    ) WHERE newest_rank > 64 OR newest_bytes > 16777216
  );
END;
--> statement-breakpoint
CREATE TRIGGER decision_trace_update_limit AFTER UPDATE OF body, bytes ON decision_traces BEGIN
  DELETE FROM decision_traces WHERE rowid IN (
    SELECT trace_row FROM (
      SELECT rowid AS trace_row,
        row_number() OVER (ORDER BY created_at DESC, rowid DESC) AS newest_rank,
        sum(bytes) OVER (ORDER BY created_at DESC, rowid DESC) AS newest_bytes
      FROM decision_traces WHERE owner = NEW.owner
    ) WHERE newest_rank > 64 OR newest_bytes > 16777216
  );
END;
