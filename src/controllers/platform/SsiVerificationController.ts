import { Body, Post, Request, Route, Security, Tags } from 'tsoa'
import type { Request as ExRequest } from 'express'
import { credoPresentationVerificationService } from '../../services/ssi/CredoPresentationVerificationService'

@Route('api/platform/ssi')
@Tags('Platform SSI')
@Security('jwt')
export class SsiVerificationController {
  @Post('verify')
  public async verify(
    @Request() request: ExRequest,
    @Body() body: {
      requestId: string
      state: string
      verifiablePresentation: string
      presentationSubmission?: unknown
    }
  ) {
    const user = (request as any).user as { tenantId?: string; sub?: string } | undefined
    if (!user?.tenantId || !user.sub) {
      throw new Error('Authenticated tenant and subject are required')
    }

    if (!body?.requestId || !body.state || !body.verifiablePresentation) {
      throw new Error('requestId, state and verifiablePresentation are required')
    }

    return credoPresentationVerificationService.verify({
      tenantId: user.tenantId,
      subjectRef: user.sub,
      requestId: body.requestId,
      state: body.state,
      verifiablePresentation: body.verifiablePresentation,
      presentationSubmission: body.presentationSubmission,
      request,
    })
  }
}
