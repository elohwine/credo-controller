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

import { Controller, Post, Get, Delete, Route, Tags, Body, Path, Query, Request, Security } from 'tsoa'
import { workflowService, ExecuteWorkflowOptions, WorkflowExecutionResult } from '../../services/WorkflowService'
import { ActionRegistry } from '../../services/workflow/ActionRegistry'
import { Request as ExRequest } from 'express'

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
    [key: string]: any  // Additional input data
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
        @Request() request: ExRequest
    ): Promise<WorkflowExecutionResult> {
        try {
            const tenantId = (request as any).user?.tenantId || 'default'
            const { async: isAsync, triggerRef, ...input } = body

            const options: ExecuteWorkflowOptions = {
                triggerType: 'manual',
                triggerRef,
                async: isAsync
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
        @Request() request: ExRequest
    ): Promise<WorkflowExecutionResult> {
        try {
            const result = await workflowService.resumeWorkflow(runId, resumeData)
            return result
        } catch (error: any) {
            this.setStatus(400)
            return { runId, status: 'failed', error: error.message }
        }
    }

    /**
     * Get workflow run status and steps
     */
    @Get('runs/{runId}')
    @Security('jwt', ['tenant'])
    public async getRunStatus(
        @Path() runId: string,
        @Request() request: ExRequest
    ): Promise<any> {
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
        @Query() limit?: number
    ): Promise<any[]> {
        const tenantId = (request as any).user?.tenantId || 'default'
        return workflowService.listRuns(tenantId, workflowId, status as any, limit)
    }

    /**
     * List available workflows
     */
    @Get('')
    @Security('jwt', ['tenant'])
    public async listWorkflows(
        @Request() request: ExRequest,
        @Query() category?: string
    ): Promise<any[]> {
        const tenantId = (request as any).user?.tenantId || 'default'
        return workflowService.listWorkflows(tenantId, category)
    }

    /**
     * Get a specific workflow definition
     */
    @Get('{workflowId}')
    @Security('jwt', ['tenant'])
    public async getWorkflow(
        @Path() workflowId: string
    ): Promise<any> {
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
        @Request() request: ExRequest
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
                tenantId
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
        @Request() request: ExRequest
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
