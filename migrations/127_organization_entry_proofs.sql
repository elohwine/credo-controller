CREATE TABLE IF NOT EXISTS organization_entry_proofs (
  request_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  org_tenant_id TEXT NOT NULL,
  session_hash TEXT NOT NULL,
  poll_token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_organization_entry_proofs_expiry ON organization_entry_proofs(expires_at);
