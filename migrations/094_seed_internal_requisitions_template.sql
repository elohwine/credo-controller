-- Ensure the internal requisitions workflow template is available for
-- inbox-driven requisition stage execution.

CREATE TABLE IF NOT EXISTS workflow_templates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  workflow_type TEXT NOT NULL,
  name TEXT NOT NULL,
  sector TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  steps TEXT NOT NULL DEFAULT '[]',
  payment_modes TEXT NOT NULL DEFAULT '[]',
  credential_policy TEXT NOT NULL DEFAULT '{}',
  reconciliation_policy TEXT NOT NULL DEFAULT '{}',
  evidence_policy TEXT NOT NULL DEFAULT '{}',
  branding_policy TEXT NOT NULL DEFAULT '{}',
  initiation_schema TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workflow_templates_sector
  ON workflow_templates(sector, enabled, version);

INSERT OR IGNORE INTO workflow_templates (
  id,
  tenant_id,
  workflow_type,
  name,
  sector,
  enabled,
  version,
  steps,
  payment_modes,
  credential_policy,
  reconciliation_policy,
  evidence_policy,
  branding_policy,
  initiation_schema
)
VALUES (
  'default-internal-requisitions',
  NULL,
  'internal_requisitions',
  'Internal Requisitions',
  'custom',
  1,
  1,
  '[
    {"action":"requisition.create","description":"Create requisition request with items and metadata"},
    {"action":"requisition.manager_approve","description":"Manager reviews and approves requisition"},
    {"action":"requisition.finance_approve","description":"Finance team approves budget and release"},
    {"action":"requisition.release","description":"Release requisition items to requester"},
    {"action":"requisition.acknowledge","description":"Requester acknowledges receipt of items"},
    {"action":"credential.issue","description":"Issue RequisitionAcknowledgementVC"},
    {"action":"field.reconcile","description":"Reconcile requisition fulfillment"},
    {"action":"trust.update_score","description":"Update trust score for completed requisition"}
  ]',
  '[]',
  '{"outputVCs":["RequisitionAcknowledgementVC"],"autoIssue":false}',
  '{"mode":"manual","events":["REQUISITION_CREATED","REQUISITION_MANAGER_APPROVED","REQUISITION_FINANCE_APPROVED","REQUISITION_RELEASED","EXECUTION_ACKNOWLEDGED","RECONCILED"]}',
  '{"requireManagerApproval":true,"requireFinanceApproval":true,"requireAcknowledgement":true}',
  '{}',
  NULL
);
