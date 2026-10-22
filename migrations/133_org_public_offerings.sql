-- Trust badges an organisation shows on its public profile. The table existed only on older
-- databases (the migration that created it was removed), so badge seeding failed silently.
-- Missing columns (service_catalog.workflow_template_id, organization_registry.payment_rails)
-- are added by DatabaseManager.repairDiscoveryColumns because SQLite has no ADD COLUMN IF NOT EXISTS.
CREATE TABLE IF NOT EXISTS org_trust_badges (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL,
  tenant_id    TEXT NOT NULL,
  badge_type   TEXT NOT NULL,
  label        TEXT NOT NULL,
  vc_log_id    TEXT,
  revoked      INTEGER DEFAULT 0,
  issued_at    TEXT NOT NULL,
  revoked_at   TEXT,
  FOREIGN KEY (org_id) REFERENCES organization_registry(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_trust_badge_org ON org_trust_badges(org_id, revoked);
CREATE INDEX IF NOT EXISTS idx_trust_badge_type ON org_trust_badges(badge_type);
CREATE INDEX IF NOT EXISTS idx_trust_badge_tenant ON org_trust_badges(tenant_id);
