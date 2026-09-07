import type { TrustDecision } from './SsiTypes'

import { DatabaseManager } from '../../persistence/DatabaseManager'

export interface IssuerTrustResult {
  decision: TrustDecision
  trustedIssuerRefs: string[]
  untrustedIssuerRefs: string[]
}

export interface IssuerTrustEvaluationInput {
  tenantId: string
  issuerRefs: string[]
  verifierRef?: string
}

/**
 * SSI issuer trust is intentionally separate from the application's business
 * reputation/trust score. This service answers one question only: is an issuer
 * currently trusted by this organization's configured trust anchors?
 */
export class IssuerTrustService {
  public evaluate(input: IssuerTrustEvaluationInput): IssuerTrustResult {
    const issuerRefs = Array.from(new Set(input.issuerRefs.filter((value) => value && value.trim().length > 0)))
    if (issuerRefs.length === 0) {
      return { decision: 'unknown', trustedIssuerRefs: [], untrustedIssuerRefs: [] }
    }

    const db = DatabaseManager.getDatabase()
    const organization = db
      .prepare(
        `
      SELECT id
      FROM organizations
      WHERE tenant_id = ? AND status = 'active'
      LIMIT 1
    `,
      )
      .get(input.tenantId) as { id?: string } | undefined

    if (!organization?.id) {
      return { decision: 'unknown', trustedIssuerRefs: [], untrustedIssuerRefs: issuerRefs }
    }

    const verifier = input.verifierRef
      ? (db
          .prepare(
            `
        SELECT trust_anchor_id AS trustAnchorId, purpose_policy_ref AS purposePolicyRef
        FROM verifier_registrations
        WHERE organization_id = ?
          AND verifier_ref = ?
          AND status = 'active'
        LIMIT 1
      `,
          )
          .get(organization.id, input.verifierRef) as
          | { trustAnchorId?: string | null; purposePolicyRef?: string | null }
          | undefined)
      : undefined

    const placeholders = issuerRefs.map(() => '?').join(', ')
    const anchors = db
      .prepare(
        `
        SELECT id, subject_ref AS subjectRef, policy_ref AS policyRef
        FROM trust_anchors
        WHERE subject_ref IN (${placeholders})
          AND status = 'active'
          AND (organization_id = ? OR organization_id IS NULL)
          AND (valid_from IS NULL OR datetime(valid_from) <= datetime('now'))
          AND (valid_until IS NULL OR datetime(valid_until) > datetime('now'))
      `,
      )
      .all(...issuerRefs, organization.id) as Array<{ id: string; subjectRef: string; policyRef?: string | null }>

    const trusted = new Set<string>()
    for (const anchor of anchors) {
      if (verifier?.trustAnchorId && anchor.id !== verifier.trustAnchorId) {
        continue
      }

      if (verifier?.purposePolicyRef) {
        if (!anchor.policyRef || anchor.policyRef !== verifier.purposePolicyRef) {
          continue
        }
      }

      trusted.add(anchor.subjectRef)
    }

    const trustedIssuerRefs = issuerRefs.filter((issuer) => trusted.has(issuer))
    const untrustedIssuerRefs = issuerRefs.filter((issuer) => !trusted.has(issuer))

    return {
      decision: trustedIssuerRefs.length === issuerRefs.length ? 'trusted' : 'untrusted',
      trustedIssuerRefs,
      untrustedIssuerRefs,
    }
  }
}

export const issuerTrustService = new IssuerTrustService()
