import 'reflect-metadata'   // MUST be first import before any decorated controllers
import type {
  CreatePresentationRequestBody,
  CreatePresentationRequestResponse,
  VerifyPresentationRequestBody,
  VerifyPresentationResponse,
} from '../../types/api'
import type { Request as ExRequest } from 'express'

import { randomUUID } from 'crypto'
import { Controller, Post, Route, Tags, Body, SuccessResponse, Security, Request } from 'tsoa'

import { schemaStore } from '../../utils/schemaStore'
import { presentationRequestStore, issuedVcStore } from '../../utils/store'
// Use request-scoped Pino logger attached by middleware

/**
 * OIDC4VP Verifier (Phase 1 Placeholder)
 *
 * Responsibilities implemented:
 *  - Create presentation request record (no formal presentation definition processing yet)
 *  - Accept a VP (JWT form) and parse payload
 *  - Perform simple revocation check against in-memory issuedVcStore
 *  - Optional schema re-validation hook (if schemaId tracked in store)
 *
 * Not yet implemented (roadmap):
 *  - Cryptographic verification (JWS signature, holder binding, nonce/aud)
 *  - Presentation Definition / Input Descriptor enforcement
 *  - Multi-VC / SD-JWT selective disclosure handling
 *  - Trust registry & issuer DID policy evaluation
 */
@Route('oidc')
@Tags('OIDC4VP')
export class OidcVerifierController extends Controller {
  /**
   * Create a presentation request returning a request URL.
   */
  @Post('verifier/presentation-requests')
  @SuccessResponse('201', 'Created')
  @Security('jwt', ['tenant'])
  public async createPresentationRequest(
    @Request() request: ExRequest,
    @Body() body: CreatePresentationRequestBody,
  ): Promise<CreatePresentationRequestResponse> {
    const requestId = randomUUID()
    presentationRequestStore[requestId] = {
      id: requestId,
      definition: body?.presentationDefinition,
      createdAt: Date.now(),
    }
    const presentation_request_url = `http://localhost:3000/oidc/present?request_id=${requestId}`
    request.logger?.info({ module: 'verifier', operation: 'createRequest', requestId }, 'Created presentation request')
    return { requestId, presentation_request_url }
  }

  /**
   * Verify a verifiable presentation against the stored request.
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
    const req = presentationRequestStore[requestId]
    if (!req) {
      this.setStatus(404)
      throw new Error('presentation request not found')
    }
    // Placeholder: parse JWT style VP if provided and run light checks.
    let decoded: any
    let revoked = false
    let schemaValidation: any = undefined
    try {
      const parts = verifiablePresentation.split('.')
      if (parts.length === 3) {
        decoded = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
        const jti = decoded?.jti
        if (jti && issuedVcStore[jti]) {
          revoked = !!issuedVcStore[jti].revoked
          // If credential subject claims template was schema validated on issuance we can re-run if schemaId present
          const vc = decoded.vc
          const schemaId = issuedVcStore[jti].schemaId
          if (schemaId && vc?.credentialSubject) {
            schemaValidation = schemaStore.validate(schemaId, vc.credentialSubject)
          }
        }
      }
    } catch (e: any) {
      request.logger?.error(
        { module: 'verifier', operation: 'verifyPresentation', error: e.message },
        'Verification failed: malformed presentation',
      )
      return { verified: false, error: 'malformed presentation: ' + e.message }
    }
    if (revoked) {
      request.logger?.warn(
        { module: 'verifier', operation: 'verifyPresentation', requestId: body.requestId },
        'Verification failed: credential revoked',
      )
      return { verified: false, reason: 'credential revoked', presentation: decoded }
    }
    request.logger?.info(
      { module: 'verifier', operation: 'verifyPresentation', requestId: body.requestId },
      'Verification success (placeholder only)',
    )
    return { verified: true, schemaValidation, presentation: decoded }
  }
}
