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

import { Request as ExRequest } from 'express'
import { Controller, Post, Get, Delete, Route, Tags, Body, Path, Query, Request, Security } from 'tsoa'

import { StatusException } from '../../errors'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import { workflowRunRepository } from '../../persistence/WorkflowRunRepository'
import { orgWorkflowActorService } from '../../services/OrgWorkflowActorService'
import { workflowService, ExecuteWorkflowOptions, WorkflowExecutionResult } from '../../services/WorkflowService'
import { stageProofService, type EmbeddedPresentationResult } from '../../services/ssi/StageProofService'
import { ActionRegistry } from '../../services/workflow/ActionRegistry'
import {
  workflowHandoffService,
  type HandoffLink,
  type RunHandoffsView,
} from '../../services/workflow/WorkflowHandoffService'
import { IdempotencyGuard } from '../../utils/IdempotencyGuard'

interface StartHandoffBody {
  /** Hand-off key from GET runs/{runId}/handoffs (for example `field_quote_extra_work`). */
  key: string
  /** The fields that hand-off asks for (description, amount, …). */
  input?: Record<string, unknown>
}

/** Steps of a job that need the acting person to prove themselves from their wallet first. */
type StageProofStage = 'acknowledgement' | 'payout'

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
}

interface StageProofEmbeddedWalletBody extends StageProofCompleteBody {
  presentationRequestUrl: string
  walletId: string
}

const STAGE_PROOF_CONFIG: Record<
  StageProofStage,
  {
    pauseReason: string
    actionKey: 'field_ack' | 'field_payout'
    stageAction: string
    presentationField: 'acknowledgementPresentation' | 'releasePresentation'
    idPrefix: string
    descriptorName: string
    purpose: string
    notesField: string
  }
> = {
  acknowledgement: {
    pauseReason: 'await_acknowledgement',
    actionKey: 'field_ack',
    stageAction: 'acknowledge_execution',
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
    presentationField: 'releasePresentation',
    idPrefix: 'job-payout',
    descriptorName: 'Your role credential',
    purpose: 'Confirm you are the person this organization chose to release payment for finished work.',
    notesField: 'payoutNotes',
  },
}

/** Fields only the server may set on a resume submission. */
const SERVER_ONLY_RESUME_FIELDS = ['actedByUserId', 'acknowledgementPresentation', 'releasePresentation'] as const

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
      const result = await workflowService.resumeWorkflow(runId, submission, (request as any).user?.id)
      return result
    } catch (error: any) {
      this.setStatus(400)
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
      if (!run) throw new StatusException(`Run not found: ${runId}`, 404)
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

  private stageConfig(stage: unknown) {
    const config = STAGE_PROOF_CONFIG[String(stage || '') as StageProofStage]
    if (!config) throw new StatusException(`Unknown step '${String(stage)}'. Use acknowledgement or payout.`, 400)
    return config
  }

  /**
   * The run must belong to the caller's organization, be waiting at the step, and the
   * caller must be the person chosen for it (or an owner/admin standing in).
   */
  private assertStageActor(request: ExRequest, runId: string, stage: StageProofStage) {
    const config = this.stageConfig(stage)
    const user = (request as any).user || {}
    const callerTenantId = String(user.tenantId || '')
    const callerUserId = String(user.id || '')
    const run = workflowRunRepository.findRunById(runId)
    if (!run) throw new StatusException(`Run not found: ${runId}`, 404)
    if (!callerTenantId || run.tenantId !== callerTenantId) {
      throw new StatusException('This job belongs to another organization.', 403)
    }
    if (run.status !== 'paused') throw new StatusException('This job is not waiting for this step right now.', 409)
    const state = (run.output && typeof run.output === 'object' ? run.output : {}) as Record<string, any>
    if (String(state.pauseReason || '').toLowerCase() !== config.pauseReason) {
      throw new StatusException(
        stage === 'acknowledgement'
          ? 'The job is not ready for sign-off yet.'
          : 'The job is not ready for payout yet. It must be signed off first.',
        409,
      )
    }

    const membership = DatabaseManager.getDatabase()
      .prepare(`SELECT role FROM org_memberships WHERE org_tenant_id = ? AND user_id = ? AND status = 'active' LIMIT 1`)
      .get(run.tenantId, callerUserId) as { role?: string } | undefined
    const role = String(membership?.role || '').toLowerCase()
    const isAdmin = ['owner', 'admin'].includes(role)

    const input = (run.input && typeof run.input === 'object' ? run.input : {}) as Record<string, any>
    const namedPerson = stage === 'acknowledgement' ? String(input.receiverId || '').trim() : ''
    const configured = orgWorkflowActorService.resolveActor({
      orgTenantId: run.tenantId,
      workflowType: 'field_execution_fept',
      stageAction: config.stageAction,
    })
    const isNamed = Boolean(namedPerson) && namedPerson === callerUserId
    const isConfigured = Boolean(configured.userId) && configured.userId === callerUserId
    if (!isNamed && !isConfigured && !isAdmin) {
      throw new StatusException(
        stage === 'acknowledgement'
          ? 'Only the person chosen to sign off this job (or an organization admin) can do this.'
          : 'Only the person chosen to release payment (or an organization admin) can do this.',
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
      this.assertStageActor(request, runId, body.stage)
      const submitted = await stageProofService.presentFromEmbeddedWallet({
        request,
        walletId: body.walletId,
        presentationRequestUrl: body.presentationRequestUrl,
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
  ): Promise<{ assigneeId: string; workflowStage?: string; pauseReason?: string } | { error: string }> {
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
      return workflowService.reassignRun(runId, body?.assigneeUserId, actedByUserId)
    } catch (error: any) {
      this.setStatus(400)
      return { error: error.message }
    }
  }

  // ── Hand-offs: a job starts another procedure and waits for it ─────────────────

  /** The run must belong to the caller's organization; returns it with the caller's role. */
  private runForCaller(request: ExRequest, runId: string) {
    const user = (request as any).user || {}
    const run = workflowRunRepository.findRunById(runId)
    if (!run) throw new StatusException(`Run not found: ${runId}`, 404)
    if (!user.tenantId || run.tenantId !== user.tenantId) {
      throw new StatusException('This job belongs to another organization.', 403)
    }
    const membership = DatabaseManager.getDatabase()
      .prepare(`SELECT role FROM org_memberships WHERE org_tenant_id = ? AND user_id = ? AND status = 'active' LIMIT 1`)
      .get(run.tenantId, String(user.id || '')) as { role?: string } | undefined
    return { run, userId: String(user.id || ''), role: String(membership?.role || '').toLowerCase() }
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
  public async getRunStatus(@Path() runId: string, @Request() request: ExRequest): Promise<any> {
    try {
      return await workflowService.getRunStatus(runId)
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
    return workflowService.listRuns(tenantId, workflowId, status as any, limit)
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
