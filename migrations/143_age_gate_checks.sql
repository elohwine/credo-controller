CREATE TABLE IF NOT EXISTS age_gate_checks (
  request_id TEXT PRIMARY KEY,
  poll_token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
