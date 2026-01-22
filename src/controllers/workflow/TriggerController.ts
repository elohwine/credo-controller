/**
 * IdenEx Credentis - Workflow Trigger Controller
 * 
 * Verifiable Trust Infrastructure for Africa's Digital Economy
 * 
 * API endpoints for managing workflow triggers:
 * - Create webhook/schedule/event triggers
 * - Activate/deactivate triggers
 * - Webhook endpoint for external systems to invoke
 * - Emit internal events
 * 
 * @module controllers/workflow/TriggerController
 * @copyright 2024-2026 IdenEx Credentis
 */

import { Controller, Get, Post, Put, Delete, Route, Tags, Body, Path, Query, Request, Security, Header } from 'tsoa'
import { 
    triggerService, 
    WorkflowTrigger, 
    WebhookTriggerConfig, 
    ScheduleTriggerConfig,
    EventTriggerConfig 
} from '../../services/TriggerService'
import { Request as ExRequest } from 'express'
import { rootLogger } from '../../utils/pinoLogger'

const logger = rootLogger.child({ module: 'TriggerController' })

interface CreateWebhookTriggerRequest {
    workflowId: string
    name?: string
    config?: {
        secretKey?: string
        inputMapping?: Record<string, string>
        requiredFields?: string[]
    }
}

interface CreateScheduleTriggerRequest {
    workflowId: string
    name?: string
    config: {
        cronExpression: string
        timezone?: string
        inputData?: Record<string, any>
    }
}

interface CreateEventTriggerRequest {
    workflowId: string
    name?: string
    config: {
        eventType: string
        sourceFilter?: string
        inputMapping?: Record<string, string>
    }
}

interface TriggerResponse {
    id: string
    workflowId: string
    tenantId: string
    triggerType: string
    isActive: boolean
    webhookUrl?: string  // For webhook triggers
    lastTriggeredAt?: string
    createdAt?: string
}

interface WebhookExecutionResponse {
    runId: string
    status: string
    triggerId: string
}

interface EmitEventRequest {
    eventType: string
    data: Record<string, any>
    source?: string
}

@Route('triggers')
@Tags('Workflow Triggers')
export class TriggerController extends Controller {

    /**
     * Create a webhook trigger for a workflow
     * Returns a unique webhook URL that external systems can call
     */
    @Post('webhook')
    @Security('jwt', ['tenant'])
    public async createWebhookTrigger(
        @Body() request: CreateWebhookTriggerRequest,
        @Request() req: ExRequest
    ): Promise<TriggerResponse> {
        const tenantId = (req as any).tenantId || 'default'

        const trigger = triggerService.createTrigger({
            workflowId: request.workflowId,
            tenantId,
            triggerType: 'webhook',
            triggerConfig: request.config || {},
            isActive: true
        })

        const baseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:3000'

        return {
            id: trigger.id,
            workflowId: trigger.workflowId,
            tenantId: trigger.tenantId,
            triggerType: trigger.triggerType,
            isActive: trigger.isActive,
            webhookUrl: `${baseUrl}/triggers/webhook/${trigger.id}/invoke`,
            lastTriggeredAt: trigger.lastTriggeredAt?.toISOString(),
            createdAt: trigger.createdAt?.toISOString()
        }
    }

    /**
     * Create a scheduled trigger for a workflow
     * Uses cron expressions for timing
     */
    @Post('schedule')
    @Security('jwt', ['tenant'])
    public async createScheduleTrigger(
        @Body() request: CreateScheduleTriggerRequest,
        @Request() req: ExRequest
    ): Promise<TriggerResponse> {
        const tenantId = (req as any).tenantId || 'default'

        const trigger = triggerService.createTrigger({
            workflowId: request.workflowId,
            tenantId,
            triggerType: 'schedule',
            triggerConfig: request.config,
            isActive: true
        })

        return {
            id: trigger.id,
            workflowId: trigger.workflowId,
            tenantId: trigger.tenantId,
            triggerType: trigger.triggerType,
            isActive: trigger.isActive,
            lastTriggeredAt: trigger.lastTriggeredAt?.toISOString(),
            createdAt: trigger.createdAt?.toISOString()
        }
    }

    /**
     * Create an event trigger for a workflow
     * Triggers when internal events are emitted
     */
    @Post('event')
    @Security('jwt', ['tenant'])
    public async createEventTrigger(
        @Body() request: CreateEventTriggerRequest,
        @Request() req: ExRequest
    ): Promise<TriggerResponse> {
        const tenantId = (req as any).tenantId || 'default'

        const trigger = triggerService.createTrigger({
            workflowId: request.workflowId,
            tenantId,
            triggerType: 'event',
            triggerConfig: request.config,
            isActive: true
        })

        return {
            id: trigger.id,
            workflowId: trigger.workflowId,
            tenantId: trigger.tenantId,
            triggerType: trigger.triggerType,
            isActive: trigger.isActive,
            lastTriggeredAt: trigger.lastTriggeredAt?.toISOString(),
            createdAt: trigger.createdAt?.toISOString()
        }
    }

    /**
     * List triggers for the current tenant
     */
    @Get('')
    @Security('jwt', ['tenant'])
    public async listTriggers(
        @Request() req: ExRequest,
        @Query() workflowId?: string,
        @Query() triggerType?: string,
        @Query() isActive?: boolean
    ): Promise<TriggerResponse[]> {
        const tenantId = (req as any).tenantId || 'default'
        const baseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:3000'

        const triggers = triggerService.listTriggers({
            tenantId,
            workflowId,
            triggerType,
            isActive
        })

        return triggers.map(t => ({
            id: t.id,
            workflowId: t.workflowId,
            tenantId: t.tenantId,
            triggerType: t.triggerType,
            isActive: t.isActive,
            webhookUrl: t.triggerType === 'webhook' 
                ? `${baseUrl}/triggers/webhook/${t.id}/invoke` 
                : undefined,
            lastTriggeredAt: t.lastTriggeredAt?.toISOString(),
            createdAt: t.createdAt?.toISOString()
        }))
    }

    /**
     * Get trigger by ID
     */
    @Get('{triggerId}')
    @Security('jwt', ['tenant'])
    public async getTrigger(
        @Path() triggerId: string,
        @Request() req: ExRequest
    ): Promise<TriggerResponse> {
        const tenantId = (req as any).tenantId || 'default'
        const trigger = triggerService.getTrigger(triggerId)
        
        if (!trigger) {
            this.setStatus(404)
            throw new Error(`Trigger ${triggerId} not found`)
        }

        if (trigger.tenantId !== tenantId) {
            this.setStatus(403)
            throw new Error('Access denied to this trigger')
        }

        const baseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:3000'

        return {
            id: trigger.id,
            workflowId: trigger.workflowId,
            tenantId: trigger.tenantId,
            triggerType: trigger.triggerType,
            isActive: trigger.isActive,
            webhookUrl: trigger.triggerType === 'webhook'
                ? `${baseUrl}/triggers/webhook/${trigger.id}/invoke`
                : undefined,
            lastTriggeredAt: trigger.lastTriggeredAt?.toISOString(),
            createdAt: trigger.createdAt?.toISOString()
        }
    }

    /**
     * Activate or deactivate a trigger
     */
    @Put('{triggerId}/active')
    @Security('jwt', ['tenant'])
    public async setTriggerActive(
        @Path() triggerId: string,
        @Body() body: { isActive: boolean },
        @Request() req: ExRequest
    ): Promise<{ success: boolean }> {
        const tenantId = (req as any).tenantId || 'default'
        const trigger = triggerService.getTrigger(triggerId)
        
        if (!trigger) {
            this.setStatus(404)
            throw new Error(`Trigger ${triggerId} not found`)
        }

        if (trigger.tenantId !== tenantId) {
            this.setStatus(403)
            throw new Error('Access denied to this trigger')
        }

        triggerService.setTriggerActive(triggerId, body.isActive)
        return { success: true }
    }

    /**
     * Delete a trigger
     */
    @Delete('{triggerId}')
    @Security('jwt', ['tenant'])
    public async deleteTrigger(
        @Path() triggerId: string,
        @Request() req: ExRequest
    ): Promise<{ success: boolean }> {
        const tenantId = (req as any).tenantId || 'default'
        const trigger = triggerService.getTrigger(triggerId)
        
        if (!trigger) {
            this.setStatus(404)
            throw new Error(`Trigger ${triggerId} not found`)
        }

        if (trigger.tenantId !== tenantId) {
            this.setStatus(403)
            throw new Error('Access denied to this trigger')
        }

        triggerService.deleteTrigger(triggerId)
        return { success: true }
    }

    /**
     * Webhook invocation endpoint - called by external systems
     * This endpoint does NOT require JWT auth - uses trigger-specific validation
     */
    @Post('webhook/{triggerId}/invoke')
    public async invokeWebhook(
        @Path() triggerId: string,
        @Body() payload: Record<string, any>,
        @Header('X-Webhook-Signature') signature?: string
    ): Promise<WebhookExecutionResponse> {
        logger.info({ triggerId }, 'Webhook invocation received')

        try {
            const result = await triggerService.handleWebhookTrigger(
                triggerId,
                payload,
                signature ? { 'X-Webhook-Signature': signature } : undefined
            )

            return {
                runId: result.runId,
                status: result.status,
                triggerId
            }
        } catch (err: any) {
            logger.error({ triggerId, error: err.message }, 'Webhook invocation failed')
            
            if (err.message.includes('not found')) {
                this.setStatus(404)
            } else if (err.message.includes('not active')) {
                this.setStatus(400)
            } else if (err.message.includes('Missing required')) {
                this.setStatus(400)
            } else {
                this.setStatus(500)
            }
            
            throw err
        }
    }

    /**
     * Emit an internal event - triggers any listening workflows
     * Useful for integrating with other parts of the system
     */
    @Post('events/emit')
    @Security('jwt', ['tenant', 'admin'])
    public async emitEvent(
        @Body() request: EmitEventRequest,
        @Request() req: ExRequest
    ): Promise<{ triggeredCount: number; message: string }> {
        const tenantId = (req as any).tenantId || 'default'

        logger.info({ eventType: request.eventType, source: request.source }, 'Emitting event')

        const result = await triggerService.emitEvent(
            request.eventType,
            request.data,
            request.source
        )

        return {
            triggeredCount: result.triggeredCount,
            message: result.triggeredCount > 0 
                ? `Triggered ${result.triggeredCount} workflow(s)` 
                : 'No workflows listening for this event'
        }
    }

    /**
     * List available event types that can be emitted
     */
    @Get('events/types')
    public async listEventTypes(): Promise<{ eventTypes: Array<{ type: string; description: string }> }> {
        return {
            eventTypes: [
                { type: 'payment.completed', description: 'Payment was successfully processed' },
                { type: 'payment.failed', description: 'Payment processing failed' },
                { type: 'payment.refunded', description: 'Payment was refunded' },
                { type: 'delivery.confirmed', description: 'Delivery was confirmed by recipient' },
                { type: 'delivery.failed', description: 'Delivery attempt failed' },
                { type: 'cart.created', description: 'Shopping cart was created' },
                { type: 'cart.completed', description: 'Cart checkout completed' },
                { type: 'credential.issued', description: 'Verifiable credential was issued' },
                { type: 'credential.revoked', description: 'Credential was revoked' },
                { type: 'dispute.filed', description: 'Customer filed a dispute' },
                { type: 'dispute.resolved', description: 'Dispute was resolved' },
                { type: 'employee.onboarded', description: 'New employee onboarding complete' },
                { type: 'payroll.processed', description: 'Payroll batch was processed' },
            ]
        }
    }
}
