-- Wallet inbox queue + VC issuance log (compat schema).
--
-- Fresh databases created from this migration set previously lacked these tables even though
-- the requisition / FEPT / workflow-request controllers and the OrgWorkflowActorCredentialService
-- write to them. Live databases already have them (created by the original wallet migrations),
-- so everything here is IF NOT EXISTS / no-op.

CREATE TABLE IF NOT EXISTS wallet_pending_offers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  issuer_tenant_id TEXT,
  contact_id TEXT,
  source_type TEXT NOT NULL,
  source_id TEXT,
  credential_type TEXT NOT NULL,
  offer_uri TEXT NOT NULL,
  title TEXT,
  body TEXT,
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at DATETIME,
  last_error TEXT,
  workflow_run_id TEXT,
  accepted_at DATETIME,
  accepted_credential_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_wallet_pending_offers_tenant_open
  ON wallet_pending_offers (tenant_id, resolved_at);

CREATE INDEX IF NOT EXISTS idx_wallet_pending_offers_source
  ON wallet_pending_offers (source_type, source_id);

CREATE TABLE IF NOT EXISTS vc_issuance_log (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  vc_type     TEXT NOT NULL,
  issuer_did  TEXT NOT NULL DEFAULT '',
  issued_at   DATETIME NOT NULL,
  revoked_at  DATETIME,
  revoked     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_vc_issuance_log_tenant_type
  ON vc_issuance_log (tenant_id, vc_type);
