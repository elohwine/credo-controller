-- Restores durable registration lifecycle and integration outbox used by
-- inbox-driven workflow notifications.

CREATE TABLE IF NOT EXISTS registration_lifecycle (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL,
  state TEXT NOT NULL,
  phone_hash TEXT,
  email_hash TEXT,
  payload_hash TEXT,
  mapped_user_id TEXT,
  mapped_tenant_id TEXT,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_registration_lifecycle_key ON registration_lifecycle(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_registration_lifecycle_state ON registration_lifecycle(state);

CREATE TABLE IF NOT EXISTS integration_outbox (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  aggregate_key TEXT,
  dedupe_key TEXT,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  dispatched_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_integration_outbox_status_created
  ON integration_outbox(status, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS ux_integration_outbox_dedupe
  ON integration_outbox(dedupe_key)
  WHERE dedupe_key IS NOT NULL;
