-- Add credential offer URI columns for reoffer functionality
-- These store the full credential offer URIs so they can be re-presented to users

ALTER TABLE payroll_runs ADD COLUMN run_vc_offer_uri TEXT;
ALTER TABLE leave_requests ADD COLUMN approval_vc_offer_uri TEXT;
ALTER TABLE expense_claims ADD COLUMN approval_vc_offer_uri TEXT;
ALTER TABLE onboarding_requests ADD COLUMN contract_vc_offer_uri TEXT;
