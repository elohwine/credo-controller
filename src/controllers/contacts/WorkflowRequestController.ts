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

import type { Request as ExRequest } from 'express'
import { Controller, Post, Get, Put, Route, Tags, Body, Path, Query, Request, Security } from 'tsoa'

import { AuthContext } from '../../enums'
import { ORG_MODULES, type OrgModule } from '../../config/orgModules'
import { ORG_OFFERINGS } from '../../config/orgOfferings'
import { projectRequestExperience, type RequestExperience } from '../../config/requestExperience'
import { StatusException } from '../../errors/StatusException'
import { contactRepository } from '../../persistence/ContactRepository'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import {
  workflowRequestRepository,
  type ContactCapability,
  type WorkflowRequest,
  type WorkflowRequestType,
  type WorkflowRequestStatus,
} from '../../persistence/WorkflowRequestRepository'
import { clampDoneDays } from '../../services/InboxPreferenceService'
import { OrgWorkflowActorService } from '../../services/OrgWorkflowActorService'
import { jobDepositService, type JobDepositView } from '../../services/JobDepositService'
import { orgOfferingsService } from '../../services/OrgOfferingsService'
import { orgSetupProfileService } from '../../services/OrgSetupProfileService'
import { notifyStageDelegates, resolveStageRoute } from '../../services/WorkflowStageInboxService'
import { outboxService } from '../../services/OutboxService'
import { ReconciliationService } from '../../services/ReconciliationService'
import { workflowReadinessService } from '../../services/WorkflowReadinessService'
import { workflowService } from '../../services/WorkflowService'
import { isWorkflowRequestActionable } from '../../services/workflowRequestInbox'
import { IdempotencyGuard } from '../../utils/IdempotencyGuard'
import { rootLogger } from '../../utils/pinoLogger'

const logger = rootLogger.child({ module: 'WorkflowRequestController' })

/** The field job every "Book a job" service runs. */
const FIELD_JOB_WORKFLOW = 'field_execution_fept'
const FIELD_JOB_TEMPLATES = new Set(['tpl-fept-field-execution', FIELD_JOB_WORKFLOW])

/** A service the organisation shows the public, as read from its own catalog. */
interface PublicOfferingService {
  id: string
  name: string
  workflowTemplateId?: string
  feeAmount?: number
  feeCurrency?: string
  offeringKey?: string
  /** Work area from organisation setup that must be on for this service to take requests. */
  module?: OrgModule
}

type BookableJobService = PublicOfferingService

/** A booked job's progress, as the person who booked it sees it. */
interface BookedJobProgress {
  runId: string
  status: string
  stage?: string
  pauseReason?: string
  /** Someone at the organisation is on the job. */
  assigned: boolean
  history: Array<{ stage: string; at?: string }>
  createdAt?: string
}

interface DepositDispute {
  /** What was not done. */
  reason?: string
}

interface AskProvidersBody {
  /** What is needed, in the customer's words. */
  need: string
  /** Suburb or city. */
  area?: string
  /** How they want to pay, such as ecocash. */
  payment?: string
  /** call_out, delivery or collection. */
  fulfilment?: string
  /** Anything else the businesses should know. */
  details?: string
  requesterName?: string
  /** How many to ask. Defaults to 3 and is never more than 5. */
  limit?: number
}

interface AskedProvider {
  requestId: string
  tenantId: string
  name: string
  reasons: string[]
}

interface SkippedProvider {
  name: string
  reason: string
}

interface AskProvidersResult {
  asked: AskedProvider[]
  skipped: SkippedProvider[]
  /** Set when nobody was asked. */
  note?: string
}

interface CreateRequestBody {
  /** The organisation's record of this person. Omit it when writing to an organisation for the first time. */
  contactId?: string
  /** First contact from Discover: the organisation adds this person to its contacts and the request lands as usual. */
  targetOrgTenantId?: string
  /** How the person wants the organisation to know them. Only used when a contact is created. */
  requesterName?: string
  requestType: WorkflowRequestType
  workflowType?: string
  payload: Record<string, unknown>
  expiresInDays?: number
  assignToUserId?: string
}

interface AcceptPrice {
  amount: number
  currency?: string
  /** What the price covers, shown on the bill or quote. */
  note?: string
}

interface ApproveRequestBody {
  approverId?: string
  approverRole?: string
  executeWorkflow?: boolean // if true, immediately trigger workflow execution
  /** Required when accepting a request for a bill or a quote: the organisation sets the price. */
  price?: AcceptPrice
}

interface RejectRequestBody {
  reason: string
}

interface WorkflowRequestResponse {
  id: string
  requesterTenantId: string
  targetOrgTenantId: string
  /** Plain name of the organisation the request went to, for the requester's own list. */
  targetOrgName?: string
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
  approvedAt?: string
  rejectedAt?: string
  fulfilledAt?: string
  /** The job a booking created, when it is one. */
  job?: BookedJobProgress
  /** The request's stages with when each happened, for the timeline both apps show. */
  experience?: RequestExperience
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

  /**
   * The public service the person asked for, read from the organisation's catalog, not the client.
   * It must still be shown and its work area must still be on in organisation setup.
   */
  private findPublicOffering(
    orgTenantId: string | undefined,
    payload: Record<string, unknown> | undefined,
  ): PublicOfferingService | undefined {
    const serviceId = typeof payload?.serviceId === 'string' ? payload.serviceId.trim() : ''
    if (!orgTenantId || !serviceId) return undefined
    const row = this.db
      .prepare(
        `SELECT s.id, s.name, s.workflow_template_id AS workflowTemplateId,
                s.fee_amount AS feeAmount, s.fee_currency AS feeCurrency, s.metadata AS metadata
         FROM service_catalog s
         JOIN organization_registry r ON r.id = s.org_id
         WHERE s.id = ? AND r.tenant_id = ? AND s.is_active = 1
         LIMIT 1`,
      )
      .get(serviceId, orgTenantId) as (Omit<PublicOfferingService, 'module'> & { metadata?: string }) | undefined
    if (!row) {
      throw new StatusException('This service is no longer offered. Open the organisation again to see what they offer.', 404)
    }
    let metadata: Record<string, unknown> = {}
    try {
      metadata = row.metadata ? JSON.parse(row.metadata) : {}
    } catch {
      metadata = {}
    }
    const offeringKey = typeof metadata.offeringKey === 'string' ? metadata.offeringKey : undefined
    const declared = offeringKey ? ORG_OFFERINGS.find((offering) => offering.key === offeringKey) : undefined
    const rawModule = declared ? declared.module : metadata.module
    const module = ORG_MODULES.includes(rawModule as OrgModule) ? (rawModule as OrgModule) : undefined
    if (module) {
      try {
        orgSetupProfileService.assertModule(orgTenantId, module)
      } catch {
        throw new StatusException(`They are not taking "${row.name}" requests right now.`, 403)
      }
    }
    const { metadata: _metadata, ...service } = row
    return { ...service, offeringKey, module }
  }

  /** The organisation's own "Book a job" service, when the person booked one. */
  private isBookableJobService(service: PublicOfferingService | undefined): service is BookableJobService {
    return Boolean(service && FIELD_JOB_TEMPLATES.has(String(service.workflowTemplateId || '')))
  }

  /** The phone the person gave for updates and bills, in one shape, or undefined when none or invalid. */
  private requesterPhone(payload: Record<string, unknown> | undefined): string | undefined {
    const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
    let phone = (text(payload?.customerMsisdn) || text(payload?.clientPhone) || text(payload?.phone)).replace(
      /[\s().-]/g,
      '',
    )
    // A local number (0771 234 567) is read the way WhatsApp sending reads it.
    if (/^0\d{9}$/.test(phone)) phone = `+263${phone.slice(1)}`
    return /^\+?[1-9]\d{6,14}$/.test(phone) ? phone : undefined
  }

  /** Keep the phone on the organisation's record of this person, so bills and WhatsApp reach them. */
  private rememberContactPhone(contact: { id: string; orgTenantId: string; phone?: string }, phone?: string): void {
    if (!phone || contact.phone) return
    const current = contactRepository.getById(contact.id, contact.orgTenantId)
    if (!current || current.phone) return
    contactRepository.upsert({
      id: current.id,
      orgTenantId: current.orgTenantId,
      contactScope: current.contactScope,
      name: current.name,
      phone,
      email: current.email,
      did: current.did,
      notes: current.notes,
      walletTenantId: current.walletTenantId,
      linkedAt: current.linkedAt,
    })
  }

  /** What the job needs from the booking: where, when, who, and the phone for updates and the bill. */
  private bookingJobFields(
    service: BookableJobService,
    body: CreateRequestBody,
    contactName: string,
  ): Record<string, unknown> {
    const payload = (body.payload || {}) as Record<string, unknown>
    const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
    const phone = this.requesterPhone(payload)
    if (!phone) {
      throw new StatusException('Add the phone number they can reach you on. Updates and the bill go to it.', 400)
    }
    const location = text(payload.location)
    if (!location) throw new StatusException('Say where the job is.', 400)
    const fee = Number(service.feeAmount)
    return {
      reference: text(payload.reference) || `BK-${Date.now().toString(36).toUpperCase()}`,
      description: text(payload.description) || text(payload.title) || service.name,
      ...(text(payload.problemType) ? { problemType: text(payload.problemType) } : {}),
      location,
      ...(text(payload.scheduledDate) ? { scheduledDate: text(payload.scheduledDate) } : {}),
      clientName: text(body.requesterName) || text(payload.clientName) || contactName,
      customerMsisdn: phone,
      amount: Number.isFinite(fee) && fee > 0 ? fee : 0,
      currency: service.feeCurrency || 'USD',
      serviceId: service.id,
      serviceName: service.name,
      workflowTemplateId: service.workflowTemplateId,
      awaitAssignment: true,
      bookedVia: text(payload.bookedVia) || 'app',
    }
  }

  /**
   * Start the field job for a booking. It shows in Operations → Jobs with nobody on it, and the
   * owners and admins get a card to choose who does it. When the organisation cannot run jobs
   * yet, the booking stays a request for them to pick up.
   */
  private async startBookedJob(request: WorkflowRequest): Promise<WorkflowRequest | undefined> {
    try {
      const result = await workflowService.executeWorkflow(
        FIELD_JOB_WORKFLOW,
        this.buildExecutionInputForWorkflowRequest(request),
        request.targetOrgTenantId,
        { triggerType: 'manual', triggerRef: `workflow-request:${request.id}` },
      )
      workflowRequestRepository.updateStatus(request.id, 'approved', {
        approverRole: 'booking',
        workflowId: result.runId,
      })
      logger.info(
        { requestId: request.id, runId: result.runId, orgTenantId: request.targetOrgTenantId },
        'Booked job created',
      )
      return workflowRequestRepository.findById(request.id)
    } catch (error: any) {
      logger.warn(
        { requestId: request.id, orgTenantId: request.targetOrgTenantId, error: error?.message },
        'Booked job could not start yet; the booking waits for the organisation',
      )
      return undefined
    }
  }

  /** Where the booked job is, for the person who booked it. Worker names and ids are not shown. */
  private jobProgress(request: WorkflowRequest): WorkflowRequestResponse['job'] {
    if (!request.workflowId) return undefined
    const run = this.db
      .prepare(`SELECT id, status, output, created_at AS createdAt FROM workflow_runs WHERE id = ? AND tenant_id = ?`)
      .get(request.workflowId, request.targetOrgTenantId) as
      | { id: string; status: string; output?: string; createdAt?: string }
      | undefined
    if (!run) return undefined
    let state: Record<string, any> = {}
    try {
      state = run.output ? JSON.parse(run.output) : {}
    } catch {
      state = {}
    }
    const history = Array.isArray(state.stageHistory) ? state.stageHistory : []
    return {
      runId: run.id,
      status: run.status,
      stage: typeof state.workflowStage === 'string' ? state.workflowStage : undefined,
      pauseReason: typeof state.pauseReason === 'string' ? state.pauseReason : undefined,
      assigned: Boolean(state.assignment?.assigneeId),
      history: history
        .filter((entry: any) => entry && typeof entry.stage === 'string')
        .map((entry: any) => ({ stage: String(entry.stage), at: entry.at ? String(entry.at) : undefined })),
      createdAt: run.createdAt,
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
    // A booked job waits for an owner or admin to choose the worker in Jobs. The person who booked
    // it is onboarded, so their bill reaches their inbox at sign-off.
    if ((payload as any).awaitAssignment === true) {
      if (request.requesterTenantId && !(payload as any).clientWalletTenantId) {
        executionInput.clientWalletTenantId = request.requesterTenantId
      }
      return executionInput
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
    return isWorkflowRequestActionable(request)
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
      workflowType: params.request.workflowType,
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
   * A bill or a quote someone asked for has no price until the organisation sets it. Accepting
   * one needs the price; it is kept on the request and shaped into what the offering's flow
   * expects (a one-off bill, or one quoted line), so the bill or quote goes out with it.
   */
  private withAcceptPrice(request: WorkflowRequest, price: AcceptPrice | undefined): WorkflowRequest {
    const payload = (request.payload && typeof request.payload === 'object' ? request.payload : {}) as Record<
      string,
      any
    >
    const offering = ORG_OFFERINGS.find((entry) => entry.key === payload.offeringKey)
    if (!offering?.priceOnAccept) return request

    const given = Number(price?.amount)
    const existing = Number(payload.totalAmount)
    const amount = Number.isFinite(given) && given > 0 ? given : Number.isFinite(existing) && existing > 0 ? existing : 0
    if (!amount) {
      throw new StatusException(
        `Add the price before you accept. It goes on the ${offering.requestType === 'quote' ? 'quote' : 'bill'} they get.`,
        400,
        'price_required',
      )
    }
    const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
    const currency = (text(price?.currency) || text(payload.currency) || 'USD').toUpperCase()
    const note = text(price?.note) || text(payload.priceNote)
    const description = note || text(payload.description) || text(payload.title) || offering.name
    const phone = text(payload.customerMsisdn) || undefined
    const name = text(payload.requesterName) || text(payload.clientName) || undefined
    const templateId = text(payload.workflowTemplateId)

    const priced: Record<string, any> = {
      ...payload,
      totalAmount: amount,
      amount,
      currency,
      ...(note ? { priceNote: note } : {}),
      pricedAt: payload.pricedAt || new Date().toISOString(),
      // The offering's own flow sends the bill or quote to the customer; no second one is raised.
      ...(templateId ? { billedByFlow: true } : {}),
    }
    if (templateId === 'tpl-ar-collections') {
      Object.assign(priced, {
        collectionType: payload.collectionType || 'one_time',
        description,
        ...(phone ? { payerPhone: phone } : {}),
        ...(name ? { payerName: name } : {}),
      })
    }
    if (templateId === 'tpl-quote-invoice-receipt') {
      Object.assign(priced, {
        items: [{ description, qty: 1, unitPrice: amount }],
        ...(phone ? { buyerPhone: phone } : {}),
      })
    }
    workflowRequestRepository.updatePayload(request.id, priced)
    return {
      ...request,
      payload: priced,
      // The flow comes from the organisation's own catalog entry, never from the client.
      workflowType: request.workflowType || templateId || undefined,
    }
  }

  /**
   * Approval does not end the chain. A requisition continues into procurement
   * (purchase order), a quote into an invoice, and so on, using the handoff catalog.
   */
  private continueIntoNextRequest(request: WorkflowRequest, actedByUserId?: string): void {
    const payload = request.payload && typeof request.payload === 'object' ? request.payload : {}
    if ((payload as Record<string, unknown>).billedByFlow === true) return
    void import('../../services/RequestHandoffService')
      .then(({ requestHandoffService }) => {
        requestHandoffService.continueFromWorkflowRequest({
          orgTenantId: request.targetOrgTenantId,
          requestId: request.id,
          requestType: request.requestType,
          workflowType: request.workflowType,
          title: typeof payload.title === 'string' ? payload.title : request.requestType,
          amount:
            typeof payload.totalAmount === 'number'
              ? payload.totalAmount
              : typeof payload.amount === 'number'
                ? payload.amount
                : undefined,
          currency: typeof payload.currency === 'string' ? payload.currency : undefined,
          payload,
          actedByUserId,
        })
      })
      .catch(() => undefined)
  }

  /** Closes the approval card for every wallet that received it (assignee, stand-in owners, delegates). */
  private clearApproverInboxNotification(requestId: string, _assigneeWalletTenantId?: string): void {
    this.db
      .prepare(
        `
            UPDATE wallet_pending_offers
            SET resolved_at = COALESCE(resolved_at, @resolvedAt),
                accepted_at = COALESCE(accepted_at, @acceptedAt)
            WHERE source_type = 'workflow_request_assignment'
              AND source_id = @sourceId
              AND resolved_at IS NULL
        `,
      )
      .run({
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

    // The organisation's record of this person: given, or found / created from the wallet when
    // the person writes to an organisation they found in Discover.
    let contact = body.contactId ? contactRepository.findById(body.contactId) : undefined
    if (!contact && body.targetOrgTenantId) {
      const orgTenantId = String(body.targetOrgTenantId).trim()
      const orgExists = DatabaseManager.getDatabase()
        .prepare(`SELECT 1 FROM organizations WHERE tenant_id = ? AND status = 'active' LIMIT 1`)
        .get(orgTenantId)
      if (!orgExists) {
        this.setStatus(404)
        throw new Error('Organisation not found')
      }
      contact =
        contactRepository.findByWalletTenantId(orgTenantId, requesterTenantId) ||
        (holderDid ? contactRepository.findByDid(orgTenantId, holderDid) : undefined) ||
        contactRepository.upsert({
          orgTenantId,
          contactScope: 'external',
          name: String(body.requesterName || '').trim() || 'New client (from the app)',
          did: holderDid,
          walletTenantId: requesterTenantId,
          linkedAt: new Date().toISOString(),
          notes: 'Wrote to you from the app',
        })
    }
    if (!contact) {
      this.setStatus(404)
      throw new Error('Contact not found')
    }

    const targetOrgTenantId = contact.orgTenantId
    if (!targetOrgTenantId) {
      this.setStatus(400)
      throw new Error('Contact does not have associated organization')
    }

    const capabilities = workflowRequestRepository.listCapabilitiesByContact(contact.id)
    const offering = this.findPublicOffering(contact.orgTenantId, body.payload)
    const bookedService = this.isBookableJobService(offering) ? offering : undefined
    const routing = this.resolveCapabilityRouting(body.requestType, body.workflowType, capabilities)
    const resolvedWorkflowType = bookedService ? FIELD_JOB_WORKFLOW : routing.workflowType || body.workflowType

    if (resolvedWorkflowType) {
      this.assertWorkflowOperationalForOrg(targetOrgTenantId, resolvedWorkflowType, 'creating workflow requests')
    }

    const phone = this.requesterPhone(body.payload)
    const effectivePayload = {
      ...(body.payload || {}),
      ...(phone ? { customerMsisdn: phone } : {}),
      // What the organisation offers is read from its catalog, never trusted from the client.
      ...(offering
        ? {
            serviceId: offering.id,
            serviceName: offering.name,
            workflowTemplateId: offering.workflowTemplateId,
            offeringKey: offering.offeringKey,
            workArea: offering.module,
          }
        : {}),
      ...(bookedService ? this.bookingJobFields(bookedService, body, contact.name) : {}),
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
      contactId: contact.id,
      requestType: body.requestType,
      workflowType: resolvedWorkflowType,
      payload: effectivePayload,
      status: 'pending',
      expiresAt,
    })
    this.rememberContactPhone(contact, phone)

    // Booking a job creates the job itself, in Operations → Jobs, like any other job.
    // Nobody is put on it: the owners and admins get a card and choose who does it there.
    if (bookedService) {
      const booked = await this.startBookedJob(request)
      if (booked) return this.toResponse(booked, contact.name)
    }

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
   * Ask the best matching businesses for a quote.
   * Each one gets the same quote request a person would send from Discover.
   * A business that cannot be asked is skipped; the others still get the request.
   */
  @Post('ask')
  @Security('jwt', ['wallet'])
  public async askProviders(@Body() body: AskProvidersBody, @Request() req: ExRequest): Promise<AskProvidersResult> {
    const requesterTenantId = this.requireTenantId(req)
    const replay = IdempotencyGuard.guard(this.db, req, requesterTenantId, 'discovery.ask')
    if (replay.duplicate) {
      this.setStatus(200)
      return replay.response as AskProvidersResult
    }

    const need = String(body?.need || '').trim()
    if (need.length < 2) {
      this.setStatus(400)
      throw new StatusException('Say what you need. A few words is enough.', 400)
    }
    const limit = Math.min(Math.max(Number(body?.limit) || 3, 1), 5)
    const matches = orgOfferingsService.match({
      need,
      area: body?.area,
      payment: body?.payment,
      fulfilment: body?.fulfilment,
      limit,
    })
    if (matches.length === 0) {
      const empty: AskProvidersResult = {
        asked: [],
        skipped: [],
        note: 'No business matched what you asked for.',
      }
      if (replay.key) IdempotencyGuard.record(this.db, replay.key, requesterTenantId, 'discovery.ask', empty)
      return empty
    }

    const lines = [
      need,
      body?.details?.trim(),
      body?.area?.trim() ? `Place: ${body.area.trim()}` : '',
      body?.payment?.trim() ? `Pay with: ${body.payment.trim()}` : '',
    ].filter(Boolean)
    const asked: AskedProvider[] = []
    const skipped: SkippedProvider[] = []
    for (const match of matches) {
      try {
        const created = await this.createRequest(
          {
            targetOrgTenantId: match.tenantId,
            requesterName: body?.requesterName,
            requestType: 'quote',
            payload: {
              title: match.serviceName || 'Ask for a quote',
              description: lines.join('\n'),
              ...(match.quoteServiceId ? { serviceId: match.quoteServiceId } : {}),
              source: 'provider_match',
              place: body?.area?.trim() || undefined,
              // Why this business was asked, kept with the request as the record of the match.
              matchReasons: match.reasons,
              ...(match.unsure.length ? { matchGaps: match.unsure } : {}),
            },
          },
          req,
        )
        asked.push({
          requestId: created.id,
          tenantId: match.tenantId,
          name: match.name,
          reasons: match.reasons,
        })
      } catch (error: unknown) {
        const reason = error instanceof Error ? error.message : 'Could not send this request.'
        skipped.push({ name: match.name, reason })
      }
    }
    this.setStatus(200)
    const result: AskProvidersResult = {
      asked,
      skipped,
      ...(asked.length === 0 ? { note: 'None of the matching businesses could be asked.' } : {}),
    }
    if (replay.key) IdempotencyGuard.record(this.db, replay.key, requesterTenantId, 'discovery.ask', result)
    return result
  }

  /**
   * The deposit on a quote from Discover. Paying it pays the business.
   * Credentis does not hold the money. Other requests have nothing here.
   */
  @Get('{id}/deposit')
  @Security('jwt')
  public async getDeposit(@Path() id: string, @Request() req: ExRequest): Promise<JobDepositView> {
    return jobDepositService.view(id, this.requireTenantId(req), this.actorUserId(req))
  }

  /** Create the payment link for that deposit. The same link is returned if it already exists. */
  @Post('{id}/deposit')
  @Security('jwt')
  public async openDeposit(@Path() id: string, @Request() req: ExRequest): Promise<JobDepositView> {
    return jobDepositService.open(id, this.requireTenantId(req))
  }

  /** The customer says the work was not done. The business cannot mark the job done until this is settled. */
  @Post('{id}/deposit/dispute')
  @Security('jwt')
  public async disputeDeposit(
    @Path() id: string,
    @Body() body: DepositDispute,
    @Request() req: ExRequest,
  ): Promise<JobDepositView> {
    return jobDepositService.dispute(id, this.requireTenantId(req), body?.reason)
  }

  /** The customer withdraws that. The payment stays with the business. */
  @Post('{id}/deposit/settle')
  @Security('jwt')
  public async settleDeposit(@Path() id: string, @Request() req: ExRequest): Promise<JobDepositView> {
    return jobDepositService.settle(id, this.requireTenantId(req))
  }

  /** The business marks the job done. Refused while the customer says the work was not done. */
  @Post('{id}/deposit/acknowledge')
  @Security('jwt')
  public async acknowledgeDeposit(@Path() id: string, @Request() req: ExRequest): Promise<JobDepositView> {
    const userId = this.actorUserId(req)
    if (!userId) throw new StatusException('Sign in as this business to mark the job done.', 401)
    return jobDepositService.acknowledge(id, userId)
  }

  private actorUserId(req: ExRequest): string | undefined {
    const ctx = req as ExRequest & { userId?: string; user?: { id?: string } }
    return ctx.user?.id || ctx.userId
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
    @Query() includeDoneSinceDays?: number,
  ): Promise<WorkflowRequestResponse[]> {
    const actor = this.resolveWalletActor(req)
    const requests = workflowRequestRepository
      .listAssignedToApprover(actor, {
        status,
        requestType,
        limit: limit || 50,
      })
      .filter((request) => this.isRequestActionable(request))

    // Requests this person already decided stay visible under Done for the asked window.
    if (includeDoneSinceDays !== undefined && includeDoneSinceDays !== null) {
      const since = Date.now() - clampDoneDays(includeDoneSinceDays) * 24 * 60 * 60 * 1000
      const shown = new Set(requests.map((r) => r.id))
      const decided = workflowRequestRepository
        .listAssignedToApprover(actor, { requestType, limit: 100 })
        .filter(
          (r) =>
            !shown.has(r.id) &&
            ['approved', 'rejected', 'fulfilled', 'cancelled'].includes(String(r.status)) &&
            new Date(r.updatedAt).getTime() >= since,
        )
      requests.push(...decided)
    }

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
    @Query() includeHistory?: boolean,
    @Query() offset?: number,
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
        limit: Math.max(1, Math.min(limit || 50, 100)),
        offset,
      })
      .filter((request) => String(request.requestType) !== 'vc_offer' && (includeHistory || this.isRequestActionable(request)))

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
    const accepted = this.withAcceptPrice(request, body.price)

    // If executeWorkflow=true, trigger workflow execution
    if (body.executeWorkflow && accepted.workflowType) {
      try {
        this.assertWorkflowOperationalForOrg(targetOrgTenantId, accepted.workflowType, 'executing workflow requests')
        const executionInput = this.buildExecutionInputForWorkflowRequest(accepted)
        const result = await workflowService.executeWorkflow(accepted.workflowType, executionInput, targetOrgTenantId, {
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

    this.continueIntoNextRequest(accepted, userId)
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
    const accepted = this.withAcceptPrice(request, body.price)
    if (body.executeWorkflow && accepted.workflowType) {
      this.assertWorkflowOperationalForOrg(
        request.targetOrgTenantId,
        accepted.workflowType,
        'executing workflow requests',
      )
      const executionInput = this.buildExecutionInputForWorkflowRequest(accepted)
      const result = await workflowService.executeWorkflow(
        accepted.workflowType,
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

    this.continueIntoNextRequest(accepted, actor.userId)
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
    const targetOrg = DatabaseManager.getDatabase()
      .prepare(`SELECT name FROM organizations WHERE tenant_id = ? LIMIT 1`)
      .get(request.targetOrgTenantId) as { name?: string } | undefined
    return {
      id: request.id,
      requesterTenantId: request.requesterTenantId,
      targetOrgTenantId: request.targetOrgTenantId,
      targetOrgName: targetOrg?.name,
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
      approvedAt: request.approvedAt?.toISOString(),
      rejectedAt: request.rejectedAt?.toISOString(),
      fulfilledAt: request.fulfilledAt?.toISOString(),
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
      job: this.jobProgress(request),
      experience: this.requestExperience(request),
    }
  }

  /** Stages of a request to another organisation, dated from the request's own record. */
  private requestExperience(request: WorkflowRequest): RequestExperience | undefined {
    const payload = (request.payload || {}) as Record<string, unknown>
    const at = (value?: Date) => value?.toISOString()
    const status = String(request.status)
    const events = [
      { to_status: 'submitted', created_at: at(request.createdAt) },
      ...(request.approvedAt ? [{ to_status: 'approved', created_at: at(request.approvedAt) }] : []),
      ...(request.rejectedAt ? [{ to_status: 'rejected', created_at: at(request.rejectedAt) }] : []),
      ...(request.fulfilledAt ? [{ to_status: 'completed', created_at: at(request.fulfilledAt) }] : []),
      ...(['cancelled', 'expired'].includes(status) ? [{ to_status: status, created_at: at(request.updatedAt) }] : []),
    ]
    const template = typeof payload.workflowTemplateId === 'string' ? payload.workflowTemplateId : ''
    try {
      return projectRequestExperience({
        id: request.id,
        // The service asked for (school fees, a bill, a job) names the family better than "invoice".
        requestType: template || request.requestType,
        workflowType: request.workflowType,
        status: status === 'pending' ? 'submitted' : status === 'fulfilled' ? 'completed' : status,
        events,
      })
    } catch {
      return undefined
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
