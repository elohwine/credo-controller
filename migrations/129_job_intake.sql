CREATE TABLE IF NOT EXISTS job_intakes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'assigning', 'assigned')),
  payload_json TEXT NOT NULL,
  assigned_to TEXT,
  workflow_run_id TEXT,
  assignment_attempt INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT,
  source_message_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tenant_id, idempotency_key),
  UNIQUE (tenant_id, source_message_id)
);

CREATE INDEX IF NOT EXISTS idx_job_intakes_tenant_status_created
  ON job_intakes (tenant_id, status, created_at);

CREATE TABLE IF NOT EXISTS job_intake_attachments (
  id TEXT PRIMARY KEY,
  intake_id TEXT NOT NULL REFERENCES job_intakes(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  media_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  content BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_job_intake_attachments_owner
  ON job_intake_attachments (tenant_id, intake_id);
