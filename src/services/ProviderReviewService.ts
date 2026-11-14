/**
 * A public rating of a business. Only someone who has paid them, or whose request
 * they accepted, can leave one. One person has one rating per business.
 */
import { randomUUID } from 'crypto'

import { StatusException } from '../errors/StatusException'
import { DatabaseManager } from '../persistence/DatabaseManager'
import { organizationRegistryRepository } from '../persistence/OrganizationRegistryRepository'

export interface ReviewSummary {
  average: number | null
  count: number
  recent: Array<{ rating: number; comment?: string; at: string }>
}

export interface SavedReview {
  rating: number
  comment?: string
  updated: boolean
}

function cleanComment(value: unknown): string | undefined {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 400)
  return text || undefined
}

export class ProviderReviewService {
  summary(orgTenantId: string): ReviewSummary {
    const empty: ReviewSummary = { average: null, count: 0, recent: [] }
    try {
      const db = DatabaseManager.getDatabase()
      const row = db
        .prepare(`SELECT COUNT(*) AS n, AVG(rating) AS avg FROM provider_reviews WHERE org_tenant_id = ?`)
        .get(orgTenantId) as { n: number; avg: number | null }
      const recent = db
        .prepare(
          `SELECT rating, comment, updated_at FROM provider_reviews
            WHERE org_tenant_id = ? ORDER BY updated_at DESC LIMIT 10`,
        )
        .all(orgTenantId) as Array<{ rating: number; comment?: string | null; updated_at: string }>
      return {
        average: row.n ? Math.round(Number(row.avg) * 10) / 10 : null,
        count: Number(row.n || 0),
        recent: recent.map((item) => ({
          rating: item.rating,
          ...(item.comment ? { comment: item.comment } : {}),
          at: item.updated_at,
        })),
      }
    } catch {
      return empty
    }
  }

  /**
   * The signed-in person worked with this business: a paid bill of theirs, or a request
   * the business accepted. Staff of the business cannot rate it.
   */
  submit(authorTenantId: string, orgKey: string, rating: number, comment: unknown): SavedReview {
    const org =
      organizationRegistryRepository.findOrganizationById(orgKey) ||
      organizationRegistryRepository.findOrganizationByTenantId(orgKey)
    if (!org) throw new StatusException('Organisation not found', 404)
    const score = Math.round(Number(rating))
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      throw new StatusException('Choose a rating from 1 to 5.', 400)
    }
    const db = DatabaseManager.getDatabase()
    const staff = db
      .prepare(
        `SELECT 1 FROM org_memberships m
          JOIN ssi_users u ON u.id = m.user_id
          WHERE m.org_tenant_id = ? AND m.status = 'active' AND u.tenant_id = ?`,
      )
      .get(org.tenantId, authorTenantId)
    if (staff) throw new StatusException('You work at this business, so you cannot rate it.', 403)

    const payment = db
      .prepare(
        `SELECT p.id FROM payment_links p
          WHERE p.status = 'paid' AND p.merchant_id IN (?, ?)
            AND EXISTS (
              SELECT 1 FROM org_contacts c
              WHERE c.wallet_tenant_id = ?
                AND c.id = json_extract(p.metadata, '$.contactId')
            )
          LIMIT 1`,
      )
      .get(org.tenantId, org.id, authorTenantId) as { id: string } | undefined
    const request = payment
      ? undefined
      : (db
          .prepare(
            `SELECT id FROM workflow_requests
              WHERE requester_tenant_id = ? AND target_org_tenant_id = ?
                AND status IN ('approved', 'fulfilled')
              LIMIT 1`,
          )
          .get(authorTenantId, org.tenantId) as { id: string } | undefined)
    const proof = payment ? { kind: 'payment' as const, id: payment.id } : request ? { kind: 'request' as const, id: request.id } : undefined
    if (!proof) {
      throw new StatusException('You can rate a business after you have paid them or they have accepted your request.', 403)
    }

    const now = new Date().toISOString()
    const text = cleanComment(comment)
    const existing = db
      .prepare(`SELECT id FROM provider_reviews WHERE author_tenant_id = ? AND org_tenant_id = ?`)
      .get(authorTenantId, org.tenantId) as { id: string } | undefined
    if (existing) {
      db.prepare(
        `UPDATE provider_reviews
            SET rating = ?, comment = ?, proof_kind = ?, proof_id = ?, updated_at = ?
          WHERE id = ?`,
      ).run(score, text ?? null, proof.kind, proof.id, now, existing.id)
      return { rating: score, ...(text ? { comment: text } : {}), updated: true }
    }
    db.prepare(
      `INSERT INTO provider_reviews
        (id, org_tenant_id, author_tenant_id, rating, comment, proof_kind, proof_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(randomUUID(), org.tenantId, authorTenantId, score, text ?? null, proof.kind, proof.id, now, now)
    return { rating: score, ...(text ? { comment: text } : {}), updated: false }
  }
}

export const providerReviewService = new ProviderReviewService()
