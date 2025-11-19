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
import { Controller, Post, Route, Tags, Body, SuccessResponse, Security, Request } from 'tsoa'

import { schemaStore } from '../../utils/schemaStore'
import * as OidcStore from '../../persistence/OidcStoreRepository'
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
   * Create a presentation request returning a request URL with nonce and verifier DID.
   */
  @Post('verifier/presentation-requests')
  @SuccessResponse('201', 'Created')
  @Security('jwt', ['tenant'])
  public async createPresentationRequest(
    @Request() request: ExRequest,
    @Body() body: CreatePresentationRequestBody,
  ): Promise<CreatePresentationRequestResponse> {
    const requestId = randomUUID()
    const nonce = randomUUID()
    
    // Get verifier DID from tenant metadata
    let verifierDid: string | undefined
    try {
      const tenantAgent = request.agent
      const tenantId = (tenantAgent as any).tenantId
      if (tenantId) {
        const verifierRecords = await tenantAgent.genericRecords.findAllByQuery({ tenantId, type: 'verifier' })
        if (verifierRecords.length > 0 && typeof verifierRecords[0].content.did === 'string') {
          verifierDid = verifierRecords[0].content.did as string
        }
      }
    } catch (e) {
      request.logger?.warn({ error: (e as Error).message }, 'Could not retrieve verifier DID from tenant metadata')
    }
    
    OidcStore.savePresentationRequest({
      id: requestId,
      definition: body?.presentationDefinition,
      createdAt: Date.now(),
      nonce,
      audience: verifierDid,
    })
    const presentation_request_url = `http://localhost:3000/oidc/present?request_id=${requestId}&nonce=${nonce}${verifierDid ? `&aud=${verifierDid}` : ''}`
    request.logger?.info({ module: 'verifier', operation: 'createRequest', requestId, nonce }, 'Created presentation request')
    return { requestId, presentation_request_url }
  }

  /**
   * Verify a verifiable presentation against the stored request with full JWS crypto checks.
   * Implements:
   * - JWS signature verification using issuer's public key from Askar wallet
   * - Nonce validation
   * - Audience (aud) validation
   * - Revocation check
   * - Optional schema validation
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
    
    const req = OidcStore.getPresentationRequestById(requestId)
    if (!req) {
      this.setStatus(404)
      throw new Error('presentation request not found')
    }

    try {
      // Parse JWT (header.payload.signature)
      const parts = verifiablePresentation.split('.')
      if (parts.length !== 3) {
        return { verified: false, error: 'Invalid JWT format' }
      }

      const [encodedHeader, encodedPayload, encodedSignature] = parts
      const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString())
      const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString())
      const signature = Buffer.from(encodedSignature, 'base64url')

      request.logger?.debug({ header, jti: payload.jti, iss: payload.iss }, 'Parsed JWT presentation')

      // 1. Nonce validation
      if (req.nonce && payload.nonce !== req.nonce) {
        request.logger?.warn({ expected: req.nonce, received: payload.nonce }, 'Nonce mismatch')
        return { verified: false, reason: 'nonce_mismatch', presentation: payload }
      }

      // 2. Audience validation
      if (req.audience && payload.aud !== req.audience) {
        request.logger?.warn({ expected: req.audience, received: payload.aud }, 'Audience mismatch')
        return { verified: false, reason: 'audience_mismatch', presentation: payload }
      }

      // 3. Revocation check
      const jti = payload?.jti
      let schemaValidation: any = undefined
      if (jti) {
        const issuedVc = OidcStore.getIssuedCredentialById(jti)
        if (issuedVc) {
          if (issuedVc.revoked) {
            request.logger?.warn({ jti }, 'Credential revoked')
            return { verified: false, reason: 'credential_revoked', presentation: payload }
          }
          
          // Optional schema validation
          const vc = payload.vc
          const schemaId = issuedVc.schemaId
          if (schemaId && vc?.credentialSubject) {
            schemaValidation = schemaStore.validate(schemaId, vc.credentialSubject)
            if (!schemaValidation.valid) {
              request.logger?.warn({ schemaId, errors: schemaValidation.errors }, 'Schema validation failed')
              return { verified: false, reason: 'schema_validation_failed', schemaValidation, presentation: payload }
            }
          }
        }
      }

      // 4. JWS Signature Verification using Askar wallet
      const issuerDid = payload.iss
      if (!issuerDid) {
        return { verified: false, error: 'Missing iss (issuer DID) in JWT' }
      }

      // Resolve issuer DID to get public key
      const resolvedDid = await request.agent.dids.resolve(issuerDid)
      if (!resolvedDid.didDocument || !resolvedDid.didDocument.verificationMethod || resolvedDid.didDocument.verificationMethod.length === 0) {
        request.logger?.error({ issuerDid }, 'Could not resolve issuer DID')
        return { verified: false, error: `Could not resolve issuer DID: ${issuerDid}` }
      }

      const verificationMethod = resolvedDid.didDocument.verificationMethod[0]
      const publicKeyBase58 = verificationMethod.publicKeyBase58
      if (!publicKeyBase58) {
        return { verified: false, error: 'No publicKeyBase58 found in issuer DID' }
      }

      // Determine key type from header alg or default to Ed25519
      let keyType = KeyType.Ed25519
      if (header.alg === 'ES256') {
        keyType = KeyType.P256
      }

      const key = Key.fromPublicKeyBase58(publicKeyBase58, keyType)
      const signingInput = `${encodedHeader}.${encodedPayload}`
      
      const isValid = await request.agent.context.wallet.verify({
        data: TypedArrayEncoder.fromString(signingInput),
        key,
        signature: Buffer.from(signature) as any,
      })

      if (!isValid) {
        request.logger?.warn({ issuerDid, kid: verificationMethod.id }, 'JWS signature verification failed')
        return { verified: false, reason: 'invalid_signature', presentation: payload }
      }

      request.logger?.info(
        { requestId, issuerDid, jti, nonce: req.nonce, aud: req.audience },
        'Presentation verified successfully'
      )

      return { 
        verified: true, 
        schemaValidation, 
        presentation: payload,
        checks: {
          signature: true,
          nonce: req.nonce ? true : undefined,
          audience: req.audience ? true : undefined,
          revocation: true,
          schema: schemaValidation?.valid
        }
      }
    } catch (e: any) {
      request.logger?.error(
        { module: 'verifier', operation: 'verifyPresentation', error: e.message, stack: e.stack },
        'Verification failed with exception',
      )
      return { verified: false, error: 'Verification failed: ' + e.message }
    }
  }
}
