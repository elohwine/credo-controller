-- A deposit on a quote from Discover, and offers people asked to receive.
-- A deposit is a normal payment to the business. Credentis does not hold the money.
-- Offers are not alert preferences and are not sent on the alert template.

CREATE TABLE IF NOT EXISTS job_deposits (
    request_id TEXT PRIMARY KEY,
    org_tenant_id TEXT NOT NULL,
    author_tenant_id TEXT NOT NULL,
    payment_link_id TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('awaiting_payment', 'paid', 'disputed', 'acknowledged')),
    dispute_reason TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_job_deposits_org ON job_deposits(org_tenant_id, status);

CREATE TABLE IF NOT EXISTS marketing_opt_ins (
    org_tenant_id TEXT NOT NULL,
    phone TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (org_tenant_id, phone)
);

CREATE TABLE IF NOT EXISTS broadcasts (
    id TEXT PRIMARY KEY,
    org_tenant_id TEXT NOT NULL,
    body TEXT NOT NULL,
    audience_count INTEGER NOT NULL,
    status TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_broadcasts_org_day ON broadcasts(org_tenant_id, created_at);
