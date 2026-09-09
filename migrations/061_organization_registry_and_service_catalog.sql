-- Organization Registry: Public service discovery and VC catalog
-- Enables holder-initiated VC requests from discoverable organizations

CREATE TABLE IF NOT EXISTS organization_registry (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  logo_url TEXT,
  category TEXT NOT NULL CHECK(category IN (
    'government', 'education', 'telecom', 'supplier', 'finance',
    'healthcare', 'insurance', 'employer', 'logistics', 'other'
  )),
  sub_category TEXT,
  is_public INTEGER NOT NULL DEFAULT 0, -- 1 = listed in public discovery
  trust_score REAL DEFAULT 0 CHECK(trust_score >= 0 AND trust_score <= 5),
  verification_status TEXT DEFAULT 'unverified' CHECK(verification_status IN (
    'verified', 'unverified', 'pending', 'suspended'
  )),
  issuer_did TEXT NOT NULL,
  verifier_did TEXT,
  website TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  address TEXT,
  country TEXT DEFAULT 'ZW',
  metadata TEXT DEFAULT '{}', -- JSON: opening hours, certifications, languages
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_org_registry_tenant ON organization_registry(tenant_id);
CREATE INDEX IF NOT EXISTS idx_org_registry_public ON organization_registry(is_public, category) WHERE is_public = 1;
CREATE INDEX IF NOT EXISTS idx_org_registry_category ON organization_registry(category, sub_category);
CREATE INDEX IF NOT EXISTS idx_org_registry_trust ON organization_registry(trust_score DESC, verification_status);
CREATE INDEX IF NOT EXISTS idx_org_registry_country ON organization_registry(country);

-- Service Catalog: Advertised services/VCs per organization
CREATE TABLE IF NOT EXISTS service_catalog (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  service_type TEXT NOT NULL CHECK(service_type IN (
    'vc_issuance', 'verification', 'workflow', 'payment', 'other'
  )),
  vc_type TEXT, -- For vc_issuance: 'NationalIDVC', 'PhoneNumberVC', etc.
  name TEXT NOT NULL,
  description TEXT,
  requirements TEXT DEFAULT '[]', -- JSON array: what holder must provide
  turnaround_time TEXT, -- Human-readable: '24 hours', 'instant', '3-5 days'
  turnaround_hours INTEGER, -- Machine-readable: 24, 0, 96
  fee_amount REAL DEFAULT 0,
  fee_currency TEXT DEFAULT 'USD',
  is_active INTEGER NOT NULL DEFAULT 1,
  request_schema TEXT DEFAULT '{}', -- JSON schema for request form
  sample_credential TEXT, -- JSON: example of issued VC
  metadata TEXT DEFAULT '{}', -- JSON: additional config
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (org_id) REFERENCES organization_registry(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_service_catalog_org ON service_catalog(org_id, is_active);
CREATE INDEX IF NOT EXISTS idx_service_catalog_vc_type ON service_catalog(vc_type, is_active);
CREATE INDEX IF NOT EXISTS idx_service_catalog_type ON service_catalog(service_type);

-- VC Requests: Workflow-independent VC issuance requests
CREATE TABLE IF NOT EXISTS vc_requests (
  id TEXT PRIMARY KEY,
  requester_tenant_id TEXT NOT NULL,
  requester_did TEXT,
  target_org_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  vc_type TEXT NOT NULL,
  request_payload TEXT NOT NULL, -- JSON: holder-provided data
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN (
    'pending', 'submitted', 'under_review', 'approved', 'rejected', 'issued', 'failed', 'expired'
  )),
  credential_id TEXT, -- ID of issued VC
  credential_offer_url TEXT,
  rejection_reason TEXT,
  notes TEXT,
  fee_paid INTEGER DEFAULT 0,
  payment_ref TEXT,
  estimated_completion DATETIME,
  submitted_at DATETIME,
  approved_at DATETIME,
  issued_at DATETIME,
  expires_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (requester_tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (target_org_id) REFERENCES organization_registry(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES service_catalog(id)
);

CREATE INDEX IF NOT EXISTS idx_vc_requests_requester ON vc_requests(requester_tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_vc_requests_target_org ON vc_requests(target_org_id, status);
CREATE INDEX IF NOT EXISTS idx_vc_requests_vc_type ON vc_requests(vc_type);
CREATE INDEX IF NOT EXISTS idx_vc_requests_status ON vc_requests(status);
CREATE INDEX IF NOT EXISTS idx_vc_requests_expires ON vc_requests(expires_at);

-- Seed: Zimbabwe Central Registry (Government)
INSERT OR IGNORE INTO organization_registry (
  id, tenant_id, display_name, description, category, sub_category,
  is_public, verification_status, issuer_did, website, country
)
SELECT
  'org-zw-central-registry',
  t.id,
  'Zimbabwe Central Registry',
  'Official government registry for identity documents and certificates',
  'government',
  'identity',
  1, -- public
  'verified',
  t.issuer_did,
  'https://registry.gov.zw',
  'ZW'
FROM tenants t
WHERE t.label = 'Zimbabwe Central Registry'
LIMIT 1;

-- Seed: National ID VC Service
INSERT OR IGNORE INTO service_catalog (
  id, org_id, service_type, vc_type, name, description,
  requirements, turnaround_time, turnaround_hours, fee_amount, is_active,
  request_schema
)
SELECT
  'svc-zw-national-id',
  'org-zw-central-registry',
  'vc_issuance',
  'NationalIDVC',
  'Request National ID Credential',
  'Verifiable credential containing your national ID information',
  json_array('National ID Number', 'Full Name', 'Date of Birth', 'ID Photo'),
  'Instant',
  0,
  0,
  1,
  json_object(
    'type', 'object',
    'properties', json_object(
      'idNumber', json_object('type', 'string', 'title', 'National ID Number', 'required', true),
      'fullName', json_object('type', 'string', 'title', 'Full Name (as on ID)', 'required', true),
      'dateOfBirth', json_object('type', 'string', 'format', 'date', 'title', 'Date of Birth', 'required', true),
      'idPhoto', json_object('type', 'string', 'format', 'data-url', 'title', 'Upload ID Photo', 'required', true)
    )
  )
WHERE EXISTS (SELECT 1 FROM organization_registry WHERE id = 'org-zw-central-registry');

-- Seed: Birth Certificate VC Service
INSERT OR IGNORE INTO service_catalog (
  id, org_id, service_type, vc_type, name, description,
  requirements, turnaround_time, turnaround_hours, fee_amount, is_active
)
SELECT
  'svc-zw-birth-cert',
  'org-zw-central-registry',
  'vc_issuance',
  'BirthCertificateVC',
  'Request Birth Certificate',
  'Digital birth certificate as a verifiable credential',
  json_array('Birth Registration Number', 'Parent ID Numbers', 'Birth Hospital'),
  '24 hours',
  24,
  0,
  1
WHERE EXISTS (SELECT 1 FROM organization_registry WHERE id = 'org-zw-central-registry');

-- Seed: Econet Zimbabwe (Telecom)
INSERT OR IGNORE INTO organization_registry (
  id, tenant_id, display_name, description, category, sub_category,
  is_public, verification_status, issuer_did, website, country
)
SELECT
  'org-econet-zimbabwe',
  t.id,
  'Econet Zimbabwe',
  'Leading mobile network operator in Zimbabwe',
  'telecom',
  'mobile',
  1,
  'verified',
  t.issuer_did,
  'https://www.econet.co.zw',
  'ZW'
FROM tenants t
WHERE t.label = 'Econet Zimbabwe'
LIMIT 1;

-- Seed: Phone Number VC Service
INSERT OR IGNORE INTO service_catalog (
  id, org_id, service_type, vc_type, name, description,
  requirements, turnaround_time, turnaround_hours, fee_amount, is_active,
  request_schema
)
SELECT
  'svc-econet-phone-number',
  'org-econet-zimbabwe',
  'vc_issuance',
  'PhoneNumberVC',
  'Request Phone Ownership Proof',
  'Verifiable proof that you own this phone number',
  json_array('Phone Number', 'OTP Verification'),
  'Instant',
  0,
  0,
  1,
  json_object(
    'type', 'object',
    'properties', json_object(
      'phoneNumber', json_object('type', 'string', 'title', 'Phone Number', 'pattern', '^\\+263[0-9]{9}$', 'required', true),
      'otp', json_object('type', 'string', 'title', 'OTP Code', 'required', true)
    )
  )
WHERE EXISTS (SELECT 1 FROM organization_registry WHERE id = 'org-econet-zimbabwe');
