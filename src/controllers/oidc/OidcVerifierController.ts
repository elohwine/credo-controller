import 'reflect-metadata'
import type {
  CreatePresentationRequestBody,
  CreatePresentationRequestResponse,
  VerifyPresentationRequestBody,
  VerifyPresentationResponse,
} from '../../types/api'
import type { Request as ExRequest } from 'express'

import { Controller, Post, Route, Tags, Body, SuccessResponse, Security, Request, Get } from 'tsoa'
import { IssuedCredentialRepository } from '../../persistence/IssuedCredentialRepository'
import { ssiTrustService } from '../../services/SsiTrustService'

/**
 * OpenID4VP protocol controller.
 *
 * DCQL is the primary OpenID4VP 1.0 request language. DIF PEX v2 remains
 * available only when explicitly selected with `queryLanguage: pex_v2`.
 */
@Route('oidc')
@Tags('OIDC4VP')
export class OidcVerifierController extends Controller {
  private readonly issuedCredentialRepository = new IssuedCredentialRepository()

  @Get('verifier/formats')
  public async getSupportedFormats(): Promise<{ formats: string[] }> {
    return {
      formats: ['jwt_vc', 'sd_jwt', 'vc+sd-jwt', 'ldp_vc', 'ldp_vp', 'mso_mdoc'],
    }
  }

  @Post('verifier/presentation-requests')
  @SuccessResponse('201', 'Created')
  @Security('jwt', ['tenant'])
  public async createPresentationRequest(
    @Request() request: ExRequest,
    @Body() body: CreatePresentationRequestBody,
  ): Promise<CreatePresentationRequestResponse> {
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
      const verifiers = await (agent.modules as any).openId4VcVerifier.getAllVerifiers()
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

    const verifierModule = (agent.modules as any).openId4VcVerifier
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

      const dcqlService = agent.dependencyManager?.resolve?.(
        (await import('@credo-ts/core')).DcqlService
      )

      if (!dcqlService) {
        this.setStatus(503)
        throw new Error('Credo DCQL module is not configured')
      }

      const dcqlQuery = dcqlService.validateDcqlQuery(body.dcqlQuery)
      result = await verifierModule.createAuthorizationRequest({
        ...common,
        dcql: { query: dcqlQuery },
      })
    } else if (queryLanguage === 'pex_v2') {
      if (!body.presentationDefinition) {
        this.setStatus(400)
        throw new Error('presentationDefinition is required when queryLanguage is pex_v2')
      }

      result = await verifierModule.createAuthorizationRequest({
        ...common,
        presentationExchange: { definition: body.presentationDefinition },
      })
    } else {
      this.setStatus(400)
      throw new Error(`Unsupported presentation query language: ${queryLanguage}`)
    }

    const requestId = result.verificationSession.id

    // Do not write the full request object or credential query to ordinary logs.
    request.logger?.info(
      {
        module: 'verifier',
        operation: 'createRequest',
        requestId,
        verifierId,
        queryLanguage,
      },
      'Created OpenID4VP presentation request'
    )

    return {
      requestId,
      presentation_request_url: result.authorizationRequest,
      queryLanguage,
      protocol: 'openid4vp',
    }
  }

  @Post('verifier/verify')
  @Security('jwt', ['tenant'])
  public async verifyPresentation(
    @Request() request: ExRequest,
    @Body() body: VerifyPresentationRequestBody,
  ): Promise<VerifyPresentationResponse> {
    const { requestId, state, verifiablePresentation } = body || {}
    if (!requestId || !state || !verifiablePresentation) {
      this.setStatus(400)
      throw new Error('requestId, state and verifiablePresentation are required')
    }

    try {
      const verificationResult = await (request.agent.modules as any).openId4VcVerifier.verifyAuthorizationResponse({
        verificationSessionId: requestId,
        authorizationResponse: {
          vp_token: verifiablePresentation,
          presentation_submission: body.presentationSubmission,
          state,
        },
      })

      const queryLanguage = verificationResult?.dcql ? 'dcql' : 'pex_v2'

      if (queryLanguage === 'dcql') {
        const dcqlPresentations = verificationResult.dcql.presentations ?? {}
        const credentialCount = Object.values(dcqlPresentations).reduce(
          (count: number, presentations: any) => count + (Array.isArray(presentations) ? presentations.length : 0),
          0
        )

        return {
          verified: true,
          format: 'dcql',
          credentialCount,
          presentation: undefined,
          checks: {
            signature: true,
            nonce: true,
            audience: true,
            revocation: true,
            schema: true,
          },
        } as any
      }

      const presentations = verificationResult?.presentationExchange?.presentations ?? []
      const credentials = presentations.flatMap((presentation: any) => {
        const values = presentation?.verifiableCredential
        return Array.isArray(values) ? values : [values].filter(Boolean)
      })

      const credentialIds = this.extractCredentialIds(credentials)
      const revokedIds = credentialIds.filter((id) => this.issuedCredentialRepository.isRevoked(id))

      if (revokedIds.length > 0) {
        return {
          verified: false,
          format: 'pex_v2',
          error: 'One or more credentials have been revoked',
          revokedIds,
          checks: {
            signature: true,
            nonce: true,
            audience: true,
            revocation: false,
            schema: true,
          },
        } as any
      }

      return {
        verified: true,
        format: 'pex_v2',
        presentation: undefined,
        credentialCount: credentials.length,
        checks: {
          signature: true,
          nonce: true,
          audience: true,
          revocation: true,
          schema: true,
        },
      } as any
    } catch {
      request.logger?.warn(
        { module: 'verifier', operation: 'verifyPresentation', requestId },
        'OpenID4VP verification failed'
      )
      return { verified: false, format: 'openid4vp', error: 'Verification failed' } as any
    }
  }

  private extractCredentialIds(credentials: unknown[]): string[] {
    const ids: string[] = []

    for (const credential of credentials) {
      if (!credential) continue

      if (typeof credential === 'string') {
        const token = credential.includes('~') ? credential.split('~')[0] : credential
        const parts = token.split('.')
        if (parts.length === 3) {
          try {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
            const id = payload?.vc?.id || payload?.id || payload?.jti
            if (id) ids.push(String(id))
          } catch {
            // Credo performs authoritative token verification.
          }
        }
        continue
      }

      if (typeof credential === 'object') {
        const value: any = credential
        const id = value.id || value.credentialId || value.jti || value.vc?.id
        if (id) ids.push(String(id))
      }
    }

    return Array.from(new Set(ids))
  }
}
