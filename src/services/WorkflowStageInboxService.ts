/**
 * Routes an organization workflow stage to the wallets that should act on it.
 *
 * Covers every request family the platform runs — fees, AP/AR, requisitions, FEPT / field,
 * HR / onboarding, department work, and the generic platform request types. The primary
 * recipient is the resolved stage actor (a department member wins over an owner fallback
 * when the request names a department). Active delegates whose scope covers the stage
 * get their own inbox card and are expected to present a DelegationCredential.
 */

import { randomUUID } from 'crypto'

import { DatabaseManager } from '../persistence/DatabaseManager'
import { rootLogger } from '../utils/pinoLogger'

import { orgWorkflowActorCredentialService } from './OrgWorkflowActorCredentialService'
import { orgWorkflowActorService, ROLE_FALLBACK_BY_STAGE_ACTION } from './OrgWorkflowActorService'
import { outboxService } from './OutboxService'

const logger = rootLogger.child({ module: 'WorkflowStageInboxService' })

export const WORKFLOW_STAGE_SOURCE_TYPE = 'workflow_stage_action'

export interface StageRoute {
  workflowType: string
  stageAction: string
}

export interface StageInboxRecipient {
  userId?: string
  walletTenantId: string
  role: string
  via: 'actor' | 'department' | 'delegation'
  delegationId?: string
}

const STAGE_PERMISSION_ALIASES: Record<string, string[]> = {
  approve_requisition: ['approve_requisition', 'request.approve', 'finance.approve', 'procurement.approve'],
  finance_approve_requisition: ['finance_approve_requisition', 'finance.approve', 'request.approve'],
  release_funds: ['release_funds', 'finance.release', 'request.approve'],
  record_payment: ['record_payment', 'finance.pay', 'payment.record', 'finance.payment', 'finance.approve', 'request.approve'],
  present_payment_proof: ['present_payment_proof', 'finance.pay', 'payment.proof'],
  acknowledge_remittance: ['acknowledge_remittance', 'finance.acknowledge'],
  issue_receipt_vc: ['issue_receipt_vc', 'finance.receipt'],
  assign_field_worker: ['assign_field_worker', 'field.assign', 'field.execute'],
  inspect_site: ['inspect_site', 'field.inspect', 'field.execute'],
  assess_risk: ['assess_risk', 'field.execute'],
  review_completion: ['review_completion', 'field.inspect', 'request.complete'],
  confirm_arrival: ['confirm_arrival', 'field.execute'],
  start_job: ['start_job', 'field.execute'],
  capture_evidence: ['capture_evidence', 'field.execute'],
  approve_onboarding: ['approve_onboarding', 'hr.approve', 'hr.onboarding'],
  issue_payslip: ['issue_payslip', 'payroll.issue', 'hr.payroll'],
  acknowledge_execution: ['acknowledge_execution', 'request.complete'],
  resolve_dispute: ['resolve_dispute', 'finance.dispute'],
}

function normalize(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
}

/**
 * Map any request / workflow label onto the workflow type and stage action whose
 * configured actor should receive the inbox card.
 */
export function resolveStageRoute(requestType: string, workflowType?: string): StageRoute {
  const request = normalize(requestType)
  const workflow = normalize(workflowType)
  const combined = `${request} ${workflow}`

  const pick = (fallbackWorkflow: string, stageAction: string): StageRoute => ({
    workflowType: workflow || fallbackWorkflow,
    stageAction,
  })

  // Field job sign-off and payout go to their own people, not the worker.
  if (/field\.signoff|field_signoff|acknowledge_execution/.test(request)) {
    return pick('field_execution_fept', 'acknowledge_execution')
  }
  if (/field\.payout|field_payout|trigger_payout/.test(request)) {
    return pick('field_execution_fept', 'trigger_payout')
  }
  if (/field\.review|field_review|review_completion/.test(request)) {
    return pick('field_execution_fept', 'review_completion')
  }
  if (/field\.inspection|field_inspection|inspect_site/.test(request)) {
    return pick('field_execution_fept', 'inspect_site')
  }
  if (/fept|field_execution|field\.|field_service|site_access|inspection|maintenance/.test(combined)) {
    return pick('field_execution_fept', 'assign_field_worker')
  }
  if (/requisition|procurement/.test(combined)) {
    return pick('internal_requisitions', 'approve_requisition')
  }
  if (/fee|school|tuition|education/.test(combined)) {
    return pick('education_fee_payment', 'record_payment')
  }
  if (/receivable|accounts_receivable|invoice|quote|collect|payment_collection|cash_counter|\bar_/.test(combined)) {
    return pick('accounts_receivable', 'record_payment')
  }
  if (/payable|accounts_payable|finance\.payment|finance\.expense|finance\.purchase|purchase_order|expense_claim|supplier|\bap_/.test(combined)) {
    const stage = /expense|purchase|supplier|approv/.test(combined) ? 'approve_requisition' : 'record_payment'
    return pick('accounts_payable', stage)
  }
  if (/payslip|payroll/.test(combined)) {
    return pick('employee_onboarding', 'issue_payslip')
  }
  if (/onboarding|offboarding|employee|delegation/.test(combined)) {
    return pick('employee_onboarding', 'approve_onboarding')
  }
  if (/receipt/.test(combined)) return pick(workflow || 'accounts_receivable', 'issue_receipt_vc')
  if (/dispute/.test(combined)) return pick(workflow || 'accounts_receivable', 'resolve_dispute')
  if (/payment|cash/.test(combined)) return pick(workflow || 'accounts_receivable', 'record_payment')
  if (/department|\bdept\b/.test(combined)) return pick(workflow || 'department_request', 'approve_requisition')

  return {
    workflowType: workflow || request || 'general',
    stageAction: 'approve_requisition',
  }
}

export function delegationCoversStage(
  permissions: string[],
  stageAction: string,
  requestType: string,
): boolean {
  const granted = permissions.map((value) => normalize(value)).filter(Boolean)
  if (granted.length === 0) return false
  if (granted.some((value) => value === '*' || value === 'all')) return true

  const stage = normalize(stageAction)
  const request = normalize(requestType)
  const aliases = new Set([stage, request, ...(STAGE_PERMISSION_ALIASES[stage] || [])])

  return granted.some((permission) => {
    if (aliases.has(permission)) return true
    for (const alias of aliases) {
      if (!alias) continue
      if (permission.includes(alias) || alias.includes(permission)) return true
    }
    return false
  })
}

function namedMember(
  orgTenantId: string,
  userId: string | undefined,
): { userId: string; walletTenantId: string; role: string } | undefined {
  const id = String(userId || '').trim()
  if (!id || id === 'owner' || id === 'stage-actor') return undefined
  const row = DatabaseManager.getDatabase()
    .prepare(
      `SELECT m.user_id AS userId, m.role AS role, u.tenant_id AS walletTenantId
       FROM org_memberships m
       LEFT JOIN ssi_users u ON u.id = m.user_id
       WHERE m.org_tenant_id = ? AND m.user_id = ? AND m.status = 'active'
       LIMIT 1`,
    )
    .get(orgTenantId, id) as { userId?: string; role?: string; walletTenantId?: string } | undefined
  if (!row?.userId || !row.walletTenantId) return undefined
  return { userId: row.userId, walletTenantId: row.walletTenantId, role: row.role || 'member' }
}

function organizationIdFor(orgTenantId: string): string | undefined {
  const row = DatabaseManager.getDatabase()
    .prepare(`SELECT id FROM organizations WHERE tenant_id = ? AND status = 'active' LIMIT 1`)
    .get(orgTenantId) as { id?: string } | undefined
  return row?.id
}

function departmentActor(params: {
  orgTenantId: string
  organizationId: string
  departmentId: string
  stageAction: string
}): StageInboxRecipient | undefined {
  const preferredRoles = new Set(
    (ROLE_FALLBACK_BY_STAGE_ACTION[params.stageAction] || []).map((role) => role.toLowerCase()),
  )
  const rows = DatabaseManager.getDatabase()
    .prepare(
      `
      SELECT p.subject_ref AS userId, u.tenant_id AS walletTenantId, m.role AS role
      FROM organization_memberships om
      JOIN people p ON p.id = om.person_id
      JOIN org_memberships m ON m.user_id = p.subject_ref AND m.org_tenant_id = ? AND m.status = 'active'
      LEFT JOIN ssi_users u ON u.id = p.subject_ref
      WHERE om.organization_id = ? AND om.department_id = ? AND om.membership_status = 'active'
    `,
    )
    .all(params.orgTenantId, params.organizationId, params.departmentId) as Array<{
    userId?: string
    walletTenantId?: string
    role?: string
  }>

  const ranked = rows
    .filter((row) => row.walletTenantId)
    .sort((left, right) => {
      const leftRank = preferredRoles.has(String(left.role || '').toLowerCase()) ? 0 : 1
      const rightRank = preferredRoles.has(String(right.role || '').toLowerCase()) ? 0 : 1
      return leftRank - rightRank
    })
  const chosen = ranked[0]
  if (!chosen?.walletTenantId) return undefined
  return {
    userId: chosen.userId,
    walletTenantId: chosen.walletTenantId,
    role: chosen.role || 'member',
    via: 'department',
  }
}

function activeDelegates(params: {
  organizationId: string
  delegatorUserId: string
  stageAction: string
  requestType: string
  amount?: number
}): StageInboxRecipient[] {
  const now = new Date().toISOString()
  const rows = DatabaseManager.getDatabase()
    .prepare(
      `
      SELECT d.id AS delegationId, d.scope_json AS scopeJson, d.valid_until AS validUntil,
             delegate.subject_ref AS delegateUserId, u.tenant_id AS walletTenantId, m.role AS role
      FROM delegations d
      JOIN people delegator ON delegator.id = d.delegator_person_id
      JOIN people delegate ON delegate.id = d.delegate_person_id
      LEFT JOIN ssi_users u ON u.id = delegate.subject_ref
      LEFT JOIN organizations o ON o.id = d.organization_id
      LEFT JOIN org_memberships m
        ON m.user_id = delegate.subject_ref AND m.org_tenant_id = o.tenant_id AND m.status = 'active'
      WHERE d.organization_id = ?
        AND d.status = 'active'
        AND delegator.subject_ref = ?
        AND (d.valid_from IS NULL OR d.valid_from <= ?)
        AND (d.valid_until IS NULL OR d.valid_until >= ?)
    `,
    )
    .all(params.organizationId, params.delegatorUserId, now, now) as Array<{
    delegationId: string
    scopeJson: string
    delegateUserId?: string
    walletTenantId?: string
    role?: string
  }>

  const recipients: StageInboxRecipient[] = []
  for (const row of rows) {
    if (!row.walletTenantId) continue
    let scope: { permissions?: string[]; maxAmount?: number } = {}
    try {
      const parsed = JSON.parse(row.scopeJson || '{}')
      if (parsed && typeof parsed === 'object') scope = parsed
    } catch {
      scope = {}
    }
    const permissions = Array.isArray(scope.permissions) ? scope.permissions.map(String) : []
    if (!delegationCoversStage(permissions, params.stageAction, params.requestType)) continue
    if (typeof scope.maxAmount === 'number' && typeof params.amount === 'number' && params.amount > scope.maxAmount) {
      continue
    }
    recipients.push({
      userId: row.delegateUserId,
      walletTenantId: row.walletTenantId,
      role: row.role || 'delegate',
      via: 'delegation',
      delegationId: row.delegationId,
    })
  }
  return recipients
}

function orgDisplayName(orgTenantId: string): string | undefined {
  try {
    const row = DatabaseManager.getDatabase()
      .prepare(`SELECT name FROM organizations WHERE tenant_id = ? LIMIT 1`)
      .get(orgTenantId) as { name?: string } | undefined
    const name = String(row?.name || '').trim()
    return name || undefined
  } catch {
    return undefined
  }
}

function insertStageCard(params: {
  recipient: StageInboxRecipient
  orgTenantId: string
  sourceType: string
  sourceId: string
  credentialType: string
  offerUri: string
  title: string
  body: string
  metadata: Record<string, unknown>
}): boolean {
  const db = DatabaseManager.getDatabase()
  const now = new Date().toISOString()
  const cardSourceId =
    params.recipient.via === 'delegation' && params.recipient.delegationId
      ? `${params.sourceId}:delegation:${params.recipient.delegationId}`
      : params.sourceId
  // The phone shows "From: <org name>" and asks "Continue as <org name>?" — never an id.
  const orgName = orgDisplayName(params.orgTenantId)

  const inserted = db
    .prepare(
      `
      INSERT INTO wallet_pending_offers (
        id, tenant_id, issuer_tenant_id, source_type, source_id,
        credential_type, offer_uri, title, body, metadata, created_at,
        attempt_count, last_attempt_at
      )
      SELECT
        @id, @tenantId, @issuerTenantId, @sourceType, @sourceId,
        @credentialType, @offerUri, @title, @body, @metadata, @createdAt,
        0, @createdAt
      WHERE NOT EXISTS (
        SELECT 1 FROM wallet_pending_offers
        WHERE tenant_id = @tenantId AND source_type = @sourceType AND source_id = @sourceId AND resolved_at IS NULL
      )
    `,
    )
    .run({
      id: `wsa-${randomUUID()}`,
      tenantId: params.recipient.walletTenantId,
      issuerTenantId: params.orgTenantId,
      sourceType: params.sourceType,
      sourceId: cardSourceId,
      credentialType: params.credentialType,
      offerUri: params.offerUri,
      title: params.title,
      body: params.body,
      metadata: JSON.stringify({
        ...params.metadata,
        assigneeUserId: params.recipient.userId,
        assigneeRole: params.recipient.role,
        routedVia: params.recipient.via,
        delegationId: params.recipient.delegationId,
        targetOrgTenantId: params.orgTenantId,
        orgName,
        targetOrgName: orgName,
      }),
      createdAt: now,
    })

  if ((inserted.changes || 0) === 0) return false

  try {
    outboxService.enqueue({
      topic: 'wallet.vc.offered',
      aggregateKey: params.recipient.walletTenantId,
      dedupeKey: `wpo:${params.recipient.walletTenantId}:${params.sourceType}:${cardSourceId}`,
      payload: {
        tenantId: params.recipient.walletTenantId,
        issuerTenantId: params.orgTenantId,
        sourceType: params.sourceType,
        sourceId: cardSourceId,
        credentialType: params.credentialType,
        queuedAt: now,
      },
    })
  } catch (error: any) {
    logger.warn({ error: error?.message }, 'Stage inbox outbox enqueue failed (non-fatal)')
  }
  return true
}

export interface RouteStageInboxParams {
  orgTenantId: string
  requestType: string
  workflowType?: string
  sourceId: string
  title: string
  body: string
  departmentId?: string
  amount?: number
  /** Override the source_type. Defaults to workflow_stage_action. */
  sourceType?: string
  offerUri?: string
  credentialType?: string
  /** When set, the card goes to this member instead of the stage's configured actor. */
  assigneeUserId?: string
  /** Extra metadata for the card (for example the workflow run the card belongs to). */
  extraMetadata?: Record<string, unknown>
}

/**
 * Resolve who should act and write one inbox card per recipient (actor + covering delegates).
 * Also offers the actor credential to the primary actor so their stage VP can carry it.
 */
export function routeWorkflowStageInbox(params: RouteStageInboxParams): { routed: number; recipients: StageInboxRecipient[] } {
  const route = resolveStageRoute(params.requestType, params.workflowType)
  const named = namedMember(params.orgTenantId, params.assigneeUserId)
  const resolved = named
    ? { userId: named.userId, walletTenantId: named.walletTenantId, role: named.role, mode: 'configured_user' as const }
    : orgWorkflowActorService.resolveActor({
        orgTenantId: params.orgTenantId,
        workflowType: route.workflowType,
        stageAction: route.stageAction,
      })

  const organizationId = organizationIdFor(params.orgTenantId)
  let primary: StageInboxRecipient | undefined
  const ownerish = resolved.mode === 'owner_fallback' || resolved.mode === 'unassigned' || resolved.mode === 'role_fallback'
  if (params.departmentId && organizationId && ownerish) {
    primary = departmentActor({
      orgTenantId: params.orgTenantId,
      organizationId,
      departmentId: params.departmentId,
      stageAction: route.stageAction,
    })
  }
  if (!primary && resolved.walletTenantId) {
    primary = {
      userId: resolved.userId,
      walletTenantId: resolved.walletTenantId,
      role: resolved.role,
      via: 'actor',
    }
  }
  if (!primary) return { routed: 0, recipients: [] }

  const delegates =
    organizationId && primary.userId
      ? activeDelegates({
          organizationId,
          delegatorUserId: primary.userId,
          stageAction: route.stageAction,
          requestType: params.requestType,
          amount: params.amount,
        }).filter((delegate) => delegate.walletTenantId !== primary!.walletTenantId)
      : []

  const recipients = [primary, ...delegates]
  const offerUri = params.offerUri || `platform-request://${encodeURIComponent(params.sourceId)}`
  const sourceType = params.sourceType || WORKFLOW_STAGE_SOURCE_TYPE
  let routed = 0
  for (const recipient of recipients) {
    const delegated = recipient.via === 'delegation'
    const wrote = insertStageCard({
      recipient,
      orgTenantId: params.orgTenantId,
      sourceType,
      sourceId: params.sourceId,
      credentialType: params.credentialType || 'WorkflowStageAction',
      offerUri,
      title: delegated ? `${params.title} (delegated)` : params.title,
      body: delegated
        ? `${params.body} You are acting under a delegation from this stage's actor.`
        : params.body,
      metadata: {
        ...(params.extraMetadata || {}),
        requestType: params.requestType,
        workflowType: route.workflowType,
        stageAction: route.stageAction,
        departmentId: params.departmentId,
        amount: params.amount,
        orgTenantId: params.orgTenantId,
      },
    })
    if (wrote) routed += 1
  }

  if (primary.via !== 'delegation') {
    orgWorkflowActorCredentialService.ensureActorCredentialInBackground({
      orgTenantId: params.orgTenantId,
      workflowType: route.workflowType,
      stageAction: route.stageAction,
      reason: `stage_inbox:${params.sourceId}`,
    })
  }

  return { routed, recipients }
}

/**
 * Copy an already-addressed stage card to delegates of the primary actor.
 * Used by requisition and workflow-request notifiers that insert their own primary card.
 */
export function notifyStageDelegates(params: {
  orgTenantId: string
  actorUserId?: string
  stageAction: string
  requestType: string
  sourceType: string
  sourceId: string
  title: string
  body: string
  offerUri: string
  credentialType: string
  metadata?: Record<string, unknown>
  amount?: number
}): number {
  if (!params.actorUserId) return 0
  const organizationId = organizationIdFor(params.orgTenantId)
  if (!organizationId) return 0
  const delegates = activeDelegates({
    organizationId,
    delegatorUserId: params.actorUserId,
    stageAction: params.stageAction,
    requestType: params.requestType,
    amount: params.amount,
  })
  let routed = 0
  for (const recipient of delegates) {
    if (
      insertStageCard({
        recipient,
        orgTenantId: params.orgTenantId,
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        credentialType: params.credentialType,
        offerUri: params.offerUri,
        title: `${params.title} (delegated)`,
        body: `${params.body} You are acting under a delegation.`,
        metadata: { ...(params.metadata || {}), stageAction: params.stageAction, requestType: params.requestType },
      })
    ) {
      routed += 1
    }
  }
  return routed
}
