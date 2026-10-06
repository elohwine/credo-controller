-- The short questions an owner answers about the organization (what it does, who
-- handles money, how it takes payment). Request types follow from these answers;
-- nobody picks or switches on a workflow.

CREATE TABLE IF NOT EXISTS org_setup_profiles (
  org_tenant_id TEXT PRIMARY KEY,
  kinds TEXT NOT NULL DEFAULT '[]',
  approval_preset_id TEXT,
  approval_title TEXT,
  payment_choice TEXT,
  answered_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
