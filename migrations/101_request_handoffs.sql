-- A request can start the next request (requisition → purchase order → payment, and so on).
-- parent_request_id links the chain. request_handoffs stores per-organization overrides
-- of the built-in handoff catalog (enabled = 0 disables a default; enabled = 1 adds one).

ALTER TABLE requests ADD COLUMN parent_request_id TEXT;

CREATE INDEX IF NOT EXISTS idx_platform_requests_parent
  ON requests(parent_request_id);

CREATE TABLE IF NOT EXISTS request_handoffs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  from_request_type TEXT NOT NULL,
  on_status TEXT NOT NULL,
  to_request_type TEXT NOT NULL,
  title TEXT,
  target_module TEXT,
  copy_items INTEGER NOT NULL DEFAULT 1,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, from_request_type, on_status, to_request_type)
);

CREATE INDEX IF NOT EXISTS idx_request_handoffs_org
  ON request_handoffs(organization_id, from_request_type, on_status);
