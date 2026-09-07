import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'

import { DatabaseManager } from '../../persistence/DatabaseManager'
import { AuthorizationPolicyService } from '../AuthorizationPolicyService'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER, name TEXT, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  authz_adapter_type TEXT DEFAULT 'in-process',
  external_authz_endpoint TEXT,
  external_authz_token_ref TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS authority_policies (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, name TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0', policy_rules_json TEXT,
  status TEXT NOT NULL DEFAULT 'active', effective_from DATETIME, effective_until DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organization_id, name, version)
);
CREATE TABLE IF NOT EXISTS policy_versions (
  id TEXT PRIMARY KEY, authority_policy_id TEXT NOT NULL,
  version_number INTEGER NOT NULL, policy_rules_json TEXT,
  deployment_status TEXT NOT NULL DEFAULT 'draft',
  deployed_at DATETIME, rolled_back_at DATETIME, deployed_by_person_id TEXT,
  rollback_reason TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(authority_policy_id, version_number)
);
`

function initDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(SCHEMA)
  ;(DatabaseManager as any).instance = db
  return db
}

describe('AuthorizationPolicyService', () => {
  let db: Database.Database
  let service: AuthorizationPolicyService
  let organizationId: string

  beforeEach(() => {
    db = initDb()
    organizationId = randomUUID()
    db.prepare(`INSERT INTO organizations (id, tenant_id, name) VALUES (?, ?, 'Test Org')`).run(
      organizationId,
      `tenant-${organizationId}`,
    )
    service = new AuthorizationPolicyService()
  })

  afterEach(() => {
    ;(DatabaseManager as any).instance = null
    try {
      db.close()
    } catch {
      /* ignore */
    }
  })

  // ── Policy lifecycle ────────────────────────────────────────────────────────

  it('creates a policy draft and returns version 1', () => {
    const draft = service.createPolicyDraft(organizationId, 'finance.approve', [
      { condition: "role == 'finance.approver'", action: 'allow' },
    ])
    expect(draft.versionNumber).toBe(1)
    expect(draft.status).toBe('draft')
    expect(draft.rules).toHaveLength(1)
  })

  it('increments version number on each new draft', () => {
    service.createPolicyDraft(organizationId, 'finance.approve', [])
    const v2 = service.createPolicyDraft(organizationId, 'finance.approve', [])
    expect(v2.versionNumber).toBe(2)
  })

  it('stages a draft version', () => {
    const draft = service.createPolicyDraft(organizationId, 'finance.approve', [])
    const staged = service.stagePolicyVersion(draft.id)
    expect(staged?.status).toBe('staged')
  })

  it('deploys a staged version and archives previous active', () => {
    const v1 = service.createPolicyDraft(organizationId, 'finance.approve', [])
    service.deployPolicyVersion(v1.id, 'person-admin')
    const v2 = service.createPolicyDraft(organizationId, 'finance.approve', [])
    service.deployPolicyVersion(v2.id, 'person-admin')

    const active = service.getActivePolicy(organizationId, 'finance.approve')
    expect(active?.versionNumber).toBe(2)

    // v1 should be archived
    const all = service.listPolicyVersions(organizationId, 'finance.approve')
    const v1Row = all.find((v) => v.versionNumber === 1)
    expect(v1Row?.status).toBe('archived')
  })

  it('returns null when no active policy exists', () => {
    const result = service.getActivePolicy(organizationId, 'nonexistent.policy')
    expect(result).toBeNull()
  })

  // ── Rollback ────────────────────────────────────────────────────────────────

  it('rolls back to a previous version', () => {
    const v1 = service.createPolicyDraft(organizationId, 'hr.approve', [])
    service.deployPolicyVersion(v1.id, 'person-admin')
    const v2 = service.createPolicyDraft(organizationId, 'hr.approve', [])
    service.deployPolicyVersion(v2.id, 'person-admin')

    // Roll back to v1
    service.rollbackPolicyVersion(v1.id, 'regression detected')

    const active = service.getActivePolicy(organizationId, 'hr.approve')
    expect(active?.versionNumber).toBe(1)
  })

  // ── External authz config ───────────────────────────────────────────────────

  it('returns in-process as default authz adapter type', () => {
    const config = service.getExternalAuthzConfig(organizationId)
    expect(config?.type).toBe('in-process')
    expect(config?.endpoint).toBeUndefined()
  })

  it('configures an external AuthZEN endpoint', () => {
    service.configureExternalAuthz(organizationId, 'https://authz.example.com/access/v1/evaluations', 'token-ref-xyz')

    const config = service.getExternalAuthzConfig(organizationId)
    expect(config?.type).toBe('external_authzen')
    expect(config?.endpoint).toBe('https://authz.example.com/access/v1/evaluations')
    expect(config?.tokenRef).toBe('token-ref-xyz')
  })

  // ── Version listing ─────────────────────────────────────────────────────────

  it('lists all versions ordered by version_number desc', () => {
    const v1 = service.createPolicyDraft(organizationId, 'procurement.approve', [])
    const v2 = service.createPolicyDraft(organizationId, 'procurement.approve', [])
    const v3 = service.createPolicyDraft(organizationId, 'procurement.approve', [])
    service.deployPolicyVersion(v3.id, 'person-admin')

    const all = service.listPolicyVersions(organizationId, 'procurement.approve')
    expect(all).toHaveLength(3)
    expect(all[0].versionNumber).toBe(3)
    expect(all[2].versionNumber).toBe(1)
    void v1
    void v2
  })
})
