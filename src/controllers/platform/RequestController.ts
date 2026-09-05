import { Body, Get, Post, Query, Request, Route, Security, Tags } from 'tsoa'
import type { Request as ExRequest } from 'express'
import { platformRequestService, CreatePlatformRequestInput, RequestStatus } from '../../services/PlatformRequestService'

@Route('api/platform/requests')
@Tags('Platform Requests')
@Security('jwt')
export class RequestController {
  @Post('/')
  public async create(@Body() body: CreatePlatformRequestInput) {
    return platformRequestService.create(body)
  }

  @Post('/{requestId}/submit')
  public async submit(
    @Request() request: ExRequest,
    @Body() body: { requestId: string; actorPersonId: string }
  ) {
    return platformRequestService.submit(body.requestId, body.actorPersonId)
  }

  @Post('/transition')
  public async transition(@Body() body: {
    requestId: string
    toStatus: RequestStatus
    actorPersonId?: string
    payload?: Record<string, unknown>
  }) {
    return platformRequestService.transition(
      body.requestId,
      body.toStatus,
      body.actorPersonId,
      body.payload
    )
  }

  @Get('/')
  public async list(
    @Query() organizationId: string,
    @Query() status?: RequestStatus,
    @Query() requestType?: string,
    @Query() limit?: number
  ) {
    return platformRequestService.list(organizationId, status, requestType, limit)
  }

  @Get('/{requestId}')
  public async get(@Query() requestId: string) {
    return platformRequestService.get(requestId)
  }
}
