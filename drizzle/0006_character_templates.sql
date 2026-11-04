CREATE TABLE character_templates (
  owner TEXT NOT NULL,
  id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  fields TEXT NOT NULL,
  PRIMARY KEY (owner, id)
);
