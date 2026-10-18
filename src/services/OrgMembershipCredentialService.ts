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
import { ORG_WORKFLOW_ACTOR_OFFER_SOURCE_TYPE } from '../config/credentials/OrgWorkflowActorVC'
import { PLATFORM_IDENTITY_VC_TYPE } from '../config/credentials/PlatformIdentityVC'
import { DatabaseManager } from '../persistence/DatabaseManager'
import { getTenantById } from '../persistence/TenantRepository'
import { rootLogger } from '../utils/pinoLogger'

import { orgSetupProfileService } from './OrgSetupProfileService'
import {
  describeStageForPeople,
  orgWorkflowActorCredentialService,
  toCredentialOfferDeeplink,
} from './OrgWorkflowActorCredentialService'
import { outboxService } from './OutboxService'
import { credentialLifecycleService } from './ssi/CredentialLifecycleService'
import { findWalletTenantByContact } from './ssi/walletLookup'

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

/** `field_worker` → `field worker`, the words the People page uses. */
function describeRole(role: string): string {
  return String(role || 'member')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
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

/**
 * Why a person is getting a card they seem to already hold. Stored on the offer as
 * `metadata.replaces`; the phone and the website show it as a "Replaces your current card"
 * badge with the note, so the new offer does not look like a duplicate.
 */
export interface OfferReplacement {
  why: 'steps_changed' | 'role_changed' | 'sent_again' | 'scope_changed' | 'renewed' | 'disclosure'
  /** Plain words shown to the person, e.g. "Added: signing off. Your earlier card stops working once you accept this one." */
  note: string
  added?: string[]
  removed?: string[]
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
  metadata: Record<string, unknown> & { replaces?: OfferReplacement }
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

  // The person already accepted one of these: say so, even when the caller gave no detail,
  // so the new card never looks like a duplicate.
  const replaces: OfferReplacement | undefined =
    input.metadata.replaces ||
    (rows.some((row) => Boolean(row.accepted_at))
      ? { why: 'renewed', note: 'This replaces the one you already hold. Accept it to keep using it.' }
      : undefined)

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
    metadata: JSON.stringify({ ...input.metadata, ...(replaces ? { replaces } : {}), fingerprint: input.fingerprint }),
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

function matchingEmployeeOffer(
  walletTenantId: string,
  sourceId: string,
  fingerprint: string,
): 'already_offered' | 'already_accepted' | undefined {
  const rows = DatabaseManager.getDatabase()
    .prepare(
      `SELECT metadata, accepted_at, resolved_at FROM wallet_pending_offers
       WHERE tenant_id = ? AND source_type = ? AND source_id = ?
       ORDER BY datetime(created_at) DESC`,
    )
    .all(walletTenantId, EMPLOYEE_OFFER_SOURCE_TYPE, sourceId) as Array<{
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
    if (stored !== fingerprint) continue
    if (row.accepted_at) return 'already_accepted'
    if (!row.resolved_at) return 'already_offered'
  }
  return undefined
}

/** Pending per-workflow role cards are replaced by the one staff card. */
function retirePendingRoleCards(walletTenantId: string, orgTenantId: string): void {
  const now = new Date().toISOString()
  DatabaseManager.getDatabase()
    .prepare(
      `
      UPDATE wallet_pending_offers
      SET resolved_at = @now, last_attempt_at = @now,
          last_error = CASE WHEN last_error IS NULL OR last_error = '' THEN 'superseded: steps are on the staff card' ELSE last_error END
      WHERE tenant_id = @tenantId AND source_type = @sourceType AND source_id LIKE @sourcePrefix
        AND resolved_at IS NULL AND accepted_at IS NULL
    `,
    )
    .run({
      now,
      tenantId: walletTenantId,
      sourceType: ORG_WORKFLOW_ACTOR_OFFER_SOURCE_TYPE,
      sourcePrefix: `${orgTenantId}:%`,
    })
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
    /** Send a fresh card even if one is still waiting in the inbox (the "send again" button). */
    force?: boolean
    /**
     * Send a fresh card even when the same card was already accepted. The accepted card is
     * withdrawn once the new one is accepted (the "send again" button on an accepted card).
     */
    replaceAccepted?: boolean
    reason?: string
    /** Set when the role was changed on the People page; the inbox copy says so. */
    previousRole?: string
  }): Promise<{ outcome: MembershipOfferOutcome; reason?: string; walletTenantId?: string }> {
    const walletTenantId = params.walletTenantId || resolveWallet(params.userId).walletTenantId
    if (!walletTenantId) return { outcome: 'skipped', reason: 'no wallet' }

    const sourceId = `${params.orgTenantId}:${params.userId}`
    const force = Boolean(params.force || params.replaceAccepted)
    if (force) {
      const now = new Date().toISOString()
      DatabaseManager.getDatabase()
        .prepare(
          `
          UPDATE wallet_pending_offers
          SET resolved_at = @now, last_attempt_at = @now,
              last_error = CASE WHEN last_error IS NULL OR last_error = '' THEN 'superseded: sent again' ELSE last_error END
          WHERE tenant_id = @tenantId AND source_type = @sourceType AND source_id = @sourceId
            AND resolved_at IS NULL AND accepted_at IS NULL
        `,
        )
        .run({ now, tenantId: walletTenantId, sourceType: EMPLOYEE_OFFER_SOURCE_TYPE, sourceId })
    }

    const orgName = getTenantById(params.orgTenantId)?.label || 'Organization'
    const role = params.role || 'employee'
    const stageActions = orgWorkflowActorCredentialService.coveredStageActionsForMember(
      params.orgTenantId,
      params.userId,
    )
    const fingerprint = fingerprintOf([
      params.orgTenantId,
      params.userId,
      role.toLowerCase(),
      params.department || '',
      params.source,
      stageActions.join(','),
      // Cards issued before this reveal the whole step list. A new fingerprint sends a card
      // that can reveal one step at a time.
      'disclosure:per-step',
      // A replacement of an accepted card is a new card even when nothing about the person changed.
      // Only added when resending, so cards issued before this existed keep their fingerprint.
      ...(params.replaceAccepted ? [`resend:${Date.now()}`] : []),
    ])
    if (!force) {
      const same = matchingEmployeeOffer(walletTenantId, sourceId, fingerprint)
      if (same) {
        retirePendingRoleCards(walletTenantId, params.orgTenantId)
        return { outcome: same, walletTenantId }
      }
    }
    const stepText = stageActions.map(describeStageForPeople)
    const claims: EmployeeCredentialClaims = {
      orgTenantId: params.orgTenantId,
      orgName,
      userId: params.userId,
      memberRole: role,
      role,
      department: params.department,
      employmentStatus: 'active',
      source: params.source,
      stageActions,
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

    // What happens to the card they already hold. The organisation's rule decides whether it
    // stops now or only once the new card is accepted; the inbox copy says which.
    const held = credentialLifecycleService.acceptedStaffCards(walletTenantId, params.orgTenantId, params.userId)
    // "Send again" from the People table: the card they hold is fine, a fresh one simply replaces it.
    const sentAgain = Boolean(params.replaceAccepted || params.reason === 'manual')
    let earlierCard: 'withdrawn_now' | 'kept_until_accepted' | 'nothing_to_withdraw' = 'nothing_to_withdraw'
    if (held.length > 0) {
      const rule = orgSetupProfileService.get(params.orgTenantId).staffCardChange
      const changeReason = params.previousRole
        ? `role changed from ${params.previousRole} to ${role}`
        : sentAgain
          ? 'card sent again'
          : 'steps changed'
      earlierCard = sentAgain
        ? 'kept_until_accepted'
        : credentialLifecycleService.applyStaffCardChangeRule({
            walletTenantId,
            orgTenantId: params.orgTenantId,
            userId: params.userId,
            rule,
            next: { role, stageActions },
            reason: changeReason,
          })
    }

    const steps = stepText.length > 0 ? ` You use it to confirm: ${stepText.join(', ')}.` : ''
    const who = params.displayName ? `${params.displayName} works` : 'You work'
    const heldSteps = new Set(held[0]?.scope?.stageActions || [])
    const nextSteps = new Set(stageActions.map((item) => String(item).trim().toLowerCase()))
    const stepsUnchanged =
      held.length > 0 &&
      !params.previousRole &&
      !sentAgain &&
      [...nextSteps].every((item) => heldSteps.has(item)) &&
      [...heldSteps].every((item) => nextSteps.has(item))
    const change = params.previousRole
      ? `Your role at ${orgName} changed from ${describeRole(params.previousRole)} to ${describeRole(role)}. `
      : sentAgain
        ? `${orgName} sent your staff card again. `
        : stepsUnchanged
          ? `Your staff card at ${orgName} now shares only the step you are confirming. `
          : held.length > 0
            ? `The steps you confirm at ${orgName} changed. `
            : ''
    const earlier =
      earlierCard === 'withdrawn_now'
        ? ' Your earlier card no longer works; you can remove it from Records.'
        : earlierCard === 'kept_until_accepted'
          ? ' Your earlier card stops working once you accept this one; you can then remove it from Records.'
          : ''
    // What is different from the card they hold, in plain words, for the inbox badge.
    let replaces: OfferReplacement | undefined
    if (held.length > 0 || sentAgain) {
      const added = [...nextSteps].filter((item) => !heldSteps.has(item)).map(describeStageForPeople)
      const removed = [...heldSteps].filter((item) => !nextSteps.has(item)).map(describeStageForPeople)
      const diff = [
        added.length > 0 ? `Added: ${added.join(', ')}.` : '',
        removed.length > 0 ? `Removed: ${removed.join(', ')}.` : '',
      ]
        .filter(Boolean)
        .join(' ')
      replaces = {
        why: params.previousRole
          ? 'role_changed'
          : sentAgain
            ? 'sent_again'
            : stepsUnchanged
              ? 'disclosure'
              : 'steps_changed',
        note: `${change}${diff ? `${diff} ` : ''}${earlier.trim()}`.trim(),
        added,
        removed,
      }
    }
    const outcome = queueOffer({
      walletTenantId,
      issuerTenantId: params.orgTenantId,
      sourceType: EMPLOYEE_OFFER_SOURCE_TYPE,
      sourceId,
      credentialType: EMPLOYEE_VC_TYPE,
      offerUri: offer.offerUri,
      title: `Staff card · ${orgName}`,
      body: `${change}${who} at ${orgName} as ${describeRole(role)}.${steps} Accept it in your inbox.${earlier}`,
      metadata: {
        ...claims,
        offerId: offer.offerId,
        expiresAt: offer.expiresAt,
        reason: params.reason,
        previousRole: params.previousRole,
        earlierCard,
        ...(replaces ? { replaces } : {}),
      },
      fingerprint,
    })
    if (outcome === 'offered' || outcome === 'already_offered' || outcome === 'already_accepted') {
      retirePendingRoleCards(walletTenantId, params.orgTenantId)
    }
    return { outcome, walletTenantId }
  }

  /**
   * Called when a staff card is accepted into the wallet: the older accepted cards for the same
   * person and organisation are withdrawn, so only one staff card is valid per membership.
   */
  public staffCardAccepted(walletTenantId: string, acceptedRowId: string): void {
    const row = DatabaseManager.getDatabase()
      .prepare('SELECT source_id FROM wallet_pending_offers WHERE id = ? AND tenant_id = ? AND source_type = ? LIMIT 1')
      .get(acceptedRowId, walletTenantId, EMPLOYEE_OFFER_SOURCE_TYPE) as { source_id?: string } | undefined
    const [orgTenantId, userId] = String(row?.source_id || '').split(':')
    if (!orgTenantId || !userId) return
    credentialLifecycleService.revokeStaffCards({
      walletTenantId,
      orgTenantId,
      userId,
      keepRowId: acceptedRowId,
      reason: 'replaced by a newer staff card',
    })
  }

  /** The person left the organisation: every staff card they hold from it stops working. */
  public memberLeft(orgTenantId: string, userId: string, reason = 'left the organisation'): void {
    const walletTenantId = resolveWallet(userId).walletTenantId
    if (!walletTenantId) return
    credentialLifecycleService.revokeStaffCards({ walletTenantId, orgTenantId, userId, reason })
    const now = new Date().toISOString()
    DatabaseManager.getDatabase()
      .prepare(
        `UPDATE wallet_pending_offers
         SET resolved_at = @now, last_attempt_at = @now,
             last_error = CASE WHEN last_error IS NULL OR last_error = '' THEN @note ELSE last_error END
         WHERE tenant_id = @tenantId AND source_type = @sourceType AND source_id = @sourceId
           AND resolved_at IS NULL AND accepted_at IS NULL`,
      )
      .run({
        now,
        note: `withdrawn: ${reason}`,
        tenantId: walletTenantId,
        sourceType: EMPLOYEE_OFFER_SOURCE_TYPE,
        sourceId: `${orgTenantId}:${userId}`,
      })
  }

  public ensureEmployeeCredentialInBackground(
    params: Parameters<OrgMembershipCredentialService['ensureEmployeeCredential']>[0],
  ): void {
    void this.ensureEmployeeCredential(params).catch((error: any) => {
      logger.warn(
        { error: error?.message, orgTenantId: params.orgTenantId, userId: params.userId },
        'Employee credential offer failed',
      )
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
      .prepare(`SELECT role FROM org_memberships WHERE user_id = ? AND org_tenant_id = ? AND status = 'active' LIMIT 1`)
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
  public queuePlatformIdentityOffer(params: {
    walletTenantId: string
    offerUri: string
    displayName?: string
  }): MembershipOfferOutcome {
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
    return findWalletTenantByContact(phone, email)
  }
}

export const orgMembershipCredentialService = new OrgMembershipCredentialService()
