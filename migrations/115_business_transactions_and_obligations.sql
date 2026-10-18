-- One business event at the centre; money owed and money paid stay separate.
-- This is a correlation/subledger layer, not a general ledger.

CREATE TABLE IF NOT EXISTS business_transactions (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  transaction_type  TEXT NOT NULL,
  reference         TEXT,
  title             TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'open',
  parent_transaction_id TEXT REFERENCES business_transactions(id),
  source_type       TEXT NOT NULL,
  source_id         TEXT NOT NULL,
  metadata          TEXT NOT NULL DEFAULT '{}',
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  UNIQUE(tenant_id, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_business_transactions_tenant
  ON business_transactions(tenant_id, transaction_type, status);
CREATE INDEX IF NOT EXISTS idx_business_transactions_parent
  ON business_transactions(parent_transaction_id);

CREATE TABLE IF NOT EXISTS business_transaction_links (
  id                 TEXT PRIMARY KEY,
  business_transaction_id TEXT NOT NULL REFERENCES business_transactions(id) ON DELETE CASCADE,
  link_type          TEXT NOT NULL,
  link_id            TEXT NOT NULL,
  relation           TEXT NOT NULL DEFAULT 'source',
  created_at         TEXT NOT NULL,
  UNIQUE(link_type, link_id, relation)
);

CREATE INDEX IF NOT EXISTS idx_business_transaction_links_transaction
  ON business_transaction_links(business_transaction_id);

CREATE TABLE IF NOT EXISTS financial_obligations (
  id                 TEXT PRIMARY KEY,
  business_transaction_id TEXT NOT NULL REFERENCES business_transactions(id) ON DELETE CASCADE,
  tenant_id          TEXT NOT NULL,
  direction          TEXT NOT NULL CHECK(direction IN ('payable', 'receivable')),
  counterparty_ref   TEXT,
  counterparty_name  TEXT,
  description        TEXT NOT NULL,
  original_amount    REAL NOT NULL,
  currency           TEXT NOT NULL DEFAULT 'USD',
  due_date           TEXT,
  balance_due        REAL NOT NULL,
  status             TEXT NOT NULL DEFAULT 'open'
    CHECK(status IN ('open', 'partially_settled', 'settled', 'disputed', 'cancelled')),
  source_type        TEXT NOT NULL,
  source_id          TEXT NOT NULL,
  metadata           TEXT NOT NULL DEFAULT '{}',
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  UNIQUE(tenant_id, direction, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_financial_obligations_transaction
  ON financial_obligations(business_transaction_id);
CREATE INDEX IF NOT EXISTS idx_financial_obligations_tenant
  ON financial_obligations(tenant_id, direction, status);

CREATE TABLE IF NOT EXISTS settlement_allocations (
  id                 TEXT PRIMARY KEY,
  obligation_id      TEXT NOT NULL REFERENCES financial_obligations(id) ON DELETE CASCADE,
  settlement_type    TEXT NOT NULL,
  settlement_id      TEXT NOT NULL,
  amount             REAL NOT NULL,
  currency           TEXT NOT NULL DEFAULT 'USD',
  status             TEXT NOT NULL DEFAULT 'applied'
    CHECK(status IN ('pending', 'applied', 'reversed')),
  applied_at         TEXT NOT NULL,
  metadata           TEXT NOT NULL DEFAULT '{}',
  UNIQUE(obligation_id, settlement_type, settlement_id)
);

CREATE INDEX IF NOT EXISTS idx_settlement_allocations_obligation
  ON settlement_allocations(obligation_id);
CREATE INDEX IF NOT EXISTS idx_settlement_allocations_settlement
  ON settlement_allocations(settlement_type, settlement_id);

-- Receiving and supplier invoicing are separate facts. Their match decides whether
-- the payable may proceed; completing a purchase order no longer means they are one row.
CREATE TABLE IF NOT EXISTS purchase_receipts (
  id                 TEXT PRIMARY KEY,
  tenant_id          TEXT NOT NULL,
  business_transaction_id TEXT NOT NULL REFERENCES business_transactions(id) ON DELETE CASCADE,
  purchase_request_id TEXT,
  purchase_order_id  TEXT NOT NULL,
  receipt_ref        TEXT,
  received_amount    REAL NOT NULL,
  evidence_url       TEXT,
  received_by        TEXT,
  received_at        TEXT NOT NULL,
  metadata           TEXT NOT NULL DEFAULT '{}',
  UNIQUE(tenant_id, purchase_order_id)
);

CREATE INDEX IF NOT EXISTS idx_purchase_receipts_transaction
  ON purchase_receipts(business_transaction_id);

ALTER TABLE ap_invoices ADD COLUMN business_transaction_id TEXT;
ALTER TABLE ap_invoices ADD COLUMN obligation_id TEXT;
ALTER TABLE ap_invoices ADD COLUMN purchase_receipt_id TEXT;
ALTER TABLE ap_invoices ADD COLUMN match_status TEXT NOT NULL DEFAULT 'not_checked';
ALTER TABLE ap_invoices ADD COLUMN match_note TEXT;
ALTER TABLE ap_payments ADD COLUMN settlement_allocation_id TEXT;
ALTER TABLE payment_links ADD COLUMN business_transaction_id TEXT;
ALTER TABLE payment_links ADD COLUMN obligation_id TEXT;
ALTER TABLE ar_payment_plans ADD COLUMN business_transaction_id TEXT;
ALTER TABLE ar_plan_installments ADD COLUMN obligation_id TEXT;

CREATE INDEX IF NOT EXISTS idx_ap_invoices_business_transaction ON ap_invoices(business_transaction_id);
CREATE INDEX IF NOT EXISTS idx_ap_invoices_obligation ON ap_invoices(obligation_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_business_transaction ON payment_links(business_transaction_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_obligation ON payment_links(obligation_id);
CREATE INDEX IF NOT EXISTS idx_ar_plans_business_transaction ON ar_payment_plans(business_transaction_id);
CREATE INDEX IF NOT EXISTS idx_ar_installments_obligation ON ar_plan_installments(obligation_id);
