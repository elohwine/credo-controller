-- Finished jobs brought in from a file the organisation's old system exported (for example
-- MyMobileWorkers). They are history only: they never start a workflow, send a bill or pay anyone.
-- The Jobs list and its reports read them next to live jobs; the same reference never lands twice.

CREATE TABLE IF NOT EXISTS job_history (
  id TEXT PRIMARY KEY,
  org_tenant_id TEXT NOT NULL,
  external_reference TEXT NOT NULL,
  store_number TEXT,
  client_name TEXT,
  description TEXT NOT NULL,
  location TEXT,
  problem_type TEXT,
  po_number TEXT,
  scheduled_date TEXT,
  completed_date TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('completed', 'cancelled')),
  worker_name TEXT,
  amount REAL,
  currency TEXT,
  imported_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (org_tenant_id, external_reference)
);
CREATE INDEX IF NOT EXISTS idx_job_history_org ON job_history (org_tenant_id, store_number);
