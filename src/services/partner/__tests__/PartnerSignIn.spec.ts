import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals'
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'

import { DatabaseManager } from '../../../persistence/DatabaseManager'
import { authenticateConnectedSystem } from '../../connected/ConnectedRecordService'

class FakePresentation {}

const createAuthorizationRequest = jest.fn<(...args: any[]) => Promise<any>>()
const getVerificationSessionById = jest.fn<(...args: any[]) => Promise<any>>()
const getVerifiedAuthorizationResponse = jest.fn<(...args: any[]) => Promise<any>>()
const logAction = jest.fn<(...args: any[]) => Promise<void>>()

jest.unstable_mockModule('@credo-ts/core', () => ({ W3cJwtVerifiablePresentation: FakePresentation }))
jest.unstable_mockModule('../../ssi/StageProofService', () => ({
  shouldUseUnsignedLocalOid4vpRequest: () => true,
  stageProofService: {
    getOrCreateDidForAgent: async () => ({ didUrl: 'did:key:zRoot#1' }),
    getOrCreateVerifierForAgent: async () => ({ verifierId: 'verifier-1', signerDidUrl: 'did:key:zRoot#1' }),
  },
  verifierModuleOf: () => ({
    createAuthorizationRequest,
    getVerificationSessionById,
    getVerifiedAuthorizationResponse,
  }),
}))
jest.unstable_mockModule('../../AuditService', () => ({ auditService: { logAction } }))
jest.unstable_mockModule('../../SSIAuthService', () => {
  class PlatformIdentityError extends Error {
    public constructor(
      public readonly code: string,
      message: string,
    ) {
      super(message)
    }
  }
  return { PlatformIdentityError, SSIAuthService: class {} }
})

type ClientModule = typeof import('../PartnerClientService')
type VerificationModule = typeof import('../PartnerVerificationService')
type AuthModule = typeof import('../../SSIAuthService')
let clientModule: ClientModule
let PartnerVerificationService: VerificationModule['PartnerVerificationService']
let PlatformIdentityError: AuthModule['PlatformIdentityError']

const ORG = 'org-tenant-1'
const OTHER_ORG = 'org-tenant-2'
const BINDING = 'login-challenge-abcdefghijklmnop'

function basic(clientId: string, secret: string) {
  return `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`
}

describe('Partner sign-in', () => {
  let db: Database.Database
  const hydra = {
    createClient: jest.fn<(...args: any[]) => Promise<void>>(),
    patchClient: jest.fn<(...args: any[]) => Promise<void>>(),
    deleteClient: jest.fn<(...args: any[]) => Promise<void>>(),
  }
  let clients: InstanceType<ClientModule['PartnerClientService']>

  beforeAll(async () => {
    clientModule = await import('../PartnerClientService')
    ;({ PartnerVerificationService } = await import('../PartnerVerificationService'))
    ;({ PlatformIdentityError } = await import('../../SSIAuthService'))
    db = new Database(':memory:')
    db.exec(fs.readFileSync(path.join(process.cwd(), 'migrations/122_partner_clients.sql'), 'utf8'))
    db.exec(
      `CREATE TABLE org_memberships (user_id TEXT, org_tenant_id TEXT, role TEXT, status TEXT);
       INSERT INTO org_memberships VALUES ('user-member', '${ORG}', 'admin', 'active');
       INSERT INTO org_memberships VALUES ('user-left', '${ORG}', 'clerk', 'removed');`,
    )
    ;(DatabaseManager as any).instance = db
    clients = new clientModule.PartnerClientService(hydra as any)
  })

  afterAll(() => {
    ;(DatabaseManager as any).instance = undefined
  })

  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.PARTNER_BRIDGE_API_KEY
  })

  describe('client registry', () => {
    it('rejects insecure redirect URIs and unknown claims', async () => {
      await expect(
        clients.create(ORG, 'u', { name: 'Shop', redirectUris: ['http://shop.example/cb'] }),
      ).rejects.toThrow(/https/)
      await expect(
        clients.create(ORG, 'u', { name: 'Shop', redirectUris: ['https://shop.example/cb#x'] }),
      ).rejects.toThrow(/fragment/)
      await expect(
        clients.create(ORG, 'u', {
          name: 'Shop',
          redirectUris: ['https://shop.example/cb'],
          releaseClaims: ['tenantId'],
        }),
      ).rejects.toThrow(/cannot be released: tenantId/)
      expect(hydra.createClient).not.toHaveBeenCalled()
    })

    it('creates a client, returns the secret once and stores only its hash', async () => {
      const created = await clients.create(ORG, 'user-member', {
        name: 'Shop',
        redirectUris: ['https://shop.example/cb', 'http://localhost:3000/cb'],
      })
      expect(created.clientId).toMatch(/^cred_[0-9a-f]{32}$/)
      expect(created.clientSecret).toMatch(/^cs_/)
      expect(created.policy).toEqual({
        releaseClaims: ['displayName', 'verificationLevel'],
        audience: 'any',
        operations: ['sign_in'],
        recipientScope: 'org_members',
      })
      expect(hydra.createClient).toHaveBeenCalledWith(
        expect.objectContaining({ clientId: created.clientId, clientSecret: created.clientSecret, orgTenantId: ORG }),
      )
      const row = db.prepare('SELECT * FROM partner_clients WHERE client_id = ?').get(created.clientId) as any
      expect(row.secret_hash).not.toContain(created.clientSecret)
      expect(JSON.stringify(clients.list(ORG))).not.toContain(created.clientSecret)
      expect(JSON.stringify(clients.list(ORG))).not.toContain(row.subject_salt)
      expect(clients.authenticate(created.clientId, created.clientSecret)?.clientId).toBe(created.clientId)
      expect(clients.authenticate(created.clientId, 'cs_wrong')).toBeUndefined()
    })

    it('does not keep a local client when Hydra refuses it', async () => {
      hydra.createClient.mockRejectedValueOnce(new Error('hydra down'))
      const before = clients.list(ORG).length
      await expect(clients.create(ORG, 'u', { name: 'Shop', redirectUris: ['https://a.example/cb'] })).rejects.toThrow(
        'hydra down',
      )
      expect(clients.list(ORG)).toHaveLength(before)
    })

    it('rotates the secret so the old one stops working', async () => {
      const created = await clients.create(ORG, 'u', { name: 'Rotate', redirectUris: ['https://r.example/cb'] })
      const rotated = await clients.rotateSecret(ORG, created.clientId)
      expect(hydra.patchClient).toHaveBeenCalledWith(created.clientId, [
        { op: 'replace', path: '/client_secret', value: rotated.clientSecret },
      ])
      expect(clients.authenticate(created.clientId, created.clientSecret)).toBeUndefined()
      expect(clients.authenticate(created.clientId, rotated.clientSecret)).toBeDefined()
    })

    it('keeps clients inside their organisation', async () => {
      const created = await clients.create(ORG, 'u', { name: 'Mine', redirectUris: ['https://m.example/cb'] })
      await expect(clients.rotateSecret(OTHER_ORG, created.clientId)).rejects.toThrow('not found')
      await expect(clients.revoke(OTHER_ORG, created.clientId, 'x')).rejects.toThrow('not found')
      expect(clients.list(OTHER_ORG)).toHaveLength(0)
    })

    it('revokes locally even when Hydra cannot be reached', async () => {
      const created = await clients.create(ORG, 'u', { name: 'Gone', redirectUris: ['https://g.example/cb'] })
      hydra.deleteClient.mockRejectedValueOnce(new Error('hydra down'))
      const result = await clients.revoke(ORG, created.clientId, 'user-member')
      expect(result.hydraRemoved).toBe(false)
      expect(result.client.status).toBe('revoked')
      expect(clients.authenticate(created.clientId, created.clientSecret)).toBeUndefined()
      expect(authenticateConnectedSystem(basic(created.clientId, created.clientSecret))).toBeUndefined()
      await expect(clients.rotateSecret(ORG, created.clientId)).rejects.toThrow('revoked')
    })
  })

  describe('verification sessions', () => {
    let client: any
    let secret: string
    const identity = {
      user: { id: 'user-member', did: 'did:key:zHolder' },
      tenantId: 'wallet-1',
      holderDid: 'did:key:zHolder',
      claims: {
        displayName: 'Tanaka',
        verificationLevel: 'phone_verified',
        phone: '+263770000000',
        tenantId: 'wallet-1',
      },
    }
    const verifiedPlatformIdentity = jest.fn<(...args: any[]) => Promise<any>>()
    const service = () => new PartnerVerificationService({} as any, { verifiedPlatformIdentity } as any)

    let counter = 0
    async function openSession(binding = BINDING) {
      counter += 1
      createAuthorizationRequest.mockResolvedValueOnce({
        authorizationRequest: `openid4vp://authorize?client_id=did%3Adid%3Akey%3AzRoot&request_uri=${encodeURIComponent(`https://api.example/req/${counter}`)}&request_uri_method=get`,
        verificationSession: { id: `vs-${counter}`, authorizationRequestUri: `https://api.example/req/${counter}` },
      })
      return service().start(client, binding)
    }

    function walletAnswered() {
      getVerificationSessionById.mockResolvedValue({ state: 'ResponseVerified' })
      getVerifiedAuthorizationResponse.mockResolvedValue({
        presentationExchange: { presentations: [new FakePresentation()] },
      })
    }

    beforeAll(async () => {
      const created = await clients.create(ORG, 'u', { name: 'Acme Shop', redirectUris: ['https://acme.example/cb'] })
      secret = created.clientSecret
      client = clients.findActive(created.clientId)
    })

    beforeEach(() => {
      verifiedPlatformIdentity.mockReset()
      verifiedPlatformIdentity.mockResolvedValue(identity)
      getVerificationSessionById.mockReset()
      getVerifiedAuthorizationResponse.mockReset()
    })

    it('authenticates partners by client secret, and the bridge only with a strong configured key', () => {
      const auth = PartnerVerificationService.authenticateCaller
      expect(auth({ authorization: basic(client.clientId, secret) })?.clientId).toBe(client.clientId)
      expect(auth({ authorization: basic(client.clientId, 'cs_nope') })).toBeUndefined()
      expect(auth({ 'x-bridge-key': 'anything', 'x-partner-client-id': client.clientId })).toBeUndefined()
      process.env.PARTNER_BRIDGE_API_KEY = 'short'
      expect(auth({ 'x-bridge-key': 'short', 'x-partner-client-id': client.clientId })).toBeUndefined()
      process.env.PARTNER_BRIDGE_API_KEY = 'b'.repeat(40)
      expect(auth({ 'x-bridge-key': 'b'.repeat(40), 'x-partner-client-id': client.clientId })?.clientId).toBe(
        client.clientId,
      )
      expect(auth({ 'x-bridge-key': 'c'.repeat(40), 'x-partner-client-id': client.clientId })).toBeUndefined()
    })

    it('requires an unguessable binding ref and names the partner in the request', async () => {
      await expect(service().start(client, 'short')).rejects.toThrow('bindingRef')
      await expect(service().start(client, 'x'.repeat(4097))).rejects.toThrow('bindingRef')
      const started = await openSession()
      expect(started.authorizationRequest).toBe(
        `openid4vp://authorize?client_id=did%3Adid%3Akey%3AzRoot&request_uri=${encodeURIComponent(`https://api.example/req/${counter}`)}&request_uri_method=get`,
      )
      const definition = createAuthorizationRequest.mock.calls.at(-1)?.[0]?.presentationExchange.definition
      expect(definition.input_descriptors[0].purpose).toBe('Sign in to Acme Shop')
      // Real Hydra v2 login challenges are ~1.5k characters.
      await expect(openSession('h'.repeat(1600))).resolves.toHaveProperty('verificationId')
    })

    it('stays pending until the wallet answers', async () => {
      const started = await openSession()
      getVerificationSessionById.mockResolvedValue({ state: 'RequestUriRetrieved' })
      await expect(service().result(client, started.verificationId, BINDING)).resolves.toMatchObject({
        status: 'pending',
      })
    })

    it('fails explicitly if the SDK does not provide the complete authorization request', async () => {
      createAuthorizationRequest.mockResolvedValueOnce({
        verificationSession: { id: 'missing-request', authorizationRequestUri: 'https://api.example/request' },
      })
      await expect(service().start(client, BINDING)).rejects.toMatchObject({ status: 500 })
      expect(
        db
          .prepare('SELECT verification_id FROM partner_verification_sessions WHERE verification_id = ?')
          .get('missing-request'),
      ).toBeUndefined()
    })

    it('releases a pairwise subject and only the allowed claims, exactly once', async () => {
      const started = await openSession()
      walletAnswered()
      const result = await service().result(client, started.verificationId, BINDING)
      expect(result).toMatchObject({ status: 'verified', reasonCode: 'verified' })
      if (result.status !== 'verified') throw new Error('expected verified')
      expect(result.claims).toEqual({ displayName: 'Tanaka', verificationLevel: 'phone_verified' })
      expect(result.subject).toBe(PartnerVerificationService.pairwiseSubject(client.subjectSalt, 'user-member'))
      expect(JSON.stringify(result)).not.toContain('did:key')
      await expect(service().result(client, started.verificationId, BINDING)).rejects.toThrow('already been read')
      expect(logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: ORG,
          actionType: 'partner_verification',
          resourceId: started.verificationId,
        }),
      )
    })

    it('gives the same person a different subject at every client', async () => {
      const other = await clients.create(ORG, 'u', { name: 'Other', redirectUris: ['https://o.example/cb'] })
      const otherRecord = clients.findActive(other.clientId)!
      expect(PartnerVerificationService.pairwiseSubject(otherRecord.subjectSalt, 'user-member')).not.toBe(
        PartnerVerificationService.pairwiseSubject(client.subjectSalt, 'user-member'),
      )
    })

    it('treats a wrong binding ref or another client as an unknown session', async () => {
      const started = await openSession()
      walletAnswered()
      await expect(service().result(client, started.verificationId, `${BINDING}-x`)).rejects.toThrow('Unknown')
      const intruder = await clients.create(OTHER_ORG, 'u', {
        name: 'Intruder',
        redirectUris: ['https://i.example/cb'],
      })
      await expect(
        service().result(clients.findActive(intruder.clientId)!, started.verificationId, BINDING),
      ).rejects.toThrow('Unknown')
      // The rightful caller can still read it.
      await expect(service().result(client, started.verificationId, BINDING)).resolves.toMatchObject({
        status: 'verified',
      })
    })

    it('refuses an expired session', async () => {
      const started = await openSession()
      db.prepare('UPDATE partner_verification_sessions SET expires_at = ? WHERE verification_id = ?').run(
        new Date(Date.now() - 1000).toISOString(),
        started.verificationId,
      )
      walletAnswered()
      await expect(service().result(client, started.verificationId, BINDING)).rejects.toThrow('expired')
    })

    it('reports a revoked or untrusted credential with its reason, once', async () => {
      const started = await openSession()
      walletAnswered()
      verifiedPlatformIdentity.mockRejectedValue(new PlatformIdentityError('credential_inactive', 'not active'))
      await expect(service().result(client, started.verificationId, BINDING)).resolves.toEqual({
        status: 'failed',
        reasonCode: 'credential_inactive',
      })
      await expect(service().result(client, started.verificationId, BINDING)).rejects.toThrow('already been read')
    })

    it('reports a wallet response the verifier rejected', async () => {
      const started = await openSession()
      getVerificationSessionById.mockResolvedValue({ state: 'Error' })
      await expect(service().result(client, started.verificationId, BINDING)).resolves.toEqual({
        status: 'failed',
        reasonCode: 'wallet_response_rejected',
      })
    })

    it('limits org-member clients to active members and releases their role', async () => {
      const internal = await clients.create(ORG, 'u', {
        name: 'Intranet',
        redirectUris: ['https://intranet.example/cb'],
        audience: 'org_members',
        releaseClaims: ['displayName'],
      })
      const record = clients.findActive(internal.clientId)!
      const member = await (async () => {
        createAuthorizationRequest.mockResolvedValueOnce({
          authorizationRequest: 'openid4vp://?request=member',
          verificationSession: { id: 'vs-member' },
        })
        return service().start(record, BINDING)
      })()
      walletAnswered()
      await expect(service().result(record, member.verificationId, BINDING)).resolves.toMatchObject({
        status: 'verified',
        claims: { displayName: 'Tanaka', org_role: 'admin' },
      })

      createAuthorizationRequest.mockResolvedValueOnce({
        authorizationRequest: 'openid4vp://?request=former',
        verificationSession: { id: 'vs-former' },
      })
      const former = await service().start(record, BINDING)
      verifiedPlatformIdentity.mockResolvedValue({ ...identity, user: { id: 'user-left', did: 'did:key:zLeft' } })
      await expect(service().result(record, former.verificationId, BINDING)).resolves.toEqual({
        status: 'failed',
        reasonCode: 'not_org_member',
      })
    })
  })
})
