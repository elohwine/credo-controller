-- Which welcome screens, getting-started guides and section tips each person has finished.
-- Kept per account (the personal wallet), so guides do not come back after a reinstall or on a new phone.
CREATE TABLE IF NOT EXISTS wallet_guide_progress (
  owner_tenant_id TEXT NOT NULL,
  guide_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('done', 'dismissed')),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner_tenant_id, guide_key)
);

-- Holder choices that apply to the whole account. auto_save_cards = 1 saves new cards
-- (identity, staff and role cards, and payment receipts) without a tap. Tasks, bills,
-- payment requests, workflow records and proof requests always wait for the person.
CREATE TABLE IF NOT EXISTS wallet_holder_settings (
  owner_tenant_id TEXT PRIMARY KEY,
  auto_save_cards INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
