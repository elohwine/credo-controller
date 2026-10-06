-- Proof VC policy table for databases that never applied migration 082.
-- No foreign key: tenant identity lives in the tenant store, not this database.

CREATE TABLE IF NOT EXISTS org_proof_vc_policies (
  org_tenant_id TEXT PRIMARY KEY,
  default_vc_types TEXT NOT NULL DEFAULT '["PlatformIdentityCredential"]',
  action_overrides TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_org_proof_vc_policies_updated_at
  ON org_proof_vc_policies(updated_at);
