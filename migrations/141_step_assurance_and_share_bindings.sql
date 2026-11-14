-- Which steps need a fresh staff-card share, per organisation. Empty means the platform
-- defaults: purchase and payment approvals offer the card, job sign-off and payout require it.
ALTER TABLE org_proof_vc_policies ADD COLUMN step_assurance TEXT NOT NULL DEFAULT '{}';

-- What each staff-card share was started for. Finishing a share checks it against the
-- record being moved, so a share started for one request or amount cannot approve another.
CREATE TABLE IF NOT EXISTS stage_proof_bindings (
  session_id TEXT PRIMARY KEY,
  org_tenant_id TEXT,
  action_key TEXT NOT NULL,
  reference TEXT NOT NULL,
  amount TEXT,
  currency TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stage_proof_bindings_reference ON stage_proof_bindings(reference);
