-- An organisation's own books connection and its own fiscal device.
-- Tokens and device keys stay in these tables and are never returned by the API.

CREATE TABLE IF NOT EXISTS org_books_connections (
  org_tenant_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'zoho',
  external_org_id TEXT,
  external_org_name TEXT,
  accounts_url TEXT,
  api_domain TEXT,
  refresh_token TEXT,
  access_token TEXT,
  access_expires_at TEXT,
  status TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS org_books_oauth_states (
  state TEXT PRIMARY KEY,
  org_tenant_id TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS org_fiscal_profiles (
  org_tenant_id TEXT PRIMARY KEY,
  taxpayer_name TEXT,
  tin TEXT,
  vat_number TEXT,
  is_vat_payer INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS org_fiscal_devices (
  id TEXT PRIMARY KEY,
  org_tenant_id TEXT NOT NULL,
  label TEXT NOT NULL,
  device_id INTEGER NOT NULL,
  serial_no TEXT NOT NULL,
  activation_key TEXT,
  environment TEXT NOT NULL,
  model_name TEXT NOT NULL,
  model_version TEXT NOT NULL,
  private_key_pem TEXT,
  csr_pem TEXT,
  certificate_pem TEXT,
  qr_url TEXT,
  fiscal_day_status TEXT NOT NULL,
  fiscal_day_no INTEGER NOT NULL DEFAULT 0,
  fiscal_day_opened_at TEXT,
  receipt_counter INTEGER NOT NULL DEFAULT 0,
  receipt_global_no INTEGER NOT NULL DEFAULT 0,
  previous_receipt_hash TEXT,
  last_receipt_date TEXT,
  config_json TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(org_tenant_id, device_id)
);

CREATE TABLE IF NOT EXISTS org_fiscal_documents (
  id TEXT PRIMARY KEY,
  org_tenant_id TEXT NOT NULL,
  device_row_id TEXT,
  fiscal_day_no INTEGER,
  source TEXT NOT NULL,
  source_id TEXT NOT NULL,
  invoice_no TEXT NOT NULL,
  receipt_type TEXT NOT NULL,
  normalized_json TEXT NOT NULL,
  status TEXT NOT NULL,
  canonical_string TEXT,
  receipt_json TEXT,
  response_json TEXT,
  receipt_id INTEGER,
  qr_code TEXT,
  error TEXT,
  wallet_status TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(org_tenant_id, source, source_id)
);

CREATE TABLE IF NOT EXISTS org_fiscal_tax_mappings (
  org_tenant_id TEXT NOT NULL,
  source_key TEXT NOT NULL,
  tax_id INTEGER NOT NULL,
  tax_percent TEXT,
  tax_code TEXT,
  PRIMARY KEY (org_tenant_id, source_key)
);
