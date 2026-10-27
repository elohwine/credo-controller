/**
 * IdenEx Credentis - Workflow Management Controller
 *
 * Verifiable Trust Infrastructure for Africa's Digital Economy
 *
 * API endpoints for workflow management:
 * - Register custom workflows with action sequences
 * - Execute workflows (sync or async)
 * - Track run status and history
 * - Pause/resume workflows awaiting external input
 * - List available actions for workflow building
 *
 * @module controllers/workflow/WorkflowController
 * @copyright 2024-2026 IdenEx Credentis
 */

import type { RestMultiTenantAgentModules } from '../../cliAgent'
import type { Agent } from '@credo-ts/core'
import type { Request as ExRequest } from 'express'

import { Controller, Post, Get, Delete, Route, Tags, Body, Path, Query, Request, Security } from 'tsoa'

import { StatusException } from '../../errors'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import { workflowRunRepository } from '../../persistence/WorkflowRunRepository'
import { orgWorkflowActorService } from '../../services/OrgWorkflowActorService'
import { proofActionForStage, type ProofVcActionKey } from '../../services/ProofVcPolicyService'
import { assertRunResume, canAccessRun, resumeFieldsForRun } from '../../services/RunAccessPolicy'
import {
  workflowAuditService,
  type WorkflowAuditFormat,
  type WorkflowAuditResult,
} from '../../services/WorkflowAuditService'
import { workflowService, ExecuteWorkflowOptions, WorkflowExecutionResult } from '../../services/WorkflowService'
import { stageProofService, type EmbeddedPresentationResult } from '../../services/ssi/StageProofService'
import { ActionRegistry } from '../../services/workflow/ActionRegistry'
import { stageGateOf, stageGateReason } from '../../services/workflow/stageGate'
import {
  workflowHandoffService,
  type HandoffLink,
  type RunHandoffsView,
} from '../../services/workflow/WorkflowHandoffService'
import { FieldExecutionActions } from '../../services/workflow/actions/FieldExecutionActions'
import { IdempotencyGuard } from '../../utils/IdempotencyGuard'
import { requireDeviceTrust } from '../../services/deviceAssertion'

interface StartHandoffBody {
  /** Hand-off key from GET runs/{runId}/handoffs (for example `field_quote_extra_work`). */
  key: string
  /** The fields that hand-off asks for (description, amount, …). */
  input?: Record<string, unknown>
}

/**
 * A step that needs the acting person to prove themselves from their wallet first.
 *
 * A job's sign-off and payout keep their own names (`acknowledgement`, `payout`). Every other
 * workflow names the step itself (`approve_requisition`, `release_funds`, or a step a template
 * declared for itself), so a workflow onboarded later is proof-gated the same way without a new
 * endpoint. Plain `string` because the step must cross the API boundary; the run itself says
 * which step it is waiting at, and anything else is refused with a plain message.
 */
type StageProofStage = string

interface StageProofRequestBody {
  stage: StageProofStage
}

interface StageProofRequestResponse {
  runId: string
  stage: StageProofStage
  requestId: string
  presentationRequestUrl: string
  verifierDid: string
  acceptedVcTypes: string[]
}

interface StageProofCompleteBody {
  stage: StageProofStage
  requestId: string
  notes?: string
  deviceAssertion?: {
    deviceKeyId: string
    nonce: string
    purpose: string
    signedAt: string
    signature: string
  }
}

interface StageProofEmbeddedWalletBody extends StageProofCompleteBody {
  presentationRequestUrl: string
  walletId: string
}

interface StageProofConfig {
  pauseReason: string
  actionKey: ProofVcActionKey
  stageAction: string
  /** The workflow whose "Who does what" names the person for this step. */
  workflowType: string
  presentationField: string
  idPrefix: string
  descriptorName: string
  purpose: string
  notesField: string
}

/** The two steps of a field job that were proof-gated before any workflow could name its own. */
const STAGE_PROOF_CONFIG: Record<'acknowledgement' | 'payout', StageProofConfig> = {
  acknowledgement: {
    pauseReason: 'await_acknowledgement',
    actionKey: 'field_ack',
    stageAction: 'acknowledge_execution',
    workflowType: 'field_execution_fept',
    presentationField: 'acknowledgementPresentation',
    idPrefix: 'job-signoff',
    descriptorName: 'Your role credential',
    purpose: 'Confirm you are the person this organization chose to sign off finished work.',
    notesField: 'ackNotes',
  },
  payout: {
    pauseReason: 'await_payout_release',
    actionKey: 'field_payout',
    stageAction: 'trigger_payout',
    workflowType: 'field_execution_fept',
    presentationField: 'releasePresentation',
    idPrefix: 'job-payout',
    descriptorName: 'Your role credential',
    purpose: 'Confirm you are the person this organization chose to release payment for finished work.',
    notesField: 'payoutNotes',
  },
}

/** Fields only the server may set on a resume submission. */
const SERVER_ONLY_RESUME_FIELDS = [
  'actedByUserId',
  'acknowledgementPresentation',
  'releasePresentation',
  'stagePresentation',
] as const

interface RegisterWorkflowRequest {
  id: string
  name: string
  category: string
  provider: string
  description?: string
  inputSchema?: any
  actions: Array<{
    action: string
    config?: any
  }>
}

interface ExecuteWorkflowRequest {
  async?: boolean
  triggerRef?: string
  [key: string]: any // Additional input data
}

@Route('workflows')
@Tags('Workflow Engine')
export class WorkflowController extends Controller {
  /**
   * Execute a workflow by ID
   */
  @Post('{workflowId}/execute')
  @Security('jwt', ['tenant'])
  public async executeWorkflow(
    @Path() workflowId: string,
    @Body() body: ExecuteWorkflowRequest,
    @Request() request: ExRequest,
  ): Promise<WorkflowExecutionResult> {
    try {
      const tenantId = (request as any).user?.tenantId || 'default'
      const { async: isAsync, triggerRef, ...input } = body

      const options: ExecuteWorkflowOptions = {
        triggerType: 'manual',
        triggerRef,
        async: isAsync,
      }

      const result = await workflowService.executeWorkflow(workflowId, input, tenantId, options)
      return result
    } catch (error: any) {
      this.setStatus(400)
      return { runId: '', status: 'failed', error: error.message }
    }
  }

  /**
   * Resume a paused workflow run
   */
  @Post('runs/{runId}/resume')
  @Security('jwt', ['tenant'])
  public async resumeWorkflow(
    @Path() runId: string,
    @Body() resumeData: any,
    @Request() request: ExRequest,
  ): Promise<WorkflowExecutionResult> {
    try {
      // The server decides who acted and whether a wallet proof was verified; a client cannot claim either.
      const submission = {
        ...((resumeData && typeof resumeData === 'object' ? resumeData : {}) as Record<string, unknown>),
      }
      for (const field of SERVER_ONLY_RESUME_FIELDS) delete submission[field]

      // Safe retry: the same step submitted twice (same x-idempotency-key) returns the first outcome
      // instead of running the next step again. Rejected submissions are not recorded, so a corrected
      // one goes through.
      const run = workflowRunRepository.findRunById(runId)
      if (!run || !canAccessRun((request as any).user, run)) throw new StatusException('Run not found', 404)
      const db = DatabaseManager.getDatabase()
      const idempotencyAction = `workflow-resume:${runId}:${(request as any).user.id}`
      const idempotency = IdempotencyGuard.guard(db, request, run.tenantId, idempotencyAction)
      if (idempotency.duplicate) return idempotency.response as WorkflowExecutionResult
      assertRunResume((request as any).user, run)
      const protectedFields = Object.keys(submission).filter((field) =>
        /^(assigneeId|assigneeUserId|receiverId|payoutUserId|requesterId|dispatcherId|jobActors|assignment|amount|currency|require[A-Z].*|_resumeData)$/.test(
          field,
        ),
      )
      if (protectedFields.length)
        throw new StatusException('Job configuration cannot be changed through a step submission.', 400)
      const allowedFields = resumeFieldsForRun(run)
      if (allowedFields && Object.keys(submission).some((field) => !allowedFields.includes(field))) {
        throw new StatusException('Submit only the fields for the current job step.', 400)
      }
      const result = await workflowService.resumeWorkflow(runId, submission, (request as any).user?.id)
      if (idempotency.key && result?.status !== 'failed') {
        IdempotencyGuard.record(db, idempotency.key, run.tenantId, idempotencyAction, result)
      }
      return result
    } catch (error: any) {
      this.setStatus(this.statusOf(error))
      return { runId, status: 'failed', error: error.message }
    }
  }

  /**
   * Try a failed run again from the step that failed (for example a courtesy message that
   * could not be sent). Only an owner/admin of the run's organization can do this.
   */
  @Post('runs/{runId}/retry')
  @Security('jwt', ['tenant'])
  public async retryWorkflow(@Path() runId: string, @Request() request: ExRequest): Promise<WorkflowExecutionResult> {
    try {
      const user = (request as any).user || {}
      const run = workflowRunRepository.findRunById(runId)
      if (!run || !canAccessRun(user, run)) throw new StatusException('Run not found', 404)
      if (!user.tenantId || run.tenantId !== String(user.tenantId)) {
        throw new StatusException('This job belongs to another organization.', 403)
      }
      const membership = DatabaseManager.getDatabase()
        .prepare(
          `SELECT role FROM org_memberships WHERE org_tenant_id = ? AND user_id = ? AND status = 'active' LIMIT 1`,
        )
        .get(run.tenantId, String(user.id || '')) as { role?: string } | undefined
      if (!['owner', 'admin'].includes(String(membership?.role || '').toLowerCase())) {
        throw new StatusException('Only an organization admin can retry a job.', 403)
      }
      return await workflowService.retryFailedRun(runId, String(user.id || '') || undefined)
    } catch (error: any) {
      this.setStatus(this.statusOf(error))
      return { runId, status: 'failed', error: error.message }
    }
  }

  // ── Wallet-proof guarded steps (sign-off, payout) ──────────────────────────────

  @Post('runs/{runId}/billing/retry')
  @Security('jwt', ['tenant'])
  public async retryClientBilling(
    @Path() runId: string,
    @Body() body: { clientName: string; clientPhone: string },
    @Request() request: ExRequest,
  ): Promise<WorkflowExecutionResult> {
    const user = (request as any).user || {}
    const run = workflowRunRepository.findRunById(runId)
    if (!run || !canAccessRun(user, run)) throw new StatusException('Run not found', 404)
    const membership = DatabaseManager.getDatabase()
      .prepare(`SELECT role FROM org_memberships WHERE org_tenant_id = ? AND user_id = ? AND status = 'active' LIMIT 1`)
      .get(run.tenantId, String(user.id || '')) as { role?: string } | undefined
    if (user.tenantId !== run.tenantId || !['owner', 'admin'].includes(String(membership?.role))) {
      throw new StatusException('Only an organization admin can retry client billing.', 403)
    }
    const db = DatabaseManager.getDatabase()
    const action = `retry-client-billing:${runId}`
    if (!IdempotencyGuard.extractKey(request)) throw new StatusException('Missing x-idempotency-key header', 400)
    const replay = IdempotencyGuard.guard(db, request, run.tenantId, action)
    if (replay.duplicate) return replay.response
    const result = await workflowService.retryClientBilling(runId, body.clientName, body.clientPhone, String(user.id))
    if (replay.key) IdempotencyGuard.record(db, replay.key, run.tenantId, action, result)
    return result
  }

  /**
   * What this step asks for. A job's sign-off and payout keep their own settings; any other step
   * is read from the run itself, so a workflow that named its own step is gated the same way.
   */
  private stageConfig(stage: unknown, run?: { output?: unknown }): StageProofConfig {
    const named = String(stage || '').toLowerCase()
    const builtIn = STAGE_PROOF_CONFIG[named as 'acknowledgement' | 'payout']
    if (builtIn) return builtIn
    const state = (run?.output && typeof run.output === 'object' ? run.output : {}) as Record<string, unknown>
    const gate = stageGateOf(state)
    if (!gate || gate.stageAction !== named) {
      throw new StatusException(
        `This job is not waiting at a step called '${String(stage)}'. Open it again to see the step it is waiting for.`,
        400,
      )
    }
    const words = gate.stageAction.replace(/_/g, ' ')
    return {
      pauseReason: stageGateReason(gate.stageAction),
      actionKey: proofActionForStage(gate.stageAction) || `stage:${gate.stageAction}`,
      stageAction: gate.stageAction,
      workflowType: gate.workflowType,
      presentationField: 'stagePresentation',
      idPrefix: `stage-${gate.stageAction.replace(/_/g, '-')}`,
      descriptorName: 'Your role credential',
      purpose: `Confirm you are the person this organization chose to ${words}.`,
      notesField: 'stageNotes',
    }
  }

  /**
   * The run must belong to the caller's organization, be waiting at the step, and the
   * caller must be the person chosen for it (or an owner/admin standing in).
   */
  private assertStageActor(request: ExRequest, runId: string, stage: StageProofStage) {
    const user = (request as any).user || {}
    const callerTenantId = String(user.tenantId || '')
    const callerUserId = String(user.id || '')
    const run = workflowRunRepository.findRunById(runId)
    if (!run || !canAccessRun(user, run)) throw new StatusException('Run not found', 404)
    if (!callerTenantId || run.tenantId !== callerTenantId) {
      throw new StatusException('This job belongs to another organization.', 403)
    }
    if (run.status !== 'paused') throw new StatusException('This job is not waiting for this step right now.', 409)
    const config = this.stageConfig(stage, run)
    const state = (run.output && typeof run.output === 'object' ? run.output : {}) as Record<string, any>
    if (String(state.pauseReason || '').toLowerCase() !== config.pauseReason) {
      throw new StatusException(
        stage === 'acknowledgement'
          ? 'The job is not ready for sign-off yet.'
          : stage === 'payout'
            ? 'The job is not ready for payout yet. It must be signed off first.'
            : `This is not the step the work is waiting for right now.`,
        409,
      )
    }

    // Same answer the inbox and the wallet-proof check use: the person this job names, the
    // configured person, anyone holding the step's role, or an owner/admin standing in.
    const verdict = orgWorkflowActorService.mayAct({
      orgTenantId: run.tenantId,
      workflowType: config.workflowType,
      stageAction: config.stageAction,
      userId: callerUserId,
      namedUserId: stageProofService.namedPersonOnRun(run.id, config.stageAction),
    })
    if (!verdict.allowed) {
      throw new StatusException(
        stage === 'acknowledgement'
          ? 'Only the person chosen to sign off this job (or an organization admin) can do this.'
          : stage === 'payout'
            ? 'Only the person chosen to release payment (or an organization admin) can do this.'
            : 'Only the person this organization chose for this step (or an organization admin) can do this.',
        403,
      )
    }
    return { run, config, orgTenantId: run.tenantId, callerUserId }
  }

  private statusOf(error: any): number {
    return error instanceof StatusException ? (error as any).status || 400 : 400
  }

  /**
   * Start a wallet proof for a guarded step. Returns the request the wallet must answer.
   */
  @Post('runs/{runId}/proof/request')
  @Security('jwt', ['tenant'])
  public async createStageProofRequest(
    @Path() runId: string,
    @Body() body: StageProofRequestBody,
    @Request() request: ExRequest,
  ): Promise<StageProofRequestResponse | { error: string }> {
    try {
      const { config, orgTenantId } = this.assertStageActor(request, runId, body?.stage)
      const verifierAgent = (request as any).agent as Agent<RestMultiTenantAgentModules>
      const proofRequest = await stageProofService.createStageProofRequest({
        verifierAgent,
        orgTenantId,
        actionKey: config.actionKey,
        reference: runId,
        idPrefix: config.idPrefix,
        descriptorName: config.descriptorName,
        purpose: config.purpose,
      })
      return { runId, stage: body.stage, ...proofRequest }
    } catch (error: any) {
      this.setStatus(this.statusOf(error))
      return { error: error.message }
    }
  }

  /** Verify the answered proof, stamp it on the run, and move the job forward. */
  private async completeStageWithProof(
    request: ExRequest,
    runId: string,
    body: StageProofCompleteBody,
    submitted?: EmbeddedPresentationResult,
  ): Promise<WorkflowExecutionResult> {
    const { config, orgTenantId, callerUserId } = this.assertStageActor(request, runId, body?.stage)
    if (!body?.requestId) throw new StatusException('requestId is required', 400)
    // Whether this step needs the enrolled phone is the organization's own device-trust policy,
    // so a money step in any workflow is held to it, not only a job payout.
    requireDeviceTrust({
      request,
      orgTenantId,
      stageAction: config.stageAction,
      body,
      transaction: { runId, requestId: body.requestId },
    })

    // Idempotency: a retried completion (same proof request) returns the first outcome
    // instead of trying to move the job twice.
    const db = DatabaseManager.getDatabase()
    const idempotencyAction = `stage-proof:${body.stage}:${runId}`
    const idempotencyCheck = IdempotencyGuard.guard(db, request, orgTenantId, idempotencyAction)
    if (idempotencyCheck.duplicate) return idempotencyCheck.response as WorkflowExecutionResult
    const naturalReplayKey = `natural:stage-proof:${orgTenantId}:${runId}:${body.stage}:${body.requestId}`
    const naturalReplay = IdempotencyGuard.checkAndReturn(db, naturalReplayKey, orgTenantId, idempotencyAction)
    if (naturalReplay) return naturalReplay.response as WorkflowExecutionResult

    const verifierAgent = (request as any).agent as Agent<RestMultiTenantAgentModules>
    const verified = await stageProofService.verifyStageProof({
      verifierAgent,
      requestId: body.requestId,
      orgTenantId,
      actionKey: config.actionKey,
      submitted,
      workflowRunId: runId,
    })
    const submission: Record<string, unknown> = {
      [config.presentationField]: {
        id: verified.requestId,
        type: 'OpenID4VP',
        holderDid: verified.holderDid,
        presentedTypes: verified.presentedTypes,
        actorCredential: verified.actorProof.present && verified.actorProof.valid,
        verifiedAt: verified.verifiedAt,
        verifiedBy: 'server',
      },
    }
    if (body.notes) submission[config.notesField] = body.notes
    if (body.stage === 'acknowledgement') submission.receiverId = callerUserId
    const result = await workflowService.resumeWorkflow(runId, submission, callerUserId)
    if (idempotencyCheck.key) IdempotencyGuard.record(db, idempotencyCheck.key, orgTenantId, idempotencyAction, result)
    IdempotencyGuard.record(db, naturalReplayKey, orgTenantId, idempotencyAction, result)
    return result
  }

  /**
   * Finish a guarded step after the wallet answered the proof request (scan / open-in-app path).
   */
  @Post('runs/{runId}/proof/complete')
  @Security('jwt', ['tenant'])
  public async completeStageProof(
    @Path() runId: string,
    @Body() body: StageProofCompleteBody,
    @Request() request: ExRequest,
  ): Promise<WorkflowExecutionResult> {
    try {
      return await this.completeStageWithProof(request, runId, body)
    } catch (error: any) {
      this.setStatus(this.statusOf(error))
      return { runId, status: 'failed', error: error.message }
    }
  }

  /**
   * Answer the proof request from the caller's own wallet on this server, then finish the step.
   */
  @Post('runs/{runId}/proof/embedded-wallet')
  @Security('jwt', ['tenant'])
  public async completeStageProofWithEmbeddedWallet(
    @Path() runId: string,
    @Body() body: StageProofEmbeddedWalletBody,
    @Request() request: ExRequest,
  ): Promise<WorkflowExecutionResult> {
    try {
      if (!body?.requestId || !body?.presentationRequestUrl || !body?.walletId) {
        throw new StatusException('requestId, presentationRequestUrl and walletId are required', 400)
      }
      // Check the step and the actor before touching the wallet.
      const { config } = this.assertStageActor(request, runId, body.stage)
      const submitted = await stageProofService.presentFromEmbeddedWallet({
        request,
        walletId: body.walletId,
        presentationRequestUrl: body.presentationRequestUrl,
        stageAction: config.stageAction,
        workflowRunId: runId,
      })
      return await this.completeStageWithProof(request, runId, body, submitted)
    } catch (error: any) {
      this.setStatus(this.statusOf(error))
      return { runId, status: 'failed', error: error.message }
    }
  }

  /**
   * Move a waiting job to another available member without advancing the stage.
   */
  @Post('runs/{runId}/reassign')
  @Security('jwt', ['tenant'])
  public async reassignRun(
    @Path() runId: string,
    @Body() body: { assigneeUserId: string },
    @Request() request: ExRequest,
  ): Promise<
    { assigneeId: string; workflowStage?: string; pauseReason?: string; assignmentRecord?: string } | { error: string }
  > {
    try {
      const actedByUserId = (request as any).user?.id
      const callerTenantId = (request as any).user?.tenantId
      const run = workflowRunRepository.findRunById(runId)
      if (!run) throw new Error(`Run not found: ${runId}`)
      if (!callerTenantId || run.tenantId !== callerTenantId) {
        this.setStatus(403)
        return { error: 'This job belongs to another organization.' }
      }
      // Moving a job is an organization-admin decision. Workers and other members never reassign.
      const membership = DatabaseManager.getDatabase()
        .prepare(
          `SELECT role FROM org_memberships WHERE org_tenant_id = ? AND user_id = ? AND status = 'active' LIMIT 1`,
        )
        .get(run.tenantId, actedByUserId) as { role?: string } | undefined
      const role = String(membership?.role || '').toLowerCase()
      if (!['owner', 'admin'].includes(role)) {
        this.setStatus(403)
        return { error: 'Only an organization owner or admin can reassign a job.' }
      }
      return await workflowService.reassignRun(runId, body?.assigneeUserId, actedByUserId)
    } catch (error: any) {
      this.setStatus(error instanceof StatusException ? error.status : 400)
      return { error: error.message }
    }
  }

  @Post('runs/{runId}/assignment-record/replace')
  @Security('jwt', ['tenant'])
  public async replaceAssignmentRecord(
    @Path() runId: string,
    @Request() request: ExRequest,
  ): Promise<{ offerId: string }> {
    const user = (request as any).user || {}
    const run = workflowRunRepository.findRunById(runId)
    if (!run || run.tenantId !== user.tenantId) throw new StatusException('Run not found', 404)
    const membership = DatabaseManager.getDatabase()
      .prepare(`SELECT role FROM org_memberships WHERE org_tenant_id = ? AND user_id = ? AND status = 'active' LIMIT 1`)
      .get(run.tenantId, String(user.id || '')) as { role?: string } | undefined
    if (!['owner', 'admin'].includes(String(membership?.role)))
      throw new StatusException('Only an organization owner or admin can replace an assignment record.', 403)
    return FieldExecutionActions.replaceLegacyAssignmentRecord(runId, String(user.id))
  }

  /**
   * The organisation sorted out a safety hold the worker raised. Marks the hold resolved and
   * tells the worker to redo the safety check. Owner/admin or the person chosen for
   * "sorting out safety holds" (Who does what) may do this; the worker who raised it may not.
   */
  @Post('runs/{runId}/holds/{holdId}/resolve')
  @Security('jwt', ['tenant'])
  public async resolveSafetyHold(
    @Path() runId: string,
    @Path() holdId: string,
    @Body() body: { note: string },
    @Request() request: ExRequest,
  ): Promise<
    | { holdId: string; status: string; resolvedAt?: string; resolvedBy?: string; resolutionNote?: string }
    | { error: string }
  > {
    try {
      const user = (request as any).user || {}
      const callerUserId = String(user.id || '')
      const callerTenantId = String(user.tenantId || '')
      const run = workflowRunRepository.findRunById(runId)
      if (!run) throw new StatusException(`Run not found: ${runId}`, 404)
      if (!callerTenantId || run.tenantId !== callerTenantId) {
        throw new StatusException('This job belongs to another organization.', 403)
      }
      const verdict = orgWorkflowActorService.mayAct({
        orgTenantId: run.tenantId,
        workflowType: 'field_execution_fept',
        stageAction: 'resolve_safety_hold',
        userId: callerUserId,
      })
      if (!verdict.allowed) {
        throw new StatusException(
          'Only an organization admin or the person chosen to sort out safety holds can do this.',
          403,
        )
      }
      // An owner/admin may resolve a hold they raised themselves; anyone else may not.
      const membership = DatabaseManager.getDatabase()
        .prepare(
          `SELECT role FROM org_memberships WHERE org_tenant_id = ? AND user_id = ? AND status = 'active' LIMIT 1`,
        )
        .get(run.tenantId, callerUserId) as { role?: string } | undefined
      const isAdmin = ['owner', 'admin'].includes(String(membership?.role || '').toLowerCase())
      const state = (run.output && typeof run.output === 'object' ? run.output : {}) as Record<string, any>
      const raisedBy = String(
        (Array.isArray(state.checkpointBlocks) ? state.checkpointBlocks : []).find(
          (h: any) => String(h?.id || '') === holdId,
        )?.by || '',
      )
      if (raisedBy && raisedBy === callerUserId && !isAdmin) {
        throw new StatusException('The person who raised a safety hold cannot mark it resolved.', 403)
      }

      // Safe retry: the same resolution twice returns the first outcome.
      const db = DatabaseManager.getDatabase()
      const action = `safety-hold-resolve:${runId}`
      const idempotency = IdempotencyGuard.guard(db, request, run.tenantId, action)
      if (idempotency.duplicate) return idempotency.response
      const naturalKey = `natural:safety-hold-resolve:${run.tenantId}:${runId}:${holdId}`
      const replay = IdempotencyGuard.checkAndReturn(db, naturalKey, run.tenantId, action)
      if (replay) return replay.response

      const result = workflowService.resolveSafetyHold(
        runId,
        holdId,
        String(body?.note || ''),
        callerUserId || undefined,
      )
      if (idempotency.key) IdempotencyGuard.record(db, idempotency.key, run.tenantId, action, result)
      IdempotencyGuard.record(db, naturalKey, run.tenantId, action, result)
      return result
    } catch (error: any) {
      this.setStatus(this.statusOf(error))
      return { error: error.message }
    }
  }

  // ── Hand-offs: a job starts another procedure and waits for it ─────────────────

  /** The run must belong to the caller's organization; returns it with the caller's role. */
  private runForCaller(request: ExRequest, runId: string) {
    const user = (request as any).user || {}
    const run = workflowRunRepository.findRunById(runId)
    if (!run || !canAccessRun(user, run)) throw new StatusException('Run not found', 404)
    const membership = DatabaseManager.getDatabase()
      .prepare(
        `SELECT m.role, r.permissions
           FROM org_memberships m
           LEFT JOIN organizations o ON o.tenant_id = m.org_tenant_id
           LEFT JOIN roles r ON r.organization_id = o.id AND r.membership_role = m.role
          WHERE m.org_tenant_id = ? AND m.user_id = ? AND m.status = 'active'
          LIMIT 1`,
      )
      .get(run.tenantId, String(user.id || '')) as { role?: string; permissions?: string } | undefined
    let permissions: string[] = []
    try {
      permissions = membership?.permissions ? JSON.parse(membership.permissions) : []
    } catch {
      permissions = []
    }
    return {
      run,
      userId: String(user.id || ''),
      role: String(membership?.role || '').toLowerCase(),
      permissions,
    }
  }

  /**
   * What this job can start right now (per the organization's choices), what it already
   * started, and whether it is waiting for any of them.
   */
  @Get('runs/{runId}/handoffs')
  @Security('jwt', ['tenant'])
  public async getRunHandoffs(
    @Path() runId: string,
    @Request() request: ExRequest,
  ): Promise<RunHandoffsView | { error: string }> {
    try {
      const { run } = this.runForCaller(request, runId)
      return workflowHandoffService.viewFor(run)
    } catch (error: any) {
      this.setStatus(this.statusOf(error))
      return { error: error.message }
    }
  }

  /**
   * A tenant-scoped, read-only audit projection. Timeline, table and report exports use
   * these same normalized rows so their dates, actors and evidence cannot drift.
   */
  @Get('runs/{runId}/audit')
  @Security('jwt', ['tenant'])
  public async getRunAudit(
    @Path() runId: string,
    @Request() request: ExRequest,
    @Query() status?: string,
    @Query() event?: string,
    @Query() from?: string,
    @Query() to?: string,
    @Query() format: WorkflowAuditFormat = 'json',
  ): Promise<WorkflowAuditResult | { error: string }> {
    try {
      const { run, userId, role, permissions } = this.runForCaller(request, runId)
      const input = (run.input && typeof run.input === 'object' ? run.input : {}) as Record<string, any>
      const state = (run.output && typeof run.output === 'object' ? run.output : {}) as Record<string, any>
      const isInvolved = [
        String(state.assignment?.assigneeId || input.assigneeId || ''),
        String(input.receiverId || ''),
        String(input.requesterId || ''),
      ].includes(userId)
      const canAudit = ['owner', 'admin'].includes(role) || permissions.includes('audit.read') || isInvolved
      if (!canAudit) throw new StatusException('You do not have permission to view this audit trail.', 403)
      if (format === 'csv' && !['owner', 'admin'].includes(role) && !permissions.includes('report.read')) {
        throw new StatusException('You do not have permission to export reports.', 403)
      }
      const result = workflowAuditService.readRun(runId, run.tenantId, { status, event, from, to, format })!
      if (format === 'csv' && request.res) {
        const filename = `job-audit-${runId.slice(0, 8)}.csv`
        request.res.status(200)
        request.res.setHeader('Content-Type', 'text/csv; charset=utf-8')
        request.res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
        request.res.send(result.csv || '')
      }
      return result
    } catch (error: any) {
      this.setStatus(this.statusOf(error))
      return { error: error.message }
    }
  }

  /**
   * Start a hand-off from this job (for example a quote for extra work). Allowed for the
   * assigned worker, the people chosen for its steps, and organization owners/admins.
   */
  @Post('runs/{runId}/handoffs')
  @Security('jwt', ['tenant'])
  public async startRunHandoff(
    @Path() runId: string,
    @Body() body: StartHandoffBody,
    @Request() request: ExRequest,
  ): Promise<HandoffLink | { error: string }> {
    try {
      const { run, userId, role } = this.runForCaller(request, runId)
      if (!body?.key) throw new StatusException('key is required', 400)
      const input = (run.input && typeof run.input === 'object' ? run.input : {}) as Record<string, any>
      const state = (run.output && typeof run.output === 'object' ? run.output : {}) as Record<string, any>
      const assignee = String(state.assignment?.assigneeId || input.assigneeId || '')
      const isInvolved = [assignee, String(input.receiverId || ''), String(input.requesterId || '')].includes(userId)
      if (!['owner', 'admin'].includes(role) && !isInvolved) {
        throw new StatusException('Only people working on this job or an organization admin can start this.', 403)
      }

      const db = DatabaseManager.getDatabase()
      const action = `workflow-handoff:${runId}:${body.key}`
      const idempotency = IdempotencyGuard.guard(db, request, run.tenantId, action)
      if (idempotency.duplicate) return idempotency.response as HandoffLink

      const link = await workflowHandoffService.start({
        runId,
        key: body.key,
        provided: body.input && typeof body.input === 'object' ? body.input : {},
        actedByUserId: userId,
        mode: 'manual',
      })
      if (idempotency.key) IdempotencyGuard.record(db, idempotency.key, run.tenantId, action, link)
      return link
    } catch (error: any) {
      this.setStatus(this.statusOf(error))
      return { error: error.message }
    }
  }

  /**
   * Get workflow run status and steps
   */
  @Get('runs/{runId}')
  @Security('jwt', ['tenant'])
  public async getRunStatus(
    @Path() runId: string,
    @Request() request: ExRequest,
    @Query() view?: 'summary',
    @Query() includeStepState?: boolean,
  ): Promise<any> {
    try {
      this.runForCaller(request, runId)
      const run = await workflowService.getRunStatus(runId)
      if (view === 'summary') {
        const output = (run.output || {}) as Record<string, any>
        return {
          id: run.id,
          workflowId: run.workflowId,
          tenantId: run.tenantId,
          status: run.status,
          output: { workflowStage: output.workflowStage, pauseReason: output.pauseReason },
        }
      }
      if (includeStepState) return run
      // Each step keeps whole before/after snapshots (with photos), which made one job several MB.
      return {
        ...run,
        steps: (run.steps || []).map(({ inputState: _input, outputState: _output, ...step }: any) => step),
      }
    } catch (error: any) {
      this.setStatus(404)
      return { error: error.message }
    }
  }

  /**
   * List workflow runs
   */
  @Get('runs')
  @Security('jwt', ['tenant'])
  public async listRuns(
    @Request() request: ExRequest,
    @Query() workflowId?: string,
    @Query() status?: string,
    @Query() limit?: number,
  ): Promise<any[]> {
    const tenantId = (request as any).user?.tenantId || 'default'
    const runs = await workflowService.listRuns(tenantId, workflowId, status as any, limit)
    return runs.filter((run) => canAccessRun((request as any).user, run))
  }

  /**
   * List available workflows
   */
  @Get('')
  @Security('jwt', ['tenant'])
  public async listWorkflows(@Request() request: ExRequest, @Query() category?: string): Promise<any[]> {
    const tenantId = (request as any).user?.tenantId || 'default'
    return workflowService.listWorkflows(tenantId, category)
  }

  /**
   * Get a specific workflow definition
   */
  @Get('{workflowId}')
  @Security('jwt', ['tenant'])
  public async getWorkflow(@Path() workflowId: string): Promise<any> {
    const workflow = await workflowService.getWorkflow(workflowId)
    if (!workflow) {
      this.setStatus(404)
      return { error: 'Workflow not found' }
    }
    return workflow
  }

  /**
   * Register a new workflow definition
   */
  @Post('')
  @Security('jwt', ['tenant'])
  public async registerWorkflow(
    @Body() definition: RegisterWorkflowRequest,
    @Request() request: ExRequest,
  ): Promise<any> {
    try {
      const tenantId = (request as any).user?.tenantId || 'default'

      // Validate actions exist
      for (const action of definition.actions) {
        if (!ActionRegistry.has(action.action)) {
          this.setStatus(400)
          return { error: `Unknown action: ${action.action}` }
        }
      }

      await workflowService.registerWorkflow({
        ...definition,
        tenantId,
      })

      this.setStatus(201)
      return { message: 'Workflow registered', id: definition.id }
    } catch (error: any) {
      this.setStatus(400)
      return { error: error.message }
    }
  }

  /**
   * Delete a workflow
   */
  @Delete('{workflowId}')
  @Security('jwt', ['tenant'])
  public async deleteWorkflow(
    @Path() workflowId: string,
    @Request() request: ExRequest,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const deleted = await workflowService.deleteWorkflow(workflowId)
      if (!deleted) {
        this.setStatus(404)
        return { success: false, error: 'Workflow not found' }
      }
      return { success: true }
    } catch (error: any) {
      this.setStatus(400)
      return { success: false, error: error.message }
    }
  }

  /**
   * List available actions
   */
  @Get('actions/available')
  public async listActions(): Promise<string[]> {
    return ActionRegistry.list()
  }
}
