-- The person asked the Central Registry to confirm their date of birth (opt-in, at sign up
-- or later from Settings). No PII here: only the wallet tenant id and a status. The date of
-- birth itself is never stored server-side; it lives only in the reissued PlatformIdentityVC.
CREATE TABLE IF NOT EXISTS registry_identity_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | fulfilled | declined
  requested_at TEXT NOT NULL,
  fulfilled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_registry_identity_requests_tenant ON registry_identity_requests(tenant_id);
