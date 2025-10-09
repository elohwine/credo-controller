-- Migration: 001_create_stores.sql
-- Description: Create persistent storage for in-memory stores (DIDs, credentials, offers, schemas, definitions)
-- Date: 2025-10-08

-- DID Store: Caches DID metadata for fast lookup
CREATE TABLE IF NOT EXISTS dids (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  did TEXT NOT NULL UNIQUE,
  public_key_base58 TEXT NOT NULL,
  key_type TEXT NOT NULL,
  key_ref TEXT NOT NULL,
  method TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_dids_tenant_id ON dids(tenant_id);
CREATE INDEX idx_dids_did ON dids(did);
CREATE INDEX idx_dids_tenant_did ON dids(tenant_id, did);

-- Credential Offers: Pre-authorized code flow offers
CREATE TABLE IF NOT EXISTS credential_offers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  pre_authorized_code TEXT NOT NULL UNIQUE,
  credential_definition_id TEXT NOT NULL,
  attributes TEXT NOT NULL, -- JSON stringified
  user_pin_required INTEGER DEFAULT 0, -- boolean as int
  tx_code TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  redeemed_at DATETIME
);

CREATE INDEX idx_offers_tenant_id ON credential_offers(tenant_id);
CREATE INDEX idx_offers_code ON credential_offers(pre_authorized_code);
CREATE INDEX idx_offers_redeemed ON credential_offers(redeemed_at);

-- Issued Credentials: Track issued verifiable credentials
CREATE TABLE IF NOT EXISTS issued_credentials (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  credential_id TEXT NOT NULL UNIQUE,
  holder_did TEXT,
  credential_definition_id TEXT NOT NULL,
  schema_id TEXT,
  credential_data TEXT NOT NULL, -- JSON stringified signed credential
  format TEXT NOT NULL, -- 'jwt_vc', 'sd-jwt', 'ldp_vc', 'anoncreds'
  revoked INTEGER DEFAULT 0, -- boolean as int
  revocation_reason TEXT,
  issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME
);

CREATE INDEX idx_issued_tenant_id ON issued_credentials(tenant_id);
CREATE INDEX idx_issued_credential_id ON issued_credentials(credential_id);
CREATE INDEX idx_issued_holder_did ON issued_credentials(holder_did);
CREATE INDEX idx_issued_revoked ON issued_credentials(revoked);

-- JSON Schemas: Schema definitions for credentials
CREATE TABLE IF NOT EXISTS json_schemas (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  schema_id TEXT NOT NULL,
  schema_data TEXT NOT NULL, -- JSON stringified schema
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_schemas_tenant_id ON json_schemas(tenant_id);
CREATE INDEX idx_schemas_schema_id ON json_schemas(schema_id);
CREATE UNIQUE INDEX idx_schemas_tenant_schema ON json_schemas(tenant_id, schema_id);

-- Credential Definitions: Templates for credential issuance
CREATE TABLE IF NOT EXISTS credential_definitions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  credential_definition_id TEXT NOT NULL,
  schema_id TEXT NOT NULL,
  definition_data TEXT NOT NULL, -- JSON stringified definition
  issuer_did TEXT NOT NULL,
  tag TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_creddef_tenant_id ON credential_definitions(tenant_id);
CREATE INDEX idx_creddef_definition_id ON credential_definitions(credential_definition_id);
CREATE INDEX idx_creddef_schema_id ON credential_definitions(schema_id);
CREATE UNIQUE INDEX idx_creddef_tenant_definition ON credential_definitions(tenant_id, credential_definition_id);

-- Metadata table for tracking migration version
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO schema_migrations (version, name) VALUES (1, '001_create_stores');
