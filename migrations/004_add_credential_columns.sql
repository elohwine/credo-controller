-- Migration: 004_add_credential_columns.sql
-- Description: Add missing columns to wallet_credentials table
-- Date: 2025-12-20

-- Add issuer_did column
ALTER TABLE wallet_credentials ADD COLUMN issuer_did TEXT DEFAULT '';

-- Add type column  
ALTER TABLE wallet_credentials ADD COLUMN type TEXT DEFAULT 'VerifiableCredential';

-- Rename added_at to added_on for consistency
-- SQLite doesn't support RENAME COLUMN directly in older versions, so we handle both

INSERT INTO schema_migrations (version, name) VALUES (4, '004_add_credential_columns');

