-- Migration 020: Add audit trail columns for verifiable chain of custody (Quote -> Invoice -> Receipt)

-- Update carts table to link Quotes
-- ALTER TABLE carts ADD COLUMN quote_id TEXT;
-- ALTER TABLE carts ADD COLUMN quote_hash TEXT;

-- Update ack_payments to link Invoices
-- ALTER TABLE ack_payments ADD COLUMN invoice_id TEXT;
-- ALTER TABLE ack_payments ADD COLUMN invoice_hash TEXT;

-- Index for faster chain lookups
CREATE INDEX IF NOT EXISTS idx_carts_quote_id ON carts(quote_id);
CREATE INDEX IF NOT EXISTS idx_ack_payments_invoice_id ON ack_payments(invoice_id);
