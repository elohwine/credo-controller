import type { Request as ExRequest } from 'express'

import { DcqlService } from '@credo-ts/core'

import { ssiTrustService } from '../SsiTrustService'

export interface CreatePlatformPresentationRequestInput {
  tenantId: string
  requesterSubjectRef: string
  verifierRef: string
  purposeCode: string
  purposeTextRef?: string
  queryLanguage?: 'dcql' | 'pex_v2'
  dcqlQuery?: unknown
  presentationDefinition?: unknown
  transactionRef?: string
  expiresAt: string
  request: ExRequest
}

export interface CreatePlatformPresentationRequestResult {
  requestId: string
  verificationSessionId: string
  presentationRequestUrl: string
  queryLanguage: 'dcql' | 'pex_v2'
  protocol: 'openid4vp'
  expiresAt: string
}

/**
 * Orchestrates the OpenID4VP protocol boundary for the organization platform.
 * The workflow/business layer never constructs request JWTs itself.
 */
export class SsiPresentationService {
  public async createPresentationRequest(
    input: CreatePlatformPresentationRequestInput
  ): Promise<CreatePlatformPresentationRequestResult> {
    const queryLanguage = input.queryLanguage ?? 'dcql'
    const expiresAt = new Date(input.expiresAt)
    const now = Date.now()

    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now) {
      throw new Error('Presentation request expiry must be a valid future timestamp')
    }

    const registration = ssiTrustService.getVerifierRegistration(input.tenantId, input.verifierRef)

    const platformRequest = ssiTrustService.createPresentationRequest({
      tenantId: input.tenantId,
      requesterSubjectRef: input.requesterSubjectRef,
      verifierRef: input.verifierRef,
      purposeCode: input.purposeCode,
      purposeTextRef: input.purposeTextRef,
      queryLanguage,
      queryRef: queryLanguage === 'dcql'
        ? JSON.stringify(input.dcqlQuery ?? null)
        : JSON.stringify(input.presentationDefinition ?? null),
      transactionRef: input.transactionRef,
      expiresAt: expiresAt.toISOString(),
    })

    const agent = input.request.agent
    const verifierModule = (agent.modules as any).openId4VcVerifier
    if (!verifierModule) throw new Error('OpenID4VP verifier module is not configured')

    const expirationInSeconds = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000))
    let protocolResult: any

    if (queryLanguage === 'dcql') {
      if (!input.dcqlQuery) throw new Error('dcqlQuery is required for a DCQL presentation request')

      const dcqlService = agent.dependencyManager.resolve(DcqlService)
      const dcqlQuery = dcqlService.validateDcqlQuery(input.dcqlQuery)

      protocolResult = await verifierModule.createAuthorizationRequest({
        verifierId: registration.credoVerifierIdRef,
        requestSigner: {
          method: 'did',
          didUrl: registration.signerDidUrlRef,
        },
        dcql: { query: dcqlQuery },
        version: 'v1',
        expirationInSeconds,
      })
    } else {
      if (!input.presentationDefinition) {
        throw new Error('presentationDefinition is required for a PEX v2 presentation request')
      }

      protocolResult = await verifierModule.createAuthorizationRequest({
        verifierId: registration.credoVerifierIdRef,
        requestSigner: {
          method: 'did',
          didUrl: registration.signerDidUrlRef,
        },
        presentationExchange: { definition: input.presentationDefinition },
        version: 'v1.draft24',
        expirationInSeconds,
      })
    }

    const verificationSessionId = protocolResult.verificationSession?.id
    if (!verificationSessionId) throw new Error('Credo did not return a verification session')

    const verifierClientIdRef = protocolResult.verificationSession?.requestPayload?.client_id
    ssiTrustService.bindCredoVerificationSession({
      tenantId: input.tenantId,
      requestId: platformRequest.requestId,
      verifierRef: input.verifierRef,
      verificationSessionId,
      verifierClientIdRef: typeof verifierClientIdRef === 'string' ? verifierClientIdRef : undefined,
    })

    return {
      requestId: platformRequest.requestId,
      verificationSessionId,
      presentationRequestUrl: protocolResult.authorizationRequest,
      queryLanguage,
      protocol: 'openid4vp',
      expiresAt: platformRequest.expiresAt,
    }
  }
}

export const ssiPresentationService = new SsiPresentationService()
