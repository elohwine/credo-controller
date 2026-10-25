ALTER TABLE device_keys ADD COLUMN verified_at TEXT;
ALTER TABLE device_keys ADD COLUMN key_usage TEXT NOT NULL DEFAULT 'payment';
ALTER TABLE device_keys ADD COLUMN auth_policy TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE ssi_users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE wallet_login_sessions ADD COLUMN authorization_request TEXT;
ALTER TABLE partner_verification_sessions ADD COLUMN authorization_request TEXT;

CREATE TABLE device_enrollment_challenges (
  nonce TEXT PRIMARY KEY,
  wallet_tenant_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE TABLE device_login_challenges (
  id TEXT PRIMARY KEY,
  device_key_id TEXT NOT NULL,
  wallet_tenant_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  payload TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE TABLE device_login_approvals (
  verification_id TEXT PRIMARY KEY,
  wallet_tenant_id TEXT NOT NULL,
  device_key_id TEXT NOT NULL,
  policy_hash TEXT,
  approved_at TEXT NOT NULL
);
