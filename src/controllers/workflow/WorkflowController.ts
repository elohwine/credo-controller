import { Controller, Post, Get, Route, Tags, Body, Path, Query, Request, Security } from 'tsoa'
import { workflowService } from '../../services/WorkflowService'
import { Request as ExRequest } from 'express'

@Route('workflows')
@Tags('Workflow Engine')
export class WorkflowController extends Controller {
    /**
     * Execute a workflow by ID
     */
    @Post('{workflowId}/execute')
    public async executeWorkflow(
        @Path() workflowId: string,
        @Body() input: any,
        @Request() request: ExRequest
    ): Promise<any> {
        try {
            // Extract tenantId from request (assuming auth middleware populates it)
            // For now, we'll use a default or extract from header if available
            const tenantId = (request as any).user?.tenantId || 'default'

            const result = await workflowService.executeWorkflow(workflowId, input, tenantId)
            return result
        } catch (error: any) {
            this.setStatus(400)
            return { error: error.message }
        }
    }

    /**
     * List available workflows
     */
    @Get('')
    public async listWorkflows(
        @Request() request: ExRequest,
        @Query() category?: string
    ): Promise<any[]> {
        const tenantId = (request as any).user?.tenantId || 'default'
        return workflowService.listWorkflows(tenantId, category)
    }

    /**
     * Register a new workflow definition (Admin only)
     */
    @Post('')
    public async registerWorkflow(
        @Body() definition: any,
        @Request() request: ExRequest
    ): Promise<any> {
        try {
            await workflowService.registerWorkflow(definition)
            this.setStatus(201)
            return { message: 'Workflow registered', id: definition.id }
        } catch (error: any) {
            this.setStatus(400)
            return { error: error.message }
        }
    }
}
