import type { JwtPayload } from 'jsonwebtoken'

import { createHash } from 'crypto'

import { StatusException } from '../errors'
import { DatabaseManager } from '../persistence/DatabaseManager'

export function personalSessionVersion(userId: string): number {
  const row = DatabaseManager.getDatabase()
    .prepare('SELECT session_version FROM ssi_users WHERE id = ?')
    .get(userId) as { session_version: number } | undefined
  if (!row) throw new StatusException('This account is unavailable.', 401)
  return row.session_version
}

export function assertPersonalSessionActive(claims: JwtPayload): void {
  const id = typeof claims.id === 'string' ? claims.id : undefined
  if (!id) return
  const db = DatabaseManager.getDatabase()
  const account = db.prepare('SELECT session_version FROM ssi_users WHERE id = ?').get(id) as
    | { session_version: number }
    | undefined
  if (!account) return
  if (Number(claims.sessionVersion || 0) !== account.session_version) {
    throw new StatusException('Your account security changed. Sign in again.', 401)
  }
  if (typeof claims.deviceKeyId === 'string') {
    const key = db
      .prepare('SELECT id FROM device_keys WHERE id = ? AND revoked_at IS NULL AND verified_at IS NOT NULL')
      .get(claims.deviceKeyId)
    if (!key) throw new StatusException('This device was removed. Sign in again.', 401)
  }
}

export function devicePolicyHash(policy: { releaseClaims: string[]; audience: string }): string {
  return createHash('sha256')
    .update(JSON.stringify({ releaseClaims: policy.releaseClaims, audience: policy.audience }))
    .digest('hex')
}

export function requireDeviceLoginApproval(
  verificationId: string,
  walletTenantId: string,
  policyHash?: string,
): { deviceKeyId: string } {
  const row = DatabaseManager.getDatabase()
    .prepare(
      `SELECT a.device_key_id, a.policy_hash FROM device_login_approvals a
     JOIN device_keys d ON d.id = a.device_key_id
     WHERE a.verification_id = ? AND a.wallet_tenant_id = ? AND d.wallet_tenant_id = ?
       AND d.revoked_at IS NULL AND d.verified_at IS NOT NULL AND d.key_usage = 'login'
       AND d.auth_policy = 'strong_or_device_credential'`,
    )
    .get(verificationId, walletTenantId, walletTenantId) as
    | { device_key_id: string; policy_hash: string | null }
    | undefined
  if (!row || (policyHash && row.policy_hash !== policyHash)) {
    throw new StatusException('Approve this sign-in on your enrolled Credentis device.', 401)
  }
  return { deviceKeyId: row.device_key_id }
}
