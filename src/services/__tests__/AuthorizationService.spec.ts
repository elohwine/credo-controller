import Database from 'better-sqlite3'

import { DatabaseManager } from '../../persistence/DatabaseManager'
import { AuthorizationService } from '../AuthorizationService'

/* Minimal schema subset required by AuthorizationService */
const SCHEMA = `
  CREATE TABLE organizations (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL
  );
  CREATE TABLE people (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    subject_ref TEXT NOT NULL,
    status TEXT NOT NULL
  );
  CREATE TABLE organization_memberships (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    person_id TEXT NOT NULL,
    membership_status TEXT NOT NULL
  );
  CREATE TABLE org_memberships (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    org_tenant_id TEXT NOT NULL,
    role TEXT NOT NULL,
    status TEXT NOT NULL
  );
  CREATE TABLE authority_grants (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    person_id TEXT NOT NULL,
    authority_type TEXT NOT NULL,
    scope_json TEXT NOT NULL DEFAULT '{}',
    source_credential_ref TEXT,
    valid_from DATETIME,
    valid_until DATETIME,
    status TEXT NOT NULL DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE delegations (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    delegator_person_id TEXT NOT NULL,
    delegate_person_id TEXT NOT NULL,
    scope_json TEXT NOT NULL DEFAULT '{}',
    source_credential_ref TEXT,
    valid_from DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_until DATETIME,
    status TEXT NOT NULL DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE policy_decisions (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    principal_person_id TEXT,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    decision TEXT NOT NULL,
    reason_code TEXT,
    authority_ref TEXT,
    credential_refs_json TEXT NOT NULL DEFAULT '[]',
    policy_version TEXT,
    decided_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`

function seed(db: Database.Database) {
  db.prepare("INSERT INTO organizations VALUES ('org-1','tenant-1','Org','active')").run()
  db.prepare("INSERT INTO people VALUES ('person-1','org-1','sub:user1','active')").run()
  db.prepare("INSERT INTO organization_memberships VALUES ('mem-1','org-1','person-1','active')").run()
  db.prepare("INSERT INTO org_memberships VALUES ('org-mem-1','sub:user1','tenant-1','owner','active')").run()
  db.prepare(
    `
    INSERT INTO authority_grants (id, organization_id, person_id, authority_type, scope_json, status)
    VALUES ('grant-1','org-1','person-1','explicit',
      '{"permissions":["finance.approve"],"maxAmount":5000,"requiredCredentials":[{"credentialType":"EmployeeCredential","trustedIssuer":true,"statusMustBeValid":true}]}',
      'active')
  `,
  ).run()
}

describe('AuthorizationService – SSI evidence conditions', () => {
  let db: Database.Database
  let spy: jest.SpyInstance
  let svc: AuthorizationService

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(SCHEMA)
    seed(db)
    spy = jest.spyOn(DatabaseManager, 'getDatabase').mockReturnValue(db as any)
    svc = new AuthorizationService()
  })

  afterEach(() => {
    spy.mockRestore()
    db.close()
  })

  it('allows when SSI evidence satisfies all credential conditions', () => {
    const result = svc.decide({
      tenantId: 'tenant-1',
      personId: 'person-1',
      action: 'finance.approve',
      resourceType: 'request',
      amount: 3000,
      ssiEvidence: [
        {
          credentialType: 'EmployeeCredential',
          issuerRef: 'did:web:hr.example',
          status: 'valid',
          isTrustedIssuer: true,
          credentialReferenceId: 'ref-1',
        },
      ],
    })

    expect(result.decision).toBe('allow')
    expect(result.reasonCode).toBe('authority_scope_match')
    expect(result.credentialReferences).toContain('ref-1')
  })

  it('denies when required credential type is missing from evidence', () => {
    const result = svc.decide({
      tenantId: 'tenant-1',
      personId: 'person-1',
      action: 'finance.approve',
      resourceType: 'request',
      amount: 3000,
      ssiEvidence: [],
    })

    expect(result.decision).toBe('deny')
    expect(result.reasonCode).toBe('required_credential_missing')
  })

  it('denies when credential status is not valid', () => {
    const result = svc.decide({
      tenantId: 'tenant-1',
      personId: 'person-1',
      action: 'finance.approve',
      resourceType: 'request',
      amount: 3000,
      ssiEvidence: [
        {
          credentialType: 'EmployeeCredential',
          issuerRef: 'did:web:hr.example',
          status: 'revoked',
          isTrustedIssuer: true,
          credentialReferenceId: 'ref-1',
        },
      ],
    })

    expect(result.decision).toBe('deny')
    expect(result.reasonCode).toBe('credential_status_not_valid')
  })

  it('denies when issuer is not trusted', () => {
    const result = svc.decide({
      tenantId: 'tenant-1',
      personId: 'person-1',
      action: 'finance.approve',
      resourceType: 'request',
      amount: 3000,
      ssiEvidence: [
        {
          credentialType: 'EmployeeCredential',
          issuerRef: 'did:web:unknown-issuer.example',
          status: 'valid',
          isTrustedIssuer: false,
          credentialReferenceId: 'ref-1',
        },
      ],
    })

    expect(result.decision).toBe('deny')
    expect(result.reasonCode).toBe('credential_issuer_not_trusted')
  })

  it('denies when amount exceeds authority limit regardless of valid SSI evidence', () => {
    const result = svc.decide({
      tenantId: 'tenant-1',
      personId: 'person-1',
      action: 'finance.approve',
      resourceType: 'request',
      amount: 9999,
      ssiEvidence: [
        {
          credentialType: 'EmployeeCredential',
          issuerRef: 'did:web:hr.example',
          status: 'valid',
          isTrustedIssuer: true,
          credentialReferenceId: 'ref-1',
        },
      ],
    })

    expect(result.decision).toBe('deny')
    expect(result.reasonCode).toBe('no_matching_authority')
  })

  it('allows request actions for active org owners without explicit authority grants', () => {
    const result = svc.decide({
      tenantId: 'tenant-1',
      personId: 'person-1',
      action: 'request.execute',
      resourceType: 'request',
      resourceId: 'request-1',
    })

    expect(result.decision).toBe('allow')
    expect(result.reasonCode).toBe('org_role_permission_match')
  })
})
