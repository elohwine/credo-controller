-- Compatibility migration for the workflow runtime tables.
--
-- The migration registry in DatabaseManager skips several historical files
-- (013_create_providers, 014_create_workflow_runs, 036_create_org_memberships,
-- 061_organization_registry_and_service_catalog, reconciliation ledger) that
-- live databases received out-of-band. A fresh database therefore lacks the
-- tables the org-readiness gate, workflow engine and reconciliation depend on.
--
-- Every statement uses IF NOT EXISTS so this is a no-op on databases that
-- already have the tables (including the live dev database).

-- Workflow runtime (mirrors 014_create_workflow_runs.sql)
CREATE TABLE IF NOT EXISTS workflow_runs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  input TEXT,
  output TEXT,
  error TEXT,
  trigger_type TEXT,
  trigger_ref TEXT,
  current_step INTEGER DEFAULT 0,
  total_steps INTEGER DEFAULT 0,
  started_at DATETIME,
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workflow_steps (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  action_name TEXT NOT NULL,
  config TEXT,
  status TEXT DEFAULT 'pending',
  input_state TEXT,
  output_state TEXT,
  error TEXT,
  duration_ms INTEGER,
  started_at DATETIME,
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (run_id) REFERENCES workflow_runs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workflow_triggers (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  trigger_config TEXT,
  is_active INTEGER DEFAULT 1,
  last_triggered_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow ON workflow_runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_tenant ON workflow_runs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status);
CREATE INDEX IF NOT EXISTS idx_workflow_steps_run ON workflow_steps(run_id);
CREATE INDEX IF NOT EXISTS idx_workflow_triggers_workflow ON workflow_triggers(workflow_id);

-- Service providers (mirrors 013_create_providers.sql, schema only)
CREATE TABLE IF NOT EXISTS service_providers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  base_url TEXT,
  auth_type TEXT,
  config_schema TEXT,
  is_system INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS provider_configs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  name TEXT NOT NULL,
  config TEXT NOT NULL,
  environment TEXT DEFAULT 'sandbox',
  is_default INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (provider_id) REFERENCES service_providers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_providers_tenant ON service_providers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_providers_type ON service_providers(type);
CREATE INDEX IF NOT EXISTS idx_provider_configs_tenant ON provider_configs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_provider_configs_provider ON provider_configs(provider_id);

-- Org memberships (mirrors 036_create_org_memberships.sql)
CREATE TABLE IF NOT EXISTS org_memberships (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  org_tenant_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  invited_by TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, org_tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_org_memberships_user ON org_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_org_memberships_org ON org_memberships(org_tenant_id);
CREATE INDEX IF NOT EXISTS idx_org_memberships_status ON org_memberships(status);

-- Organization registry + service catalog (mirrors 061, tables used by the
-- payment_provider readiness prerequisite)
CREATE TABLE IF NOT EXISTS organization_registry (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  logo_url TEXT,
  category TEXT NOT NULL CHECK(category IN (
    'government', 'education', 'telecom', 'supplier', 'finance',
    'healthcare', 'insurance', 'employer', 'logistics', 'other'
  )),
  sub_category TEXT,
  is_public INTEGER NOT NULL DEFAULT 0,
  trust_score REAL DEFAULT 0 CHECK(trust_score >= 0 AND trust_score <= 5),
  verification_status TEXT DEFAULT 'unverified' CHECK(verification_status IN (
    'verified', 'unverified', 'pending', 'suspended'
  )),
  issuer_did TEXT NOT NULL,
  verifier_did TEXT,
  website TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  address TEXT,
  country TEXT DEFAULT 'ZW',
  metadata TEXT DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_org_registry_tenant ON organization_registry(tenant_id);
CREATE INDEX IF NOT EXISTS idx_org_registry_category ON organization_registry(category, sub_category);

CREATE TABLE IF NOT EXISTS service_catalog (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  service_type TEXT NOT NULL CHECK(service_type IN (
    'vc_issuance', 'verification', 'workflow', 'payment', 'other'
  )),
  vc_type TEXT,
  name TEXT NOT NULL,
  description TEXT,
  requirements TEXT DEFAULT '[]',
  turnaround_time TEXT,
  turnaround_hours INTEGER,
  fee_amount REAL DEFAULT 0,
  fee_currency TEXT DEFAULT 'USD',
  is_active INTEGER NOT NULL DEFAULT 1,
  request_schema TEXT DEFAULT '{}',
  sample_credential TEXT,
  metadata TEXT DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (org_id) REFERENCES organization_registry(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_service_catalog_org ON service_catalog(org_id, is_active);
CREATE INDEX IF NOT EXISTS idx_service_catalog_type ON service_catalog(service_type);

-- Reconciliation ledger (matches the live schema: no CHECK constraints so
-- FEPT / sector event names are accepted)
CREATE TABLE IF NOT EXISTS reconciliation_events (
  id TEXT PRIMARY KEY,
  provider_ref TEXT NOT NULL,
  event_type TEXT NOT NULL,
  source TEXT NOT NULL,
  amount REAL,
  currency TEXT,
  metadata TEXT,
  occurred_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recon_events_provider ON reconciliation_events(provider_ref);
CREATE INDEX IF NOT EXISTS idx_recon_events_type ON reconciliation_events(event_type);
CREATE INDEX IF NOT EXISTS idx_recon_events_occurred ON reconciliation_events(occurred_at);

CREATE TABLE IF NOT EXISTS reconciliation_status (
  provider_ref TEXT PRIMARY KEY,
  tenant_id TEXT,
  status TEXT NOT NULL DEFAULT 'INITIATED',
  payment_amount REAL,
  settlement_amount REAL,
  mismatch_reason TEXT,
  event_count INTEGER DEFAULT 0,
  first_event_at DATETIME,
  last_event_at DATETIME,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recon_status_tenant ON reconciliation_status(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recon_status_status ON reconciliation_status(status);
