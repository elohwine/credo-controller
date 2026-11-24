CREATE TABLE IF NOT EXISTS job_response_targets (
  org_tenant_id TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('urgent', 'out_of_hours', 'normal')),
  target_minutes INTEGER NOT NULL CHECK (target_minutes BETWEEN 1 AND 10080),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (org_tenant_id, priority)
);

CREATE TABLE IF NOT EXISTS job_map_geocodes (
  org_tenant_id TEXT NOT NULL,
  location_key TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  status TEXT NOT NULL CHECK (status IN ('found', 'not_found')),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (org_tenant_id, location_key)
);
