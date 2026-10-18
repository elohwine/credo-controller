-- Organisations that keep their own software connect it to Credentis. They define simple
-- record types (versioned field lists) and their connected systems send those records to
-- people's wallets. Each send is one idempotent request the system can query later.
CREATE TABLE IF NOT EXISTS org_record_types (
  id TEXT PRIMARY KEY,
  org_tenant_id TEXT NOT NULL,
  credential_type TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  version INTEGER NOT NULL,
  fields TEXT NOT NULL,
  schema_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_by TEXT,
  created_at DATETIME NOT NULL,
  retired_at DATETIME,
  UNIQUE (org_tenant_id, credential_type, version)
);

CREATE INDEX IF NOT EXISTS idx_org_record_types_org ON org_record_types(org_tenant_id, status);

CREATE TABLE IF NOT EXISTS integration_record_requests (
  id TEXT PRIMARY KEY,
  org_tenant_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  credential_type TEXT NOT NULL,
  record_type_version INTEGER NOT NULL,
  recipient_tenant_id TEXT NOT NULL,
  offer_row_id TEXT,
  external_reference TEXT,
  status TEXT NOT NULL,
  error_message TEXT,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE (org_tenant_id, client_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_integration_record_requests_org ON integration_record_requests(org_tenant_id, created_at);
