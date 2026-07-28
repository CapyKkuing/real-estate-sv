CREATE TABLE land_use_profiles (
  pnu TEXT PRIMARY KEY CHECK (pnu GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  fetched_at TEXT NOT NULL
);

CREATE INDEX idx_land_use_profiles_fetched_at
  ON land_use_profiles (fetched_at DESC);
