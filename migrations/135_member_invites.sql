-- A one-time link that lets an invited person confirm their name and choose their own PIN.
-- Only a hash of the code is kept. Each send replaces the code, so only the latest link works.
CREATE TABLE IF NOT EXISTS member_invites (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  org_tenant_id TEXT NOT NULL,
  invited_by TEXT NOT NULL,
  proposed_name TEXT,
  code_hash TEXT,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  fallback_sent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_member_invites_code ON member_invites (code_hash) WHERE code_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_member_invites_user ON member_invites (user_id, used_at);
