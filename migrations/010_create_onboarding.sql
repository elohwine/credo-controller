-- Onboarding Requests
CREATE TABLE IF NOT EXISTS onboarding_requests (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    candidate_email TEXT NOT NULL,
    candidate_phone TEXT,
    full_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft', -- draft, invited, in_progress, review, approved, rejected, completed
    current_step TEXT NOT NULL DEFAULT 'init', -- init, personal_details, documents, contract, complete
    access_token TEXT, -- For candidate portal access (or wa.me deep link)
    employee_id TEXT, -- Linked when approved
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_onboarding_tenant_status ON onboarding_requests(tenant_id, status);

-- Onboarding Data (Form responses)
CREATE TABLE IF NOT EXISTS onboarding_data (
    request_id TEXT PRIMARY KEY,
    personal_info TEXT DEFAULT '{}', -- JSON: { dob, address, nok_name, nok_phone }
    bank_details TEXT DEFAULT '{}', -- JSON: { bank_name, account, ecocash_number }
    documents TEXT DEFAULT '{}', -- JSON: { id_front: "doc_uuid", passport: "doc_uuid" }
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(request_id) REFERENCES onboarding_requests(id)
);

-- Contract Templates
CREATE TABLE IF NOT EXISTS contract_templates (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    name TEXT NOT NULL,
    content TEXT NOT NULL, -- Markdown/HTML content with {{placeholders}}
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
