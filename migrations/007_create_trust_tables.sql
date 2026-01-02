-- Trust scores table for merchant trust computation
CREATE TABLE IF NOT EXISTS trust_scores (
    merchant_id TEXT PRIMARY KEY,
    score REAL NOT NULL DEFAULT 0,
    drivers TEXT NOT NULL, -- JSON array of {name, weight, value, sourceVcId?}
    last_computed DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Trust events for audit trail
CREATE TABLE IF NOT EXISTS trust_events (
    id TEXT PRIMARY KEY,
    merchant_id TEXT NOT NULL,
    event_type TEXT NOT NULL, -- payment, dispute, refund, kyc_attestation, review
    event_data TEXT, -- JSON details
    impact REAL, -- Score impact (positive or negative)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_trust_events_merchant ON trust_events(merchant_id);
CREATE INDEX IF NOT EXISTS idx_trust_events_type ON trust_events(event_type);
