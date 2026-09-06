import type { Request as ExRequest } from 'express'

import { Body, Post, Request, Route, Tags } from 'tsoa'

import { ssiTrustService } from '../../services/SsiTrustService'
import { credoPresentationVerificationService } from '../../services/ssi/CredoPresentationVerificationService'

@Route('api/platform/ssi')
@Tags('Platform SSI')
export class SsiVerificationController {
  /**
   * OpenID4VP callback. The protocol state is the only client-supplied
   * correlation identifier; tenant and request identity are resolved from the
   * server-side presentation request record. Credo then validates the bound
   * verification session and the submitted presentation.
   */
  @Post('verify')
  public async verify(
    @Request() request: ExRequest,
    @Body() body: {
      state: string
      verifiablePresentation: string
      presentationSubmission?: unknown
    }
  ) {
    if (!body?.state || !body.verifiablePresentation) {
      throw new Error('state and verifiablePresentation are required')
    }

    const context = ssiTrustService.getProtocolContextByState(body.state)

    return credoPresentationVerificationService.verify({
      tenantId: context.tenantId,
      requestId: context.requestId,
      state: body.state,
      verifiablePresentation: body.verifiablePresentation,
      presentationSubmission: body.presentationSubmission,
      request,
    })
  }
}
