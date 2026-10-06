/**
 * Offers the credentials a person needs in order to act for an organization:
 * platform identity (holder inbox), employee evidence, and delegation evidence.
 *
 * Offers land in `wallet_pending_offers` so the mobile inbox can accept them. Possession
 * never authorizes a workflow transition by itself.
 */

import { createHash, randomUUID } from 'crypto'

import {
  DELEGATION_OFFER_SOURCE_TYPE,
  DELEGATION_VC_TYPE,
  DelegationCredentialClaims,
} from '../config/credentials/DelegationVC'
import {
  EMPLOYEE_OFFER_SOURCE_TYPE,
  EMPLOYEE_VC_TYPE,
  EMPLOYMENT_CONTRACT_OFFER_SOURCE_TYPE,
  EMPLOYMENT_CONTRACT_VC_TYPE,
  EmployeeCredentialClaims,
} from '../config/credentials/EmployeeVC'
import { PLATFORM_IDENTITY_VC_TYPE } from '../config/credentials/PlatformIdentityVC'
import { DatabaseManager } from '../persistence/DatabaseManager'
import { getTenantById } from '../persistence/TenantRepository'
import { rootLogger } from '../utils/pinoLogger'

import { toCredentialOfferDeeplink } from './OrgWorkflowActorCredentialService'
import { outboxService } from './OutboxService'

const logger = rootLogger.child({ module: 'OrgMembershipCredentialService' })

export const PLATFORM_IDENTITY_OFFER_SOURCE_TYPE = 'platform_identity'

export type MembershipOfferOutcome = 'offered' | 'already_offered' | 'already_accepted' | 'skipped' | 'failed'

export type MembershipOfferFactory = (input: {
  credentialType: string
  orgTenantId: string
  walletTenantId: string
  claims: Record<string, unknown>
}) => Promise<{ offerId: string; offerUri: string; expiresAt?: string }>

function fingerprintOf(parts: Array<string | number | undefined>): string {
  return createHash('sha256')
    .update(parts.map((part) => String(part ?? '')).join('|'))
    .digest('hex')
    .slice(0, 32)
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('0') && digits.length === 10) return `263${digits.slice(1)}`
  return digits
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

async function defaultOfferFactory(input: {
  credentialType: string
  orgTenantId: string
  walletTenantId: string
  claims: Record<string, unknown>
}): Promise<{ offerId: string; offerUri: string; expiresAt?: string }> {
  const { credentialIssuanceService } = await import('./CredentialIssuanceService')
  const result = await credentialIssuanceService.createOffer({
    credentialType: input.credentialType,
    claims: input.claims,
    tenantId: input.orgTenantId,
    expiresInMs: 7 * 24 * 60 * 60 * 1000,
  })
  return {
    offerId: result.offerId,
    offerUri: toCredentialOfferDeeplink(result.credential_offer_uri || result.credential_offer_deeplink),
    expiresAt: result.expiresAt,
  }
}

interface QueueInput {
  walletTenantId: string
  issuerTenantId: string
  sourceType: string
  sourceId: string
  credentialType: string
  offerUri: string
  title: string
  body: string
  metadata: Record<string, unknown>
  fingerprint: string
}

function queueOffer(input: QueueInput): MembershipOfferOutcome {
  const db = DatabaseManager.getDatabase()
  const now = new Date().toISOString()

  const rows = db
    .prepare(
      `
      SELECT id, metadata, accepted_at, resolved_at
      FROM wallet_pending_offers
      WHERE tenant_id = ? AND source_type = ? AND source_id = ?
      ORDER BY datetime(created_at) DESC
    `,
    )
    .all(input.walletTenantId, input.sourceType, input.sourceId) as Array<{
    id: string
    metadata: string | null
    accepted_at: string | null
    resolved_at: string | null
  }>

  for (const row of rows) {
    let stored = ''
    try {
      stored = String(JSON.parse(row.metadata || '{}')?.fingerprint || '')
    } catch {
      stored = ''
    }
    if (stored !== input.fingerprint) continue
    if (row.accepted_at) return 'already_accepted'
    if (!row.resolved_at) return 'already_offered'
  }

  db.prepare(
    `
    UPDATE wallet_pending_offers
    SET resolved_at = @now, last_attempt_at = @now,
        last_error = CASE WHEN last_error IS NULL OR last_error = '' THEN 'superseded: credential scope changed' ELSE last_error END
    WHERE tenant_id = @tenantId AND source_type = @sourceType AND source_id = @sourceId
      AND resolved_at IS NULL AND accepted_at IS NULL
  `,
  ).run({ now, tenantId: input.walletTenantId, sourceType: input.sourceType, sourceId: input.sourceId })

  const rowId = `omc-${randomUUID()}`
  db.prepare(
    `
    INSERT INTO wallet_pending_offers (
      id, tenant_id, issuer_tenant_id, source_type, source_id,
      credential_type, offer_uri, title, body, metadata, created_at,
      attempt_count, last_attempt_at
    ) VALUES (
      @id, @tenantId, @issuerTenantId, @sourceType, @sourceId,
      @credentialType, @offerUri, @title, @body, @metadata, @createdAt,
      0, @createdAt
    )
  `,
  ).run({
    id: rowId,
    tenantId: input.walletTenantId,
    issuerTenantId: input.issuerTenantId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    credentialType: input.credentialType,
    offerUri: input.offerUri,
    title: input.title,
    body: input.body,
    metadata: JSON.stringify({ ...input.metadata, fingerprint: input.fingerprint }),
    createdAt: now,
  })

  try {
    outboxService.enqueue({
      topic: 'wallet.vc.offered',
      aggregateKey: input.walletTenantId,
      dedupeKey: `wpo:${input.walletTenantId}:${input.sourceType}:${input.sourceId}:${input.fingerprint}`,
      payload: {
        tenantId: input.walletTenantId,
        issuerTenantId: input.issuerTenantId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        credentialType: input.credentialType,
        offerUri: input.offerUri.slice(0, 300),
        queuedAt: now,
      },
    })
  } catch (error: any) {
    logger.warn({ error: error?.message }, 'Outbox enqueue for membership credential failed (non-fatal)')
  }

  return 'offered'
}

function resolveWallet(userId: string): { userId: string; walletTenantId?: string; roleHint?: string } {
  const row = DatabaseManager.getDatabase()
    .prepare('SELECT tenant_id as walletTenantId FROM ssi_users WHERE id = ? LIMIT 1')
    .get(userId) as { walletTenantId?: string } | undefined
  return { userId, walletTenantId: row?.walletTenantId || undefined }
}

function resolveUserByWallet(walletTenantId: string): { userId: string; walletTenantId: string } | undefined {
  const row = DatabaseManager.getDatabase()
    .prepare('SELECT id as userId, tenant_id as walletTenantId FROM ssi_users WHERE tenant_id = ? LIMIT 1')
    .get(walletTenantId) as { userId?: string; walletTenantId?: string } | undefined
  if (!row?.userId || !row.walletTenantId) return undefined
  return { userId: row.userId, walletTenantId: row.walletTenantId }
}

export class OrgMembershipCredentialService {
  private offerFactory: MembershipOfferFactory

  constructor(offerFactory: MembershipOfferFactory = defaultOfferFactory) {
    this.offerFactory = offerFactory
  }

  public setOfferFactory(factory: MembershipOfferFactory): void {
    this.offerFactory = factory
  }

  public async ensureEmployeeCredential(params: {
    orgTenantId: string
    userId: string
    role: string
    department?: string
    source: 'membership' | 'internal_contact' | 'onboarding'
    walletTenantId?: string
    displayName?: string
  }): Promise<{ outcome: MembershipOfferOutcome; reason?: string; walletTenantId?: string }> {
    const walletTenantId = params.walletTenantId || resolveWallet(params.userId).walletTenantId
    if (!walletTenantId) return { outcome: 'skipped', reason: 'no wallet' }

    const orgName = getTenantById(params.orgTenantId)?.label || 'Organization'
    const role = params.role || 'employee'
    const fingerprint = fingerprintOf([
      params.orgTenantId,
      params.userId,
      role.toLowerCase(),
      params.department || '',
      params.source,
    ])
    const claims: EmployeeCredentialClaims = {
      orgTenantId: params.orgTenantId,
      orgName,
      userId: params.userId,
      memberRole: role,
      role,
      department: params.department,
      employmentStatus: 'active',
      source: params.source,
      issuedAt: new Date().toISOString(),
      platformName: process.env.PLATFORM_NAME || 'IdenEx Credentis',
      fingerprint,
    }

    let offer: { offerId: string; offerUri: string; expiresAt?: string }
    try {
      offer = await this.offerFactory({
        credentialType: EMPLOYEE_VC_TYPE,
        orgTenantId: params.orgTenantId,
        walletTenantId,
        claims: { ...claims },
      })
    } catch (error: any) {
      return { outcome: 'failed', reason: error?.message || 'offer failed', walletTenantId }
    }

    const outcome = queueOffer({
      walletTenantId,
      issuerTenantId: params.orgTenantId,
      sourceType: EMPLOYEE_OFFER_SOURCE_TYPE,
      sourceId: `${params.orgTenantId}:${params.userId}`,
      credentialType: EMPLOYEE_VC_TYPE,
      offerUri: offer.offerUri,
      title: `Employee credential · ${orgName}`,
      body: params.displayName
        ? `${params.displayName} is recorded as ${role} at ${orgName}. Accept to present it when you act for the organization.`
        : `You are recorded as ${role} at ${orgName}. Accept to present it when you act for the organization.`,
      metadata: { ...claims, offerId: offer.offerId, expiresAt: offer.expiresAt },
      fingerprint,
    })
    return { outcome, walletTenantId }
  }

  public ensureEmployeeCredentialInBackground(
    params: Parameters<OrgMembershipCredentialService['ensureEmployeeCredential']>[0],
  ): void {
    void this.ensureEmployeeCredential(params).catch((error: any) => {
      logger.warn({ error: error?.message, orgTenantId: params.orgTenantId, userId: params.userId }, 'Employee credential offer failed')
    })
  }

  /** Internal contact linked to a wallet: offer an employee credential when we can see the holder. */
  public ensureEmployeeCredentialForWallet(params: {
    orgTenantId: string
    walletTenantId: string
    displayName?: string
    department?: string
  }): void {
    const holder = resolveUserByWallet(params.walletTenantId)
    if (!holder) return
    const membership = DatabaseManager.getDatabase()
      .prepare(
        `SELECT role FROM org_memberships WHERE user_id = ? AND org_tenant_id = ? AND status = 'active' LIMIT 1`,
      )
      .get(holder.userId, params.orgTenantId) as { role?: string } | undefined
    this.ensureEmployeeCredentialInBackground({
      orgTenantId: params.orgTenantId,
      userId: holder.userId,
      walletTenantId: holder.walletTenantId,
      role: membership?.role || 'employee',
      department: params.department,
      source: membership?.role ? 'membership' : 'internal_contact',
      displayName: params.displayName,
    })
  }

  public async ensureDelegationCredential(params: {
    orgTenantId: string
    delegationId: string
    delegatorUserId: string
    delegateUserId: string
    permissions: string[]
    maxAmount?: number
    currency?: string
    validFrom: string
    validUntil?: string
  }): Promise<{ outcome: MembershipOfferOutcome; reason?: string; walletTenantId?: string }> {
    const walletTenantId = resolveWallet(params.delegateUserId).walletTenantId
    if (!walletTenantId) return { outcome: 'skipped', reason: 'delegate has no wallet' }

    const orgName = getTenantById(params.orgTenantId)?.label || 'Organization'
    const permissions = [...new Set(params.permissions.map((value) => value.trim()).filter(Boolean))].sort()
    const fingerprint = fingerprintOf([
      params.orgTenantId,
      params.delegationId,
      params.delegatorUserId,
      params.delegateUserId,
      permissions.join(','),
      params.maxAmount,
      params.validFrom,
      params.validUntil,
    ])
    const claims: DelegationCredentialClaims = {
      orgTenantId: params.orgTenantId,
      orgName,
      delegationId: params.delegationId,
      delegatorUserId: params.delegatorUserId,
      delegateUserId: params.delegateUserId,
      permissions,
      maxAmount: params.maxAmount,
      currency: params.currency,
      validFrom: params.validFrom,
      validUntil: params.validUntil,
      issuedAt: new Date().toISOString(),
      platformName: process.env.PLATFORM_NAME || 'IdenEx Credentis',
      fingerprint,
    }

    let offer: { offerId: string; offerUri: string; expiresAt?: string }
    try {
      offer = await this.offerFactory({
        credentialType: DELEGATION_VC_TYPE,
        orgTenantId: params.orgTenantId,
        walletTenantId,
        claims: { ...claims },
      })
    } catch (error: any) {
      return { outcome: 'failed', reason: error?.message || 'offer failed', walletTenantId }
    }

    const outcome = queueOffer({
      walletTenantId,
      issuerTenantId: params.orgTenantId,
      sourceType: DELEGATION_OFFER_SOURCE_TYPE,
      sourceId: params.delegationId,
      credentialType: DELEGATION_VC_TYPE,
      offerUri: offer.offerUri,
      title: `Delegation · ${orgName}`,
      body: `You can act for ${orgName} within: ${permissions.join(', ') || 'the delegated scope'}. Accept to present it on workflow stages covered by this delegation.`,
      metadata: { ...claims, offerId: offer.offerId, expiresAt: offer.expiresAt },
      fingerprint,
    })
    return { outcome, walletTenantId }
  }

  public ensureDelegationCredentialInBackground(
    params: Parameters<OrgMembershipCredentialService['ensureDelegationCredential']>[0],
  ): void {
    void this.ensureDelegationCredential(params).catch((error: any) => {
      logger.warn({ error: error?.message, delegationId: params.delegationId }, 'Delegation credential offer failed')
    })
  }

  public resolveDelegationOffers(delegationId: string, reason: string): void {
    const now = new Date().toISOString()
    DatabaseManager.getDatabase()
      .prepare(
        `
        UPDATE wallet_pending_offers
        SET resolved_at = COALESCE(resolved_at, @now), last_attempt_at = @now,
            last_error = CASE WHEN last_error IS NULL OR last_error = '' THEN @reason ELSE last_error END
        WHERE source_type = @sourceType AND source_id = @sourceId AND resolved_at IS NULL
      `,
      )
      .run({ now, reason, sourceType: DELEGATION_OFFER_SOURCE_TYPE, sourceId: delegationId })
  }

  /**
   * Queue an already-created EmploymentContractVC (employee onboarding approval) into the
   * holder's inbox, and offer the EmployeeCredential alongside it when the holder is known.
   */
  public queueEmploymentContractOffer(params: {
    orgTenantId: string
    offerUri: string
    employeeName?: string
    phone?: string
    email?: string
    role?: string
    department?: string
    onboardingRequestId: string
  }): { queued: boolean; walletTenantId?: string } {
    const walletTenantId = this.lookupWalletByContact(params.phone, params.email)
    if (!walletTenantId || !params.offerUri) return { queued: false }

    const holder = resolveUserByWallet(walletTenantId)
    const orgName = getTenantById(params.orgTenantId)?.label || 'Organization'
    const fingerprint = fingerprintOf([params.onboardingRequestId, params.offerUri.slice(-40)])
    const deeplink = toCredentialOfferDeeplink(params.offerUri)
    queueOffer({
      walletTenantId,
      issuerTenantId: params.orgTenantId,
      sourceType: EMPLOYMENT_CONTRACT_OFFER_SOURCE_TYPE,
      sourceId: params.onboardingRequestId,
      credentialType: EMPLOYMENT_CONTRACT_VC_TYPE,
      offerUri: deeplink,
      title: `Employment contract · ${orgName}`,
      body: `${params.employeeName || 'You'} completed onboarding at ${orgName}. Accept the employment contract credential.`,
      metadata: {
        orgTenantId: params.orgTenantId,
        orgName,
        onboardingRequestId: params.onboardingRequestId,
        employeeName: params.employeeName,
        role: params.role,
        department: params.department,
      },
      fingerprint,
    })

    if (holder) {
      this.ensureEmployeeCredentialInBackground({
        orgTenantId: params.orgTenantId,
        userId: holder.userId,
        walletTenantId,
        role: params.role || 'employee',
        department: params.department,
        source: 'onboarding',
        displayName: params.employeeName,
      })
    }

    return { queued: true, walletTenantId }
  }

  /** Queue the platform identity offer so registration shows up in the holder inbox. */
  public queuePlatformIdentityOffer(params: { walletTenantId: string; offerUri: string; displayName?: string }): MembershipOfferOutcome {
    if (!params.walletTenantId || !params.offerUri) return 'skipped'
    const fingerprint = fingerprintOf([params.walletTenantId, PLATFORM_IDENTITY_VC_TYPE])
    return queueOffer({
      walletTenantId: params.walletTenantId,
      issuerTenantId: params.walletTenantId,
      sourceType: PLATFORM_IDENTITY_OFFER_SOURCE_TYPE,
      sourceId: params.walletTenantId,
      credentialType: PLATFORM_IDENTITY_VC_TYPE,
      offerUri: toCredentialOfferDeeplink(params.offerUri),
      title: 'Platform identity',
      body: params.displayName
        ? `${params.displayName}, accept your platform identity credential to sign in and act on workflow stages.`
        : 'Accept your platform identity credential to sign in and act on workflow stages.',
      metadata: { platformName: process.env.PLATFORM_NAME || 'IdenEx Credentis', displayName: params.displayName },
      fingerprint,
    })
  }

  private lookupWalletByContact(phone?: string, email?: string): string | undefined {
    const db = DatabaseManager.getDatabase()
    if (phone) {
      const normalized = normalizePhone(phone)
      const hashes = [sha256(normalized), sha256(normalized.toLowerCase()), sha256(phone.trim().toLowerCase())]
      for (const hash of hashes) {
        const row = db.prepare('SELECT tenant_id as walletTenantId FROM ssi_users WHERE phone_hash = ? LIMIT 1').get(hash) as
          | { walletTenantId?: string }
          | undefined
        if (row?.walletTenantId) return row.walletTenantId
      }
    }
    if (email) {
      const hash = sha256(email.trim().toLowerCase())
      const row = db.prepare('SELECT tenant_id as walletTenantId FROM ssi_users WHERE email_hash = ? LIMIT 1').get(hash) as
        | { walletTenantId?: string }
        | undefined
      if (row?.walletTenantId) return row.walletTenantId
    }
    return undefined
  }
}

export const orgMembershipCredentialService = new OrgMembershipCredentialService()
