-- Migration 051: Trust Policy Evolution
-- Add versioned policy definitions and external authorization adapter support
-- for AuthZEN-compatible policies.

-- Extend authority_policies table to include versioned rule sets
ALTER TABLE authority_policies ADD COLUMN IF NOT EXISTS policy_rules_json TEXT;

-- Track which external authorization adapter is configured per organization
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS authz_adapter_type TEXT DEFAULT 'in-process';

-- External AuthZEN endpoint for delegated authorization
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS external_authz_endpoint TEXT;

-- Authentication token/key for external authz endpoint
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS external_authz_token_ref TEXT;

-- Create policy versions table to track deployment history
CREATE TABLE IF NOT EXISTS policy_versions (
  id TEXT PRIMARY KEY,
  authority_policy_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  policy_rules_json TEXT,
  deployment_status TEXT NOT NULL DEFAULT 'draft', -- draft, staged, active, archived
  deployed_at DATETIME,
  rolled_back_at DATETIME,
  deployed_by_person_id TEXT,
  rollback_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (authority_policy_id) REFERENCES authority_policies(id) ON DELETE CASCADE,
  UNIQUE(authority_policy_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_policy_versions_by_policy
  ON policy_versions(authority_policy_id, deployment_status);

CREATE INDEX IF NOT EXISTS idx_policy_versions_by_deployment
  ON policy_versions(deployment_status, deployed_at DESC);

-- Track policy decisions at version granularity
CREATE TABLE IF NOT EXISTS policy_decision_audit (
  id TEXT PRIMARY KEY,
  policy_decision_id TEXT,
  authority_policy_id TEXT,
  policy_version_number INTEGER,
  authority_ref TEXT NOT NULL,
  subject_ref TEXT,
  organization_id TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  decision TEXT NOT NULL, -- allowed, denied, error
  reason TEXT,
  adapter_type TEXT, -- in-process, external_authzen
  external_authz_latency_ms INTEGER,
  used_cached_decision BOOLEAN DEFAULT FALSE,
  decided_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (authority_policy_id) REFERENCES authority_policies(id) ON DELETE SET NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_policy_decision_audit_by_decision
  ON policy_decision_audit(organization_id, decided_at DESC);

CREATE INDEX IF NOT EXISTS idx_policy_decision_audit_by_policy
  ON policy_decision_audit(authority_policy_id, deployment_status);

-- Cache for external authz responses to reduce latency
CREATE TABLE IF NOT EXISTS external_authz_cache (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  subject_ref TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  decision TEXT NOT NULL,
  reason TEXT,
  cached_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  UNIQUE(organization_id, subject_ref, action, resource_type)
);

CREATE INDEX IF NOT EXISTS idx_external_authz_cache_by_org
  ON external_authz_cache(organization_id, expires_at DESC);

INSERT INTO schema_migrations (version, name)
VALUES (51, 'trust_policy_evolution');
