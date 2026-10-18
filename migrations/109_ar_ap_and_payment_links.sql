-- Payments to collect, supplier bills, and the shared step that joins them.
-- Brought across from the mvp-fastlane checkout so the phone Finance tabs have a server.

CREATE TABLE IF NOT EXISTS payment_links (
    id TEXT PRIMARY KEY,
    merchant_id TEXT NOT NULL,
    merchant_name TEXT,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    invoice_ref TEXT,
    status TEXT DEFAULT 'active'
        CHECK(status IN ('active', 'paid', 'expired', 'cancelled')),
    expiry DATETIME,
    paid_at DATETIME,
    provider_ref TEXT,
    payer_phone TEXT,
    shortlink_code TEXT,
    shortlink_url TEXT,
    sector TEXT DEFAULT 'general',
    metadata TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payment_links_merchant ON payment_links(merchant_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_status ON payment_links(status);
CREATE INDEX IF NOT EXISTS idx_payment_links_shortlink ON payment_links(shortlink_code);
CREATE INDEX IF NOT EXISTS idx_payment_links_provider_ref ON payment_links(provider_ref);
CREATE INDEX IF NOT EXISTS idx_payment_links_sector ON payment_links(sector);

CREATE TABLE IF NOT EXISTS ap_suppliers (
  id                        TEXT PRIMARY KEY,
  buyer_tenant_id           TEXT NOT NULL,
  supplier_name             TEXT NOT NULL,
  supplier_phone            TEXT,
  supplier_email            TEXT,
  supplier_wallet_tenant_id TEXT,
  contact_id                TEXT,
  tax_number                TEXT,
  bank_details              TEXT,
  notes                     TEXT,
  created_at                TEXT NOT NULL,
  updated_at                TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ap_suppliers_buyer ON ap_suppliers(buyer_tenant_id);
CREATE INDEX IF NOT EXISTS idx_ap_suppliers_wallet ON ap_suppliers(supplier_wallet_tenant_id);

CREATE TABLE IF NOT EXISTS ap_invoices (
  id              TEXT PRIMARY KEY,
  buyer_tenant_id TEXT NOT NULL,
  supplier_id     TEXT NOT NULL REFERENCES ap_suppliers(id),
  invoice_ref     TEXT NOT NULL,
  description     TEXT,
  amount          REAL NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'USD',
  due_date        TEXT,
  status          TEXT NOT NULL DEFAULT 'outstanding',
  balance_due     REAL NOT NULL,
  source_type TEXT,
  source_plan_id TEXT,
  source_payment_link_id TEXT,
  source_installment_number INTEGER,
  counterparty_tenant_id TEXT,
  workflow_stage TEXT,
  last_action_at TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ap_invoices_buyer ON ap_invoices(buyer_tenant_id);
CREATE INDEX IF NOT EXISTS idx_ap_invoices_supplier ON ap_invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_ap_invoices_status ON ap_invoices(status);
CREATE INDEX IF NOT EXISTS idx_ap_invoices_due_date ON ap_invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_ap_invoices_source_payment_link ON ap_invoices(source_payment_link_id);
CREATE INDEX IF NOT EXISTS idx_ap_invoices_counterparty_tenant ON ap_invoices(counterparty_tenant_id);
CREATE INDEX IF NOT EXISTS idx_ap_invoices_workflow_stage ON ap_invoices(workflow_stage);

CREATE TABLE IF NOT EXISTS ap_payments (
  id                       TEXT PRIMARY KEY,
  buyer_tenant_id          TEXT NOT NULL,
  supplier_id              TEXT NOT NULL REFERENCES ap_suppliers(id),
  ap_invoice_id            TEXT NOT NULL REFERENCES ap_invoices(id),
  amount_paid              REAL NOT NULL,
  currency                 TEXT NOT NULL DEFAULT 'USD',
  payment_method           TEXT,
  reference                TEXT,
  proof_image_url          TEXT,
  remittance_vc_id         TEXT,
  acknowledge_token        TEXT UNIQUE,
  supplier_acknowledged_at TEXT,
  paid_at                  TEXT NOT NULL,
  idempotency_key          TEXT,
  created_at               TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ap_payments_buyer ON ap_payments(buyer_tenant_id);
CREATE INDEX IF NOT EXISTS idx_ap_payments_supplier ON ap_payments(supplier_id);
CREATE INDEX IF NOT EXISTS idx_ap_payments_invoice ON ap_payments(ap_invoice_id);
CREATE INDEX IF NOT EXISTS idx_ap_payments_token ON ap_payments(acknowledge_token);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ap_payments_idempotency
  ON ap_payments(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS ar_payment_plans (
    id TEXT PRIMARY KEY,
    buyer_tenant_id TEXT NOT NULL,
    payer_contact_id TEXT,
    payer_name TEXT,
    payer_phone TEXT,
    payer_email TEXT,
    description TEXT NOT NULL,
    total_amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    plan_type TEXT NOT NULL DEFAULT 'instalment',
    cadence TEXT,
    installments_total INTEGER NOT NULL DEFAULT 1,
    installments_paid INTEGER NOT NULL DEFAULT 0,
    amount_collected REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    debtor_org_id TEXT,
    debtor_org_name TEXT,
    debtor_contact_id TEXT,
    proof_request_id TEXT,
    proof_response_id TEXT,
    proof_presented_at TEXT,
    trust_status TEXT NOT NULL DEFAULT 'pending',
    receipt_vc_id TEXT,
    receipt_issued_at TEXT,
    debtor_inbox_item_id TEXT,
    debtor_notified_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ar_plans_buyer ON ar_payment_plans(buyer_tenant_id);
CREATE INDEX IF NOT EXISTS idx_ar_plans_status ON ar_payment_plans(status);
CREATE INDEX IF NOT EXISTS idx_ar_plans_debtor_org ON ar_payment_plans(debtor_org_id);
CREATE INDEX IF NOT EXISTS idx_ar_plans_trust_status ON ar_payment_plans(trust_status);

CREATE TABLE IF NOT EXISTS ar_plan_installments (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL REFERENCES ar_payment_plans(id) ON DELETE CASCADE,
    payment_link_id TEXT,
    installment_number INTEGER NOT NULL,
    amount REAL NOT NULL,
    due_date TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    paid_at TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ar_installments_plan ON ar_plan_installments(plan_id);
CREATE INDEX IF NOT EXISTS idx_ar_installments_status ON ar_plan_installments(status);

CREATE TABLE IF NOT EXISTS ar_ap_workflow_transactions (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL DEFAULT 'ar_collection',
  source_plan_id TEXT,
  source_payment_link_id TEXT NOT NULL,
  ap_invoice_id TEXT,
  payer_tenant_id TEXT NOT NULL,
  collector_tenant_id TEXT NOT NULL,
  supplier_id TEXT,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending_payment',
  workflow_stage TEXT NOT NULL DEFAULT 'issued',
  trust_status TEXT NOT NULL DEFAULT 'pending',
  required_action TEXT,
  required_actor_tenant_id TEXT,
  required_actor_role TEXT,
  required_proof_type TEXT,
  proof_request_id TEXT,
  proof_response_id TEXT,
  consent_timestamp TEXT,
  last_action_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ar_ap_workflow_source_link
  ON ar_ap_workflow_transactions(source_payment_link_id);
CREATE INDEX IF NOT EXISTS idx_ar_ap_workflow_payer
  ON ar_ap_workflow_transactions(payer_tenant_id);
CREATE INDEX IF NOT EXISTS idx_ar_ap_workflow_collector
  ON ar_ap_workflow_transactions(collector_tenant_id);
CREATE INDEX IF NOT EXISTS idx_ar_ap_workflow_required_actor
  ON ar_ap_workflow_transactions(required_actor_tenant_id);
CREATE INDEX IF NOT EXISTS idx_ar_ap_workflow_stage
  ON ar_ap_workflow_transactions(workflow_stage);

CREATE TABLE IF NOT EXISTS ar_ap_workflow_actions (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES ar_ap_workflow_transactions(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  stage_from TEXT,
  stage_to TEXT,
  actor_tenant_id TEXT,
  actor_role TEXT,
  proof_request_id TEXT,
  proof_response_id TEXT,
  consent_timestamp TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ar_ap_actions_transaction
  ON ar_ap_workflow_actions(transaction_id);
CREATE INDEX IF NOT EXISTS idx_ar_ap_actions_type
  ON ar_ap_workflow_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_ar_ap_actions_actor
  ON ar_ap_workflow_actions(actor_tenant_id);
