import { DatabaseManager } from '../../persistence/DatabaseManager'
import type { TrustDecision } from './SsiTypes'

export interface IssuerTrustResult {
  decision: TrustDecision
  trustedIssuerRefs: string[]
  untrustedIssuerRefs: string[]
}

/**
 * SSI issuer trust is intentionally separate from the application's business
 * reputation/trust score. This service answers one question only: is an issuer
 * currently trusted by this organization's configured trust anchors?
 */
export class IssuerTrustService {
  public evaluate(tenantId: string, issuerRefs: string[]): IssuerTrustResult {
    if (issuerRefs.length === 0) {
      return { decision: 'unknown', trustedIssuerRefs: [], untrustedIssuerRefs: [] }
    }

    const db = DatabaseManager.getDatabase()
    const organization = db.prepare(`
      SELECT id
      FROM organizations
      WHERE tenant_id = ? AND status = 'active'
      LIMIT 1
    `).get(tenantId) as { id?: string } | undefined

    if (!organization?.id) {
      return { decision: 'unknown', trustedIssuerRefs: [], untrustedIssuerRefs: issuerRefs }
    }

    const trusted = new Set<string>()
    for (const issuerRef of issuerRefs) {
      const row = db.prepare(`
        SELECT 1
        FROM trust_anchors
        WHERE subject_ref = ?
          AND status = 'active'
          AND (organization_id = ? OR organization_id IS NULL)
          AND (valid_from IS NULL OR datetime(valid_from) <= datetime('now'))
          AND (valid_until IS NULL OR datetime(valid_until) > datetime('now'))
        LIMIT 1
      `).get(issuerRef, organization.id) as { 1?: number } | undefined
      if (row) trusted.add(issuerRef)
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
