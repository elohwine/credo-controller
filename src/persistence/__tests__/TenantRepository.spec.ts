import fs from 'fs'
import os from 'os'
import path from 'path'

import { getTenantById, initTenantStore, removeTenant, upsertTenant } from '../TenantRepository'

describe('TenantRepository', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tenant-repo-'))
  const dbPath = path.join(tempDir, 'tenants.db')

  beforeAll(() => {
    initTenantStore(dbPath)
  })

  afterAll(() => {
    removeTenant('tenant-test')
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('upserts tenant records with metadata payloads', () => {
    const now = new Date().toISOString()

    upsertTenant({
      id: 'tenant-test',
      label: 'Tenant Test',
      status: 'ACTIVE',
      createdAt: now,
      issuerDid: 'did:key:issuer',
      issuerKid: 'did:key:issuer#key-1',
      verifierDid: 'did:key:verifier',
      verifierKid: 'did:key:verifier#key-1',
      askarProfile: 'tenant-test-profile',
      metadata: {
        issuer: { credential_endpoint: 'https://issuer.example.com/oidc/token' },
        verifier: { presentation_endpoint: 'https://verifier.example.com/oidc/verifier/verify' },
      },
    })

    const stored = getTenantById('tenant-test')
    expect(stored).not.toBeNull()
    expect(stored).toMatchObject({
      id: 'tenant-test',
      label: 'Tenant Test',
      status: 'ACTIVE',
      createdAt: now,
      issuerDid: 'did:key:issuer',
      issuerKid: 'did:key:issuer#key-1',
      verifierDid: 'did:key:verifier',
      verifierKid: 'did:key:verifier#key-1',
      askarProfile: 'tenant-test-profile',
    })
    expect(stored?.metadata).toEqual({
      issuer: { credential_endpoint: 'https://issuer.example.com/oidc/token' },
      verifier: { presentation_endpoint: 'https://verifier.example.com/oidc/verifier/verify' },
    })
  })
})
