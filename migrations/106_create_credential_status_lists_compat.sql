-- W3C Bitstring Status List producer schema (compat).
-- 050_create_status_lists.sql was never registered in DatabaseManager, so databases that
-- grew through the compat migrations have no credential_status_lists table and every status
-- entry allocation failed. Same shape as 050, idempotent, without the FK to organizations so
-- the platform issuer ('default') can own a list too.

CREATE TABLE IF NOT EXISTS credential_status_lists (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  issuer_ref TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('revocation', 'suspension')),
  list_size INTEGER NOT NULL DEFAULT 131072,
  allocated_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sealed')),
  signed_vc_json TEXT,
  published_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_status_lists_issuer_purpose
  ON credential_status_lists(organization_id, issuer_ref, purpose, status);

CREATE TABLE IF NOT EXISTS credential_status_allocations (
  id TEXT PRIMARY KEY,
  status_list_id TEXT NOT NULL,
  status_index INTEGER NOT NULL,
  organization_id TEXT NOT NULL,
  issuer_ref TEXT NOT NULL,
  purpose TEXT NOT NULL,
  issued_credential_ref TEXT,
  current_status TEXT NOT NULL DEFAULT 'valid'
    CHECK (current_status IN ('valid', 'revoked', 'suspended')),
  allocated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  status_updated_at DATETIME,
  UNIQUE (status_list_id, status_index),
  FOREIGN KEY (status_list_id) REFERENCES credential_status_lists(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_status_alloc_list_index
  ON credential_status_allocations(status_list_id, status_index);
CREATE INDEX IF NOT EXISTS idx_status_alloc_credential_ref
  ON credential_status_allocations(issued_credential_ref)
  WHERE issued_credential_ref IS NOT NULL;
