/**
 * Phone-native biometric binding for VC login and fund release.
 *
 * The server never sees a fingerprint. It sees a signature from a key that was
 * enrolled with a hardware attestation saying the key requires user authentication.
 * Android Keystore enforces that authentication before the phone can sign.
 *
 * A browser, or a phone that has not enrolled, cannot produce that signature.
 */

import { createHash, createPublicKey, createVerify, randomBytes, timingSafeEqual } from 'crypto'

import { StatusException } from '../errors'
import { DatabaseManager } from '../persistence/DatabaseManager'

import { verifyAndroidKeyAttestation } from './AndroidKeyAttestation'
import { loginAudience } from './SSIAuthService'

export const DEVICE_TRUST_ACTIONS = ['release_funds', 'trigger_payout', 'record_payment'] as const
export type DeviceTrustAction = (typeof DEVICE_TRUST_ACTIONS)[number]

const ASSERTION_TTL_SECONDS = 120
const CHALLENGE_TTL_MS = 5 * 60 * 1000

export interface DeviceTrustPolicy {
  enabled: boolean
  requiredActions: string[]
}

export interface DeviceAssertion {
  deviceKeyId: string
  nonce: string
  purpose: string
  signedAt: string
  signature: string
}

export interface EnrolledDevice {
  id: string
  platform: string
  label?: string
  hardwareBacked: boolean
  userAuthRequired: boolean
  createdAt: string
  revokedAt?: string
  verifiedAt?: string
  usage?: string
}

interface DeviceKeyRow {
  id: string
  wallet_tenant_id: string
  public_jwk: string
  thumbprint: string
  platform: string
  hardware_backed: number
  user_auth_required: number
  label: string | null
  created_at: string
  revoked_at: string | null
  verified_at: string | null
  key_usage: string
  auth_policy: string
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function canonical(value: unknown): string {
  return JSON.stringify(value)
}

/** Stable thumbprint of a public JWK. Private material is never accepted. */
export function jwkThumbprint(jwk: Record<string, unknown>): string {
  const minimal =
    jwk.kty === 'EC'
      ? { crv: jwk.crv, kty: 'EC', x: jwk.x, y: jwk.y }
      : jwk.kty === 'OKP'
        ? { crv: jwk.crv, kty: 'OKP', x: jwk.x }
        : null
  if (!minimal || Object.values(minimal).some((part) => typeof part !== 'string' || !part)) {
    throw new StatusException('The device key must be an EC or OKP public key.', 400)
  }
  return sha256(canonical(minimal))
}

function publicKeyFromJwk(jwk: Record<string, unknown>) {
  const thumbprint = jwkThumbprint(jwk)
  return { key: createPublicKey({ key: { ...jwk }, format: 'jwk' }), thumbprint }
}

export function defaultDeviceTrustPolicy(): DeviceTrustPolicy {
  return { enabled: false, requiredActions: [...DEVICE_TRUST_ACTIONS] }
}

export function parseDeviceTrust(raw: unknown): DeviceTrustPolicy {
  const fallback = defaultDeviceTrustPolicy()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fallback
  const record = raw as Record<string, unknown>
  const requested = Array.isArray(record.requiredActions)
    ? record.requiredActions.map((item) => String(item))
    : fallback.requiredActions
  return {
    enabled: record.enabled === true,
    requiredActions: requested.filter((action) => (DEVICE_TRUST_ACTIONS as readonly string[]).includes(action)),
  }
}

export function deviceTrustRequired(policy: DeviceTrustPolicy | undefined, action: string): boolean {
  if (!policy?.enabled) return false
  return policy.requiredActions.includes(action)
}
export class DeviceTrustService {
  public createEnrollmentChallenge(walletTenantId: string): { nonce: string; expiresAt: string } {
    const nonce = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString()
    DatabaseManager.getDatabase()
      .prepare('DELETE FROM device_enrollment_challenges WHERE expires_at <= ?')
      .run(new Date().toISOString())
    DatabaseManager.getDatabase()
      .prepare('INSERT INTO device_enrollment_challenges (nonce, wallet_tenant_id, expires_at) VALUES (?, ?, ?)')
      .run(nonce, walletTenantId, expiresAt)
    return { nonce, expiresAt }
  }

  public createChallenge(walletTenantId: string): { nonce: string; audience: string; expiresAt: string } {
    const nonce = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString()
    DatabaseManager.getDatabase()
      .prepare('INSERT INTO ssi_login_challenges (nonce, tenant_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
      .run(nonce, walletTenantId, expiresAt, new Date().toISOString())
    return { nonce, audience: this.audience(), expiresAt }
  }

  public async enroll(input: {
    walletTenantId: string
    publicJwk: Record<string, unknown>
    attestation: unknown
    platform: string
    label?: string
    enrollmentChallenge: string
    usage: 'login' | 'payment'
  }): Promise<EnrolledDevice> {
    if (input.platform !== 'android' || !['login', 'payment'].includes(input.usage)) {
      throw new StatusException('This device enrollment request is invalid.', 400)
    }
    if (input.label && input.label.length > 80) {
      throw new StatusException('Device name must be 80 characters or fewer.', 400)
    }
    const db = DatabaseManager.getDatabase()
    const pending = db
      .prepare(
        'SELECT nonce FROM device_enrollment_challenges WHERE nonce = ? AND wallet_tenant_id = ? AND expires_at > ? AND used_at IS NULL',
      )
      .get(input.enrollmentChallenge, input.walletTenantId, new Date().toISOString())
    if (!pending) throw new StatusException('This phone enrollment has expired. Start again.', 401)
    const { thumbprint } = publicKeyFromJwk(input.publicJwk)
    if (input.platform !== 'android')
      throw new StatusException('Trusted-device enrollment requires the Android app.', 400)
    await verifyAndroidKeyAttestation({
      publicJwk: input.publicJwk,
      attestation: input.attestation,
      challenge: input.enrollmentChallenge,
      usage: input.usage,
    })
    return db.transaction(() => {
      const consumed = db
        .prepare(
          'UPDATE device_enrollment_challenges SET used_at = ? WHERE nonce = ? AND wallet_tenant_id = ? AND used_at IS NULL AND expires_at > ?',
        )
        .run(
          new Date().toISOString(),
          input.enrollmentChallenge,
          input.walletTenantId,
          new Date().toISOString(),
        ).changes
      if (consumed !== 1) throw new StatusException('This phone enrollment was already used.', 401)
      const existing = db.prepare('SELECT id FROM device_keys WHERE thumbprint = ?').get(thumbprint)
      if (existing) throw new StatusException('This key was already enrolled. Create a new device key.', 409)
      const now = new Date().toISOString()
      const id = randomBytes(16).toString('hex')
      const values = [
        input.walletTenantId,
        canonical(input.publicJwk),
        input.platform,
        canonical(input.attestation),
        input.label || null,
      ]
      db.prepare(
        `INSERT INTO device_keys (
           id, wallet_tenant_id, public_jwk, thumbprint, platform, attestation_json,
           hardware_backed, user_auth_required, label, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`,
      ).run(id, values[0], values[1], thumbprint, values[2], values[3], values[4], now)
      db.prepare('UPDATE device_keys SET verified_at = ?, key_usage = ?, auth_policy = ? WHERE id = ?').run(
        now,
        input.usage,
        input.usage === 'login' ? 'strong_or_device_credential' : 'strong_biometric',
        id,
      )
      return this.toDevice(this.requireKey(id))
    })()
  }

  public getVerifiedDevice(deviceKeyId: string): { id: string; walletTenantId: string } {
    const row = this.requireKey(deviceKeyId)
    if (
      row.revoked_at ||
      !row.verified_at ||
      row.key_usage !== 'login' ||
      row.auth_policy !== 'strong_or_device_credential'
    ) {
      throw new StatusException('Use your account PIN, then enroll this device under Account security.', 403)
    }
    return { id: row.id, walletTenantId: row.wallet_tenant_id }
  }

  public verifyLoginSignature(deviceKeyId: string, payload: string, signature: string): void {
    this.getVerifiedDevice(deviceKeyId)
    const row = this.requireKey(deviceKeyId)
    const { key } = publicKeyFromJwk(JSON.parse(row.public_jwk))
    const verifier = createVerify('SHA256')
    verifier.update(payload)
    verifier.end()
    if (!verifier.verify(key, Buffer.from(signature, 'base64url'))) {
      throw new StatusException('This device confirmation could not be verified.', 401)
    }
  }

  public list(walletTenantId: string): EnrolledDevice[] {
    const rows = DatabaseManager.getDatabase()
      .prepare('SELECT * FROM device_keys WHERE wallet_tenant_id = ? ORDER BY created_at DESC')
      .all(walletTenantId) as DeviceKeyRow[]
    return rows.map((row) => this.toDevice(row))
  }

  public revoke(walletTenantId: string, deviceKeyId: string): void {
    const db = DatabaseManager.getDatabase()
    db.transaction(() => {
      const changed = db
        .prepare('UPDATE device_keys SET revoked_at = ? WHERE id = ? AND wallet_tenant_id = ? AND revoked_at IS NULL')
        .run(new Date().toISOString(), deviceKeyId, walletTenantId).changes
      if (changed !== 1) throw new StatusException('That phone is not enrolled on this wallet.', 404)
      db.prepare('DELETE FROM device_login_approvals WHERE device_key_id = ?').run(deviceKeyId)
      db.prepare('DELETE FROM device_login_challenges WHERE device_key_id = ?').run(deviceKeyId)
      db.prepare('UPDATE ssi_users SET session_version = session_version + 1 WHERE tenant_id = ?').run(walletTenantId)
    })()
  }

  /**
   * Verify a biometric device signature. The nonce is consumed, so a captured
   * assertion cannot be replayed. Purpose binds the signature to login or to
   * one fund-releasing step.
   */
  public verifyAssertion(input: {
    walletTenantId: string
    assertion: DeviceAssertion
    purpose: string
    transaction?: Record<string, unknown>
    /** Login already holds the nonce and deletes it after both signatures verify. */
    consumeNonce?: boolean
  }): { deviceKeyId: string } {
    const row = this.requireKey(input.assertion.deviceKeyId)
    if (row.wallet_tenant_id !== input.walletTenantId) {
      throw new StatusException('This phone is not enrolled for this wallet.', 403)
    }
    if (row.revoked_at) throw new StatusException('This phone was revoked. Enroll it again.', 403)
    if (row.hardware_backed !== 1 || row.user_auth_required !== 1) {
      throw new StatusException('This phone key is not allowed to release money.', 403)
    }
    if (input.purpose !== 'vc_login' && row.key_usage === 'login') {
      throw new StatusException('Use the biometric-only payment key for this money step.', 403)
    }
    if (input.assertion.purpose !== input.purpose) {
      throw new StatusException('This confirmation was made for a different step.', 403)
    }
    const signedAt = Date.parse(input.assertion.signedAt)
    if (!Number.isFinite(signedAt) || Math.abs(Date.now() - signedAt) > ASSERTION_TTL_SECONDS * 1000) {
      throw new StatusException('This confirmation has expired. Confirm again.', 401)
    }
    this.verifySignature(row, input)
    if (input.consumeNonce !== false)
      this.consumeNonce(input.assertion.nonce, row.id, input.purpose, input.walletTenantId)
    return { deviceKeyId: row.id }
  }

  private verifySignature(
    row: DeviceKeyRow,
    input: { walletTenantId: string; assertion: DeviceAssertion; transaction?: Record<string, unknown> },
  ): void {
    const jwk = JSON.parse(row.public_jwk) as Record<string, unknown>
    const { key } = publicKeyFromJwk(jwk)
    const payload = canonical({
      aud: this.audience(),
      nonce: input.assertion.nonce,
      purpose: input.assertion.purpose,
      signedAt: input.assertion.signedAt,
      transaction: input.transaction || {},
      walletTenantId: input.walletTenantId,
    })
    const verifier = createVerify('SHA256')
    verifier.update(payload)
    verifier.end()
    if (!verifier.verify(key, Buffer.from(input.assertion.signature, 'base64url'))) {
      throw new StatusException('The phone confirmation could not be verified.', 401)
    }
  }

  private consumeNonce(nonce: string, deviceKeyId: string, purpose: string, walletTenantId: string): void {
    const db = DatabaseManager.getDatabase()
    db.transaction(() => {
      const consumed = db
        .prepare('DELETE FROM ssi_login_challenges WHERE nonce = ? AND tenant_id = ? AND expires_at > ?')
        .run(nonce, walletTenantId, new Date().toISOString()).changes
      if (consumed !== 1) throw new StatusException('This confirmation has already been used or has expired.', 401)
      db.prepare('INSERT INTO device_assertions (nonce_hash, device_key_id, purpose, used_at) VALUES (?, ?, ?, ?)').run(
        sha256(nonce),
        deviceKeyId,
        purpose,
        new Date().toISOString(),
      )
    })()
  }

  private requireKey(id: string): DeviceKeyRow {
    const row = DatabaseManager.getDatabase().prepare('SELECT * FROM device_keys WHERE id = ?').get(id) as
      | DeviceKeyRow
      | undefined
    if (!row) throw new StatusException('This phone is not enrolled.', 403)
    return row
  }

  private toDevice(row: DeviceKeyRow): EnrolledDevice {
    return {
      id: row.id,
      platform: row.platform,
      label: row.label || undefined,
      hardwareBacked: row.hardware_backed === 1,
      userAuthRequired: row.user_auth_required === 1,
      createdAt: row.created_at,
      revokedAt: row.revoked_at || undefined,
      verifiedAt: row.verified_at || undefined,
      usage: row.key_usage,
    }
  }

  private audience(): string {
    try {
      return loginAudience()
    } catch {
      return 'credentis'
    }
  }
}

export const deviceTrustService = new DeviceTrustService()

export function sameSecret(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}
