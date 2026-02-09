-- Migration 018: Add 'delivered' state to ack_payments
-- Supports driver delivery confirmation flow

-- SQLite doesn't support ALTER TABLE ... MODIFY COLUMN, so we need to:
-- 1. Create new table with updated constraint
-- 2. Copy data
-- 3. Drop old table
-- 4. Rename new table

CREATE TABLE IF NOT EXISTS ack_payments_new (
    id TEXT PRIMARY KEY,
    tenant_id TEXT,
    cart_id TEXT,
    payment_request_token TEXT,
    provider_ref TEXT,
    payer_phone TEXT,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    state TEXT DEFAULT 'pending' CHECK(state IN ('pending', 'paid', 'failed', 'cancelled', 'delivered')) NOT NULL,
    idempotency_key TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT,
    FOREIGN KEY (cart_id) REFERENCES carts(id)
);

-- Copy existing data
INSERT INTO ack_payments_new 
SELECT id, tenant_id, cart_id, payment_request_token, provider_ref, payer_phone, 
       amount, currency, state, idempotency_key, created_at, updated_at, metadata
FROM ack_payments;

-- Drop old table
DROP TABLE ack_payments;

-- Rename new table
ALTER TABLE ack_payments_new RENAME TO ack_payments;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_ack_payments_idempotency ON ack_payments(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_ack_payments_provider_ref ON ack_payments(provider_ref);
CREATE INDEX IF NOT EXISTS idx_ack_payments_cart ON ack_payments(cart_id);
CREATE INDEX IF NOT EXISTS idx_ack_payments_tenant ON ack_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ack_payments_state ON ack_payments(state);

-- Record migration
INSERT INTO schema_migrations (version, name) VALUES (17, 'add_delivered_state');
