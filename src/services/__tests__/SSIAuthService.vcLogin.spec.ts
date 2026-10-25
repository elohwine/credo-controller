import 'reflect-metadata'
import type { W3cJwtVerifiableCredential } from '@credo-ts/core'

import { AskarModule } from '@credo-ts/askar'
import {
  Agent,
  ClaimFormat,
  DidsModule,
  KeyDidRegistrar,
  KeyDidResolver,
  W3cCredential,
  W3cCredentialsModule,
  W3cJwtVerifiablePresentation,
  W3cPresentation,
} from '@credo-ts/core'
import { agentDependencies } from '@credo-ts/node'
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { askarNodeJS } from '@openwallet-foundation/askar-nodejs'
import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'

import { DatabaseManager } from '../../persistence/DatabaseManager'

const issued = new Map<string, { revoked: boolean }>()
const statuses = new Map<string, 'valid' | 'revoked' | 'suspended'>()

jest.unstable_mockModule('../ssi/CredentialLifecycleService', () => ({
  credentialLifecycleService: {
    isIssuedHere: (id: string) => issued.has(id),
    revocationOf: (id: string) => ({ revoked: Boolean(issued.get(id)?.revoked) }),
  },
}))
jest.unstable_mockModule('../ssi/StatusListAllocatorService', () => ({
  statusListAllocatorService: { getStatusByCredentialRef: (id: string) => statuses.get(id) },
}))

const AUDIENCE = 'https://credentis.test'
const TENANT_ID = 'tenant-holder-1'

async function makeAgent(name: string) {
  const agent = new Agent({
    config: { label: name } as any,
    dependencies: agentDependencies,
    modules: {
      askar: new AskarModule({
        askar: askarNodeJS,
        store: { id: `${name}-${randomUUID()}`, key: name, database: { type: 'sqlite', config: { inMemory: true } } },
      }),
      dids: new DidsModule({ registrars: [new KeyDidRegistrar()], resolvers: [new KeyDidResolver()] }),
      w3cCredentials: new W3cCredentialsModule({}),
    },
  } as any)
  await agent.initialize()
  const result = await agent.dids.create({
    method: 'key',
    options: { createKey: { type: { kty: 'OKP', crv: 'Ed25519' } } },
  } as any)
  const did = result.didState.did as string
  const verificationMethod = result.didState.didDocument!.verificationMethod![0].id
  return { agent, did, verificationMethod }
}

type Party = Awaited<ReturnType<typeof makeAgent>>

async function issueIdentity(issuer: Party, subjectDid: string, id = `urn:uuid:${randomUUID()}`) {
  const credential = new W3cCredential({
    id,
    context: ['https://www.w3.org/2018/credentials/v1'],
    type: ['VerifiableCredential', 'PlatformIdentityCredential'],
    issuer: issuer.did,
    issuanceDate: new Date().toISOString(),
    credentialSubject: { id: subjectDid, claims: { tenantId: TENANT_ID, displayName: 'Tendai' } } as any,
  })
  const signed = (await issuer.agent.w3cCredentials.signCredential({
    format: ClaimFormat.JwtVc,
    credential,
    verificationMethod: issuer.verificationMethod,
    alg: 'EdDSA',
  } as any)) as W3cJwtVerifiableCredential
  return { signed, id }
}

async function present(holder: Party, vc: W3cJwtVerifiableCredential, nonce: string, domain = AUDIENCE) {
  const presentation = new W3cPresentation({
    context: ['https://www.w3.org/2018/credentials/v1'],
    type: ['VerifiablePresentation'],
    holder: holder.did,
    verifiableCredential: [vc],
  })
  const vp = await holder.agent.w3cCredentials.signPresentation({
    format: ClaimFormat.JwtVp,
    presentation,
    challenge: nonce,
    domain,
    verificationMethod: holder.verificationMethod,
    alg: 'EdDSA',
  } as any)
  return (vp as any).serializedJwt as string
}

describe('SSIAuthService.loginWithVC', () => {
  let platform: Party
  let holder: Party
  let attacker: Party
  let service: any
  let db: Database.Database

  beforeAll(async () => {
    process.env.SSI_LOGIN_AUDIENCE = AUDIENCE
    process.env.JWT_SECRET = 'test-secret'
    platform = await makeAgent('platform')
    holder = await makeAgent('holder')
    attacker = await makeAgent('attacker')
    process.env.PLATFORM_IDENTITY_ISSUER_DIDS = platform.did

    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE ssi_users (id TEXT PRIMARY KEY, tenant_id TEXT UNIQUE, did TEXT, last_login_at TEXT, session_version INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE ssi_login_challenges (nonce TEXT PRIMARY KEY, tenant_id TEXT, expires_at TEXT, created_at TEXT);
      CREATE TABLE device_keys (id TEXT PRIMARY KEY, wallet_tenant_id TEXT, revoked_at TEXT, verified_at TEXT, key_usage TEXT, created_at TEXT, auth_policy TEXT DEFAULT 'strong_or_device_credential');
      CREATE TABLE device_login_approvals (verification_id TEXT PRIMARY KEY, wallet_tenant_id TEXT, device_key_id TEXT, policy_hash TEXT, approved_at TEXT);
    `)
    db.prepare('INSERT INTO ssi_users (id, tenant_id, did) VALUES (?, ?, ?)').run('user-1', TENANT_ID, holder.did)
    ;(DatabaseManager as any).instance = db
    const { SSIAuthService } = await import('../SSIAuthService')
    service = new SSIAuthService(platform.agent)
  })

  afterAll(async () => {
    for (const party of [platform, holder, attacker]) await party?.agent.shutdown()
    ;(DatabaseManager as any).instance = undefined
    delete process.env.PLATFORM_IDENTITY_ISSUER_DIDS
    delete process.env.SSI_LOGIN_AUDIENCE
  })

  beforeEach(() => {
    issued.clear()
    statuses.clear()
    db.exec('DELETE FROM device_login_approvals; DELETE FROM device_keys')
  })

  async function validCredential() {
    const vc = await issueIdentity(platform, holder.did)
    issued.set(vc.id, { revoked: false })
    statuses.set(vc.id, 'valid')
    return vc
  }

  it('returns the audience with the challenge', async () => {
    const challenge = await service.createLoginChallenge()
    expect(challenge.audience).toBe(AUDIENCE)
  })

  it('accepts an authentic, bound, active credential once', async () => {
    const { signed } = await validCredential()
    const { nonce } = await service.createLoginChallenge()
    const vpJwt = await present(holder, signed, nonce)
    const result = await service.loginWithVC({ vpJwt, nonce })
    expect(result.tenantId).toBe(TENANT_ID)
    expect(result.token).toBeTruthy()
    await expect(service.loginWithVC({ vpJwt, nonce })).rejects.toThrow(/challenge/)
  })

  it('rejects a presentation for another nonce', async () => {
    const { signed } = await validCredential()
    const { nonce } = await service.createLoginChallenge()
    const other = await service.createLoginChallenge()
    const vpJwt = await present(holder, signed, other.nonce)
    await expect(service.loginWithVC({ vpJwt, nonce })).rejects.toThrow(/verification failed/)
  })

  it('rejects a presentation addressed to another audience', async () => {
    const { signed } = await validCredential()
    const { nonce } = await service.createLoginChallenge()
    const vpJwt = await present(holder, signed, nonce, 'https://other-verifier.test')
    await expect(service.loginWithVC({ vpJwt, nonce })).rejects.toThrow(/verification failed/)
  })

  it('rejects a copied credential presented by someone else', async () => {
    const { signed } = await validCredential()
    const { nonce } = await service.createLoginChallenge()
    const vpJwt = await present(attacker, signed, nonce)
    await expect(service.loginWithVC({ vpJwt, nonce })).rejects.toThrow()
  })

  it('rejects a self-issued credential from an untrusted issuer', async () => {
    const forged = await issueIdentity(attacker, holder.did)
    issued.set(forged.id, { revoked: false })
    const { nonce } = await service.createLoginChallenge()
    const vpJwt = await present(holder, forged.signed, nonce)
    await expect(service.loginWithVC({ vpJwt, nonce })).rejects.toThrow(/Untrusted/)
  })

  it('rejects a tampered presentation', async () => {
    const { signed } = await validCredential()
    const { nonce } = await service.createLoginChallenge()
    const [header, payload, signature] = (await present(holder, signed, nonce)).split('.')
    const altered = JSON.parse(Buffer.from(payload, 'base64url').toString())
    altered.vp.holder = attacker.did
    const vpJwt = [header, Buffer.from(JSON.stringify(altered)).toString('base64url'), signature].join('.')
    await expect(service.loginWithVC({ vpJwt, nonce })).rejects.toThrow()
  })

  it('rejects a credential the platform has no issuance record for', async () => {
    const { signed } = await issueIdentity(platform, holder.did)
    const { nonce } = await service.createLoginChallenge()
    const vpJwt = await present(holder, signed, nonce)
    await expect(service.loginWithVC({ vpJwt, nonce })).rejects.toThrow(/not recognised/)
  })

  it.each(['revoked', 'suspended'] as const)('rejects a %s credential', async (status) => {
    const { signed, id } = await validCredential()
    statuses.set(id, status)
    const { nonce } = await service.createLoginChallenge()
    const vpJwt = await present(holder, signed, nonce)
    await expect(service.loginWithVC({ vpJwt, nonce })).rejects.toThrow(/not active/)
  })

  it('rejects an expired challenge', async () => {
    const { signed } = await validCredential()
    const nonce = randomUUID()
    db.prepare('INSERT INTO ssi_login_challenges (nonce, expires_at, created_at) VALUES (?, ?, ?)').run(
      nonce,
      new Date(Date.now() - 1000).toISOString(),
      new Date().toISOString(),
    )
    const vpJwt = await present(holder, signed, nonce)
    await expect(service.loginWithVC({ vpJwt, nonce })).rejects.toThrow(/challenge/)
  })

  describe('loginWithVerifiedPresentation (OpenID4VP wallet sign-in)', () => {
    it('signs in the bound holder of an active platform credential', async () => {
      const { signed } = await validCredential()
      const vp = W3cJwtVerifiablePresentation.fromSerializedJwt(await present(holder, signed, randomUUID()))
      db.prepare(
        'INSERT INTO device_keys (id,wallet_tenant_id,verified_at,key_usage,created_at) VALUES (?, ?, ?, ?, ?)',
      ).run('enrolled-device', TENANT_ID, 'verified', 'login', new Date().toISOString())
      db.prepare('INSERT INTO device_login_approvals VALUES (?, ?, ?, NULL, ?)').run(
        'web-session',
        TENANT_ID,
        'enrolled-device',
        new Date().toISOString(),
      )
      const result = await service.loginWithVerifiedPresentation(vp, 'web-session')
      expect(result.tenantId).toBe(TENANT_ID)
    })

    it('requires approval by a verified device even when the VC itself is valid', async () => {
      const { signed } = await validCredential()
      const vp = W3cJwtVerifiablePresentation.fromSerializedJwt(await present(holder, signed, randomUUID()))
      await expect(service.loginWithVerifiedPresentation(vp, 'not-approved')).rejects.toThrow('enrolled')
      await expect(service.loginWithVerifiedPresentation(vp)).rejects.toThrow('device-approved')
    })

    it('refuses a copied credential presented by someone else', async () => {
      const { signed } = await validCredential()
      const vp = W3cJwtVerifiablePresentation.fromSerializedJwt(await present(attacker, signed, randomUUID()))
      await expect(service.loginWithVerifiedPresentation(vp)).rejects.toThrow(/bound/)
    })

    it('refuses a revoked credential', async () => {
      const { signed, id } = await validCredential()
      issued.set(id, { revoked: true })
      const vp = W3cJwtVerifiablePresentation.fromSerializedJwt(await present(holder, signed, randomUUID()))
      await expect(service.loginWithVerifiedPresentation(vp)).rejects.toThrow(/not active/)
    })
  })
})
