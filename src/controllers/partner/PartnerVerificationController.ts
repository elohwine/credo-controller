import type {
  PartnerVerificationResult,
  PartnerVerificationStart,
} from '../../services/partner/PartnerVerificationService'
import type { Request as ExRequest } from 'express'

import { Agent } from '@credo-ts/core'
import { Body, Controller, Path, Post, Request, Route, Tags } from 'tsoa'
import { container, inject, injectable } from 'tsyringe'

import { StatusException } from '../../errors'
import { canSignIn } from '../../services/partner/PartnerClientService'
import { PartnerVerificationService } from '../../services/partner/PartnerVerificationService'
import { SSIAuthService } from '../../services/SSIAuthService'

interface StartPartnerVerificationRequest {
  /**
   * Opaque, unguessable value the caller keeps for this sign-in (the hosted bridge sends the
   * OAuth login challenge). The same value is required to read the result.
   */
  bindingRef: string
}

interface ReadPartnerVerificationRequest {
  bindingRef: string
}

/**
 * "Sign in with Credentis" for partner platforms. Authenticate with HTTP Basic using the
 * partner client id and secret, or (hosted bridge only) `x-bridge-key` plus
 * `x-partner-client-id`.
 */
@Route('api/partner/v1/verifications')
@Tags('Partner Verification')
@injectable()
export class PartnerVerificationController extends Controller {
  public constructor(@inject(SSIAuthService) private readonly ssiAuthService: SSIAuthService) {
    super()
  }

  /** Open a wallet verification. Show `authorizationRequest` to the person as a QR code or link. */
  @Post('/')
  public async startVerification(
    @Request() request: ExRequest,
    @Body() body: StartPartnerVerificationRequest,
  ): Promise<PartnerVerificationStart> {
    const client = this.requireClient(request)
    return this.service().start(client, body?.bindingRef)
  }

  /**
   * Read the result. `pending` until the wallet answers; then the verified result (or the
   * failure reason) is returned exactly once.
   */
  @Post('/{verificationId}/result')
  public async readVerification(
    @Request() request: ExRequest,
    @Path() verificationId: string,
    @Body() body: ReadPartnerVerificationRequest,
  ): Promise<PartnerVerificationResult> {
    const client = this.requireClient(request)
    return this.service().result(client, verificationId, body?.bindingRef)
  }

  private requireClient(request: ExRequest) {
    const client = PartnerVerificationService.authenticateCaller(request.headers as Record<string, unknown>)
    if (!client) {
      this.setHeader('WWW-Authenticate', 'Basic realm="credentis-partner"')
      throw new StatusException('Partner client authentication failed', 401)
    }
    if (!canSignIn(client)) throw new StatusException('This client is not registered to sign people in', 403)
    return client
  }

  private service(): PartnerVerificationService {
    return new PartnerVerificationService(container.resolve(Agent), this.ssiAuthService)
  }
}
