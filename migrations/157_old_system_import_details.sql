-- What the office's old job system (MyMobileWorkers) kept that a plain import dropped: the old
-- status and failure reason of a job, branch, timeslot, instructions, check results and invoice
-- notes; a store's postcode and old-system id; a van's branch, mileage, tax date and last check;
-- a staff member's branch and old login name; and the tools and devices issued to staff.

-- A failed visit (access denied, needs a return visit) is history too. SQLite cannot widen a CHECK
-- in place, so the table is rebuilt.
CREATE TABLE job_history_new (
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
  outcome TEXT NOT NULL CHECK (outcome IN ('completed', 'cancelled', 'failed')),
  worker_name TEXT,
  amount REAL,
  currency TEXT,
  imported_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  details_json TEXT,
  UNIQUE (org_tenant_id, external_reference)
);
INSERT INTO job_history_new (
  id, org_tenant_id, external_reference, store_number, client_name, description, location, problem_type,
  po_number, scheduled_date, completed_date, outcome, worker_name, amount, currency, imported_by, created_at
)
  SELECT id, org_tenant_id, external_reference, store_number, client_name, description, location, problem_type,
         po_number, scheduled_date, completed_date, outcome, worker_name, amount, currency, imported_by, created_at
    FROM job_history;
DROP TABLE job_history;
ALTER TABLE job_history_new RENAME TO job_history;
CREATE INDEX IF NOT EXISTS idx_job_history_org ON job_history (org_tenant_id, store_number);

ALTER TABLE org_contacts ADD COLUMN postcode TEXT;
ALTER TABLE org_contacts ADD COLUMN external_id TEXT;

ALTER TABLE org_vans ADD COLUMN branch TEXT;
ALTER TABLE org_vans ADD COLUMN mileage INTEGER;
ALTER TABLE org_vans ADD COLUMN tax_due TEXT;
ALTER TABLE org_vans ADD COLUMN last_check_date TEXT;
ALTER TABLE org_vans ADD COLUMN last_check_outcome TEXT CHECK (last_check_outcome IS NULL OR last_check_outcome IN ('ok', 'defect'));

ALTER TABLE employees ADD COLUMN branch TEXT;
ALTER TABLE employees ADD COLUMN legacy_username TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_legacy_username
  ON employees(tenant_id, legacy_username) WHERE legacy_username IS NOT NULL AND legacy_username != '';

CREATE TABLE IF NOT EXISTS org_equipment (
  id TEXT PRIMARY KEY,
  org_tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  product_code TEXT,
  serial_number TEXT,
  value REAL CHECK (value IS NULL OR value >= 0),
  currency TEXT,
  holder_name TEXT,
  notes TEXT,
  -- Name, serial and notes together: two identical tablets issued to two people stay two rows.
  import_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (org_tenant_id, import_key)
);
CREATE INDEX IF NOT EXISTS idx_org_equipment_org ON org_equipment (org_tenant_id, category);
