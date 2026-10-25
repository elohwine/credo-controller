import type { SSIAuthService } from './SSIAuthService'
import type { Agent } from '@credo-ts/core'
import type { Request } from 'express'

import { createHash, randomBytes } from 'crypto'

import { StatusException } from '../errors'
import { DatabaseManager } from '../persistence/DatabaseManager'

import { deviceTrustService } from './DeviceTrustService'
import { devicePolicyHash, requireDeviceLoginApproval } from './PersonalSessionPolicy'
import { loginAudience } from './SSIAuthService'
import { WalletLoginService } from './WalletLoginService'
import { stageProofService } from './ssi/StageProofService'

export type DeviceLoginPurpose = 'device_login' | 'web_login' | 'change_pin'
export interface DeviceLoginStart {
  challengeId: string
  payload: string
  expiresAt: string
  requester: string
  requestedClaims: string[]
}
interface Challenge {
  id: string
  device_key_id: string
  wallet_tenant_id: string
  purpose: DeviceLoginPurpose
  payload: string
  expires_at: string
  used_at: string | null
}
interface Operation {
  authorizationRequest?: string
  verificationId?: string
  newPinHash?: string
  policyHash?: string
}
const TTL = 2 * 60 * 1000

export class DeviceLoginService {
  public constructor(
    private readonly agent: Agent,
    private readonly auth: SSIAuthService,
  ) {}

  public start(input: {
    deviceKeyId: string
    purpose: DeviceLoginPurpose
    authorizationRequest?: string
    newPin?: string
  }): DeviceLoginStart {
    const db = DatabaseManager.getDatabase()
    if (
      !['device_login', 'web_login', 'change_pin'].includes(input.purpose) ||
      !input.deviceKeyId ||
      input.deviceKeyId.length > 128
    ) {
      throw new StatusException('This device sign-in request is invalid.', 400)
    }
    db.prepare('DELETE FROM device_login_challenges WHERE expires_at < ?').run(new Date().toISOString())
    const key = db
      .prepare(
        `SELECT wallet_tenant_id FROM device_keys
       WHERE id = ? AND revoked_at IS NULL AND verified_at IS NOT NULL AND key_usage = 'login'`,
      )
      .get(input.deviceKeyId) as { wallet_tenant_id: string } | undefined
    if (!key) {
      const challengeId = randomBytes(32).toString('base64url')
      const expiresAt = new Date(Date.now() + TTL).toISOString()
      const payload = JSON.stringify({
        version: 1,
        audience: loginAudience(),
        challengeId,
        deviceKeyId: input.deviceKeyId,
        purpose: input.purpose,
        requester: 'Credentis',
        expiresAt,
        operationHash: createHash('sha256').update('{}').digest('base64url'),
      })
      db.prepare(
        `INSERT INTO device_login_challenges (id, device_key_id, wallet_tenant_id, purpose, payload, expires_at)
         VALUES (?, ?, '', ?, ?, ?)`,
      ).run(
        challengeId,
        input.deviceKeyId,
        input.purpose,
        JSON.stringify({ signed: payload, operation: {} }),
        expiresAt,
      )
      return { challengeId, payload, expiresAt, requester: 'Credentis', requestedClaims: [] }
    }
    const operation: Operation = {}
    let requester = 'Credentis'
    let requestedClaims = ['Platform account identity']
    if (input.purpose === 'web_login') {
      if (!input.authorizationRequest || input.authorizationRequest.length > 12000) {
        throw new StatusException('Open a valid Credentis sign-in request.', 400)
      }
      const login = db
        .prepare(
          `SELECT login_id AS id FROM wallet_login_sessions WHERE authorization_request = ? AND expires_at > ? AND consumed_at IS NULL`,
        )
        .get(input.authorizationRequest, new Date().toISOString()) as { id: string } | undefined
      const partner = db
        .prepare(
          `SELECT s.verification_id AS id, c.name, c.policy FROM partner_verification_sessions s
         JOIN partner_clients c ON c.client_id = s.client_id
         WHERE s.authorization_request = ? AND s.expires_at > ? AND s.consumed_at IS NULL AND c.status = 'active'`,
        )
        .get(input.authorizationRequest, new Date().toISOString()) as
        | { id: string; name: string; policy: string }
        | undefined
      const session = login || partner
      if (!session) throw new StatusException('This sign-in request is unavailable or expired.', 410)
      operation.verificationId = session.id
      operation.authorizationRequest = input.authorizationRequest
      requester = partner?.name || 'Credentis'
      if (partner) {
        const policy = JSON.parse(partner.policy) as { releaseClaims: string[]; audience: string }
        requestedClaims = [
          'Pairwise account identifier',
          ...policy.releaseClaims,
          ...(policy.audience === 'org_members' ? ['Organisation membership and role'] : []),
        ]
        operation.policyHash = devicePolicyHash(policy)
      }
    }
    if (input.purpose === 'change_pin') {
      if (!/^\d{4,6}$/.test(input.newPin || ''))
        throw new StatusException('Choose an account PIN of 4 to 6 digits.', 400)
      operation.newPinHash = this.auth.pinDigest(input.newPin!)
    }
    const challengeId = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + TTL).toISOString()
    const payload = JSON.stringify({
      version: 1,
      audience: loginAudience(),
      challengeId,
      deviceKeyId: input.deviceKeyId,
      purpose: input.purpose,
      requester,
      expiresAt,
      operationHash: createHash('sha256').update(JSON.stringify(operation)).digest('base64url'),
    })
    db.prepare(
      `INSERT INTO device_login_challenges (id, device_key_id, wallet_tenant_id, purpose, payload, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      challengeId,
      input.deviceKeyId,
      key?.wallet_tenant_id || '',
      input.purpose,
      JSON.stringify({ signed: payload, operation }),
      expiresAt,
    )
    return { challengeId, payload, expiresAt, requester, requestedClaims }
  }

  public async finish(
    request: Request,
    input: { challengeId: string; signature: string },
  ): Promise<{
    token?: string
    tenantId?: string
    presented?: boolean
  }> {
    if (!input.signature || input.signature.length > 1024 || !/^[A-Za-z0-9_-]{40,100}$/.test(input.challengeId)) {
      throw new StatusException('This device sign-in could not be verified.', 401)
    }
    const db = DatabaseManager.getDatabase()
    const row = db
      .prepare('SELECT * FROM device_login_challenges WHERE id = ? AND used_at IS NULL AND expires_at > ?')
      .get(input.challengeId, new Date().toISOString()) as Challenge | undefined
    if (!row || !row.wallet_tenant_id) throw new StatusException('This device sign-in could not be verified.', 401)
    const saved = JSON.parse(row.payload) as { signed: string; operation: Operation }
    deviceTrustService.verifyLoginSignature(row.device_key_id, saved.signed, input.signature)
    const key = deviceTrustService.getVerifiedDevice(row.device_key_id)
    if (key.walletTenantId !== row.wallet_tenant_id)
      throw new StatusException('This device sign-in could not be verified.', 401)
    const spent = db
      .prepare('UPDATE device_login_challenges SET used_at = ? WHERE id = ? AND used_at IS NULL AND expires_at > ?')
      .run(new Date().toISOString(), row.id, new Date().toISOString()).changes
    if (spent !== 1) throw new StatusException('This device confirmation has already been used.', 401)
    if (row.purpose === 'change_pin') {
      if (!saved.operation.newPinHash) throw new StatusException('This PIN change is unavailable.', 400)
      await this.authenticateWallet(request, row.wallet_tenant_id, row.device_key_id)
      db.transaction(() => {
        deviceTrustService.getVerifiedDevice(row.device_key_id)
        db.prepare(
          'UPDATE ssi_users SET pin_hash = ?, session_version = session_version + 1, updated_at = ? WHERE tenant_id = ?',
        ).run(saved.operation.newPinHash, new Date().toISOString(), row.wallet_tenant_id)
      })()
      return this.auth.sessionForTrustedDevice(row.wallet_tenant_id, row.device_key_id)
    }
    if (row.purpose === 'web_login') {
      const { authorizationRequest, verificationId } = saved.operation
      if (!authorizationRequest || !verificationId)
        throw new StatusException('This sign-in request is unavailable.', 400)
      const live = db
        .prepare(
          `SELECT login_id FROM wallet_login_sessions WHERE login_id = ? AND authorization_request = ? AND expires_at > ? AND consumed_at IS NULL
         UNION ALL SELECT verification_id FROM partner_verification_sessions WHERE verification_id = ? AND authorization_request = ? AND expires_at > ? AND consumed_at IS NULL`,
        )
        .get(
          verificationId,
          authorizationRequest,
          new Date().toISOString(),
          verificationId,
          authorizationRequest,
          new Date().toISOString(),
        )
      if (!live) throw new StatusException('This sign-in request has expired or was already used.', 410)
      // Re-resolve the request on the holder; only this exact device-approved request is submitted.
      db.prepare(
        `INSERT INTO device_login_approvals (verification_id, wallet_tenant_id, device_key_id, policy_hash, approved_at)
         VALUES (?, ?, ?, ?, ?) ON CONFLICT(verification_id) DO NOTHING`,
      ).run(
        verificationId,
        row.wallet_tenant_id,
        row.device_key_id,
        saved.operation.policyHash || null,
        new Date().toISOString(),
      )
      requireDeviceLoginApproval(verificationId, row.wallet_tenant_id, saved.operation.policyHash)
      await stageProofService.presentFromEmbeddedWallet({
        request,
        walletId: row.wallet_tenant_id,
        presentationRequestUrl: authorizationRequest,
        allowUnsignedWallet: true,
      })
      return { presented: true }
    }
    return this.authenticateWallet(request, row.wallet_tenant_id, row.device_key_id)
  }

  private async authenticateWallet(request: Request, walletTenantId: string, deviceKeyId: string) {
    const service = new WalletLoginService(this.agent, this.auth)
    const start = await service.start()
    DatabaseManager.getDatabase()
      .prepare(
        'INSERT INTO device_login_approvals (verification_id, wallet_tenant_id, device_key_id, approved_at) VALUES (?, ?, ?, ?)',
      )
      .run(start.loginId, walletTenantId, deviceKeyId, new Date().toISOString())
    await stageProofService.presentFromEmbeddedWallet({
      request,
      walletId: walletTenantId,
      presentationRequestUrl: start.authorizationRequest,
      allowUnsignedWallet: true,
    })
    let result: Awaited<ReturnType<WalletLoginService['poll']>> | undefined
    for (let attempt = 0; attempt < 12; attempt += 1) {
      result = await service.poll(start.loginId, start.pollToken)
      if (result.status !== 'pending') break
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    if (!result) throw new StatusException('Your wallet did not complete the sign-in.', 503)
    if (result.status !== 'verified')
      throw new StatusException('Your wallet is still checking this sign-in. Please try again.', 503)
    return { token: result.token, tenantId: result.tenantId }
  }
}
