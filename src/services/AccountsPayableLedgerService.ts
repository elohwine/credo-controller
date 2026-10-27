/**
 * The payables ledger (suppliers, their bills, the payments against them) as the purchase
 * chain writes it.
 *
 * A purchase order marked delivered carries the supplier bill number and amount; that bill is
 * recorded here against the supplier named on the purchase. The supplier payment request
 * marked paid records the payment against that bill. Both keep the request id and the job
 * reference, so the Supplier bills tab can say where a bill came from and the request shows
 * its bill. The Accounts Payable API writes the same tables by hand and shares the ledger
 * events from here.
 */

import { createHash, randomUUID } from 'crypto'

import { StatusException } from '../errors'
import { DatabaseManager } from '../persistence/DatabaseManager'
import { rootLogger } from '../utils/pinoLogger'

import { businessTransactionService } from './BusinessTransactionService'
import { outboxService } from './OutboxService'

const logger = rootLogger.child({ module: 'AccountsPayableLedgerService' })

export interface LedgerBillSummary {
  billId: string
  invoiceRef: string
  supplierId: string
  supplierName: string
  amount: number
  balanceDue: number
  currency: string
  status: string
  transactionId?: string
  obligationId?: string
  obligationStatus?: string
  settledAmount?: number
  matchStatus?: string
  matchNote?: string
  /** The request that recorded the bill (the purchase order). */
  sourceRequestId: string
  /** The job or project the purchase was raised for. */
  projectRef?: string
  recordedAt: string
  payments: Array<{
    paymentId: string
    amount: number
    reference?: string
    method?: string
    paidAt: string
    sourceRequestId?: string
  }>
}

export function emitApPaymentEventOutbox(params: {
  paymentId: string
  invoiceId: string
  buyerTenantId: string
  supplierId: string
  amountPaid: number
  currency: string
  remainingBalance: number
  invoiceStatus: 'partial' | 'paid'
  paidAt: string
  reference?: string | null
  paymentMethod?: string | null
}): void {
  const payload = {
    paymentId: params.paymentId,
    invoiceId: params.invoiceId,
    buyerTenantId: params.buyerTenantId,
    supplierId: params.supplierId,
    amountPaid: params.amountPaid,
    currency: params.currency,
    remainingBalance: params.remainingBalance,
    invoiceStatus: params.invoiceStatus,
    paidAt: params.paidAt,
    reference: params.reference ?? null,
    paymentMethod: params.paymentMethod ?? null,
    emittedAt: new Date().toISOString(),
  }

  outboxService.enqueue({
    topic: 'finance.ap.payment.recorded',
    aggregateKey: params.invoiceId,
    dedupeKey: `ap:payment:${params.paymentId}`,
    payload,
  })
}

export function emitApInvoiceStateEventOutbox(params: {
  invoiceId: string
  buyerTenantId: string
  supplierId: string
  status: 'partial' | 'paid'
  balanceDue: number
  triggeredByPaymentId: string
  updatedAt: string
}): void {
  outboxService.enqueue({
    topic: 'finance.ap.invoice.state.changed',
    aggregateKey: params.invoiceId,
    dedupeKey: `ap:invoice-state:${params.invoiceId}:${params.triggeredByPaymentId}:${params.status}:${params.balanceDue}`,
    payload: {
      invoiceId: params.invoiceId,
      buyerTenantId: params.buyerTenantId,
      supplierId: params.supplierId,
      status: params.status,
      balanceDue: params.balanceDue,
      triggeredByPaymentId: params.triggeredByPaymentId,
      updatedAt: params.updatedAt,
      emittedAt: new Date().toISOString(),
    },
  })
}

const NO_SUPPLIER = new Set(['', 'tbd', 'none', 'n/a', 'na', 'unassigned', 'unknown', '-', 'null'])

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim()
}

function money(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : undefined
}

export class AccountsPayableLedgerService {
  /** Every request in the same chain as this one: the root purchase and everything under it. */
  private chainIds(requestId: string): string[] {
    const db = DatabaseManager.getDatabase()
    let root = requestId
    for (let depth = 0; depth < 8; depth += 1) {
      const row = db.prepare(`SELECT parent_request_id AS parentId FROM requests WHERE id = ?`).get(root) as
        | { parentId?: string | null }
        | undefined
      if (!row?.parentId) break
      root = row.parentId
    }
    const rows = db
      .prepare(
        `WITH RECURSIVE chain(id, depth) AS (
           SELECT id, 0 FROM requests WHERE id = ?
           UNION ALL
           SELECT r.id, chain.depth + 1 FROM requests r JOIN chain ON r.parent_request_id = chain.id WHERE chain.depth < 8
         )
         SELECT id FROM chain`,
      )
      .all(root) as Array<{ id: string }>
    return rows.map((row) => row.id)
  }

  /** The job reference, kept on the purchase that started the chain. */
  private projectRefFor(requestId: string, context: Record<string, unknown>): string | undefined {
    const own = text(context.projectRef)
    if (own) return own
    const db = DatabaseManager.getDatabase()
    let current = requestId
    for (let depth = 0; depth < 8; depth += 1) {
      const row = db.prepare(`SELECT parent_request_id AS parentId FROM requests WHERE id = ?`).get(current) as
        | { parentId?: string | null }
        | undefined
      if (!row?.parentId) return undefined
      const parent = db.prepare(`SELECT context_json AS contextJson FROM requests WHERE id = ?`).get(row.parentId) as
        | { contextJson?: string }
        | undefined
      let parentContext: Record<string, unknown> = {}
      try {
        parentContext = JSON.parse(parent?.contextJson || '{}') as Record<string, unknown>
      } catch {
        parentContext = {}
      }
      const ref = text(parentContext.projectRef)
      if (ref) return ref
      current = row.parentId
    }
    return undefined
  }

  /** The supplier by name for this organisation, created when it is new. */
  public ensureSupplier(buyerTenantId: string, supplierName: string): { id: string; supplierName: string } {
    const db = DatabaseManager.getDatabase()
    const name = text(supplierName)
    const existing = db
      .prepare(
        `SELECT id, supplier_name AS supplierName FROM ap_suppliers WHERE buyer_tenant_id = ? AND lower(supplier_name) = lower(?) LIMIT 1`,
      )
      .get(buyerTenantId, name) as { id: string; supplierName: string } | undefined
    if (existing) return existing
    const now = new Date().toISOString()
    const id = `SUP-${randomUUID().substring(0, 8).toUpperCase()}`
    db.prepare(
      `INSERT INTO ap_suppliers (id, buyer_tenant_id, supplier_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    ).run(id, buyerTenantId, name, now, now)
    return { id, supplierName: name }
  }

  /**
   * A purchase order marked delivered records the supplier's bill. A supplier payment marked
   * paid records the payment against that bill. Anything else is not a ledger event. Safe to
   * call again: a request records its bill or payment once.
   */
  public recordFromRequestCompletion(params: {
    tenantId: string
    requestId: string
    requestType: string
    title?: string
    amount?: number
    currency?: string
    context: Record<string, unknown>
    payload: Record<string, unknown>
  }): 'matched' | 'disputed' | 'settled' | undefined {
    const type = text(params.requestType).toLowerCase()
    try {
      if (type === 'finance.purchase_order') return this.recordBill(params)
      if (type === 'finance.payment_request') {
        this.recordPayment(params)
        return 'settled'
      }
    } catch (error: any) {
      logger.warn(
        { error: error?.message, requestId: params.requestId, type },
        'Payables ledger not updated from request',
      )
    }
    return undefined
  }

  private recordBill(params: {
    tenantId: string
    requestId: string
    title?: string
    amount?: number
    currency?: string
    context: Record<string, unknown>
    payload: Record<string, unknown>
  }): 'matched' | 'disputed' | undefined {
    const db = DatabaseManager.getDatabase()
    const invoiceRef = text(params.payload.invoiceRef)
    const amount = money(params.payload.amount) ?? money(params.context.amount)
    const receiptRef = text(params.payload.receiptRef)
    const receivedAmount = money(params.payload.receivedAmount)
    const receivingRequired =
      params.context.receivingRequired !== false &&
      text(params.context.receivingRequired || 'yes').toLowerCase() !== 'no'
    const receiptKind =
      text(params.context.itemType || params.context.purchaseKind || 'goods').toLowerCase() === 'service'
        ? 'service'
        : 'goods'
    if (!invoiceRef || !amount || (receivingRequired && (!receiptRef || !receivedAmount))) return undefined
    const already = db
      .prepare(`SELECT match_status AS matchStatus FROM ap_invoices WHERE source_request_id = ? LIMIT 1`)
      .get(params.requestId) as { matchStatus?: string } | undefined
    if (already) return already.matchStatus === 'matched' ? 'matched' : 'disputed'
    const supplierName = text(params.context.supplierRef || params.context.supplier || params.context.vendor)
    const supplier = this.ensureSupplier(
      params.tenantId,
      NO_SUPPLIER.has(supplierName.toLowerCase()) ? 'Supplier not named' : supplierName,
    )
    const projectRef = this.projectRefFor(params.requestId, params.context)
    const now = new Date().toISOString()
    const transactionId = businessTransactionService.ensurePurchaseTransaction(params.tenantId, params.requestId)
    const orderedAmount = money(params.amount) ?? money(params.context.amount)
    const orderAgrees = !orderedAmount || Math.abs(orderedAmount - amount) < 0.01
    const receiptAgrees = !receivingRequired || Math.abs(Number(receivedAmount) - amount) < 0.01
    const agrees = orderAgrees && receiptAgrees
    const matchStatus = agrees ? 'matched' : 'disputed'
    const matchNote = agrees
      ? receivingRequired
        ? `Order, ${receiptKind === 'service' ? 'service confirmation' : 'delivery receipt'} and supplier bill agree.`
        : 'Order and supplier bill agree.'
      : receivingRequired
        ? `Check amounts: ordered ${orderedAmount || 'not recorded'}, received ${receivedAmount}, billed ${amount}.`
        : `Check amounts: ordered ${orderedAmount || 'not recorded'}, billed ${amount}.`
    const receiptId = `PRCPT-${randomUUID().substring(0, 8).toUpperCase()}`
    const evidence = {
      imageSha256: text(params.payload.receiptImageSha256) || undefined,
      record: params.payload.receiptRecord || undefined,
    }
    const id = `APINV-${randomUUID().substring(0, 8).toUpperCase()}`
    const description = [text(params.title) || 'Purchase order', projectRef ? `for job ${projectRef}` : '']
      .filter(Boolean)
      .join(' ')
    const obligationId = businessTransactionService.ensureObligation({
      transactionId,
      tenantId: params.tenantId,
      direction: 'payable',
      sourceType: 'ap_invoice',
      sourceId: id,
      description,
      amount,
      currency: text(params.currency) || 'USD',
      counterpartyRef: supplier.id,
      counterpartyName: supplier.supplierName,
      metadata: {
        invoiceRef,
        purchaseOrderId: params.requestId,
        receiptRef: receiptRef || undefined,
        receivingRequired,
        receiptKind,
        matchStatus,
      },
    })
    db.transaction(() => {
      if (receivingRequired) {
        db.prepare(
          `INSERT INTO purchase_receipts
             (id, tenant_id, business_transaction_id, purchase_request_id, purchase_order_id,
              receipt_ref, received_amount, evidence_url, received_at, metadata, receipt_kind, receiving_required)
           VALUES (?, ?, ?, NULL, ?, ?, ?, NULL, ?, ?, ?, 1)`,
        ).run(
          receiptId,
          params.tenantId,
          transactionId,
          params.requestId,
          receiptRef,
          receivedAmount,
          now,
          JSON.stringify(evidence),
          receiptKind,
        )
      }
      db.prepare(
        `INSERT INTO ap_invoices
           (id, buyer_tenant_id, supplier_id, invoice_ref, description, amount, currency, due_date, status, balance_due,
            source_type, source_request_id, project_ref, workflow_stage, last_action_at, created_at, updated_at,
            business_transaction_id, obligation_id, purchase_receipt_id, match_status, match_note)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 'purchase_order', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        params.tenantId,
        supplier.id,
        invoiceRef,
        description,
        amount,
        text(params.currency) || 'USD',
        agrees ? 'outstanding' : 'disputed',
        amount,
        params.requestId,
        projectRef ?? null,
        agrees ? 'matched' : 'match_disputed',
        now,
        now,
        now,
        transactionId,
        obligationId,
        receivingRequired ? receiptId : null,
        matchStatus,
        matchNote,
      )
      if (!agrees) {
        db.prepare(`UPDATE financial_obligations SET status = 'disputed', updated_at = ? WHERE id = ?`).run(
          now,
          obligationId,
        )
      }
    })()
    businessTransactionService.link(transactionId, 'ap_invoice', id, 'obligation')
    if (receivingRequired) businessTransactionService.link(transactionId, 'purchase_receipt', receiptId, 'evidence')
    logger.info(
      { id, requestId: params.requestId, invoiceRef, amount, receivedAmount, orderedAmount, matchStatus },
      'Supplier bill checked against order and receipt',
    )
    return agrees ? 'matched' : 'disputed'
  }

  private recordPayment(params: {
    tenantId: string
    requestId: string
    currency?: string
    context: Record<string, unknown>
    payload: Record<string, unknown>
  }) {
    const db = DatabaseManager.getDatabase()
    const paid = money(params.payload.amountPaid) ?? money(params.payload.amount)
    if (!paid) return
    if (db.prepare(`SELECT id FROM ap_payments WHERE source_request_id = ? LIMIT 1`).get(params.requestId)) return
    const chain = this.chainIds(params.requestId)
    const invoice = db
      .prepare(
        `SELECT * FROM ap_invoices WHERE buyer_tenant_id = ? AND source_request_id IN (${chain.map(() => '?').join(', ')}) ORDER BY created_at DESC LIMIT 1`,
      )
      .get(params.tenantId, ...chain) as
      | {
          id: string
          supplier_id: string
          currency: string
          balance_due: number
          status: string
          obligation_id?: string | null
        }
      | undefined
    if (!invoice || invoice.status === 'paid' || invoice.status === 'disputed') return
    const amountPaid = Math.min(paid, Number(invoice.balance_due))
    const newBalance = Math.max(0, Math.round((Number(invoice.balance_due) - amountPaid) * 100) / 100)
    const newStatus: 'paid' | 'partial' = newBalance === 0 ? 'paid' : 'partial'
    const now = new Date().toISOString()
    const paymentId = `APPAY-${randomUUID().substring(0, 8).toUpperCase()}`
    const reference = text(params.payload.receiptRef) || null
    const method = text(params.context.paymentMethod || params.context.payoutMethod) || null
    const idempotencyKey = `ap:record-payment:natural:${createHash('sha256').update(`request|${params.tenantId}|${params.requestId}`).digest('hex')}`
    let allocationId: string | undefined
    db.transaction(() => {
      db.prepare(
        `UPDATE ap_invoices SET balance_due = ?, status = ?, workflow_stage = ?, last_action_at = ?, updated_at = ?
          WHERE id = ? AND status != 'paid'`,
      ).run(newBalance, newStatus, newStatus === 'paid' ? 'paid' : 'payment_recorded', now, now, invoice.id)
      db.prepare(
        `INSERT INTO ap_payments
           (id, buyer_tenant_id, supplier_id, ap_invoice_id, amount_paid, currency, payment_method, reference,
            acknowledge_token, idempotency_key, source_request_id, paid_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        paymentId,
        params.tenantId,
        invoice.supplier_id,
        invoice.id,
        amountPaid,
        invoice.currency || text(params.currency) || 'USD',
        method,
        reference,
        randomUUID().replace(/-/g, ''),
        idempotencyKey,
        params.requestId,
        now,
        now,
      )
      emitApPaymentEventOutbox({
        paymentId,
        invoiceId: invoice.id,
        buyerTenantId: params.tenantId,
        supplierId: invoice.supplier_id,
        amountPaid,
        currency: invoice.currency,
        remainingBalance: newBalance,
        invoiceStatus: newStatus,
        paidAt: now,
        reference,
        paymentMethod: method,
      })
      emitApInvoiceStateEventOutbox({
        invoiceId: invoice.id,
        buyerTenantId: params.tenantId,
        supplierId: invoice.supplier_id,
        status: newStatus,
        balanceDue: newBalance,
        triggeredByPaymentId: paymentId,
        updatedAt: now,
      })
    })()
    if (invoice.obligation_id) {
      allocationId = businessTransactionService.allocateSettlement({
        obligationId: invoice.obligation_id,
        settlementType: 'ap_payment',
        settlementId: paymentId,
        amount: amountPaid,
        currency: invoice.currency,
        metadata: { sourceRequestId: params.requestId, reference },
      })
      if (allocationId) {
        db.prepare(`UPDATE ap_payments SET settlement_allocation_id = ? WHERE id = ?`).run(allocationId, paymentId)
      }
    }
    logger.info(
      { paymentId, invoiceId: invoice.id, requestId: params.requestId, amountPaid, newStatus },
      'Supplier payment recorded from payment request',
    )
  }

  /** The bill (and its payments) that belongs to this request's purchase chain, if any. */
  public ledgerForRequest(requestId: string): LedgerBillSummary | undefined {
    const db = DatabaseManager.getDatabase()
    const chain = this.chainIds(requestId)
    if (chain.length === 0) return undefined
    const row = db
      .prepare(
        `SELECT i.*, s.supplier_name AS supplierName FROM ap_invoices i
           JOIN ap_suppliers s ON s.id = i.supplier_id
          WHERE i.source_request_id IN (${chain.map(() => '?').join(', ')})
          ORDER BY i.created_at DESC LIMIT 1`,
      )
      .get(...chain) as any
    if (!row) return undefined
    return this.summary(row)
  }

  /** The same summary for a bill id, for the Supplier bills tab. */
  public billSummary(billId: string, buyerTenantId: string): LedgerBillSummary | undefined {
    const row = DatabaseManager.getDatabase()
      .prepare(
        `SELECT i.*, s.supplier_name AS supplierName FROM ap_invoices i JOIN ap_suppliers s ON s.id = i.supplier_id
          WHERE i.id = ? AND i.buyer_tenant_id = ?`,
      )
      .get(billId, buyerTenantId) as any
    return row ? this.summary(row) : undefined
  }

  private summary(row: any): LedgerBillSummary {
    const payments = DatabaseManager.getDatabase()
      .prepare(
        `SELECT id, amount_paid, reference, payment_method, paid_at, source_request_id FROM ap_payments WHERE ap_invoice_id = ? ORDER BY paid_at ASC`,
      )
      .all(row.id) as any[]
    const obligation = row.obligation_id
      ? businessTransactionService.obligationForSource('ap_invoice', row.id, 'payable')
      : undefined
    return {
      billId: row.id,
      invoiceRef: row.invoice_ref,
      supplierId: row.supplier_id,
      supplierName: row.supplierName,
      amount: Number(row.amount || 0),
      balanceDue: Number(row.balance_due || 0),
      currency: row.currency || 'USD',
      status: row.status,
      transactionId: row.business_transaction_id || obligation?.transactionId,
      obligationId: row.obligation_id || obligation?.id,
      obligationStatus: obligation?.status,
      settledAmount: obligation?.settledAmount,
      matchStatus: row.match_status || undefined,
      matchNote: row.match_note || undefined,
      sourceRequestId: row.source_request_id,
      projectRef: row.project_ref || undefined,
      recordedAt: row.created_at,
      payments: payments.map((p) => ({
        paymentId: p.id,
        amount: Number(p.amount_paid || 0),
        reference: p.reference || undefined,
        method: p.payment_method || undefined,
        paidAt: p.paid_at,
        sourceRequestId: p.source_request_id || undefined,
      })),
    }
  }

  /**
   * Cancel a supplier bill nobody has paid yet. A bill with any payment against it stays: record a
   * credit or refund instead. The amount owed is cancelled with it and the purchase record refreshed.
   */
  public cancelBill(tenantId: string, invoiceId: string): { invoiceId: string; status: 'cancelled' } {
    const db = DatabaseManager.getDatabase()
    const bill = db
      .prepare(`SELECT id, status, obligation_id FROM ap_invoices WHERE id = ? AND buyer_tenant_id = ?`)
      .get(invoiceId, tenantId) as { id: string; status: string; obligation_id?: string | null } | undefined
    if (!bill) throw new StatusException('Supplier bill not found', 404)
    if (bill.status === 'cancelled') throw new StatusException('This supplier bill is already cancelled.', 409)
    const paid = db.prepare(`SELECT COUNT(*) AS n FROM ap_payments WHERE ap_invoice_id = ?`).get(invoiceId) as {
      n: number
    }
    if (paid.n > 0 || bill.status === 'paid') {
      throw new StatusException('This bill has a payment against it, so it cannot be cancelled.', 409)
    }
    const now = new Date().toISOString()
    db.transaction(() => {
      db.prepare(`UPDATE ap_invoices SET status = 'cancelled', updated_at = ? WHERE id = ?`).run(now, invoiceId)
      db.prepare(
        `UPDATE ar_ap_workflow_transactions SET required_action = NULL, updated_at = ? WHERE ap_invoice_id = ?`,
      ).run(now, invoiceId)
      db.prepare(
        `UPDATE wallet_pending_offers SET resolved_at = COALESCE(resolved_at, ?)
          WHERE source_type = 'ap_workflow_assignment' AND resolved_at IS NULL
            AND source_id IN (SELECT id FROM ar_ap_workflow_transactions WHERE ap_invoice_id = ?)`,
      ).run(now, invoiceId)
    })()
    if (bill.obligation_id) businessTransactionService.setObligationStatus(bill.obligation_id, 'cancelled')
    return { invoiceId, status: 'cancelled' }
  }
}

export const accountsPayableLedgerService = new AccountsPayableLedgerService()
