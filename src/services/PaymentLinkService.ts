/**
 * PaymentLinkService — one place that writes a payment link (row + short link) and settles it.
 *
 * Used by the merchant API (PaymentLinkController) and by the `client.request_payment`
 * workflow step, which bills a job's client by phone and waits for the money. When a link that
 * belongs to a waiting run is paid, the run continues; when the client declines a quote, the
 * run is cancelled so the job it came from stops waiting.
 */

import type { Database } from 'better-sqlite3'

import { v4 as uuidv4 } from 'uuid'

import { StatusException } from '../errors'
import { DatabaseManager } from '../persistence/DatabaseManager'
import { workflowRunRepository } from '../persistence/WorkflowRunRepository'
import { rootLogger } from '../utils/pinoLogger'

import { businessTransactionService } from './BusinessTransactionService'
import { notificationService, type ContactNotificationResult } from './NotificationService'
import { ShortlinkService } from './ShortlinkService'

const logger = rootLogger.child({ module: 'PaymentLinkService' })

export const AWAIT_CLIENT_PAYMENT = 'await_client_payment'

export interface PaymentLinkDelivery extends ContactNotificationResult {
  at: string
  to: string
  renewed: boolean
  actedByUserId?: string
}

export interface NewPaymentLink {
  merchantId: string
  merchantName?: string
  description: string
  amount: number
  currency?: string
  invoiceRef?: string
  sector?: string
  payerPhone?: string
  ttlHours?: number
  metadata?: Record<string, unknown>
  /** Reuse an existing commercial centre/debt when this is another collection attempt. */
  transactionId?: string
  obligationId?: string
  obligationSourceType?: string
  obligationSourceId?: string
}

export interface CreatedPaymentLink {
  id: string
  merchantId: string
  merchantName?: string
  description: string
  amount: number
  currency: string
  invoiceRef?: string
  status: 'active'
  sector: string
  expiry: string
  shortlinkCode: string
  shortlinkUrl: string
  createdAt: string
}

function metadataOf(raw: unknown): Record<string, any> {
  if (!raw) return {}
  if (typeof raw === 'object') return raw as Record<string, any>
  try {
    const parsed = JSON.parse(String(raw))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export class PaymentLinkService {
  public async resend(
    linkId: string,
    merchantId: string,
    contact: { payerName?: string; payerPhone?: string },
    renew = false,
    actedByUserId?: string,
  ): Promise<{ linkId: string; url: string; notification: PaymentLinkDelivery }> {
    const db = DatabaseManager.getDatabase()
    const link = db.prepare('SELECT * FROM payment_links WHERE id = ? AND merchant_id = ?').get(linkId, merchantId) as
      | {
          status: string
          expiry: string
          payer_phone?: string
          metadata: string
          shortlink_url: string
          amount: number
          currency: string
          description: string
          merchant_name?: string
          sector?: string
        }
      | undefined
    if (!link) throw new StatusException('Payment link not found', 404)
    if (['paid', 'cancelled'].includes(link.status))
      throw new StatusException('Paid or cancelled links cannot be sent again', 409)
    if (!renew && (link.status === 'expired' || new Date(link.expiry).getTime() <= Date.now())) {
      throw new StatusException('This payment link has expired. Renew it before sending.', 409)
    }
    const metadata = metadataOf(link.metadata)
    const payerPhone = (contact.payerPhone ?? link.payer_phone ?? '').trim()
    const payerName = (contact.payerName ?? (typeof metadata.payerName === 'string' ? metadata.payerName : '')).trim()
    if (!/^\+?[1-9]\d{6,14}$/.test(payerPhone))
      throw new StatusException('Enter a valid client mobile in international format', 400)
    if (!payerName) throw new StatusException('Enter the client name', 400)
    let url = link.shortlink_url
    db.transaction(() => {
      if (renew) {
        const next = ShortlinkService.createPaymentLink(
          linkId,
          {
            amount: link.amount,
            currency: link.currency,
            description: link.description,
            merchantName: link.merchant_name,
            sector: link.sector,
          },
          336,
        )
        db.prepare(`DELETE FROM shortlinks WHERE type = 'payment' AND target_id = ? AND code <> ?`).run(
          linkId,
          next.code,
        )
        db.prepare(
          `UPDATE payment_links SET status = 'active', expiry = ?, shortlink_code = ?, shortlink_url = ? WHERE id = ? AND merchant_id = ?`,
        ).run(next.expiresAt, next.code, next.url, linkId, merchantId)
        url = next.url
      }
      db.prepare(
        `UPDATE payment_links SET payer_phone = ?, metadata = ?, updated_at = ? WHERE id = ? AND merchant_id = ?`,
      ).run(payerPhone, JSON.stringify({ ...metadata, payerName }), new Date().toISOString(), linkId, merchantId)
    })()
    let result: ContactNotificationResult
    try {
      result = await notificationService.dispatchContactNotification({
        tenantId: merchantId,
        dedupeKey: `payment_link:${linkId}`,
        contact: { name: payerName, phone: payerPhone },
        type: 'payment_link',
        url,
        issuerName: link.merchant_name,
        amount: link.amount,
        currency: link.currency,
      })
    } catch (error) {
      logger.error({ err: error, linkId, merchantId }, 'Payment link notification failed')
      const failed: PaymentLinkDelivery = {
        accepted: false,
        channels: [],
        at: new Date().toISOString(),
        to: payerPhone,
        renewed: renew,
        actedByUserId,
      }
      this.recordDelivery(linkId, merchantId, failed)
      throw error
    }
    const notification: PaymentLinkDelivery = {
      ...result,
      at: new Date().toISOString(),
      to: payerPhone,
      renewed: renew,
      actedByUserId,
    }
    this.recordDelivery(linkId, merchantId, notification)
    return { linkId, url, notification }
  }

  public recordDelivery(linkId: string, merchantId: string, notification: PaymentLinkDelivery): void {
    const db = DatabaseManager.getDatabase()
    const row = db
      .prepare('SELECT metadata FROM payment_links WHERE id = ? AND merchant_id = ?')
      .get(linkId, merchantId) as { metadata: string } | undefined
    if (!row) throw new StatusException('Payment link not found', 404)
    const metadata = metadataOf(row.metadata)
    const history = Array.isArray(metadata.deliveryHistory) ? metadata.deliveryHistory : []
    db.prepare('UPDATE payment_links SET metadata = ?, updated_at = ? WHERE id = ? AND merchant_id = ?').run(
      JSON.stringify({ ...metadata, notification, deliveryHistory: [...history, notification] }),
      notification.at,
      linkId,
      merchantId,
    )
  }

  /** Insert the link row and its short link. Callers that need a transaction pass their db and wrap the call. */
  public create(input: NewPaymentLink, db: Database = DatabaseManager.getDatabase()): CreatedPaymentLink {
    const id = uuidv4()
    const ttlHours = input.ttlHours ?? 336
    const currency = input.currency || 'USD'
    const sector = input.sector || 'general'
    const { code, url } = ShortlinkService.createPaymentLink(
      id,
      { amount: input.amount, currency, description: input.description, merchantName: input.merchantName, sector },
      ttlHours,
    )
    const now = new Date().toISOString()
    const expiry = new Date(Date.now() + ttlHours * 3600_000).toISOString()
    db.prepare(
      `INSERT INTO payment_links
         (id, merchant_id, merchant_name, description, amount, currency, invoice_ref,
          sector, status, expiry, payer_phone, shortlink_code, shortlink_url, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.merchantId,
      input.merchantName ?? null,
      input.description,
      input.amount,
      currency,
      input.invoiceRef ?? null,
      sector,
      expiry,
      input.payerPhone ?? null,
      code,
      url,
      JSON.stringify(input.metadata ?? {}),
      now,
      now,
    )
    const metadata = input.metadata ?? {}
    const runId = typeof metadata.workflowRunId === 'string' ? metadata.workflowRunId : undefined
    const run = runId ? workflowRunRepository.findRunById(runId) : undefined
    const parentRunId = typeof run?.input?.parentRunId === 'string' ? run.input.parentRunId : undefined
    const reference = input.invoiceRef || (typeof metadata.reference === 'string' ? metadata.reference : undefined)
    let transactionId: string
    if (input.transactionId) {
      transactionId = input.transactionId
    } else if (parentRunId && metadata.kind !== 'quote') {
      transactionId = businessTransactionService.ensureTransaction({
        tenantId: input.merchantId,
        transactionType: 'field_job',
        sourceType: 'workflow_run',
        sourceId: parentRunId,
        title: reference ? `Job ${reference}` : 'Field job',
        reference,
      })
      businessTransactionService.link(transactionId, 'workflow_run', runId!, 'billing')
    } else {
      let parentTransactionId: string | undefined
      if (parentRunId) {
        parentTransactionId = businessTransactionService.ensureTransaction({
          tenantId: input.merchantId,
          transactionType: 'field_job',
          sourceType: 'workflow_run',
          sourceId: parentRunId,
          title: reference ? `Job ${reference}` : 'Field job',
          reference,
        })
      }
      transactionId = businessTransactionService.ensureTransaction({
        tenantId: input.merchantId,
        transactionType: 'sale',
        sourceType: runId ? 'workflow_run' : 'payment_link',
        sourceId: runId || id,
        title: input.description,
        reference,
        parentTransactionId,
        metadata: { kind: metadata.kind || 'invoice' },
      })
    }
    const obligationId =
      input.obligationId ||
      businessTransactionService.ensureObligation({
        transactionId,
        tenantId: input.merchantId,
        direction: 'receivable',
        sourceType:
          input.obligationSourceType || (parentRunId && metadata.kind !== 'quote' ? 'job_bill' : 'payment_link'),
        sourceId: input.obligationSourceId || (parentRunId && metadata.kind !== 'quote' ? parentRunId : id),
        description: input.description,
        amount: input.amount,
        currency,
        dueDate: expiry,
        counterpartyName: typeof metadata.payerName === 'string' ? metadata.payerName : undefined,
        metadata: { invoiceRef: input.invoiceRef, workflowRunId: runId },
      })
    db.prepare(`UPDATE payment_links SET business_transaction_id = ?, obligation_id = ? WHERE id = ?`).run(
      transactionId,
      obligationId,
      id,
    )
    businessTransactionService.link(transactionId, 'payment_link', id, 'collection_attempt')
    return {
      id,
      merchantId: input.merchantId,
      merchantName: input.merchantName,
      description: input.description,
      amount: input.amount,
      currency,
      invoiceRef: input.invoiceRef,
      status: 'active',
      sector,
      expiry,
      shortlinkCode: code,
      shortlinkUrl: url,
      createdAt: now,
    }
  }

  public find(linkId: string): { id: string; status: string; metadata: Record<string, any> } | undefined {
    const row = DatabaseManager.getDatabase()
      .prepare(`SELECT id, status, metadata FROM payment_links WHERE id = ?`)
      .get(linkId) as { id: string; status: string; metadata: string | null } | undefined
    return row ? { id: row.id, status: row.status, metadata: metadataOf(row.metadata) } : undefined
  }

  /** The run that waits on this link, if it is still waiting for the client. */
  private waitingRun(linkId: string) {
    const link = this.find(linkId)
    const runId = typeof link?.metadata.workflowRunId === 'string' ? link.metadata.workflowRunId : undefined
    if (!link || !runId) return undefined
    const run = workflowRunRepository.findRunById(runId)
    const state = (run?.output && typeof run.output === 'object' ? run.output : {}) as Record<string, any>
    if (run?.status !== 'paused' || state.pauseReason !== AWAIT_CLIENT_PAYMENT || state.clientBill?.linkId !== linkId)
      return undefined
    return { link, run }
  }

  /** Money is in: mark the link paid and let the waiting run continue. Safe to call twice. */
  public async settlePaid(
    linkId: string,
    payment: { reference?: string; payerPhone?: string; paidAt?: string },
  ): Promise<void> {
    const paidAt = payment.paidAt || new Date().toISOString()
    DatabaseManager.getDatabase()
      .prepare(
        `UPDATE payment_links SET status = 'paid', paid_at = COALESCE(paid_at, ?), provider_ref = COALESCE(provider_ref, ?),
           payer_phone = COALESCE(payer_phone, ?), updated_at = ? WHERE id = ?`,
      )
      .run(paidAt, payment.reference ?? null, payment.payerPhone ?? null, new Date().toISOString(), linkId)
    const obligation = DatabaseManager.getDatabase()
      .prepare(`SELECT obligation_id AS obligationId, amount, currency FROM payment_links WHERE id = ?`)
      .get(linkId) as { obligationId?: string | null; amount: number; currency: string } | undefined
    if (obligation?.obligationId) {
      businessTransactionService.allocateSettlement({
        obligationId: obligation.obligationId,
        settlementType: 'payment_link',
        settlementId: linkId,
        amount: Number(obligation.amount || 0),
        currency: obligation.currency,
        metadata: { linkId, paidAt },
      })
    }
    const waiting = this.waitingRun(linkId)
    if (!waiting) return
    const { workflowService } = await import('./WorkflowService')
    try {
      const resumed = await workflowService.resumeWorkflow(waiting.run.id, {
        clientPayment: { status: 'paid', linkId, reference: payment.reference, paidAt },
      })
    } catch (error: any) {
      throw error
    }
  }

  /** The client said no to a quote: close the link and end the run that waited on it. */
  public async decline(linkId: string, reason?: string): Promise<boolean> {
    const link = this.find(linkId)
    if (!link || link.status === 'paid') return false
    DatabaseManager.getDatabase()
      .prepare(`UPDATE payment_links SET status = 'cancelled', updated_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), linkId)
    const waiting = this.waitingRun(linkId)
    if (waiting) {
      const { workflowService } = await import('./WorkflowService')
      await workflowService.cancelRun(waiting.run.id, {
        clientDecision: 'declined',
        reason: reason || 'The client declined',
      })
    }
    logger.info({ linkId, runId: waiting?.run.id }, 'Client declined the payment link')
    return true
  }

  /** Cancel one attempt. The debt survives unless the caller explicitly cancels the bill/plan. */
  public cancelAttempt(linkId: string, cancelDebt = false): boolean {
    const db = DatabaseManager.getDatabase()
    const row = db.prepare(`SELECT obligation_id AS obligationId FROM payment_links WHERE id = ?`).get(linkId) as
      | { obligationId?: string | null }
      | undefined
    const result = db
      .prepare(`UPDATE payment_links SET status = 'cancelled', updated_at = ? WHERE id = ? AND status = 'active'`)
      .run(new Date().toISOString(), linkId)
    if (cancelDebt && row?.obligationId) businessTransactionService.setObligationStatus(row.obligationId, 'cancelled')
    return result.changes > 0
  }
}

export const paymentLinkService = new PaymentLinkService()
