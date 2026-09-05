import { Body, Get, Path, Post, Request, Route, Security, Tags } from 'tsoa'
import type { Request as ExRequest } from 'express'
import { platformWorkflowService } from '../../services/PlatformWorkflowService'

type AuthenticatedClaims = {
  tenantId?: string
  sub?: string
}

function getPrincipal(request: ExRequest): { tenantId: string; subjectRef: string } {
  const user = (request as any).user as AuthenticatedClaims | undefined
  const tenantId = user?.tenantId
  const subjectRef = user?.sub

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
    @Body() body?: { input?: Record<string, unknown> }
  ) {
    const principal = getPrincipal(request)
    return platformWorkflowService.startForRequest(
      requestId,
      workflowId,
      principal.tenantId,
      principal.subjectRef,
      body?.input ?? {}
    )
  }

  @Get('/{requestId}/workflow/status')
  public async status(
    @Request() request: ExRequest,
    @Path() requestId: string
  ) {
    const principal = getPrincipal(request)
    return platformWorkflowService.getRunStatus(
      requestId,
      principal.tenantId,
      principal.subjectRef
    )
  }
}
