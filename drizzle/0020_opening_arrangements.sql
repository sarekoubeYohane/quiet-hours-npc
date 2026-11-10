CREATE TABLE opening_arrangements (
 owner TEXT NOT NULL,
 draft_id TEXT NOT NULL,
 operation_id TEXT NOT NULL,
 input_version INTEGER NOT NULL,
 revision INTEGER NOT NULL DEFAULT 0,
 request TEXT NOT NULL,
 snapshot TEXT NOT NULL,
 state TEXT NOT NULL,
 result TEXT,
 error TEXT,
 adoption_request TEXT,
 PRIMARY KEY (owner,draft_id,operation_id)
);
CREATE UNIQUE INDEX opening_arrangement_pending ON opening_arrangements(owner,draft_id) WHERE state='pending';
