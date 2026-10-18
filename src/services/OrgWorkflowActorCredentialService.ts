/**
 * IdenEx Credentis - Org Workflow Actor Credential Service
 *
 * Makes sure every person who acts for an organization has one staff card
 * (EmployeeCredential) whose claims list their role and every step they confirm.
 * A separate card per workflow is not offered. Cards already in a wallet are still
 * accepted at proof time when they match the organization and the step.
 *
 * Offers are queued into `wallet_pending_offers` (source_type `org_workflow_actor`) so they
 * surface in the actor's wallet inbox, and announced through the outbox (`wallet.vc.offered`).
 *
 * Design invariant (remodel handoff §10): credential possession never implies authorization —
 * the platform resolves the actor and owns workflow state; the credential is evidence.
 *
 * @module services/OrgWorkflowActorCredentialService
 */

import { createHash } from 'crypto'

import {
  ORG_WORKFLOW_ACTOR_OFFER_SOURCE_TYPE,
  ORG_WORKFLOW_ACTOR_VC_TYPE,
  OrgWorkflowActorClaims,
} from '../config/credentials/OrgWorkflowActorVC'
import { DatabaseManager } from '../persistence/DatabaseManager'
import { WorkflowTemplateRepository } from '../persistence/WorkflowTemplateRepository'
import { rootLogger } from '../utils/pinoLogger'

import {
  OrgWorkflowActorService,
  ResolvedOrgWorkflowActor,
  orgWorkflowActorService,
  workflowActorTypeCandidates,
} from './OrgWorkflowActorService'
import { orgSetupProfileService } from './OrgSetupProfileService'
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

export type ActorCredentialOfferOutcome = 'offered' | 'already_offered' | 'already_accepted' | 'skipped' | 'failed'

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
  resolve_safety_hold: 'sorting out safety holds',
  acknowledge_execution: 'signing off',
  trigger_payout: 'releasing payment',
  approve_requisition: 'approving requests',
  finance_approve_requisition: 'approving requests for finance',
  release_funds: 'releasing funds',
  record_payment: 'recording payments',
  acknowledge_remittance: 'confirming payments received',
  issue_receipt_vc: 'issuing receipts',
  issue_receipt: 'issuing receipts',
}

export function describeWorkflowForPeople(workflowType: string): string {
  const key = String(workflowType || '').toLowerCase()
  return WORKFLOW_PEOPLE_LABEL[key] || key.replace(/_/g, ' ')
}

export function describeStageForPeople(stageAction: string): string {
  const key = String(stageAction || '').toLowerCase()
  // Unknown stage names come from templates; strip the technical suffixes before showing them to people.
  return STAGE_PEOPLE_LABEL[key] || key.replace(/_(vc|credential|did)$/g, '').replace(/_/g, ' ')
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
      if (OrgWorkflowActorService.needsAssignment(resolved)) return false
      if (resolved.userId === userId) return true
      // A step that falls to a role ("a supervisor", "an owner") belongs to everyone in that
      // role, so each of their cards lists it.
      return this.actorService.roleStandIns(orgTenantId, resolved).some((member) => member.userId === userId)
    })
  }

  /** Every step this person confirms, across every workflow the organization runs. */
  public coveredStageActionsForMember(orgTenantId: string, userId: string): string[] {
    const stages = new Set<string>()
    const workflowTypes = new Set<string>(
      [
        ...workflowTemplateRepository.listByTenantId(orgTenantId).map((template) => template.workflowType),
        ...orgSetupProfileService.get(orgTenantId).requestTypes,
      ].filter(Boolean),
    )
    for (const workflowType of workflowTypes) {
      for (const stageAction of this.coveredStageActions(orgTenantId, workflowType, userId)) stages.add(stageAction)
    }
    return Array.from(stages).sort()
  }

  /**
   * Latest actor-credential status for a member on a workflow (accepted / offered / not offered).
   */
  public getStatus(
    orgTenantId: string,
    workflowType: string,
    walletTenantId: string | undefined,
    expectedFingerprint?: string,
  ): ActorCredentialStatus {
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
        .all(
          walletTenantId,
          ORG_WORKFLOW_ACTOR_OFFER_SOURCE_TYPE,
          actorCredentialSourceId(orgTenantId, workflowType),
        ) as PendingOfferRow[]
    } catch (error: any) {
      logger.warn(
        { error: error.message },
        'wallet_pending_offers unavailable; reporting actor credential as not offered',
      )
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
   * The person resolved for this step gets one staff card listing every step they confirm.
   * Identical role and steps produce no second offer. Callers that used to offer a card per
   * workflow land here and share that one card.
   */
  public async ensureActorCredential(params: EnsureActorCredentialParams): Promise<ActorCredentialOfferResult> {
    const { orgTenantId } = params
    const workflowType = String(params.workflowType || '').trim()
    const stageAction = normalizeStage(params.stageAction)
    const base: ActorCredentialOfferResult = {
      outcome: 'skipped',
      orgTenantId,
      workflowType,
      stageActions: [stageAction],
    }

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

    const stageActions = this.coveredStageActionsForMember(orgTenantId, actor.userId)
    const role = String(actor.role || 'member')
    const { orgMembershipCredentialService } = await import('./OrgMembershipCredentialService')
    const staff = await orgMembershipCredentialService.ensureEmployeeCredential({
      orgTenantId,
      userId: actor.userId,
      walletTenantId: actor.walletTenantId,
      role,
      source: 'membership',
      force: params.force,
      reason: params.reason,
    })
    return {
      ...base,
      outcome: staff.outcome,
      reason: staff.reason,
      stageActions,
      userId: actor.userId,
      walletTenantId: actor.walletTenantId,
      role: role.toLowerCase(),
    }
  }

  /**
   * Refresh the one staff card for each member (or one member). The card's claims list the
   * steps they confirm now. Used after who-does-what changes and from the team list.
   */
  public async ensureForOrganization(
    orgTenantId: string,
    options: { workflowType?: string; force?: boolean; reason?: string; userId?: string } = {},
  ): Promise<EnsureOrganizationActorCredentialsResult> {
    const result: EnsureOrganizationActorCredentialsResult = {
      offered: [],
      alreadyCovered: [],
      skipped: [],
      failed: [],
    }
    const members = DatabaseManager.getDatabase()
      .prepare(
        `SELECT user_id as userId, role FROM org_memberships
         WHERE org_tenant_id = ? AND status IN ('active', 'invited')`,
      )
      .all(orgTenantId) as Array<{ userId: string; role: string }>

    const { orgMembershipCredentialService } = await import('./OrgMembershipCredentialService')
    for (const member of members) {
      if (options.userId && member.userId !== options.userId) continue
      const stageActions = this.coveredStageActionsForMember(orgTenantId, member.userId)
      const staff = await orgMembershipCredentialService.ensureEmployeeCredential({
        orgTenantId,
        userId: member.userId,
        role: member.role,
        source: 'membership',
        force: options.force,
        reason: options.reason,
      })
      const outcome: ActorCredentialOfferResult = {
        outcome: staff.outcome,
        reason: staff.reason,
        orgTenantId,
        workflowType: options.workflowType || '',
        stageActions,
        userId: member.userId,
        walletTenantId: staff.walletTenantId,
        role: String(member.role || '').toLowerCase(),
      }
      if (staff.outcome === 'offered') result.offered.push(outcome)
      else if (staff.outcome === 'already_offered' || staff.outcome === 'already_accepted')
        result.alreadyCovered.push(outcome)
      else if (staff.outcome === 'failed') result.failed.push(outcome)
      else result.skipped.push(outcome)
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

  public ensureForOrganizationInBackground(
    orgTenantId: string,
    options: { workflowType?: string; reason?: string; userId?: string } = {},
  ): void {
    void this.ensureForOrganization(orgTenantId, options).catch((error: any) => {
      logger.warn({ error: error?.message, orgTenantId }, 'Background organization actor credential sweep failed')
    })
  }
}

export const orgWorkflowActorCredentialService = new OrgWorkflowActorCredentialService()
