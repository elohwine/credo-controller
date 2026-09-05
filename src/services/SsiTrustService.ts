import { createHash, randomUUID } from 'crypto'
import { DatabaseManager } from '../persistence/DatabaseManager'
import { authorizationService } from './AuthorizationService'

export interface PresentationRequestInput {
  tenantId: string
  requesterSubjectRef: string
  verifierRef: string
  purposeCode: string
  purposeTextRef?: string
  queryLanguage?: 'dcql'
  queryRef: string
  transactionRef?: string
  expiresAt: string
}

export interface PresentationConsentInput {
  requestId: string
  tenantId: string
  holderSubjectRef: string
  decision: 'approved' | 'declined'
  requestedCategories: string[]
  disclosedCategories?: string[]
  privacyNoticeRef?: string
  consentVersion: string
}

/**
 * Verification results are intentionally an internal integration contract.
 * Public callers must never be allowed to assert that a presentation was
 * cryptographically verified; that result must come from the Credo verifier.
 */
export interface PresentationVerificationInput {
  requestId: string
  tenantId: string
  verified: boolean
  issuerRefs?: string[]
  credentialTypeRefs?: string[]
  claimCategories?: string[]
  holderBindingVerified?: boolean
  trustVerified?: boolean
  statusVerified?: boolean
  schemaVerified?: boolean
  audienceVerified?: boolean
  nonceVerified?: boolean
  resultCode?: string
  evidenceDigest?: string
}

/**
 * Reference-first SSI trust service.
 *
 * Raw VCs, SD-JWTs and VPs stay inside Credo/wallet/protocol processing.
 * This service persists only the minimum metadata required by the business
 * application to explain a trust decision or a holder consent decision.
 */
export class SsiTrustService {
  private resolveOrganization(tenantId: string): string {
    const db = DatabaseManager.getDatabase()
    const row = db.prepare(`
      SELECT id FROM organizations
      WHERE tenant_id = ? AND status = 'active'
      LIMIT 1
    `).get(tenantId) as { id?: string } | undefined

    if (!row?.id) throw new Error('Organization context not found')
    return row.id
  }

  private resolvePerson(tenantId: string, subjectRef: string): { organizationId: string; personId: string } {
    const organizationId = this.resolveOrganization(tenantId)
    const db = DatabaseManager.getDatabase()
    const row = db.prepare(`
      SELECT p.id
      FROM people p
      JOIN organization_memberships m
        ON m.person_id = p.id
       AND m.organization_id = p.organization_id
      WHERE p.organization_id = ?
        AND p.subject_ref = ?
        AND p.status = 'active'
        AND m.membership_status = 'active'
      LIMIT 1
    `).get(organizationId, subjectRef) as { id?: string } | undefined

    if (!row?.id) throw new Error('Authenticated subject is not an active organization member')
    return { organizationId, personId: row.id }
  }

  createPresentationRequest(input: PresentationRequestInput) {
    const { organizationId, personId } = this.resolvePerson(input.tenantId, input.requesterSubjectRef)
    const expiresAt = new Date(input.expiresAt)
    const now = Date.now()

    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now) {
      throw new Error('Presentation request expiry must be a valid future timestamp')
    }

    const maxExpiry = now + 24 * 60 * 60 * 1000
    if (expiresAt.getTime() > maxExpiry) {
      throw new Error('Presentation request lifetime exceeds the platform maximum')
    }

    const db = DatabaseManager.getDatabase()
    const verifier = db.prepare(`
      SELECT id
      FROM verifier_registrations
      WHERE organization_id = ?
        AND verifier_ref = ?
        AND status = 'active'
      LIMIT 1
    `).get(organizationId, input.verifierRef) as { id?: string } | undefined

    if (!verifier?.id) throw new Error('Verifier is not registered for this organization')

    const authorization = authorizationService.decide({
      tenantId: input.tenantId,
      personId,
      action: 'presentation.request',
      requiredPermission: 'presentation.request',
      resourceType: 'presentation_request',
    })

    if (authorization.decision !== 'allow') {
      throw new Error(`Insufficient authority: ${authorization.reasonCode}`)
    }

    const requestId = randomUUID()
    db.prepare(`
      INSERT INTO presentation_requests (
        id, organization_id, requester_person_id, verifier_ref, purpose_code, purpose_text_ref,
        query_language, query_ref, transaction_ref, status, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(
      requestId,
      organizationId,
      personId,
      input.verifierRef,
      input.purposeCode,
      input.purposeTextRef ?? null,
      input.queryLanguage ?? 'dcql',
      input.queryRef,
      input.transactionRef ?? null,
      expiresAt.toISOString()
    )

    return { requestId, expiresAt: expiresAt.toISOString() }
  }

  recordConsent(input: PresentationConsentInput) {
    const { organizationId, personId } = this.resolvePerson(input.tenantId, input.holderSubjectRef)
    const db = DatabaseManager.getDatabase()

    const request = db.prepare(`
      SELECT id, status, expires_at AS expiresAt
      FROM presentation_requests
      WHERE id = ? AND organization_id = ?
      LIMIT 1
    `).get(input.requestId, organizationId) as {
      id?: string
      status?: string
      expiresAt?: string
    } | undefined

    if (!request?.id) throw new Error('Presentation request not found')
    if (request.status !== 'pending') throw new Error('Presentation request is no longer pending')
    if (!request.expiresAt || new Date(request.expiresAt).getTime() <= Date.now()) {
      throw new Error('Presentation request has expired')
    }

    const requested = new Set(input.requestedCategories)
    const disclosedCategories = input.decision === 'approved'
      ? (input.disclosedCategories ?? input.requestedCategories)
      : []

    if (disclosedCategories.some(category => !requested.has(category))) {
      throw new Error('Disclosed categories must be a subset of requested categories')
    }

    const consentId = randomUUID()
    db.transaction(() => {
      db.prepare(`
        INSERT INTO presentation_consents (
          id, presentation_request_id, holder_person_id, decision,
          requested_categories_json, disclosed_categories_json,
          privacy_notice_ref, consent_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        consentId,
        input.requestId,
        personId,
        input.decision,
        JSON.stringify(input.requestedCategories),
        JSON.stringify(disclosedCategories),
        input.privacyNoticeRef ?? null,
        input.consentVersion
      )

      db.prepare(`
        UPDATE presentation_requests
        SET status = ?, completed_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'pending'
      `).run(input.decision, input.requestId)
    })()

    return {
      consentId,
      requestId: input.requestId,
      decision: input.decision,
      disclosedCategories
    }
  }

  /**
   * Internal-only method. Call this only after the Credo verifier has produced
   * the verification result from an actual OpenID4VP presentation response.
   */
  recordVerification(input: PresentationVerificationInput) {
    const organizationId = this.resolveOrganization(input.tenantId)
    const db = DatabaseManager.getDatabase()

    const request = db.prepare(`
      SELECT id, expires_at AS expiresAt
      FROM presentation_requests
      WHERE id = ? AND organization_id = ?
      LIMIT 1
    `).get(input.requestId, organizationId) as { id?: string; expiresAt?: string } | undefined

    if (!request?.id) throw new Error('Presentation request not found')
    if (!request.expiresAt || new Date(request.expiresAt).getTime() <= Date.now()) {
      throw new Error('Presentation request has expired')
    }

    if (input.verified) {
      const requiredChecks = [
        input.holderBindingVerified,
        input.trustVerified,
        input.statusVerified,
        input.schemaVerified,
      ]
      if (requiredChecks.some(check => check !== true)) {
        throw new Error('Verified presentation is missing required verifier checks')
      }
    }

    const evidenceDigest = input.evidenceDigest || this.createEvidenceDigest(input)
    const resultId = randomUUID()

    db.prepare(`
      INSERT INTO presentation_results (
        id, presentation_request_id, verified,
        issuer_refs_json, credential_type_refs_json, claim_categories_json,
        holder_binding_verified, trust_verified, status_verified,
        schema_verified, audience_verified, nonce_verified,
        result_code, evidence_digest
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      resultId,
      input.requestId,
      input.verified ? 1 : 0,
      JSON.stringify(input.issuerRefs ?? []),
      JSON.stringify(input.credentialTypeRefs ?? []),
      JSON.stringify(input.claimCategories ?? []),
      input.holderBindingVerified == null ? null : (input.holderBindingVerified ? 1 : 0),
      input.trustVerified == null ? null : (input.trustVerified ? 1 : 0),
      input.statusVerified == null ? null : (input.statusVerified ? 1 : 0),
      input.schemaVerified == null ? null : (input.schemaVerified ? 1 : 0),
      input.audienceVerified == null ? null : (input.audienceVerified ? 1 : 0),
      input.nonceVerified == null ? null : (input.nonceVerified ? 1 : 0),
      input.resultCode ?? (input.verified ? 'verified' : 'verification_failed'),
      evidenceDigest
    )

    return { resultId, verified: input.verified, evidenceDigest }
  }

  private createEvidenceDigest(input: PresentationVerificationInput): string {
    const canonical = JSON.stringify({
      requestId: input.requestId,
      verified: input.verified,
      issuerRefs: input.issuerRefs ?? [],
      credentialTypeRefs: input.credentialTypeRefs ?? [],
      claimCategories: input.claimCategories ?? [],
      holderBindingVerified: input.holderBindingVerified ?? null,
      trustVerified: input.trustVerified ?? null,
      statusVerified: input.statusVerified ?? null,
      schemaVerified: input.schemaVerified ?? null,
      audienceVerified: input.audienceVerified ?? null,
      nonceVerified: input.nonceVerified ?? null,
      resultCode: input.resultCode ?? null
    })
    return createHash('sha256').update(canonical).digest('hex')
  }
}

export const ssiTrustService = new SsiTrustService()