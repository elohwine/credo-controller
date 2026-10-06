import 'reflect-metadata'
import type { Request as ExRequest } from 'express'

import { Controller, Post, Route, Tags, Body, SuccessResponse, Security, Request, Get } from 'tsoa'

import { ssiTrustService } from '../../services/SsiTrustService'
import { credoPresentationVerificationService } from '../../services/ssi/CredoPresentationVerificationService'

/**
 * OpenID4VP protocol controller.
 *
 * DCQL is the primary OpenID4VP 1.0 request language. DIF PEX v2 remains
 * available only when explicitly selected with `queryLanguage: pex_v2`.
 */
@Route('oidc')
@Tags('OIDC4VP')
export class OidcVerifierController extends Controller {
  @Get('verifier/formats')
  public async getSupportedFormats(): Promise<{ formats: string[] }> {
    return {
      formats: ['jwt_vc', 'sd_jwt', 'vc+sd-jwt', 'ldp_vc', 'ldp_vp', 'mso_mdoc'],
    }
  }

  @Post('verifier/presentation-requests')
  @SuccessResponse('201', 'Created')
  @Security('jwt', ['tenant'])
  public async createPresentationRequest(@Request() request: ExRequest, @Body() body: any): Promise<any> {
    const queryLanguage = body.queryLanguage ?? 'dcql'
    const agent = request.agent
    const user = (request as any).user as { tenantId?: string; sub?: string } | undefined

    if (!user?.tenantId || !user.sub) {
      this.setStatus(401)
      throw new Error('Authenticated tenant and subject are required')
    }

    let verifierId: string
    let signerDidUrl: string | undefined

    if (body.verifierRef) {
      const registration = ssiTrustService.getVerifierRegistration(user.tenantId, body.verifierRef)
      verifierId = registration.credoVerifierIdRef
      signerDidUrl = registration.signerDidUrlRef
    } else {
      const verifiers = await agent.openid4vc.verifier.getAllVerifiers()
      verifierId = verifiers[0]?.verifierId
      signerDidUrl = body.verifierDid
    }

    if (!verifierId) {
      this.setStatus(503)
      throw new Error('No OpenID4VP verifier is configured for this tenant')
    }
    if (!signerDidUrl) {
      this.setStatus(400)
      throw new Error('A verifier signing DID URL is required')
    }

    const verifierModule = agent.openid4vc.verifier
    const common = {
      verifierId,
      requestSigner: {
        method: 'did' as const,
        didUrl: signerDidUrl,
      },
      version: 'v1' as const,
    }

    let result: any
    if (queryLanguage === 'dcql') {
      if (!body.dcqlQuery) {
        this.setStatus(400)
        throw new Error('dcqlQuery is required when queryLanguage is dcql')
      }

      const dcqlQuery = this.normalizeDcqlQuery(body.dcqlQuery)

      result = await verifierModule.createAuthorizationRequest({
        ...common,
        dcql: { query: dcqlQuery as any },
      })
    } else if (queryLanguage === 'pex_v2') {
      if (!body.presentationDefinition) {
        this.setStatus(400)
        throw new Error('presentationDefinition is required when queryLanguage is pex_v2')
      }

      result = await verifierModule.createAuthorizationRequest({
        ...common,
        presentationExchange: { definition: body.presentationDefinition },
        version: 'v1.draft24' as const,
      })
    } else {
      this.setStatus(400)
      throw new Error(`Unsupported presentation query language: ${queryLanguage}`)
    }

    const requestId = result.verificationSession.id

    // Persist the actual Credo protocol session against the platform request when
    // the caller is using the platform SSI API. The legacy OIDC endpoint can still
    // operate standalone with the Credo session id as requestId.
    request.logger?.info(
      {
        module: 'verifier',
        operation: 'createRequest',
        requestId,
        verifierId,
        queryLanguage,
      },
      'Created OpenID4VP presentation request',
    )

    return {
      requestId,
      presentation_request_url: result.authorizationRequest,
      queryLanguage,
      protocol: 'openid4vp',
    }
  }

  /**
   * Verify a presentation response. Routes through the shared
   * CredoPresentationVerificationService — same path as the primary
   * api/platform/ssi/verify endpoint. Requires the platform request to have
   * been created via the platform SSI API so that a protocol state and
   * verification session are stored.
   *
   * @deprecated New callers should use POST /api/platform/ssi/verify directly.
   */
  @Post('verifier/verify')
  public async verifyPresentation(
    @Request() request: ExRequest,
    @Body()
    body: any,
  ): Promise<any> {
    const { state, verifiablePresentation } = body || {}
    if (!state || typeof state !== 'string') {
      this.setStatus(400)
      throw new Error('state is required')
    }

    if (!verifiablePresentation) {
      this.setStatus(400)
      throw new Error('verifiablePresentation is required')
    }

    try {
      const context = ssiTrustService.getProtocolContextByState(state)
      const effectiveState = context.protocolState || state

      const result = await credoPresentationVerificationService.verify({
        tenantId: context.tenantId,
        requestId: context.requestId,
        state: effectiveState,
        verifiablePresentation,
        presentationSubmission: body.presentationSubmission,
        request,
      })

      request.logger?.info(
        {
          module: 'verifier',
          operation: 'verifyPresentation',
          requestId: context.requestId,
          verified: result.verified,
          reasonCode: result.reasonCode,
        },
        'OpenID4VP verification completed',
      )

      return {
        verified: result.verified,
        format: context.queryLanguage === 'dcql' ? 'dcql' : 'pex_v2',
        credentialCount: result.credentialCount,
        reasonCode: result.reasonCode,
        evidenceDigest: result.evidenceDigest,
      } as any
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Verification failed'
      request.logger?.warn(
        { module: 'verifier', operation: 'verifyPresentation' },
        `OpenID4VP verification failed: ${message}`,
      )
      this.setStatus(400)
      throw new Error(message)
    }
  }

  private normalizeDcqlQuery(query: unknown): Record<string, unknown> {
    if (!query || typeof query !== 'object' || Array.isArray(query)) {
      throw new Error('dcqlQuery must be an object')
    }

    return query as Record<string, unknown>
  }
}
