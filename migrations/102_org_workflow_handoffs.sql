-- A running job can hand control to another procedure (quote for extra work, buying
-- materials) and take it back when that procedure finishes. An approved request can
-- start the next request. The organization only chooses how each hand-off starts:
-- by itself ('auto') or when someone on the job asks ('manual'), and after which
-- stages it becomes available. Everything else (what moves across, whether the job
-- waits) is defined by the built-in catalog in code.

CREATE TABLE IF NOT EXISTS org_workflow_handoffs (
  id TEXT PRIMARY KEY,
  org_tenant_id TEXT NOT NULL,
  handoff_key TEXT NOT NULL,
  start_mode TEXT NOT NULL DEFAULT 'manual',
  required_stages TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (org_tenant_id, handoff_key)
);

-- Durable record of every hand-off a job started: which child (run or request), who
-- asked, and how it ended. The parent run's state mirrors this for the UI.
CREATE TABLE IF NOT EXISTS workflow_handoff_links (
  id TEXT PRIMARY KEY,
  org_tenant_id TEXT NOT NULL,
  parent_run_id TEXT NOT NULL,
  handoff_key TEXT NOT NULL,
  child_kind TEXT NOT NULL,
  child_id TEXT NOT NULL,
  hold_parent INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'running',
  started_by TEXT,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME,
  result_json TEXT,
  UNIQUE (child_kind, child_id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_handoff_links_parent
  ON workflow_handoff_links(parent_run_id, status);

-- Request chains (requisition → purchase order → payment) get the same start choice.
ALTER TABLE request_handoffs ADD COLUMN start_mode TEXT NOT NULL DEFAULT 'auto';
