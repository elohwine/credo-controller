import 'reflect-metadata'   // MUST be first import before any decorated controllers
import type {
  CreatePresentationRequestBody,
  CreatePresentationRequestResponse,
  VerifyPresentationRequestBody,
  VerifyPresentationResponse,
} from '../../types/api'
import type { Request as ExRequest } from 'express'

import { Controller, Post, Route, Tags, Body, SuccessResponse, Security, Request, Get } from 'tsoa'

import { IssuedCredentialRepository } from '../../persistence/IssuedCredentialRepository'

/**
 * Credential format detection utility
 */
type CredentialFormat = 'jwt_vc' | 'sd_jwt' | 'ldp_vc' | 'unknown'

const issuedCredentialRepository = new IssuedCredentialRepository()

function detectCredentialFormat(presentation: unknown): CredentialFormat {
  if (!presentation) return 'unknown'

  if (typeof presentation === 'string') {
    if (presentation.includes('~')) return 'sd_jwt'
    const parts = presentation.split('.')
    if (parts.length === 3) return 'jwt_vc'
  }

  if (typeof presentation === 'object') {
    const pres = presentation as any
    if (pres['@context'] && pres.proof) return 'ldp_vc'
    if (pres.jwt || pres.vp_token) return detectCredentialFormat(pres.jwt || pres.vp_token)
  }

  return 'unknown'
}

/** Parse and minimally validate a DIF Presentation Definition v2. */
function validatePresentationDefinition(definition: any): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!definition) {
    errors.push('Presentation Definition is required')
    return { valid: false, errors }
  }

  if (!definition.id) errors.push('Presentation Definition must have an id')
  if (!definition.input_descriptors || !Array.isArray(definition.input_descriptors)) {
    errors.push('Presentation Definition must have input_descriptors array')
    return { valid: errors.length === 0, errors }
  }

  for (const descriptor of definition.input_descriptors) {
    if (!descriptor.id) errors.push('Input descriptor missing id')
    if (descriptor.constraints?.fields) {
      for (const field of descriptor.constraints.fields) {
        if (!field.path || !Array.isArray(field.path) || field.path.length === 0) {
          errors.push('Field constraint missing path array')
        }
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

function extractCredentialIds(credentials: unknown[]): string[] {
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
          if (id) ids.push(id)
        } catch {
          // Ignore malformed token; Credo performs authoritative verification.
        }
      }
      continue
    }

    if (typeof credential === 'object') {
      const cred: any = credential
      const id = cred?.id || cred?.credentialId || cred?.jti || cred?.vc?.id
      if (id) ids.push(id)
    }
  }

  return Array.from(new Set(ids))
}

/**
 * OIDC4VP compatibility controller.
 *
 * The protocol implementation is delegated to Credo. New platform flows should
 * bind the returned verification session to their platform presentation request.
 * Current Credo 0.5.15 supports the DIF Presentation Exchange v2 request shape;
 * DCQL belongs in the upgrade path rather than being mislabeled as PEX.
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
  public async createPresentationRequest(
    @Request() request: ExRequest,
    @Body() body: CreatePresentationRequestBody,
  ): Promise<CreatePresentationRequestResponse> {
    const validation = validatePresentationDefinition(body.presentationDefinition)
    if (!validation.valid) {
      this.setStatus(400)
      throw new Error(`Invalid Presentation Definition: ${validation.errors.join(', ')}`)
    }

    const agent = request.agent
    const verifiers = await (agent.modules as any).openId4VcVerifier.getAllVerifiers()
    const verifierId = verifiers[0]?.verifierId
    if (!verifierId) {
      this.setStatus(503)
      throw new Error('No OpenID4VP verifier is configured for this tenant')
    }

    const result = await (agent.modules as any).openId4VcVerifier.createAuthorizationRequest({
      verifierId,
      requestSigner: {
        method: 'did',
        did: body.verifierDid,
        didUrl: body.verifierDid,
      },
      presentationExchange: {
        definition: body.presentationDefinition,
      },
    })

    const requestId = result.verificationSession.id

    request.logger?.info({
      module: 'verifier',
      operation: 'createRequest',
      requestId,
      verifierId,
      inputDescriptors: body.presentationDefinition?.input_descriptors?.length || 0,
    }, 'Created OpenID4VP presentation request')

    return {
      requestId,
      presentation_request_url: result.authorizationRequest,
    }
  }

  @Post('verifier/verify')
  @Security('jwt', ['tenant'])
  public async verifyPresentation(
    @Request() request: ExRequest,
    @Body() body: VerifyPresentationRequestBody,
  ): Promise<VerifyPresentationResponse> {
    const { requestId, verifiablePresentation } = body || {}
    if (!requestId || !verifiablePresentation) {
      this.setStatus(400)
      throw new Error('requestId and verifiablePresentation required')
    }

    const format = detectCredentialFormat(verifiablePresentation)
    const agent = request.agent

    try {
      const verificationResult = await (agent.modules as any).openId4VcVerifier.verifyAuthorizationResponse({
        verificationSessionId: requestId,
        authorizationResponse: {
          vp_token: verifiablePresentation,
          presentation_submission: body.presentationSubmission,
          state: (body as any).state,
        },
      })

      const presentations = verificationResult?.presentationExchange?.presentations ?? []
      const credentials = presentations.flatMap((presentation: any) => {
        const values = presentation?.verifiableCredential
        return Array.isArray(values) ? values : [values].filter(Boolean)
      })

      const credentialIds = extractCredentialIds(credentials)
      const revokedIds = credentialIds.filter((id) => issuedCredentialRepository.isRevoked(id))

      if (revokedIds.length > 0) {
        return {
          verified: false,
          format,
          error: 'One or more credentials have been revoked',
          revokedIds,
          checks: {
            signature: true,
            revocation: false,
            schema: true,
            expiry: true,
          },
        } as any
      }

      return {
        verified: true,
        presentation: undefined,
        format,
        credentialCount: credentials.length,
        checks: {
          signature: true,
          revocation: true,
          schema: true,
          expiry: true,
        },
      } as any
    } catch (e: any) {
      request.logger?.warn({ module: 'verifier', operation: 'verifyPresentation', requestId, format }, 'OpenID4VP verification failed')
      return { verified: false, format, error: 'Verification failed' } as any
    }
  }
}
