import type { Request as ExRequest } from 'express'
import { IssuedCredentialRepository } from '../../persistence/IssuedCredentialRepository'
import { ssiTrustService } from '../SsiTrustService'
import { credentialStatusService } from './CredentialStatusService'

export interface PlatformPresentationVerificationInput {
  tenantId: string
  subjectRef: string
  requestId: string
  verifiablePresentation: unknown
  presentationSubmission?: unknown
  request: ExRequest
}

export interface PlatformPresentationVerificationResult {
  resultId: string
  verified: boolean
  credentialCount: number
  reasonCode: string
  statusChecked: boolean
  evidenceDigest: string
}

/**
 * Adapter around Credo's native OpenID4VP verifier.
 *
 * The raw VP exists only for the duration of protocol verification. It is
 * never returned to the application client, written to the platform DB, or
 * logged. Business code receives only a sanitized verification result.
 *
 * The adapter fails closed: cryptographic verification alone is not promoted
 * to a business-trust decision until holder binding, schema, issuer trust and
 * authoritative credential status are all available.
 */
export class CredoPresentationVerificationService {
  private readonly issuedCredentialRepository = new IssuedCredentialRepository()

  async verify(input: PlatformPresentationVerificationInput): Promise<PlatformPresentationVerificationResult> {
    ssiTrustService.assertVerificationRequest(input.tenantId, input.requestId)

    const agent = input.request.agent
    const verifier = (agent.modules as any).openId4VcVerifier
    if (!verifier) throw new Error('OpenID4VP verifier module is not configured')

    const verificationResult = await verifier.verifyAuthorizationResponse({
      authorizationResponse: {
        vp_token: input.verifiablePresentation,
        presentation_submission: input.presentationSubmission,
        state: input.requestId,
      },
    })

    if (!verificationResult?.isVerified) {
      const recorded = ssiTrustService.recordVerification({
        requestId: input.requestId,
        tenantId: input.tenantId,
        verified: false,
        resultCode: 'verification_failed',
      })

      return {
        resultId: recorded.resultId,
        verified: false,
        credentialCount: 0,
        reasonCode: 'verification_failed',
        statusChecked: false,
        evidenceDigest: recorded.evidenceDigest,
      }
    }

    const presentation = verificationResult.presentation
    const credentials = Array.isArray(presentation?.verifiableCredential)
      ? presentation.verifiableCredential
      : [presentation?.verifiableCredential].filter(Boolean)

    const credentialIds = this.extractCredentialIds(credentials)
    const locallyRevoked = credentialIds.some((id) => this.issuedCredentialRepository.isRevoked(id))

    const statusResults = await Promise.all(
      credentials.map((credential: any) => credentialStatusService.resolve({
        credentialId: credential?.id || credential?.jti,
        credentialStatus: credential?.credentialStatus || credential?.vc?.credentialStatus,
        issuerRef: credential?.issuer?.id || credential?.issuer,
      }))
    )

    const statusChecked = statusResults.length > 0 && statusResults.every((result) => result.checked)
    const statusInvalid = locallyRevoked || statusResults.some((result) => result.status === 'revoked')

    // Do not infer holder binding, schema validation, audience/nonce checks or
    // issuer trust from Credo's aggregate boolean. Those must be populated by
    // explicit verifier results before the platform records verified=true.
    const holderBindingVerified = false
    const trustVerified = false
    const schemaVerified = false
    const audienceVerified = false
    const nonceVerified = false
    const verified = !statusInvalid && holderBindingVerified && trustVerified && schemaVerified && statusChecked

    const recorded = ssiTrustService.recordVerification({
      requestId: input.requestId,
      tenantId: input.tenantId,
      verified,
      credentialTypeRefs: this.extractCredentialTypes(credentials),
      issuerRefs: this.extractIssuerRefs(credentials),
      holderBindingVerified,
      trustVerified,
      statusVerified: statusChecked,
      schemaVerified,
      audienceVerified,
      nonceVerified,
      resultCode: verified ? 'verified' : 'verification_incomplete',
    })

    return {
      resultId: recorded.resultId,
      verified,
      credentialCount: credentials.length,
      reasonCode: verified ? 'verified' : 'verification_incomplete',
      statusChecked,
      evidenceDigest: recorded.evidenceDigest,
    }
  }

  private extractCredentialIds(credentials: unknown[]): string[] {
    const ids: string[] = []
    for (const credential of credentials) {
      if (typeof credential !== 'string' && credential && typeof credential === 'object') {
        const value = credential as any
        const id = value.id || value.jti || value.vc?.id
        if (id) ids.push(String(id))
      }
    }
    return Array.from(new Set(ids))
  }

  private extractCredentialTypes(credentials: unknown[]): string[] {
    const values = new Set<string>()
    for (const credential of credentials) {
      if (credential && typeof credential === 'object') {
        const type = (credential as any).type || (credential as any).vc?.type
        if (Array.isArray(type)) type.forEach((value) => values.add(String(value)))
        else if (type) values.add(String(type))
      }
    }
    return Array.from(values)
  }

  private extractIssuerRefs(credentials: unknown[]): string[] {
    const values = new Set<string>()
    for (const credential of credentials) {
      if (credential && typeof credential === 'object') {
        const issuer = (credential as any).issuer || (credential as any).vc?.issuer
        if (typeof issuer === 'string') values.add(issuer)
        else if (issuer?.id) values.add(String(issuer.id))
      }
    }
    return Array.from(values)
  }
}

export const credoPresentationVerificationService = new CredoPresentationVerificationService()
