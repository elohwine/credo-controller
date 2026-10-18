import type { PartnerClientRecord } from './PartnerClientService'
import type { SSIAuthService } from '../SSIAuthService'
import type { Agent } from '@credo-ts/core'

import { W3cJwtVerifiablePresentation } from '@credo-ts/core'
import crypto from 'crypto'

import { PLATFORM_IDENTITY_VC_TYPE } from '../../config/credentials/PlatformIdentityVC'
import { StatusException } from '../../errors'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import { auditService } from '../AuditService'
import { PlatformIdentityError } from '../SSIAuthService'
import { shouldUseUnsignedLocalOid4vpRequest, stageProofService, verifierModuleOf } from '../ssi/StageProofService'

import { hashSecret, partnerClientService, sameHash } from './PartnerClientService'

const SESSION_TTL_MS = 5 * 60 * 1000
const MIN_BINDING_REF = 16
// Hydra v2 login challenges are ~1.5k characters; only the hash is stored.
const MAX_BINDING_REF = 4096

export interface PartnerVerificationStart {
  verificationId: string
  /** `openid4vp://` request to show as a QR code or open on the same device. */
  authorizationRequest: string
  expiresAt: string
}

export type PartnerVerificationReason =
  | 'verified'
  | 'wallet_response_rejected'
  | 'not_org_member'
  | PlatformIdentityError['code']

export type PartnerVerificationResult =
  | { status: 'pending'; expiresAt: string }
  | {
      status: 'verified'
      reasonCode: 'verified'
      /** Pairwise subject: stable for this person at this client, different at every other client. */
      subject: string
      claims: Record<string, unknown>
      verifiedAt: string
    }
  | { status: 'failed'; reasonCode: Exclude<PartnerVerificationReason, 'verified'> }

interface SessionRow {
  verification_id: string
  client_id: string
  binding_ref_hash: string
  expires_at: string
  consumed_at: string | null
}

/**
 * Wallet verification for partner platforms. The partner (or the hosted OIDC bridge on its
 * behalf) opens a session bound to an opaque `bindingRef` it keeps (the bridge uses the
 * OAuth login challenge). The wallet answers the platform verifier directly; the partner
 * reads the result once, with the same binding ref. Only a pairwise subject and the
 * claims the client's policy allows are released; never the holder DID.
 */
export class PartnerVerificationService {
  public constructor(
    private readonly agent: Agent,
    private readonly ssiAuthService: Pick<SSIAuthService, 'verifiedPlatformIdentity'>,
  ) {}

  /**
   * The calling client: HTTP Basic client credentials, or the hosted bridge's service key
   * naming the client it acts for. Undefined when neither authenticates an active client.
   */
  public static authenticateCaller(headers: Record<string, unknown>): PartnerClientRecord | undefined {
    const authorization = String(headers.authorization || '')
    if (authorization.toLowerCase().startsWith('basic ')) {
      const decoded = Buffer.from(authorization.slice(6).trim(), 'base64').toString('utf8')
      const separator = decoded.indexOf(':')
      if (separator <= 0) return undefined
      const clientId = decodeURIComponent(decoded.slice(0, separator))
      const clientSecret = decodeURIComponent(decoded.slice(separator + 1))
      return partnerClientService.authenticate(clientId, clientSecret)
    }

    const bridgeKey = String(headers['x-bridge-key'] || '')
    const configured = process.env.PARTNER_BRIDGE_API_KEY || ''
    if (!bridgeKey || configured.length < 32 || !sameHash(hashSecret(bridgeKey), hashSecret(configured))) {
      return undefined
    }
    return partnerClientService.findActive(String(headers['x-partner-client-id'] || '').trim())
  }

  public async start(client: PartnerClientRecord, bindingRef: unknown): Promise<PartnerVerificationStart> {
    const ref = this.requireBindingRef(bindingRef)
    const signer = await stageProofService.getOrCreateDidForAgent(this.agent)
    const { verifierId, signerDidUrl } = await stageProofService.getOrCreateVerifierForAgent(this.agent, signer.didUrl)
    const result = await verifierModuleOf(this.agent).createAuthorizationRequest({
      verifierId,
      version: 'v1.draft24',
      requestSigner: shouldUseUnsignedLocalOid4vpRequest()
        ? { method: 'none' }
        : { method: 'did', didUrl: signerDidUrl },
      presentationExchange: {
        definition: {
          id: `partner-login-${crypto.randomUUID()}`,
          input_descriptors: [
            {
              id: 'platform-identity',
              name: 'Credentis identity',
              purpose: `Sign in to ${client.name}`,
              constraints: {
                fields: [
                  {
                    path: ['$.type', '$.vc.type'],
                    filter: { type: 'array', contains: { const: PLATFORM_IDENTITY_VC_TYPE } },
                  },
                ],
              },
            },
          ],
        },
      },
    })

    const verificationId = result.verificationSession?.id as string | undefined
    if (!verificationId) throw new StatusException('Unable to start wallet verification', 500)
    const authorizationRequest = result.authorizationRequest
    if (typeof authorizationRequest !== 'string' || !authorizationRequest) {
      throw new StatusException('Verifier did not return a wallet authorization request', 500)
    }

    const now = new Date()
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString()
    DatabaseManager.getDatabase()
      .prepare(
        `INSERT INTO partner_verification_sessions (verification_id, client_id, binding_ref_hash, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(verificationId, client.clientId, hashSecret(ref), now.toISOString(), expiresAt)

    return { verificationId, authorizationRequest, expiresAt }
  }

  public async result(
    client: PartnerClientRecord,
    verificationId: string,
    bindingRef: unknown,
  ): Promise<PartnerVerificationResult> {
    const ref = typeof bindingRef === 'string' ? bindingRef : ''
    const db = DatabaseManager.getDatabase()
    const row = db
      .prepare(
        `SELECT verification_id, client_id, binding_ref_hash, expires_at, consumed_at
         FROM partner_verification_sessions WHERE verification_id = ?`,
      )
      .get(verificationId) as SessionRow | undefined
    // Another client's session, or the wrong binding, looks exactly like an unknown one.
    if (!row || row.client_id !== client.clientId || !ref || !sameHash(row.binding_ref_hash, hashSecret(ref))) {
      throw new StatusException('Unknown verification', 404)
    }
    if (row.consumed_at) throw new StatusException('This verification result has already been read', 410)
    if (new Date(row.expires_at).getTime() <= Date.now())
      throw new StatusException('This verification has expired', 410)

    const verifier = verifierModuleOf(this.agent)
    const session = await verifier.getVerificationSessionById(verificationId)
    if (session?.state === 'Error') {
      if (!this.consume(verificationId))
        throw new StatusException('This verification result has already been read', 410)
      return this.finish(client, verificationId, { status: 'failed', reasonCode: 'wallet_response_rejected' })
    }
    if (session?.state !== 'ResponseVerified') return { status: 'pending', expiresAt: row.expires_at }

    // One result per session: claim it before releasing anything.
    if (!this.consume(verificationId)) throw new StatusException('This verification result has already been read', 410)

    const verified = await verifier.getVerifiedAuthorizationResponse(verificationId)
    const presentations: unknown[] = verified?.presentationExchange?.presentations ?? []
    const presentation = presentations.find(
      (item): item is W3cJwtVerifiablePresentation => item instanceof W3cJwtVerifiablePresentation,
    )
    if (!presentation) {
      return this.finish(client, verificationId, { status: 'failed', reasonCode: 'identity_credential_missing' })
    }

    let identity: Awaited<ReturnType<SSIAuthService['verifiedPlatformIdentity']>>
    try {
      identity = await this.ssiAuthService.verifiedPlatformIdentity(presentation)
    } catch (error) {
      const reasonCode = error instanceof PlatformIdentityError ? error.code : 'presenter_not_account_holder'
      return this.finish(client, verificationId, { status: 'failed', reasonCode })
    }

    const claims: Record<string, unknown> = {}
    for (const name of client.policy.releaseClaims) {
      const value = identity.claims[name]
      if (value !== undefined && value !== null && value !== '') claims[name] = value
    }

    if (client.policy.audience === 'org_members') {
      const membership = db
        .prepare(
          `SELECT role FROM org_memberships WHERE user_id = ? AND org_tenant_id = ? AND status = 'active' LIMIT 1`,
        )
        .get(identity.user.id, client.orgTenantId) as { role?: string } | undefined
      if (!membership) return this.finish(client, verificationId, { status: 'failed', reasonCode: 'not_org_member' })
      claims.org_role = String(membership.role || 'member')
    }

    return this.finish(client, verificationId, {
      status: 'verified',
      reasonCode: 'verified',
      subject: PartnerVerificationService.pairwiseSubject(client.subjectSalt, identity.user.id),
      claims,
      verifiedAt: new Date().toISOString(),
    })
  }

  public static pairwiseSubject(subjectSalt: string, accountId: string): string {
    return crypto.createHmac('sha256', subjectSalt).update(`account:${accountId}`).digest('base64url')
  }

  private finish<T extends Exclude<PartnerVerificationResult, { status: 'pending' }>>(
    client: PartnerClientRecord,
    verificationId: string,
    outcome: T,
  ): T {
    DatabaseManager.getDatabase()
      .prepare('UPDATE partner_verification_sessions SET result_code = ? WHERE verification_id = ?')
      .run(outcome.reasonCode, verificationId)
    void auditService.logAction({
      tenantId: client.orgTenantId,
      actionType: 'partner_verification',
      resourceId: verificationId,
      details: { clientId: client.clientId, status: outcome.status, reasonCode: outcome.reasonCode },
    })
    return outcome
  }

  private requireBindingRef(value: unknown): string {
    const ref = typeof value === 'string' ? value : ''
    if (ref.length < MIN_BINDING_REF || ref.length > MAX_BINDING_REF) {
      throw new StatusException(
        `bindingRef is required (${MIN_BINDING_REF}-${MAX_BINDING_REF} characters, unguessable)`,
        400,
      )
    }
    return ref
  }

  private consume(verificationId: string): boolean {
    const now = new Date().toISOString()
    return (
      DatabaseManager.getDatabase()
        .prepare(
          `UPDATE partner_verification_sessions SET consumed_at = ?
           WHERE verification_id = ? AND consumed_at IS NULL AND expires_at > ?`,
        )
        .run(now, verificationId, now).changes === 1
    )
  }
}
