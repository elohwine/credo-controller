/**
 * Correlation layer for the real-world event, the money it creates, and the payments that
 * settle that money. This is deliberately not a general ledger and it does not replace
 * workflow/request/payment ids. It gives those existing records one stable family.
 */

import { randomUUID } from 'crypto'

import { DatabaseManager } from '../persistence/DatabaseManager'

export type TransactionType = 'purchase' | 'field_job' | 'sale' | 'fee_assessment' | 'collection_plan'
export type ObligationDirection = 'payable' | 'receivable'

export interface FinancialObligationSummary {
  id: string
  transactionId: string
  direction: ObligationDirection
  description: string
  originalAmount: number
  balanceDue: number
  currency: string
  status: string
  dueDate?: string
  settledAmount: number
}

function text(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

function money(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 100) / 100) : 0
}

function json(value: unknown): string {
  return JSON.stringify(value && typeof value === 'object' ? value : {})
}

export class BusinessTransactionService {
  /**
   * Adopt rows created before migration 115. Existing domain ids stay intact; this only adds
   * the missing centre/obligation/allocation links. Safe on every start.
   */
  public backfillExistingFinanceRows(): { payables: number; receivables: number; allocations: number } {
    const db = DatabaseManager.getDatabase()
    let payables = 0
    let receivables = 0
    let allocations = 0

    const invoices = db
      .prepare(
        `SELECT i.*, s.supplier_name AS supplier_name
           FROM ap_invoices i JOIN ap_suppliers s ON s.id = i.supplier_id
          WHERE i.obligation_id IS NULL`,
      )
      .all() as any[]
    for (const invoice of invoices) {
      const transactionId = invoice.source_request_id
        ? this.ensurePurchaseTransaction(invoice.buyer_tenant_id, invoice.source_request_id)
        : this.ensureTransaction({
            tenantId: invoice.buyer_tenant_id,
            transactionType: 'purchase',
            sourceType: 'manual_ap_invoice',
            sourceId: invoice.id,
            title: invoice.description || `Supplier bill ${invoice.invoice_ref}`,
            reference: invoice.project_ref || invoice.invoice_ref,
            metadata: { adopted: true },
          })
      const obligationId = this.ensureObligation({
        transactionId,
        tenantId: invoice.buyer_tenant_id,
        direction: 'payable',
        sourceType: 'ap_invoice',
        sourceId: invoice.id,
        description: invoice.description || `Supplier bill ${invoice.invoice_ref}`,
        amount: Number(invoice.amount || 0),
        currency: invoice.currency,
        dueDate: invoice.due_date || undefined,
        counterpartyRef: invoice.supplier_id,
        counterpartyName: invoice.supplier_name,
        metadata: { invoiceRef: invoice.invoice_ref, adopted: true },
      })
      db.prepare(
        `UPDATE ap_invoices
            SET business_transaction_id = ?, obligation_id = ?,
                match_status = CASE WHEN source_request_id IS NULL THEN 'manual_reviewed' ELSE match_status END
          WHERE id = ?`,
      ).run(transactionId, obligationId, invoice.id)
      this.link(transactionId, 'ap_invoice', invoice.id, 'obligation')
      const payments = db
        .prepare(
          `SELECT id, amount_paid, currency, reference FROM ap_payments WHERE ap_invoice_id = ? ORDER BY paid_at ASC`,
        )
        .all(invoice.id) as any[]
      for (const payment of payments) {
        const allocationId = this.allocateSettlement({
          obligationId,
          settlementType: 'ap_payment',
          settlementId: payment.id,
          amount: Number(payment.amount_paid || 0),
          currency: payment.currency,
          metadata: { reference: payment.reference || undefined, adopted: true },
        })
        if (allocationId) {
          db.prepare(`UPDATE ap_payments SET settlement_allocation_id = ? WHERE id = ?`).run(allocationId, payment.id)
          allocations += 1
        }
      }
      payables += 1
    }

    const plans = db.prepare(`SELECT * FROM ar_payment_plans WHERE business_transaction_id IS NULL`).all() as any[]
    for (const plan of plans) {
      const transactionId = this.ensureTransaction({
        tenantId: plan.buyer_tenant_id,
        transactionType: 'collection_plan',
        sourceType: 'ar_plan',
        sourceId: plan.id,
        title: plan.description,
        reference: plan.id,
        metadata: { planType: plan.plan_type, adopted: true },
      })
      db.prepare(`UPDATE ar_payment_plans SET business_transaction_id = ? WHERE id = ?`).run(transactionId, plan.id)
    }

    const links = db
      .prepare(
        `SELECT p.*, i.id AS installment_id, i.plan_id, i.installment_number, i.due_date,
                plan.business_transaction_id AS plan_transaction_id
           FROM payment_links p
           LEFT JOIN ar_plan_installments i ON i.payment_link_id = p.id
           LEFT JOIN ar_payment_plans plan ON plan.id = i.plan_id
          WHERE p.obligation_id IS NULL`,
      )
      .all() as any[]
    for (const link of links) {
      const transactionId =
        link.plan_transaction_id ||
        this.ensureTransaction({
          tenantId: link.merchant_id,
          transactionType: 'sale',
          sourceType: 'payment_link',
          sourceId: link.id,
          title: link.description,
          reference: link.invoice_ref || link.id,
          metadata: { adopted: true },
        })
      const obligationId = this.ensureObligation({
        transactionId,
        tenantId: link.merchant_id,
        direction: 'receivable',
        sourceType: link.installment_id ? 'ar_installment' : 'payment_link',
        sourceId: link.installment_id || link.id,
        description: link.description,
        amount: Number(link.amount || 0),
        currency: link.currency,
        dueDate: link.due_date || link.expiry || undefined,
        metadata: { invoiceRef: link.invoice_ref || undefined, adopted: true },
      })
      db.prepare(`UPDATE payment_links SET business_transaction_id = ?, obligation_id = ? WHERE id = ?`).run(
        transactionId,
        obligationId,
        link.id,
      )
      if (link.installment_id) {
        db.prepare(`UPDATE ar_plan_installments SET obligation_id = ? WHERE id = ?`).run(
          obligationId,
          link.installment_id,
        )
      }
      this.link(transactionId, 'payment_link', link.id, 'collection_attempt')
      if (link.status === 'paid') {
        if (
          this.allocateSettlement({
            obligationId,
            settlementType: 'payment_link',
            settlementId: link.id,
            amount: Number(link.amount || 0),
            currency: link.currency,
            metadata: { adopted: true },
          })
        ) {
          allocations += 1
        }
      }
      receivables += 1
    }
    const paidWithoutAllocation = db
      .prepare(
        `SELECT p.id, p.obligation_id AS obligationId, p.amount, p.currency, p.provider_ref AS providerRef
           FROM payment_links p
          WHERE p.status = 'paid' AND p.obligation_id IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM settlement_allocations a
               WHERE a.obligation_id = p.obligation_id
                 AND a.settlement_type = 'payment_link'
            )`,
      )
      .all() as Array<{ id: string; obligationId: string; amount: number; currency: string; providerRef?: string }>
    for (const link of paidWithoutAllocation) {
      if (
        this.allocateSettlement({
          obligationId: link.obligationId,
          settlementType: 'payment_link',
          settlementId: link.id,
          amount: Number(link.amount || 0),
          currency: link.currency,
          metadata: { providerRef: link.providerRef, repairedBy: 'finance_backfill' },
        })
      ) {
        allocations += 1
      }
    }
    return { payables, receivables, allocations }
  }

  public ensureTransaction(input: {
    tenantId: string
    transactionType: TransactionType
    sourceType: string
    sourceId: string
    title: string
    reference?: string
    parentTransactionId?: string
    metadata?: Record<string, unknown>
  }): string {
    const db = DatabaseManager.getDatabase()
    const existing = db
      .prepare(
        `SELECT id FROM business_transactions
          WHERE tenant_id = ? AND source_type = ? AND source_id = ? LIMIT 1`,
      )
      .get(input.tenantId, input.sourceType, input.sourceId) as { id: string } | undefined
    if (existing) return existing.id
    const id = `BTX-${randomUUID().substring(0, 8).toUpperCase()}`
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO business_transactions
         (id, tenant_id, transaction_type, reference, title, status, parent_transaction_id,
          source_type, source_id, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.tenantId,
      input.transactionType,
      input.reference || null,
      input.title,
      input.parentTransactionId || null,
      input.sourceType,
      input.sourceId,
      json(input.metadata),
      now,
      now,
    )
    this.link(id, input.sourceType, input.sourceId, 'source')
    return id
  }

  public link(transactionId: string, linkType: string, linkId: string, relation = 'related'): void {
    if (!transactionId || !linkType || !linkId) return
    DatabaseManager.getDatabase()
      .prepare(
        `INSERT OR IGNORE INTO business_transaction_links
           (id, business_transaction_id, link_type, link_id, relation, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        `BTL-${randomUUID().substring(0, 8).toUpperCase()}`,
        transactionId,
        linkType,
        linkId,
        relation,
        new Date().toISOString(),
      )
  }

  /** One purchase family, whether it started from Home or as a child of a field job. */
  public ensurePurchaseTransaction(tenantId: string, requestId: string): string {
    const db = DatabaseManager.getDatabase()
    let rootId = requestId
    let root: any
    for (let depth = 0; depth < 8; depth += 1) {
      root = db
        .prepare(`SELECT id, parent_request_id, title, context_json FROM requests WHERE id = ?`)
        .get(rootId) as any
      if (!root?.parent_request_id) break
      rootId = root.parent_request_id
    }
    let context: Record<string, unknown> = {}
    try {
      context = JSON.parse(root?.context_json || '{}')
    } catch {
      context = {}
    }
    const projectRef = text(context.projectRef)
    const id = this.ensureTransaction({
      tenantId,
      transactionType: 'purchase',
      sourceType: 'request',
      sourceId: rootId,
      title: text(root?.title) || 'Purchase',
      reference: projectRef || undefined,
      metadata: { projectRef: projectRef || undefined },
    })
    const family = db
      .prepare(
        `WITH RECURSIVE chain(id, depth) AS (
           SELECT id, 0 FROM requests WHERE id = ?
           UNION ALL
           SELECT r.id, chain.depth + 1 FROM requests r JOIN chain ON r.parent_request_id = chain.id WHERE chain.depth < 8
         ) SELECT id FROM chain`,
      )
      .all(rootId) as Array<{ id: string }>
    for (const row of family) this.link(id, 'request', row.id, row.id === rootId ? 'source' : 'child')
    return id
  }

  public ensureObligation(input: {
    transactionId: string
    tenantId: string
    direction: ObligationDirection
    sourceType: string
    sourceId: string
    description: string
    amount: number
    currency?: string
    dueDate?: string
    counterpartyRef?: string
    counterpartyName?: string
    metadata?: Record<string, unknown>
  }): string {
    const db = DatabaseManager.getDatabase()
    const existing = db
      .prepare(
        `SELECT id FROM financial_obligations
          WHERE tenant_id = ? AND direction = ? AND source_type = ? AND source_id = ? LIMIT 1`,
      )
      .get(input.tenantId, input.direction, input.sourceType, input.sourceId) as { id: string } | undefined
    if (existing) return existing.id
    const amount = money(input.amount)
    const id = `${input.direction === 'payable' ? 'PAY' : 'REC'}-${randomUUID().substring(0, 8).toUpperCase()}`
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO financial_obligations
         (id, business_transaction_id, tenant_id, direction, counterparty_ref, counterparty_name,
          description, original_amount, currency, due_date, balance_due, status, source_type,
          source_id, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.transactionId,
      input.tenantId,
      input.direction,
      input.counterpartyRef || null,
      input.counterpartyName || null,
      input.description,
      amount,
      input.currency || 'USD',
      input.dueDate || null,
      amount,
      input.sourceType,
      input.sourceId,
      json(input.metadata),
      now,
      now,
    )
    this.refreshTransactionStatus(input.transactionId)
    return id
  }

  /**
   * The transaction follows what it owes: `settled` once every amount is paid or cancelled
   * (at least one paid), `cancelled` when all were cancelled, otherwise `open`. A new amount
   * owed on a closed transaction opens it again.
   */
  public refreshTransactionStatus(transactionId: string): string | undefined {
    if (!transactionId) return undefined
    const db = DatabaseManager.getDatabase()
    const counts = db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN status = 'settled' THEN 1 ELSE 0 END) AS settled,
                SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
           FROM financial_obligations WHERE business_transaction_id = ?`,
      )
      .get(transactionId) as { total: number; settled: number | null; cancelled: number | null }
    const total = Number(counts?.total || 0)
    if (!total) return undefined
    const settled = Number(counts.settled || 0)
    const cancelled = Number(counts.cancelled || 0)
    const status = settled + cancelled < total ? 'open' : settled > 0 ? 'settled' : 'cancelled'
    db.prepare(
      `UPDATE business_transactions SET status = ?, updated_at = ? WHERE id = ? AND status != ?`,
    ).run(status, new Date().toISOString(), transactionId, status)
    return status
  }

  public transactionStatus(transactionId: string): string | undefined {
    const row = DatabaseManager.getDatabase()
      .prepare(`SELECT status FROM business_transactions WHERE id = ?`)
      .get(transactionId) as { status: string } | undefined
    return row?.status
  }

  /** Apply one payment to one obligation; replays are ignored by the natural unique key. */
  public allocateSettlement(input: {
    obligationId: string
    settlementType: string
    settlementId: string
    amount: number
    currency?: string
    metadata?: Record<string, unknown>
  }): string | undefined {
    const db = DatabaseManager.getDatabase()
    const existing = db
      .prepare(
        `SELECT id FROM settlement_allocations
          WHERE obligation_id = ? AND settlement_type = ? AND settlement_id = ? LIMIT 1`,
      )
      .get(input.obligationId, input.settlementType, input.settlementId) as { id: string } | undefined
    if (existing) return existing.id
    const obligation = db
      .prepare(
        `SELECT balance_due, currency, status, business_transaction_id FROM financial_obligations WHERE id = ?`,
      )
      .get(input.obligationId) as
      | { balance_due: number; currency: string; status: string; business_transaction_id: string }
      | undefined
    if (!obligation) return undefined
    if (obligation.status === 'cancelled') throw new Error('Cannot pay a cancelled amount owed')
    const settlementCurrency = input.currency || obligation.currency
    if (settlementCurrency !== obligation.currency) throw new Error(`Payment currency must be ${obligation.currency}`)
    const requestedAmount = money(input.amount)
    const amount = Math.min(requestedAmount, money(obligation.balance_due))
    const unappliedAmount = money(requestedAmount - amount)
    if (!amount) return undefined
    const id = `ALLOC-${randomUUID().substring(0, 8).toUpperCase()}`
    const now = new Date().toISOString()
    const balance = money(Number(obligation.balance_due) - amount)
    db.transaction(() => {
      db.prepare(
        `INSERT INTO settlement_allocations
           (id, obligation_id, settlement_type, settlement_id, amount, currency, status, applied_at, metadata, unapplied_amount)
         VALUES (?, ?, ?, ?, ?, ?, 'applied', ?, ?, ?)`,
      ).run(
        id,
        input.obligationId,
        input.settlementType,
        input.settlementId,
        amount,
        settlementCurrency,
        now,
        json(input.metadata),
        unappliedAmount,
      )
      db.prepare(
        `UPDATE financial_obligations
            SET balance_due = ?, status = ?, updated_at = ?
          WHERE id = ?`,
      ).run(balance, balance === 0 ? 'settled' : 'partially_settled', now, input.obligationId)
      this.refreshTransactionStatus(obligation.business_transaction_id)
    })()
    return id
  }

  public setObligationStatus(obligationId: string, status: 'open' | 'disputed' | 'cancelled'): void {
    const db = DatabaseManager.getDatabase()
    const row = db
      .prepare(`SELECT balance_due, business_transaction_id FROM financial_obligations WHERE id = ?`)
      .get(obligationId) as { balance_due: number; business_transaction_id: string } | undefined
    if (!row) return
    db.prepare(`UPDATE financial_obligations SET status = ?, updated_at = ? WHERE id = ?`).run(
      status === 'open' && Number(row.balance_due) === 0 ? 'settled' : status,
      new Date().toISOString(),
      obligationId,
    )
    this.refreshTransactionStatus(row.business_transaction_id)
  }

  public obligationForSource(
    sourceType: string,
    sourceId: string,
    direction?: ObligationDirection,
  ): FinancialObligationSummary | undefined {
    const params: unknown[] = [sourceType, sourceId]
    let where = `WHERE source_type = ? AND source_id = ?`
    if (direction) {
      where += ` AND direction = ?`
      params.push(direction)
    }
    const row = DatabaseManager.getDatabase()
      .prepare(
        `SELECT o.*, COALESCE(SUM(CASE WHEN a.status = 'applied' THEN a.amount ELSE 0 END), 0) AS settled_amount
           FROM financial_obligations o
           LEFT JOIN settlement_allocations a ON a.obligation_id = o.id
           ${where}
          GROUP BY o.id LIMIT 1`,
      )
      .get(...params) as any
    return row ? this.summary(row) : undefined
  }

  public obligationsForTransaction(transactionId: string): FinancialObligationSummary[] {
    const rows = DatabaseManager.getDatabase()
      .prepare(
        `SELECT o.*, COALESCE(SUM(CASE WHEN a.status = 'applied' THEN a.amount ELSE 0 END), 0) AS settled_amount
           FROM financial_obligations o
           LEFT JOIN settlement_allocations a ON a.obligation_id = o.id
          WHERE o.business_transaction_id = ?
          GROUP BY o.id ORDER BY o.created_at ASC`,
      )
      .all(transactionId) as any[]
    return rows.map((row) => this.summary(row))
  }

  private summary(row: any): FinancialObligationSummary {
    return {
      id: row.id,
      transactionId: row.business_transaction_id,
      direction: row.direction,
      description: row.description,
      originalAmount: Number(row.original_amount || 0),
      balanceDue: Number(row.balance_due || 0),
      currency: row.currency || 'USD',
      status: row.status,
      dueDate: row.due_date || undefined,
      settledAmount: Number(row.settled_amount || 0),
    }
  }
}

export const businessTransactionService = new BusinessTransactionService()
