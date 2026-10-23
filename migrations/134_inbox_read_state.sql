-- Which inbox items a person has opened, and when they last looked at the inbox.
-- Kept on the server so an item read on the phone is not shown as new on the website.
-- One set per person (owner wallet) and per inbox ('personal' or an organisation tenant id).
CREATE TABLE IF NOT EXISTS inbox_read_marks (
  owner_tenant_id TEXT NOT NULL,
  inbox_scope TEXT NOT NULL,
  item_key TEXT NOT NULL,
  read_at TEXT NOT NULL,
  PRIMARY KEY (owner_tenant_id, inbox_scope, item_key)
);

CREATE INDEX IF NOT EXISTS idx_inbox_read_marks_read_at
  ON inbox_read_marks (owner_tenant_id, inbox_scope, read_at);

CREATE TABLE IF NOT EXISTS inbox_seen (
  owner_tenant_id TEXT NOT NULL,
  inbox_scope TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (owner_tenant_id, inbox_scope)
);
