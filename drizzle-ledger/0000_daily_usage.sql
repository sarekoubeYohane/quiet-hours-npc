-- Independent from worlds, sessions and model keys. Shared by test and production.
CREATE TABLE daily_usage_reservations (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  day TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
  remaining INTEGER NOT NULL CHECK (remaining >= 0),
  expires_at INTEGER NOT NULL
);
CREATE INDEX daily_usage_owner_day ON daily_usage_reservations(owner, day);
