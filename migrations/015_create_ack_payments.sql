-- Migration 015: Create ACK Payments tables for EcoCash integration
-- Supports the payment → ReceiptVC flow

CREATE TABLE IF NOT EXISTS ack_payments (
    id TEXT PRIMARY KEY,
    tenant_id TEXT,
    cart_id TEXT,
    payment_request_token TEXT,
    provider_ref TEXT,
    payer_phone TEXT,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    state TEXT DEFAULT 'pending' CHECK(state IN ('pending', 'paid', 'failed', 'cancelled')),
    idempotency_key TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT,
    FOREIGN KEY (cart_id) REFERENCES carts(id)
);

CREATE INDEX IF NOT EXISTS idx_ack_payments_idempotency ON ack_payments(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_ack_payments_provider_ref ON ack_payments(provider_ref);
CREATE INDEX IF NOT EXISTS idx_ack_payments_cart ON ack_payments(cart_id);
CREATE INDEX IF NOT EXISTS idx_ack_payments_tenant ON ack_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ack_payments_state ON ack_payments(state);

CREATE TABLE IF NOT EXISTS ack_payment_receipts (
    id TEXT PRIMARY KEY,
    payment_id TEXT NOT NULL,
    credential_offer_url TEXT,
    credential_type TEXT DEFAULT 'PaymentReceiptCredential',
    issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (payment_id) REFERENCES ack_payments(id)
);

CREATE INDEX IF NOT EXISTS idx_ack_receipts_payment ON ack_payment_receipts(payment_id);

-- Record migration
INSERT INTO schema_migrations (version, name) VALUES (15, 'create_ack_payments');
