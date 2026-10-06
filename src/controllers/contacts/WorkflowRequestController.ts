/**
 * IdenEx Credentis - Workflow Request Controller
 *
 * API endpoints for holder→org workflow initiation via contacts.
 * Supports holder-initiated requests (quote, invoice, VC, service, requisition)
 * and org-side inbound request approval/rejection.
 *
 * @module controllers/contacts/WorkflowRequestController
 * @copyright 2024-2026 IdenEx Credentis
 */

import { Request as ExRequest } from 'express'
import { Controller, Post, Get, Put, Route, Tags, Body, Path, Query, Request, Security } from 'tsoa'

import { AuthContext } from '../../enums'
import { StatusException } from '../../errors/StatusException'
import { contactRepository } from '../../persistence/ContactRepository'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import {
  workflowRequestRepository,
  ContactCapability,
  WorkflowRequest,
  WorkflowRequestType,
  WorkflowRequestStatus,
} from '../../persistence/WorkflowRequestRepository'
import { OrgWorkflowActorService } from '../../services/OrgWorkflowActorService'
import { notifyStageDelegates, resolveStageRoute } from '../../services/WorkflowStageInboxService'
import { outboxService } from '../../services/OutboxService'
import { ReconciliationService } from '../../services/ReconciliationService'
import { workflowReadinessService } from '../../services/WorkflowReadinessService'
import { workflowService } from '../../services/WorkflowService'
import { IdempotencyGuard } from '../../utils/IdempotencyGuard'
import { rootLogger } from '../../utils/pinoLogger'

const logger = rootLogger.child({ module: 'WorkflowRequestController' })

interface CreateRequestBody {
  contactId: string
  requestType: WorkflowRequestType
  workflowType?: string
  payload: Record<string, unknown>
  expiresInDays?: number
  assignToUserId?: string
}

interface ApproveRequestBody {
  approverId?: string
  approverRole?: string
  executeWorkflow?: boolean // if true, immediately trigger workflow execution
}

interface RejectRequestBody {
  reason: string
}

interface WorkflowRequestResponse {
  id: string
  requesterTenantId: string
  targetOrgTenantId: string
  contactName?: string
  requestType: string
  workflowType?: string
  workflowId?: string
  payload: Record<string, unknown>
  status: string
  responseVcId?: string
  rejectionReason?: string
  assigneeUserId?: string
  assigneeWalletTenantId?: string
  assigneeRole?: string
  assignedAt?: string
  assignmentMode?: string
  createdAt: string
  updatedAt: string
}

interface ContactCapabilityResponse {
  id: string
  contactId: string
  orgTenantId: string
  capabilityType: string
  vcTypes?: string[]
  enabled: boolean
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

interface AddContactCapabilityBody {
  capabilityType: string
  vcTypes?: string[]
  enabled?: boolean
  metadata?: Record<string, unknown>
}

interface CapabilityRoutingDecision {
  workflowType?: string
  capabilityIds: string[]
  vcTypes: string[]
  paymentMethods: string[]
  verificationPolicies: string[]
  approvalPolicies: string[]
}

interface WorkflowRequestAuthUser {
  id?: string
  tenantId?: string
  orgRole?: string
}

interface WorkflowRequestContext extends ExRequest {
  tenantId?: string
  holderDid?: string
  userId?: string
  authContext?: AuthContext
  user?: WorkflowRequestAuthUser
}

@Route('workflow-requests')
@Tags('Workflow Requests')
export class WorkflowRequestController extends Controller {
  private readonly orgWorkflowActorService = new OrgWorkflowActorService()

  private get db() {
    return DatabaseManager.getDatabase()
  }

  private asContext(req: ExRequest): WorkflowRequestContext {
    return req as WorkflowRequestContext
  }

  private requireTenantId(req: ExRequest): string {
    const tenantId = this.asContext(req).tenantId
    if (!tenantId) {
      throw new StatusException('Unauthorized: tenant context required', 401)
    }
    return tenantId
  }

  private getNaturalReplayKey(action: 'approve' | 'reject', tenantId: string, requestId: string): string {
    return `system:workflow-request:${action}:${tenantId}:${requestId}`
  }

  private resolveWalletActor(req: ExRequest): { userId?: string; walletTenantId?: string } {
    const ctx = this.asContext(req)
    const user = ctx.user || {}
    return {
      userId: user.id || ctx.userId,
      walletTenantId: ctx.tenantId || user.tenantId,
    }
  }

  private resolveOrgRole(req: ExRequest): string | undefined {
    const ctx = this.asContext(req)
    const rawRole = ctx.user?.orgRole
    return typeof rawRole === 'string' ? rawRole.trim().toLowerCase() : undefined
  }

  private resolveMembership(
    orgTenantId: string,
    userId?: string,
  ): { role: string; walletTenantId?: string } | undefined {
    if (!userId) return undefined

    const row = this.db
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
    const row = this.db
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

  private resolveStageActionForRequest(requestType: WorkflowRequestType, workflowType?: string): string | undefined {
    return resolveStageRoute(requestType, workflowType).stageAction
  }

  private resolveConfiguredAssignee(
    orgTenantId: string,
    requestType: WorkflowRequestType,
    workflowType?: string,
    assignToUserId?: string,
  ): { userId: string; role: string; walletTenantId?: string; mode: string } | undefined {
    if (assignToUserId) {
      const membership = this.resolveMembership(orgTenantId, assignToUserId)
      if (!membership) {
        throw new Error('Assigned approver is not an active organization member')
      }

      return {
        userId: assignToUserId,
        role: membership.role,
        walletTenantId: membership.walletTenantId,
        mode: 'manual',
      }
    }

    const stageAction = this.resolveStageActionForRequest(requestType, workflowType)
    if (stageAction) {
      const configured = this.orgWorkflowActorService.resolveActor({
        orgTenantId,
        workflowType: workflowType || requestType,
        stageAction,
      })

      if (configured.walletTenantId) {
        return {
          userId: configured.userId || configured.walletTenantId,
          role: configured.role,
          walletTenantId: configured.walletTenantId,
          mode: configured.mode,
        }
      }
    }

    const fallback = this.resolveDefaultAssignee(orgTenantId)
    if (!fallback) return undefined

    return {
      userId: fallback.userId,
      role: fallback.role,
      walletTenantId: fallback.walletTenantId,
      mode: 'owner_fallback',
    }
  }

  /**
   * Org readiness gate (replaces workflow activation).
   *
   * A workflow is operational when the target organization satisfies the
   * template's declared prerequisites. On request creation missing items are
   * only logged (the request can wait in the inbox); on execution they block with
   * a 409 carrying the setup items so the UI can route the admin to Setup.
   */
  private assertWorkflowOperationalForOrg(
    orgTenantId: string,
    workflowType: string,
    operation: 'creating workflow requests' | 'executing workflow requests',
  ): void {
    if (!workflowType) return

    const report = workflowReadinessService.evaluateTemplate(orgTenantId, workflowType)
    if (report.ready) return

    const missing = report.blocking.map((item) => item.key)
    if (operation === 'creating workflow requests') {
      logger.warn(
        { orgTenantId, workflowType, operation, missing },
        'Workflow prerequisites missing; request will wait for setup',
      )
      return
    }

    logger.warn({ orgTenantId, workflowType, operation, missing }, 'Workflow prerequisites missing; execution blocked')
    throw new StatusException(
      `Workflow "${report.workflowType}" is not operational for this organization. Missing setup: ${report.blocking
        .map((item) => item.title)
        .join('; ')}`,
      409,
    )
  }

  private normalizeStageAction(value: unknown): string | undefined {
    const normalized = String(value || '')
      .trim()
      .toLowerCase()
    return normalized.length > 0 ? normalized : undefined
  }

  private resolveStageActionForExecution(request: WorkflowRequest): string | undefined {
    const payload = request.payload && typeof request.payload === 'object' ? request.payload : {}
    const stageActionFromPayload =
      this.normalizeStageAction((payload as any).stageAction) ||
      this.normalizeStageAction((payload as any).requiredAction)
    if (stageActionFromPayload) {
      return stageActionFromPayload
    }

    return this.resolveStageActionForRequest(request.requestType, request.workflowType)
  }

  private resolveExecutionActorForRequest(request: WorkflowRequest):
    | {
        userId?: string
        walletTenantId?: string
        role?: string
        mode?: string
      }
    | undefined {
    if (request.assignmentMode === 'manual' && (request.assigneeUserId || request.assigneeWalletTenantId)) {
      return {
        userId: request.assigneeUserId,
        walletTenantId: request.assigneeWalletTenantId,
        role: request.assigneeRole,
        mode: 'manual',
      }
    }

    const stageAction = this.resolveStageActionForExecution(request)
    if (stageAction) {
      const configured = this.orgWorkflowActorService.resolveActor({
        orgTenantId: request.targetOrgTenantId,
        workflowType: request.workflowType || request.requestType,
        stageAction,
      })

      if (configured.walletTenantId || configured.userId) {
        return {
          userId: configured.userId,
          walletTenantId: configured.walletTenantId,
          role: configured.role,
          mode: configured.mode,
        }
      }
    }

    if (request.assigneeUserId || request.assigneeWalletTenantId) {
      return {
        userId: request.assigneeUserId,
        walletTenantId: request.assigneeWalletTenantId,
        role: request.assigneeRole,
        mode: request.assignmentMode,
      }
    }

    const fallback = this.resolveConfiguredAssignee(
      request.targetOrgTenantId,
      request.requestType,
      request.workflowType,
    )

    if (!fallback) return undefined

    return {
      userId: fallback.userId,
      walletTenantId: fallback.walletTenantId,
      role: fallback.role,
      mode: fallback.mode,
    }
  }

  private buildExecutionInputForWorkflowRequest(request: WorkflowRequest): Record<string, unknown> {
    const payload = request.payload && typeof request.payload === 'object' ? request.payload : {}
    const executionInput: Record<string, unknown> = {
      ...payload,
      requestId: (payload as any).requestId || request.id,
      workflowRequestId: (payload as any).workflowRequestId || request.id,
      actingOrgTenantId: (payload as any).actingOrgTenantId || request.targetOrgTenantId,
    }

    const stageAction = this.resolveStageActionForExecution(request)
    if (stageAction && !(payload as any).stageAction) {
      executionInput.stageAction = stageAction
    }

    const resolvedActor = this.resolveExecutionActorForRequest(request)
    if (resolvedActor?.userId) {
      executionInput.assigneeId = resolvedActor.userId
      executionInput.assigneeUserId = resolvedActor.userId
    }
    if (resolvedActor?.walletTenantId) {
      executionInput.assigneeWalletTenantId = resolvedActor.walletTenantId
    }
    if (resolvedActor?.role) {
      executionInput.assigneeRole = resolvedActor.role
    }

    return executionInput
  }

  private normalizeStringList(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.map((entry) => (typeof entry === 'string' ? entry.trim() : '')).filter((entry) => entry.length > 0)
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      return value
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    }

    return []
  }

  private resolveCapabilityRouting(
    requestType: WorkflowRequestType,
    workflowType: string | undefined,
    capabilities: ContactCapability[],
  ): CapabilityRoutingDecision {
    const enabledCapabilities = capabilities.filter((capability) => capability.enabled)
    if (enabledCapabilities.length === 0) {
      return {
        workflowType,
        capabilityIds: [],
        vcTypes: [],
        paymentMethods: [],
        verificationPolicies: [],
        approvalPolicies: [],
      }
    }

    const requestTypeLower = requestType.toLowerCase()
    const workflowTypeLower = String(workflowType || '').toLowerCase()

    const matched = enabledCapabilities.filter((capability) => {
      const metadata = capability.metadata || {}
      const supportedRequestTypes = this.normalizeStringList(metadata.supportedRequestTypes).map((entry) =>
        entry.toLowerCase(),
      )
      const supportedWorkflows = this.normalizeStringList(metadata.supportedWorkflows).map((entry) =>
        entry.toLowerCase(),
      )
      const capabilityType = String(capability.capabilityType || '').toLowerCase()

      const requestMatches =
        supportedRequestTypes.length === 0 ||
        supportedRequestTypes.includes(requestTypeLower) ||
        capabilityType === requestTypeLower

      const workflowMatches =
        !workflowTypeLower || supportedWorkflows.length === 0 || supportedWorkflows.includes(workflowTypeLower)

      return requestMatches && workflowMatches
    })

    const hasExplicitConstraints = enabledCapabilities.some((capability) => {
      const metadata = capability.metadata || {}
      return (
        this.normalizeStringList(metadata.supportedRequestTypes).length > 0 ||
        this.normalizeStringList(metadata.supportedWorkflows).length > 0
      )
    })

    if (hasExplicitConstraints && matched.length === 0) {
      throw new Error(
        `No contact capability matches requestType=${requestType}${workflowType ? ` workflowType=${workflowType}` : ''}`,
      )
    }

    const selected = matched.length > 0 ? matched : enabledCapabilities
    const metadataPool = selected.map((capability) => capability.metadata || {})

    const inferredWorkflowType =
      workflowType ||
      metadataPool
        .flatMap((metadata) => this.normalizeStringList(metadata.supportedWorkflows))
        .find((candidate) => candidate.length > 0) ||
      metadataPool
        .map((metadata) =>
          typeof metadata.defaultWorkflowType === 'string' ? metadata.defaultWorkflowType.trim() : '',
        )
        .find((candidate) => candidate.length > 0)

    const vcTypes = Array.from(new Set(selected.flatMap((capability) => capability.vcTypes || [])))

    const paymentMethods = Array.from(
      new Set(metadataPool.flatMap((metadata) => this.normalizeStringList(metadata.paymentMethods))),
    )

    const verificationPolicies = Array.from(
      new Set(metadataPool.flatMap((metadata) => this.normalizeStringList(metadata.verificationPolicies))),
    )

    const approvalPolicies = Array.from(
      new Set(metadataPool.flatMap((metadata) => this.normalizeStringList(metadata.approvalPolicies))),
    )

    return {
      workflowType: inferredWorkflowType,
      capabilityIds: selected.map((capability) => capability.id),
      vcTypes,
      paymentMethods,
      verificationPolicies,
      approvalPolicies,
    }
  }

  private isRequestActionable(request: WorkflowRequest): boolean {
    // A record offer (job card, receipt, role card…) is delivered and accepted through the
    // wallet inbox card the dispatcher queues. The workflow_requests row is only a trace and
    // must not show up as something to approve.
    if (String(request.requestType) === 'vc_offer') return false
    if (request.requestType !== 'requisition') return true
    if (request.status !== 'pending') return true

    const requisitionId = request.payload?.requisitionId
    if (!requisitionId || typeof requisitionId !== 'string') return true

    const recon = new ReconciliationService().getStatus(requisitionId)
    const currentStatus = String(recon?.status || '').toUpperCase()

    // Requisition approvals are only actionable while still in approval stages.
    return currentStatus === 'REQUISITION_CREATED' || currentStatus === 'MANAGER_APPROVED'
  }

  private enqueueApproverInboxNotification(params: {
    request: WorkflowRequest
    assigneeWalletTenantId?: string
    assigneeUserId?: string
    assigneeRole?: string
  }): void {
    if (!params.assigneeWalletTenantId) return

    const now = new Date().toISOString()
    const offerUri = `workflow-request://${encodeURIComponent(params.request.id)}`
    const title = `Approval Request: ${params.request.requestType}`
    const body = 'You have been assigned a workflow request approval. Approve on behalf of your organization.'

    const inserted = this.db
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
        title,
        body,
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

    const stageAction = resolveStageRoute(params.request.requestType, params.request.workflowType).stageAction
    notifyStageDelegates({
      orgTenantId: params.request.targetOrgTenantId,
      actorUserId: params.assigneeUserId,
      stageAction,
      requestType: params.request.requestType,
      sourceType: 'workflow_request_assignment',
      sourceId: params.request.id,
      title,
      body,
      offerUri,
      credentialType: 'WorkflowRequestApproval',
      metadata: {
        requestId: params.request.id,
        workflowType: params.request.workflowType,
        targetOrgTenantId: params.request.targetOrgTenantId,
      },
    })
    void import('../../services/OrgWorkflowActorCredentialService')
      .then(({ orgWorkflowActorCredentialService }) => {
        orgWorkflowActorCredentialService.ensureActorCredentialInBackground({
          orgTenantId: params.request.targetOrgTenantId,
          workflowType: params.request.workflowType || params.request.requestType,
          stageAction,
          reason: `workflow_request:${params.request.id}`,
        })
      })
      .catch(() => undefined)
  }

  /**
   * Approval does not end the chain. A requisition continues into procurement
   * (purchase order), a quote into an invoice, and so on, using the handoff catalog.
   */
  private continueIntoNextRequest(request: WorkflowRequest, actedByUserId?: string): void {
    const payload = request.payload && typeof request.payload === 'object' ? request.payload : {}
    void import('../../services/RequestHandoffService')
      .then(({ requestHandoffService }) => {
        requestHandoffService.continueFromWorkflowRequest({
          orgTenantId: request.targetOrgTenantId,
          requestId: request.id,
          requestType: request.requestType,
          workflowType: request.workflowType,
          title: typeof payload.title === 'string' ? payload.title : request.requestType,
          amount: typeof payload.totalAmount === 'number' ? payload.totalAmount : typeof payload.amount === 'number' ? payload.amount : undefined,
          currency: typeof payload.currency === 'string' ? payload.currency : undefined,
          payload,
          actedByUserId,
        })
      })
      .catch(() => undefined)
  }

  private clearApproverInboxNotification(requestId: string, assigneeWalletTenantId?: string): void {
    if (!assigneeWalletTenantId) return

    this.db
      .prepare(
        `
            UPDATE wallet_pending_offers
            SET resolved_at = COALESCE(resolved_at, @resolvedAt),
                accepted_at = COALESCE(accepted_at, @acceptedAt)
            WHERE tenant_id = @tenantId
              AND source_type = 'workflow_request_assignment'
              AND source_id = @sourceId
              AND resolved_at IS NULL
        `,
      )
      .run({
        tenantId: assigneeWalletTenantId,
        sourceId: requestId,
        resolvedAt: new Date().toISOString(),
        acceptedAt: new Date().toISOString(),
      })

    this.db
      .prepare(
        `
            UPDATE wallet_pending_offers
            SET resolved_at = COALESCE(resolved_at, @resolvedAt),
                accepted_at = COALESCE(accepted_at, @acceptedAt)
            WHERE source_type = 'workflow_request_assignment'
              AND source_id LIKE @delegatedPrefix
              AND resolved_at IS NULL
        `,
      )
      .run({
        delegatedPrefix: `${requestId}:delegation:%`,
        resolvedAt: new Date().toISOString(),
        acceptedAt: new Date().toISOString(),
      })
  }

  /**
   * Holder initiates a workflow request to an org contact
   * Requires personal wallet token (holder context)
   */
  @Post('')
  @Security('jwt', ['wallet'])
  public async createRequest(
    @Body() body: CreateRequestBody,
    @Request() req: ExRequest,
  ): Promise<WorkflowRequestResponse> {
    const ctx = this.asContext(req)
    const requesterTenantId = this.requireTenantId(req)
    const holderDid = ctx.holderDid

    // Validate contact exists
    const contact = contactRepository.findById(body.contactId)
    if (!contact) {
      this.setStatus(404)
      throw new Error('Contact not found')
    }

    // Verify holder has access to this contact (either public or holder's personal contact)
    // TODO: implement contact ownership/visibility check if needed

    const targetOrgTenantId = contact.orgTenantId
    if (!targetOrgTenantId) {
      this.setStatus(400)
      throw new Error('Contact does not have associated organization')
    }

    const capabilities = workflowRequestRepository.listCapabilitiesByContact(body.contactId)
    const routing = this.resolveCapabilityRouting(body.requestType, body.workflowType, capabilities)
    const resolvedWorkflowType = routing.workflowType || body.workflowType

    if (resolvedWorkflowType) {
      this.assertWorkflowOperationalForOrg(targetOrgTenantId, resolvedWorkflowType, 'creating workflow requests')
    }

    const effectivePayload = {
      ...(body.payload || {}),
      routing: {
        ...(body.payload?.routing || {}),
        capabilityIds: routing.capabilityIds,
        supportedVcTypes: routing.vcTypes,
        paymentMethods: routing.paymentMethods,
        verificationPolicies: routing.verificationPolicies,
        approvalPolicies: routing.approvalPolicies,
      },
    }

    // Create workflow request
    const expiresAt = body.expiresInDays ? new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000) : undefined

    const request = workflowRequestRepository.create({
      requesterTenantId,
      requesterDid: holderDid,
      targetOrgTenantId,
      contactId: body.contactId,
      requestType: body.requestType,
      workflowType: resolvedWorkflowType,
      payload: effectivePayload,
      status: 'pending',
      expiresAt,
    })

    const assignment = this.resolveConfiguredAssignee(
      targetOrgTenantId,
      body.requestType,
      body.workflowType,
      body.assignToUserId,
    )
    if (assignment) {
      workflowRequestRepository.assignRequest(request.id, {
        assigneeUserId: assignment.userId,
        assigneeWalletTenantId: assignment.walletTenantId,
        assigneeRole: assignment.role,
        assignmentMode: assignment.mode,
        assignmentNote:
          assignment.mode === 'owner_fallback' ? 'Auto-assigned using owner/admin fallback' : 'Assigned by requester',
      })

      const assignedRequest = workflowRequestRepository.findById(request.id)!
      this.enqueueApproverInboxNotification({
        request: assignedRequest,
        assigneeWalletTenantId: assignment.walletTenantId,
        assigneeUserId: assignment.userId,
        assigneeRole: assignment.role,
      })
    }

    logger.info(
      {
        requestId: request.id,
        requester: requesterTenantId,
        targetOrg: targetOrgTenantId,
        type: body.requestType,
        routedWorkflowType: resolvedWorkflowType,
        capabilityIds: routing.capabilityIds,
      },
      'Workflow request created by holder',
    )

    const created = workflowRequestRepository.findById(request.id)!
    return this.toResponse(created, contact.name)
  }

  /**
   * List capability profile for a contact (holder view)
   * Used for DID contact routing previews before request creation.
   */
  @Get('contacts/{contactId}/capabilities')
  @Security('jwt', ['wallet'])
  public async listContactCapabilities(@Path() contactId: string): Promise<ContactCapabilityResponse[]> {
    const contact = contactRepository.findById(contactId)
    if (!contact) {
      this.setStatus(404)
      throw new Error('Contact not found')
    }

    return workflowRequestRepository
      .listCapabilitiesByContact(contactId)
      .map((capability) => this.toCapabilityResponse(capability))
  }

  /**
   * Add capability profile to a contact (org admin view)
   * Powers SGK supplier DID capability setup.
   */
  @Post('contacts/{contactId}/capabilities')
  @Security('jwt', ['tenant'])
  public async addContactCapability(
    @Path() contactId: string,
    @Body() body: AddContactCapabilityBody,
    @Request() req: ExRequest,
  ): Promise<ContactCapabilityResponse> {
    const orgTenantId = this.requireTenantId(req)
    const userRole = this.resolveOrgRole(req)
    const allowedRoles = ['owner', 'admin', 'manager', 'approver']
    if (!userRole || !allowedRoles.includes(userRole)) {
      throw new StatusException('Insufficient permissions to manage contact capabilities', 403)
    }

    const contact = contactRepository.findById(contactId)
    if (!contact) {
      this.setStatus(404)
      throw new Error('Contact not found')
    }

    if (contact.orgTenantId !== orgTenantId) {
      this.setStatus(403)
      throw new Error('Not authorized to modify this contact')
    }

    if (!body.capabilityType || !body.capabilityType.trim()) {
      this.setStatus(400)
      throw new Error('capabilityType is required')
    }

    const created = workflowRequestRepository.addCapability({
      contactId,
      orgTenantId,
      capabilityType: body.capabilityType.trim(),
      vcTypes: body.vcTypes,
      enabled: body.enabled !== false,
      metadata: body.metadata || {},
    })

    return this.toCapabilityResponse(created)
  }

  /**
   * List holder's outgoing workflow requests
   * Requires personal wallet token (holder context)
   */
  @Get('outbound')
  @Security('jwt', ['wallet'])
  public async listOutboundRequests(
    @Request() req: ExRequest,
    @Query() status?: WorkflowRequestStatus,
    @Query() requestType?: WorkflowRequestType,
    @Query() limit?: number,
  ): Promise<WorkflowRequestResponse[]> {
    const requesterTenantId = this.requireTenantId(req)

    const requests = workflowRequestRepository.listOutbound(requesterTenantId, {
      status,
      requestType,
      limit: limit || 50,
    })

    return requests.map((r) => {
      const contact = r.contactId ? contactRepository.findById(r.contactId) : undefined
      return this.toResponse(r, contact?.name)
    })
  }

  /**
   * List workflow requests assigned to the current holder user for org action.
   * Requires personal wallet token (holder context).
   */
  @Get('assigned')
  @Security('jwt', ['wallet'])
  public async listAssignedRequests(
    @Request() req: ExRequest,
    @Query() status?: WorkflowRequestStatus,
    @Query() requestType?: WorkflowRequestType,
    @Query() limit?: number,
  ): Promise<WorkflowRequestResponse[]> {
    const actor = this.resolveWalletActor(req)
    const requests = workflowRequestRepository
      .listAssignedToApprover(actor, {
        status,
        requestType,
        limit: limit || 50,
      })
      .filter((request) => this.isRequestActionable(request))

    return requests.map((r) => {
      const contact = r.contactId ? contactRepository.findById(r.contactId) : undefined
      return this.toResponse(r, contact?.name)
    })
  }

  /**
   * List org's inbound workflow requests
   * Requires org token with admin/manager/owner role
   */
  @Get('inbound')
  @Security('jwt', ['tenant'])
  public async listInboundRequests(
    @Request() req: ExRequest,
    @Query() status?: WorkflowRequestStatus,
    @Query() requestType?: WorkflowRequestType,
    @Query() limit?: number,
  ): Promise<WorkflowRequestResponse[]> {
    const targetOrgTenantId = this.requireTenantId(req)
    const userRole = this.resolveOrgRole(req)

    // Verify org role (admin, manager, owner, approver)
    const allowedRoles = ['owner', 'admin', 'manager', 'approver']
    if (!userRole || !allowedRoles.includes(userRole)) {
      throw new StatusException('Insufficient permissions to view inbound requests', 403)
    }

    const requests = workflowRequestRepository
      .listInbound(targetOrgTenantId, {
        status,
        requestType,
        limit: limit || 50,
      })
      .filter((request) => this.isRequestActionable(request))

    return requests.map((r) => {
      const contact = r.contactId ? contactRepository.findById(r.contactId) : undefined
      return this.toResponse(r, contact?.name)
    })
  }

  /**
   * Get single workflow request by ID
   * Access: requester OR target org member
   */
  @Get('{id}')
  @Security('jwt', ['tenant', 'wallet'])
  public async getRequest(@Path() id: string, @Request() req: ExRequest): Promise<WorkflowRequestResponse> {
    const tenantId = this.requireTenantId(req)

    const request = workflowRequestRepository.findById(id)
    if (!request) {
      this.setStatus(404)
      throw new Error('Workflow request not found')
    }

    // Verify access: either requester or target org
    if (request.requesterTenantId !== tenantId && request.targetOrgTenantId !== tenantId) {
      this.setStatus(403)
      throw new Error('Access denied')
    }

    const contact = request.contactId ? contactRepository.findById(request.contactId) : undefined
    return this.toResponse(request, contact?.name)
  }

  /**
   * Approve workflow request (org-side)
   * Optionally triggers workflow execution immediately
   */
  @Put('{id}/approve')
  @Security('jwt', ['tenant'])
  public async approveRequest(
    @Path() id: string,
    @Body() body: ApproveRequestBody,
    @Request() req: ExRequest,
  ): Promise<WorkflowRequestResponse> {
    const ctx = this.asContext(req)
    const targetOrgTenantId = this.requireTenantId(req)
    const userRole = this.resolveOrgRole(req)
    const userId = ctx.user?.id || ctx.userId

    const request = workflowRequestRepository.findById(id)
    if (!request) {
      this.setStatus(404)
      throw new Error('Workflow request not found')
    }

    if (request.targetOrgTenantId !== targetOrgTenantId) {
      this.setStatus(403)
      throw new Error('Not authorized to approve this request')
    }

    const idempotencyAction = `workflow-request:approve:${id}`
    const idempotencyCheck = IdempotencyGuard.guard(this.db, req, targetOrgTenantId, idempotencyAction)
    if (idempotencyCheck.duplicate) {
      return idempotencyCheck.response as WorkflowRequestResponse
    }

    const naturalReplayKey = this.getNaturalReplayKey('approve', targetOrgTenantId, id)
    const naturalReplay = IdempotencyGuard.checkAndReturn(
      this.db,
      naturalReplayKey,
      targetOrgTenantId,
      idempotencyAction,
    )
    if (naturalReplay) {
      return naturalReplay.response as WorkflowRequestResponse
    }

    if (request.status !== 'pending') {
      this.setStatus(400)
      throw new Error(`Cannot approve request with status: ${request.status}`)
    }

    // Verify approver role
    const allowedRoles = ['owner', 'admin', 'manager', 'approver']
    if (!userRole || !allowedRoles.includes(userRole)) {
      throw new StatusException('Insufficient permissions to approve requests', 403)
    }

    let workflowId: string | undefined

    // If executeWorkflow=true, trigger workflow execution
    if (body.executeWorkflow && request.workflowType) {
      try {
        this.assertWorkflowOperationalForOrg(targetOrgTenantId, request.workflowType, 'executing workflow requests')
        const executionInput = this.buildExecutionInputForWorkflowRequest(request)
        const result = await workflowService.executeWorkflow(request.workflowType, executionInput, targetOrgTenantId, {
          triggerType: 'manual',
          triggerRef: request.id,
        })
        workflowId = result.runId
        logger.info({ requestId: id, workflowId }, 'Workflow executed for approved request')
      } catch (error: unknown) {
        logger.error({ error, requestId: id }, 'Failed to execute workflow on approval')
        throw error
      }
    }

    const response = this.db.transaction(() => {
      workflowRequestRepository.updateStatus(id, 'approved', {
        approverId: body.approverId || userId,
        approverRole: body.approverRole || userRole,
        workflowId,
      })

      this.clearApproverInboxNotification(id, request.assigneeWalletTenantId)

      const updated = workflowRequestRepository.findById(id)!
      const mapped = this.toResponse(updated)
      if (idempotencyCheck.key) {
        IdempotencyGuard.record(this.db, idempotencyCheck.key, targetOrgTenantId, idempotencyAction, mapped)
      }
      IdempotencyGuard.record(this.db, naturalReplayKey, targetOrgTenantId, idempotencyAction, mapped)
      return mapped
    })()

    logger.info(
      {
        requestId: id,
        approver: userId,
        role: userRole,
        workflowId,
      },
      'Workflow request approved',
    )

    this.continueIntoNextRequest(request, userId)
    return response
  }

  /**
   * Approve workflow request directly from holder inbox while acting on behalf of org.
   * Requires personal wallet token + active org assignment/membership.
   */
  @Put('{id}/approve-from-inbox')
  @Security('jwt', ['wallet'])
  public async approveFromInbox(
    @Path() id: string,
    @Body() body: ApproveRequestBody,
    @Request() req: ExRequest,
  ): Promise<WorkflowRequestResponse> {
    const ctx = this.asContext(req)
    const actor = this.resolveWalletActor(req)
    const request = workflowRequestRepository.findById(id)
    if (!request) {
      this.setStatus(404)
      throw new Error('Workflow request not found')
    }

    const idempotencyAction = `workflow-request:approve-from-inbox:${id}`
    const idempotencyCheck = IdempotencyGuard.guard(this.db, req, request.targetOrgTenantId, idempotencyAction)
    if (idempotencyCheck.duplicate) {
      return idempotencyCheck.response as WorkflowRequestResponse
    }

    const naturalReplayKey = this.getNaturalReplayKey('approve', request.targetOrgTenantId, id)
    const naturalReplay = IdempotencyGuard.checkAndReturn(
      this.db,
      naturalReplayKey,
      request.targetOrgTenantId,
      idempotencyAction,
    )
    if (naturalReplay) {
      return naturalReplay.response as WorkflowRequestResponse
    }

    if (request.status !== 'pending') {
      this.setStatus(400)
      throw new Error(`Cannot approve request with status: ${request.status}`)
    }

    const isAssigned = Boolean(
      (request.assigneeUserId && actor.userId && request.assigneeUserId === actor.userId) ||
        (request.assigneeWalletTenantId &&
          actor.walletTenantId &&
          request.assigneeWalletTenantId === actor.walletTenantId),
    )

    if (!isAssigned) {
      this.setStatus(403)
      throw new Error('Not assigned to approve this request')
    }

    const membership = this.resolveMembership(request.targetOrgTenantId, actor.userId)
    if (!membership) {
      this.setStatus(403)
      throw new Error('Not an active member of the target organization')
    }

    const allowedRoles = ['owner', 'admin', 'manager', 'approver']
    if (!allowedRoles.includes(membership.role)) {
      this.setStatus(403)
      throw new Error('Insufficient permissions to approve requests')
    }

    let workflowId: string | undefined
    if (body.executeWorkflow && request.workflowType) {
      this.assertWorkflowOperationalForOrg(
        request.targetOrgTenantId,
        request.workflowType,
        'executing workflow requests',
      )
      const executionInput = this.buildExecutionInputForWorkflowRequest(request)
      const result = await workflowService.executeWorkflow(
        request.workflowType,
        executionInput,
        request.targetOrgTenantId,
        { triggerType: 'manual', triggerRef: request.id },
      )
      workflowId = result.runId
    }

    // Ensure audit middleware records this action under organization context.
    const reqUser: WorkflowRequestAuthUser = ctx.user || {}
    reqUser.orgRole = membership.role
    reqUser.tenantId = request.targetOrgTenantId
    ctx.user = reqUser
    ctx.tenantId = request.targetOrgTenantId
    ctx.authContext = AuthContext.Org

    const response = this.db.transaction(() => {
      workflowRequestRepository.updateStatus(id, 'approved', {
        approverId: body.approverId || actor.userId,
        approverRole: body.approverRole || membership.role,
        workflowId,
      })

      this.clearApproverInboxNotification(id, request.assigneeWalletTenantId)

      const updated = workflowRequestRepository.findById(id)!
      const mapped = this.toResponse(updated)
      if (idempotencyCheck.key) {
        IdempotencyGuard.record(this.db, idempotencyCheck.key, request.targetOrgTenantId, idempotencyAction, mapped)
      }
      IdempotencyGuard.record(this.db, naturalReplayKey, request.targetOrgTenantId, idempotencyAction, mapped)
      return mapped
    })()

    this.continueIntoNextRequest(request, actor.userId)
    return response
  }

  /**
   * Reject workflow request (org-side)
   */
  @Put('{id}/reject')
  @Security('jwt', ['tenant'])
  public async rejectRequest(
    @Path() id: string,
    @Body() body: RejectRequestBody,
    @Request() req: ExRequest,
  ): Promise<WorkflowRequestResponse> {
    const targetOrgTenantId = this.requireTenantId(req)
    const userRole = this.resolveOrgRole(req)

    const request = workflowRequestRepository.findById(id)
    if (!request) {
      this.setStatus(404)
      throw new Error('Workflow request not found')
    }

    if (request.targetOrgTenantId !== targetOrgTenantId) {
      this.setStatus(403)
      throw new Error('Not authorized to reject this request')
    }

    const idempotencyAction = `workflow-request:reject:${id}`
    const idempotencyCheck = IdempotencyGuard.guard(this.db, req, targetOrgTenantId, idempotencyAction)
    if (idempotencyCheck.duplicate) {
      return idempotencyCheck.response as WorkflowRequestResponse
    }

    const naturalReplayKey = this.getNaturalReplayKey('reject', targetOrgTenantId, id)
    const naturalReplay = IdempotencyGuard.checkAndReturn(
      this.db,
      naturalReplayKey,
      targetOrgTenantId,
      idempotencyAction,
    )
    if (naturalReplay) {
      return naturalReplay.response as WorkflowRequestResponse
    }

    if (request.status !== 'pending') {
      this.setStatus(400)
      throw new Error(`Cannot reject request with status: ${request.status}`)
    }

    // Verify approver role
    const allowedRoles = ['owner', 'admin', 'manager', 'approver']
    if (!userRole || !allowedRoles.includes(userRole)) {
      throw new StatusException('Insufficient permissions to reject requests', 403)
    }

    const response = this.db.transaction(() => {
      workflowRequestRepository.updateStatus(id, 'rejected', {
        rejectionReason: body.reason,
      })

      this.clearApproverInboxNotification(id, request.assigneeWalletTenantId)

      const updated = workflowRequestRepository.findById(id)!
      const mapped = this.toResponse(updated)
      if (idempotencyCheck.key) {
        IdempotencyGuard.record(this.db, idempotencyCheck.key, targetOrgTenantId, idempotencyAction, mapped)
      }
      IdempotencyGuard.record(this.db, naturalReplayKey, targetOrgTenantId, idempotencyAction, mapped)
      return mapped
    })()

    logger.info({ requestId: id, reason: body.reason }, 'Workflow request rejected')

    return response
  }

  /**
   * Reject workflow request directly from holder inbox while acting on behalf of org.
   * Requires personal wallet token + active org assignment/membership.
   */
  @Put('{id}/reject-from-inbox')
  @Security('jwt', ['wallet'])
  public async rejectFromInbox(
    @Path() id: string,
    @Body() body: RejectRequestBody,
    @Request() req: ExRequest,
  ): Promise<WorkflowRequestResponse> {
    const ctx = this.asContext(req)
    const actor = this.resolveWalletActor(req)
    const request = workflowRequestRepository.findById(id)
    if (!request) {
      this.setStatus(404)
      throw new Error('Workflow request not found')
    }

    const idempotencyAction = `workflow-request:reject-from-inbox:${id}`
    const idempotencyCheck = IdempotencyGuard.guard(this.db, req, request.targetOrgTenantId, idempotencyAction)
    if (idempotencyCheck.duplicate) {
      return idempotencyCheck.response as WorkflowRequestResponse
    }

    const naturalReplayKey = this.getNaturalReplayKey('reject', request.targetOrgTenantId, id)
    const naturalReplay = IdempotencyGuard.checkAndReturn(
      this.db,
      naturalReplayKey,
      request.targetOrgTenantId,
      idempotencyAction,
    )
    if (naturalReplay) {
      return naturalReplay.response as WorkflowRequestResponse
    }

    if (request.status !== 'pending') {
      this.setStatus(400)
      throw new Error(`Cannot reject request with status: ${request.status}`)
    }

    const isAssigned = Boolean(
      (request.assigneeUserId && actor.userId && request.assigneeUserId === actor.userId) ||
        (request.assigneeWalletTenantId &&
          actor.walletTenantId &&
          request.assigneeWalletTenantId === actor.walletTenantId),
    )

    if (!isAssigned) {
      this.setStatus(403)
      throw new Error('Not assigned to reject this request')
    }

    const membership = this.resolveMembership(request.targetOrgTenantId, actor.userId)
    if (!membership) {
      this.setStatus(403)
      throw new Error('Not an active member of the target organization')
    }

    const allowedRoles = ['owner', 'admin', 'manager', 'approver']
    if (!allowedRoles.includes(membership.role)) {
      this.setStatus(403)
      throw new Error('Insufficient permissions to reject requests')
    }

    const reqUser: WorkflowRequestAuthUser = ctx.user || {}
    reqUser.orgRole = membership.role
    reqUser.tenantId = request.targetOrgTenantId
    ctx.user = reqUser
    ctx.tenantId = request.targetOrgTenantId
    ctx.authContext = AuthContext.Org

    const response = this.db.transaction(() => {
      workflowRequestRepository.updateStatus(id, 'rejected', {
        rejectionReason: body.reason,
      })

      this.clearApproverInboxNotification(id, request.assigneeWalletTenantId)

      const updated = workflowRequestRepository.findById(id)!
      const mapped = this.toResponse(updated)
      if (idempotencyCheck.key) {
        IdempotencyGuard.record(this.db, idempotencyCheck.key, request.targetOrgTenantId, idempotencyAction, mapped)
      }
      IdempotencyGuard.record(this.db, naturalReplayKey, request.targetOrgTenantId, idempotencyAction, mapped)
      return mapped
    })()

    return response
  }

  // ==================== Helpers ====================

  private toResponse(request: WorkflowRequest, contactName?: string): WorkflowRequestResponse {
    return {
      id: request.id,
      requesterTenantId: request.requesterTenantId,
      targetOrgTenantId: request.targetOrgTenantId,
      contactName,
      requestType: request.requestType,
      workflowType: request.workflowType,
      workflowId: request.workflowId,
      payload: request.payload,
      status: request.status,
      responseVcId: request.responseVcId,
      rejectionReason: request.rejectionReason,
      assigneeUserId: request.assigneeUserId,
      assigneeWalletTenantId: request.assigneeWalletTenantId,
      assigneeRole: request.assigneeRole,
      assignedAt: request.assignedAt?.toISOString(),
      assignmentMode: request.assignmentMode,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
    }
  }

  private toCapabilityResponse(capability: ContactCapability): ContactCapabilityResponse {
    return {
      id: capability.id,
      contactId: capability.contactId,
      orgTenantId: capability.orgTenantId,
      capabilityType: capability.capabilityType,
      vcTypes: capability.vcTypes,
      enabled: capability.enabled,
      metadata: capability.metadata,
      createdAt: capability.createdAt.toISOString(),
      updatedAt: capability.updatedAt.toISOString(),
    }
  }
}
