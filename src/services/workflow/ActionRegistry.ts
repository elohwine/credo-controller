import { rootLogger } from '../../utils/pinoLogger'

export type WorkflowActionContext = {
    input: any
    workflowId: string
    tenantId: string
    state: Record<string, any> // Shared state between actions
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
}
