-- Migration: 002_wallet_auth_tables.sql
-- Description: Add wallet user authentication and session tables
-- Date: 2025-11-16

-- Wallet Users: Store wallet user accounts
CREATE TABLE IF NOT EXISTS wallet_users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  wallet_id TEXT NOT NULL UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_wallet_users_username ON wallet_users(username);
CREATE INDEX idx_wallet_users_email ON wallet_users(email);
CREATE INDEX idx_wallet_users_wallet_id ON wallet_users(wallet_id);

-- Wallet Sessions: Store active user sessions
CREATE TABLE IF NOT EXISTS wallet_sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES wallet_users(id) ON DELETE CASCADE
);

CREATE INDEX idx_wallet_sessions_user_id ON wallet_sessions(user_id);
CREATE INDEX idx_wallet_sessions_expires_at ON wallet_sessions(expires_at);

-- Wallet Credentials: Store credentials in user wallets
CREATE TABLE IF NOT EXISTS wallet_credentials (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL,
  credential_id TEXT NOT NULL,
  credential_data TEXT NOT NULL, -- JSON stringified credential
  format TEXT NOT NULL,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (wallet_id) REFERENCES wallet_users(wallet_id) ON DELETE CASCADE
);

CREATE INDEX idx_wallet_credentials_wallet_id ON wallet_credentials(wallet_id);
CREATE INDEX idx_wallet_credentials_credential_id ON wallet_credentials(credential_id);

INSERT INTO schema_migrations (version, name) VALUES (2, '002_wallet_auth_tables');
