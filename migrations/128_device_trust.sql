-- Phone-native biometric keys. The server stores the public key and the enrollment
-- attestation. It never stores a biometric. A later login or fund release must be
-- signed by this key over a one-time nonce. A signature can be accepted only once.

CREATE TABLE IF NOT EXISTS device_keys (
  id TEXT PRIMARY KEY,
  wallet_tenant_id TEXT NOT NULL,
  public_jwk TEXT NOT NULL,
  thumbprint TEXT NOT NULL,
  platform TEXT NOT NULL,
  attestation_json TEXT,
  hardware_backed INTEGER NOT NULL DEFAULT 0,
  user_auth_required INTEGER NOT NULL DEFAULT 0,
  label TEXT,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_device_keys_thumbprint ON device_keys(thumbprint);
CREATE INDEX IF NOT EXISTS idx_device_keys_wallet ON device_keys(wallet_tenant_id);

CREATE TABLE IF NOT EXISTS device_assertions (
  nonce_hash TEXT PRIMARY KEY,
  device_key_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  used_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_device_assertions_used ON device_assertions(used_at);

ALTER TABLE org_proof_vc_policies ADD COLUMN device_trust TEXT NOT NULL DEFAULT '{"enabled":false,"requiredActions":["release_funds","trigger_payout","record_payment"]}';

