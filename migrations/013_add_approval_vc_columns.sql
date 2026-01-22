-- Migration: 013_add_approval_vc_columns.sql
-- Description: Add VC columns for Leave and Expense approvals

ALTER TABLE leave_requests ADD COLUMN approval_vc_id TEXT;
ALTER TABLE expense_claims ADD COLUMN approval_vc_id TEXT;

CREATE INDEX IF NOT EXISTS idx_leave_requests_vc ON leave_requests(approval_vc_id);
CREATE INDEX IF NOT EXISTS idx_expense_claims_vc ON expense_claims(approval_vc_id);
