CREATE TABLE ordinance_profiles (
  jurisdiction_code TEXT NOT NULL CHECK (jurisdiction_code GLOB '[0-9][0-9][0-9][0-9][0-9]'),
  zone_code TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (jurisdiction_code, zone_code)
);

CREATE INDEX idx_ordinance_profiles_fetched_at
  ON ordinance_profiles (fetched_at DESC);
