/**
 * Client billing steps.
 *
 * `client.request_payment` sends the client a pay link by phone for the amount owed (a job's
 * invoice, or a quote for extra work) and pauses the run. The pay page (/pay/{code}) takes the
 * money, the client's wallet keeps the invoice and the receipt, and the paid link resumes the
 * run (PaymentLinkService.settlePaid). A declined quote cancels the run instead.
 *
 * `client.record_payment` is the step after the pause. It only lets the run continue once the
 * money is in; any other resume is rejected and the run stays waiting for the client.
 *
 * `external.cash_capture` is the counter-sale step: the money is already in the cashier's hand,
 * so the bill is created and marked paid in one go on the same rail.
 */

import type { WorkflowActionContext } from '../ActionRegistry'

import { DatabaseManager } from '../../../persistence/DatabaseManager'
import { getTenantById } from '../../../persistence/TenantRepository'
import { workflowRunRepository } from '../../../persistence/WorkflowRunRepository'
import { rootLogger } from '../../../utils/pinoLogger'
import { notificationService, type ContactNotificationResult } from '../../NotificationService'
import { AWAIT_CLIENT_PAYMENT, paymentLinkService } from '../../PaymentLinkService'
import { receivablePlanService, type PaymentTerms } from '../../ReceivablePlanService'

const logger = rootLogger.child({ module: 'ClientPaymentActions' })

const TRANSACTION_TYPES = new Set(['sale', 'fee_assessment', 'collection_plan'])
const COUNTER_METHODS = new Set(['cash', 'ecocash', 'pos'])

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function amountOwed(context: WorkflowActionContext): number {
  const total = Number(context.state.finance?.grandTotal)
  if (Number.isFinite(total) && total > 0) return total
  const amount = Number(context.input?.amount)
  return Number.isFinite(amount) && amount > 0 ? amount : 0
}

function itemsLine(items: unknown): string {
  if (!Array.isArray(items)) return ''
  return items
    .map((item: any) => text(item?.description))
    .filter(Boolean)
    .join(', ')
}

export class ClientPaymentActions {
  public static async requestPayment(context: WorkflowActionContext, config: any = {}): Promise<void> {
    if (context.state.clientBill?.linkId) {
      if (context.state.clientBill.status === 'paid') return
      context.state.pauseReason = AWAIT_CLIENT_PAYMENT
      throw new Error('WORKFLOW_PAUSE')
    }
    const input = context.input || {}
    const kind = config.kind === 'quote' ? 'quote' : 'invoice'
    const phone = text(input.payerPhone) || text(input.customerMsisdn) || text(input.buyerPhone)
    const amount = amountOwed(context)
    const currency = text(context.state.finance?.currency) || text(input.currency) || 'USD'
    const reference = text(input.reference)

    if (!phone || amount <= 0) {
      context.state.clientBill = {
        status: 'not_sent',
        kind,
        reason: !phone ? 'No client phone on the job' : 'Nothing to charge',
      }
      return
    }

    const merchantName = getTenantById(context.tenantId)?.label || undefined
    const what = itemsLine(input.items) || text(input.payerDescription) || text(input.description)
    // A run that owns its own debt (school fees) names the record type in its step config.
    const transactionType = TRANSACTION_TYPES.has(config.transactionType) ? config.transactionType : undefined
    const isFee = transactionType === 'fee_assessment'
    const studentName = text(input.studentName)
    const term = text(input.term)
    const description = isFee
      ? `School fees — ${studentName || 'student'}${term ? ` (${term})` : ''}`
      : kind === 'quote'
        ? `Quote${reference ? ` for job ${reference}` : ''}${what && what !== reference ? `: ${what}` : ''}`
        : `Invoice${reference ? ` for job ${reference}` : ''}`
    const payerName = text(input.payerName) || text(input.buyerName) || text(input.clientName)
    // The client's records keep one invoice per number, so each extra-work quote needs its own.
    const invoiceRef =
      reference && kind === 'quote'
        ? `${reference}-Q${String(context.runId || '')
            .slice(0, 4)
            .toUpperCase()}`
        : reference

    const requestedTerms = text(input.paymentTerms) as PaymentTerms
    const terms: PaymentTerms =
      kind === 'quote' || !['one_time', 'instalment', 'recurring'].includes(requestedTerms)
        ? 'one_time'
        : requestedTerms
    const parentRunId = text(input.parentRunId)
    const ownerRunId = parentRunId || (transactionType ? text(context.runId) : '')
    if (kind === 'invoice' && ownerRunId && !context.runId) {
      throw new Error('A billing workflow run is required to create the job payment plan')
    }
    const link = DatabaseManager.getDatabase().transaction(() => {
      const planned =
        kind === 'invoice' && ownerRunId
          ? receivablePlanService.createForJob({
              tenantId: context.tenantId,
              jobRunId: ownerRunId,
              billingRunId: context.runId!,
              title: description,
              reference: invoiceRef || reference || undefined,
              amount,
              currency,
              payerName,
              payerPhone: phone,
              terms,
              instalments: Number(input.instalments || 0) || undefined,
              cadence: text(input.paymentCadence) || undefined,
              firstDueDate: text(input.firstDueDate) || undefined,
              firstPaymentAmount: Number(input.firstPaymentAmount || 0) || undefined,
              merchantName,
              ...(transactionType ? { transactionType } : {}),
              ...(isFee
                ? {
                    sector: 'education',
                    linkMetadata: {
                      centre: 'school_fees',
                      studentName: studentName || undefined,
                      studentId: text(input.studentId) || undefined,
                      term: term || undefined,
                      feeType: text(input.feeType) || undefined,
                    },
                  }
                : {}),
            })
          : undefined
      const link =
        planned?.firstLink ||
        paymentLinkService.create({
          merchantId: context.tenantId,
          merchantName,
          description,
          amount,
          currency,
          invoiceRef: invoiceRef || undefined,
          payerPhone: phone,
          ttlHours: kind === 'quote' ? 168 : 336,
          metadata: { workflowRunId: context.runId, kind, reference, payerName, items: input.items },
        })

      context.state.clientBill = {
        status: 'delivery_failed',
        kind,
        linkId: link.id,
        code: link.shortlinkCode,
        url: link.shortlinkUrl,
        amount: link.amount,
        currency,
        paymentTerms: terms,
        planId: planned?.planId,
        instalments: planned?.obligationIds.length || 1,
        transactionId: planned?.transactionId,
      }
      context.state.pauseReason = AWAIT_CLIENT_PAYMENT
      context.state.pauseRequestedAt = new Date().toISOString()
      if (context.runId) {
        if (workflowRunRepository.findRunById(context.runId)) {
          workflowRunRepository.updateRun(context.runId, { output: context.state })
        }
      }
      return link
    })()
    let inboxItemId: string | undefined
    try {
      inboxItemId = paymentLinkService.offerToPayerInbox(link.id)
    } catch (error) {
      logger.warn({ err: error, runId: context.runId, linkId: link.id }, 'Could not put the bill in the client inbox')
    }
    let result: ContactNotificationResult
    try {
      result = await notificationService.dispatchContactNotification({
        tenantId: context.tenantId,
        inboxItemId,
        dedupeKey: `client-payment:${context.runId}:${link.id}`,
        contact: { name: payerName || 'there', phone },
        type: 'payment_link',
        url: link.shortlinkUrl,
        issuerName: merchantName,
        amount: link.amount,
        currency,
      })
    } catch (error) {
      logger.error({ err: error, runId: context.runId, linkId: link.id }, 'Client payment message failed')
      const notification = { accepted: false, channels: [], at: new Date().toISOString(), to: phone, renewed: false }
      paymentLinkService.recordDelivery(link.id, context.tenantId, notification)
      context.state.clientBill.notification = notification
      throw new Error('WORKFLOW_PAUSE')
    }
    const notification = { ...result, at: new Date().toISOString(), to: phone, renewed: false }
    paymentLinkService.recordDelivery(link.id, context.tenantId, notification)
    context.state.clientBill = {
      ...context.state.clientBill,
      status: result.accepted ? 'sent' : 'delivery_failed',
      notification,
      ...(result.accepted ? { sentAt: notification.at } : {}),
    }
    logger.info(
      { runId: context.runId, linkId: link.id, accepted: result.accepted },
      'Client payment message attempted',
    )
    throw new Error('WORKFLOW_PAUSE')
  }

  /**
   * `external.cash_capture`: the cashier took the money at the counter. The sale goes on the same
   * pay-link rail as every other bill (a link created and marked paid at once), so it shows in
   * Money in with its receipt and its amount owed is settled. Running the step again finds the
   * same link by its receipt number.
   */
  public static async captureCounterPayment(context: WorkflowActionContext, config: any = {}): Promise<void> {
    if (context.state.payment?.receiptId) return
    const input = context.input || {}
    const method = text(input.paymentMethod).toLowerCase()
    if (!COUNTER_METHODS.has(method)) throw new Error('Choose how the customer paid: cash, EcoCash or card.')
    const amount = amountOwed(context)
    if (amount <= 0) throw new Error('Enter the amount the customer paid.')
    const runId = text(context.runId)
    if (!runId) throw new Error('A counter sale needs a workflow run.')
    const cashierRef = text(input.cashierRef)
    if (config.requireCashierRef && !cashierRef) throw new Error('Enter the cashier reference.')
    const currency = text(context.state.finance?.currency) || text(input.currency) || 'USD'
    const buyerPhone = text(input.buyerPhone) || undefined
    const receiptId = `RCPT-${runId.replace(/-/g, '').slice(0, 10).toUpperCase()}`
    const what = itemsLine(input.items) || text(input.description)
    const description = `Counter sale${what ? `: ${what}` : ''}`
    const db = DatabaseManager.getDatabase()
    const existing = db
      .prepare(`SELECT id, shortlink_code AS code, shortlink_url AS url FROM payment_links WHERE merchant_id = ? AND invoice_ref = ?`)
      .get(context.tenantId, receiptId) as { id: string; code?: string; url?: string } | undefined
    const link =
      existing ||
      (() => {
        const created = paymentLinkService.create({
          merchantId: context.tenantId,
          merchantName: getTenantById(context.tenantId)?.label || undefined,
          description,
          amount,
          currency,
          invoiceRef: receiptId,
          payerPhone: buyerPhone,
          ttlHours: 24,
          metadata: {
            workflowRunId: runId,
            kind: 'invoice',
            centre: 'counter_sales',
            paymentMethod: method,
            cashierRef: cashierRef || undefined,
            items: input.items,
          },
        })
        return { id: created.id, code: created.shortlinkCode, url: created.shortlinkUrl }
      })()
    const paidAt = new Date().toISOString()
    await paymentLinkService.settlePaid(link.id, { reference: receiptId, payerPhone: buyerPhone, paidAt })
    context.state.clientBill = {
      status: 'paid',
      kind: 'invoice',
      linkId: link.id,
      code: link.code,
      url: link.url,
      amount,
      currency,
      paidAt,
      reference: receiptId,
      paymentMethod: method,
    }
    context.state.payment = {
      status: 'completed',
      receiptId,
      reference: receiptId,
      method,
      amount,
      currency,
      timestamp: paidAt,
      linkId: link.id,
    }
    logger.info({ runId, linkId: link.id, method }, 'Counter sale recorded')
  }

  public static async recordPayment(context: WorkflowActionContext): Promise<void> {
    const bill = context.state.clientBill
    if (!bill?.linkId || bill.status === 'paid') return
    const paid = context.input?.clientPayment
    if (paid?.status !== 'paid' || paid.linkId !== bill.linkId) {
      throw new Error('Waiting for the client to pay')
    }
    context.state.clientBill = { ...bill, status: 'paid', paidAt: paid.paidAt, reference: paid.reference }
    context.state.payment = {
      status: 'completed',
      reference: paid.reference || bill.code || bill.linkId,
      amount: bill.amount,
      currency: bill.currency,
      timestamp: paid.paidAt,
    }
    delete context.state.pauseReason
  }
}
