-- Migration: 014_create_ai_agents.sql
-- Purpose: AI Agent Registry for ACK-ID compliance
-- Reference: https://www.agentcommercekit.com/ack-id

-- AI Agents table (ACK-ID aligned)
-- Stores agent DIDs with controller credentials linking to owners
CREATE TABLE IF NOT EXISTS ai_agents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  agent_did TEXT NOT NULL UNIQUE,
  owner_did TEXT NOT NULL,
  controller_credential_jwt TEXT NOT NULL,
  label TEXT NOT NULL,
  roles TEXT NOT NULL, -- JSON array of scopes
  status TEXT NOT NULL CHECK (status IN ('active', 'suspended', 'revoked')),
  metadata TEXT, -- JSON object
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

-- Indexes for agent lookups
CREATE INDEX IF NOT EXISTS idx_ai_agents_tenant ON ai_agents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_agents_owner ON ai_agents(owner_did);
CREATE INDEX IF NOT EXISTS idx_ai_agents_status ON ai_agents(status);
CREATE INDEX IF NOT EXISTS idx_ai_agents_did ON ai_agents(agent_did);

-- Delegation credentials table (ACK-ID extension)
-- Stores delegation VCs that grant scoped permissions to agents
CREATE TABLE IF NOT EXISTS ai_agent_delegations (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  delegation_credential_jwt TEXT NOT NULL,
  scopes TEXT NOT NULL, -- JSON array
  limits TEXT, -- JSON object with maxAmount, etc.
  valid_until TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (agent_id) REFERENCES ai_agents(id)
);

CREATE INDEX IF NOT EXISTS idx_ai_delegations_agent ON ai_agent_delegations(agent_id);
CREATE INDEX IF NOT EXISTS idx_ai_delegations_valid ON ai_agent_delegations(valid_until);

-- ACK-Pay payment records table
-- Tracks payment lifecycle for reconciliation and receipt issuance
CREATE TABLE IF NOT EXISTS ack_payments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  payment_request_token TEXT NOT NULL,
  payment_option_id TEXT NOT NULL,
  provider_ref TEXT, -- e.g., ecocashRef, mneeTxHash
  payer_did TEXT NOT NULL,
  merchant_did TEXT NOT NULL,
  amount INTEGER NOT NULL, -- stored in smallest unit (cents)
  currency TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('initiated', 'pending', 'paid', 'failed', 'refunded')),
  receipt_credential_id TEXT,
  idempotency_key TEXT UNIQUE, -- for deduplication
  metadata TEXT, -- JSON object
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

-- Indexes for payment lookups
CREATE INDEX IF NOT EXISTS idx_ack_payments_tenant ON ack_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ack_payments_provider ON ack_payments(provider_ref);
CREATE INDEX IF NOT EXISTS idx_ack_payments_state ON ack_payments(state);
CREATE INDEX IF NOT EXISTS idx_ack_payments_payer ON ack_payments(payer_did);
CREATE INDEX IF NOT EXISTS idx_ack_payments_idempotency ON ack_payments(idempotency_key);

-- Payment receipts table (links to issued credentials)
CREATE TABLE IF NOT EXISTS ack_payment_receipts (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL UNIQUE,
  credential_jwt TEXT NOT NULL,
  credential_id TEXT, -- if stored in Credo wallet
  status_list_index INTEGER,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (payment_id) REFERENCES ack_payments(id)
);

CREATE INDEX IF NOT EXISTS idx_ack_receipts_payment ON ack_payment_receipts(payment_id);
