-- Restores org-level actor routing defaults for stage approvals/actions.

CREATE TABLE IF NOT EXISTS org_workflow_actor_defaults (
  id TEXT PRIMARY KEY,
  org_tenant_id TEXT NOT NULL,
  workflow_type TEXT NOT NULL,
  stage_action TEXT NOT NULL,
  default_role TEXT,
  default_user_id TEXT,
  default_wallet_tenant_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(org_tenant_id, workflow_type, stage_action)
);

CREATE INDEX IF NOT EXISTS idx_org_actor_defaults_org
  ON org_workflow_actor_defaults(org_tenant_id);

CREATE INDEX IF NOT EXISTS idx_org_actor_defaults_lookup
  ON org_workflow_actor_defaults(org_tenant_id, workflow_type, stage_action, enabled);
