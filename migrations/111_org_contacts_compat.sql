-- Fresh test databases skip the original org_contacts migration. The actor
-- resolver reads names and phones from this table, so a database that applies
-- the listed migrations must have it, including the columns added later.

CREATE TABLE IF NOT EXISTS org_contacts (
  id TEXT PRIMARY KEY,
  org_tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  did TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  wallet_tenant_id TEXT,
  linked_at TEXT,
  link_token TEXT,
  link_token_expires_at TEXT,
  contact_scope TEXT NOT NULL DEFAULT 'external'
);

CREATE INDEX IF NOT EXISTS idx_org_contacts_org ON org_contacts(org_tenant_id);
CREATE INDEX IF NOT EXISTS idx_org_contacts_wallet_tenant ON org_contacts(wallet_tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_contacts_link_token ON org_contacts(link_token) WHERE link_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_org_contacts_scope ON org_contacts(org_tenant_id, contact_scope);
