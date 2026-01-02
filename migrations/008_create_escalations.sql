-- Escalations table for regulator notifications
CREATE TABLE IF NOT EXISTS escalations (
    id TEXT PRIMARY KEY,
    merchant_id TEXT NOT NULL,
    receipt_id TEXT,
    reason TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'medium', -- low, medium, high, critical
    package_url TEXT, -- URL to signed evidence package
    regulator_action_status TEXT DEFAULT 'pending', -- pending, under_review, resolved, dismissed
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_escalation_merchant ON escalations(merchant_id);
CREATE INDEX IF NOT EXISTS idx_escalation_status ON escalations(regulator_action_status);

-- VC verification logs for audit trail
CREATE TABLE IF NOT EXISTS vc_verifications (
    id TEXT PRIMARY KEY,
    vc_id TEXT NOT NULL,
    vc_type TEXT,
    verification_result TEXT NOT NULL, -- valid, invalid, revoked, expired
    verifier_info TEXT, -- JSON with IP, user agent, etc.
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_verification_vc ON vc_verifications(vc_id);
