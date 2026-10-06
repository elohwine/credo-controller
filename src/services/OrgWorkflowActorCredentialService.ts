/**
 * IdenEx Credentis - Org Workflow Actor Credential Service
 *
 * Makes sure every person who is expected to act at a workflow stage on behalf of an
 * organization is *offered* an `OrgWorkflowActorCredential` (actor VC) scoped to that
 * organization, workflow and the stage actions they cover. When the person later performs the
 * stage action, the OIDC4VP request for that action accepts this credential (see
 * ProofVcPolicyService) and the platform checks its org/stage scope.
 *
 * Offers are queued into `wallet_pending_offers` (source_type `org_workflow_actor`) so they
 * surface in the actor's wallet inbox, and announced through the outbox (`wallet.vc.offered`).
 *
 * Design invariant (remodel handoff §10): credential possession never implies authorization —
 * the platform resolves the actor and owns workflow state; the credential is evidence.
 *
 * @module services/OrgWorkflowActorCredentialService
 */

import { createHash, randomUUID } from 'crypto'

import {
  ORG_WORKFLOW_ACTOR_OFFER_SOURCE_TYPE,
  ORG_WORKFLOW_ACTOR_VC_TYPE,
  OrgWorkflowActorClaims,
} from '../config/credentials/OrgWorkflowActorVC'
import { DatabaseManager } from '../persistence/DatabaseManager'
import { getTenantById } from '../persistence/TenantRepository'
import { WorkflowTemplateRepository } from '../persistence/WorkflowTemplateRepository'
import { rootLogger } from '../utils/pinoLogger'

import {
  OrgWorkflowActorService,
  ResolvedOrgWorkflowActor,
  orgWorkflowActorService,
  workflowActorTypeCandidates,
} from './OrgWorkflowActorService'
import { orgSetupProfileService } from './OrgSetupProfileService'
import { outboxService } from './OutboxService'
import { getDeclaredPrerequisites } from './workflow/prerequisites'

const logger = rootLogger.child({ module: 'OrgWorkflowActorCredentialService' })

export type ActorCredentialState = 'accepted' | 'offered' | 'not_offered' | 'not_applicable'

export interface ActorCredentialStatus {
  state: ActorCredentialState
  /** Latest unresolved offer (or accepted row) id in wallet_pending_offers. */
  offerRowId?: string
  offeredAt?: string
  acceptedAt?: string
  /** Stage actions the latest credential covers. */
  stageActions?: string[]
  /** True when the current assignment differs from what the latest credential covers. */
  stale?: boolean
}

export type ActorCredentialOfferOutcome =
  | 'offered'
  | 'already_offered'
  | 'already_accepted'
  | 'skipped'
  | 'failed'

export interface ActorCredentialOfferResult {
  outcome: ActorCredentialOfferOutcome
  reason?: string
  orgTenantId: string
  workflowType: string
  stageActions: string[]
  userId?: string
  walletTenantId?: string
  role?: string
  offerRowId?: string
  offerId?: string
}

export interface EnsureActorCredentialParams {
  orgTenantId: string
  workflowType: string
  /** Stage that triggered the check. The credential covers every stage this actor resolves for. */
  stageAction: string
  /** Already-resolved actor (skips resolution). */
  actor?: ResolvedOrgWorkflowActor
  /** Re-offer even when an identical credential was already accepted. */
  force?: boolean
  /** Free-text reason stored with the offer (e.g. `stage_assignment`, `manual`). */
  reason?: string
}

export interface EnsureOrganizationActorCredentialsResult {
  offered: ActorCredentialOfferResult[]
  alreadyCovered: ActorCredentialOfferResult[]
  skipped: ActorCredentialOfferResult[]
  failed: ActorCredentialOfferResult[]
}

/** Pluggable OIDC4VCI offer factory (real issuer in production, fake in tests). */
export type ActorCredentialOfferFactory = (input: {
  orgTenantId: string
  walletTenantId: string
  claims: OrgWorkflowActorClaims
}) => Promise<{ offerId: string; offerUri: string; expiresAt?: string }>

interface PendingOfferRow {
  id: string
  tenant_id: string
  source_id: string | null
  metadata: string | null
  created_at: string | null
  accepted_at: string | null
  resolved_at: string | null
}

const workflowTemplateRepository = new WorkflowTemplateRepository()

/** Plain wording for the people who receive the role card (no workflow jargon). */
const WORKFLOW_PEOPLE_LABEL: Record<string, string> = {
  field_execution_fept: 'field jobs',
  internal_requisitions: 'purchase requests',
  accounts_payable: 'supplier payments',
  payment_collection: 'payment collection',
}

const STAGE_PEOPLE_LABEL: Record<string, string> = {
  assign_field_worker: 'doing the job',
  inspect_site: 'checking the site',
  review_completion: 'reviewing finished work',
  acknowledge_execution: 'signing off',
  trigger_payout: 'releasing payment',
  approve_requisition: 'approving requests',
  finance_approve_requisition: 'approving requests for finance',
  release_funds: 'releasing funds',
  record_payment: 'recording payments',
  acknowledge_remittance: 'confirming payments received',
}

function describeWorkflowForPeople(workflowType: string): string {
  const key = String(workflowType || '').toLowerCase()
  return WORKFLOW_PEOPLE_LABEL[key] || key.replace(/_/g, ' ')
}

function describeStageForPeople(stageAction: string): string {
  const key = String(stageAction || '').toLowerCase()
  return STAGE_PEOPLE_LABEL[key] || key.replace(/_/g, ' ')
}

function normalizeStage(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function parseMetadata(raw: string | null | undefined): Record<string, any> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function actorCredentialFingerprint(input: {
  orgTenantId: string
  userId: string
  workflowType: string
  stageActions: string[]
  role: string
}): string {
  const canonical = [
    input.orgTenantId,
    input.userId,
    input.workflowType.toLowerCase(),
    [...new Set(input.stageActions.map(normalizeStage))].sort().join(','),
    input.role.toLowerCase(),
  ].join('|')
  return createHash('sha256').update(canonical).digest('hex').slice(0, 32)
}

export function actorCredentialSourceId(orgTenantId: string, workflowType: string): string {
  return `${orgTenantId}:${workflowType.toLowerCase()}`
}

/** Build the wallet-facing OIDC4VCI deeplink from the issuer offer URI. */
export function toCredentialOfferDeeplink(credentialOfferUri: string): string {
  if (!credentialOfferUri) return ''
  if (credentialOfferUri.startsWith('openid-credential-offer://')) return credentialOfferUri
  return `openid-credential-offer://?credential_offer_uri=${encodeURIComponent(credentialOfferUri)}`
}

async function defaultOfferFactory(input: {
  orgTenantId: string
  walletTenantId: string
  claims: OrgWorkflowActorClaims
}): Promise<{ offerId: string; offerUri: string; expiresAt?: string }> {
  const { credentialIssuanceService } = await import('./CredentialIssuanceService')
  const result = await credentialIssuanceService.createOffer({
    credentialType: ORG_WORKFLOW_ACTOR_VC_TYPE,
    claims: input.claims,
    tenantId: input.orgTenantId,
    // Actor credentials are claimed from the inbox at the holder's convenience.
    expiresInMs: 7 * 24 * 60 * 60 * 1000,
  })
  return {
    offerId: result.offerId,
    offerUri: toCredentialOfferDeeplink(result.credential_offer_uri || result.credential_offer_deeplink),
    expiresAt: result.expiresAt,
  }
}

export class OrgWorkflowActorCredentialService {
  private offerFactory: ActorCredentialOfferFactory

  constructor(
    private readonly actorService: OrgWorkflowActorService = orgWorkflowActorService,
    offerFactory: ActorCredentialOfferFactory = defaultOfferFactory,
  ) {
    this.offerFactory = offerFactory
  }

  /** Test hook / runtime override of the OIDC4VCI offer factory. */
  public setOfferFactory(factory: ActorCredentialOfferFactory): void {
    this.offerFactory = factory
  }

  /**
   * Stage actions declared by the organization's configured template(s) for a workflow type.
   */
  public listStageActions(orgTenantId: string, workflowType: string): string[] {
    const wanted = new Set(
      [workflowType, ...workflowActorTypeCandidates(workflowType)].map((value) => value.toLowerCase()),
    )
    const templates = workflowTemplateRepository
      .listByTenantId(orgTenantId)
      .filter((template) => wanted.has(String(template.workflowType || '').toLowerCase()) || wanted.has(template.id))

    const stageActions = new Set<string>()
    const sources = templates.length > 0 ? templates : [{ id: workflowType, workflowType, prerequisites: undefined }]
    for (const template of sources) {
      const prerequisites = getDeclaredPrerequisites(template as any, [workflowType, template.id])
      for (const item of prerequisites) {
        if (item.key === 'stage_actor' && item.stageAction) {
          stageActions.add(normalizeStage(item.stageAction))
        }
      }
    }
    return Array.from(stageActions)
  }

  /**
   * Every stage action in this workflow that resolves to the given member.
   */
  public coveredStageActions(orgTenantId: string, workflowType: string, userId: string): string[] {
    return this.listStageActions(orgTenantId, workflowType).filter((stageAction) => {
      const resolved = this.actorService.resolveActor({ orgTenantId, workflowType, stageAction })
      return !OrgWorkflowActorService.needsAssignment(resolved) && resolved.userId === userId
    })
  }

  /**
   * Latest actor-credential status for a member on a workflow (accepted / offered / not offered).
   */
  public getStatus(orgTenantId: string, workflowType: string, walletTenantId: string | undefined, expectedFingerprint?: string): ActorCredentialStatus {
    if (!walletTenantId) return { state: 'not_applicable' }
    const db = DatabaseManager.getDatabase()
    let rows: PendingOfferRow[] = []
    try {
      rows = db
        .prepare(
          `
          SELECT id, tenant_id, source_id, metadata, created_at, accepted_at, resolved_at
          FROM wallet_pending_offers
          WHERE tenant_id = ?
            AND source_type = ?
            AND source_id = ?
          ORDER BY datetime(created_at) DESC
          LIMIT 20
        `,
        )
        .all(walletTenantId, ORG_WORKFLOW_ACTOR_OFFER_SOURCE_TYPE, actorCredentialSourceId(orgTenantId, workflowType)) as PendingOfferRow[]
    } catch (error: any) {
      logger.warn({ error: error.message }, 'wallet_pending_offers unavailable; reporting actor credential as not offered')
      return { state: 'not_offered' }
    }

    const accepted = rows.find((row) => row.accepted_at)
    const pending = rows.find((row) => !row.resolved_at && !row.accepted_at)

    if (pending) {
      const meta = parseMetadata(pending.metadata)
      return {
        state: 'offered',
        offerRowId: pending.id,
        offeredAt: pending.created_at || undefined,
        stageActions: Array.isArray(meta.stageActions) ? meta.stageActions : undefined,
        stale: expectedFingerprint ? meta.fingerprint !== expectedFingerprint : undefined,
      }
    }
    if (accepted) {
      const meta = parseMetadata(accepted.metadata)
      return {
        state: 'accepted',
        offerRowId: accepted.id,
        offeredAt: accepted.created_at || undefined,
        acceptedAt: accepted.accepted_at || undefined,
        stageActions: Array.isArray(meta.stageActions) ? meta.stageActions : undefined,
        stale: expectedFingerprint ? meta.fingerprint !== expectedFingerprint : undefined,
      }
    }
    return { state: 'not_offered' }
  }

  /**
   * Ensure the actor resolved for `stageAction` has been offered an actor credential covering
   * every stage they act on in this workflow. Idempotent: identical scope → no new offer.
   */
  public async ensureActorCredential(params: EnsureActorCredentialParams): Promise<ActorCredentialOfferResult> {
    const { orgTenantId } = params
    const workflowType = String(params.workflowType || '').trim()
    const stageAction = normalizeStage(params.stageAction)
    const base: ActorCredentialOfferResult = { outcome: 'skipped', orgTenantId, workflowType, stageActions: [stageAction] }

    if (!orgTenantId || !workflowType || !stageAction) {
      return { ...base, reason: 'orgTenantId, workflowType and stageAction are required' }
    }

    const actor = params.actor || this.actorService.resolveActor({ orgTenantId, workflowType, stageAction })
    if (OrgWorkflowActorService.needsAssignment(actor)) {
      return { ...base, reason: `stage actor is ${actor.mode}; configure an actor first`, role: actor.role }
    }
    if (!actor.userId || !actor.walletTenantId) {
      return {
        ...base,
        reason: 'resolved actor has no linked wallet',
        userId: actor.userId,
        role: actor.role,
      }
    }

    const covered = this.coveredStageActions(orgTenantId, workflowType, actor.userId)
    const stageActions = covered.length > 0 ? covered : [stageAction]
    const role = String(actor.role || 'member').toLowerCase()
    const fingerprint = actorCredentialFingerprint({
      orgTenantId,
      userId: actor.userId,
      workflowType,
      stageActions,
      role,
    })
    const result: ActorCredentialOfferResult = {
      ...base,
      stageActions,
      userId: actor.userId,
      walletTenantId: actor.walletTenantId,
      role,
    }

    const status = this.getStatus(orgTenantId, workflowType, actor.walletTenantId, fingerprint)
    if (!params.force) {
      if (status.state === 'offered' && status.stale === false) {
        return { ...result, outcome: 'already_offered', offerRowId: status.offerRowId }
      }
      if (status.state === 'accepted' && status.stale === false) {
        return { ...result, outcome: 'already_accepted', offerRowId: status.offerRowId }
      }
    }

    const tenant = getTenantById(orgTenantId)
    const now = new Date().toISOString()
    const claims: OrgWorkflowActorClaims = {
      orgTenantId,
      orgName: tenant?.label || 'Organization',
      orgIssuerDid: tenant?.issuerDid || undefined,
      userId: actor.userId,
      memberRole: actor.role,
      role,
      workflowType,
      stageActions,
      assignmentMode: actor.mode,
      assignedAt: now,
      issuedAt: now,
      platformName: process.env.PLATFORM_NAME || 'IdenEx Credentis',
      fingerprint,
    }

    let offer: { offerId: string; offerUri: string; expiresAt?: string }
    try {
      offer = await this.offerFactory({ orgTenantId, walletTenantId: actor.walletTenantId, claims })
    } catch (error: any) {
      logger.warn(
        { error: error?.message, orgTenantId, workflowType, userId: actor.userId },
        'Failed to create actor credential offer',
      )
      return { ...result, outcome: 'failed', reason: error?.message || 'offer creation failed' }
    }

    const db = DatabaseManager.getDatabase()
    const sourceId = actorCredentialSourceId(orgTenantId, workflowType)
    const rowId = `owa-${randomUUID()}`
    try {
      // Supersede any unresolved offer for an older scope so the inbox shows a single card.
      db.prepare(
        `
        UPDATE wallet_pending_offers
        SET resolved_at = @now,
            last_attempt_at = @now,
            last_error = CASE
              WHEN last_error IS NULL OR last_error = '' THEN 'superseded: actor assignment changed'
              ELSE last_error
            END
        WHERE tenant_id = @tenantId
          AND source_type = @sourceType
          AND source_id = @sourceId
          AND resolved_at IS NULL
          AND accepted_at IS NULL
      `,
      ).run({ now, tenantId: actor.walletTenantId, sourceType: ORG_WORKFLOW_ACTOR_OFFER_SOURCE_TYPE, sourceId })

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
        tenantId: actor.walletTenantId,
        issuerTenantId: orgTenantId,
        sourceType: ORG_WORKFLOW_ACTOR_OFFER_SOURCE_TYPE,
        sourceId,
        credentialType: ORG_WORKFLOW_ACTOR_VC_TYPE,
        offerUri: offer.offerUri,
        title: `Your role card · ${claims.orgName}`,
        body: `${claims.orgName} has given you a role for ${describeWorkflowForPeople(workflowType)}: ${stageActions
          .map(describeStageForPeople)
          .join(', ')}. Add it to your wallet and use it when it is your turn to confirm a step.`,
        metadata: JSON.stringify({
          ...claims,
          offerId: offer.offerId,
          expiresAt: offer.expiresAt,
          reason: params.reason || 'stage_assignment',
          triggerStageAction: stageAction,
        }),
        createdAt: now,
      })
    } catch (error: any) {
      logger.warn(
        { error: error?.message, orgTenantId, workflowType, userId: actor.userId },
        'Actor credential offer created but could not be queued in wallet_pending_offers',
      )
      return { ...result, outcome: 'failed', reason: error?.message || 'queueing failed', offerId: offer.offerId }
    }

    try {
      outboxService.enqueue({
        topic: 'wallet.vc.offered',
        aggregateKey: actor.walletTenantId,
        dedupeKey: `wpo:${actor.walletTenantId}:${ORG_WORKFLOW_ACTOR_OFFER_SOURCE_TYPE}:${sourceId}:${fingerprint}`,
        payload: {
          tenantId: actor.walletTenantId,
          issuerTenantId: orgTenantId,
          sourceType: ORG_WORKFLOW_ACTOR_OFFER_SOURCE_TYPE,
          sourceId,
          credentialType: ORG_WORKFLOW_ACTOR_VC_TYPE,
          offerUri: offer.offerUri.slice(0, 300),
          stageActions,
          queuedAt: now,
        },
      })
    } catch (error: any) {
      logger.warn({ error: error?.message }, 'Outbox enqueue for actor credential offer failed (non-fatal)')
    }

    logger.info(
      { orgTenantId, workflowType, stageActions, userId: actor.userId, mode: actor.mode, offerId: offer.offerId },
      'Actor credential offered',
    )
    return { ...result, outcome: 'offered', offerRowId: rowId, offerId: offer.offerId }
  }

  /**
   * Walk every configured workflow (or one) and make sure each resolved actor holds / was
   * offered an actor credential. Used after actor configuration changes and by the
   * "Offer actor credentials" setup action.
   */
  public async ensureForOrganization(
    orgTenantId: string,
    options: { workflowType?: string; force?: boolean; reason?: string } = {},
  ): Promise<EnsureOrganizationActorCredentialsResult> {
    const result: EnsureOrganizationActorCredentialsResult = { offered: [], alreadyCovered: [], skipped: [], failed: [] }

    const templates = workflowTemplateRepository.listByTenantId(orgTenantId)
    const workflowTypes = Array.from(
      new Set(
        [
          ...templates.map((template) => template.workflowType),
          ...orgSetupProfileService.get(orgTenantId).requestTypes,
        ].filter(Boolean),
      ),
    )
    const wanted = options.workflowType
      ? new Set([options.workflowType, ...workflowActorTypeCandidates(options.workflowType)].map((v) => v.toLowerCase()))
      : undefined

    for (const workflowType of workflowTypes) {
      if (wanted && !wanted.has(workflowType.toLowerCase())) continue
      const seenActors = new Set<string>()
      for (const stageAction of this.listStageActions(orgTenantId, workflowType)) {
        const actor = this.actorService.resolveActor({ orgTenantId, workflowType, stageAction })
        const actorKey = actor.userId || actor.walletTenantId || `${actor.mode}:${actor.role}`
        if (seenActors.has(actorKey)) continue
        seenActors.add(actorKey)

        const outcome = await this.ensureActorCredential({
          orgTenantId,
          workflowType,
          stageAction,
          actor,
          force: options.force,
          reason: options.reason,
        })
        if (outcome.outcome === 'offered') result.offered.push(outcome)
        else if (outcome.outcome === 'already_offered' || outcome.outcome === 'already_accepted') result.alreadyCovered.push(outcome)
        else if (outcome.outcome === 'failed') result.failed.push(outcome)
        else result.skipped.push(outcome)
      }
    }
    return result
  }

  /**
   * Fire-and-forget variant for request paths that must not fail because issuance is down.
   */
  public ensureActorCredentialInBackground(params: EnsureActorCredentialParams): void {
    void this.ensureActorCredential(params).catch((error: any) => {
      logger.warn({ error: error?.message, ...params, actor: undefined }, 'Background actor credential offer failed')
    })
  }

  public ensureForOrganizationInBackground(orgTenantId: string, options: { workflowType?: string; reason?: string } = {}): void {
    void this.ensureForOrganization(orgTenantId, options).catch((error: any) => {
      logger.warn({ error: error?.message, orgTenantId }, 'Background organization actor credential sweep failed')
    })
  }
}

export const orgWorkflowActorCredentialService = new OrgWorkflowActorCredentialService()
