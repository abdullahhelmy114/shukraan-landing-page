-- Small JSON documents kept whole: the groups (status, capacity, days, hour), their paid places
-- and the waitlist. Changed with a version check, so two payments cannot both take a last place.
CREATE TABLE IF NOT EXISTS docs (
  name TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  version INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
