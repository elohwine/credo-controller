/**
 * Device trust is a second signature, not a replacement for the platform card.
 * An organisation that has not turned it on is unchanged. A missing, replayed,
 * or revoked phone signature cannot release money.
 */

import 'reflect-metadata'
import { generateKeyPairSync, sign as signRaw } from 'crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals'

import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { StatusException } from '../src/errors/StatusException'

import { initTestDatabases, seedOrganization, type TestDatabases } from './utils/orgReadinessFixture'

// Only the Android certificate-chain check is stubbed (no real phone in CI); the rest is real.
let stubAttestation = true
const realAttestation = await import('../src/services/AndroidKeyAttestation')
jest.unstable_mockModule('../src/services/AndroidKeyAttestation', () => ({
  ...realAttestation,
  verifyAndroidKeyAttestation: async (input: Parameters<typeof realAttestation.verifyAndroidKeyAttestation>[0]) =>
    stubAttestation ? undefined : realAttestation.verifyAndroidKeyAttestation(input),
}))
const { deviceTrustService } = await import('../src/services/DeviceTrustService')
const { requireDeviceTrust } = await import('../src/services/deviceAssertion')
const { getOrCreateOrgProofVcPolicy, updateOrgProofVcPolicy } = await import('../src/services/ProofVcPolicyService')

let databases: TestDatabases
const walletTenantId = 'wallet-device-trust'

function keyPair() {
  return generateKeyPairSync('ec', { namedCurve: 'P-256' })
}

function publicJwk(keys: ReturnType<typeof keyPair>): Record<string, unknown> {
  return keys.publicKey.export({ format: 'jwk' }) as Record<string, unknown>
}

const attestation = {
  hardwareBacked: true,
  userAuthenticationRequired: true,
  securityLevel: 'TrustedEnvironment',
  purposes: ['sign'],
}

function signedAssertion(keys: ReturnType<typeof keyPair>, deviceKeyId: string, purpose: string, nonce: string) {
  const signedAt = new Date().toISOString()
  const payload = JSON.stringify({
    aud: 'credentis',
    nonce,
    purpose,
    signedAt,
    transaction: { requisitionId: 'req-1', amount: 10, currency: 'USD' },
    walletTenantId,
  })
  const signature = signRaw('sha256', Buffer.from(payload), keys.privateKey).toString('base64url')
  return { deviceKeyId, nonce, purpose, signedAt, signature }
}

beforeAll(() => {
  databases = initTestDatabases('device-trust-')
  process.env.SSI_LOGIN_AUDIENCE = ''
  process.env.PUBLIC_BASE_URL = ''
})

afterAll(() => databases.cleanup())

afterEach(() => {
  stubAttestation = true
})

/** Enroll a payment key. Only the Android certificate chain check is stubbed; everything else is real. */
async function enrollPhone(keys: ReturnType<typeof keyPair>) {
  const { nonce } = deviceTrustService.createEnrollmentChallenge(walletTenantId)
  return deviceTrustService.enroll({
    walletTenantId,
    publicJwk: publicJwk(keys),
    attestation,
    platform: 'android',
    enrollmentChallenge: nonce,
    usage: 'payment',
  })
}

beforeEach(() => {
  const db = DatabaseManager.getDatabase()
  db.prepare('DELETE FROM device_assertions').run()
  db.prepare('DELETE FROM device_keys').run()
  db.prepare('DELETE FROM ssi_login_challenges').run()
  db.prepare('DELETE FROM org_proof_vc_policies').run()
})

describe('phone confirmation for money steps', () => {
  test('an organisation that has not turned it on keeps the current path', () => {
    const org = seedOrganization()
    expect(getOrCreateOrgProofVcPolicy(org.orgTenantId).deviceTrust.enabled).toBe(false)
    expect(() =>
      requireDeviceTrust({
        request: { user: {} } as any,
        orgTenantId: org.orgTenantId,
        stageAction: 'release_funds',
        body: {},
      }),
    ).not.toThrow()
  })

  test('a browser is refused once the organisation requires the phone', () => {
    const org = seedOrganization()
    updateOrgProofVcPolicy(org.orgTenantId, { deviceTrust: { enabled: true, requiredActions: ['release_funds'] } })
    expect(() =>
      requireDeviceTrust({
        request: { user: {} } as any,
        orgTenantId: org.orgTenantId,
        stageAction: 'release_funds',
        body: {},
        walletTenantId,
      }),
    ).toThrow(StatusException)
  })

  test('an enrolled phone signature is accepted once and refused on replay', async () => {
    const org = seedOrganization()
    updateOrgProofVcPolicy(org.orgTenantId, { deviceTrust: { enabled: true, requiredActions: ['release_funds'] } })
    const keys = keyPair()
    const device = await enrollPhone(keys)
    const challenge = deviceTrustService.createChallenge(walletTenantId)
    const assertion = signedAssertion(keys, device.id, 'release_funds', challenge.nonce)
    expect(() =>
      requireDeviceTrust({
        request: { user: {} } as any,
        orgTenantId: org.orgTenantId,
        stageAction: 'release_funds',
        body: { deviceAssertion: assertion },
        walletTenantId,
        transaction: { requisitionId: 'req-1', amount: 10, currency: 'USD' },
      }),
    ).not.toThrow()
    const replay = deviceTrustService.createChallenge(walletTenantId)
    expect(() =>
      requireDeviceTrust({
        request: { user: {} } as any,
        orgTenantId: org.orgTenantId,
        stageAction: 'release_funds',
        body: { deviceAssertion: { ...assertion, nonce: replay.nonce } },
        walletTenantId,
        transaction: { requisitionId: 'req-1', amount: 10, currency: 'USD' },
      }),
    ).toThrow(/could not be verified|already been used/)
  })

  test('a revoked phone cannot release money', async () => {
    const org = seedOrganization()
    updateOrgProofVcPolicy(org.orgTenantId, { deviceTrust: { enabled: true, requiredActions: ['release_funds'] } })
    const keys = keyPair()
    const device = await enrollPhone(keys)
    deviceTrustService.revoke(walletTenantId, device.id)
    const challenge = deviceTrustService.createChallenge(walletTenantId)
    expect(() =>
      requireDeviceTrust({
        request: { user: {} } as any,
        orgTenantId: org.orgTenantId,
        stageAction: 'release_funds',
        body: { deviceAssertion: signedAssertion(keys, device.id, 'release_funds', challenge.nonce) },
        walletTenantId,
        transaction: { requisitionId: 'req-1', amount: 10, currency: 'USD' },
      }),
    ).toThrow(/revoked/)
  })

  test('a key without Android hardware attestation is not enrolled', async () => {
    stubAttestation = false
    const keys = keyPair()
    const { nonce } = deviceTrustService.createEnrollmentChallenge(walletTenantId)
    await expect(
      deviceTrustService.enroll({
        walletTenantId,
        publicJwk: publicJwk(keys),
        attestation: { ...attestation, hardwareBacked: false, securityLevel: 'Software' },
        platform: 'android',
        enrollmentChallenge: nonce,
        usage: 'payment',
      }),
    ).rejects.toThrow(/attestation certificates are required/)
  })
})
