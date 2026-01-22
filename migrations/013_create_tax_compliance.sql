-- Tax Compliance table for NSSA/PAYE/AIDS_LEVY filing records
CREATE TABLE IF NOT EXISTS tax_compliance (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    tax_type TEXT NOT NULL, -- NSSA, PAYE, AIDS_LEVY, ZIMRA
    period TEXT NOT NULL, -- Format: YYYY-MM
    amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    filing_date TEXT, -- Date filed with authority
    reference_number TEXT, -- Authority reference number
    status TEXT NOT NULL DEFAULT 'pending', -- pending, filed, confirmed, rejected
    related_payroll_run_id TEXT,
    compliance_vc_id TEXT, -- ID of the issued TaxComplianceVC
    proof_of_payment_ref TEXT, -- EcoCash or bank transfer reference
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(related_payroll_run_id) REFERENCES payroll_runs(id)
);

CREATE INDEX IF NOT EXISTS idx_tax_compliance_tenant ON tax_compliance(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tax_compliance_period ON tax_compliance(period);
CREATE INDEX IF NOT EXISTS idx_tax_compliance_type ON tax_compliance(tax_type);
CREATE INDEX IF NOT EXISTS idx_tax_compliance_status ON tax_compliance(status);

-- Add new columns to payroll_runs for statutory totals
-- SQLite doesn't support ADD COLUMN IF NOT EXISTS, so we use a safe approach
ALTER TABLE payroll_runs ADD COLUMN total_nssa REAL DEFAULT 0;
ALTER TABLE payroll_runs ADD COLUMN total_paye REAL DEFAULT 0;
ALTER TABLE payroll_runs ADD COLUMN total_aids_levy REAL DEFAULT 0;
ALTER TABLE payroll_runs ADD COLUMN run_vc_id TEXT;
