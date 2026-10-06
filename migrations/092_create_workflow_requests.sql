-- Restores inbox-driven workflow request lifecycle used in mvp-fastlane.

CREATE TABLE IF NOT EXISTS contact_capabilities (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL,
  org_tenant_id TEXT NOT NULL,
  capability_type TEXT NOT NULL,
  vc_types TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  metadata TEXT DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (contact_id) REFERENCES org_contacts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cc_contact ON contact_capabilities(contact_id);
CREATE INDEX IF NOT EXISTS idx_cc_org ON contact_capabilities(org_tenant_id);
CREATE INDEX IF NOT EXISTS idx_cc_type ON contact_capabilities(capability_type);

CREATE TABLE IF NOT EXISTS workflow_requests (
  id TEXT PRIMARY KEY,
  requester_tenant_id TEXT NOT NULL,
  requester_did TEXT,
  target_org_tenant_id TEXT NOT NULL,
  contact_id TEXT,
  request_type TEXT NOT NULL,
  workflow_type TEXT,
  workflow_id TEXT,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  request_vc_id TEXT,
  response_vc_id TEXT,
  rejection_reason TEXT,
  approver_id TEXT,
  approver_role TEXT,
  assignee_user_id TEXT,
  assignee_wallet_tenant_id TEXT,
  assignee_role TEXT,
  assigned_at DATETIME,
  assignment_mode TEXT,
  assignment_note TEXT,
  fulfilled_at DATETIME,
  approved_at DATETIME,
  rejected_at DATETIME,
  expires_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (requester_tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (target_org_tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_wr_target_org ON workflow_requests(target_org_tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_wr_requester ON workflow_requests(requester_tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_wr_type ON workflow_requests(request_type);
CREATE INDEX IF NOT EXISTS idx_wr_status ON workflow_requests(status);
CREATE INDEX IF NOT EXISTS idx_wr_expires ON workflow_requests(expires_at);
CREATE INDEX IF NOT EXISTS idx_wr_assignee_user ON workflow_requests(assignee_user_id, status);
CREATE INDEX IF NOT EXISTS idx_wr_assignee_wallet ON workflow_requests(assignee_wallet_tenant_id, status);
