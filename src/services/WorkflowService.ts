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

import { workflowRepository, WorkflowRecord } from '../persistence/WorkflowRepository'
import { workflowRunRepository, WorkflowRun, TriggerType } from '../persistence/WorkflowRunRepository'
import { providerRepository } from '../persistence/ProviderRepository'
import { ActionRegistry, WorkflowActionContext } from './workflow/ActionRegistry'
import { FinanceActions } from './workflow/actions/FinanceActions'
import { CredentialActions } from './workflow/actions/CredentialActions'
import { ExternalActions } from './workflow/actions/ExternalActions'
import { TrustActions } from './workflow/actions/TrustActions'
import { ConsentActions } from './workflow/actions/ConsentActions'
import { rootLogger } from '../utils/pinoLogger'

// Register default actions
ActionRegistry.register('finance.calculate_invoice', FinanceActions.calculateInvoice)
ActionRegistry.register('credential.issue', CredentialActions.issueCredential)
ActionRegistry.register('external.fetch', ExternalActions.fetchExternal)
ActionRegistry.register('external.ecocash_payment', ExternalActions.initiateEcoCashPayment)
ActionRegistry.register('external.call_provider', ExternalActions.callProvider)
ActionRegistry.register('external.send_notification', ExternalActions.sendNotification)

// Trust & consent actions
ActionRegistry.register('trust.update_score', TrustActions.updateScore)
ActionRegistry.register('trust.calculate_credit_score', TrustActions.calculateCreditScore)
ActionRegistry.register('trust.get_score', TrustActions.getScore)
ActionRegistry.register('consent.capture', ConsentActions.capture)
ActionRegistry.register('consent.verify', ConsentActions.verify)
ActionRegistry.register('consent.revoke', ConsentActions.revoke)

// Note: workflow.trigger is registered after WorkflowService class definition

export interface ExecuteWorkflowOptions {
    triggerType?: TriggerType
    triggerRef?: string
    async?: boolean  // If true, returns runId immediately
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
    async executeWorkflow(
        workflowId: string,
        input: any,
        tenantId: string = 'default',
        options: ExecuteWorkflowOptions = {}
    ): Promise<WorkflowExecutionResult> {
        this.logger.info({ workflowId, tenantId, options }, 'Executing workflow')

        // 1. Load Workflow
        const workflow = workflowRepository.findById(workflowId)
        if (!workflow) {
            throw new Error(`Workflow not found: ${workflowId}`)
        }

        // 2. Create Run Record
        const run = workflowRunRepository.createRun({
            workflowId,
            tenantId,
            status: 'pending',
            input,
            triggerType: options.triggerType || 'manual',
            triggerRef: options.triggerRef,
            totalSteps: workflow.actions.length
        })

        // 3. If async, return immediately
        if (options.async) {
            // Start execution in background
            this.executeRunAsync(run.id, workflow, input, tenantId).catch(err => {
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
    async resumeWorkflow(runId: string, resumeData?: any): Promise<WorkflowExecutionResult> {
        const run = workflowRunRepository.findRunById(runId)
        if (!run) {
            throw new Error(`Run not found: ${runId}`)
        }

        if (run.status !== 'paused') {
            throw new Error(`Cannot resume run with status: ${run.status}`)
        }

        const workflow = workflowRepository.findById(run.workflowId)
        if (!workflow) {
            throw new Error(`Workflow not found: ${run.workflowId}`)
        }

        // Merge resume data into existing input
        const mergedInput = { ...run.input, _resumeData: resumeData }

        return this.executeRun(runId, workflow, mergedInput, run.tenantId, run.currentStep)
    }

    /**
     * Get run status and details
     */
    async getRunStatus(runId: string): Promise<WorkflowRun & { steps?: any[] }> {
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
    async listRuns(tenantId: string, workflowId?: string, status?: any, limit?: number) {
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
        startFromStep: number = 0
    ): Promise<WorkflowExecutionResult> {
        // Update run to running
        workflowRunRepository.updateRun(runId, {
            status: 'running',
            startedAt: new Date()
        })

        // Initialize Context
        const context: WorkflowActionContext = {
            input,
            workflowId: workflow.id,
            tenantId,
            state: {},
            runId,
            // Helper to get provider config
            getProviderConfig: async (providerId: string) => {
                const config = providerRepository.findDefaultConfig(tenantId, providerId)
                if (!config) {
                    throw new Error(`No config found for provider: ${providerId}`)
                }
                return config
            }
        }

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
                    completedAt: new Date()
                })
                return { runId, status: 'failed', error }
            }

            // Create step record
            const step = workflowRunRepository.createStep({
                runId,
                stepIndex: i,
                actionName,
                config: actionConfig.config,
                inputState: { ...context.state }
            })

            // Update run current step
            workflowRunRepository.updateRun(runId, { currentStep: i })

            const stepStartTime = Date.now()

            try {
                // Mark step as running
                workflowRunRepository.updateStep(step.id, {
                    status: 'running',
                    startedAt: new Date()
                })

                this.logger.debug({ action: actionName, step: i }, 'Running action')
                await actionFn(context, actionConfig.config)

                // Mark step as completed
                workflowRunRepository.updateStep(step.id, {
                    status: 'completed',
                    outputState: { ...context.state },
                    durationMs: Date.now() - stepStartTime,
                    completedAt: new Date()
                })

            } catch (error: any) {
                this.logger.error({ error, action: actionName }, 'Action failed')

                // Check if action requested pause (for async operations like webhooks)
                if (error.message === 'WORKFLOW_PAUSE') {
                    workflowRunRepository.updateStep(step.id, {
                        status: 'completed',
                        outputState: { ...context.state },
                        durationMs: Date.now() - stepStartTime,
                        completedAt: new Date()
                    })
                    workflowRunRepository.updateRun(runId, {
                        status: 'paused',
                        output: context.state,
                        currentStep: i + 1  // Resume from next step
                    })
                    return { runId, status: 'running', output: context.state }
                }

                // Mark step as failed
                workflowRunRepository.updateStep(step.id, {
                    status: 'failed',
                    error: error.message,
                    durationMs: Date.now() - stepStartTime,
                    completedAt: new Date()
                })

                // Mark run as failed
                workflowRunRepository.updateRun(runId, {
                    status: 'failed',
                    error: error.message,
                    output: context.state,
                    completedAt: new Date()
                })

                return { runId, status: 'failed', error: error.message, output: context.state }
            }
        }

        // Mark run as completed
        workflowRunRepository.updateRun(runId, {
            status: 'completed',
            output: context.state,
            completedAt: new Date()
        })

        this.logger.info({ workflowId: workflow.id, runId }, 'Workflow execution completed')
        return { runId, status: 'completed', output: context.state }
    }

    /**
     * Internal: Execute run asynchronously
     */
    private async executeRunAsync(
        runId: string,
        workflow: WorkflowRecord,
        input: any,
        tenantId: string
    ): Promise<void> {
        await this.executeRun(runId, workflow, input, tenantId)
    }

    /**
     * Static action: Trigger a sub-workflow
     */
    static async triggerSubWorkflow(context: WorkflowActionContext, config: any = {}): Promise<void> {
        const { workflowId, inputMapping = {} } = config

        if (!workflowId) {
            throw new Error('workflow.trigger requires workflowId in config')
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

        // Execute sub-workflow
        const result = await workflowService.executeWorkflow(
            workflowId,
            subInput,
            context.tenantId,
            { triggerType: 'workflow', triggerRef: context.runId }
        )

        // Store result in parent state
        context.state.subWorkflow = {
            workflowId,
            runId: result.runId,
            status: result.status,
            output: result.output
        }
    }

    async listWorkflows(tenantId?: string, category?: string) {
        return workflowRepository.list(tenantId, category)
    }

    async registerWorkflow(def: any) {
        workflowRepository.save(def)
    }

    async deleteWorkflow(id: string): Promise<boolean> {
        return workflowRepository.deleteById(id)
    }

    async getWorkflow(id: string): Promise<WorkflowRecord | undefined> {
        return workflowRepository.findById(id)
    }
}

export const workflowService = new WorkflowService()

// Register workflow.trigger action after class is defined
ActionRegistry.register('workflow.trigger', WorkflowService.triggerSubWorkflow)
