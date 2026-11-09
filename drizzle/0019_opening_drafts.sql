CREATE TABLE opening_drafts (
  owner TEXT NOT NULL,
  id TEXT NOT NULL,
  version INTEGER NOT NULL,
  body TEXT NOT NULL,
  sources TEXT NOT NULL,
  candidate TEXT NOT NULL,
  last_request TEXT NOT NULL,
  finalized_save_id TEXT,
  PRIMARY KEY(owner, id)
);
