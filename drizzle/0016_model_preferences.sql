CREATE TABLE model_preferences (
  owner TEXT NOT NULL,
  target TEXT NOT NULL,
  version INTEGER NOT NULL,
  body TEXT NOT NULL,
  PRIMARY KEY (owner, target)
);
