-- Org Contacts Directory: per-org address book for VC delivery
-- SSI-first: contacts are identified by DID when known.
-- If DID is absent, the org can still send an OID4VC offer via phone/email/link.

CREATE TABLE IF NOT EXISTS org_contacts (
  id          TEXT PRIMARY KEY,
  org_tenant_id TEXT NOT NULL,         -- FK → tenants.id (the issuing org)
  name        TEXT NOT NULL,           -- display name
  phone       TEXT,                    -- E.164, optional
  email       TEXT,                    -- optional
  did         TEXT,                    -- SSI DID (self-sovereign, provided by holder or resolved from wallet)
  notes       TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_org_contacts_org ON org_contacts(org_tenant_id);
