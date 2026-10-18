ALTER TABLE integration_outbox ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE integration_outbox ADD COLUMN available_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE integration_outbox ADD COLUMN lease_until INTEGER;
ALTER TABLE integration_outbox ADD COLUMN lease_token TEXT;
CREATE INDEX idx_outbox_available ON integration_outbox(status, available_at, lease_until);
UPDATE integration_outbox SET status = 'pending', available_at = 0 WHERE status = 'failed';

CREATE TABLE notification_preferences (
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  event_type TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  consent_at TEXT NOT NULL,
  consent_source TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, user_id, event_type)
);

CREATE TABLE notification_deliveries (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  recipient TEXT NOT NULL,
  sender_key TEXT,
  phone_number_id TEXT,
  provider_message_id TEXT UNIQUE,
  provider_status_at INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued',
  reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_notification_tenant ON notification_deliveries(tenant_id, created_at);
CREATE TABLE notification_callbacks (
  callback_key TEXT PRIMARY KEY,
  received_at TEXT NOT NULL
);
CREATE TABLE whatsapp_sender_bindings (
  phone_number_id TEXT PRIMARY KEY,
  sender_key TEXT NOT NULL,
  waba_id TEXT NOT NULL,
  validated_at TEXT NOT NULL
);
