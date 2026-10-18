/**
 * Wallet sign-in (PlatformIdentityCredential presentation) must fail closed. Signatures are
 * Credo's job; these tests drive everything the platform decides around them.
 */

import 'reflect-metadata'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals'
import { W3cJwtVerifiablePresentation } from '@credo-ts/core'
import { randomUUID } from 'crypto'

import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { SSIAuthService } from '../src/services/SSIAuthService'
import { credentialLifecycleService } from '../src/services/ssi/CredentialLifecycleService'
import { statusListAllocatorService } from '../src/services/ssi/StatusListAllocatorService'

import { initTestDatabases, type TestDatabases } from './utils/orgReadinessFixture'

const PLATFORM = 'did:key:z6MkPlatformIssuer'
const HOLDER = 'did:key:z6MkHolderWallet'
const AUDIENCE = 'https://credentis.example'

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
const jwt = (header: Record<string, unknown>, payload: Record<string, unknown>) => `${b64(header)}.${b64(payload)}.c2ln`

function identityCard(opts: { issuer?: string; subject?: string; tenantId?: string; jti?: string } = {}) {
  const issuer = opts.issuer ?? PLATFORM
  const subject = opts.subject ?? HOLDER
  return jwt(
    { alg: 'EdDSA', typ: 'JWT', kid: `${issuer}#key-1` },
    {
      iss: issuer,
      sub: subject,
      jti: opts.jti ?? `urn:uuid:${randomUUID()}`,
      nbf: Math.floor(Date.now() / 1000) - 60,
      vc: {
        '@context': ['https://www.w3.org/2018/credentials/v1'],
        type: ['VerifiableCredential', 'PlatformIdentityCredential'],
        credentialSubject: { id: subject, tenantId: opts.tenantId ?? tenantId },
      },
    },
  )
}

function presentation(opts: { signer?: string; card?: string; nonce?: string } = {}) {
  const signer = opts.signer ?? HOLDER
  return jwt(
    { alg: 'EdDSA', typ: 'JWT', kid: `${signer}#key-1` },
    {
      iss: signer,
      aud: AUDIENCE,
      nonce: opts.nonce ?? 'n',
      vp: {
        '@context': ['https://www.w3.org/2018/credentials/v1'],
        type: ['VerifiablePresentation'],
        verifiableCredential: [opts.card ?? identityCard()],
      },
    },
  )
}

let databases: TestDatabases
let tenantId: string
let verifyPresentation: jest.Mock<(input: any) => Promise<any>>
let ownsDid: boolean
let service: SSIAuthService

const challenge = (minutes = 5) => {
  const nonce = randomUUID()
  DatabaseManager.getDatabase()
    .prepare('INSERT INTO ssi_login_challenges (nonce, expires_at, created_at) VALUES (?, ?, ?)')
    .run(nonce, new Date(Date.now() + minutes * 60_000).toISOString(), new Date().toISOString())
  return nonce
}

const refusal = async (attempt: Promise<unknown>) => {
  try {
    await attempt
  } catch (error: any) {
    return error.code || error.message
  }
  throw new Error('sign-in was accepted')
}

beforeAll(() => {
  databases = initTestDatabases('credo-vc-login-')
  process.env.PLATFORM_IDENTITY_ISSUER_DIDS = PLATFORM
  process.env.SSI_LOGIN_AUDIENCE = AUDIENCE
  process.env.JWT_SECRET = 'test-only-secret'
})

afterAll(() => {
  delete process.env.PLATFORM_IDENTITY_ISSUER_DIDS
  delete process.env.SSI_LOGIN_AUDIENCE
  delete process.env.JWT_SECRET
  databases.cleanup()
})

beforeEach(() => {
  tenantId = `wallet-${randomUUID()}`
  DatabaseManager.getDatabase()
    .prepare('INSERT INTO ssi_users (id, tenant_id, did) VALUES (?, ?, ?)')
    .run(randomUUID(), tenantId, 'did:key:z6MkRegisteredElsewhere')
  ownsDid = true
  verifyPresentation = jest.fn<(input: any) => Promise<any>>().mockResolvedValue({
    isValid: true,
    validations: { presentationSignature: { isValid: true } },
  })
  const agent = {
    w3cCredentials: { verifyPresentation },
    modules: {
      tenants: {
        getTenantAgent: async () => ({
          dids: { getCreatedDids: async ({ did }: { did: string }) => (ownsDid && did === HOLDER ? [{ did }] : []) },
          endSession: async () => {},
        }),
      },
    },
    genericRecords: { findAllByQuery: async () => [] },
  }
  service = new SSIAuthService(agent as any)
  jest.spyOn(credentialLifecycleService, 'isIssuedHere').mockReturnValue(true)
  jest.spyOn(credentialLifecycleService, 'revocationOf').mockReturnValue({ revoked: false })
  jest.spyOn(statusListAllocatorService, 'getStatusByCredentialRef').mockReturnValue('valid')
})

afterEach(() => jest.restoreAllMocks())

describe('wallet sign-in fails closed', () => {
  test('a valid identity card from the wallet that holds it signs in', async () => {
    const nonce = challenge()
    const session = await service.loginWithVC({ vpJwt: presentation({ nonce }), nonce })
    expect(session.tenantId).toBe(tenantId)
    expect(session.token.split('.')).toHaveLength(3)
    // Credo is asked to check the signature against this exact nonce and audience.
    expect(verifyPresentation.mock.calls[0][0]).toMatchObject({ challenge: nonce, domain: AUDIENCE })
  })

  test('an unknown nonce is refused before anything is verified', async () => {
    expect(await refusal(service.loginWithVC({ vpJwt: presentation(), nonce: 'never-issued' }))).toMatch(/challenge/)
    expect(verifyPresentation).not.toHaveBeenCalled()
  })

  test('an expired nonce is refused', async () => {
    const nonce = challenge(-1)
    expect(await refusal(service.loginWithVC({ vpJwt: presentation({ nonce }), nonce }))).toMatch(/challenge/)
  })

  test('a nonce works once: replaying the same sign-in is refused', async () => {
    const nonce = challenge()
    const vpJwt = presentation({ nonce })
    await service.loginWithVC({ vpJwt, nonce })
    expect(await refusal(service.loginWithVC({ vpJwt, nonce }))).toMatch(/challenge/)
  })

  test('a presentation Credo rejects (signature, nonce or audience) is refused', async () => {
    verifyPresentation.mockResolvedValueOnce({ isValid: false, validations: {} })
    const nonce = challenge()
    expect(await refusal(service.loginWithVC({ vpJwt: presentation({ nonce }), nonce }))).toMatch(/verification failed/)
  })

  test('a presentation whose own signature failed has no holder', async () => {
    verifyPresentation.mockResolvedValueOnce({
      isValid: true,
      validations: { presentationSignature: { isValid: false } },
    })
    const nonce = challenge()
    expect(await refusal(service.loginWithVC({ vpJwt: presentation({ nonce }), nonce }))).toBe('holder_binding_failed')
  })

  test("someone presenting another person's card is refused", async () => {
    const nonce = challenge()
    const stolen = presentation({ nonce, signer: 'did:key:z6MkThief' })
    expect(await refusal(service.loginWithVC({ vpJwt: stolen, nonce }))).toBe('holder_binding_failed')
  })

  test('a card from any issuer but the platform is refused', async () => {
    const nonce = challenge()
    const forged = presentation({ nonce, card: identityCard({ issuer: 'did:key:z6MkForger' }) })
    expect(await refusal(service.loginWithVC({ vpJwt: forged, nonce }))).toBe('issuer_untrusted')
  })

  test('a card the platform has no record of issuing is refused', async () => {
    jest.spyOn(credentialLifecycleService, 'isIssuedHere').mockReturnValue(false)
    const nonce = challenge()
    expect(await refusal(service.loginWithVC({ vpJwt: presentation({ nonce }), nonce }))).toBe(
      'credential_unrecognised',
    )
  })

  test('a revoked or suspended card is refused', async () => {
    jest.spyOn(credentialLifecycleService, 'revocationOf').mockReturnValueOnce({ revoked: true, reason: 'replaced' })
    let nonce = challenge()
    expect(await refusal(service.loginWithVC({ vpJwt: presentation({ nonce }), nonce }))).toBe('credential_inactive')

    jest.spyOn(statusListAllocatorService, 'getStatusByCredentialRef').mockReturnValueOnce('suspended')
    nonce = challenge()
    expect(await refusal(service.loginWithVC({ vpJwt: presentation({ nonce }), nonce }))).toBe('credential_inactive')
  })

  test("a valid card naming someone else's account is refused", async () => {
    ownsDid = false
    const nonce = challenge()
    expect(await refusal(service.loginWithVC({ vpJwt: presentation({ nonce }), nonce }))).toBe(
      'presenter_not_account_holder',
    )
  })

  test('a card for an account that does not exist is refused', async () => {
    const nonce = challenge()
    const orphan = presentation({ nonce, card: identityCard({ tenantId: 'wallet-gone' }) })
    expect(await refusal(service.loginWithVC({ vpJwt: orphan, nonce }))).toBe('account_not_found')
  })

  test('a presentation without an identity card is refused', async () => {
    const vp = W3cJwtVerifiablePresentation.fromSerializedJwt(presentation())
    ;(vp.presentation as any).verifiableCredential = []
    expect(await refusal(service.verifiedPlatformIdentity(vp))).toBe('identity_credential_missing')
  })

  test('garbage is refused, and still uses up the nonce', async () => {
    const nonce = challenge()
    expect(await refusal(service.loginWithVC({ vpJwt: 'not-a-jwt', nonce }))).toMatch(/format/)
    expect(await refusal(service.loginWithVC({ vpJwt: presentation({ nonce }), nonce }))).toMatch(/challenge/)
  })
})
