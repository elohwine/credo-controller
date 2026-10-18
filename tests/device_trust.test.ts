/**
 * Device trust is a second signature, not a replacement for the platform card.
 * An organisation that has not turned it on is unchanged. A missing, replayed,
 * or revoked phone signature cannot release money.
 */

import 'reflect-metadata'
import { generateKeyPairSync, sign as signRaw } from 'crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from '@jest/globals'

import { DatabaseManager } from '../src/persistence/DatabaseManager'
import { deviceTrustService } from '../src/services/DeviceTrustService'
import { requireDeviceTrust } from '../src/services/deviceAssertion'
import { getOrCreateOrgProofVcPolicy, updateOrgProofVcPolicy } from '../src/services/ProofVcPolicyService'
import { StatusException } from '../src/errors/StatusException'

import { initTestDatabases, seedOrganization, type TestDatabases } from './utils/orgReadinessFixture'

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

  test('an enrolled phone signature is accepted once and refused on replay', () => {
    const org = seedOrganization()
    updateOrgProofVcPolicy(org.orgTenantId, { deviceTrust: { enabled: true, requiredActions: ['release_funds'] } })
    const keys = keyPair()
    const device = deviceTrustService.enroll({
      walletTenantId,
      publicJwk: publicJwk(keys),
      attestation,
      platform: 'android',
    })
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

  test('a revoked phone cannot release money', () => {
    const org = seedOrganization()
    updateOrgProofVcPolicy(org.orgTenantId, { deviceTrust: { enabled: true, requiredActions: ['release_funds'] } })
    const keys = keyPair()
    const device = deviceTrustService.enroll({
      walletTenantId,
      publicJwk: publicJwk(keys),
      attestation,
      platform: 'android',
    })
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

  test('a software key is not enrolled', () => {
    const keys = keyPair()
    expect(() =>
      deviceTrustService.enroll({
        walletTenantId,
        publicJwk: publicJwk(keys),
        attestation: { ...attestation, hardwareBacked: false, securityLevel: 'Software' },
        platform: 'android',
      }),
    ).toThrow(/hardware-backed/)
  })
})
