CREATE TABLE login_second_factor_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  otp_hash TEXT,
  otp_salt TEXT,
  otp_expires_at TEXT,
  otp_sent_at TEXT,
  otp_attempts INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_login_second_factor_expires
  ON login_second_factor_challenges(expires_at);

ALTER TABLE wallet_login_sessions ADD COLUMN expected_tenant_id TEXT;
ALTER TABLE wallet_login_sessions ADD COLUMN second_factor_challenge_id TEXT;
