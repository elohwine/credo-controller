import { randomUUID } from 'crypto'

import { StatusException } from '../errors'
import { DatabaseManager } from '../persistence/DatabaseManager'

import { businessTransactionService } from './BusinessTransactionService'
import { paymentLinkService, type CreatedPaymentLink } from './PaymentLinkService'

export type PaymentTerms = 'one_time' | 'instalment' | 'recurring'

function addCadence(date: Date, cadence: string, index: number): Date {
  const next = new Date(date)
  if (cadence === 'weekly') next.setUTCDate(next.getUTCDate() + index * 7)
  else if (cadence === 'quarterly') next.setUTCMonth(next.getUTCMonth() + index * 3)
  else next.setUTCMonth(next.getUTCMonth() + index)
  return next
}

function splitAmount(total: number, count: number): number[] {
  const cents = Math.round(total * 100)
  const base = Math.floor(cents / count)
  const remainder = cents - base * count
  return Array.from({ length: count }, (_, index) => (base + (index === count - 1 ? remainder : 0)) / 100)
}

export class ReceivablePlanService {
  public createForJob(input: {
    tenantId: string
    jobRunId: string
    billingRunId: string
    title: string
    reference?: string
    amount: number
    currency: string
    payerName?: string
    payerPhone?: string
    terms: PaymentTerms
    instalments?: number
    cadence?: string
    firstDueDate?: string
    firstPaymentAmount?: number
    merchantName?: string
    transactionType?: 'field_job' | 'sale' | 'fee_assessment' | 'collection_plan'
    sector?: string
    linkMetadata?: Record<string, unknown>
  }): { planId?: string; firstLink: CreatedPaymentLink; transactionId: string; obligationIds: string[] } {
    const db = DatabaseManager.getDatabase()
    const existing = db
      .prepare(
        `SELECT p.id AS planId, l.id AS linkId
           FROM ar_payment_plans p
           JOIN ar_plan_installments i ON i.plan_id = p.id
           JOIN payment_links l ON l.id = i.payment_link_id
          WHERE p.source_workflow_run_id = ? AND p.buyer_tenant_id = ? AND l.merchant_id = ?
          ORDER BY i.installment_number LIMIT 1`,
      )
      .get(input.jobRunId, input.tenantId, input.tenantId) as { planId: string; linkId: string } | undefined
    if (existing) {
      const row = db.prepare(`SELECT * FROM payment_links WHERE id = ?`).get(existing.linkId) as any
      return {
        planId: existing.planId,
        firstLink: {
          id: row.id,
          merchantId: row.merchant_id,
          merchantName: row.merchant_name,
          description: row.description,
          amount: row.amount,
          currency: row.currency,
          invoiceRef: row.invoice_ref,
          status: 'active',
          sector: row.sector,
          expiry: row.expiry,
          shortlinkCode: row.shortlink_code,
          shortlinkUrl: row.shortlink_url,
          createdAt: row.created_at,
        },
        transactionId: row.business_transaction_id,
        obligationIds: db
          .prepare(`SELECT obligation_id AS id FROM ar_plan_installments WHERE plan_id = ? ORDER BY installment_number`)
          .all(existing.planId)
          .map((item: any) => item.id),
      }
    }

    const transactionType = input.transactionType || 'field_job'
    const transactionId = businessTransactionService.ensureTransaction({
      tenantId: input.tenantId,
      transactionType,
      sourceType: 'workflow_run',
      sourceId: input.jobRunId,
      title: transactionType === 'field_job' && input.reference ? `Job ${input.reference}` : input.title,
      reference: input.reference,
    })
    const count =
      input.terms === 'one_time'
        ? 1
        : Math.max(2, Math.min(60, Math.floor(input.instalments || (input.terms === 'recurring' ? 12 : 2))))
    const requestedFirst = Math.round(Number(input.firstPaymentAmount || 0) * 100) / 100
    const amounts =
      count > 1 && requestedFirst > 0 && requestedFirst < input.amount
        ? [requestedFirst, ...splitAmount(input.amount - requestedFirst, count - 1)]
        : splitAmount(input.amount, count)
    const planId = `ARPLAN-${randomUUID().slice(0, 8).toUpperCase()}`
    const now = new Date().toISOString()
    const firstDue = input.firstDueDate ? new Date(input.firstDueDate) : new Date()
    const cadence = input.cadence || 'monthly'

    db.prepare(
      `INSERT INTO ar_payment_plans
         (id, buyer_tenant_id, payer_name, payer_phone, description, total_amount, currency,
          plan_type, cadence, installments_total, installments_paid, amount_collected, status,
          created_at, updated_at, business_transaction_id, source_workflow_run_id, next_notification_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'active', ?, ?, ?, ?, ?)`,
    ).run(
      planId,
      input.tenantId,
      input.payerName || '',
      input.payerPhone || '',
      input.title,
      input.amount,
      input.currency,
      input.terms,
      cadence,
      count,
      now,
      now,
      transactionId,
      input.jobRunId,
      firstDue.toISOString(),
    )

    let firstLink: CreatedPaymentLink | undefined
    const obligationIds: string[] = []
    for (let index = 0; index < count; index += 1) {
      const installmentNumber = index + 1
      const installmentId = `ARINST-${randomUUID().slice(0, 8).toUpperCase()}`
      const dueDate = addCadence(firstDue, cadence, index).toISOString()
      const description = count === 1 ? input.title : `${input.title} — Instalment ${installmentNumber} of ${count}`
      const link = paymentLinkService.create({
        merchantId: input.tenantId,
        merchantName: input.merchantName,
        description,
        amount: amounts[index],
        currency: input.currency,
        invoiceRef: input.reference ? `${input.reference}-${String(installmentNumber).padStart(2, '0')}` : undefined,
        sector: input.sector,
        payerPhone: input.payerPhone,
        transactionId,
        obligationSourceType: 'ar_installment',
        obligationSourceId: installmentId,
        metadata: {
          ...(input.linkMetadata || {}),
          kind: 'invoice',
          arModule: true,
          collectionType: input.terms,
          planId,
          instalment: installmentNumber,
          totalInstalments: count,
          payerName: input.payerName,
          workflowRunId: input.billingRunId,
          parentRunId: input.jobRunId,
          dueDate,
        },
      })
      const obligation = db.prepare(`SELECT obligation_id AS id FROM payment_links WHERE id = ?`).get(link.id) as {
        id: string
      }
      db.prepare(
        `INSERT INTO ar_plan_installments
           (id, plan_id, payment_link_id, installment_number, amount, due_date, status, created_at, obligation_id, notified_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      ).run(
        installmentId,
        planId,
        link.id,
        installmentNumber,
        amounts[index],
        dueDate,
        now,
        obligation.id,
        index === 0 ? now : null,
      )
      obligationIds.push(obligation.id)
      if (!firstLink) firstLink = link
    }
    return { planId, firstLink: firstLink!, transactionId, obligationIds }
  }

  /**
   * A pay link was just paid. Mark its instalment paid and close the plan when every instalment
   * is paid. Safe to call twice. A link that is not on a plan does nothing.
   */
  public recordLinkPaid(linkId: string, paidAt?: string): void {
    const db = DatabaseManager.getDatabase()
    const table = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ar_plan_installments'`)
      .get() as { name?: string } | undefined
    if (!table) return
    const instalment = db
      .prepare(`SELECT plan_id AS planId FROM ar_plan_installments WHERE payment_link_id = ?`)
      .get(linkId) as { planId?: string } | undefined
    if (!instalment?.planId) return
    const now = paidAt || new Date().toISOString()
    db.prepare(
      `UPDATE ar_plan_installments
          SET status = 'paid', paid_at = COALESCE(paid_at, ?)
        WHERE payment_link_id = ? AND status IN ('pending', 'overdue')`,
    ).run(now, linkId)
    db.prepare(
      `UPDATE ar_payment_plans
          SET installments_paid = (
                SELECT COUNT(*) FROM ar_plan_installments WHERE plan_id = ar_payment_plans.id AND status = 'paid'
              ),
              amount_collected = (
                SELECT COALESCE(SUM(amount), 0) FROM ar_plan_installments WHERE plan_id = ar_payment_plans.id AND status = 'paid'
              ),
              status = CASE
                WHEN status = 'cancelled' THEN 'cancelled'
                WHEN (
                  SELECT COUNT(*) FROM ar_plan_installments WHERE plan_id = ar_payment_plans.id AND status = 'paid'
                ) >= installments_total THEN 'completed'
                ELSE 'active'
              END,
              updated_at = ?
        WHERE id = ?`,
    ).run(now, instalment.planId)
  }

  /**
   * Cancel a payment plan: the plan, its unpaid instalments, their pay links and the amounts still
   * owed. Paid instalments stay paid. Called by the collections screen and `/api/records`.
   */
  public cancelPlan(tenantId: string, planId: string): { planId: string; status: 'cancelled' } {
    const db = DatabaseManager.getDatabase()
    const plan = db
      .prepare('SELECT id, status, business_transaction_id FROM ar_payment_plans WHERE id = ? AND buyer_tenant_id = ?')
      .get(planId, tenantId) as { id: string; status: string; business_transaction_id?: string | null } | undefined
    if (!plan) throw new StatusException('Plan not found', 404)
    if (plan.status === 'cancelled') throw new StatusException('Plan already cancelled', 409)

    const now = new Date().toISOString()
    db.transaction(() => {
      db.prepare('UPDATE ar_payment_plans SET status = ?, updated_at = ? WHERE id = ?').run('cancelled', now, planId)
      const pendingLinks = db
        .prepare(
          `SELECT payment_link_id FROM ar_plan_installments
           WHERE plan_id = ? AND status = 'pending' AND payment_link_id IS NOT NULL`,
        )
        .all(planId) as { payment_link_id: string }[]
      for (const row of pendingLinks) {
        db.prepare('UPDATE payment_links SET status = ?, updated_at = ? WHERE id = ?').run(
          'cancelled',
          now,
          row.payment_link_id,
        )
      }
      db.prepare("UPDATE ar_plan_installments SET status = 'cancelled' WHERE plan_id = ? AND status = 'pending'").run(
        planId,
      )
      db.prepare(
        `UPDATE financial_obligations
            SET status = 'cancelled', updated_at = ?
          WHERE id IN (
            SELECT obligation_id FROM ar_plan_installments
            WHERE plan_id = ? AND status = 'cancelled' AND obligation_id IS NOT NULL
          ) AND status != 'settled'`,
      ).run(now, planId)
    })()
    if (plan.business_transaction_id) businessTransactionService.refreshTransactionStatus(plan.business_transaction_id)
    return { planId, status: 'cancelled' }
  }
}

export const receivablePlanService = new ReceivablePlanService()
