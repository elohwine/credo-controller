-- Cross-device wallet sign-in (OpenID4VP). The browser that started the sign-in holds
-- the poll token; only its hash is stored, and a session can issue a token once.
CREATE TABLE IF NOT EXISTS wallet_login_sessions (
  login_id TEXT PRIMARY KEY,
  poll_token_hash TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_wallet_login_sessions_expires ON wallet_login_sessions(expires_at);
