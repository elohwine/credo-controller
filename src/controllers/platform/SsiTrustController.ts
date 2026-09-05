import { Body, Path, Post, Request, Route, Security, Tags } from 'tsoa'
import type { Request as ExRequest } from 'express'
import { ssiTrustService, type PresentationQueryLanguage } from '../../services/SsiTrustService'

type AuthenticatedClaims = {
  tenantId?: string
  sub?: string
}

function principal(request: ExRequest) {
  const user = (request as any).user as AuthenticatedClaims | undefined
  if (!user?.tenantId || !user.sub) throw new Error('Authenticated tenant and subject are required')
  return { tenantId: user.tenantId, subjectRef: user.sub }
}

@Route('api/platform/ssi')
@Tags('Platform SSI')
@Security('jwt')
export class SsiTrustController {
  @Post('presentation-requests')
  public async createPresentationRequest(
    @Request() request: ExRequest,
    @Body() body: {
      verifierRef: string
      purposeCode: string
      purposeTextRef?: string
      queryLanguage?: PresentationQueryLanguage
      queryRef: string
      transactionRef?: string
      expiresAt: string
      credoVerificationSessionId?: string
      verifierClientIdRef?: string
    }
  ) {
    const p = principal(request)
    return ssiTrustService.createPresentationRequest({
      ...body,
      tenantId: p.tenantId,
      requesterSubjectRef: p.subjectRef,
    })
  }

  @Post('presentation-requests/{requestId}/bind-verifier-session')
  public async bindVerifierSession(
    @Request() request: ExRequest,
    @Path() requestId: string,
    @Body() body: {
      verifierRef: string
      verificationSessionId: string
      verifierClientIdRef?: string
    }
  ) {
    const p = principal(request)
    return ssiTrustService.bindCredoVerificationSession({
      tenantId: p.tenantId,
      requestId,
      verifierRef: body.verifierRef,
      verificationSessionId: body.verificationSessionId,
      verifierClientIdRef: body.verifierClientIdRef,
    })
  }

  @Post('presentation-consents')
  public async recordConsent(
    @Request() request: ExRequest,
    @Body() body: {
      requestId: string
      decision: 'approved' | 'declined'
      requestedCategories: string[]
      disclosedCategories?: string[]
      privacyNoticeRef?: string
      consentVersion: string
    }
  ) {
    const p = principal(request)
    return ssiTrustService.recordConsent({
      ...body,
      tenantId: p.tenantId,
      holderSubjectRef: p.subjectRef,
    })
  }
}
