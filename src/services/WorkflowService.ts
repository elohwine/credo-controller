import { workflowRepository } from '../persistence/WorkflowRepository'
import { ActionRegistry, WorkflowActionContext } from './workflow/ActionRegistry'
import { FinanceActions } from './workflow/actions/FinanceActions'
import { CredentialActions } from './workflow/actions/CredentialActions'
import { ExternalActions } from './workflow/actions/ExternalActions'
import { rootLogger } from '../utils/pinoLogger'

// Register default actions
ActionRegistry.register('finance.calculate_invoice', FinanceActions.calculateInvoice)
ActionRegistry.register('credential.issue', CredentialActions.issueCredential)
ActionRegistry.register('external.fetch', ExternalActions.fetchExternal)
ActionRegistry.register('external.ecocash_payment', ExternalActions.initiateEcoCashPayment)

export class WorkflowService {
    private logger = rootLogger.child({ module: 'WorkflowService' })

    async executeWorkflow(workflowId: string, input: any, tenantId: string = 'default'): Promise<any> {
        this.logger.info({ workflowId, tenantId }, 'Executing workflow')

        // 1. Load Workflow
        const workflow = workflowRepository.findById(workflowId)
        if (!workflow) {
            throw new Error(`Workflow not found: ${workflowId}`)
        }

        // 2. Initialize Context
        const context: WorkflowActionContext = {
            input,
            workflowId,
            tenantId,
            state: {}
        }

        // 3. Execute Actions
        for (const actionConfig of workflow.actions) {
            const actionName = actionConfig.action
            const actionFn = ActionRegistry.get(actionName)

            if (!actionFn) {
                throw new Error(`Unknown action: ${actionName}`)
            }

            try {
                this.logger.debug({ action: actionName }, 'Running action')
                await actionFn(context, actionConfig.config)
            } catch (error) {
                this.logger.error({ error, action: actionName }, 'Action failed')
                throw error
            }
        }

        this.logger.info({ workflowId }, 'Workflow execution completed')
        return context.state
    }

    async listWorkflows(tenantId?: string, category?: string) {
        return workflowRepository.list(tenantId, category)
    }

    async registerWorkflow(def: any) {
        workflowRepository.save(def)
    }
}

export const workflowService = new WorkflowService()
