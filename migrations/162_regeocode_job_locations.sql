-- Job locations are now placed by postcode first (postcodes.io), then by street searches checked
-- against the postcode area, or at the postcode district centre ("approximate"). Earlier results
-- could be a same-named street in another town, so every place is looked up again.
DROP TABLE IF EXISTS job_map_geocodes;
CREATE TABLE job_map_geocodes (
  org_tenant_id TEXT NOT NULL,
  location_key TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  status TEXT NOT NULL CHECK (status IN ('found', 'approximate', 'not_found')),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (org_tenant_id, location_key)
);
