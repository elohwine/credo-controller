-- Idempotency key store for workflow-stage write endpoints.

CREATE TABLE IF NOT EXISTS workflow_idempotency_keys (
  idempotency_key TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  action TEXT NOT NULL,
  response TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (idempotency_key, tenant_id, action)
);
