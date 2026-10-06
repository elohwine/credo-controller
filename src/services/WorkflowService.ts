/**
 * IdenEx Credentis - Workflow Execution Engine
 *
 * Verifiable Trust Infrastructure for Africa's Digital Economy
 *
 * Core service for executing automated VC workflows. Handles:
 * - Sequential action execution with shared state
 * - Run tracking and step logging for audit
 * - Pause/resume for external triggers (payment confirmations)
 * - Sub-workflow triggering and chaining
 * - Provider config injection for external calls
 *
 * @module services/WorkflowService
 * @copyright 2024-2026 IdenEx Credentis
 */

import type { WorkflowRecord } from '../persistence/WorkflowRepository'
import type { WorkflowRun, TriggerType } from '../persistence/WorkflowRunRepository'
import type { WorkflowActionContext } from './workflow/ActionRegistry'

import { providerRepository } from '../persistence/ProviderRepository'
import { workflowRepository } from '../persistence/WorkflowRepository'
import { workflowRunRepository } from '../persistence/WorkflowRunRepository'
import { rootLogger } from '../utils/pinoLogger'

import { workflowReadinessService } from './WorkflowReadinessService'
import { ActionRegistry } from './workflow/ActionRegistry'
import { workflowHandoffService } from './workflow/WorkflowHandoffService'
import { ConsentActions } from './workflow/actions/ConsentActions'
import { CredentialActions } from './workflow/actions/CredentialActions'
import { ecocashPayment, ecocashPaymentProof, ecocashTransactionLookup } from './workflow/actions/EcoCashActions'
import { ExternalActions } from './workflow/actions/ExternalActions'
import { FieldExecutionActions } from './workflow/actions/FieldExecutionActions'
import { FinanceActions } from './workflow/actions/FinanceActions'
import { RequestTaskActions } from './workflow/actions/RequestTaskActions'
import { triggerFollowOnRequest } from './workflow/actions/RequestTriggerAction'
import { TrustActions } from './workflow/actions/TrustActions'
import { createWorkflowStartAction } from './workflow/actions/WorkflowStartAction'
import { ensureExecutableWorkflow } from './workflow/materialize'

// Register default actions
ActionRegistry.register('finance.calculate_invoice', FinanceActions.calculateInvoice)
ActionRegistry.register('credential.issue', CredentialActions.issueCredential)
ActionRegistry.register('external.fetch', ExternalActions.fetchExternal)
ActionRegistry.register('external.ecocash_payment', ExternalActions.initiateEcoCashPayment)
ActionRegistry.register('external.call_provider', ExternalActions.callProvider)
ActionRegistry.register('external.send_notification', ExternalActions.sendNotification)

// EcoCash provider actions
ActionRegistry.register('ecocash.payment', ecocashPayment)
ActionRegistry.register('ecocash.transaction.lookup', ecocashTransactionLookup)
ActionRegistry.register('ecocash.payment.proof', ecocashPaymentProof)

// Trust & consent actions
ActionRegistry.register('trust.update_score', TrustActions.updateScore)
ActionRegistry.register('trust.calculate_credit_score', TrustActions.calculateCreditScore)
ActionRegistry.register('trust.get_score', TrustActions.getScore)
ActionRegistry.register('consent.capture', ConsentActions.capture)
ActionRegistry.register('consent.verify', ConsentActions.verify)
ActionRegistry.register('consent.revoke', ConsentActions.revoke)
ActionRegistry.register('request.wait_for_task', RequestTaskActions.waitForTask)
ActionRegistry.register('request.complete_task', RequestTaskActions.completeTask)
ActionRegistry.register('request.trigger', triggerFollowOnRequest)

// Field execution actions (FEPT)
ActionRegistry.register('field.transition', FieldExecutionActions.transition)
ActionRegistry.register('field.assign', FieldExecutionActions.assign)
ActionRegistry.register('field.pause', FieldExecutionActions.pause)
ActionRegistry.register('field.checkpoint', FieldExecutionActions.checkpoint)
ActionRegistry.register('field.capture_evidence', FieldExecutionActions.captureEvidence)
ActionRegistry.register('field.acknowledge', FieldExecutionActions.acknowledge)
ActionRegistry.register('field.trigger_payment', FieldExecutionActions.triggerPayment)
ActionRegistry.register('field.payment.trigger', FieldExecutionActions.triggerPayment) // legacy alias
ActionRegistry.register('field.mark_receipt_issued', FieldExecutionActions.markReceiptIssued)
ActionRegistry.register('field.reconcile', FieldExecutionActions.reconcile)

// Note: workflow.trigger is registered after WorkflowService class definition

export interface ExecuteWorkflowOptions {
  triggerType?: TriggerType
  triggerRef?: string
  async?: boolean // If true, returns runId immediately
}

export interface WorkflowExecutionResult {
  runId: string
  status: 'completed' | 'running' | 'failed'
  output?: any
  error?: string
}

export class WorkflowService {
  private logger = rootLogger.child({ module: 'WorkflowService' })

  /**
   * Execute a workflow with full run tracking
   */
  public async executeWorkflow(
    workflowId: string,
    input: any,
    tenantId: string = 'default',
    options: ExecuteWorkflowOptions = {},
  ): Promise<WorkflowExecutionResult> {
    this.logger.info({ workflowId, tenantId, options }, 'Executing workflow')

    // 1. Load the executable workflow. A configured template is materialized on
    // demand; readiness (not the enabled flag) decides whether it may run.
    let workflow = workflowRepository.findById(workflowId)
    if (!workflow || workflow.tenantId !== tenantId) {
      workflow = ensureExecutableWorkflow(tenantId, workflowId)
    } else if (workflow.provider === 'workflow-template') {
      // Materialized rows cache the org template; refresh so new jobs pick up upgraded steps
      // (e.g. FEPT inspection / sign-off / payout pauses). Live runs keep their own snapshot.
      workflow = ensureExecutableWorkflow(tenantId, workflowId) || workflow
    }
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`)
    }
    workflowReadinessService.assertExecutable(tenantId, workflow.category || workflowId)

    // 2. Create Run Record
    const run = workflowRunRepository.createRun({
      workflowId,
      tenantId,
      status: 'pending',
      input,
      triggerType: options.triggerType || 'manual',
      triggerRef: options.triggerRef,
      // A run keeps the steps it started with, so changing a template never shifts a live job's checkpoints.
      actionsSnapshot: workflow.actions,
      totalSteps: workflow.actions.length,
    })

    // 3. If async, return immediately
    if (options.async) {
      // Start execution in background
      this.executeRunAsync(run.id, workflow, input, tenantId).catch((err) => {
        this.logger.error({ runId: run.id, error: err }, 'Async workflow execution failed')
      })
      return { runId: run.id, status: 'running' }
    }

    // 4. Execute synchronously
    return this.executeRun(run.id, workflow, input, tenantId)
  }

  /**
   * Resume a paused workflow run
   */
  public async resumeWorkflow(
    runId: string,
    resumeData?: any,
    actedByUserId?: string,
  ): Promise<WorkflowExecutionResult> {
    const run = workflowRunRepository.findRunById(runId)
    if (!run) {
      throw new Error(`Run not found: ${runId}`)
    }

    if (run.status !== 'paused') {
      throw new Error(`Cannot resume run with status: ${run.status}`)
    }

    // A job that handed control to another procedure waits for it before it can continue.
    const hold = workflowHandoffService.holdMessage(runId)
    if (hold) throw new Error(hold)

    // Reject a bad checkpoint submission while the run is still paused (it must not fail the run).
    FieldExecutionActions.prepareResume(runId, resumeData, actedByUserId)
    if (actedByUserId) {
      resumeData = { ...(resumeData && typeof resumeData === 'object' ? resumeData : {}), actedByUserId }
    }

    const storedWorkflow = workflowRepository.findById(run.workflowId)
    if (!storedWorkflow) {
      throw new Error(`Workflow not found: ${run.workflowId}`)
    }
    const workflow =
      Array.isArray(run.actionsSnapshot) && run.actionsSnapshot.length > 0
        ? { ...storedWorkflow, actions: run.actionsSnapshot }
        : storedWorkflow

    // Merge resume data into the top-level input so checkpoint actions (evidence
    // capture, acknowledgement, reassignment) can read the new fields directly from
    // context.input, and restore the state persisted when the run paused so
    // stage / assignment / evidence progress is not lost between checkpoints.
    const mergedInput = {
      ...(run.input || {}),
      ...(resumeData && typeof resumeData === 'object' ? resumeData : {}),
      _resumeData: resumeData,
    }
    const resumedState = (run.output && typeof run.output === 'object' ? run.output : {}) as Record<string, unknown>

    return this.executeRun(runId, workflow, mergedInput, run.tenantId, run.currentStep, resumedState)
  }

  /**
   * Run a failed run again from the step that failed, keeping the state it had reached.
   * Steps already done are not repeated.
   */
  public async retryFailedRun(runId: string, actedByUserId?: string): Promise<WorkflowExecutionResult> {
    const run = workflowRunRepository.findRunById(runId)
    if (!run) throw new Error(`Run not found: ${runId}`)
    if (run.status !== 'failed') throw new Error(`Only a failed job can be retried (status: ${run.status})`)

    const storedWorkflow = workflowRepository.findById(run.workflowId)
    if (!storedWorkflow) throw new Error(`Workflow not found: ${run.workflowId}`)
    const workflow =
      Array.isArray(run.actionsSnapshot) && run.actionsSnapshot.length > 0
        ? { ...storedWorkflow, actions: run.actionsSnapshot }
        : storedWorkflow

    const input = { ...(run.input || {}), ...(actedByUserId ? { actedByUserId } : {}) }
    const state = (run.output && typeof run.output === 'object' ? run.output : {}) as Record<string, unknown>
    workflowRunRepository.updateRun(runId, { status: 'running', error: null as any, completedAt: null as any })
    return this.executeRun(runId, workflow, input, run.tenantId, run.currentStep, state)
  }

  /** Reassign a paused field job. The checkpoint stays where it is. */
  public reassignRun(runId: string, assigneeUserId: string, actedByUserId?: string) {
    return FieldExecutionActions.reassignRun(runId, assigneeUserId, actedByUserId)
  }

  /**
   * Get run status and details
   */
  public async getRunStatus(runId: string): Promise<WorkflowRun & { steps?: any[] }> {
    const run = workflowRunRepository.findRunById(runId)
    if (!run) {
      throw new Error(`Run not found: ${runId}`)
    }

    const steps = workflowRunRepository.listSteps(runId)
    return { ...run, steps }
  }

  /**
   * List workflow runs
   */
  public async listRuns(tenantId: string, workflowId?: string, status?: any, limit?: number) {
    return workflowRunRepository.listRuns(tenantId, workflowId, status, limit)
  }

  /**
   * Internal: Execute workflow run with step tracking
   */
  private async executeRun(
    runId: string,
    workflow: WorkflowRecord,
    input: any,
    tenantId: string,
    startFromStep: number = 0,
    initialState: Record<string, unknown> = {},
  ): Promise<WorkflowExecutionResult> {
    // Update run to running
    workflowRunRepository.updateRun(runId, {
      status: 'running',
      startedAt: new Date(),
    })

    // Initialize Context
    const context: WorkflowActionContext = {
      input,
      workflowId: workflow.id,
      tenantId,
      state: { ...initialState },
      runId,
      // Helper to get provider config
      getProviderConfig: async (providerId: string) => {
        const config = providerRepository.findDefaultConfig(tenantId, providerId)
        if (!config) {
          throw new Error(`No config found for provider: ${providerId}`)
        }
        return config
      },
    }

    // The stage this resume completes (hand-offs become available after certain stages).
    const resumedPause = startFromStep > 0 ? String(initialState.pauseReason || '') : ''

    // Execute Actions
    for (let i = startFromStep; i < workflow.actions.length; i++) {
      const actionConfig = workflow.actions[i]
      const actionName = actionConfig.action
      const actionFn = ActionRegistry.get(actionName)

      if (!actionFn) {
        const error = `Unknown action: ${actionName}`
        workflowRunRepository.updateRun(runId, {
          status: 'failed',
          error,
          completedAt: new Date(),
        })
        return { runId, status: 'failed', error }
      }

      // Create step record
      const step = workflowRunRepository.createStep({
        runId,
        stepIndex: i,
        actionName,
        config: actionConfig.config,
        inputState: { ...context.state },
      })

      // Update run current step
      workflowRunRepository.updateRun(runId, { currentStep: i })

      const stepStartTime = Date.now()

      try {
        // Mark step as running
        workflowRunRepository.updateStep(step.id, {
          status: 'running',
          startedAt: new Date(),
        })

        this.logger.debug({ action: actionName, step: i }, 'Running action')
        // Annotate context with current step identity so actions (e.g. CredentialActions)
        // can pass stageAction/workflowType to WorkflowVcOfferDispatcher.
        context.stageAction = actionName
        context.workflowType = (workflow as any).workflowType ?? workflow.category ?? workflow.id
        await actionFn(context, actionConfig.config)

        if (resumedPause && i === startFromStep) {
          const done = new Set<string>(
            Array.isArray(context.state.completedStages) ? (context.state.completedStages as string[]) : [],
          )
          done.add(resumedPause)
          context.state.completedStages = [...done]
        }

        // Mark step as completed
        workflowRunRepository.updateStep(step.id, {
          status: 'completed',
          outputState: { ...context.state },
          durationMs: Date.now() - stepStartTime,
          completedAt: new Date(),
        })
      } catch (error: any) {
        this.logger.error({ error, action: actionName }, 'Action failed')

        // Check if action requested pause (for async operations like webhooks)
        if (error.message === 'WORKFLOW_PAUSE') {
          workflowRunRepository.updateStep(step.id, {
            status: 'completed',
            outputState: { ...context.state },
            durationMs: Date.now() - stepStartTime,
            completedAt: new Date(),
          })
          workflowRunRepository.updateRun(runId, {
            status: 'paused',
            output: context.state,
            currentStep: i + 1, // Resume from next step
          })
          // Hand-offs the organization set to start by themselves at this stage.
          try {
            await workflowHandoffService.autoStartFor(runId)
          } catch (handoffError: any) {
            this.logger.warn({ runId, error: handoffError?.message }, 'Automatic hand-off check failed')
          }
          return { runId, status: 'running', output: context.state }
        }

        // Mark step as failed
        workflowRunRepository.updateStep(step.id, {
          status: 'failed',
          error: error.message,
          durationMs: Date.now() - stepStartTime,
          completedAt: new Date(),
        })

        // A rejected submission at a checkpoint (wrong photo phase, missing wallet proof, bad
        // payload) must not kill the job: put the run back where it was paused so the person
        // can fix their input and try again. Later steps failing still fail the run.
        if (startFromStep > 0 && i === startFromStep) {
          workflowRunRepository.updateRun(runId, {
            status: 'paused',
            error: error.message,
            output: initialState,
            currentStep: startFromStep,
          })
          return { runId, status: 'failed', error: error.message, output: initialState }
        }

        // Mark run as failed
        workflowRunRepository.updateRun(runId, {
          status: 'failed',
          error: error.message,
          output: context.state,
          completedAt: new Date(),
        })
        await this.notifyParentOfFinish(runId, 'failed', context.state)

        return { runId, status: 'failed', error: error.message, output: context.state }
      }
    }

    // Mark run as completed
    workflowRunRepository.updateRun(runId, {
      status: 'completed',
      output: context.state,
      completedAt: new Date(),
    })

    this.logger.info({ workflowId: workflow.id, runId }, 'Workflow execution completed')
    await this.notifyParentOfFinish(runId, 'completed', context.state)
    return { runId, status: 'completed', output: context.state }
  }

  /** If this run was started as a hand-off from another job, hand control back. */
  private async notifyParentOfFinish(runId: string, status: 'completed' | 'failed', state: Record<string, unknown>) {
    try {
      await workflowHandoffService.onRunFinished(runId, status, state)
    } catch (error: any) {
      this.logger.warn({ runId, error: error?.message }, 'Parent job was not told the hand-off finished')
    }
  }

  /**
   * Internal: Execute run asynchronously
   */
  private async executeRunAsync(runId: string, workflow: WorkflowRecord, input: any, tenantId: string): Promise<void> {
    await this.executeRun(runId, workflow, input, tenantId)
  }

  /**
   * Static action: Trigger a sub-workflow
   */
  public static async triggerSubWorkflow(context: WorkflowActionContext, config: any = {}): Promise<void> {
    const { workflowId, inputMapping = {} } = config

    if (!workflowId) {
      context.state.subWorkflow = {
        status: 'skipped',
        reason: 'workflow.trigger config missing workflowId',
      }
      return
    }

    // Map input from parent context
    const subInput: any = {}
    for (const [key, path] of Object.entries(inputMapping)) {
      const pathParts = (path as string).split('.')
      let value: any = context
      for (const p of pathParts) {
        value = value?.[p]
      }
      subInput[key] = value
    }

    // Execute sub-workflow via a local instance to avoid use-before-define
    const result = await new WorkflowService().executeWorkflow(workflowId, subInput, context.tenantId, {
      triggerType: 'workflow',
      triggerRef: context.runId,
    })

    // Store result in parent state
    context.state.subWorkflow = {
      workflowId,
      runId: result.runId,
      status: result.status,
      output: result.output,
    }
  }

  public async listWorkflows(tenantId?: string, category?: string) {
    return workflowRepository.list(tenantId, category)
  }

  public async registerWorkflow(def: any) {
    workflowRepository.save(def)
  }

  public async deleteWorkflow(id: string): Promise<boolean> {
    return workflowRepository.deleteById(id)
  }

  public async getWorkflow(id: string): Promise<WorkflowRecord | undefined> {
    return workflowRepository.findById(id)
  }
}

export const workflowService = new WorkflowService()

// Register workflow.trigger action after class is defined
ActionRegistry.register('workflow.trigger', WorkflowService.triggerSubWorkflow)

// workflow.start: readiness-gated hand-off to another template (org setup model).
ActionRegistry.register(
  'workflow.start',
  createWorkflowStartAction(
    () => (workflowId, input, tenantId, options) =>
      workflowService.executeWorkflow(workflowId, input, tenantId, options),
  ),
)
