import type { Request as ExRequest } from 'express'

import { Body, Path, Post, Request, Route, Security, Tags } from 'tsoa'

import { ssiTrustService, type PresentationQueryLanguage } from '../../services/SsiTrustService'
import { ssiPresentationService } from '../../services/ssi/SsiPresentationService'

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
  /**
   * Create an organization-scoped OpenID4VP request. DCQL is the default for
   * OpenID4VP 1.0; PEX v2 is accepted only as an explicit compatibility mode.
   */
  @Post('presentation-requests')
  public async createPresentationRequest(
    @Request() request: ExRequest,
    @Body() body: {
      verifierRef: string
      purposeCode: string
      purposeTextRef?: string
      queryLanguage?: PresentationQueryLanguage
      dcqlQuery?: unknown
      presentationDefinition?: unknown
      transactionRef?: string
      expiresAt: string
    }
  ) {
    const p = principal(request)
    return ssiPresentationService.createPresentationRequest({
      ...body,
      tenantId: p.tenantId,
      requesterSubjectRef: p.subjectRef,
      request,
    })
  }

  /**
   * Compatibility endpoint for callers that already created a Credo verifier
   * session outside the platform API.
   */
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
