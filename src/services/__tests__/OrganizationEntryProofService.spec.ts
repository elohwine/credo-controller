import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals'
import Database from 'better-sqlite3'
import { readFileSync } from 'fs'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import { DcqlQuery } from 'dcql'

const sessions = new Map<string, { state: string }>()
let number = 0
let role: string | undefined = 'admin'
let card = {
  types: ['VerifiableCredential', 'EmployeeCredential'],
  subject: { orgTenantId: 'org-1', userId: 'alice', role: 'admin', employmentStatus: 'active' },
  issuer: 'did:key:org-1',
  id: 'staff-1',
}
const createAuthorizationRequest = jest.fn(async () => {
  const id = `proof-${++number}`
  sessions.set(id, { state: 'RequestCreated' })
  return {
    verificationSession: { id },
    authorizationRequest: `openid4vp://authorize?request_uri=https://example.test/${id}`,
  }
})
const verifier = {
  createAuthorizationRequest,
  getVerificationSessionById: async (id: string) => sessions.get(id),
  getVerifiedAuthorizationResponse: jest.fn(async () => ({
    dcql: { presentations: { staff_card: [{ claimFormat: 'dc+sd-jwt', kbJwt: { header: {}, payload: {} } }] } },
  })),
}
const issued = { tenantId: 'org-1', revoked: false }
const status = jest.fn((): string | undefined => 'valid')
const organizations = {
  getUserOrgRole: () => role,
  generateOrgToken: jest.fn(async () => 'org-token'),
  listUserOrganizations: async () => (role ? [{ orgTenantId: 'org-1', role, name: 'Organisation One' }] : []),
  getOrganizationWorkflowConfiguration: () => ({ sector: 'general', workflowTypes: [] }),
}
jest.unstable_mockModule('../ssi/StageProofService', () => ({
  shouldUseUnsignedLocalOid4vpRequest: () => false,
  verifierModuleOf: () => verifier,
  stageProofService: {
    getOrCreateDidForAgent: async () => ({ didUrl: 'did:key:verifier#key' }),
    getOrCreateVerifierForAgent: async () => ({ verifierId: 'verifier', signerDidUrl: 'did:key:verifier#key' }),
  },
}))
jest.unstable_mockModule('../ActorCredentialProofService', () => ({ extractPresentedCredentials: () => [card] }))
jest.unstable_mockModule('../../persistence/TenantRepository', () => ({
  getTenantById: () => ({ issuerDid: 'did:key:org-1' }),
}))
jest.unstable_mockModule('../../persistence/IssuedCredentialRepository', () => ({
  IssuedCredentialRepository: class {
    findByCredentialId() {
      return issued
    }
  },
}))
jest.unstable_mockModule('../ssi/StatusListAllocatorService', () => ({
  statusListAllocatorService: { getStatusByCredentialRef: status },
}))
jest.unstable_mockModule('../ssi/CredentialLifecycleService', () => ({
  credentialLifecycleService: { isRevoked: () => false },
}))

describe('organisation entry proof', () => {
  let db: Database.Database
  let service: import('../OrganizationEntryProofService').OrganizationEntryProofService
  let query: typeof import('../OrganizationEntryProofService').organizationEntryQuery
  beforeAll(async () => {
    db = new Database(':memory:')
    db.exec(readFileSync('migrations/127_organization_entry_proofs.sql', 'utf8'))
    ;(DatabaseManager as unknown as { instance: Database.Database | undefined }).instance = db
    const module = await import('../OrganizationEntryProofService')
    service = new module.OrganizationEntryProofService({} as never, organizations as never)
    query = module.organizationEntryQuery
  })
  afterAll(() => {
    ;(DatabaseManager as unknown as { instance: Database.Database | undefined }).instance = undefined
    db.close()
  })
  beforeEach(() => {
    role = 'admin'
    card = {
      types: ['VerifiableCredential', 'EmployeeCredential'],
      subject: {
        orgTenantId: 'org-1',
        userId: 'alice',
        role: 'admin',
        employmentStatus: 'active',
      },
      issuer: 'did:key:org-1',
      id: 'staff-1',
    }
    issued.revoked = false
    issued.tenantId = 'org-1'
    status.mockReturnValue('valid')
    organizations.generateOrgToken.mockClear()
  })
  const start = () => service.start('alice', 'org-1', 'personal-token')
  const ready = async () => {
    const request = await start()
    sessions.set(request.loginId, { state: 'ResponseVerified' })
    return request
  }
  const poll = (request: { loginId: string; pollToken: string }) =>
    service.poll('alice', 'org-1', 'personal-token', request.loginId, request.pollToken)

  it('requests either bound SD-JWT or legacy staff evidence for the exact account/org', () => {
    const request = query('org-1', 'alice')
    expect(request.credentials.every((entry) => entry.require_cryptographic_holder_binding)).toBe(true)
    expect(request.credential_sets).toEqual([{ options: [['staff_card'], ['legacy_staff_card']], required: true }])
    expect(JSON.stringify(request)).toContain('alice')
    expect(JSON.stringify(request)).not.toContain('DelegationCredential')
  })
  it.each(['legacy', 'sd-jwt'])('matches %s using the actual installed DCQL query engine', (format) => {
    const claims = { orgTenantId: 'org-1', userId: 'alice', role: 'admin', employmentStatus: 'active' }
    const credential =
      format === 'legacy'
        ? {
            credential_format: 'jwt_vc_json',
            cryptographic_holder_binding: true,
            type: ['VerifiableCredential', 'EmployeeCredential'],
            claims: { credentialSubject: claims },
          }
        : { credential_format: 'vc+sd-jwt', cryptographic_holder_binding: true, vct: 'EmployeeCredential', claims }
    const result = DcqlQuery.query(DcqlQuery.parse(query('org-1', 'alice')), [credential])
    const queryId = format === 'legacy' ? 'legacy_staff_card' : 'staff_card'
    expect(result.credential_matches[queryId].success).toBe(true)
  })
  it('keeps an unanswered proof pending and hashes browser/session secrets', async () => {
    const request = await start()
    expect(await poll(request)).toMatchObject({ status: 'pending' })
    const row = db.prepare('SELECT * FROM organization_entry_proofs WHERE request_id = ?').get(request.loginId)
    expect(JSON.stringify(row)).not.toContain(request.pollToken)
    expect(JSON.stringify(row)).not.toContain('personal-token')
  })
  it('issues one scoped token for a verified active staff card, then rejects replay', async () => {
    const request = await ready()
    expect(await poll(request)).toMatchObject({ status: 'verified', token: 'org-token', orgRole: 'admin' })
    await expect(poll(request)).rejects.toMatchObject({ status: 410 })
    expect(organizations.generateOrgToken).toHaveBeenCalledTimes(1)
  })
  it.each(['owner', 'admin'])('uses current %s membership', async (currentRole) => {
    role = currentRole
    card.subject.role = currentRole
    expect(await poll(await ready())).toMatchObject({ orgRole: currentRole })
  })
  it('does not open the organisation for members who are not owners or admins', async () => {
    role = 'field_worker'
    await expect(start()).rejects.toMatchObject({ status: 403, code: 'org_context_admins_only' })
  })
  it('refuses an admin card marked tasks-only, and accepts one marked manage', async () => {
    ;(card.subject as Record<string, unknown>).orgAccess = 'tasks'
    await expect(poll(await ready())).rejects.toMatchObject({ status: 403, code: 'org_context_admins_only' })
    ;(card.subject as Record<string, unknown>).orgAccess = 'manage'
    expect(await poll(await ready())).toMatchObject({ status: 'verified', orgRole: 'admin' })
  })
  it('lets the wallet answer with the orgAccess claim or an older card without it', () => {
    const base = { orgTenantId: 'org-1', userId: 'alice', role: 'admin', employmentStatus: 'active' }
    const sd = (claims: Record<string, unknown>) => ({
      credential_format: 'vc+sd-jwt' as const,
      cryptographic_holder_binding: true,
      vct: 'EmployeeCredential',
      claims,
    })
    const parsed = DcqlQuery.parse(query('org-1', 'alice'))
    expect(DcqlQuery.query(parsed, [sd({ ...base, orgAccess: 'manage' }) as never]).credential_matches.staff_card.success).toBe(true)
    expect(DcqlQuery.query(parsed, [sd(base) as never]).credential_matches.staff_card.success).toBe(true)
  })
  it('binds collection to the initiating account, org, personal session and poll secret', async () => {
    const request = await ready()
    for (const [userId, orgId, token, secret] of [
      ['bob', 'org-1', 'personal-token', request.pollToken],
      ['alice', 'org-2', 'personal-token', request.pollToken],
      ['alice', 'org-1', 'other-session', request.pollToken],
      ['alice', 'org-1', 'personal-token', 'guess'],
    ]) {
      await expect(service.poll(userId, orgId, token, request.loginId, secret)).rejects.toMatchObject({ status: 404 })
    }
    expect(organizations.generateOrgToken).not.toHaveBeenCalled()
  })
  it.each(['issuer', 'org', 'account', 'role', 'removed', 'withdrawn', 'status', 'delegation'])(
    'rejects invalid %s evidence',
    async (reason) => {
      const request = await ready()
      if (reason === 'issuer') card.issuer = 'did:key:foreign'
      if (reason === 'org') card.subject.orgTenantId = 'org-2'
      if (reason === 'account') card.subject.userId = 'bob'
      if (reason === 'role') role = 'member'
      if (reason === 'removed') role = undefined
      if (reason === 'withdrawn') issued.revoked = true
      if (reason === 'status') status.mockReturnValue('revoked')
      if (reason === 'delegation') card.types = ['DelegationCredential']
      await expect(poll(request)).rejects.toMatchObject({ status: 403 })
      expect(organizations.generateOrgToken).not.toHaveBeenCalled()
      await expect(poll(request)).rejects.toMatchObject({ status: 410 })
    },
  )
  it('rejects expired and SDK-rejected presentations', async () => {
    const request = await start()
    db.prepare('UPDATE organization_entry_proofs SET expires_at = ? WHERE request_id = ?').run(
      '2000-01-01',
      request.loginId,
    )
    await expect(poll(request)).rejects.toMatchObject({ status: 410 })
    const rejected = await start()
    sessions.set(rejected.loginId, { state: 'Error' })
    await expect(poll(rejected)).rejects.toMatchObject({ status: 403 })
    expect(organizations.generateOrgToken).not.toHaveBeenCalled()
  })
  it('refuses a presentation without a key-binding proof', async () => {
    const request = await ready()
    verifier.getVerifiedAuthorizationResponse.mockResolvedValueOnce({
      dcql: { presentations: { staff_card: [{ claimFormat: 'dc+sd-jwt', kbJwt: undefined }] } },
    })
    await expect(poll(request)).rejects.toMatchObject({ status: 403 })
    expect(organizations.generateOrgToken).not.toHaveBeenCalled()
  })
})
