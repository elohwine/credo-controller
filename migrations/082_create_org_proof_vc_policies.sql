-- Org-level proof VC policy for VP authorization flows.
-- Allows each org to accept role-specific VCs while always keeping PlatformIdentityCredential as fallback.

CREATE TABLE IF NOT EXISTS org_proof_vc_policies (
  org_tenant_id TEXT PRIMARY KEY,
  default_vc_types TEXT NOT NULL DEFAULT '["PlatformIdentityCredential"]',
  action_overrides TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (org_tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_org_proof_vc_policies_updated_at
  ON org_proof_vc_policies(updated_at);
