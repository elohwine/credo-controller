CREATE TABLE IF NOT EXISTS device_push_tokens (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  token TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (tenant_id, token)
);

CREATE INDEX IF NOT EXISTS idx_device_push_tokens_tenant
  ON device_push_tokens (tenant_id, updated_at DESC);
