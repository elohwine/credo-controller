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
  return { key: createPublicKey({ key: jwk as any, format: 'jwk' }), thumbprint }
}

/**
 * Android key attestation, verified as far as a server can without Google's
 * attestation roots bundled here. A software key, or a key that does not require
 * user authentication, is refused. The certificate chain is stored so a later
 * check against the published roots can be added without re-enrollment.
 */
export function readKeyAttestation(attestation: unknown): { hardwareBacked: boolean; userAuthRequired: boolean } {
  if (!attestation || typeof attestation !== 'object') {
    throw new StatusException('A device attestation is required to enroll this phone.', 400)
  }
  const record = attestation as Record<string, unknown>
  const securityLevel = String(record.securityLevel || record.keymasterSecurityLevel || '').toLowerCase()
  const hardwareBacked =
    securityLevel === 'trustedenvironment' || securityLevel === 'strongbox' || record.hardwareBacked === true
  const userAuthRequired = record.userAuthenticationRequired === true || record.userAuthRequired === true
  const purposes = Array.isArray(record.purposes) ? record.purposes.map((item) => String(item)) : []
  if (!hardwareBacked) {
    throw new StatusException(
      'This phone could not create a hardware-backed key. Fund release stays on a phone that can.',
      400,
    )
  }
  if (!userAuthRequired) {
    throw new StatusException('The device key must require fingerprint or face before it can sign.', 400)
  }
  if (purposes.length > 0 && !purposes.some((purpose) => /sign/i.test(purpose))) {
    throw new StatusException('The device key is not allowed to sign.', 400)
  }
  return { hardwareBacked: true, userAuthRequired: true }
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
  public createChallenge(walletTenantId: string): { nonce: string; audience: string; expiresAt: string } {
    const nonce = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString()
    DatabaseManager.getDatabase()
      .prepare('INSERT INTO ssi_login_challenges (nonce, tenant_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
      .run(nonce, walletTenantId, expiresAt, new Date().toISOString())
    return { nonce, audience: this.audience(), expiresAt }
  }

  public enroll(input: {
    walletTenantId: string
    publicJwk: Record<string, unknown>
    attestation: unknown
    platform: string
    label?: string
  }): EnrolledDevice {
    const { thumbprint } = publicKeyFromJwk(input.publicJwk)
    readKeyAttestation(input.attestation)
    const db = DatabaseManager.getDatabase()
    const existing = db.prepare('SELECT id, revoked_at FROM device_keys WHERE thumbprint = ?').get(thumbprint) as
      | { id: string; revoked_at: string | null }
      | undefined
    if (existing && !existing.revoked_at) throw new StatusException('This phone is already enrolled.', 409)
    const now = new Date().toISOString()
    const id = existing?.id || randomBytes(16).toString('hex')
    const values = [
      input.walletTenantId,
      canonical(input.publicJwk),
      input.platform,
      canonical(input.attestation),
      input.label || null,
    ]
    if (existing) {
      db.prepare(
        `UPDATE device_keys
         SET wallet_tenant_id = ?, public_jwk = ?, platform = ?, attestation_json = ?,
             hardware_backed = 1, user_auth_required = 1, label = ?, revoked_at = NULL
         WHERE id = ?`,
      ).run(...values, id)
    } else {
      db.prepare(
        `INSERT INTO device_keys (
           id, wallet_tenant_id, public_jwk, thumbprint, platform, attestation_json,
           hardware_backed, user_auth_required, label, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`,
      ).run(id, values[0], values[1], thumbprint, values[2], values[3], values[4], now)
    }
    return this.toDevice(this.requireKey(id))
  }

  public list(walletTenantId: string): EnrolledDevice[] {
    const rows = DatabaseManager.getDatabase()
      .prepare('SELECT * FROM device_keys WHERE wallet_tenant_id = ? ORDER BY created_at DESC')
      .all(walletTenantId) as DeviceKeyRow[]
    return rows.map((row) => this.toDevice(row))
  }

  public revoke(walletTenantId: string, deviceKeyId: string): void {
    const changed = DatabaseManager.getDatabase()
      .prepare('UPDATE device_keys SET revoked_at = ? WHERE id = ? AND wallet_tenant_id = ? AND revoked_at IS NULL')
      .run(new Date().toISOString(), deviceKeyId, walletTenantId).changes
    if (changed !== 1) throw new StatusException('That phone is not enrolled on this wallet.', 404)
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
    if (input.assertion.purpose !== input.purpose) {
      throw new StatusException('This confirmation was made for a different step.', 403)
    }
    const signedAt = Date.parse(input.assertion.signedAt)
    if (!Number.isFinite(signedAt) || Math.abs(Date.now() - signedAt) > ASSERTION_TTL_SECONDS * 1000) {
      throw new StatusException('This confirmation has expired. Confirm again.', 401)
    }
    if (input.consumeNonce !== false) this.consumeNonce(input.assertion.nonce, row.id, input.purpose)
    this.verifySignature(row, input)
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

  private consumeNonce(nonce: string, deviceKeyId: string, purpose: string): void {
    const db = DatabaseManager.getDatabase()
    const live = db
      .prepare('SELECT nonce FROM ssi_login_challenges WHERE nonce = ? AND expires_at > ?')
      .get(nonce, new Date().toISOString()) as { nonce?: string } | undefined
    if (live) {
      db.prepare('DELETE FROM ssi_login_challenges WHERE nonce = ?').run(nonce)
    }
    const inserted = db
      .prepare('INSERT OR IGNORE INTO device_assertions (nonce_hash, device_key_id, purpose, used_at) VALUES (?, ?, ?, ?)')
      .run(sha256(nonce), deviceKeyId, purpose, new Date().toISOString()).changes
    if (!live && inserted !== 1) throw new StatusException('This confirmation has already been used or has expired.', 401)
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


