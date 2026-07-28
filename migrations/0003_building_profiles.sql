CREATE TABLE building_profiles (
  pnu TEXT PRIMARY KEY CHECK (pnu GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  fetched_at TEXT NOT NULL
);

CREATE INDEX idx_building_profiles_fetched_at
  ON building_profiles (fetched_at DESC);
