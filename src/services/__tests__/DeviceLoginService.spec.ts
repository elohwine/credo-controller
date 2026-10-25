import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { generateKeyPairSync, sign } from 'crypto'
import { readFileSync } from 'fs'
import type { Request } from 'express'
import Database from 'better-sqlite3'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import { assertPersonalSessionActive, requireDeviceLoginApproval } from '../PersonalSessionPolicy'

const attestation = jest.fn<() => Promise<void>>()
const present = jest.fn<() => Promise<void>>()
jest.unstable_mockModule('../AndroidKeyAttestation', () => ({ verifyAndroidKeyAttestation: attestation }))
jest.unstable_mockModule('../SSIAuthService', () => ({
  SSIAuthService: class {},
  loginAudience: () => 'https://credentis.test',
}))
jest.unstable_mockModule('../ssi/StageProofService', () => ({
  stageProofService: { presentFromEmbeddedWallet: present },
}))
jest.unstable_mockModule('../WalletLoginService', () => ({
  WalletLoginService: class {
    async start() {
      return {
        loginId: 'internal-verification',
        pollToken: 'poll-secret',
        authorizationRequest: 'openid4vp://internal',
      }
    }
    async poll() {
      requireDeviceLoginApproval('internal-verification', 'wallet-a')
      return { status: 'verified', token: 'device-session', tenantId: 'wallet-a' }
    }
  },
}))

const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const wrongKeys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const publicJwk = keys.publicKey.export({ format: 'jwk' })
const request = {} as Request
type Start = { challengeId: string; payload: string }
const signature = (challenge: Start) =>
  sign('sha256', Buffer.from(challenge.payload), keys.privateKey).toString('base64url')

describe('Verified device protocol', () => {
  let db: Database.Database
  let trust: (typeof import('../DeviceTrustService'))['deviceTrustService']
  let service: InstanceType<(typeof import('../DeviceLoginService'))['DeviceLoginService']>
  const sessionForTrustedDevice = jest.fn(async () => ({ token: 'renewed-session', tenantId: 'wallet-a' }))
  beforeAll(async () => {
    const { DeviceLoginService } = await import('../DeviceLoginService')
    ;({ deviceTrustService: trust } = await import('../DeviceTrustService'))
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE ssi_users (id TEXT PRIMARY KEY, tenant_id TEXT, did TEXT, pin_hash TEXT, updated_at TEXT);
      CREATE TABLE org_proof_vc_policies (id TEXT);
      CREATE TABLE ssi_login_challenges (nonce TEXT PRIMARY KEY, tenant_id TEXT, expires_at TEXT, created_at TEXT);
    `)
    for (const migration of [
      '120_wallet_login_sessions',
      '122_partner_clients',
      '128_device_trust',
      '139_verified_device_enrollment',
    ]) {
      db.exec(readFileSync(`migrations/${migration}.sql`, 'utf8'))
    }
    Object.defineProperty(DatabaseManager, 'instance', { value: db, writable: true, configurable: true })
    service = new DeviceLoginService(
      {} as never,
      { pinDigest: (pin: string) => `digest:${pin}`, sessionForTrustedDevice } as never,
    )
  })
  afterAll(() => {
    Object.defineProperty(DatabaseManager, 'instance', { value: undefined, writable: true, configurable: true })
    db.close()
  })
  beforeEach(() => {
    for (const table of [
      'device_keys',
      'device_login_challenges',
      'device_login_approvals',
      'device_enrollment_challenges',
      'wallet_login_sessions',
      'partner_verification_sessions',
      'ssi_users',
      'ssi_login_challenges',
      'device_assertions',
    ]) {
      db.prepare(`DELETE FROM ${table}`).run()
    }
    db.prepare('INSERT INTO ssi_users (id, tenant_id, pin_hash) VALUES (?, ?, ?)').run('user-a', 'wallet-a', 'old-pin')
    db.prepare(
      `INSERT INTO device_keys (id, wallet_tenant_id, public_jwk, thumbprint, platform, hardware_backed,
      user_auth_required, created_at, verified_at, key_usage, auth_policy) VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?)`,
    ).run(
      'verified-key',
      'wallet-a',
      JSON.stringify(publicJwk),
      'thumbprint-a',
      'android',
      new Date().toISOString(),
      new Date().toISOString(),
      'login',
      'strong_or_device_credential',
    )
    present.mockReset()
    attestation.mockReset()
    sessionForTrustedDevice.mockClear()
  })
  const start = () => service.start({ deviceKeyId: 'verified-key', purpose: 'device_login' })
  const webRequest = () => {
    db.prepare(
      `INSERT INTO wallet_login_sessions (login_id, poll_token_hash, created_at, expires_at, authorization_request)
      VALUES (?, ?, ?, ?, ?)`,
    ).run(
      'web-session',
      'hash',
      new Date().toISOString(),
      new Date(Date.now() + 300000).toISOString(),
      'openid4vp://web',
    )
    return service.start({ deviceKeyId: 'verified-key', purpose: 'web_login', authorizationRequest: 'openid4vp://web' })
  }

  it('works without a bearer token and validates the platform wallet after device proof', async () => {
    const challenge = start()
    await expect(
      service.finish(request, { challengeId: challenge.challengeId, signature: signature(challenge) }),
    ).resolves.toEqual({ token: 'device-session', tenantId: 'wallet-a' })
    expect(present).toHaveBeenCalledTimes(1)
    await expect(
      service.finish(request, { challengeId: challenge.challengeId, signature: signature(challenge) }),
    ).rejects.toMatchObject({ status: 401 })
  })
  it('gives unknown device selectors the same non-identifying challenge shape', async () => {
    const known = start()
    const unknown = service.start({ deviceKeyId: 'unknown-key', purpose: 'device_login' })
    expect(Object.keys(unknown)).toEqual(Object.keys(known))
    expect(unknown.payload).not.toContain('wallet-a')
    expect(unknown.requester).toBe('Credentis')
    expect(unknown.requestedClaims).toEqual([])
    await expect(
      service.finish(request, { challengeId: unknown.challengeId, signature: signature(unknown) }),
    ).rejects.toMatchObject({ status: 401 })
  })
  it('does not consume a challenge when the signature is invalid', async () => {
    const challenge = start()
    const forged = sign('sha256', Buffer.from(challenge.payload), wrongKeys.privateKey).toString('base64url')
    await expect(
      service.finish(request, { challengeId: challenge.challengeId, signature: forged }),
    ).rejects.toMatchObject({ status: 401 })
    await expect(
      service.finish(request, { challengeId: challenge.challengeId, signature: signature(challenge) }),
    ).resolves.toHaveProperty('token')
  })
  it('rejects expired, revoked and legacy device proofs', async () => {
    const challenge = start()
    db.prepare('UPDATE device_login_challenges SET expires_at = ?').run(new Date(0).toISOString())
    await expect(
      service.finish(request, { challengeId: challenge.challengeId, signature: signature(challenge) }),
    ).rejects.toMatchObject({ status: 401 })
    db.prepare('UPDATE device_keys SET verified_at = NULL').run()
    const legacy = start()
    await expect(
      service.finish(request, { challengeId: legacy.challengeId, signature: signature(legacy) }),
    ).rejects.toMatchObject({ status: 401 })
    db.prepare('UPDATE device_keys SET verified_at = ?, revoked_at = ?').run(
      new Date().toISOString(),
      new Date().toISOString(),
    )
    const revoked = start()
    await expect(
      service.finish(request, { challengeId: revoked.challengeId, signature: signature(revoked) }),
    ).rejects.toMatchObject({ status: 401 })
  })
  it('binds consent to the exact locally issued request and rejects arbitrary URLs', async () => {
    expect(() =>
      service.start({
        deviceKeyId: 'verified-key',
        purpose: 'web_login',
        authorizationRequest: 'https://attacker.example/request',
      }),
    ).toThrow('unavailable')
    const challenge = webRequest()
    await service.finish(request, { challengeId: challenge.challengeId, signature: signature(challenge) })
    expect(requireDeviceLoginApproval('web-session', 'wallet-a')).toEqual({ deviceKeyId: 'verified-key' })
    expect(() => requireDeviceLoginApproval('other-session', 'wallet-a')).toThrow()
    expect(() => requireDeviceLoginApproval('web-session', 'wallet-b')).toThrow()
  })
  it('rechecks request expiry after the phone has approved', async () => {
    const challenge = webRequest()
    db.prepare('UPDATE wallet_login_sessions SET expires_at = ?').run(new Date(0).toISOString())
    await expect(
      service.finish(request, { challengeId: challenge.challengeId, signature: signature(challenge) }),
    ).rejects.toMatchObject({ status: 410 })
    expect(present).not.toHaveBeenCalled()
  })
  it('requires fresh proof for the selected new PIN and invalidates previous sessions', async () => {
    const challenge = service.start({ deviceKeyId: 'verified-key', purpose: 'change_pin', newPin: '4321' })
    expect(challenge.payload).not.toContain('4321')
    const other = service.start({ deviceKeyId: 'verified-key', purpose: 'change_pin', newPin: '6789' })
    await expect(
      service.finish(request, { challengeId: other.challengeId, signature: signature(challenge) }),
    ).rejects.toMatchObject({ status: 401 })
    await expect(
      service.finish(request, { challengeId: challenge.challengeId, signature: signature(challenge) }),
    ).resolves.toHaveProperty('token', 'renewed-session')
    expect(db.prepare('SELECT pin_hash, session_version FROM ssi_users').get()).toEqual({
      pin_hash: 'digest:4321',
      session_version: 1,
    })
    expect(() => assertPersonalSessionActive({ id: 'user-a', sessionVersion: 0 })).toThrow('security changed')
    expect(() => assertPersonalSessionActive({ id: 'user-a', sessionVersion: 1 })).not.toThrow()
  })
  it('leaves the PIN unchanged when platform credential verification fails', async () => {
    present.mockRejectedValueOnce(new Error('Identity card revoked'))
    const challenge = service.start({ deviceKeyId: 'verified-key', purpose: 'change_pin', newPin: '4321' })
    await expect(
      service.finish(request, { challengeId: challenge.challengeId, signature: signature(challenge) }),
    ).rejects.toThrow('revoked')
    expect(db.prepare('SELECT pin_hash, session_version FROM ssi_users').get()).toEqual({
      pin_hash: 'old-pin',
      session_version: 0,
    })
  })
  it('removing a key cancels pending grants and invalidates derived organisation sessions too', () => {
    start()
    db.prepare(
      'INSERT INTO device_login_approvals (verification_id,wallet_tenant_id,device_key_id,approved_at) VALUES (?,?,?,?)',
    ).run('approved', 'wallet-a', 'verified-key', new Date().toISOString())
    trust.revoke('wallet-a', 'verified-key')
    expect(db.prepare('SELECT * FROM device_login_challenges').all()).toEqual([])
    expect(() => requireDeviceLoginApproval('approved', 'wallet-a')).toThrow()
    expect(() => assertPersonalSessionActive({ id: 'user-a', tenantId: 'org-a' })).toThrow()
    expect(() => assertPersonalSessionActive({ id: 'user-a', deviceKeyId: 'verified-key', sessionVersion: 1 })).toThrow(
      'removed',
    )
  })
  it('requires a real issued enrollment nonce and a valid attestation, not self-reported flags', async () => {
    const input = {
      walletTenantId: 'wallet-a',
      publicJwk,
      platform: 'android',
      usage: 'login' as const,
      enrollmentChallenge: 'invented',
      attestation: { hardwareBacked: true, userAuthenticationRequired: true },
    }
    await expect(trust.enroll(input)).rejects.toMatchObject({ status: 401 })
    const challenge = trust.createEnrollmentChallenge('wallet-a')
    attestation.mockRejectedValueOnce(new Error('Untrusted Android chain'))
    await expect(trust.enroll({ ...input, enrollmentChallenge: challenge.nonce })).rejects.toThrow('Untrusted')
    expect(attestation).toHaveBeenCalledWith(expect.objectContaining({ challenge: challenge.nonce, usage: 'login' }))
  })

  it('allows a valid biometric-only payment proof once and rejects an unissued nonce', () => {
    db.prepare("UPDATE device_keys SET key_usage = 'payment', auth_policy = 'strong_biometric'").run()
    const transaction = { transactionId: 'payment-1', amount: '10.00' }
    const assertion = (nonce: string) => {
      const signedAt = new Date().toISOString()
      const payload = JSON.stringify({
        aud: 'https://credentis.test',
        nonce,
        purpose: 'release_funds',
        signedAt,
        transaction,
        walletTenantId: 'wallet-a',
      })
      return {
        deviceKeyId: 'verified-key',
        nonce,
        purpose: 'release_funds',
        signedAt,
        signature: sign('sha256', Buffer.from(payload), keys.privateKey).toString('base64url'),
      }
    }
    const nonce = trust.createChallenge('wallet-a').nonce
    const proof = assertion(nonce)
    expect(() =>
      trust.verifyAssertion({
        walletTenantId: 'wallet-a',
        assertion: proof,
        purpose: 'release_funds',
        transaction: { ...transaction, amount: '100.00' },
      }),
    ).toThrow('could not be verified')
    expect(
      trust.verifyAssertion({ walletTenantId: 'wallet-a', assertion: proof, purpose: 'release_funds', transaction }),
    ).toEqual({ deviceKeyId: 'verified-key' })
    expect(() =>
      trust.verifyAssertion({ walletTenantId: 'wallet-a', assertion: proof, purpose: 'release_funds', transaction }),
    ).toThrow('already been used')
    expect(() =>
      trust.verifyAssertion({
        walletTenantId: 'wallet-a',
        assertion: assertion('unissued-nonce'),
        purpose: 'release_funds',
        transaction,
      }),
    ).toThrow('already been used')
  })

  it('never allows the screen-lock login key to confirm a money step', () => {
    const assertion = {
      deviceKeyId: 'verified-key',
      nonce: 'nonce',
      purpose: 'release_funds',
      signedAt: new Date().toISOString(),
      signature: 'signature',
    }
    expect(() => trust.verifyAssertion({ walletTenantId: 'wallet-a', assertion, purpose: 'release_funds' })).toThrow(
      'biometric-only payment key',
    )
  })

  it('cannot enroll the same public key to another account or resurrect it after revocation', async () => {
    const { jwkThumbprint } = await import('../DeviceTrustService')
    db.prepare('UPDATE device_keys SET thumbprint = ?, revoked_at = ?').run(
      jwkThumbprint(publicJwk),
      new Date().toISOString(),
    )
    const challenge = trust.createEnrollmentChallenge('wallet-b')
    await expect(
      trust.enroll({
        walletTenantId: 'wallet-b',
        publicJwk,
        attestation: {},
        platform: 'android',
        usage: 'login',
        enrollmentChallenge: challenge.nonce,
      }),
    ).rejects.toMatchObject({ status: 409 })
    expect(db.prepare('SELECT wallet_tenant_id, revoked_at FROM device_keys').get()).toMatchObject({
      wallet_tenant_id: 'wallet-a',
      revoked_at: expect.any(String),
    })
    expect(db.prepare('SELECT used_at FROM device_enrollment_challenges WHERE nonce = ?').get(challenge.nonce)).toEqual(
      { used_at: null },
    )
  })
})
