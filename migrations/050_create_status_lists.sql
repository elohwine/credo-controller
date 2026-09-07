-- Step 13: W3C Bitstring Status List producer schema.
-- Issuer-owned status lists; allocations track one index per issued credential.
-- The platform builds and signs the BitstringStatusListCredential; holders and
-- verifiers dereference it via the GET /status-lists/:id endpoint.

CREATE TABLE IF NOT EXISTS credential_status_lists (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  issuer_ref TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('revocation', 'suspension')),
  list_size INTEGER NOT NULL DEFAULT 131072,
  allocated_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sealed')),
  signed_vc_json TEXT,                         -- serialized BitstringStatusListCredential
  published_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_status_lists_issuer_purpose
  ON credential_status_lists(organization_id, issuer_ref, purpose, status);

-- One allocation row per issued credential; tracks current status of that index.
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

INSERT OR IGNORE INTO schema_migrations (version, applied_at)
VALUES (50, CURRENT_TIMESTAMP);
