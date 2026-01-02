-- Employees table
CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    did TEXT, -- Employee's DID for receiving PayslipVCs
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    base_salary REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    nssa_number TEXT, -- National Social Security Authority number
    tin TEXT, -- Taxpayer Identification Number
    status TEXT NOT NULL DEFAULT 'active', -- active, terminated, on_leave
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_employees_tenant ON employees(tenant_id);
CREATE INDEX IF NOT EXISTS idx_employees_did ON employees(did);

-- Payroll Runs (Batch processing)
CREATE TABLE IF NOT EXISTS payroll_runs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    period TEXT NOT NULL, -- Format: YYYY-MM
    status TEXT NOT NULL DEFAULT 'draft', -- draft, processing, completed, paid
    total_gross REAL NOT NULL DEFAULT 0,
    total_net REAL NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payroll_tenant_period ON payroll_runs(tenant_id, period);

-- Payslip entries (Individual records per run)
CREATE TABLE IF NOT EXISTS payslips (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    period TEXT NOT NULL,
    gross_amount REAL NOT NULL,
    deductions TEXT NOT NULL DEFAULT '{}', -- JSON: { nssa: 10, paye: 50, medical: 20 }
    net_amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    payslip_vc_id TEXT, -- ID of the issued VC
    status TEXT NOT NULL DEFAULT 'pending', -- pending, issued, revocable
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(run_id) REFERENCES payroll_runs(id),
    FOREIGN KEY(employee_id) REFERENCES employees(id)
);

CREATE INDEX IF NOT EXISTS idx_payslips_run ON payslips(run_id);
CREATE INDEX IF NOT EXISTS idx_payslips_employee ON payslips(employee_id);
