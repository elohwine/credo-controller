-- Close the remaining correlation gaps without turning the subledger into a GL.

ALTER TABLE settlement_allocations ADD COLUMN unapplied_amount REAL NOT NULL DEFAULT 0;

ALTER TABLE ar_payment_plans ADD COLUMN source_workflow_run_id TEXT;
ALTER TABLE ar_payment_plans ADD COLUMN next_notification_at TEXT;
ALTER TABLE ar_plan_installments ADD COLUMN notified_at TEXT;
ALTER TABLE ar_plan_installments ADD COLUMN reminder_sent_at TEXT;

ALTER TABLE purchase_receipts ADD COLUMN receipt_kind TEXT NOT NULL DEFAULT 'goods';
ALTER TABLE purchase_receipts ADD COLUMN receiving_required INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_ar_plans_source_workflow
  ON ar_payment_plans(source_workflow_run_id);
CREATE INDEX IF NOT EXISTS idx_ar_installments_due_notification
  ON ar_plan_installments(status, due_date, notified_at);
