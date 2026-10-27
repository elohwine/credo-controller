import type { RestMultiTenantAgentModules } from '../../cliAgent'
import type { Request as ExRequest } from 'express'

import { Agent } from '@credo-ts/core'
import { randomUUID } from 'crypto'
import { Controller, Post, Get, Route, Tags, Body, Path, Request, Security } from 'tsoa'

import { SCOPES } from '../../enums'
import { StatusException } from '../../errors'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import { getTenantById } from '../../persistence/TenantRepository'
import { workflowRequestRepository, WorkflowRequest } from '../../persistence/WorkflowRequestRepository'
import { evaluateOrgEvidenceProof, extractPresentedCredentials } from '../../services/ActorCredentialProofService'
import { orgWorkflowActorCredentialService } from '../../services/OrgWorkflowActorCredentialService'
import { orgWorkflowActorService, requisitionApprovalSignMode } from '../../services/OrgWorkflowActorService'
import { outboxService } from '../../services/OutboxService'
import { platformRequestService } from '../../services/PlatformRequestService'
import { ReconciliationService } from '../../services/ReconciliationService'
import { ShortlinkService } from '../../services/ShortlinkService'
import { notifyStageDelegates } from '../../services/WorkflowStageInboxService'
import { requireDeviceTrust } from '../../services/deviceAssertion'
import { stageProofService, verifierModuleOf } from '../../services/ssi/StageProofService'
import { IdempotencyGuard } from '../../utils/IdempotencyGuard'
import { getIssuerApiKey } from '../../utils/serviceApiKey'

interface RequisitionItem {
  id: string
  name: string
  price: number
  quantity: number
}

interface RequisitionRequest {
  orgTenantId?: string
  assignToUserId?: string
  items: RequisitionItem[]
  totalAmount: number
  currency: string
  department: string
  vendor?: string
  /** How the money goes out: 'cash' (paid on release, no purchase order) or 'supplier' (purchase order on approval). */
  paymentMethod?: string
  notes?: string
}

interface ApproveRequest {
  vpToken?: string // JWT or JSON string representing the Verifiable Presentation
  idToken?: string
  approvalSignature?: string
  requestId: string
  state?: string
  presentationSubmission?: unknown
}

type ApprovalStage = 'manager' | 'finance'

interface ApprovalPresentationRequestResponse {
  requisitionId: string
  requestId: string
  presentationRequestUrl: string
  verifierDid: string
}

interface VpPresentationRequestResponse {
  requisitionId: string
  requestId: string
  presentationRequestUrl: string
  verifierDid: string
}

interface ReleaseRequest {
  amount?: number
  currency?: string
  description?: string
  /** Signature from the enrolled phone. Required only when the organisation asks for it. */
  deviceAssertion?: {
    deviceKeyId: string
    nonce: string
    purpose: string
    signedAt: string
    signature: string
  }
}

interface AckRequest {
  notes?: string
}

type RequisitionStageAction = 'finance_approval' | 'release_funds' | 'acknowledge_execution'

const REQUISITION_WORKFLOW_TYPE_CANDIDATES = [
  'requisition_workflow',
  'internal_requisition_approval',
  'ap_trust_workflow',
]

@Route('api/finance/requisitions')
@Tags('Internal Requisitions')
export class RequisitionController extends Controller {
  private getNaturalReplayKey(
    scope: 'approve' | 'release' | 'ack',
    tenantId: string,
    reference: string,
    stage?: string,
  ): string {
    if (scope === 'approve' && stage) {
      return `system:requisition:approve:${stage}:${tenantId}:${reference}`
    }
    return `system:requisition:${scope}:${tenantId}:${reference}`
  }

  private readonly atomicQueue = {
    enqueue: async <T>(fn: () => Promise<T>): Promise<T> => fn(),
  }

  private getTenantAgent(request: ExRequest): Agent<RestMultiTenantAgentModules> {
    return request.agent as unknown as Agent<RestMultiTenantAgentModules>
  }

  private resolvePolicyOrgTenantId(request: ExRequest): string | undefined {
    const tenantId = String((request as any)?.user?.tenantId || '').trim()
    if (!tenantId) return undefined
    const tenant = getTenantById(tenantId)
    if (tenant?.tenantType === 'ORG') {
      return tenantId
    }
    return undefined
  }

  /** True when the embedded wallet simply has no credential the organization accepts for the step. */
  private isMissingWalletCredentialError(error: any): boolean {
    const status = error instanceof StatusException ? (error as any).status : undefined
    return status === 400 && /does not (have|hold) a (role card|credential)/i.test(String(error?.message || ''))
  }

  /** PEX, DCQL and SD-JWT responses all read through the shared stage-proof helpers. */
  private extractApproverDid(verificationResult: any): string {
    return stageProofService.extractHolderDid(verificationResult)
  }

  private extractApproverRole(verificationResult: any): string {
    const idTokenRole = verificationResult?.idToken?.payload?.role
    if (typeof idTokenRole === 'string' && idTokenRole.length > 0) {
      return idTokenRole
    }
    for (const credential of extractPresentedCredentials(verificationResult)) {
      const role = credential.subject?.role ?? credential.subject?.memberRole
      if (typeof role === 'string' && role.length > 0) return role
    }
    return ''
  }

  private normalizeApproverRole(role: string | undefined): string {
    const value = (role || '').trim().toLowerCase()
    if (!value) return ''

    if (['owner', 'admin'].includes(value)) {
      return 'admin'
    }

    if (['manager', 'org manager', 'department manager', 'line manager'].includes(value)) {
      return 'manager'
    }

    if (['finance', 'finance officer', 'finance manager', 'finance_manager', 'cfo', 'accountant'].includes(value)) {
      return 'finance'
    }

    if (value === 'director') {
      return 'admin'
    }

    return ''
  }

  private getActorLabel(request: ExRequest, fallback: string): string {
    const user = (request as any).user as Record<string, any> | undefined
    const candidate = user?.displayName || user?.username || user?.name || user?.orgName
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim()
    }

    return fallback
  }

  private getApprovalStageForStatus(status: string): ApprovalStage {
    if (status === 'REQUISITION_CREATED') return 'manager'
    if (status === 'MANAGER_APPROVED') return 'finance'

    throw new StatusException('Requisition must be in REQUISITION_CREATED or MANAGER_APPROVED status for approval', 409)
  }

  private resolveMembership(
    orgTenantId: string,
    userId?: string,
  ): { role: string; walletTenantId?: string } | undefined {
    if (!userId) return undefined

    const db = DatabaseManager.getDatabase()
    const row = db
      .prepare(
        `
            SELECT m.role as role, u.tenant_id as walletTenantId
            FROM org_memberships m
            LEFT JOIN ssi_users u ON u.id = m.user_id
            WHERE m.user_id = ?
              AND m.org_tenant_id = ?
              AND m.status = 'active'
            LIMIT 1
        `,
      )
      .get(userId, orgTenantId) as { role: string; walletTenantId?: string } | undefined

    return row
  }

  private resolveDefaultAssignee(
    orgTenantId: string,
  ): { userId: string; role: string; walletTenantId?: string } | undefined {
    const db = DatabaseManager.getDatabase()
    const row = db
      .prepare(
        `
            SELECT m.user_id as userId, m.role as role, u.tenant_id as walletTenantId
            FROM org_memberships m
            LEFT JOIN ssi_users u ON u.id = m.user_id
            WHERE m.org_tenant_id = ?
              AND m.status = 'active'
            ORDER BY
              CASE m.role
                WHEN 'approver' THEN 1
                WHEN 'manager' THEN 2
                WHEN 'admin' THEN 3
                WHEN 'owner' THEN 4
                ELSE 99
              END,
              datetime(m.updated_at) DESC
            LIMIT 1
        `,
      )
      .get(orgTenantId) as { userId: string; role: string; walletTenantId?: string } | undefined

    return row
  }

  private normalizeMemberRoleForRouting(role?: string): string {
    const value = String(role || '')
      .trim()
      .toLowerCase()
    if (!value) return ''
    if (value === 'owner') return 'owner'
    if (value === 'admin') return 'admin'
    if (value === 'finance') return 'finance'
    if (value === 'manager') return 'manager'
    if (value === 'approver') return 'approver'
    return value
  }

  private resolveAssigneeByRolePriority(
    orgTenantId: string,
    preferredRoles: string[],
  ): { userId: string; role: string; walletTenantId?: string } | undefined {
    const db = DatabaseManager.getDatabase()
    const preferred = preferredRoles.map((role) => this.normalizeMemberRoleForRouting(role)).filter(Boolean)

    const rows = db
      .prepare(
        `
            SELECT m.user_id as userId, m.role as role, u.tenant_id as walletTenantId, m.updated_at as updatedAt
            FROM org_memberships m
            LEFT JOIN ssi_users u ON u.id = m.user_id
            WHERE m.org_tenant_id = ?
              AND m.status = 'active'
            ORDER BY datetime(m.updated_at) DESC
        `,
      )
      .all(orgTenantId) as Array<{ userId: string; role: string; walletTenantId?: string; updatedAt?: string }>

    if (rows.length === 0) return undefined

    const roleRank = (role?: string): number => {
      const normalized = this.normalizeMemberRoleForRouting(role)
      const exact = preferred.indexOf(normalized)
      if (exact >= 0) return exact
      const fallbackOrder = ['approver', 'manager', 'finance', 'admin', 'owner']
      const fallbackIndex = fallbackOrder.indexOf(normalized)
      return 100 + (fallbackIndex >= 0 ? fallbackIndex : 99)
    }

    const sorted = [...rows].sort((a, b) => {
      const rankDelta = roleRank(a.role) - roleRank(b.role)
      if (rankDelta !== 0) return rankDelta
      const aTime = Date.parse(a.updatedAt || '') || 0
      const bTime = Date.parse(b.updatedAt || '') || 0
      return bTime - aTime
    })

    const winner = sorted[0]
    if (!winner) return undefined

    return {
      userId: winner.userId,
      role: winner.role,
      walletTenantId: winner.walletTenantId,
    }
  }

  private toStageActorKeyForRequisitionAction(actionType: RequisitionStageAction): string {
    if (actionType === 'finance_approval') return 'finance_approve_requisition'
    if (actionType === 'release_funds') return 'release_funds'
    return 'acknowledge_execution'
  }

  private resolveConfiguredRequisitionStageAssignee(
    orgTenantId: string,
    actionType: RequisitionStageAction,
    preferredRoles: string[],
  ): { userId: string; role: string; walletTenantId?: string } | undefined {
    const stageAction = this.toStageActorKeyForRequisitionAction(actionType)

    for (const workflowType of REQUISITION_WORKFLOW_TYPE_CANDIDATES) {
      const resolved = orgWorkflowActorService.resolveActor({
        orgTenantId,
        workflowType,
        stageAction,
      })

      if (resolved.walletTenantId) {
        return {
          userId: resolved.userId || resolved.walletTenantId,
          role: resolved.role,
          walletTenantId: resolved.walletTenantId,
        }
      }
    }

    const byRole = this.resolveAssigneeByRolePriority(orgTenantId, preferredRoles)
    if (byRole?.walletTenantId) return byRole
    return this.resolveDefaultAssignee(orgTenantId)
  }

  private ensureWorkflowRequestReferenceForRequisition(requisitionId: string, orgTenantId: string): string {
    const existing = this.findWorkflowRequestForRequisition(requisitionId, orgTenantId)
    if (existing?.id) {
      return existing.id
    }

    // Self-heal historical/migrated requisitions that have lifecycle events but no request row.
    const synthesized = workflowRequestRepository.create({
      requesterTenantId: orgTenantId,
      targetOrgTenantId: orgTenantId,
      requestType: 'requisition',
      workflowType: 'internal_requisition_approval',
      payload: {
        requisitionId,
        synthesized: true,
        synthesizedReason: 'missing_workflow_request_reference',
      },
      status: 'approved',
    })

    return synthesized.id
  }

  private enqueueRequisitionStageActionNotification(params: {
    requisitionId: string
    orgTenantId: string
    workflowRequestId: string
    actionType: RequisitionStageAction
    title: string
    body: string
    preferredRoles: string[]
  }): void {
    const assignee = this.resolveConfiguredRequisitionStageAssignee(
      params.orgTenantId,
      params.actionType,
      params.preferredRoles,
    )

    if (!assignee?.walletTenantId) return

    // Make sure the person being asked to act holds (or is offered) the actor credential for
    // this stage so their OIDC4VP presentation can carry it. Non-blocking.
    orgWorkflowActorCredentialService.ensureActorCredentialInBackground({
      orgTenantId: params.orgTenantId,
      workflowType: REQUISITION_WORKFLOW_TYPE_CANDIDATES[0],
      stageAction: this.toStageActorKeyForRequisitionAction(params.actionType),
      reason: `requisition:${params.requisitionId}`,
    })

    const db = DatabaseManager.getDatabase()
    const now = new Date().toISOString()
    const sourceId = `${params.requisitionId}:${params.actionType}`
    const workflowRef = params.workflowRequestId
    const offerUri = `workflow-request://${encodeURIComponent(workflowRef)}`

    const inserted = db
      .prepare(
        `
            INSERT INTO wallet_pending_offers (
                id, tenant_id, issuer_tenant_id, source_type, source_id,
                credential_type, offer_uri, title, body, metadata, created_at,
                attempt_count, last_attempt_at
            )
            SELECT
                @id, @tenantId, @issuerTenantId, 'requisition_stage_action', @sourceId,
                'RequisitionStageAction', @offerUri, @title, @body, @metadata, @createdAt,
                0, @createdAt
            WHERE NOT EXISTS (
                SELECT 1
                FROM wallet_pending_offers
                WHERE tenant_id = @tenantId
                  AND source_type = 'requisition_stage_action'
                  AND source_id = @sourceId
                  AND resolved_at IS NULL
            )
        `,
      )
      .run({
        id: `rsa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        tenantId: assignee.walletTenantId,
        issuerTenantId: params.orgTenantId,
        sourceId,
        offerUri,
        title: params.title,
        body: params.body,
        metadata: JSON.stringify({
          requestId: params.workflowRequestId,
          requestType: 'requisition',
          requisitionId: params.requisitionId,
          stageAction: params.actionType,
          targetOrgTenantId: params.orgTenantId,
          assigneeUserId: assignee.userId,
          assigneeRole: assignee.role,
        }),
        createdAt: now,
      })

    if ((inserted.changes || 0) > 0) {
      outboxService.enqueue({
        topic: 'wallet.vc.offered',
        aggregateKey: assignee.walletTenantId,
        dedupeKey: `wpo:${assignee.walletTenantId}:requisition_stage_action:${sourceId}`,
        payload: {
          tenantId: assignee.walletTenantId,
          issuerTenantId: params.orgTenantId,
          sourceType: 'requisition_stage_action',
          sourceId,
          credentialType: 'RequisitionStageAction',
          offerUri: offerUri.slice(0, 300),
          queuedAt: now,
        },
      })
    }

    notifyStageDelegates({
      orgTenantId: params.orgTenantId,
      actorUserId: assignee.userId,
      stageAction: this.toStageActorKeyForRequisitionAction(params.actionType),
      requestType: 'requisition',
      sourceType: 'requisition_stage_action',
      sourceId,
      title: params.title,
      body: params.body,
      offerUri,
      credentialType: 'RequisitionStageAction',
      metadata: {
        requestId: params.workflowRequestId,
        requisitionId: params.requisitionId,
        targetOrgTenantId: params.orgTenantId,
      },
    })
  }

  private clearRequisitionStageActionNotification(requisitionId: string, actionType?: RequisitionStageAction): void {
    const db = DatabaseManager.getDatabase()
    const nowIso = new Date().toISOString()
    if (actionType) {
      const sourceId = `${requisitionId}:${actionType}`
      db.prepare(
        `
                UPDATE wallet_pending_offers
                SET resolved_at = COALESCE(resolved_at, @resolvedAt),
                    accepted_at = COALESCE(accepted_at, @acceptedAt),
                    last_attempt_at = @resolvedAt,
                    last_error = CASE
                        WHEN last_error IS NULL OR last_error = '' THEN 'resolved: requisition stage action completed'
                        ELSE last_error
                    END
                WHERE source_type = 'requisition_stage_action'
                  AND (source_id = @sourceId OR source_id LIKE @delegatedPrefix)
                  AND resolved_at IS NULL
            `,
      ).run({ sourceId, delegatedPrefix: `${sourceId}:delegation:%`, resolvedAt: nowIso, acceptedAt: nowIso })
      return
    }

    db.prepare(
      `
            UPDATE wallet_pending_offers
            SET resolved_at = COALESCE(resolved_at, @resolvedAt),
                accepted_at = COALESCE(accepted_at, @acceptedAt),
                last_attempt_at = @resolvedAt,
                last_error = CASE
                    WHEN last_error IS NULL OR last_error = '' THEN 'resolved: requisition stage action completed'
                    ELSE last_error
                END
            WHERE source_type = 'requisition_stage_action'
              AND source_id LIKE @sourcePrefix
              AND resolved_at IS NULL
        `,
    ).run({ sourcePrefix: `${requisitionId}:%`, resolvedAt: nowIso, acceptedAt: nowIso })
  }

  private describeAssignmentMode(mode: string): string {
    switch (mode) {
      case 'manual':
        return 'Assigned by requester'
      case 'configured_user':
        return 'Assigned to the configured approver for this stage'
      case 'configured_wallet':
        return 'Assigned to the configured approver wallet for this stage'
      case 'configured_role':
        return 'Assigned to the configured approver role for this stage'
      case 'policy_fallback':
        return "Assigned using the organization's fallback chain for this stage"
      case 'owner_fallback':
        return 'No approver configured for this stage; routed to the organization owner/admin'
      default:
        return 'Auto-assigned using approver/manager/admin/owner role priority'
    }
  }

  private resolveRequisitionAssignee(
    orgTenantId: string,
    assignToUserId?: string,
  ): { userId: string; role: string; walletTenantId?: string; mode: string } | undefined {
    if (assignToUserId) {
      const membership = this.resolveMembership(orgTenantId, assignToUserId)
      if (!membership) {
        throw new StatusException('Assigned approver is not an active organization member', 400)
      }

      return {
        userId: assignToUserId,
        role: membership.role,
        walletTenantId: membership.walletTenantId,
        mode: 'manual',
      }
    }

    // Configured stage actor for the approval stage (org readiness model). The resolver is alias-aware,
    // so a default saved under `internal_requisitions` applies to this `internal_requisition_approval` request.
    const configured = orgWorkflowActorService.resolveActor({
      orgTenantId,
      workflowType: 'internal_requisition_approval',
      stageAction: 'approve_requisition',
    })
    if (configured.walletTenantId && configured.mode !== 'owner_fallback') {
      return {
        userId: configured.userId || configured.walletTenantId,
        role: configured.role,
        walletTenantId: configured.walletTenantId,
        mode: configured.mode,
      }
    }

    const fallback = this.resolveDefaultAssignee(orgTenantId)
    if (!fallback) return undefined

    return {
      userId: fallback.userId,
      role: fallback.role,
      walletTenantId: fallback.walletTenantId,
      mode: ['owner', 'admin'].includes(this.normalizeMemberRoleForRouting(fallback.role))
        ? 'owner_fallback'
        : 'role_fallback',
    }
  }

  private findWorkflowRequestForRequisition(requisitionId: string, tenantId?: string): WorkflowRequest | undefined {
    if (!tenantId) return undefined

    const db = DatabaseManager.getDatabase()
    try {
      const row = db
        .prepare(
          `
                SELECT id
                FROM workflow_requests
                WHERE target_org_tenant_id = ?
                  AND request_type = 'requisition'
                  AND json_extract(payload, '$.requisitionId') = ?
                ORDER BY datetime(updated_at) DESC
                LIMIT 1
            `,
        )
        .get(tenantId, requisitionId) as { id: string } | undefined

      if (row?.id) {
        return workflowRequestRepository.findById(row.id)
      }
    } catch {
      // Fall back to repository scan if json_extract is unavailable.
    }

    const inboundRequests = workflowRequestRepository.listInbound(tenantId, {
      requestType: 'requisition',
      limit: 1000,
    })

    const assignedRequests = workflowRequestRepository.listAssignedToApprover(
      {
        walletTenantId: tenantId,
      },
      {
        requestType: 'requisition',
        limit: 1000,
      },
    )

    const allRequests = [...inboundRequests, ...assignedRequests]
    return allRequests.find((request) => request.payload?.requisitionId === requisitionId)
  }

  private enqueueApproverInboxNotification(params: {
    request: WorkflowRequest
    assigneeWalletTenantId?: string
    assigneeUserId?: string
    assigneeRole?: string
    stageAction?: string
  }): void {
    if (!params.assigneeWalletTenantId) return

    // Approval assignment: offer the approver their actor credential for the approval stage.
    orgWorkflowActorCredentialService.ensureActorCredentialInBackground({
      orgTenantId: params.request.targetOrgTenantId,
      workflowType: params.request.workflowType || REQUISITION_WORKFLOW_TYPE_CANDIDATES[0],
      stageAction: params.stageAction || 'approve_requisition',
      reason: `workflow_request:${params.request.id}`,
    })

    const db = DatabaseManager.getDatabase()
    const now = new Date().toISOString()
    const offerUri = `workflow-request://${encodeURIComponent(params.request.id)}`
    const approvalTitle = `Approval Request: ${params.request.requestType}`
    const approvalBody = 'You have been assigned a requisition approval request.'

    const inserted = db
      .prepare(
        `
            INSERT INTO wallet_pending_offers (
                id, tenant_id, issuer_tenant_id, source_type, source_id,
                credential_type, offer_uri, title, body, metadata, created_at,
                attempt_count, last_attempt_at
            )
            SELECT
                @id, @tenantId, @issuerTenantId, 'workflow_request_assignment', @sourceId,
                'WorkflowRequestApproval', @offerUri, @title, @body, @metadata, @createdAt,
                0, @createdAt
            WHERE NOT EXISTS (
                SELECT 1
                FROM wallet_pending_offers
                WHERE tenant_id = @tenantId
                  AND source_type = 'workflow_request_assignment'
                  AND source_id = @sourceId
                  AND resolved_at IS NULL
            )
        `,
      )
      .run({
        id: `wra-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        tenantId: params.assigneeWalletTenantId,
        issuerTenantId: params.request.targetOrgTenantId,
        sourceId: params.request.id,
        offerUri,
        title: approvalTitle,
        body: approvalBody,
        metadata: JSON.stringify({
          requestId: params.request.id,
          requestType: params.request.requestType,
          workflowType: params.request.workflowType,
          targetOrgTenantId: params.request.targetOrgTenantId,
          assigneeUserId: params.assigneeUserId,
          assigneeRole: params.assigneeRole,
          assignmentMode: params.request.assignmentMode,
        }),
        createdAt: now,
      })

    if ((inserted.changes || 0) > 0) {
      outboxService.enqueue({
        topic: 'wallet.vc.offered',
        aggregateKey: params.assigneeWalletTenantId,
        dedupeKey: `wpo:${params.assigneeWalletTenantId}:workflow_request_assignment:${params.request.id}`,
        payload: {
          tenantId: params.assigneeWalletTenantId,
          issuerTenantId: params.request.targetOrgTenantId,
          sourceType: 'workflow_request_assignment',
          sourceId: params.request.id,
          credentialType: 'WorkflowRequestApproval',
          offerUri: offerUri.slice(0, 300),
          queuedAt: now,
        },
      })
    }

    // Other owners who may stand in, and covering delegates, get the same card.
    notifyStageDelegates({
      orgTenantId: params.request.targetOrgTenantId,
      actorUserId: params.assigneeUserId,
      stageAction: params.stageAction || 'approve_requisition',
      requestType: params.request.requestType,
      workflowType: params.request.workflowType,
      sourceType: 'workflow_request_assignment',
      sourceId: params.request.id,
      title: approvalTitle,
      body: approvalBody,
      offerUri,
      credentialType: 'WorkflowRequestApproval',
      metadata: {
        requestId: params.request.id,
        workflowType: params.request.workflowType,
        targetOrgTenantId: params.request.targetOrgTenantId,
      },
    })
  }

  /** Closes the approval card for every wallet that received it (assignee, stand-in owners, delegates). */
  private clearApproverInboxNotification(requestId: string, _assigneeWalletTenantId?: string): void {
    const db = DatabaseManager.getDatabase()
    const nowIso = new Date().toISOString()

    db.prepare(
      `
            UPDATE wallet_pending_offers
            SET resolved_at = COALESCE(resolved_at, @resolvedAt),
                accepted_at = COALESCE(accepted_at, @acceptedAt),
                last_attempt_at = @resolvedAt,
                last_error = CASE
                    WHEN last_error IS NULL OR last_error = '' THEN 'resolved: workflow request finalized'
                    ELSE last_error
                END
            WHERE source_type = 'workflow_request_assignment'
              AND source_id = @sourceId
              AND resolved_at IS NULL
        `,
    ).run({
      sourceId: requestId,
      resolvedAt: nowIso,
      acceptedAt: nowIso,
    })
  }

  private assertApproverAuthorizedForStage(request: ExRequest, stage: ApprovalStage): void {
    const allowedRoles =
      stage === 'manager'
        ? ['owner', 'admin', 'manager', 'director']
        : ['owner', 'admin', 'finance', 'finance_manager', 'director']

    this.assertOrgRole(request, allowedRoles)
  }

  private assertProofRoleForStage(normalizedRole: string, stage: ApprovalStage): void {
    // Owner/admin credentials can represent both approval stages.
    if (normalizedRole === 'manager' || normalizedRole === 'finance' || normalizedRole === 'admin') {
      if (stage === 'manager' && normalizedRole !== 'manager') {
        if (normalizedRole === 'admin') return
        throw new StatusException('Manager approval requires a manager/owner/admin role proof', 403)
      }
      if (stage === 'finance' && normalizedRole !== 'finance') {
        if (normalizedRole === 'admin') return
        throw new StatusException('Finance approval requires a finance/owner/admin role proof', 403)
      }
      return
    }

    throw new StatusException('Unable to determine approver role from proof', 403)
  }

  private parseAuthorizationRedirect(redirectUri: string): {
    vpToken?: string
    state?: string
    presentationSubmission?: unknown
  } {
    const parsed = new URL(redirectUri)
    const queryParams = parsed.search ? new URLSearchParams(parsed.search) : new URLSearchParams()
    const hashParams = parsed.hash
      ? new URLSearchParams(parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash)
      : new URLSearchParams()

    const vpToken = queryParams.get('vp_token') || hashParams.get('vp_token') || undefined
    const state = queryParams.get('state') || hashParams.get('state') || undefined
    const presentationSubmissionRaw =
      queryParams.get('presentation_submission') || hashParams.get('presentation_submission') || undefined

    let presentationSubmission: unknown = undefined
    if (presentationSubmissionRaw) {
      try {
        presentationSubmission = JSON.parse(presentationSubmissionRaw)
      } catch {
        presentationSubmission = undefined
      }
    }

    return { vpToken, state, presentationSubmission }
  }

  private async issueApprovalCredential(
    id: string,
    tenantId: string,
    approverDid: string,
    approverName: string,
    approverRole: string,
    approvalMethod: 'oid4vp' | 'signature',
    stage: ApprovalStage,
  ): Promise<any> {
    const issuerApiUrl = process.env.ISSUER_API_URL || 'http://localhost:3000'
    const apiKey = getIssuerApiKey()

    const stageStatus = stage === 'manager' ? 'MANAGER_APPROVED' : 'APPROVED'
    const eventType = stage === 'manager' ? 'REQUISITION_MANAGER_APPROVED' : 'REQUISITION_FINANCE_APPROVED'

    const response = await fetch(`${issuerApiUrl}/custom-oidc/issuer/credential-offers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        credentials: [
          {
            credentialDefinitionId: 'ApprovalVC',
            format: 'jwt_vc_json',
            type: ['VerifiableCredential', 'ApprovalVC'],
            claims: {
              requisitionId: id,
              approverDid,
              approverRole,
              approvalMethod,
              approvalStage: stage,
              status: stageStatus,
              timestamp: new Date().toISOString(),
            },
          },
        ],
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to create ApprovalVC offer: ${error}`)
    }

    new ReconciliationService().recordEvent(id, eventType, 'portal', {
      approverDid,
      approverName,
      actorDid: approverDid,
      actorName: approverName,
      subjectDid: approverDid,
      subjectName: approverName,
      approverRole,
      tenantId,
    })

    const credentialOffer = (await response.json()) as Record<string, unknown>
    return {
      ...credentialOffer,
      requisitionId: id,
      approverDid,
      approvalMethod,
      approvalStage: stage,
      status: stageStatus,
    }
  }

  private assertRequisitionStatus(id: string, expected: string): void {
    const status = new ReconciliationService().getStatus(id)
    if (!status || status.status !== expected) {
      throw new StatusException(`Requisition must be in ${expected} status for this action`, 409)
    }
  }

  private hasVerifiedPresentationOrIdToken(verificationResult: any): boolean {
    return stageProofService.hasVerifiedPresentationOrIdToken(verificationResult)
  }

  private assertOrgRole(request: ExRequest, requiredRoles: string[] = ['owner', 'admin']): void {
    const user = (request as any).user
    if (!user || !user.tenantId) {
      throw new StatusException('Unauthorized', 401)
    }

    const tenant = getTenantById(user.tenantId)
    if (tenant?.tenantType === 'ORG') {
      const orgRole = user.orgRole
      if (!requiredRoles.includes(orgRole)) {
        throw new StatusException(`Insufficient permissions: must be one of [${requiredRoles.join(', ')}]`, 403)
      }
    }
  }

  private resolveRequisitionTenantId(request: ExRequest, orgTenantIdFromBody?: string): string {
    const user = (request as any).user

    // Org-scoped token path (current behavior)
    if (user?.orgRole && user?.tenantId) {
      return user.tenantId
    }

    // Personal-holder path: must explicitly target an org where user is active member.
    if (!user?.id) {
      throw new StatusException('Unauthorized', 401)
    }

    const orgTenantId = typeof orgTenantIdFromBody === 'string' ? orgTenantIdFromBody.trim() : ''
    if (!orgTenantId) {
      throw new StatusException('orgTenantId is required when initiating requisition from personal context', 400)
    }

    const tenant = getTenantById(orgTenantId)
    if (!tenant || tenant.tenantType !== 'ORG') {
      throw new StatusException('Target organization not found', 404)
    }

    const db = DatabaseManager.getDatabase()
    const membership = db
      .prepare('SELECT role FROM org_memberships WHERE user_id = ? AND org_tenant_id = ? AND status = ? LIMIT 1')
      .get(user.id, orgTenantId, 'active') as { role: string } | undefined

    if (!membership) {
      throw new StatusException('Not an active member of target organization', 403)
    }

    return orgTenantId
  }

  /**
   * Get all requisitions by looking at reconciliation_events.
   */
  @Get('')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async listRequisitions(@Request() request: ExRequest): Promise<any[]> {
    const user = (request as any).user
    // Guard: orgRole is only present in org-scoped JWTs (not personal wallet tokens)
    if (!user?.orgRole || !user?.tenantId) {
      throw new StatusException('Organization context required — use the org token to access requisitions', 403)
    }
    const tenantId: string = user.tenantId
    const workflowRequests = workflowRequestRepository.listInbound(tenantId, {
      requestType: 'requisition',
      limit: 500,
    })

    const db = DatabaseManager.getDatabase()

    // Find all REQUISITION_CREATED events and their current status
    const rows = db
      .prepare(
        `
            SELECT rs.provider_ref as id, rs.status, re.metadata, rs.updated_at
            FROM reconciliation_status rs
            JOIN reconciliation_events re ON rs.provider_ref = re.provider_ref
            WHERE re.event_type = 'REQUISITION_CREATED'
              AND rs.tenant_id = ?
            ORDER BY rs.updated_at DESC
        `,
      )
      .all(tenantId) as any[]

    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      metadata: r.metadata ? JSON.parse(r.metadata) : {},
      updatedAt: r.updated_at,
      workflowRequestId: workflowRequests.find((request) => request.payload?.requisitionId === r.id)?.id,
    }))
  }

  /**
   * Get Requisition details (timeline and status)
   */
  @Get('{id}')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async getRequisition(@Path() id: string, @Request() request: ExRequest): Promise<any> {
    const tenantId = (request as any).user?.tenantId as string | undefined
    const workflowRequest = this.findWorkflowRequestForRequisition(id, tenantId)

    return {
      summary: new ReconciliationService().getStatus(id),
      events: new ReconciliationService().getEvents(id),
      workflowRequestId: workflowRequest?.id,
      workflowRequestStatus: workflowRequest?.status,
      approvalSignMode: tenantId ? requisitionApprovalSignMode(orgWorkflowActorService.getPolicy(tenantId)) : 'both',
    }
  }

  /**
   * Raise a purchase request. New purchases live on the one request path (`/api/platform/requests`,
   * type `procurement.requisition`), the same one the portal and phone forms use, so they get the
   * money record, the inbox routing and the staff-card check from there. This endpoint stays for
   * older clients; the approve / release / acknowledge endpoints below finish requisitions raised
   * before the paths were merged.
   */
  @Post('request')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  @Security('jwt', ['wallet'])
  public async requestRequisition(@Body() body: RequisitionRequest, @Request() request: ExRequest): Promise<any> {
    try {
      const tenantId = this.resolveRequisitionTenantId(request, body.orgTenantId)
      const user = (request as any).user || {}
      const subjectRef = String(user.sub || user.id || '')
      if (!subjectRef) throw new StatusException('A signed-in person is required', 401)
      const items = Array.isArray(body.items) ? body.items : []
      const title =
        items
          .map((item) => item?.name)
          .filter(Boolean)
          .join(', ') ||
        body.vendor ||
        'Purchase request'
      const created = platformRequestService.create({
        tenantId,
        subjectRef,
        requestType: 'procurement.requisition',
        title,
        description: body.notes || undefined,
        amount: Number(body.totalAmount) || undefined,
        currency: body.currency || undefined,
        targetModule: 'finance',
        context: {
          department: body.department || undefined,
          supplierRef: body.paymentMethod === 'cash' ? undefined : body.vendor || undefined,
          paymentMethod: body.paymentMethod === 'cash' ? 'cash' : 'supplier',
        },
        items: items.map((item) => ({
          description: String(item?.name || 'Item'),
          quantity: Number(item?.quantity) || 1,
          unitPrice: Number(item?.price) || undefined,
        })),
      }) as any
      const submitted = platformRequestService.submit(created.id, tenantId, subjectRef) as any
      return {
        requisitionId: created.id,
        requestId: created.id,
        status: String(submitted?.status || 'submitted'),
      }
    } catch (error: any) {
      this.setStatus(error instanceof StatusException ? error.status : 500)
      return { error: error.message }
    }
  }

  /**
   * Approve a requisition via a Verifiable Presentation.
   */
  /**
   * Approve a requisition via a Verifiable Presentation.
   * FEPT §8: Accepts x-idempotency-key header for duplicate prevention.
   * FEPT §9: State transition + event recording wrapped in db.transaction().
   */
  @Post('{id}/approve')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async approveRequisition(
    @Path() id: string,
    @Body() body: ApproveRequest,
    @Request() request: ExRequest,
  ): Promise<any> {
    const tenantId = (request as any).user?.tenantId
    const tenantAgent = this.getTenantAgent(request)
    const db = DatabaseManager.getDatabase()

    // FEPT §8: Idempotency guard
    const idempotencyCheck = IdempotencyGuard.guard(db, request, tenantId, `approve:${id}`)
    if (idempotencyCheck.duplicate) {
      return idempotencyCheck.response
    }

    // Read current status before natural replay check so stage can be included in the key,
    // preventing manager-approval replay being served for the finance-approval stage.
    const currentForKey = new ReconciliationService().getStatus(id)
    const stageForKey = currentForKey?.status === 'MANAGER_APPROVED' ? 'finance' : 'manager'
    const naturalReplayKey = this.getNaturalReplayKey('approve', tenantId, id, stageForKey)
    const naturalReplay = IdempotencyGuard.checkAndReturn(db, naturalReplayKey, tenantId, `approve:${id}`)
    if (naturalReplay) {
      return naturalReplay.response
    }

    try {
      const current = new ReconciliationService().getStatus(id)
      if (!current?.status) {
        throw new StatusException('Requisition not found', 404)
      }

      const stage = this.getApprovalStageForStatus(current.status)
      this.assertApproverAuthorizedForStage(request, stage)

      let verificationResult: any
      let approvalMethod: 'oid4vp' | 'signature' = body.approvalSignature ? 'signature' : 'oid4vp'

      if (approvalMethod === 'oid4vp' && !body.requestId) {
        throw new StatusException('requestId is required for VP-based approval', 400)
      }

      const authorizationState = body.state || body.requestId

      if (approvalMethod === 'oid4vp') {
        const verifierModule = verifierModuleOf(tenantAgent as any)
        try {
          verificationResult = await verifierModule.getVerifiedAuthorizationResponse(body.requestId)
        } catch (error: any) {
          if (!body.vpToken && !body.idToken && !body.approvalSignature) {
            throw error
          }

          if (body.vpToken || body.idToken) {
            verificationResult = await verifierModule.verifyAuthorizationResponse({
              verificationSessionId: body.requestId,
              authorizationResponse: {
                vp_token: body.vpToken,
                id_token: body.idToken,
                presentation_submission: body.presentationSubmission,
                state: authorizationState,
              },
            })
          } else {
            approvalMethod = 'signature'
          }
        }
      }

      if (approvalMethod === 'oid4vp' && !this.hasVerifiedPresentationOrIdToken(verificationResult)) {
        if (!body.approvalSignature) {
          throw new StatusException(
            'Approval proof required: provide a verifiable presentation/id_token or approvalSignature',
            400,
          )
        }
        approvalMethod = 'signature'
      }

      const approverDid =
        approvalMethod === 'oid4vp'
          ? this.extractApproverDid(verificationResult)
          : (request as any).user?.did || (request as any).user?.id || 'did:key:org-approver'
      const approverName = this.getActorLabel(request, stage === 'manager' ? 'Manager' : 'Finance Officer')

      const proofRole =
        approvalMethod === 'oid4vp'
          ? this.extractApproverRole(verificationResult)
          : (request as any).user?.orgRole || ''

      const normalizedProofRole = this.normalizeApproverRole(proofRole)
      const normalizedRequestRole = this.normalizeApproverRole((request as any).user?.orgRole)
      let normalizedRole = normalizedProofRole || normalizedRequestRole || (stage === 'manager' ? 'manager' : 'finance')

      // Actor credential (OrgWorkflowActorCredential): the org explicitly designated this person
      // for the stage, so a credential scoped to this org + stage is the stage proof. A credential
      // for another org / stage is rejected outright.
      const stageActionKey = stage === 'manager' ? 'approve_requisition' : 'finance_approve_requisition'
      const signMode = requisitionApprovalSignMode(orgWorkflowActorService.getPolicy(tenantId))
      const singleConfirmation = stage === 'manager' && signMode === 'one'
      const actorProof =
        approvalMethod === 'oid4vp'
          ? evaluateOrgEvidenceProof(verificationResult, { orgTenantId: tenantId, stageAction: stageActionKey })
          : { present: false, valid: false }
      if (actorProof.present && !actorProof.valid) {
        throw new StatusException(`Organization credential rejected: ${actorProof.reason}`, 403)
      }
      if (actorProof.present && actorProof.valid) {
        normalizedRole = stage === 'manager' ? 'manager' : 'finance'
      } else {
        this.assertProofRoleForStage(normalizedRole, stage)
      }

      const approverRole = singleConfirmation ? 'Approver' : stage === 'manager' ? 'Manager' : 'Finance Officer'
      const stageStatus = stage === 'finance' || singleConfirmation ? 'APPROVED' : 'MANAGER_APPROVED'
      const eventType = singleConfirmation
        ? 'REQUISITION_APPROVED'
        : stage === 'manager'
          ? 'REQUISITION_MANAGER_APPROVED'
          : 'REQUISITION_FINANCE_APPROVED'
      const workflowRequest = this.findWorkflowRequestForRequisition(id, tenantId)

      // FEPT §9: Atomic state transition — status update + event + outbox in one transaction
      const result = db.transaction(() => {
        // Re-check status inside transaction to prevent race condition
        const recheck = new ReconciliationService().getStatus(id)
        if (recheck?.status !== current.status) {
          throw new StatusException('Requisition status changed concurrently — retry', 409)
        }

        new ReconciliationService().recordEvent(id, eventType, 'portal', {
          approverDid,
          approverName,
          actorDid: approverDid,
          actorName: approverName,
          subjectDid: approverDid,
          subjectName: approverName,
          approverRole,
          tenantId,
        })

        // FEPT §11: Enqueue VC issuance via outbox instead of direct HTTP call
        outboxService.enqueue({
          topic: 'workflow.vc.issue',
          aggregateKey: id,
          dedupeKey: `approval:${id}:${stage}`,
          payload: {
            credentialType: 'ApprovalVC',
            requisitionId: id,
            approverDid,
            approverRole,
            approvalMethod,
            approvalStage: singleConfirmation ? 'approval' : stage,
            status: stageStatus,
            tenantId,
          },
        })

        if (stage === 'manager' && !singleConfirmation && workflowRequest) {
          const previousAssigneeWalletTenantId = workflowRequest.assigneeWalletTenantId
          const financeActor = orgWorkflowActorService.resolveActor({
            orgTenantId: tenantId,
            workflowType: 'internal_requisition_approval',
            stageAction: 'finance_approve_requisition',
          })
          const nextAssignee = financeActor.walletTenantId
            ? {
                userId: financeActor.userId || financeActor.walletTenantId,
                walletTenantId: financeActor.walletTenantId,
                role: financeActor.role,
              }
            : this.resolveAssigneeByRolePriority(tenantId, ['finance_manager', 'finance', 'director', 'admin', 'owner'])
          if (nextAssignee) {
            workflowRequestRepository.assignRequest(workflowRequest.id, {
              assigneeUserId: nextAssignee.userId,
              assigneeWalletTenantId: nextAssignee.walletTenantId,
              assigneeRole: nextAssignee.role,
              assignmentMode: 'stage_routing',
              assignmentNote: 'Routed to finance for a separate confirmation',
            })
            this.clearApproverInboxNotification(workflowRequest.id, previousAssigneeWalletTenantId)
            const reassignedRequest = workflowRequestRepository.findById(workflowRequest.id) || workflowRequest
            this.enqueueApproverInboxNotification({
              request: reassignedRequest,
              assigneeWalletTenantId: nextAssignee.walletTenantId,
              assigneeUserId: nextAssignee.userId,
              assigneeRole: nextAssignee.role,
              stageAction: 'finance_approve_requisition',
            })
          }
        }

        // Final approval closes the assignment request and resolves the approver inbox card.
        if ((stage === 'finance' || singleConfirmation) && workflowRequest) {
          workflowRequestRepository.updateStatus(workflowRequest.id, 'approved', {
            approverId: (request as any).user?.id,
            approverRole: normalizedRole,
          })
          this.clearApproverInboxNotification(workflowRequest.id, workflowRequest.assigneeWalletTenantId)
        }

        if (stage === 'finance' || singleConfirmation) {
          const requisitionWorkflowRequestId = this.ensureWorkflowRequestReferenceForRequisition(id, tenantId)
          this.enqueueRequisitionStageActionNotification({
            requisitionId: id,
            orgTenantId: tenantId,
            workflowRequestId: requisitionWorkflowRequestId,
            actionType: 'release_funds',
            title: 'Release Funds Required',
            body: 'Approval is done. Release the money to continue.',
            preferredRoles: ['owner', 'admin'],
          })
        }

        const response = {
          requisitionId: id,
          approverDid,
          approvalMethod,
          approvalStage: singleConfirmation ? 'approval' : stage,
          status: stageStatus,
          signMode,
          issuedCredentialType: 'ApprovalVC',
        }

        // Record idempotency key inside transaction
        if (idempotencyCheck.key) {
          IdempotencyGuard.record(db, idempotencyCheck.key, tenantId, `approve:${id}`, response)
        }
        IdempotencyGuard.record(db, naturalReplayKey, tenantId, `approve:${id}`, response)

        return response
      })()

      if (result?.status === 'APPROVED') {
        void import('../../services/RequestHandoffService')
          .then(({ requestHandoffService }) => {
            requestHandoffService.continueFromWorkflowRequest({
              orgTenantId: tenantId,
              requestId: id,
              requestType: 'requisition',
              title: 'Requisition',
              actedByUserId: (request as any).user?.id,
            })
          })
          .catch(() => undefined)
      }

      return result
    } catch (error: any) {
      const status = error instanceof StatusException ? (error as any).status || 500 : 500
      this.setStatus(status)
      return { error: error.message }
    }
  }

  /**
   * Create a standards-compliant OIDC4VP request URL for requisition approval.
   * Any W3C-compliant wallet that supports OIDC4VP can scan and resolve this QR payload.
   */
  @Post('{id}/approval/request')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async createApprovalPresentationRequest(
    @Path() id: string,
    @Request() request: ExRequest,
  ): Promise<ApprovalPresentationRequestResponse> {
    const tenantAgent = this.getTenantAgent(request)

    try {
      // One request builder for every stage: DCQL first, Presentation Exchange as the fallback.
      const proof = await stageProofService.createStageProofRequest({
        verifierAgent: tenantAgent,
        orgTenantId: this.resolvePolicyOrgTenantId(request),
        actionKey: 'requisition_approval',
        reference: id,
        idPrefix: 'requisition-approval',
        descriptorName: 'Platform/Role Authorization Credential',
        purpose: 'Share your platform or role authorization credential to approve this requisition.',
      })
      return {
        requisitionId: id,
        requestId: proof.requestId,
        presentationRequestUrl: proof.presentationRequestUrl,
        verifierDid: proof.verifierDid,
      }
    } catch (error: any) {
      this.setStatus(500)
      throw new Error(`Unable to create approval VP request: ${error.message}`)
    }
  }

  /**
   * Server-side helper for portal embedded flow: holder signs a VP using wallet keys,
   * then the verifier validates it cryptographically before approval is issued.
   */
  @Post('{id}/approve/embedded-wallet')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async approveWithEmbeddedWallet(
    @Path() id: string,
    @Body() body: { requestId: string; presentationRequestUrl: string; walletId: string },
    @Request() request: ExRequest,
  ): Promise<any> {
    if (!body.requestId || !body.presentationRequestUrl || !body.walletId) {
      throw new StatusException('requestId, presentationRequestUrl and walletId are required', 400)
    }

    try {
      // Same embedded-wallet path as job cards (StageProofService): the person's credentials live
      // in their own wallet tenant, and the response is posted straight to the verifier session.
      let submitted: { vpToken?: string; idToken?: string; presentationSubmission?: unknown }
      try {
        submitted = await stageProofService.presentFromEmbeddedWallet({
          request,
          walletId: body.walletId,
          presentationRequestUrl: body.presentationRequestUrl,
          reference: id,
        })
      } catch (presentationError: any) {
        if (!this.isMissingWalletCredentialError(presentationError)) throw presentationError
        request.logger?.warn(
          { error: presentationError?.message, walletId: body.walletId },
          'Embedded wallet has no matching credential; falling back to signature-based approval',
        )
        return await this.approveRequisition(
          id,
          {
            requestId: body.requestId,
            approvalSignature: `embedded-wallet:${body.walletId}`,
          },
          request,
        )
      }

      const parsed = submitted
      if (!parsed.vpToken && !parsed.idToken) {
        throw new StatusException('Embedded wallet did not return vp_token or id_token', 500)
      }

      return await this.approveRequisition(
        id,
        {
          requestId: body.requestId,
          vpToken: parsed.vpToken,
          idToken: parsed.idToken,
          presentationSubmission: parsed.presentationSubmission,
        },
        request,
      )
    } catch (error: any) {
      const status = error instanceof StatusException ? (error as any).status || 500 : 500
      this.setStatus(status)
      return { error: error.message }
    }
  }

  /**
   * Release funds for an approved requisition and generate a Payment Link.
   */
  /**
   * Release funds for an approved requisition.
   * FEPT §8: Accepts x-idempotency-key header.
   * FEPT §9: Payment link creation + event + outbox in one db.transaction().
   */
  @Post('{id}/release')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async releaseFunds(
    @Path() id: string,
    @Body() body: ReleaseRequest,
    @Request() request: ExRequest,
  ): Promise<any> {
    this.assertOrgRole(request, ['owner', 'admin'])
    const tenantId = (request as any).user?.tenantId || 'default'
    const actorName = this.getActorLabel(request, 'Approver')
    const db = DatabaseManager.getDatabase()

    // FEPT §8: Idempotency guard
    const idempotencyCheck = IdempotencyGuard.guard(db, request, tenantId, `release:${id}`)
    if (idempotencyCheck.duplicate) {
      return idempotencyCheck.response
    }

    const naturalReplayKey = this.getNaturalReplayKey('release', tenantId, id)
    const naturalReplay = IdempotencyGuard.checkAndReturn(db, naturalReplayKey, tenantId, `release:${id}`)
    if (naturalReplay) {
      return naturalReplay.response
    }

    try {
      requireDeviceTrust({
        request,
        orgTenantId: tenantId,
        stageAction: 'release_funds',
        body,
        transaction: { requisitionId: id, amount: body.amount || 0, currency: body.currency || 'USD' },
      })
      this.assertRequisitionStatus(id, 'APPROVED')
      const paymentLinkId = randomUUID()
      const now = new Date().toISOString()
      const ttlHours = 336
      const expiryDate = new Date(Date.now() + ttlHours * 3600_000).toISOString()
      const amount = body.amount || 0
      const currency = body.currency || 'USD'

      // Generate Payment Link
      const { code, url } = ShortlinkService.create(
        'verification',
        paymentLinkId,
        {
          amount,
          currency,
          description: body.description || `Requisition Release ${id}`,
        },
        ttlHours,
      )

      // FEPT §9: Atomic release — payment link + event + outbox in one transaction
      const result = db.transaction(() => {
        // Re-check status inside transaction
        this.assertRequisitionStatus(id, 'APPROVED')

        db.prepare(
          `
                    INSERT INTO payment_links 
                        (id, merchant_id, description, amount, currency, invoice_ref, 
                         status, expiry, shortlink_code, shortlink_url, created_at, updated_at) 
                    VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)
                `,
        ).run(
          paymentLinkId,
          tenantId,
          body.description || `Requisition Release ${id}`,
          amount,
          currency,
          id,
          expiryDate,
          code,
          url,
          now,
          now,
        )

        new ReconciliationService().recordEvent(id, 'REQUISITION_RELEASED', 'portal', {
          amount,
          currency,
          paymentUrl: url,
          actorName,
          subjectName: actorName,
          tenantId,
        })

        // FEPT §11: Enqueue VC issuance via outbox
        outboxService.enqueue({
          topic: 'workflow.vc.issue',
          aggregateKey: id,
          dedupeKey: `release:${id}`,
          payload: {
            credentialType: 'ReleaseAuthorizationVC',
            requisitionId: id,
            paymentUrl: url,
            amount,
            currency,
            tenantId,
          },
        })

        this.clearRequisitionStageActionNotification(id, 'release_funds')
        const requisitionWorkflowRequestId = this.ensureWorkflowRequestReferenceForRequisition(id, tenantId)
        this.enqueueRequisitionStageActionNotification({
          requisitionId: id,
          orgTenantId: tenantId,
          workflowRequestId: requisitionWorkflowRequestId,
          actionType: 'acknowledge_execution',
          title: 'Acknowledge Completion Required',
          body: 'Funds released. Acknowledge execution to complete this requisition.',
          preferredRoles: ['manager', 'approver', 'finance', 'admin', 'owner'],
        })

        const response = {
          requisitionId: id,
          paymentLinkId,
          paymentUrl: url,
          shortlinkCode: code,
          status: 'RELEASED',
          issuedCredentialType: 'ReleaseAuthorizationVC',
        }

        if (idempotencyCheck.key) {
          IdempotencyGuard.record(db, idempotencyCheck.key, tenantId, `release:${id}`, response)
        }
        IdempotencyGuard.record(db, naturalReplayKey, tenantId, `release:${id}`, response)

        return response
      })()

      return result
    } catch (error: any) {
      const status = error instanceof StatusException ? (error as any).status || 500 : 500
      this.setStatus(status)
      return { error: error.message }
    }
  }

  /**
   * Create a VP presentation request URL for the release-funds action.
   */
  @Post('{id}/release/request')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async createReleasePresentationRequest(
    @Path() id: string,
    @Request() request: ExRequest,
  ): Promise<VpPresentationRequestResponse> {
    const tenantAgent = this.getTenantAgent(request)
    try {
      const proof = await stageProofService.createStageProofRequest({
        verifierAgent: tenantAgent,
        orgTenantId: this.resolvePolicyOrgTenantId(request),
        actionKey: 'requisition_release',
        reference: id,
        idPrefix: 'requisition-release',
        descriptorName: 'Platform/Role Authorization Credential',
        purpose:
          'Share your platform or role authorization credential to authorise funds release for this requisition.',
      })
      return {
        requisitionId: id,
        requestId: proof.requestId,
        presentationRequestUrl: proof.presentationRequestUrl,
        verifierDid: proof.verifierDid,
      }
    } catch (error: any) {
      this.setStatus(500)
      throw new Error(`Unable to create release VP request: ${error.message}`)
    }
  }

  /**
   * Server-side embedded-wallet variant of release: holder proves identity via VP before funds are released.
   */
  @Post('{id}/release/embedded-wallet')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async releaseWithEmbeddedWallet(
    @Path() id: string,
    @Body()
    body: {
      requestId: string
      presentationRequestUrl: string
      walletId: string
      amount?: number
      currency?: string
      description?: string
    },
    @Request() request: ExRequest,
  ): Promise<any> {
    if (!body.requestId || !body.presentationRequestUrl || !body.walletId) {
      throw new StatusException('requestId, presentationRequestUrl and walletId are required', 400)
    }
    try {
      // The person confirms with the wallet attached to their account (shared StageProofService path).
      await stageProofService.presentFromEmbeddedWallet({
        request,
        walletId: body.walletId,
        presentationRequestUrl: body.presentationRequestUrl,
        reference: id,
      })
      // VP verified — proceed with actual release using the existing releaseFunds handler
      return await this.releaseFunds(
        id,
        {
          amount: body.amount,
          currency: body.currency,
          description: body.description,
        },
        request,
      )
    } catch (error: any) {
      const status = error instanceof StatusException ? (error as any).status || 500 : 500
      this.setStatus(status)
      return { error: error.message }
    }
  }

  /**
   * Create a VP presentation request URL for the acknowledge action.
   */
  @Post('{id}/ack/request')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async createAckPresentationRequest(
    @Path() id: string,
    @Request() request: ExRequest,
  ): Promise<VpPresentationRequestResponse> {
    const tenantAgent = this.getTenantAgent(request)
    try {
      const proof = await stageProofService.createStageProofRequest({
        verifierAgent: tenantAgent,
        orgTenantId: this.resolvePolicyOrgTenantId(request),
        actionKey: 'requisition_ack',
        reference: id,
        idPrefix: 'requisition-ack',
        descriptorName: 'Platform/Role Authorization Credential',
        purpose: 'Share your platform or role authorization credential to acknowledge delivery for this requisition.',
      })
      return {
        requisitionId: id,
        requestId: proof.requestId,
        presentationRequestUrl: proof.presentationRequestUrl,
        verifierDid: proof.verifierDid,
      }
    } catch (error: any) {
      this.setStatus(500)
      throw new Error(`Unable to create ack VP request: ${error.message}`)
    }
  }

  /**
   * Server-side embedded-wallet variant of acknowledge: holder proves identity via VP before ack is recorded.
   */
  @Post('{id}/ack/embedded-wallet')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async acknowledgeWithEmbeddedWallet(
    @Path() id: string,
    @Body() body: { requestId: string; presentationRequestUrl: string; walletId: string; notes?: string },
    @Request() request: ExRequest,
  ): Promise<any> {
    if (!body.requestId || !body.presentationRequestUrl || !body.walletId) {
      throw new StatusException('requestId, presentationRequestUrl and walletId are required', 400)
    }
    try {
      await stageProofService.presentFromEmbeddedWallet({
        request,
        walletId: body.walletId,
        presentationRequestUrl: body.presentationRequestUrl,
        reference: id,
      })
      // VP verified — proceed with actual ack using the existing acknowledgeExecution handler
      return await this.acknowledgeExecution(id, { notes: body.notes }, request)
    } catch (error: any) {
      const status = error instanceof StatusException ? (error as any).status || 500 : 500
      this.setStatus(status)
      return { error: error.message }
    }
  }

  /**
   * Acknowledge execution (e.g. goods received).
   */
  @Post('{id}/ack')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async acknowledgeExecution(
    @Path() id: string,
    @Body() body: AckRequest,
    @Request() request: ExRequest,
  ): Promise<any> {
    const tenantId = (request as any).user?.tenantId || 'default'
    const actorName = this.getActorLabel(request, 'Acknowledger')
    const db = DatabaseManager.getDatabase()

    const idempotencyCheck = IdempotencyGuard.guard(db, request, tenantId, `ack:${id}`)
    if (idempotencyCheck.duplicate) {
      return idempotencyCheck.response
    }

    const naturalReplayKey = this.getNaturalReplayKey('ack', tenantId, id)
    const naturalReplay = IdempotencyGuard.checkAndReturn(db, naturalReplayKey, tenantId, `ack:${id}`)
    if (naturalReplay) {
      return naturalReplay.response
    }

    try {
      this.assertRequisitionStatus(id, 'RELEASED')
      const acknowledgedAt = new Date().toISOString()

      // Record event first so the requisition closes even if credential issuance lags.
      new ReconciliationService().recordEvent(id, 'EXECUTION_ACKNOWLEDGED', 'portal', {
        tenantId,
        notes: body.notes,
        actorName,
        subjectName: actorName,
      })

      // Issue the delivery confirmation (ExecutionAckVC) through the same outbox path as
      // ApprovalVC and ReleaseAuthorizationVC. The legacy /custom-oidc/issuer/credential-offers
      // call required a pre-registered credential definition and hard-failed the step.
      outboxService.enqueue({
        topic: 'workflow.vc.issue',
        aggregateKey: id,
        dedupeKey: `ack:${id}`,
        payload: {
          credentialType: 'ExecutionAckVC',
          requisitionId: id,
          tenantId,
          acknowledgedBy: (request as any).user?.username || actorName,
          acknowledgedAt,
          notes: body.notes,
        },
      })

      this.clearRequisitionStageActionNotification(id)

      const result = {
        requisitionId: id,
        status: 'ACKNOWLEDGED',
        acknowledgedAt,
        issuedCredentialType: 'ExecutionAckVC',
      }

      if (idempotencyCheck.key) {
        IdempotencyGuard.record(db, idempotencyCheck.key, tenantId, `ack:${id}`, result)
      }
      IdempotencyGuard.record(db, naturalReplayKey, tenantId, `ack:${id}`, result)

      return result
    } catch (error: any) {
      const status = error instanceof StatusException ? (error as any).status || 500 : 500
      this.setStatus(status)
      return { error: error.message }
    }
  }
}
