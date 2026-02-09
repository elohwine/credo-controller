-- Migration: 018_add_phone_to_tenants.sql
-- Description: Add phone number field to tenants table for phone-first wallet linking
-- Date: 2026-02-05
--
-- This enables the Fastlane MVP flow:
-- 1. Browser session creates anonymous tenant (no phone)
-- 2. At checkout, phone number is captured and linked to tenant
-- 3. On registration, user can claim existing tenant by phone (OTP verification)
-- 4. VCs issued before registration are preserved

-- Ensure base tables exist (some environments use a separate tenant DB)
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  issuer_did TEXT NOT NULL,
  issuer_kid TEXT NOT NULL,
  verifier_did TEXT NOT NULL,
  verifier_kid TEXT NOT NULL,
  askar_profile TEXT NOT NULL,
  metadata TEXT NOT NULL,
  tenant_type TEXT DEFAULT 'USER',
  domain TEXT
);

CREATE TABLE IF NOT EXISTS wallet_users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  username TEXT,
  email TEXT,
  password_hash TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Add phone column to tenants table
ALTER TABLE tenants ADD COLUMN phone TEXT;

-- Add phone column to wallet_users table
ALTER TABLE wallet_users ADD COLUMN phone TEXT;

-- Create index for phone lookup
CREATE INDEX IF NOT EXISTS idx_tenants_phone ON tenants(phone);
CREATE INDEX IF NOT EXISTS idx_wallet_users_phone ON wallet_users(phone);

-- Create browser_session_tenants table for tracking anonymous sessions
CREATE TABLE IF NOT EXISTS browser_session_tenants (
  session_id TEXT PRIMARY KEY,           -- Browser fingerprint or session ID
  tenant_id TEXT NOT NULL,               -- The anonymous tenant created for this session
  phone TEXT,                            -- Phone number when captured at checkout
  claimed BOOLEAN DEFAULT 0,             -- Whether this tenant has been claimed by a registered user
  claimed_by_user_id TEXT,               -- User ID who claimed this tenant
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_browser_session_tenants_tenant_id ON browser_session_tenants(tenant_id);
CREATE INDEX IF NOT EXISTS idx_browser_session_tenants_phone ON browser_session_tenants(phone);

INSERT INTO schema_migrations (version, name) VALUES (18, '018_add_phone_to_tenants');
