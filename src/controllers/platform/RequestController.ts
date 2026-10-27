import type {
  CreatePlatformRequestInput,
  RaiseRequestInput,
  RequestOptions,
  RequestStatus,
} from '../../services/PlatformRequestService'
import type { SpawnedRequest } from '../../services/RequestHandoffService'
import type { EmbeddedPresentationResult, StageProofRequest } from '../../services/ssi/StageProofService'
import type { Request as ExRequest } from 'express'

import { Body, Get, Path, Post, Query, Request, Route, Security, Tags } from 'tsoa'

import { StatusException } from '../../errors'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import { platformRequestService, MODULE_OFF_MESSAGE } from '../../services/PlatformRequestService'
import { stageActionForProofAction } from '../../services/ProofVcPolicyService'
import { requestHandoffService } from '../../services/RequestHandoffService'
import { stageProofService } from '../../services/ssi/StageProofService'
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

/** The signed-in person, whichever token (own wallet or an organisation) they hold. */
function getSubject(request: ExRequest): string {
  const user = (request as any).user as AuthenticatedClaims | undefined
  const subjectRef = user?.sub || user?.id
  if (!subjectRef) throw new Error('Authenticated subject is required')
  return subjectRef
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

  /**
   * What the signed-in person may ask for from Home: their organisations and the request kinds
   * each one accepts, jobs waiting for their payout, and records that can be sent again.
   * Works with the person's own wallet token.
   */
  @Get('/options')
  public async options(@Request() request: ExRequest): Promise<RequestOptions> {
    return platformRequestService.optionsForSubject(getSubject(request))
  }

  /** Every request the signed-in person raised, across their organisations. */
  @Get('/mine')
  public async mine(@Request() request: ExRequest, @Query() limit?: number) {
    return { items: platformRequestService.listMine(getSubject(request), limit ?? 50) }
  }

  /** One of the person's own requests, with its history. */
  @Get('/mine/{requestId}')
  public async mineDetail(@Request() request: ExRequest, @Path() requestId: string): Promise<any> {
    const detail = platformRequestService.getMine(requestId, getSubject(request))
    if (!detail) throw new StatusException('Request not found', 404)
    return detail
  }

  /**
   * Mark the person's own approved purchase as bought, with the receipt number, amount and a
   * live photo (`receiptImage`) or wallet receipt record (`receiptRecord`). Personal wallet token.
   */
  @Post('/mine/{requestId}/finish')
  public async finishMine(
    @Request() request: ExRequest,
    @Path() requestId: string,
    @Body() body: { payload?: Record<string, unknown> },
  ) {
    const subjectRef = getSubject(request)
    const db = DatabaseManager.getDatabase()
    const action = `request-finish-mine:${requestId}`
    const idempotency = IdempotencyGuard.guard(db, request, subjectRef, action)
    if (idempotency.duplicate) return idempotency.response
    const result = platformRequestService.finishMine(requestId, subjectRef, body?.payload || {})
    if (idempotency.key) IdempotencyGuard.record(db, idempotency.key, subjectRef, action, result)
    return result
  }

  /**
   * Raise and submit a request to one of the person's organisations from Home. Safe to retry
   * with the same `x-idempotency-key`.
   */
  @Post('/raise')
  public async raise(@Request() request: ExRequest, @Body() body: Omit<RaiseRequestInput, 'subjectRef'>) {
    const subjectRef = getSubject(request)
    const db = DatabaseManager.getDatabase()
    const action = `request-raise:${body?.orgTenantId}:${body?.requestType}`
    const idempotency = IdempotencyGuard.guard(db, request, String(body?.orgTenantId || ''), action)
    if (idempotency.duplicate) return idempotency.response
    let raised: unknown
    try {
      raised = platformRequestService.raiseForSubject({ ...body, subjectRef })
    } catch (error: any) {
      // The organisation has not switched on the module this request belongs to.
      if (error?.message === MODULE_OFF_MESSAGE) throw new StatusException(MODULE_OFF_MESSAGE, 403)
      throw error
    }
    if (idempotency.key) IdempotencyGuard.record(db, idempotency.key, String(body?.orgTenantId || ''), action, raised)
    return raised
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
    // A decision tapped twice (or retried after a dropped connection) is answered once.
    const db = DatabaseManager.getDatabase()
    const action = `request-transition:${body?.requestId}:${body?.toStatus}`
    const idempotency = IdempotencyGuard.guard(db, request, principal.tenantId, action)
    if (idempotency.duplicate) return idempotency.response
    const result = platformRequestService.transitionBySubject(
      body.requestId,
      principal.tenantId,
      principal.subjectRef,
      body.toStatus,
      body.payload,
    )
    if (idempotency.key) IdempotencyGuard.record(db, idempotency.key, principal.tenantId, action, result)
    return result
  }

  @Post('/{requestId}/decision')
  public async decide(
    @Request() request: ExRequest,
    @Path() requestId: string,
    @Body() body: { decision: 'approve' | 'reject'; reason?: string },
  ) {
    const principal = getPrincipal(request)
    if (!['approve', 'reject'].includes(body?.decision)) {
      throw new StatusException('Decision must be approve or reject', 400)
    }
    const db = DatabaseManager.getDatabase()
    const action = `request-decision:${requestId}:${body.decision}`
    const idempotency = IdempotencyGuard.guard(db, request, principal.tenantId, action)
    if (idempotency.duplicate) return idempotency.response
    const result = platformRequestService.decideBySubject(
      requestId,
      principal.tenantId,
      principal.subjectRef,
      body.decision,
      body.reason,
    )
    if (idempotency.key) IdempotencyGuard.record(db, idempotency.key, principal.tenantId, action, result)
    return result
  }

  /**
   * Start a staff-card share for a purchase or payment step (approve, mark bought, mark paid).
   * Returns the request the wallet answers; finish with `/proof/complete` or `/proof/embedded-wallet`.
   */
  @Post('/{requestId}/proof/request')
  public async staffCardRequest(
    @Request() request: ExRequest,
    @Path() requestId: string,
    @Body() body: { toStatus: RequestStatus },
  ): Promise<StageProofRequest & { requestRef: string; toStatus: RequestStatus }> {
    const principal = getPrincipal(request)
    const step = platformRequestService.staffCardStep(
      requestId,
      principal.tenantId,
      principal.subjectRef,
      body?.toStatus,
    )
    const proof = await stageProofService.createStageProofRequest({
      verifierAgent: (request as any).agent,
      orgTenantId: principal.tenantId,
      actionKey: step.actionKey,
      reference: requestId,
      idPrefix: 'request-step',
      descriptorName: 'Your staff card',
      purpose: `Confirm you are the person this organisation chose for this step on "${step.title || 'this request'}".`,
    })
    return { ...proof, requestRef: requestId, toStatus: body.toStatus }
  }

  /** Check the shared staff card, then move the request. A retry with the same share answers once. */
  @Post('/{requestId}/proof/complete')
  public async staffCardComplete(
    @Request() request: ExRequest,
    @Path() requestId: string,
    @Body()
    body: {
      toStatus: RequestStatus
      requestId: string
      payload?: Record<string, unknown>
      vpToken?: string
      idToken?: string
      presentationSubmission?: unknown
    },
  ): Promise<any> {
    const submitted =
      body?.vpToken || body?.idToken
        ? {
            vpToken: body.vpToken,
            idToken: body.idToken,
            presentationSubmission: body.presentationSubmission,
            state: body.requestId,
          }
        : undefined
    return this.finishWithStaffCard(request, requestId, body, submitted)
  }

  /** Share from the caller's own wallet on this server, then move the request. */
  @Post('/{requestId}/proof/embedded-wallet')
  public async staffCardEmbedded(
    @Request() request: ExRequest,
    @Path() requestId: string,
    @Body()
    body: {
      toStatus: RequestStatus
      requestId: string
      presentationRequestUrl: string
      walletId: string
      payload?: Record<string, unknown>
    },
  ): Promise<any> {
    const principal = getPrincipal(request)
    if (!body?.requestId || !body?.presentationRequestUrl || !body?.walletId) {
      throw new StatusException('requestId, presentationRequestUrl and walletId are required', 400)
    }
    const replayed = this.staffCardReplay(request, requestId, body)
    if (replayed.response) return replayed.response
    const step = platformRequestService.staffCardStep(
      requestId,
      principal.tenantId,
      principal.subjectRef,
      body.toStatus,
    )
    const submitted = await stageProofService.presentFromEmbeddedWallet({
      request,
      walletId: body.walletId,
      presentationRequestUrl: body.presentationRequestUrl,
      orgTenantId: principal.tenantId,
      stageAction: stageActionForProofAction(step.actionKey),
      reference: requestId,
    })
    return this.finishWithStaffCard(request, requestId, body, submitted)
  }

  private async finishWithStaffCard(
    request: ExRequest,
    requestId: string,
    body: { toStatus: RequestStatus; requestId: string; payload?: Record<string, unknown> },
    submitted?: EmbeddedPresentationResult,
  ) {
    const principal = getPrincipal(request)
    if (!body?.requestId) throw new StatusException('requestId is required', 400)
    const replayed = this.staffCardReplay(request, requestId, body)
    if (replayed.response) return replayed.response
    const { db, action, idempotencyKey, naturalKey } = replayed
    const step = platformRequestService.staffCardStep(
      requestId,
      principal.tenantId,
      principal.subjectRef,
      body.toStatus,
    )
    const verified = await stageProofService.verifyStageProof({
      verifierAgent: (request as any).agent,
      requestId: body.requestId,
      orgTenantId: principal.tenantId,
      actionKey: step.actionKey,
      submitted,
    })
    const result = platformRequestService.transitionBySubject(
      requestId,
      principal.tenantId,
      principal.subjectRef,
      body.toStatus,
      {
        ...(body.payload || {}),
        staffCard: {
          requestId: verified.requestId,
          holderDid: verified.holderDid,
          presentedTypes: verified.presentedTypes,
          actorCredential: verified.actorProof.present && verified.actorProof.valid,
          verifiedAt: verified.verifiedAt,
        },
      },
    )
    if (idempotencyKey) IdempotencyGuard.record(db, idempotencyKey, principal.tenantId, action, result)
    IdempotencyGuard.record(db, naturalKey, principal.tenantId, action, result)
    return result
  }

  /** A finish already answered (same header key, or same share on the same step) returns its first result. */
  private staffCardReplay(request: ExRequest, requestId: string, body: { toStatus: RequestStatus; requestId: string }) {
    const principal = getPrincipal(request)
    const db = DatabaseManager.getDatabase()
    const action = `request-staff-card:${requestId}:${body.toStatus}`
    const naturalKey = `natural:request-staff-card:${principal.tenantId}:${requestId}:${body.toStatus}:${body.requestId}`
    const idempotency = IdempotencyGuard.guard(db, request, principal.tenantId, action)
    if (idempotency.duplicate)
      return { db, action, naturalKey, idempotencyKey: undefined, response: idempotency.response }
    const replay = IdempotencyGuard.checkAndReturn(db, naturalKey, principal.tenantId, action)
    return { db, action, naturalKey, idempotencyKey: idempotency.key, response: replay?.response }
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
    const detail = platformRequestService.getForSubject(requestId, principal.tenantId, principal.subjectRef)
    if (!detail) throw new StatusException('Request not found', 404)
    return detail
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
    const spawned = requestHandoffService.startManual({
      tenantId: principal.tenantId,
      parentRequestId: requestId,
      toType: String(body?.toType || ''),
    })
    if (!spawned) return { error: 'This step cannot be started from here.' }
    if (idempotency.key) IdempotencyGuard.record(db, idempotency.key, principal.tenantId, action, spawned)
    return spawned
  }
}
