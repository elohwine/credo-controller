-- Migration 048: make reconciliation requisition event constraints backward-compatible.
--
-- Why:
-- Existing databases can still contain legacy REQUISITION_APPROVED events.
-- When newer two-stage events are enabled, CHECK constraints may reject inserts
-- or fail migration copy steps, causing approval progression to stall.
--
-- This migration allows both legacy and two-stage event names.

PRAGMA foreign_keys = OFF;

CREATE TABLE reconciliation_events_new (
    id TEXT PRIMARY KEY,
    provider_ref TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK(event_type IN (
        'QUOTE_ISSUED', 'INVOICE_ISSUED', 'PAYMENT_SUCCESS', 'RECEIPT_ISSUED',
        'DELIVERY_VERIFIED', 'ESCROW_RELEASED', 'PAYOUT_FAILED', 'SETTLEMENT_CONFIRMED',
        'REFUNDED', 'DISPUTED', 'REQUISITION_CREATED', 'REQUISITION_APPROVED',
        'REQUISITION_MANAGER_APPROVED', 'REQUISITION_FINANCE_APPROVED',
        'REQUISITION_RELEASED', 'EXECUTION_ACKNOWLEDGED'
    )),
    source TEXT NOT NULL,
    amount REAL,
    currency TEXT,
    metadata TEXT,
    occurred_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO reconciliation_events_new (
    id, provider_ref, event_type, source, amount, currency, metadata, occurred_at, created_at
)
SELECT
    id, provider_ref, event_type, source, amount, currency, metadata, occurred_at, created_at
FROM reconciliation_events;

DROP TABLE reconciliation_events;
ALTER TABLE reconciliation_events_new RENAME TO reconciliation_events;

CREATE INDEX IF NOT EXISTS idx_recon_events_provider ON reconciliation_events(provider_ref);
CREATE INDEX IF NOT EXISTS idx_recon_events_type ON reconciliation_events(event_type);
CREATE INDEX IF NOT EXISTS idx_recon_events_occurred ON reconciliation_events(occurred_at);

CREATE TABLE reconciliation_status_new (
    provider_ref TEXT PRIMARY KEY,
    tenant_id TEXT,
    status TEXT NOT NULL DEFAULT 'INITIATED' CHECK(status IN (
        'QUOTE_ISSUED', 'INVOICE_ISSUED', 'INITIATED', 'PAID', 'RECEIPT_ISSUED',
        'DELIVERED', 'RECONCILED', 'PAYOUT_FAILED', 'AMOUNT_MISMATCH',
        'SETTLEMENT_MISSING', 'DISPUTED', 'REFUNDED', 'REQUISITION_CREATED',
        'MANAGER_APPROVED', 'APPROVED', 'RELEASED', 'ACKNOWLEDGED'
    )),
    payment_amount REAL,
    settlement_amount REAL,
    mismatch_reason TEXT,
    event_count INTEGER DEFAULT 0,
    first_event_at DATETIME,
    last_event_at DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO reconciliation_status_new (
    provider_ref, tenant_id, status, payment_amount, settlement_amount,
    mismatch_reason, event_count, first_event_at, last_event_at, updated_at
)
SELECT
    provider_ref, tenant_id, status, payment_amount, settlement_amount,
    mismatch_reason, event_count, first_event_at, last_event_at, updated_at
FROM reconciliation_status;

DROP TABLE reconciliation_status;
ALTER TABLE reconciliation_status_new RENAME TO reconciliation_status;

CREATE INDEX IF NOT EXISTS idx_recon_status_tenant ON reconciliation_status(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recon_status_status ON reconciliation_status(status);

PRAGMA foreign_keys = ON;
