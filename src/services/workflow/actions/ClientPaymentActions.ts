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
import { findContactByStoreNumber } from '../../../persistence/ContactRepository'
import { getTenantById } from '../../../persistence/TenantRepository'
import { workflowRunRepository } from '../../../persistence/WorkflowRunRepository'
import { rootLogger } from '../../../utils/pinoLogger'
import { notificationService, type ContactNotificationResult } from '../../NotificationService'
import { AWAIT_CLIENT_PAYMENT, paymentLinkService } from '../../PaymentLinkService'
import { ReconciliationService } from '../../ReconciliationService'
import { receivablePlanService, type PaymentTerms } from '../../ReceivablePlanService'
import { jobEventReference } from '../../WorkflowAuditService'
import { findWalletTenantByContact } from '../../ssi/walletLookup'
import { taxFromFinance } from '../../documentFacts'

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

/** The priced lines and the VAT from the price step, kept on the bill for its documents. */
function documentMetadata(context: WorkflowActionContext): Record<string, unknown> {
  const priced = context.state.finance?.lineItems
  const items = Array.isArray(priced) && priced.length ? priced : context.input?.items
  const tax = taxFromFinance(context.state.finance)
  // A job at a saved store stays on that store's bills, even when the number was typed 0772… or +263….
  const contactId = text(context.input?.storeNumber)
    ? findContactByStoreNumber(context.tenantId, text(context.input?.storeNumber))?.id
    : undefined
  return { ...(items ? { items } : {}), ...(tax ? { tax } : {}), ...(contactId ? { contactId } : {}) }
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
    const email = text(input.payerEmail) || text(input.clientEmail) || text(input.customerEmail)
    // An onboarded client gets the bill in their inbox even with no phone or email on the job.
    const clientWallet =
      text(input.clientWalletTenantId) || (phone || email ? findWalletTenantByContact(phone, email) : undefined)
    const amount = amountOwed(context)
    const currency = text(context.state.finance?.currency) || text(input.currency) || 'USD'
    const reference = text(input.reference)

    if ((!phone && !email && !clientWallet) || amount <= 0) {
      context.state.clientBill = {
        status: 'not_sent',
        kind,
        reason: amount <= 0 ? 'Nothing to charge' : 'No way to reach the client yet: add their mobile or email',
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
              payerPhone: phone || undefined,
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
                : { linkMetadata: documentMetadata(context) }),
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
          payerPhone: phone || undefined,
          ttlHours: kind === 'quote' ? 168 : 336,
          metadata: {
            workflowRunId: context.runId,
            kind,
            reference,
            payerName,
            ...(email ? { payerEmail: email } : {}),
            items: input.items,
            ...(isFee ? {} : documentMetadata(context)),
          },
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
    noteClientBillOnJob(context, { kind, amount: link.amount, currency, reference: invoiceRef || reference, terms })
    let inboxItemId: string | undefined
    try {
      inboxItemId = paymentLinkService.offerToPayerInbox(link.id, clientWallet ? { walletTenantId: clientWallet } : {})
    } catch (error) {
      logger.warn({ err: error, runId: context.runId, linkId: link.id }, 'Could not put the bill in the client inbox')
    }
    let result: ContactNotificationResult
    try {
      result = await notificationService.dispatchContactNotification({
        tenantId: context.tenantId,
        inboxItemId,
        dedupeKey: `client-payment:${context.runId}:${link.id}`,
        contact: { name: payerName || 'there', ...(phone ? { phone } : {}), ...(email ? { email } : {}) },
        type: 'payment_link',
        url: link.shortlinkUrl,
        issuerName: merchantName,
        amount: link.amount,
        currency,
      })
    } catch (error) {
      logger.error({ err: error, runId: context.runId, linkId: link.id }, 'Client payment message failed')
      const notification = { accepted: false, channels: [], at: new Date().toISOString(), to: phone || email, renewed: false }
      paymentLinkService.recordDelivery(link.id, context.tenantId, notification)
      context.state.clientBill.notification = notification
      throw new Error('WORKFLOW_PAUSE')
    }
    const notification = { ...result, at: new Date().toISOString(), to: phone || email, renewed: false }
    paymentLinkService.recordDelivery(link.id, context.tenantId, notification)
    // The bill card in an onboarded client's inbox is a delivery on its own.
    const delivered = result.accepted || Boolean(inboxItemId)
    context.state.clientBill = {
      ...context.state.clientBill,
      status: delivered ? 'sent' : 'delivery_failed',
      notification,
      ...(inboxItemId ? { inboxItemId } : {}),
      ...(delivered ? { sentAt: notification.at } : {}),
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
            ...documentMetadata(context),
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
    context.state.clientBill = {
      ...bill,
      status: 'paid',
      paidAt: paid.paidAt,
      reference: paid.reference,
      ...(paid.receiptId ? { receiptId: paid.receiptId } : {}),
    }
    context.state.payment = {
      status: 'completed',
      reference: paid.reference || bill.code || bill.linkId,
      amount: bill.amount,
      currency: bill.currency,
      timestamp: paid.paidAt,
      ...(paid.receiptId ? { receiptId: paid.receiptId } : {}),
    }
    delete context.state.pauseReason
    noteClientPaymentOnJob(context, bill, paid)
  }
}

/**
 * A field job's invoice payment belongs on that job's reconciliation trail.
 * Settlement is recorded here only when close left the job waiting for this invoice.
 * School fees, counter sales and quotes have no field-job parent, so they are unchanged.
 */
function fieldJobOf(context: WorkflowActionContext) {
  const parentRunId = text(context.input?.parentRunId)
  if (!parentRunId) return undefined
  const parent = workflowRunRepository.findRunById(parentRunId)
  if (!parent || parent.tenantId !== context.tenantId) return undefined
  const output = (parent.output && typeof parent.output === 'object' ? parent.output : {}) as Record<string, any>
  if (!output.workflowStage && !output.assignment) return undefined
  const providerRef = jobEventReference(parent.input, parent.id)
  return providerRef ? { parent, output, providerRef } : undefined
}

/** The invoice that went to the client, on the field job's reconciliation trail. */
function noteClientBillOnJob(
  context: WorkflowActionContext,
  bill: { kind: string; amount: number; currency: string; reference?: string; terms: string },
): void {
  if (bill.kind === 'quote') return
  const job = fieldJobOf(context)
  if (!job) return
  new ReconciliationService().recordEvent(job.providerRef, 'INVOICE_ISSUED', 'payment_link', {
    tenantId: job.parent.tenantId,
    amount: bill.amount,
    currency: bill.currency,
    reference: bill.reference,
    paymentTerms: bill.terms,
    kind: 'client_invoice',
  })
}

function noteClientPaymentOnJob(
  context: WorkflowActionContext,
  bill: { kind?: string; amount?: number; currency?: string },
  paid: { reference?: string; paidAt?: string; receiptId?: string },
): void {
  if (bill.kind === 'quote') return
  const job = fieldJobOf(context)
  if (!job) return
  const { parent, output, providerRef } = job
  const recon = new ReconciliationService()
  const base = {
    tenantId: parent.tenantId,
    amount: bill.amount,
    currency: bill.currency,
    reference: paid.reference,
    kind: 'client_invoice',
  }
  recon.recordEvent(providerRef, 'PAYMENT_SUCCESS', 'payment_link', base)
  if (paid.receiptId) {
    recon.recordEvent(providerRef, 'RECEIPT_ISSUED', 'payment_link', { ...base, receiptId: paid.receiptId })
  }
  if (output.reconciliation?.status !== 'awaiting_payment') return
  // The job closes once the client has paid and has their receipt.
  if (!paid.receiptId) {
    workflowRunRepository.updateRun(parent.id, {
      output: { ...output, reconciliation: { ...output.reconciliation, status: 'awaiting_receipt' } },
    })
    return
  }
  recon.recordEvent(providerRef, 'SETTLEMENT_CONFIRMED', 'payment_link', base)
  workflowRunRepository.updateRun(parent.id, {
    output: {
      ...output,
      reconciliation: {
        ...(output.reconciliation || {}),
        status: 'reconciled',
        settledAt: paid.paidAt || new Date().toISOString(),
        receiptId: paid.receiptId,
      },
    },
  })
}
