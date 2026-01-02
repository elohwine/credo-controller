-- Cart table for WhatsApp commerce sessions
CREATE TABLE IF NOT EXISTS carts (
    id TEXT PRIMARY KEY,
    merchant_id TEXT NOT NULL,
    buyer_phone TEXT,
    items TEXT NOT NULL, -- JSON array of {itemId, quantity, price}
    total REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USD',
    status TEXT NOT NULL DEFAULT 'pending', -- pending, quoted, invoiced, paid, cancelled
    nonce TEXT, -- For preventing replay attacks
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cart_merchant ON carts(merchant_id);
CREATE INDEX IF NOT EXISTS idx_cart_buyer ON carts(buyer_phone);
CREATE INDEX IF NOT EXISTS idx_cart_status ON carts(status);
