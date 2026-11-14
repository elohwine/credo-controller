/**
 * Offers a person asked a business to send them. Separate from WhatsApp alert
 * preferences: a different table, and nothing is sent on the alert template.
 * Saving an offer records who asked. It does not message anyone. Sending on
 * WhatsApp needs a marketing template, which is not turned on.
 * STOP on the business number turns offers off as well as alerts.
 */
import { randomUUID } from 'crypto'

import { StatusException } from '../errors/StatusException'
import { DatabaseManager } from '../persistence/DatabaseManager'
import { organizationRegistryRepository } from '../persistence/OrganizationRegistryRepository'
import { phoneHashCandidates } from './ssi/contactHash'
import { orgOfferingsService } from './OrgOfferingsService'
import { normalizeNotificationPhone } from './WhatsAppSenderService'

export interface OfferPreference {
  enabled: boolean
}

export interface SavedBroadcast {
  audienceCount: number
  status: 'saved'
  note: string
}

export interface BroadcastResult {
  /** No offer saved yet. */
  saved: boolean
  savedAt?: string
  audienceCount: number
  /** People who asked for offers and then sent this business a request within a week of the offer. */
  askedAfter: number
  note: string
}

const DAY_MS = 24 * 60 * 60 * 1000
const RESULT_WINDOW_DAYS = 7

export class MarketingService {
  setOptIn(userId: string, tenantId: string, orgKey: string, phone: string, enabled: boolean): OfferPreference {
    const org =
      organizationRegistryRepository.findOrganizationById(orgKey) ||
      organizationRegistryRepository.findOrganizationByTenantId(orgKey)
    if (!org) throw new StatusException('Organisation not found', 404)
    const normalised = normalizeNotificationPhone(phone)
    const db = DatabaseManager.getDatabase()
    const user = db.prepare(`SELECT phone_hash FROM ssi_users WHERE id = ? OR tenant_id = ?`).get(userId, tenantId) as
      | { phone_hash?: string }
      | undefined
    if (!user?.phone_hash || !phoneHashCandidates(normalised).includes(user.phone_hash)) {
      throw new StatusException('Use the phone number on your account.', 403)
    }
    db.prepare(
      `INSERT INTO marketing_opt_ins (org_tenant_id, phone, enabled, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(org_tenant_id, phone) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`,
    ).run(org.tenantId, normalised, enabled ? 1 : 0, new Date().toISOString())
    return { enabled }
  }

  /** Called after alert opt-out has already succeeded. A failure here must not undo that. */
  optOutPhone(phone: string): void {
    const normalised = normalizeNotificationPhone(phone)
    DatabaseManager.getDatabase()
      .prepare(`UPDATE marketing_opt_ins SET enabled = 0, updated_at = ? WHERE phone = ?`)
      .run(new Date().toISOString(), normalised)
  }

  send(userId: string, orgTenantId: string, message: unknown): SavedBroadcast {
    orgOfferingsService.assertManager(userId, orgTenantId)
    const body = String(message ?? '').trim().replace(/\s+/g, ' ')
    if (body.length < 2 || body.length > 400) {
      throw new StatusException('Write the offer in a sentence or two.', 400)
    }
    const db = DatabaseManager.getDatabase()
    const since = new Date(Date.now() - DAY_MS).toISOString()
    const recent = db
      .prepare(`SELECT 1 FROM broadcasts WHERE org_tenant_id = ? AND created_at > ? LIMIT 1`)
      .get(orgTenantId, since)
    if (recent) throw new StatusException('You already saved an offer today. Try again tomorrow.', 429)
    const audience = db
      .prepare(`SELECT COUNT(*) AS n FROM marketing_opt_ins WHERE org_tenant_id = ? AND enabled = 1`)
      .get(orgTenantId) as { n: number }
    const audienceCount = Number(audience?.n || 0)
    if (audienceCount === 0) throw new StatusException('Nobody has asked for offers from you yet.', 400)
    db.prepare(
      `INSERT INTO broadcasts (id, org_tenant_id, body, audience_count, status, created_by, created_at)
       VALUES (?, ?, ?, ?, 'saved', ?, ?)`,
    ).run(randomUUID(), orgTenantId, body, audienceCount, userId, new Date().toISOString())
    return {
      audienceCount,
      status: 'saved',
      note: `Saved. ${audienceCount} ${audienceCount === 1 ? 'person has' : 'people have'} asked for offers. Nobody was messaged. Offers on WhatsApp need a marketing template, which is not turned on.`,
    }
  }

  /**
   * What followed the latest offer: of the people who asked for offers, how many sent this
   * business a request in the week after it was saved. Counts only; nobody is named.
   */
  latestResult(userId: string, orgTenantId: string): BroadcastResult {
    orgOfferingsService.assertManager(userId, orgTenantId)
    const db = DatabaseManager.getDatabase()
    const latest = db
      .prepare(`SELECT audience_count, created_at FROM broadcasts WHERE org_tenant_id = ? ORDER BY created_at DESC LIMIT 1`)
      .get(orgTenantId) as { audience_count: number; created_at: string } | undefined
    if (!latest) return { saved: false, audienceCount: 0, askedAfter: 0, note: 'No offer saved yet.' }
    const phones = db
      .prepare(`SELECT phone FROM marketing_opt_ins WHERE org_tenant_id = ? LIMIT 500`)
      .all(orgTenantId) as Array<{ phone: string }>
    const hashes = Array.from(new Set(phones.flatMap((row) => phoneHashCandidates(normalizeNotificationPhone(row.phone)))))
    let askedAfter = 0
    if (hashes.length) {
      const until = new Date(new Date(latest.created_at).getTime() + RESULT_WINDOW_DAYS * DAY_MS).toISOString()
      const found = db
        .prepare(
          `SELECT COUNT(DISTINCT r.requester_tenant_id) AS n
             FROM workflow_requests r JOIN ssi_users u ON u.tenant_id = r.requester_tenant_id
            WHERE r.target_org_tenant_id = ? AND r.created_at >= ? AND r.created_at < ?
              AND u.phone_hash IN (${hashes.map(() => '?').join(',')})`,
        )
        .get(orgTenantId, latest.created_at, until, ...hashes) as { n: number }
      askedAfter = Number(found?.n || 0)
    }
    const audienceCount = Number(latest.audience_count || 0)
    return {
      saved: true,
      savedAt: latest.created_at,
      audienceCount,
      askedAfter,
      note: `After your last offer, ${askedAfter} of the ${audienceCount} ${audienceCount === 1 ? 'person' : 'people'} who asked for offers sent you a request within ${RESULT_WINDOW_DAYS} days. Nobody was messaged.`,
    }
  }
}

export const marketingService = new MarketingService()
