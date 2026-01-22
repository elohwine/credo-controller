/**
 * IdenEx Credentis - Workflow Trigger Service
 * 
 * Verifiable Trust Infrastructure for Africa's Digital Economy
 * 
 * Manages automatic workflow triggers:
 * - Webhook triggers: External systems call our endpoints
 * - Schedule triggers: Cron-based periodic execution
 * - Event triggers: Internal event bus subscriptions
 * 
 * @module services/TriggerService
 * @copyright 2024-2026 IdenEx Credentis
 */

import { workflowRunRepository, TriggerType } from '../persistence/WorkflowRunRepository'
import { workflowRepository } from '../persistence/WorkflowRepository'
import { workflowService } from './WorkflowService'
import { DatabaseManager } from '../persistence/DatabaseManager'
import { rootLogger } from '../utils/pinoLogger'
import { v4 as uuid } from 'uuid'
import * as cron from 'node-cron'

const logger = rootLogger.child({ module: 'TriggerService' })

export interface WebhookTriggerConfig {
    secretKey?: string          // Optional HMAC secret for validation
    inputMapping?: Record<string, string>  // Map webhook payload fields to workflow input
    requiredFields?: string[]   // Fields that must be present in payload
}

export interface ScheduleTriggerConfig {
    cronExpression: string      // Cron expression (e.g., '0 9 * * 1' for Monday 9am)
    timezone?: string           // Timezone (default: 'Africa/Harare')
    inputData?: Record<string, any>  // Static input data for scheduled runs
}

export interface EventTriggerConfig {
    eventType: string           // Event type to listen for (e.g., 'payment.completed')
    sourceFilter?: string       // Optional filter on event source
    inputMapping?: Record<string, string>
}

export interface WorkflowTrigger {
    id: string
    workflowId: string
    tenantId: string
    triggerType: 'webhook' | 'schedule' | 'event'
    triggerConfig: WebhookTriggerConfig | ScheduleTriggerConfig | EventTriggerConfig
    isActive: boolean
    lastTriggeredAt?: Date
    createdAt?: Date
}

class TriggerService {
    private scheduledJobs: Map<string, cron.ScheduledTask> = new Map()
    private eventListeners: Map<string, Set<string>> = new Map()  // eventType -> Set<triggerId>

    /**
     * Initialize trigger service - load and start scheduled triggers
     */
    async initialize(): Promise<void> {
        logger.info('Initializing TriggerService')
        
        // Load all active schedule triggers
        const triggers = this.listTriggers({ triggerType: 'schedule', isActive: true })
        for (const trigger of triggers) {
            this.startScheduledTrigger(trigger)
        }

        // Load event triggers into memory
        const eventTriggers = this.listTriggers({ triggerType: 'event', isActive: true })
        for (const trigger of eventTriggers) {
            const config = trigger.triggerConfig as EventTriggerConfig
            if (!this.eventListeners.has(config.eventType)) {
                this.eventListeners.set(config.eventType, new Set())
            }
            this.eventListeners.get(config.eventType)!.add(trigger.id)
        }

        logger.info({ 
            scheduledCount: this.scheduledJobs.size,
            eventTypesCount: this.eventListeners.size 
        }, 'TriggerService initialized')
    }

    /**
     * Create a new trigger for a workflow
     */
    createTrigger(trigger: Omit<WorkflowTrigger, 'id' | 'createdAt'>): WorkflowTrigger {
        const db = DatabaseManager.getDatabase()
        const id = `trigger-${uuid()}`

        const stmt = db.prepare(`
            INSERT INTO workflow_triggers (
                id, workflow_id, tenant_id, trigger_type, trigger_config, is_active
            ) VALUES (?, ?, ?, ?, ?, ?)
        `)

        stmt.run(
            id,
            trigger.workflowId,
            trigger.tenantId,
            trigger.triggerType,
            JSON.stringify(trigger.triggerConfig),
            trigger.isActive ? 1 : 0
        )

        const created: WorkflowTrigger = {
            id,
            ...trigger,
            createdAt: new Date()
        }

        // Start trigger if active
        if (trigger.isActive) {
            if (trigger.triggerType === 'schedule') {
                this.startScheduledTrigger(created)
            } else if (trigger.triggerType === 'event') {
                const config = trigger.triggerConfig as EventTriggerConfig
                if (!this.eventListeners.has(config.eventType)) {
                    this.eventListeners.set(config.eventType, new Set())
                }
                this.eventListeners.get(config.eventType)!.add(id)
            }
        }

        logger.info({ triggerId: id, type: trigger.triggerType }, 'Created workflow trigger')
        return created
    }

    /**
     * Get trigger by ID
     */
    getTrigger(triggerId: string): WorkflowTrigger | undefined {
        const db = DatabaseManager.getDatabase()
        const row = db.prepare(`
            SELECT * FROM workflow_triggers WHERE id = ?
        `).get(triggerId) as any

        if (!row) return undefined
        return this.rowToTrigger(row)
    }

    /**
     * List triggers with optional filters
     */
    listTriggers(filters: {
        workflowId?: string
        tenantId?: string
        triggerType?: string
        isActive?: boolean
    } = {}): WorkflowTrigger[] {
        const db = DatabaseManager.getDatabase()
        let sql = 'SELECT * FROM workflow_triggers WHERE 1=1'
        const params: any[] = []

        if (filters.workflowId) {
            sql += ' AND workflow_id = ?'
            params.push(filters.workflowId)
        }
        if (filters.tenantId) {
            sql += ' AND tenant_id = ?'
            params.push(filters.tenantId)
        }
        if (filters.triggerType) {
            sql += ' AND trigger_type = ?'
            params.push(filters.triggerType)
        }
        if (filters.isActive !== undefined) {
            sql += ' AND is_active = ?'
            params.push(filters.isActive ? 1 : 0)
        }

        const rows = db.prepare(sql).all(...params) as any[]
        return rows.map(r => this.rowToTrigger(r))
    }

    /**
     * Update trigger active status
     */
    setTriggerActive(triggerId: string, isActive: boolean): void {
        const db = DatabaseManager.getDatabase()
        const trigger = this.getTrigger(triggerId)
        if (!trigger) throw new Error(`Trigger ${triggerId} not found`)

        db.prepare('UPDATE workflow_triggers SET is_active = ? WHERE id = ?')
            .run(isActive ? 1 : 0, triggerId)

        if (trigger.triggerType === 'schedule') {
            if (isActive) {
                this.startScheduledTrigger({ ...trigger, isActive: true })
            } else {
                this.stopScheduledTrigger(triggerId)
            }
        } else if (trigger.triggerType === 'event') {
            const config = trigger.triggerConfig as EventTriggerConfig
            if (isActive) {
                if (!this.eventListeners.has(config.eventType)) {
                    this.eventListeners.set(config.eventType, new Set())
                }
                this.eventListeners.get(config.eventType)!.add(triggerId)
            } else {
                this.eventListeners.get(config.eventType)?.delete(triggerId)
            }
        }

        logger.info({ triggerId, isActive }, 'Updated trigger active status')
    }

    /**
     * Delete a trigger
     */
    deleteTrigger(triggerId: string): void {
        const db = DatabaseManager.getDatabase()
        const trigger = this.getTrigger(triggerId)
        
        if (trigger) {
            if (trigger.triggerType === 'schedule') {
                this.stopScheduledTrigger(triggerId)
            } else if (trigger.triggerType === 'event') {
                const config = trigger.triggerConfig as EventTriggerConfig
                this.eventListeners.get(config.eventType)?.delete(triggerId)
            }
        }

        db.prepare('DELETE FROM workflow_triggers WHERE id = ?').run(triggerId)
        logger.info({ triggerId }, 'Deleted workflow trigger')
    }

    /**
     * Handle incoming webhook trigger
     * Returns the workflow run result
     */
    async handleWebhookTrigger(
        triggerId: string, 
        payload: Record<string, any>,
        headers?: Record<string, string>
    ): Promise<{ runId: string; status: string }> {
        const trigger = this.getTrigger(triggerId)
        if (!trigger) throw new Error(`Trigger ${triggerId} not found`)
        if (!trigger.isActive) throw new Error(`Trigger ${triggerId} is not active`)
        if (trigger.triggerType !== 'webhook') throw new Error(`Trigger ${triggerId} is not a webhook trigger`)

        const config = trigger.triggerConfig as WebhookTriggerConfig

        // Validate required fields
        if (config.requiredFields) {
            const missing = config.requiredFields.filter(f => !(f in payload))
            if (missing.length > 0) {
                throw new Error(`Missing required fields: ${missing.join(', ')}`)
            }
        }

        // TODO: Validate HMAC signature if secretKey is configured

        // Map payload to workflow input
        let input = payload
        if (config.inputMapping) {
            input = {}
            for (const [workflowField, payloadPath] of Object.entries(config.inputMapping)) {
                input[workflowField] = this.getNestedValue(payload, payloadPath)
            }
        }

        // Update last triggered timestamp
        this.updateLastTriggered(triggerId)

        // Execute the workflow
        const result = await workflowService.executeWorkflow(
            trigger.workflowId,
            input,
            trigger.tenantId,
            {
                async: false,
                triggerType: 'webhook',
                triggerRef: triggerId
            }
        )

        logger.info({ 
            triggerId, 
            workflowId: trigger.workflowId, 
            runId: result.runId 
        }, 'Webhook trigger executed workflow')

        return { runId: result.runId!, status: result.status }
    }

    /**
     * Emit an internal event - triggers any listening workflows
     */
    async emitEvent(
        eventType: string, 
        eventData: Record<string, any>,
        source?: string
    ): Promise<{ triggeredCount: number; runs: string[] }> {
        const triggerIds = this.eventListeners.get(eventType)
        if (!triggerIds || triggerIds.size === 0) {
            logger.debug({ eventType }, 'No triggers listening for event')
            return { triggeredCount: 0, runs: [] }
        }

        const runs: string[] = []

        for (const triggerId of triggerIds) {
            const trigger = this.getTrigger(triggerId)
            if (!trigger || !trigger.isActive) continue

            const config = trigger.triggerConfig as EventTriggerConfig

            // Apply source filter if configured
            if (config.sourceFilter && source && source !== config.sourceFilter) {
                continue
            }

            // Map event data to workflow input
            let input = eventData
            if (config.inputMapping) {
                input = {}
                for (const [workflowField, eventPath] of Object.entries(config.inputMapping)) {
                    input[workflowField] = this.getNestedValue(eventData, eventPath)
                }
            }

            // Update last triggered timestamp
            this.updateLastTriggered(triggerId)

            // Execute workflow (async to not block event emission)
            workflowService.executeWorkflow(
                trigger.workflowId,
                input,
                trigger.tenantId,
                {
                    async: true,
                    triggerType: 'workflow',  // Internal event
                    triggerRef: `event:${eventType}:${triggerId}`
                }
            ).then(result => {
                if (result.runId) runs.push(result.runId)
            }).catch(err => {
                logger.error({ triggerId, eventType, error: err.message }, 'Event trigger failed')
            })
        }

        logger.info({ eventType, triggerCount: triggerIds.size }, 'Emitted event to triggers')
        return { triggeredCount: triggerIds.size, runs }
    }

    /**
     * Start a scheduled trigger (cron job)
     */
    private startScheduledTrigger(trigger: WorkflowTrigger): void {
        if (trigger.triggerType !== 'schedule') return
        
        const config = trigger.triggerConfig as ScheduleTriggerConfig
        
        // Validate cron expression
        if (!cron.validate(config.cronExpression)) {
            logger.error({ triggerId: trigger.id, cron: config.cronExpression }, 'Invalid cron expression')
            return
        }

        // Stop existing job if any
        this.stopScheduledTrigger(trigger.id)

        // Create new scheduled job
        const job = cron.schedule(config.cronExpression, async () => {
            logger.info({ triggerId: trigger.id }, 'Scheduled trigger firing')
            
            try {
                this.updateLastTriggered(trigger.id)
                
                await workflowService.executeWorkflow(
                    trigger.workflowId,
                    config.inputData || {},
                    trigger.tenantId,
                    {
                        async: true,
                        triggerType: 'schedule',
                        triggerRef: trigger.id
                    }
                )
            } catch (err: any) {
                logger.error({ triggerId: trigger.id, error: err.message }, 'Scheduled trigger failed')
            }
        }, {
            timezone: config.timezone || 'Africa/Harare'
        })

        this.scheduledJobs.set(trigger.id, job)
        logger.info({ 
            triggerId: trigger.id, 
            cron: config.cronExpression,
            timezone: config.timezone || 'Africa/Harare'
        }, 'Started scheduled trigger')
    }

    /**
     * Stop a scheduled trigger
     */
    private stopScheduledTrigger(triggerId: string): void {
        const job = this.scheduledJobs.get(triggerId)
        if (job) {
            job.stop()
            this.scheduledJobs.delete(triggerId)
            logger.info({ triggerId }, 'Stopped scheduled trigger')
        }
    }

    /**
     * Update last triggered timestamp
     */
    private updateLastTriggered(triggerId: string): void {
        const db = DatabaseManager.getDatabase()
        db.prepare('UPDATE workflow_triggers SET last_triggered_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(triggerId)
    }

    /**
     * Convert database row to WorkflowTrigger
     */
    private rowToTrigger(row: any): WorkflowTrigger {
        return {
            id: row.id,
            workflowId: row.workflow_id,
            tenantId: row.tenant_id,
            triggerType: row.trigger_type,
            triggerConfig: JSON.parse(row.trigger_config || '{}'),
            isActive: row.is_active === 1,
            lastTriggeredAt: row.last_triggered_at ? new Date(row.last_triggered_at) : undefined,
            createdAt: row.created_at ? new Date(row.created_at) : undefined
        }
    }

    /**
     * Get nested value from object using dot notation
     */
    private getNestedValue(obj: any, path: string): any {
        return path.split('.').reduce((acc, part) => acc?.[part], obj)
    }

    /**
     * Shutdown - stop all scheduled jobs
     */
    shutdown(): void {
        logger.info('Shutting down TriggerService')
        for (const [triggerId, job] of this.scheduledJobs) {
            job.stop()
        }
        this.scheduledJobs.clear()
        this.eventListeners.clear()
    }
}

export const triggerService = new TriggerService()
