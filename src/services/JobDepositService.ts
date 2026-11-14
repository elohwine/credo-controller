/**
 * A deposit on a quote that came from matching a business.
 * The customer pays the business through the same payment link as any other bill.
 * Credentis does not hold the money. "The job is done" is the business saying so,
 * and they cannot say so while the customer says the work was not done.
 * Field-job payouts, purchases, fees and every other request are untouched:
 * this only runs when the request was created from a provider match.
 */
import { StatusException } from '../errors/StatusException'
import { DatabaseManager } from '../persistence/DatabaseManager'
import { workflowRequestRepository, type WorkflowRequest } from '../persistence/WorkflowRequestRepository'
import type { CreatedPaymentLink, NewPaymentLink } from './PaymentLinkService'

export type DepositStatus = 'not_opened' | 'awaiting_payment' | 'paid' | 'disputed' | 'acknowledged'

export interface JobDepositView {
  requestId: string
  available: boolean
  amount?: number
  currency?: string
  status?: DepositStatus
  payUrl?: string
  disputeReason?: string
  /** Why the business was asked, saved when the match sent the request. */
  matchReasons?: string[]
  note: string
}

/**
 * The bill is created by the existing payment-link service. Loaded when a deposit
 * is opened, so the rest of this file can be tested without that module.
 */
export const jobDepositLinks: { create: (input: NewPaymentLink) => CreatedPaymentLink } = {
  create: (input) => {
    const { paymentLinkService } = require('./PaymentLinkService') as typeof import('./PaymentLinkService')
    return paymentLinkService.create(input)
  },
}

const NOTE: Record<DepositStatus, string> = {
  not_opened: 'You can pay the business the price they set. The payment goes to them. Credentis does not hold it.',
  awaiting_payment: 'This payment goes to the business when it is paid. Credentis does not hold it.',
  paid: 'The business has the payment. Say if the work was not done.',
  disputed: 'The work was marked not done. The business cannot mark the job done until this is settled.',
  acknowledged: 'The business marked the job done.',
}

interface DepositRow {
  request_id: string
  org_tenant_id: string
  author_tenant_id: string
  payment_link_id: string
  amount: number
  currency: string
  status: 'awaiting_payment' | 'paid' | 'disputed' | 'acknowledged'
  dispute_reason?: string | null
}

function payloadOf(request: WorkflowRequest): Record<string, unknown> {
  return request.payload && typeof request.payload === 'object' ? request.payload : {}
}

function isMatchQuote(request: WorkflowRequest): boolean {
  return payloadOf(request).source === 'provider_match'
}

export class JobDepositService {
  view(requestId: string, callerTenantId: string, callerUserId?: string): JobDepositView {
    const request = workflowRequestRepository.findById(requestId)
    if (!request || !isMatchQuote(request)) return { requestId, available: false, note: '' }
    this.assertParty(request, callerTenantId, callerUserId)
    const saved = payloadOf(request).matchReasons
    const matchReasons = Array.isArray(saved) ? saved.map(String).filter(Boolean).slice(0, 8) : []
    const why = matchReasons.length ? { matchReasons } : {}
    const row = this.refresh(requestId)
    if (!row) {
      const amount = this.price(request)
      return {
        requestId,
        available: true,
        ...(amount ? { amount: amount.amount, currency: amount.currency } : {}),
        status: 'not_opened',
        ...why,
        note: amount ? NOTE.not_opened : 'The business has not set a price yet.',
      }
    }
    return { ...this.toView(row), ...why }
  }

  /** The customer asks for the payment link. Paying it pays the business. */
  open(requestId: string, callerTenantId: string): JobDepositView {
    const request = this.requireMatch(requestId)
    if (request.requesterTenantId !== callerTenantId) {
      throw new StatusException('Only the person who asked can pay this.', 403)
    }
    if (request.status !== 'approved') {
      throw new StatusException('The business has to accept the request and set a price first.', 400)
    }
    const existing = this.refresh(requestId)
    if (existing) return this.toView(existing)
    const price = this.price(request)
    if (!price) throw new StatusException('The business has not set a price yet.', 400)
    const payload = payloadOf(request)
    const title = typeof payload.title === 'string' && payload.title.trim() ? payload.title.trim() : 'this job'
    const created = jobDepositLinks.create({
      merchantId: request.targetOrgTenantId,
      description: `Deposit — ${title}`,
      amount: price.amount,
      currency: price.currency,
      metadata: { kind: 'job_deposit', requestId },
    })
    const now = new Date().toISOString()
    DatabaseManager.getDatabase()
      .prepare(
        `INSERT INTO job_deposits
           (request_id, org_tenant_id, author_tenant_id, payment_link_id, amount, currency, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'awaiting_payment', ?, ?)`,
      )
      .run(requestId, request.targetOrgTenantId, callerTenantId, created.id, price.amount, price.currency, now, now)
    return this.view(requestId, callerTenantId)
  }

  dispute(requestId: string, callerTenantId: string, reason: unknown): JobDepositView {
    const request = this.requireMatch(requestId)
    if (request.requesterTenantId !== callerTenantId) {
      throw new StatusException('Only the person who asked can say the work was not done.', 403)
    }
    const row = this.refresh(requestId)
    if (!row || row.status !== 'paid') {
      throw new StatusException('You can say the work was not done after the business has the payment.', 400)
    }
    const text = String(reason ?? '').trim().replace(/\s+/g, ' ')
    if (text.length < 8 || text.length > 400) {
      throw new StatusException('Say what was not done, in a sentence.', 400)
    }
    this.setStatus(requestId, 'disputed', text)
    return this.view(requestId, callerTenantId)
  }

  /** The customer withdraws the dispute. The payment stays with the business. */
  settle(requestId: string, callerTenantId: string): JobDepositView {
    const request = this.requireMatch(requestId)
    if (request.requesterTenantId !== callerTenantId) {
      throw new StatusException('Only the person who asked can settle this.', 403)
    }
    const row = this.refresh(requestId)
    if (!row || row.status !== 'disputed') throw new StatusException('There is nothing to settle.', 400)
    this.setStatus(requestId, 'paid', null)
    return this.view(requestId, callerTenantId)
  }

  /** The business says the job is done. Refused while the customer says it was not. */
  acknowledge(requestId: string, callerUserId: string): JobDepositView {
    const request = this.requireMatch(requestId)
    this.assertManager(callerUserId, request.targetOrgTenantId)
    const row = this.refresh(requestId)
    if (!row || row.status === 'awaiting_payment') {
      throw new StatusException('The payment has not arrived yet.', 400)
    }
    if (row.status === 'disputed') {
      throw new StatusException('Settle the dispute before you mark the job done.', 400)
    }
    if (row.status !== 'acknowledged') this.setStatus(requestId, 'acknowledged', row.dispute_reason ?? null)
    return this.toView(this.refresh(requestId)!)
  }

  private requireMatch(requestId: string): WorkflowRequest {
    const request = workflowRequestRepository.findById(requestId)
    if (!request || !isMatchQuote(request)) {
      throw new StatusException('This request does not take a deposit.', 404)
    }
    return request
  }

  private assertParty(request: WorkflowRequest, callerTenantId: string, callerUserId?: string): void {
    if (request.requesterTenantId === callerTenantId) return
    if (callerUserId && this.memberRole(callerUserId, request.targetOrgTenantId)) return
    throw new StatusException('This request is not yours.', 403)
  }

  private memberRole(userId: string, orgTenantId: string): string | undefined {
    const row = DatabaseManager.getDatabase()
      .prepare(
        `SELECT role FROM org_memberships WHERE user_id = ? AND org_tenant_id = ? AND status = 'active' LIMIT 1`,
      )
      .get(userId, orgTenantId) as { role?: string } | undefined
    return row?.role
  }

  private assertManager(userId: string, orgTenantId: string): void {
    const role = this.memberRole(userId, orgTenantId)
    if (role !== 'owner' && role !== 'admin') {
      throw new StatusException('Only an owner or admin of this business can mark the job done.', 403)
    }
  }

  private price(request: WorkflowRequest): { amount: number; currency: string } | undefined {
    const payload = payloadOf(request)
    const amount = Number(payload.totalAmount ?? payload.amount)
    if (!Number.isFinite(amount) || amount <= 0) return undefined
    const currency = typeof payload.currency === 'string' && payload.currency.trim() ? payload.currency.trim() : 'USD'
    return { amount, currency: currency.toUpperCase() }
  }

  private refresh(requestId: string): DepositRow | undefined {
    const db = DatabaseManager.getDatabase()
    const row = db.prepare(`SELECT * FROM job_deposits WHERE request_id = ?`).get(requestId) as DepositRow | undefined
    if (!row || row.status !== 'awaiting_payment') return row
    const link = db.prepare(`SELECT status FROM payment_links WHERE id = ?`).get(row.payment_link_id) as
      | { status?: string }
      | undefined
    if (link?.status !== 'paid') return row
    this.setStatus(requestId, 'paid', null)
    return { ...row, status: 'paid' }
  }

  private setStatus(requestId: string, status: DepositRow['status'], reason: string | null): void {
    DatabaseManager.getDatabase()
      .prepare(`UPDATE job_deposits SET status = ?, dispute_reason = ?, updated_at = ? WHERE request_id = ?`)
      .run(status, reason, new Date().toISOString(), requestId)
  }

  private toView(row: DepositRow): JobDepositView {
    const link = DatabaseManager.getDatabase()
      .prepare(`SELECT shortlink_url FROM payment_links WHERE id = ?`)
      .get(row.payment_link_id) as { shortlink_url?: string } | undefined
    return {
      requestId: row.request_id,
      available: true,
      amount: row.amount,
      currency: row.currency,
      status: row.status,
      ...(link?.shortlink_url ? { payUrl: link.shortlink_url } : {}),
      ...(row.dispute_reason ? { disputeReason: row.dispute_reason } : {}),
      note: NOTE[row.status],
    }
  }
}

export const jobDepositService = new JobDepositService()
