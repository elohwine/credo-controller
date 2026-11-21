-- Store numbers on client contacts, the van register, and mailbox intake.
-- Staff number and skills live on the payroll employee (migration 153), not in a table of their own.

ALTER TABLE org_contacts ADD COLUMN store_number TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_org_contacts_store_number
  ON org_contacts (org_tenant_id, store_number) WHERE store_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS org_vans (
  id TEXT PRIMARY KEY,
  org_tenant_id TEXT NOT NULL,
  registration TEXT NOT NULL,
  description TEXT,
  service_day TEXT,
  mot_due TEXT,
  driver_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'off_road', 'retired')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (org_tenant_id, registration)
);

CREATE TABLE IF NOT EXISTS org_van_events (
  id TEXT PRIMARY KEY,
  org_tenant_id TEXT NOT NULL,
  van_id TEXT NOT NULL REFERENCES org_vans(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('allocated', 'service', 'mot', 'accident')),
  user_id TEXT,
  event_date TEXT NOT NULL,
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_org_van_events_van ON org_van_events (org_tenant_id, van_id, event_date);
CREATE INDEX IF NOT EXISTS idx_org_van_events_user ON org_van_events (org_tenant_id, user_id, event_date);

ALTER TABLE job_intakes ADD COLUMN dedupe_key TEXT;
ALTER TABLE job_intakes ADD COLUMN duplicate_of TEXT;

CREATE INDEX IF NOT EXISTS idx_job_intakes_dedupe ON job_intakes (tenant_id, dedupe_key);

CREATE TABLE IF NOT EXISTS mail_intake_state (
  org_tenant_id TEXT NOT NULL,
  mailbox TEXT NOT NULL,
  delta_link TEXT,
  last_polled_at TEXT,
  last_error TEXT,
  imported_count INTEGER NOT NULL DEFAULT 0,
  repeat_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (org_tenant_id, mailbox)
);
