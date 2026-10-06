import type { Request as ExRequest } from 'express'

import { Body, Get, Path, Post, Query, Request, Route, Security, Tags } from 'tsoa'

import { DatabaseManager } from '../../persistence/DatabaseManager'
import {
  platformRequestService,
  CreatePlatformRequestInput,
  RequestStatus,
} from '../../services/PlatformRequestService'
import { requestHandoffService, type SpawnedRequest } from '../../services/RequestHandoffService'
import { IdempotencyGuard } from '../../utils/IdempotencyGuard'

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
@Tags('Platform Requests')
@Security('jwt')
export class RequestController {
  @Post('/')
  public async create(
    @Request() request: ExRequest,
    @Body() body: Omit<CreatePlatformRequestInput, 'tenantId' | 'subjectRef'>,
  ) {
    const principal = getPrincipal(request)
    return platformRequestService.create({ ...body, ...principal })
  }

  @Post('/{requestId}/submit')
  public async submit(@Request() request: ExRequest, @Path() requestId: string): Promise<any> {
    const principal = getPrincipal(request)
    return platformRequestService.submit(requestId, principal.tenantId, principal.subjectRef)
  }

  @Post('/transition')
  public async transition(
    @Request() request: ExRequest,
    @Body()
    body: {
      requestId: string
      toStatus: RequestStatus
      payload?: Record<string, unknown>
    },
  ) {
    const principal = getPrincipal(request)
    return platformRequestService.transitionBySubject(
      body.requestId,
      principal.tenantId,
      principal.subjectRef,
      body.toStatus,
      body.payload,
    )
  }

  @Get('/')
  public async list(
    @Request() request: ExRequest,
    @Query() status?: RequestStatus,
    @Query() requestType?: string,
    @Query() limit?: number,
    @Query() cursor?: string,
  ) {
    const principal = getPrincipal(request)
    return platformRequestService.list(principal.tenantId, principal.subjectRef, status, requestType, limit, cursor)
  }

  @Get('/{requestId}')
  public async get(@Request() request: ExRequest, @Path() requestId: string): Promise<any> {
    const principal = getPrincipal(request)
    return platformRequestService.getForTenant(requestId, principal.tenantId)
  }

  /**
   * Follow-on requests the organization set to start "when someone asks" and that this
   * request has reached the right status for (for example an approved requisition → purchase order).
   */
  @Get('/{requestId}/next')
  public async nextSteps(
    @Request() request: ExRequest,
    @Path() requestId: string,
  ): Promise<Array<{ key: string; title: string; toType: string; startedRequestId?: string }>> {
    const principal = getPrincipal(request)
    const current = (await platformRequestService.getForTenant(requestId, principal.tenantId)) as any
    if (!current) return []
    return requestHandoffService.manualNextFor({
      tenantId: principal.tenantId,
      requestId,
      requestType: String(current.requestType || current.request_type || ''),
      status: String(current.status || ''),
    })
  }

  /** Start one of those follow-on requests. Returns the existing one when it was already started. */
  @Post('/{requestId}/next')
  public async startNext(
    @Request() request: ExRequest,
    @Path() requestId: string,
    @Body() body: { toType: string },
  ): Promise<SpawnedRequest | { error: string }> {
    const principal = getPrincipal(request)
    const db = DatabaseManager.getDatabase()
    const action = `request-next:${requestId}:${body?.toType}`
    const idempotency = IdempotencyGuard.guard(db, request, principal.tenantId, action)
    if (idempotency.duplicate) return idempotency.response as SpawnedRequest
    const spawned = requestHandoffService.startManual({ tenantId: principal.tenantId, parentRequestId: requestId, toType: String(body?.toType || '') })
    if (!spawned) return { error: 'This step cannot be started from here.' }
    if (idempotency.key) IdempotencyGuard.record(db, idempotency.key, principal.tenantId, action, spawned)
    return spawned
  }
}
