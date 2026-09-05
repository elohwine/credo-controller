import type { Request as ExRequest } from 'express'
import { IssuedCredentialRepository } from '../../persistence/IssuedCredentialRepository'
import { ssiTrustService } from '../SsiTrustService'
import { credentialStatusService } from './CredentialStatusService'
import { issuerTrustService } from './IssuerTrustService'

export interface PlatformPresentationVerificationInput {
  tenantId: string
  subjectRef: string
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
 * Adapter around Credo's native OpenID4VP verifier.
 *
 * The platform request is bound to Credo's persisted verification session.
 * Credo performs state, audience, nonce and presentation-proof checks using
 * that session. Platform policy then layers issuer trust and authoritative
 * credential status on top before a successful result can become trusted.
 *
 * Raw presentations are transient protocol data and are never returned or
 * persisted by this service.
 */
export class CredoPresentationVerificationService {
  private readonly issuedCredentialRepository = new IssuedCredentialRepository()

  async verify(input: PlatformPresentationVerificationInput): Promise<PlatformPresentationVerificationResult> {
    const context = ssiTrustService.getProtocolContext(input.tenantId, input.requestId)

    if (!context.credoVerificationSessionId) {
      throw new Error('Presentation request is not bound to a Credo verification session')
    }

    if (context.queryLanguage !== 'pex_v2') {
      throw new Error(`Credo 0.5.15 adapter supports pex_v2 only; received ${context.queryLanguage}`)
    }

    const agent = input.request.agent
    const verifier = (agent.modules as any).openId4VcVerifier
    if (!verifier) throw new Error('OpenID4VP verifier module is not configured')

    try {
      const verificationResult = await verifier.verifyAuthorizationResponse({
        verificationSessionId: context.credoVerificationSessionId,
        authorizationResponse: {
          vp_token: input.verifiablePresentation,
          presentation_submission: input.presentationSubmission,
          state: input.state,
        },
      })

      const presentationExchange = verificationResult?.presentationExchange
      const presentations = Array.isArray(presentationExchange?.presentations)
        ? presentationExchange.presentations
        : []

      const credentials = presentations.flatMap((presentation: any) => {
        const values = presentation?.verifiableCredential
        return Array.isArray(values) ? values : [values].filter(Boolean)
      })
      const credentialCount = credentials.length

      const credentialIds = this.extractCredentialIds(credentials)
      const locallyRevoked = credentialIds.some((id) => this.issuedCredentialRepository.isRevoked(id))

      const statusResults = await Promise.all(
        credentials.map((credential: any) => credentialStatusService.resolve({
          credentialId: credential?.id || credential?.jti,
          credentialStatus: credential?.credentialStatus || credential?.vc?.credentialStatus,
          issuerRef: credential?.issuer?.id || credential?.issuer || credential?.vc?.issuer?.id || credential?.vc?.issuer,
        }))
      )

      const statusChecked = statusResults.length > 0 && statusResults.every((result) => result.checked)
      const statusInvalid = locallyRevoked || statusResults.some((result) => result.status === 'revoked' || result.status === 'suspended')

      const issuerRefs = this.extractIssuerRefs(credentials)
      const trust = issuerTrustService.evaluate(input.tenantId, issuerRefs)
      const trustVerified = trust.decision === 'trusted'

      // Successful Credo verification here means the persisted request session
      // accepted state/audience/nonce and its presentation verification callback
      // accepted the VP proof against the request's nonce and audience.
      const holderBindingVerified = presentations.length > 0
      const audienceVerified = true
      const nonceVerified = true
      const schemaVerified = Boolean(presentationExchange?.definition && presentationExchange?.submission)
      const verified =
        credentialCount > 0 &&
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
