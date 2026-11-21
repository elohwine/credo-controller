-- The mail thread kept on a job, daily van checks with photos, rate cards, job sheets per
-- problem type, and links a client opens to follow a job without an account.

ALTER TABLE job_intakes ADD COLUMN source_conversation_id TEXT;
CREATE INDEX IF NOT EXISTS idx_job_intakes_conversation ON job_intakes (tenant_id, source_conversation_id);

CREATE TABLE IF NOT EXISTS job_mail_messages (
  id TEXT PRIMARY KEY,
  org_tenant_id TEXT NOT NULL,
  intake_id TEXT NOT NULL REFERENCES job_intakes(id) ON DELETE CASCADE,
  conversation_id TEXT,
  internet_message_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  sender TEXT,
  subject TEXT,
  body_text TEXT,
  received_at TEXT NOT NULL,
  web_link TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (org_tenant_id, internet_message_id)
);
CREATE INDEX IF NOT EXISTS idx_job_mail_messages_intake ON job_mail_messages (org_tenant_id, intake_id, received_at);

-- A daily check joins service, MOT and accident; SQLite cannot widen a CHECK in place.
CREATE TABLE org_van_events_new (
  id TEXT PRIMARY KEY,
  org_tenant_id TEXT NOT NULL,
  van_id TEXT NOT NULL REFERENCES org_vans(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('allocated', 'service', 'mot', 'accident', 'daily_check')),
  user_id TEXT,
  event_date TEXT NOT NULL,
  notes TEXT,
  outcome TEXT CHECK (outcome IS NULL OR outcome IN ('ok', 'defect')),
  checklist_json TEXT,
  mileage INTEGER,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO org_van_events_new (id, org_tenant_id, van_id, kind, user_id, event_date, notes, created_by, created_at)
  SELECT id, org_tenant_id, van_id, kind, user_id, event_date, notes, created_by, created_at FROM org_van_events;
DROP TABLE org_van_events;
ALTER TABLE org_van_events_new RENAME TO org_van_events;
CREATE INDEX IF NOT EXISTS idx_org_van_events_van ON org_van_events (org_tenant_id, van_id, event_date);
CREATE INDEX IF NOT EXISTS idx_org_van_events_user ON org_van_events (org_tenant_id, user_id, event_date);

CREATE TABLE IF NOT EXISTS org_van_event_photos (
  id TEXT PRIMARY KEY,
  org_tenant_id TEXT NOT NULL,
  event_id TEXT NOT NULL REFERENCES org_van_events(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  media_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  content BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_org_van_event_photos_event ON org_van_event_photos (org_tenant_id, event_id);

CREATE TABLE IF NOT EXISTS org_rate_cards (
  id TEXT PRIMARY KEY,
  org_tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'each',
  unit_price REAL NOT NULL CHECK (unit_price >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  problem_type TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (org_tenant_id, name)
);

CREATE TABLE IF NOT EXISTS org_job_sheets (
  id TEXT PRIMARY KEY,
  org_tenant_id TEXT NOT NULL,
  problem_type TEXT NOT NULL,
  items_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (org_tenant_id, problem_type)
);

CREATE TABLE IF NOT EXISTS job_status_links (
  token_hash TEXT PRIMARY KEY,
  org_tenant_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_job_status_links_run ON job_status_links (org_tenant_id, run_id);
