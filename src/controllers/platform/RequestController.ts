import { Body, Get, Post, Query, Request, Route, Security, Tags } from 'tsoa'
import type { Request as ExRequest } from 'express'
import { platformRequestService, CreatePlatformRequestInput, RequestStatus } from '../../services/PlatformRequestService'

type AuthenticatedClaims = {
  tenantId?: string
  sub?: string
  role?: string
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
@Tags('Platform Requests')
@Security('jwt')
export class RequestController {
  @Post('/')
  public async create(
    @Request() request: ExRequest,
    @Body() body: Omit<CreatePlatformRequestInput, 'tenantId' | 'subjectRef'>
  ) {
    const principal = getPrincipal(request)
    return platformRequestService.create({
      ...body,
      ...principal
    })
  }

  @Post('/{requestId}/submit')
  public async submit(
    @Request() request: ExRequest,
    @Body() body: { requestId: string }
  ) {
    const principal = getPrincipal(request)
    return platformRequestService.submit(body.requestId, principal.tenantId, principal.subjectRef)
  }

  @Post('/transition')
  public async transition(
    @Request() request: ExRequest,
    @Body() body: {
      requestId: string
      toStatus: RequestStatus
      payload?: Record<string, unknown>
    }
  ) {
    const principal = getPrincipal(request)
    const dbPrincipal = platformRequestService['resolvePrincipal']
      ? undefined
      : undefined

    // The service resolves the authenticated subject to an internal person record.
    // We intentionally do not accept actorPersonId from the client.
    const current = await platformRequestService.getForTenant(body.requestId, principal.tenantId)
    if (!current) throw new Error('Request not found')

    const requestActor = (current as any).requester_person_id
    return platformRequestService.transition(
      body.requestId,
      principal.tenantId,
      body.toStatus,
      requestActor,
      body.payload
    )
  }

  @Get('/')
  public async list(
    @Request() request: ExRequest,
    @Query() status?: RequestStatus,
    @Query() requestType?: string,
    @Query() limit?: number
  ) {
    const principal = getPrincipal(request)
    return platformRequestService.list(principal.tenantId, status, requestType, limit)
  }

  @Get('/{requestId}')
  public async get(
    @Request() request: ExRequest,
    @Query() requestId: string
  ) {
    const principal = getPrincipal(request)
    return platformRequestService.getForTenant(requestId, principal.tenantId)
  }
}
