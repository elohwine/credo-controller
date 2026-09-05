-- SSI production boundary.
-- Persist references and decisions, not credential/presentation payloads.

CREATE TABLE IF NOT EXISTS trust_anchors (
  id TEXT PRIMARY KEY,
  organization_id TEXT,
  anchor_type TEXT NOT NULL,
  subject_ref TEXT NOT NULL,
  display_name_ref TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  policy_ref TEXT,
  valid_from DATETIME,
  valid_until DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_platform_trust_anchors_subject
  ON trust_anchors(subject_ref, status);

CREATE TABLE IF NOT EXISTS verifier_registrations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  verifier_ref TEXT NOT NULL,
  trust_anchor_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  metadata_ref TEXT,
  purpose_policy_ref TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (trust_anchor_id) REFERENCES trust_anchors(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_verifier_org_ref
  ON verifier_registrations(organization_id, verifier_ref);

CREATE TABLE IF NOT EXISTS presentation_requests (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  requester_person_id TEXT,
  verifier_ref TEXT NOT NULL,
  purpose_code TEXT NOT NULL,
  purpose_text_ref TEXT,
  query_language TEXT NOT NULL DEFAULT 'dcql',
  query_ref TEXT NOT NULL,
  transaction_ref TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (requester_person_id) REFERENCES people(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_platform_presentation_requests_subject
  ON presentation_requests(organization_id, requester_person_id, status);

CREATE TABLE IF NOT EXISTS presentation_consents (
  id TEXT PRIMARY KEY,
  presentation_request_id TEXT NOT NULL,
  holder_person_id TEXT,
  decision TEXT NOT NULL,
  requested_categories_json TEXT NOT NULL DEFAULT '[]',
  disclosed_categories_json TEXT NOT NULL DEFAULT '[]',
  privacy_notice_ref TEXT,
  consent_version TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (presentation_request_id) REFERENCES presentation_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (holder_person_id) REFERENCES people(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_platform_presentation_consent_request
  ON presentation_consents(presentation_request_id, created_at);

CREATE TABLE IF NOT EXISTS presentation_results (
  id TEXT PRIMARY KEY,
  presentation_request_id TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  issuer_refs_json TEXT NOT NULL DEFAULT '[]',
  credential_type_refs_json TEXT NOT NULL DEFAULT '[]',
  claim_categories_json TEXT NOT NULL DEFAULT '[]',
  holder_binding_verified INTEGER,
  trust_verified INTEGER,
  status_verified INTEGER,
  schema_verified INTEGER,
  audience_verified INTEGER,
  nonce_verified INTEGER,
  result_code TEXT,
  evidence_digest TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (presentation_request_id) REFERENCES presentation_requests(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_platform_presentation_results_request
  ON presentation_results(presentation_request_id, created_at);

CREATE TABLE IF NOT EXISTS authority_policies (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  policy_ref TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  effective_from DATETIME,
  effective_until DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_authority_policy_version
  ON authority_policies(organization_id, name, version);
