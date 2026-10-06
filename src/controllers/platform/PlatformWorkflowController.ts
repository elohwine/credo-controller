import type { Request as ExRequest } from 'express'

import { Body, Get, Path, Post, Request, Route, Security, Tags } from 'tsoa'

import { platformWorkflowService } from '../../services/PlatformWorkflowService'

type AuthenticatedClaims = {
  tenantId?: string
  sub?: string
  id?: string
}

function getPrincipal(request: ExRequest): { tenantId: string; subjectRef: string } {
  const user = (request as any).user as AuthenticatedClaims | undefined
  const tenantId = user?.tenantId
  const subjectRef = user?.sub || user?.id

  if (!tenantId || !subjectRef) {
    throw new Error('Authenticated tenant and subject are required')
  }

  return { tenantId, subjectRef }
}

@Route('api/platform/requests')
@Tags('Platform Request Workflows')
@Security('jwt')
export class PlatformWorkflowController {
  @Post('/{requestId}/workflow/{workflowId}')
  public async start(
    @Request() request: ExRequest,
    @Path() requestId: string,
    @Path() workflowId: string,
    @Body() body?: { input?: Record<string, unknown> },
  ) {
    const principal = getPrincipal(request)
    return platformWorkflowService.startForRequest(
      requestId,
      workflowId,
      principal.tenantId,
      principal.subjectRef,
      body?.input ?? {},
    )
  }

  @Get('/{requestId}/workflow/status')
  public async status(@Request() request: ExRequest, @Path() requestId: string): Promise<any> {
    const principal = getPrincipal(request)
    return platformWorkflowService.getRunStatus(requestId, principal.tenantId, principal.subjectRef)
  }

  @Post('/{requestId}/tasks/{taskId}/complete')
  public async completeTask(
    @Request() request: ExRequest,
    @Path() requestId: string,
    @Path() taskId: string,
    @Body() body?: { outcomeRef?: string },
  ) {
    const principal = getPrincipal(request)
    return platformWorkflowService.completeTask(
      requestId,
      taskId,
      principal.tenantId,
      principal.subjectRef,
      body?.outcomeRef,
    )
  }
}
