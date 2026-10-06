-- Per-organization stage-actor fallback policy.
--
-- Stage defaults (org_workflow_actor_defaults) say WHO acts at a specific stage.
-- This table says what happens when no stage default matches: an ordered chain of
-- users / roles / wallets chosen by the organization, whether the platform's built-in
-- role order applies, and whether the owner/admin may be used as the last resort.

CREATE TABLE IF NOT EXISTS org_workflow_actor_policies (
  org_tenant_id TEXT PRIMARY KEY,
  policy_json TEXT NOT NULL DEFAULT '{}',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
