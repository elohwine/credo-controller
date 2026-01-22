/**
 * IdenEx Credentis - Workflow Action Registry
 * 
 * Verifiable Trust Infrastructure for Africa's Digital Economy
 * 
 * Central registry for workflow actions. Actions are named functions
 * that execute within a workflow context, sharing state between steps.
 * 
 * Action naming convention: 'category.action_name'
 * Examples: 'finance.calculate_invoice', 'credential.issue', 'trust.update_score'
 * 
 * @module services/workflow/ActionRegistry
 * @copyright 2024-2026 IdenEx Credentis
 */

import { rootLogger } from '../../utils/pinoLogger'
import { ProviderConfig } from '../../persistence/ProviderRepository'

export type WorkflowActionContext = {
    input: any
    workflowId: string
    tenantId: string
    state: Record<string, any> // Shared state between actions
    runId?: string  // Set when using run tracking
    getProviderConfig?: (providerId: string) => Promise<ProviderConfig>  // Helper to get provider config
}

export type WorkflowActionFunction = (context: WorkflowActionContext, config?: any) => Promise<void>

export class ActionRegistry {
    private static actions: Map<string, WorkflowActionFunction> = new Map()
    private static logger = rootLogger.child({ module: 'ActionRegistry' })

    static register(name: string, action: WorkflowActionFunction) {
        if (this.actions.has(name)) {
            this.logger.warn(`Overwriting existing action: ${name}`)
        }
        this.actions.set(name, action)
        this.logger.info(`Registered action: ${name}`)
    }

    static get(name: string): WorkflowActionFunction | undefined {
        return this.actions.get(name)
    }

    static list(): string[] {
        return Array.from(this.actions.keys())
    }

    static has(name: string): boolean {
        return this.actions.has(name)
    }
}
