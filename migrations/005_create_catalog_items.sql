CREATE TABLE IF NOT EXISTS catalog_items (
    id TEXT PRIMARY KEY,
    merchant_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    images TEXT, -- JSON array of strings
    price REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    sku TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_catalog_merchant ON catalog_items(merchant_id);
CREATE INDEX IF NOT EXISTS idx_catalog_sku ON catalog_items(sku);
