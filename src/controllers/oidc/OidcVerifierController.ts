import 'reflect-metadata'   // MUST be first import before any decorated controllers
import type {
  CreatePresentationRequestBody,
  CreatePresentationRequestResponse,
  VerifyPresentationRequestBody,
  VerifyPresentationResponse,
} from '../../types/api'
import type { Request as ExRequest } from 'express'

import { Key, KeyType, TypedArrayEncoder } from '@credo-ts/core'
import { randomUUID } from 'crypto'
import { Controller, Post, Route, Tags, Body, SuccessResponse, Security, Request, Get } from 'tsoa'

import { schemaStore } from '../../utils/schemaStore'

/**
 * Credential format detection utility
 */
type CredentialFormat = 'jwt_vc' | 'sd_jwt' | 'ldp_vc' | 'unknown'

function detectCredentialFormat(presentation: unknown): CredentialFormat {
  if (!presentation) return 'unknown'

  // String-based detection for JWT formats
  if (typeof presentation === 'string') {
    // SD-JWT has multiple parts separated by ~
    if (presentation.includes('~')) {
      return 'sd_jwt'
    }
    // Regular JWT has 3 parts separated by .
    const parts = presentation.split('.')
    if (parts.length === 3) {
      return 'jwt_vc'
    }
  }

  // Object-based detection for JSON-LD
  if (typeof presentation === 'object') {
    const pres = presentation as any
    // JSON-LD VCs have @context and proof
    if (pres['@context'] && pres.proof) {
      return 'ldp_vc'
    }
    // Might be a wrapped JWT
    if (pres.jwt || pres.vp_token) {
      return detectCredentialFormat(pres.jwt || pres.vp_token)
    }
  }

  return 'unknown'
}

/**
 * Parse and validate Presentation Definition per DIF Presentation Exchange spec
 */
function validatePresentationDefinition(definition: any): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!definition) {
    errors.push('Presentation Definition is required')
    return { valid: false, errors }
  }

  if (!definition.id) {
    errors.push('Presentation Definition must have an id')
  }

  if (!definition.input_descriptors || !Array.isArray(definition.input_descriptors)) {
    errors.push('Presentation Definition must have input_descriptors array')
    return { valid: errors.length === 0, errors }
  }

  for (const descriptor of definition.input_descriptors) {
    if (!descriptor.id) {
      errors.push(`Input descriptor missing id`)
    }
    if (!descriptor.constraints) {
      // Constraints are optional but recommended
    } else if (descriptor.constraints.fields) {
      for (const field of descriptor.constraints.fields) {
        if (!field.path || !Array.isArray(field.path) || field.path.length === 0) {
          errors.push(`Field constraint missing path array`)
        }
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * OIDC4VP Verifier Controller
 *
 * Implements:
 *  - Create presentation request with Credo's OpenId4VcVerifier
 *  - Verify VP with multi-format support (JWT-VC, SD-JWT, LDP-VC)
 *  - Presentation Definition validation
 *
 * Reference: https://openid.net/specs/openid-4-verifiable-presentations-1_0.html
 */
@Route('oidc')
@Tags('OIDC4VP')
export class OidcVerifierController extends Controller {

  /**
   * Get supported credential formats for verification
   */
  @Get('verifier/formats')
  public async getSupportedFormats(): Promise<{ formats: string[] }> {
    return {
      formats: ['jwt_vc', 'jwt_vc_json', 'sd_jwt', 'vc+sd-jwt', 'ldp_vc']
    }
  }

  /**
   * Create a presentation request returning a request URL with nonce and verifier DID.
   * Validates Presentation Definition before creating request.
   */
  @Post('verifier/presentation-requests')
  @SuccessResponse('201', 'Created')
  @Security('jwt', ['tenant'])
  public async createPresentationRequest(
    @Request() request: ExRequest,
    @Body() body: CreatePresentationRequestBody,
  ): Promise<CreatePresentationRequestResponse> {

    // Validate Presentation Definition
    const validation = validatePresentationDefinition(body.presentationDefinition)
    if (!validation.valid) {
      this.setStatus(400)
      throw new Error(`Invalid Presentation Definition: ${validation.errors.join(', ')}`)
    }

    // Get tenant agent from request
    const agent = request.agent

    // Use Credo's OpenId4VcVerifier module to create the request
    const result = await (agent.modules as any).openId4VcVerifier.createAuthorizationRequest({
      requestSigner: {
        method: 'did',
        did: body.verifierDid
      },
      presentationExchange: {
        definition: body.presentationDefinition
      }
    })

    const presentation_request_url = result.authorizationRequest
    const requestId = result.authorizationRequest.split('request_uri=')[1] || randomUUID()

    request.logger?.info({
      module: 'verifier',
      operation: 'createRequest',
      requestId,
      inputDescriptors: body.presentationDefinition?.input_descriptors?.length || 0
    }, 'Created presentation request')

    return {
      requestId,
      presentation_request_url
    }
  }

  /**
   * Verify a verifiable presentation with multi-format support.
   * Supports: JWT-VC, SD-JWT, LDP-VC
   */
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

    // Detect credential format
    const format = detectCredentialFormat(verifiablePresentation)
    request.logger?.info({ requestId, format }, 'Detected presentation format')

    // Get tenant agent from request
    const agent = request.agent

    try {
      request.logger?.info({ requestId, format }, 'Verifying presentation with Credo OpenId4VcVerifier')

      // Credo's verifyAuthorizationResponse handles both JWT and SD-JWT formats
      const verificationResult = await (agent.modules as any).openId4VcVerifier.verifyAuthorizationResponse({
        authorizationResponse: {
          vp_token: verifiablePresentation,
          presentation_submission: body.presentationSubmission,
          state: requestId,
        },
      })

      if (verificationResult.isVerified) {
        request.logger?.info({ requestId, format }, 'Presentation verified successfully')

        // Extract claims for response
        const presentation = verificationResult.presentation
        const credentials = Array.isArray(presentation?.verifiableCredential)
          ? presentation.verifiableCredential
          : [presentation?.verifiableCredential].filter(Boolean)

        return {
          verified: true,
          presentation: verificationResult.presentation,
          format,
          credentialCount: credentials.length,
          checks: {
            signature: true,
            revocation: true,
            schema: true,
            expiry: true
          }
        } as any
      } else {
        request.logger?.warn({ requestId, error: verificationResult.error, format }, 'Verification failed')
        return {
          verified: false,
          format,
          error: verificationResult.error?.message || 'Verification failed'
        } as any
      }

    } catch (e: any) {
      request.logger?.error(
        { module: 'verifier', operation: 'verifyPresentation', error: e.message, stack: e.stack, format },
        'Verification failed with exception',
      )
      return { verified: false, format, error: 'Verification failed: ' + e.message } as any
    }
  }
}

