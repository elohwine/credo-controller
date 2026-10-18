-- Holder custody migration: wallet records bound to a key the wallet does not own are
-- reissued with the same claims to the wallet's own DID. One row per old record.
CREATE TABLE IF NOT EXISTS wallet_custody_rebinds (
  wallet_tenant_id TEXT NOT NULL,
  old_record_id TEXT NOT NULL,
  credential_id TEXT,
  credential_type TEXT,
  old_subject_did TEXT,
  new_record_id TEXT,
  status TEXT NOT NULL,
  error TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (wallet_tenant_id, old_record_id)
);
