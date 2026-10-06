-- Update credential_policy for education (school fees) workflow template to include
-- output VC types and a stage-to-VC mapping so WorkflowVcOfferDispatcher can select
-- the correct credential type per stage action.

UPDATE workflow_templates
SET
  credential_policy = '{"outputVCs":["SchoolFeeInvoiceVC","SchoolFeeReceiptVC"],"stageVcMap":{"fees.invoice":"SchoolFeeInvoiceVC","fees.receipt":"SchoolFeeReceiptVC","credential.issue":"SchoolFeeReceiptVC"},"autoIssue":true}',
  updated_at = CURRENT_TIMESTAMP
WHERE
  workflow_type IN ('school_fees', 'school_fee_payment', 'education_fees', 'education')
  OR id LIKE 'tpl-education%'
  OR id LIKE '%education%';

-- Ensure internal-requisitions template has autoIssue=true (seed had autoIssue:false).
UPDATE workflow_templates
SET
  credential_policy = '{"outputVCs":["RequisitionAcknowledgementVC"],"autoIssue":true}',
  updated_at = CURRENT_TIMESTAMP
WHERE
  workflow_type = 'internal_requisitions'
  OR id LIKE '%internal-requisitions%'
  OR id LIKE '%internal_requisitions%';
