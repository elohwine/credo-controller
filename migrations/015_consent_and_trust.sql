-- ============================================================================
-- IdenEx Credentis - Consent & Trust Scoring
-- Verifiable Trust Infrastructure for Africa's Digital Economy
-- 
-- Schema for privacy-compliant consent tracking and merchant/agent
-- reputation scoring. Enables credit eligibility and trust decisions.
-- Copyright 2024-2026 IdenEx Credentis
-- ============================================================================

-- Consent records for GDPR/privacy compliance
CREATE TABLE IF NOT EXISTS consent_records (
  id TEXT PRIMARY KEY,
  subject_did TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  purposes TEXT NOT NULL,           -- JSON array of purposes
  retention_period TEXT NOT NULL,   -- e.g., '7y', '30d'
  retention_end_date TEXT NOT NULL, -- ISO date
  workflow_id TEXT,
  run_id TEXT,
  status TEXT DEFAULT 'active',     -- 'active', 'revoked', 'expired'
  revoked_at DATETIME,
  revoked_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_consent_subject ON consent_records(subject_did);
CREATE INDEX IF NOT EXISTS idx_consent_tenant ON consent_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_consent_status ON consent_records(status);

-- Trust events for reputation/scoring
CREATE TABLE IF NOT EXISTS trust_events (
  id TEXT PRIMARY KEY,
  subject_did TEXT NOT NULL,
  event TEXT NOT NULL,
  weight INTEGER NOT NULL,
  workflow_id TEXT,
  run_id TEXT,
  tenant_id TEXT NOT NULL,
  metadata TEXT,                    -- JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_trust_subject ON trust_events(subject_did);
CREATE INDEX IF NOT EXISTS idx_trust_tenant ON trust_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_trust_event ON trust_events(event);

-- Trust score snapshots (cached scores)
CREATE TABLE IF NOT EXISTS trust_scores (
  subject_did TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  score INTEGER NOT NULL,
  level TEXT NOT NULL,              -- 'new', 'bronze', 'silver', 'gold', 'platinum'
  event_count INTEGER DEFAULT 0,
  positive_events INTEGER DEFAULT 0,
  negative_events INTEGER DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_trust_scores_tenant ON trust_scores(tenant_id);
CREATE INDEX IF NOT EXISTS idx_trust_scores_level ON trust_scores(level);
