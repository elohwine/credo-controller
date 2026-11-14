/**
 * A person messages the business number and gets businesses that fit, in that same chat.
 * This is a reply to the message they just sent. It does not opt them in to alerts,
 * and alerts stay on consented templates. STOP is handled before this runs.
 * "status" (or "my requests") answers with the sender's own latest requests instead,
 * found by the phone on their account; a number with no account gets none.
 */
import { randomUUID } from 'crypto'

import { DatabaseManager } from '../persistence/DatabaseManager'
import { organizationRegistryRepository } from '../persistence/OrganizationRegistryRepository'
import { rootLogger } from '../utils/pinoLogger'

import { orgOfferingsService } from './OrgOfferingsService'
import { describeRequest, readRequest } from './providerMatch'
import { phoneHashCandidates } from './ssi/contactHash'
import { normalizeNotificationPhone, whatsAppSenderService } from './WhatsAppSenderService'

const logger = rootLogger.child({ module: 'WhatsAppInquiry' })

export function findPageUrl(need: string): string {
  const base = (process.env.PUBLIC_BASE_URL || process.env.WALLET_PUBLIC_URL || '').replace(/\/+$/, '')
  const path = `/find?need=${encodeURIComponent(need)}`
  return base ? `${base}${path}` : path
}

export function inquiryReply(
  need: string,
  matches: Array<{ name: string; reasons: string[]; standing?: { verified: string; live: string }; offer?: string }>,
  understood?: string,
): string {
  const heard = understood ? `Looking for: ${understood}` : ''
  if (!matches.length) {
    return [heard, 'No business matched that. Try a trade and a place, for example: plumber in Borrowdale.'].filter(Boolean).join('\n')
  }
  const lines = matches.slice(0, 3).map((match) => {
    const why = match.reasons.slice(0, 2).join('. ')
    const check = match.standing ? `${match.standing.verified} ${match.standing.live}` : ''
    const offer = match.offer ? `Offer: ${match.offer}` : ''
    return [match.name, why, check, offer].filter(Boolean).join('. ') + '.'
  })
  return [
    heard,
    `${matches.length === 1 ? '1 business' : `${Math.min(matches.length, 3)} businesses`} can help:`,
    ...lines,
    `Open the list: ${findPageUrl(need)}`,
  ]
    .filter(Boolean)
    .join('\n')
}

const STATUS_WORDS: Record<string, string> = {
  pending: 'waiting for the business',
  approved: 'accepted',
  rejected: 'declined',
  fulfilled: 'done',
  cancelled: 'cancelled',
  expired: 'expired',
}

/** "status", "my requests", "track": the person wants their own requests, not a search. */
export function isStatusAsk(text: string): boolean {
  return /^(status|track|tracking|my requests?|my orders?|where is my (order|request|job))\??$/i.test(text.trim())
}

export function statusReply(
  requests: Array<{ title: string; business: string; status: string; price?: string }>,
): string {
  if (!requests.length) {
    return 'No requests found for this number. Requests you send in the Credentis app show here.'
  }
  const lines = requests.map((request) => {
    const word = STATUS_WORDS[request.status] || 'in progress'
    return `${request.title} with ${request.business}: ${word}${request.price ? `, ${request.price}` : ''}.`
  })
  return ['Your latest requests:', ...lines, 'Open My requests in the Credentis app for the details.'].join('\n')
}

/** The latest requests of the account whose phone sent the message. Empty when no account has it. */
export function latestRequestsForPhone(phone: string, limit = 3) {
  const db = DatabaseManager.getDatabase()
  const hashes = phoneHashCandidates(normalizeNotificationPhone(phone))
  if (!hashes.length) return []
  const user = db
    .prepare(`SELECT tenant_id FROM ssi_users WHERE phone_hash IN (${hashes.map(() => '?').join(',')}) LIMIT 1`)
    .get(...hashes) as { tenant_id?: string } | undefined
  if (!user?.tenant_id) return []
  const rows = db
    .prepare(
      `SELECT target_org_tenant_id, request_type, status, payload FROM workflow_requests
        WHERE requester_tenant_id = ? ORDER BY created_at DESC LIMIT ?`,
    )
    .all(user.tenant_id, limit) as Array<{ target_org_tenant_id: string; request_type: string; status: string; payload: string }>
  return rows.map((row) => {
    let payload: any = {}
    try {
      payload = JSON.parse(row.payload || '{}')
    } catch {
      payload = {}
    }
    const amount = Number(payload.totalAmount ?? payload.amount)
    const business = organizationRegistryRepository.findOrganizationByTenantId(row.target_org_tenant_id)?.displayName || 'the business'
    return {
      title: String(payload.title || '').trim() || 'Your request',
      business,
      status: row.status,
      ...(row.status === 'approved' && Number.isFinite(amount) && amount > 0
        ? { price: `${String(payload.currency || 'USD').toUpperCase()} ${amount}` }
        : {}),
    }
  })
}

export class WhatsAppInquiryService {
  /**
   * Answer one inbound text. The same message id is answered once.
   * Returns without sending when the words are a stop request.
   */
  async handle(input: { senderKey: string; messageId: string; from: string; text: string }): Promise<{ status: string }> {
    const text = String(input.text || '').trim()
    if (/^(stop|unsubscribe|cancel)$/i.test(text)) return { status: 'ignored' }
    const need = text.replace(/\s+/g, ' ').slice(0, 200)
    const db = DatabaseManager.getDatabase()
    const id = randomUUID()
    const inserted = db
      .prepare(
        `INSERT OR IGNORE INTO whatsapp_inquiries
          (id, sender_key, message_id, phone, need, match_count, reply_status, created_at)
          VALUES (?, ?, ?, ?, ?, 0, 'pending', ?)`,
      )
      .run(id, input.senderKey, input.messageId, String(input.from || '').replace(/\D/g, '').slice(0, 20), need, new Date().toISOString())
    if (!inserted.changes) return { status: 'duplicate' }

    const tracking = isStatusAsk(need)
    const asked = readRequest(need)
    const matches =
      tracking || asked.need.length < 2
        ? []
        : orgOfferingsService.match({ need: asked.need, area: asked.area, payment: asked.payment, fulfilment: asked.fulfilment, limit: 3 })
    const body = tracking
      ? statusReply(latestRequestsForPhone(input.from))
      : need.length < 2
        ? 'Say what you need, for example: a plumber in Borrowdale.'
        : inquiryReply(need, matches, describeRequest(asked))
    let replyStatus = 'held'
    try {
      replyStatus = await whatsAppSenderService.sendSessionReply(input.senderKey, input.from, body)
    } catch (error) {
      replyStatus = 'failed'
      logger.warn({ messageId: input.messageId, senderKey: input.senderKey }, 'WhatsApp inquiry reply failed')
    }
    db.prepare(`UPDATE whatsapp_inquiries SET match_count = ?, reply_status = ? WHERE sender_key = ? AND message_id = ?`).run(
      matches.length,
      replyStatus,
      input.senderKey,
      input.messageId,
    )
    return { status: replyStatus }
  }
}

export const whatsAppInquiryService = new WhatsAppInquiryService()
