-- Holder VC requests table (from 061_organization_registry_and_service_catalog.sql).
--
-- 061 was never in the DatabaseManager registry; 097 recreated its registry and
-- service catalog tables but not vc_requests, which OrganizationRegistryRepository
-- uses. IF NOT EXISTS keeps this a no-op on databases that already have it.

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
