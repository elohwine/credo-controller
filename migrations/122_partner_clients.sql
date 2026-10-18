-- "Sign in with Credentis" for other platforms. An organisation registers a partner client;
-- the partner (directly, or through the hosted OIDC bridge) opens wallet verification
-- sessions and reads each verified result once. Secrets and binding refs are stored hashed.
CREATE TABLE IF NOT EXISTS partner_clients (
  client_id TEXT PRIMARY KEY,
  org_tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  secret_hash TEXT NOT NULL,
  subject_salt TEXT NOT NULL,
  redirect_uris TEXT NOT NULL,
  policy TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_by TEXT,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  secret_rotated_at DATETIME,
  revoked_at DATETIME,
  revoked_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_partner_clients_org ON partner_clients(org_tenant_id);

CREATE TABLE IF NOT EXISTS partner_verification_sessions (
  verification_id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  binding_ref_hash TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME,
  result_code TEXT
);

CREATE INDEX IF NOT EXISTS idx_partner_verification_sessions_client ON partner_verification_sessions(client_id);
CREATE INDEX IF NOT EXISTS idx_partner_verification_sessions_expires ON partner_verification_sessions(expires_at);
