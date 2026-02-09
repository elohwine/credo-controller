-- Migration: 019_ssi_auth_tables.sql
-- Description: SSI-based authentication tables - NO PII stored!
-- Date: 2026-02-05
--
-- Key Principles:
-- 1. NO plaintext PII (phone, email, name) in database
-- 2. Only SHA-256 hashes for lookup
-- 3. PII lives in user's wallet as PlatformIdentityVC
-- 4. Temp phone links are encrypted and auto-expire

-- SSI Users: Identity hashes only, NO PII
CREATE TABLE IF NOT EXISTS ssi_users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL UNIQUE,           -- Links to Credo tenant
  did TEXT NOT NULL,                         -- User's DID
  phone_hash TEXT,                           -- SHA-256(phone) for lookup
  email_hash TEXT,                           -- SHA-256(email) for lookup
  pin_hash TEXT,                             -- Optional PIN for Web2 fallback login
  vc_hash TEXT,                              -- Hash of issued PlatformIdentityVC (for revocation)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_ssi_users_phone_hash ON ssi_users(phone_hash);
CREATE INDEX IF NOT EXISTS idx_ssi_users_email_hash ON ssi_users(email_hash);
CREATE INDEX IF NOT EXISTS idx_ssi_users_tenant_id ON ssi_users(tenant_id);

-- Login Challenges for VC-based authentication
CREATE TABLE IF NOT EXISTS ssi_login_challenges (
  nonce TEXT PRIMARY KEY,
  tenant_id TEXT,                            -- Optional: pre-linked tenant
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ssi_challenges_expires ON ssi_login_challenges(expires_at);

-- Temporary Phone Links for Fastlane flow (encrypted, auto-expire)
-- Used to link anonymous checkout to registration
CREATE TABLE IF NOT EXISTS temp_phone_links (
  tenant_id TEXT PRIMARY KEY,
  encrypted_phone TEXT NOT NULL,             -- AES-256 encrypted phone
  expires_at DATETIME NOT NULL,              -- Auto-expires after 24h
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_temp_phone_expires ON temp_phone_links(expires_at);

INSERT INTO schema_migrations (version, name) VALUES (19, '019_ssi_auth_tables');
