ALTER TABLE org_setup_profiles ADD COLUMN configuration_mode TEXT NOT NULL DEFAULT 'legacy'
  CHECK (configuration_mode IN ('legacy', 'explicit', 'unconfigured'));
ALTER TABLE org_setup_profiles ADD COLUMN operating_model TEXT NOT NULL DEFAULT 'internal'
  CHECK (operating_model IN ('internal', 'integration', 'hybrid'));
ALTER TABLE org_setup_profiles ADD COLUMN configuration_revision INTEGER NOT NULL DEFAULT 0;

-- Freeze the legacy population, including organisations which skipped the old questionnaire.
-- New organisation provisioning explicitly creates an unconfigured row.
INSERT OR IGNORE INTO org_setup_profiles (org_tenant_id)
SELECT tenant_id FROM organizations;
INSERT OR IGNORE INTO org_setup_profiles (org_tenant_id)
SELECT id FROM tenants WHERE tenant_type = 'ORG';
