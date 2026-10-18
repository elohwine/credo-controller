-- A supplier bill recorded when a purchase order is marked delivered, and the payment recorded
-- when its supplier payment request is marked paid, now land in the payables ledger. These
-- columns keep the link back to the request chain and the job it was raised for, so the
-- Supplier bills tab can say where a bill came from and the request can show its bill.
ALTER TABLE ap_invoices ADD COLUMN source_request_id TEXT;
ALTER TABLE ap_invoices ADD COLUMN project_ref TEXT;
ALTER TABLE ap_payments ADD COLUMN source_request_id TEXT;
CREATE INDEX IF NOT EXISTS idx_ap_invoices_source_request ON ap_invoices(source_request_id);
CREATE INDEX IF NOT EXISTS idx_ap_payments_source_request ON ap_payments(source_request_id);
