-- People & payroll (staff leave, expense claims, payslips) is a module an organisation
-- switches on during setup, not something every organisation gets. Modules sit beside the
-- "what you do" answer on the setup profile. A plan row says which paid modules the
-- organisation may use; during the pilot every organisation is granted People & payroll
-- at no charge, so the plan layer exists but charges nothing yet.

ALTER TABLE org_setup_profiles ADD COLUMN modules TEXT NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS org_plans (
  org_tenant_id TEXT PRIMARY KEY,
  plan TEXT NOT NULL DEFAULT 'free',
  granted_modules TEXT NOT NULL DEFAULT '[]',
  note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Organisations that already use leave, expense claims or payslip workflows keep them on.
-- Everyone else starts with the module off and answers the setup question.
INSERT INTO org_setup_profiles (org_tenant_id, kinds, modules, created_at, updated_at)
SELECT DISTINCT o.tenant_id, '[]', '["people_payroll"]', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  FROM organizations o
 WHERE (
         EXISTS (
           SELECT 1 FROM requests r
            WHERE r.organization_id = o.id
              AND r.request_type IN ('hr.leave', 'finance.expense_claim')
         )
         OR EXISTS (
           SELECT 1 FROM workflow_templates t
            WHERE t.tenant_id = o.tenant_id
              AND t.workflow_type IN ('tpl-employee-onboarding', 'tpl-payslip-issuance', 'tpl-payroll-reporting', 'hr_requests')
         )
       )
ON CONFLICT(org_tenant_id) DO UPDATE SET
  modules = '["people_payroll"]',
  updated_at = CURRENT_TIMESTAMP;

-- Leave and expense records already sent were filed as job records (the request id sat in
-- workflow_run_id). Mark them as request records so the inbox files them under Staff requests.
UPDATE wallet_pending_offers
   SET workflow_run_id = NULL,
       metadata = json_set(
         COALESCE(metadata, '{}'),
         '$.workflowRunId', NULL,
         '$.requestType', CASE credential_type WHEN 'LeaveApprovalVC' THEN 'hr.leave' ELSE 'finance.expense_claim' END
       )
 WHERE source_type = 'workflow_vc_offer'
   AND credential_type IN ('LeaveApprovalVC', 'ExpenseApprovalVC');
