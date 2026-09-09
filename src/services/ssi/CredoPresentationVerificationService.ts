import type { SsiEvidenceInput } from './SsiTypes'
import type { Request as ExRequest } from 'express'

import { Agent } from '@credo-ts/core'
import { container } from 'tsyringe'

import { CredentialReferenceRepository } from '../../persistence/CredentialReferenceRepository'
import { DatabaseManager } from '../../persistence/DatabaseManager'
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
  ssiEvidence: SsiEvidenceInput[]
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
  private readonly credentialReferenceRepository = new CredentialReferenceRepository()

  public async verify(input: PlatformPresentationVerificationInput): Promise<PlatformPresentationVerificationResult> {
    const context = ssiTrustService.getProtocolContext(input.tenantId, input.requestId)
    const registration = ssiTrustService.getVerifierRegistration(input.tenantId, context.verifierRef)

    if (!context.credoVerificationSessionId) {
      throw new Error('Presentation request is not bound to a Credo verification session')
    }

    if (context.protocolState !== input.state) {
      throw new Error('OpenID4VP state does not match the stored presentation request')
    }

    if (context.protocol !== 'openid4vp') {
      throw new Error(`Unsupported presentation protocol: ${context.protocol}`)
    }

    const { verificationAgent, release } = await this.resolveVerificationAgent(input)
    const verifier = (verificationAgent as any)?.openid4vc?.verifier || (verificationAgent.modules as any).openId4VcVerifier
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

      const verificationSession = verificationResult?.verificationSession
      const protocolVerified = verificationSession?.state === 'ResponseVerified'
      const verifierBound = verificationSession?.verifierId === registration.credoVerifierIdRef
      const responseState = verificationSession?.authorizationResponsePayload?.state
      const stateBound = typeof responseState === 'string' ? responseState === input.state : true

      const requestPayload = this.decodeJwtPayload(verificationSession?.authorizationRequestJwt)
      const expectedAudience = typeof requestPayload?.client_id === 'string' ? requestPayload.client_id : undefined
      const expectedNonce = typeof requestPayload?.nonce === 'string' ? requestPayload.nonce : undefined

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
      const statusRequest = {
        agent: verificationAgent,
        logger: input.request.logger,
      } as ExRequest

      const statusResults = await Promise.all(
        credentials.map((credential: any) =>
          credentialStatusService.resolve({
            credentialId: credential?.id || credential?.jti || credential?.vc?.id,
            credentialStatus: credential?.credentialStatus || credential?.vc?.credentialStatus,
            issuerRef: this.extractIssuerRef(credential),
            request: statusRequest,
          }),
        ),
      )

      const statusChecked = statusResults.length > 0 && statusResults.every((result) => result.checked)
      const statusInvalid =
        locallyRevoked || statusResults.some((result) => result.status === 'revoked' || result.status === 'suspended')

      const issuerRefs = this.extractIssuerRefs(credentials)
      const trust = issuerTrustService.evaluate({
        tenantId: input.tenantId,
        issuerRefs,
        verifierRef: context.verifierRef,
      })
      const trustVerified = trust.decision === 'trusted'

      const ssiEvidence = this.buildSsiEvidence(input.tenantId, credentials, statusResults, trust.trustedIssuerRefs)

      const querySatisfied = this.isQuerySatisfied(verifiedResponse, isDcql)
      const schemaVerified = protocolVerified && querySatisfied
      const holderBindingVerified = protocolVerified && verifierBound && stateBound && presentations.length > 0
      const audienceVerified = protocolVerified && verifierBound && stateBound && !!expectedAudience
      const nonceVerified = protocolVerified && verifierBound && stateBound && !!expectedNonce

      const verified =
        protocolVerified &&
        verifierBound &&
        stateBound &&
        !statusInvalid &&
        holderBindingVerified &&
        audienceVerified &&
        nonceVerified &&
        schemaVerified &&
        trustVerified &&
        statusChecked

      const reasonCode = verified
        ? 'verified'
        : !protocolVerified
          ? 'protocol_verification_failed'
          : !verifierBound
            ? 'verifier_session_mismatch'
            : !stateBound
              ? 'protocol_state_mismatch'
              : !schemaVerified
                ? 'presentation_query_not_satisfied'
                : trust.decision !== 'trusted'
                  ? 'issuer_untrusted'
                  : !statusChecked
                    ? 'credential_status_unverified'
                    : statusInvalid
                      ? 'credential_status_invalid'
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
        ssiEvidence,
      }
    } catch {
      return this.recordFailure(input, 'verification_failed')
    } finally {
      await release()
    }
  }

  private async resolveVerificationAgent(input: PlatformPresentationVerificationInput): Promise<{
    verificationAgent: Agent<any>
    release: () => Promise<void>
  }> {
    const fallbackAgent = input.request.agent as Agent<any> | undefined
    const rootAgent = container.resolve(Agent as unknown as new (...args: any[]) => Agent<any>)
    const hasTenantsModule = 'tenants' in (rootAgent.modules as Record<string, unknown>)

    if (!hasTenantsModule) {
      const verificationAgent = fallbackAgent ?? rootAgent
      return {
        verificationAgent,
        release: async () => {},
      }
    }

    const tenantAgent = await (rootAgent.modules as any).tenants.getTenantAgent({ tenantId: input.tenantId })
    return {
      verificationAgent: tenantAgent,
      release: async () => {
        if (typeof tenantAgent.endSession === 'function') {
          await tenantAgent.endSession()
        }
      },
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
      ssiEvidence: [] as SsiEvidenceInput[],
    }
  }

  private extractPresentations(verifiedResponse: any, isDcql: boolean): unknown[] {
    if (!verifiedResponse) return []
    if (!isDcql) return Array.isArray(verifiedResponse.presentations) ? verifiedResponse.presentations : []

    return Object.values(verifiedResponse.presentations ?? {}).flatMap((values: any) =>
      Array.isArray(values) ? values : [values],
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

  private decodeJwtPayload(jwt?: string): Record<string, unknown> | undefined {
    if (!jwt) return undefined

    const parts = jwt.split('.')
    if (parts.length !== 3) return undefined

    try {
      return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>
    } catch {
      return undefined
    }
  }

  private isQuerySatisfied(verifiedResponse: unknown, isDcql: boolean): boolean {
    if (!verifiedResponse || typeof verifiedResponse !== 'object') return false
    const value: any = verifiedResponse

    if (isDcql) {
      const matchedGroups = Object.values(value.presentations ?? {})
      return matchedGroups.some((group) => (Array.isArray(group) ? group.length > 0 : !!group))
    }

    return Array.isArray(value.presentations) && value.presentations.length > 0
  }

  private buildSsiEvidence(
    tenantId: string,
    credentials: unknown[],
    statusResults: Array<{ status: string; checked: boolean; statusListCredential?: string }>,
    trustedIssuerRefs: string[],
  ): SsiEvidenceInput[] {
    const trustedSet = new Set(trustedIssuerRefs)
    const organizationId = this.resolveOrganizationId(tenantId)

    return credentials.map((credential: any, index) => {
      const issuerRef = this.extractIssuerRef(credential)
      const credentialTypes = this.extractCredentialTypes([credential])
      const credentialType = credentialTypes[0] ?? 'VerifiableCredential'
      const statusResult = statusResults[index]
      const externalRef = credential?.id || credential?.jti || credential?.vc?.id

      const ref = organizationId
        ? this.credentialReferenceRepository.upsert({
            organizationId,
            credentialType,
            issuerRef,
            status: (statusResult?.status ?? 'unknown') as any,
            lastVerifiedAt: new Date().toISOString(),
            externalRef: externalRef ? String(externalRef) : undefined,
          })
        : null

      return {
        credentialType,
        issuerRef,
        status: (statusResult?.status ?? 'unknown') as any,
        isTrustedIssuer: issuerRef ? trustedSet.has(issuerRef) : false,
        credentialReferenceId: ref?.id ?? '',
      }
    })
  }

  private resolveOrganizationId(tenantId: string): string | undefined {
    try {
      const db = (DatabaseManager as any).getDatabase?.()
      if (!db) return undefined
      const row = db
        .prepare('SELECT id FROM organizations WHERE tenant_id = ? AND status = ? LIMIT 1')
        .get(tenantId, 'active') as { id?: string } | undefined
      return row?.id
    } catch {
      return undefined
    }
  }
}

export const credoPresentationVerificationService = new CredoPresentationVerificationService()
