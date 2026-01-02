-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    actor_did TEXT, -- Who performed the action (User DID or Agent DID)
    action_type TEXT NOT NULL, -- e.g., 'issuance', 'revocation', 'login', 'config_change'
    resource_id TEXT, -- ID of the affected resource (VC ID, Employee ID, etc.)
    details TEXT DEFAULT '{}', -- JSON: Contextual metadata
    ip_address TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant_created ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_logs(resource_id);
