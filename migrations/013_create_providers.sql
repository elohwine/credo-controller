-- ============================================================================
-- IdenEx Credentis - Service Provider Registry
-- Verifiable Trust Infrastructure for Africa's Digital Economy
-- 
-- Schema for external service provider integrations.
-- Supports payment (EcoCash, InnBucks), identity, notification providers.
-- Copyright 2024-2026 IdenEx Credentis
-- ============================================================================

-- Service Providers: external services orgs can integrate with workflows
CREATE TABLE IF NOT EXISTS service_providers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,  -- 'payment', 'identity', 'verification', 'notification', 'custom'
  description TEXT,
  base_url TEXT,
  auth_type TEXT,      -- 'api_key', 'oauth2', 'basic', 'none'
  config_schema TEXT,  -- JSON Schema for provider-specific config
  is_system INTEGER DEFAULT 0,  -- system providers available to all tenants
  status TEXT DEFAULT 'active',  -- 'active', 'inactive', 'deprecated'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Provider Configs: tenant-specific configurations for providers
CREATE TABLE IF NOT EXISTS provider_configs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  name TEXT NOT NULL,
  config TEXT NOT NULL,       -- Encrypted JSON config (API keys, endpoints, etc.)
  environment TEXT DEFAULT 'sandbox',  -- 'sandbox', 'production'
  is_default INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (provider_id) REFERENCES service_providers(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_providers_tenant ON service_providers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_providers_type ON service_providers(type);
CREATE INDEX IF NOT EXISTS idx_provider_configs_tenant ON provider_configs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_provider_configs_provider ON provider_configs(provider_id);

-- Seed system providers
INSERT OR IGNORE INTO service_providers (id, tenant_id, name, type, description, base_url, auth_type, config_schema, is_system)
VALUES 
  ('ecocash-zw', 'system', 'EcoCash Zimbabwe', 'payment', 'Mobile money payments via EcoCash', 'https://developers.ecocash.co.zw/api', 'api_key', '{"type":"object","properties":{"apiKey":{"type":"string"},"sandboxMode":{"type":"boolean"},"callbackUrl":{"type":"string"}}}', 1),
  ('innbucks-zw', 'system', 'InnBucks Zimbabwe', 'payment', 'InnBucks mobile money', 'https://api.innbucks.co.zw', 'api_key', '{"type":"object","properties":{"merchantId":{"type":"string"},"apiKey":{"type":"string"}}}', 1),
  ('smtp-email', 'system', 'SMTP Email', 'notification', 'Email notifications via SMTP', NULL, 'basic', '{"type":"object","properties":{"host":{"type":"string"},"port":{"type":"number"},"user":{"type":"string"},"password":{"type":"string"}}}', 1),
  ('sms-gateway', 'system', 'SMS Gateway', 'notification', 'SMS notifications', NULL, 'api_key', '{"type":"object","properties":{"provider":{"type":"string"},"apiKey":{"type":"string"},"senderId":{"type":"string"}}}', 1),
  ('zimra-tax', 'system', 'ZIMRA', 'verification', 'Zimbabwe Revenue Authority verification', 'https://api.zimra.co.zw', 'oauth2', '{"type":"object","properties":{"clientId":{"type":"string"},"clientSecret":{"type":"string"}}}', 1);
