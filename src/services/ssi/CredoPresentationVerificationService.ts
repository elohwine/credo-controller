import type { Request as ExRequest } from 'express'

import { IssuedCredentialRepository } from '../../persistence/IssuedCredentialRepository'
import { ssiTrustService } from '../SsiTrustService'
import { credentialStatusService } from './CredentialStatusService'
import { issuerTrustService } from './IssuerTrustService'

export interface PlatformPresentationVerificationInput {
  tenantId: string
  requestId: string
  state: string
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
 * Adapter around Credo's OpenID4VP verifier.
 *
 * Credo owns protocol verification: state, nonce, audience, holder binding,
 * credential proof validation and DCQL matching. Platform policy then adds
 * issuer trust and authoritative status checks.
 *
 * Raw presentations are transient protocol data and are never returned or
 * persisted by this service.
 */
export class CredoPresentationVerificationService {
  private readonly issuedCredentialRepository = new IssuedCredentialRepository()

  public async verify(input: PlatformPresentationVerificationInput): Promise<PlatformPresentationVerificationResult> {
    const context = ssiTrustService.getProtocolContext(input.tenantId, input.requestId)

    if (!context.credoVerificationSessionId) {
      throw new Error('Presentation request is not bound to a Credo verification session')
    }

    const agent = input.request.agent
    const verifier = (agent.modules as any).openId4VcVerifier
    if (!verifier) throw new Error('OpenID4VP verifier module is not configured')

    if (context.protocol !== 'openid4vp') {
      throw new Error(`Unsupported presentation protocol: ${context.protocol}`)
    }

    try {
      const verificationResult = await verifier.verifyAuthorizationResponse({
        verificationSessionId: context.credoVerificationSessionId,
        authorizationResponse: {
          vp_token: input.verifiablePresentation,
          presentation_submission: input.presentationSubmission,
          state: input.state,
        },
      })

      const isDcql = context.queryLanguage === 'dcql'
      const verifiedResponse = isDcql ? verificationResult?.dcql : verificationResult?.presentationExchange
      const presentations = this.extractPresentations(verifiedResponse, isDcql)
      const credentials = this.extractCredentials(presentations)
      const credentialCount = credentials.length

      if (credentialCount === 0) {
        return this.recordFailure(input, 'no_credentials_presented')
      }

      const credentialIds = this.extractCredentialIds(credentials)
      const locallyRevoked = credentialIds.some((id) => this.issuedCredentialRepository.isRevoked(id))

      const statusResults = await Promise.all(
        credentials.map((credential: any) => credentialStatusService.resolve({
          credentialId: credential?.id || credential?.jti || credential?.vc?.id,
          credentialStatus: credential?.credentialStatus || credential?.vc?.credentialStatus,
          issuerRef: this.extractIssuerRef(credential),
          request: input.request,
        }))
      )

      const statusChecked = statusResults.length > 0 && statusResults.every((result) => result.checked)
      const statusInvalid = locallyRevoked || statusResults.some((result) => result.status === 'revoked' || result.status === 'suspended')

      const issuerRefs = this.extractIssuerRefs(credentials)
      const trust = issuerTrustService.evaluate(input.tenantId, issuerRefs)
      const trustVerified = trust.decision === 'trusted'

      // Credo only returns a successful verified response after the persisted
      // request session and its protocol checks have passed. For DCQL, this also
      // includes Credo's DCQL evaluation of the presented credentials.
      const holderBindingVerified = true
      const audienceVerified = true
      const nonceVerified = true
      const schemaVerified = isDcql
        ? Boolean(verificationResult?.dcql?.presentationResult)
        : Boolean(verificationResult?.presentationExchange?.definition && verificationResult?.presentationExchange?.submission)

      const verified =
        !statusInvalid &&
        holderBindingVerified &&
        audienceVerified &&
        nonceVerified &&
        schemaVerified &&
        trustVerified &&
        statusChecked

      const reasonCode = verified
        ? 'verified'
        : trust.decision !== 'trusted'
          ? 'issuer_untrusted'
          : !statusChecked
            ? 'credential_status_unverified'
            : 'verification_failed'

      const recorded = ssiTrustService.recordVerification({
        requestId: input.requestId,
        tenantId: input.tenantId,
        verified,
        credentialTypeRefs: this.extractCredentialTypes(credentials),
        issuerRefs,
        holderBindingVerified,
        trustVerified,
        statusVerified: statusChecked,
        schemaVerified,
        audienceVerified,
        nonceVerified,
        resultCode: reasonCode,
      })

      return {
        resultId: recorded.resultId,
        verified,
        credentialCount,
        reasonCode,
        statusChecked,
        evidenceDigest: recorded.evidenceDigest,
      }
    } catch {
      return this.recordFailure(input, 'verification_failed')
    }
  }

  private recordFailure(input: PlatformPresentationVerificationInput, resultCode: string) {
    const recorded = ssiTrustService.recordVerification({
      requestId: input.requestId,
      tenantId: input.tenantId,
      verified: false,
      resultCode,
    })

    return {
      resultId: recorded.resultId,
      verified: false,
      credentialCount: 0,
      reasonCode: resultCode,
      statusChecked: false,
      evidenceDigest: recorded.evidenceDigest,
    }
  }

  private extractPresentations(
    verifiedResponse: any,
    isDcql: boolean
  ): unknown[] {
    if (!verifiedResponse) return []

    if (!isDcql) return Array.isArray(verifiedResponse.presentations) ? verifiedResponse.presentations : []

    // DCQL presentations are keyed by credential query id. A query can request
    // multiple presentations, so flatten all query groups without persisting them.
    return Object.values(verifiedResponse.presentations ?? {}).flatMap((values: any) =>
      Array.isArray(values) ? values : [values]
    )
  }

  private extractCredentials(presentations: unknown[]): unknown[] {
    return presentations.flatMap((presentation: any) => {
      const resolved = presentation?.resolvedPresentation ?? presentation
      const values = resolved?.verifiableCredential
      if (Array.isArray(values)) return values
      return values ? [values] : []
    })
  }

  private extractCredentialIds(credentials: unknown[]): string[] {
    const ids: string[] = []
    for (const credential of credentials) {
      if (!credential || typeof credential !== 'object') continue
      const value: any = credential
      const id = value.id || value.jti || value.vc?.id || value.resolvedCredential?.id
      if (id) ids.push(String(id))
    }
    return Array.from(new Set(ids))
  }

  private extractCredentialTypes(credentials: unknown[]): string[] {
    const values = new Set<string>()
    for (const credential of credentials) {
      if (!credential || typeof credential !== 'object') continue
      const value: any = credential
      const type = value.type || value.vc?.type || value.resolvedCredential?.type
      if (Array.isArray(type)) type.forEach((item) => values.add(String(item)))
      else if (type) values.add(String(type))
    }
    return Array.from(values)
  }

  private extractIssuerRefs(credentials: unknown[]): string[] {
    const values = new Set<string>()
    for (const credential of credentials) {
      const issuer = this.extractIssuerRef(credential)
      if (issuer) values.add(issuer)
    }
    return Array.from(values)
  }

  private extractIssuerRef(credential: unknown): string | undefined {
    if (!credential || typeof credential !== 'object') return undefined
    const value: any = credential
    const issuer = value.issuer || value.vc?.issuer || value.resolvedCredential?.issuer
    if (typeof issuer === 'string') return issuer
    if (issuer?.id) return String(issuer.id)
    return undefined
  }
}

export const credoPresentationVerificationService = new CredoPresentationVerificationService()
