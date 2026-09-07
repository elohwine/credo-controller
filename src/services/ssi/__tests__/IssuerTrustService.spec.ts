import Database from 'better-sqlite3'

import { DatabaseManager } from '../../../persistence/DatabaseManager'
import { issuerTrustService } from '../IssuerTrustService'

describe('IssuerTrustService', () => {
  let db: Database.Database
  let getDatabaseSpy: jest.SpyInstance

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE organizations (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL
      );

      CREATE TABLE trust_anchors (
        id TEXT PRIMARY KEY,
        organization_id TEXT,
        anchor_type TEXT NOT NULL,
        subject_ref TEXT NOT NULL,
        policy_ref TEXT,
        status TEXT NOT NULL,
        valid_from DATETIME,
        valid_until DATETIME
      );

      CREATE TABLE verifier_registrations (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        verifier_ref TEXT NOT NULL,
        trust_anchor_id TEXT,
        purpose_policy_ref TEXT,
        status TEXT NOT NULL
      );
    `)

    getDatabaseSpy = jest.spyOn(DatabaseManager, 'getDatabase').mockReturnValue(db as any)
  })

  afterEach(() => {
    getDatabaseSpy.mockRestore()
    db.close()
  })

  it('returns trusted when all issuers match active anchors for the tenant organization', () => {
    db.prepare('INSERT INTO organizations (id, tenant_id, name, status) VALUES (?, ?, ?, ?)').run(
      'org-1',
      'tenant-1',
      'Org One',
      'active',
    )

    db.prepare(
      'INSERT INTO trust_anchors (id, organization_id, anchor_type, subject_ref, status) VALUES (?, ?, ?, ?, ?)',
    ).run('anchor-1', 'org-1', 'did', 'did:web:issuer.example', 'active')

    const result = issuerTrustService.evaluate({
      tenantId: 'tenant-1',
      issuerRefs: ['did:web:issuer.example'],
    })

    expect(result).toEqual({
      decision: 'trusted',
      trustedIssuerRefs: ['did:web:issuer.example'],
      untrustedIssuerRefs: [],
    })
  })

  it('enforces verifier trust_anchor_id binding when configured', () => {
    db.prepare('INSERT INTO organizations (id, tenant_id, name, status) VALUES (?, ?, ?, ?)').run(
      'org-1',
      'tenant-1',
      'Org One',
      'active',
    )

    db.prepare(
      'INSERT INTO trust_anchors (id, organization_id, anchor_type, subject_ref, status) VALUES (?, ?, ?, ?, ?)',
    ).run('anchor-allowed', 'org-1', 'did', 'did:web:issuer.allowed', 'active')
    db.prepare(
      'INSERT INTO trust_anchors (id, organization_id, anchor_type, subject_ref, status) VALUES (?, ?, ?, ?, ?)',
    ).run('anchor-other', 'org-1', 'did', 'did:web:issuer.other', 'active')

    db.prepare(
      'INSERT INTO verifier_registrations (id, organization_id, verifier_ref, trust_anchor_id, status) VALUES (?, ?, ?, ?, ?)',
    ).run('verifier-1', 'org-1', 'finance-verifier', 'anchor-allowed', 'active')

    const result = issuerTrustService.evaluate({
      tenantId: 'tenant-1',
      verifierRef: 'finance-verifier',
      issuerRefs: ['did:web:issuer.allowed', 'did:web:issuer.other'],
    })

    expect(result).toEqual({
      decision: 'untrusted',
      trustedIssuerRefs: ['did:web:issuer.allowed'],
      untrustedIssuerRefs: ['did:web:issuer.other'],
    })
  })

  it('enforces verifier purpose_policy_ref against trust anchor policy_ref', () => {
    db.prepare('INSERT INTO organizations (id, tenant_id, name, status) VALUES (?, ?, ?, ?)').run(
      'org-1',
      'tenant-1',
      'Org One',
      'active',
    )

    db.prepare(
      'INSERT INTO trust_anchors (id, organization_id, anchor_type, subject_ref, policy_ref, status) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('anchor-policy-a', 'org-1', 'did', 'did:web:issuer.a', 'policy:finance-v1', 'active')

    db.prepare(
      'INSERT INTO verifier_registrations (id, organization_id, verifier_ref, purpose_policy_ref, status) VALUES (?, ?, ?, ?, ?)',
    ).run('verifier-1', 'org-1', 'finance-verifier', 'policy:finance-v2', 'active')

    const result = issuerTrustService.evaluate({
      tenantId: 'tenant-1',
      verifierRef: 'finance-verifier',
      issuerRefs: ['did:web:issuer.a'],
    })

    expect(result).toEqual({
      decision: 'untrusted',
      trustedIssuerRefs: [],
      untrustedIssuerRefs: ['did:web:issuer.a'],
    })
  })
})
