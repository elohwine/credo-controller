-- Organization Memberships: links personal user accounts to org tenants
-- Pattern: GitHub/Clerk/Slack style — one user, many orgs
-- A user authenticates as themselves (personal tenant), then switches org context.

CREATE TABLE IF NOT EXISTS org_memberships (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,               -- FK → ssi_users.id (the person)
  org_tenant_id TEXT NOT NULL,         -- FK → tenants.id (the ORG tenant)
  role TEXT NOT NULL DEFAULT 'member', -- 'owner' | 'admin' | 'member'
  invited_by TEXT,                     -- user_id of whoever invited this member (NULL for creator)
  status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'invited' | 'suspended'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, org_tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_org_memberships_user ON org_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_org_memberships_org ON org_memberships(org_tenant_id);
CREATE INDEX IF NOT EXISTS idx_org_memberships_status ON org_memberships(status);
