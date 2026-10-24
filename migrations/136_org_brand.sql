-- An organisation's brand: name, colour, contact and tax details, and the wording on its quotes,
-- invoices and receipts. Every save is a new version so a document issued last month still shows
-- the brand it was issued under.
CREATE TABLE IF NOT EXISTS org_brand_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_tenant_id TEXT NOT NULL,
  profile TEXT NOT NULL,
  logo_hash TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_org_brand_versions_org ON org_brand_versions (org_tenant_id, created_at);

-- Logo images, addressed by their content hash so an old version keeps its old logo.
CREATE TABLE IF NOT EXISTS org_brand_logos (
  hash TEXT PRIMARY KEY,
  org_tenant_id TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes BLOB NOT NULL,
  created_at TEXT NOT NULL
);
