import { Controller, Post, Get, Patch, Route, Tags, Body, Path, Query, Request, Security } from 'tsoa'
import type { Request as ExRequest } from 'express'
import { randomUUID, createHash } from 'crypto'
import { SCOPES } from '../../enums'
import { DatabaseManager } from '../../persistence/DatabaseManager'
import { contactRepository } from '../../persistence/ContactRepository'
import { getTenantById } from '../../persistence/TenantRepository'
import { StatusException } from '../../errors'
import { orgSetupProfileService } from '../../services/OrgSetupProfileService'
import { IdempotencyGuard } from '../../utils/IdempotencyGuard'
import { ShortlinkService } from '../../services/ShortlinkService'
import { notificationService } from '../../services/NotificationService'
import { outboxService } from '../../services/OutboxService'
import { orgWorkflowActorService } from '../../services/OrgWorkflowActorService'
import { businessTransactionService } from '../../services/BusinessTransactionService'
import { receivableReminderService } from '../../services/ReceivableReminderService'
import { rootLogger } from '../../utils/pinoLogger'

const logger = rootLogger.child({ module: 'ArController' })

// ─── Request interfaces ───────────────────────────────────────────────────────

interface CreatePlanRequest {
  /** 'one_time' | 'instalment' | 'recurring' */
  collectionType: 'one_time' | 'instalment' | 'recurring'
  description: string
  totalAmount: number
  currency?: string
  payerName?: string
  payerPhone?: string
  payerEmail?: string
  contactId?: string
  /** For instalment: number of instalments */
  instalments?: number
  /** For recurring: 'weekly' | 'monthly' | 'quarterly' */
  cadence?: 'weekly' | 'monthly' | 'quarterly'
  /** First due date (YYYY-MM-DD) */
  firstDueDate?: string
}

type DbPaymentLinkRow = {
  id: string
  status: string
  amount: number
  metadata?: string | null
  invoice_ref?: string | null
  installment_number?: number | null
  plan_id?: string | null
  instalment_status?: string | null
  plan_type?: string | null
  installments_total?: number | null
  payer_name?: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nextDueDate(from: Date, cadence: 'weekly' | 'monthly' | 'quarterly', n: number): string {
  const d = new Date(from)
  if (cadence === 'weekly') d.setDate(d.getDate() + 7 * n)
  if (cadence === 'monthly') d.setMonth(d.getMonth() + n)
  if (cadence === 'quarterly') d.setMonth(d.getMonth() + 3 * n)
  return d.toISOString().split('T')[0]
}

function getTenantId(req: ExRequest): string {
  const tid = (req as any).user?.tenantId
  if (!tid) throw new StatusException('Unauthorized', 401)
  return tid
}

function assertOrgRole(req: ExRequest): void {
  const user = (req as any).user
  if (!user?.tenantId) throw new StatusException('Unauthorized', 401)
  const tenant = getTenantById(user.tenantId)
  if (tenant?.tenantType === 'ORG') {
    const allowed = new Set(['owner', 'admin', 'issuer', 'manager', 'approver', 'accountant'])
    if (!allowed.has(user.orgRole)) {
      throw new StatusException('Insufficient permissions for AR actions', 403)
    }
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Unexpected error'
}

function parseLinkMetadata(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'string') return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function isArOneTimeMetadata(metadata: Record<string, unknown>): boolean {
  const collectionType = String(metadata.collectionType ?? metadata.collection_type ?? '')
    .trim()
    .toLowerCase()
  const arModule = metadata.arModule === true
  return arModule || collectionType === 'one_time' || collectionType === 'instalment' || collectionType === 'recurring'
}

function isArCollectionRow(row: DbPaymentLinkRow): boolean {
  if (row.plan_id) return true
  if (row.invoice_ref) return false
  const metadata = parseLinkMetadata(row.metadata)
  if (isArOneTimeMetadata(metadata)) return true
  return !row.metadata || row.metadata.trim() === '' || row.metadata.trim() === '{}'
}

function toArCollectionType(row: DbPaymentLinkRow): string {
  if (row.plan_id) return row.plan_type || 'instalment'
  const metadata = parseLinkMetadata(row.metadata)
  const collectionType = String(metadata.collectionType ?? metadata.collection_type ?? '')
    .trim()
    .toLowerCase()
  return collectionType || 'one_time'
}

function buildArPlanNaturalReplayKey(tenantId: string, body: CreatePlanRequest): string {
  const normalized = [
    tenantId,
    String(body.collectionType || 'one_time')
      .trim()
      .toLowerCase(),
    String(body.description || '')
      .trim()
      .toLowerCase(),
    Number(body.totalAmount || 0).toFixed(2),
    String(body.currency || 'USD')
      .trim()
      .toUpperCase(),
    String(body.contactId || '')
      .trim()
      .toLowerCase(),
    String(body.payerName || '')
      .trim()
      .toLowerCase(),
    String(body.payerPhone || '')
      .trim()
      .toLowerCase(),
    String(body.payerEmail || '')
      .trim()
      .toLowerCase(),
    String(body.instalments ?? '').trim(),
    String(body.cadence || '')
      .trim()
      .toLowerCase(),
    String(body.firstDueDate || '').trim(),
  ].join('|')

  const digest = createHash('sha256').update(normalized).digest('hex')
  return `ar:create-plan:natural:${digest}`
}

function emitArApActionTraceOutbox(params: {
  transactionId: string
  actionType: string
  stageFrom: string | null
  stageTo: string
  actorTenantId: string | null
  actorRole: string | null
  metadata?: Record<string, unknown>
}): void {
  const signature = JSON.stringify({
    transactionId: params.transactionId,
    actionType: params.actionType,
    stageFrom: params.stageFrom,
    stageTo: params.stageTo,
    actorTenantId: params.actorTenantId,
    actorRole: params.actorRole,
    metadata: params.metadata || {},
  })
  const digest = createHash('sha256').update(signature).digest('hex').slice(0, 24)

  outboxService.enqueue({
    topic: 'finance.arap.workflow.action',
    aggregateKey: params.transactionId,
    dedupeKey: `arap:action:${params.transactionId}:${digest}`,
    payload: {
      transactionId: params.transactionId,
      actionType: params.actionType,
      stageFrom: params.stageFrom,
      stageTo: params.stageTo,
      actorTenantId: params.actorTenantId,
      actorRole: params.actorRole,
      metadata: params.metadata || {},
      emittedAt: new Date().toISOString(),
    },
  })
}

function syncArPlanState(db: ReturnType<typeof DatabaseManager.getDatabase>, tenantId: string): void {
  const now = new Date().toISOString()

  const paidWithoutAllocation = db
    .prepare(
      `
        SELECT pl.id AS linkId, pl.provider_ref AS providerRef, pl.amount, pl.currency,
               pi.obligation_id AS obligationId
        FROM ar_plan_installments pi
        JOIN ar_payment_plans p ON p.id = pi.plan_id
        JOIN payment_links pl ON pl.id = pi.payment_link_id
        WHERE p.buyer_tenant_id = ? AND pl.status = 'paid' AND pi.obligation_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM settlement_allocations a
            WHERE a.obligation_id = pi.obligation_id AND a.settlement_type = 'payment_link'
              AND a.settlement_id = pl.id
          )
    `,
    )
    .all(tenantId) as Array<{
    linkId: string
    providerRef?: string
    amount: number
    currency: string
    obligationId: string
  }>
  for (const row of paidWithoutAllocation) {
    businessTransactionService.allocateSettlement({
      obligationId: row.obligationId,
      settlementType: 'payment_link',
      settlementId: row.linkId,
      amount: row.amount,
      currency: row.currency,
      metadata: { providerRef: row.providerRef, repairedBy: 'ar_sync' },
    })
  }

  // Pull payment status into instalments first to keep AR state authoritative.
  db.prepare(
    `
        UPDATE ar_plan_installments
        SET status = 'paid', paid_at = COALESCE(paid_at, ?)
        WHERE id IN (
            SELECT pi.id
            FROM ar_plan_installments pi
            JOIN ar_payment_plans p ON p.id = pi.plan_id
            LEFT JOIN payment_links pl ON pl.id = pi.payment_link_id
            WHERE p.buyer_tenant_id = ?
              AND p.status != 'cancelled'
              AND pl.status = 'paid'
              AND pi.status IN ('pending', 'overdue')
        )
    `,
  ).run(now, tenantId)

  db.prepare(
    `
        UPDATE ar_plan_installments
        SET status = 'overdue'
        WHERE id IN (
            SELECT pi.id
            FROM ar_plan_installments pi
            JOIN ar_payment_plans p ON p.id = pi.plan_id
            LEFT JOIN payment_links pl ON pl.id = pi.payment_link_id
            WHERE p.buyer_tenant_id = ?
              AND p.status = 'active'
              AND pi.status = 'pending'
              AND pi.due_date IS NOT NULL
              AND date(pi.due_date) < date('now')
              AND (pl.status IS NULL OR pl.status IN ('active', 'expired'))
        )
    `,
  ).run(tenantId)

  db.prepare(
    `
        UPDATE ar_payment_plans
        SET
            installments_paid = (
                SELECT COUNT(*)
                FROM ar_plan_installments pi
                WHERE pi.plan_id = ar_payment_plans.id AND pi.status = 'paid'
            ),
            amount_collected = (
                SELECT COALESCE(SUM(pi.amount), 0)
                FROM ar_plan_installments pi
                WHERE pi.plan_id = ar_payment_plans.id AND pi.status = 'paid'
            ),
            status = CASE
                WHEN status = 'cancelled' THEN 'cancelled'
                WHEN (
                    SELECT COUNT(*)
                    FROM ar_plan_installments pi
                    WHERE pi.plan_id = ar_payment_plans.id AND pi.status = 'paid'
                ) >= installments_total THEN 'completed'
                ELSE 'active'
            END,
            updated_at = ?
        WHERE buyer_tenant_id = ?
    `,
  ).run(now, tenantId)

  // Keep mirrored AP invoices in sync so the payer org sees the same workflow stage.
  db.prepare(
    `
        UPDATE ap_invoices
        SET
            status = 'paid',
            balance_due = 0,
            workflow_stage = 'paid',
            updated_at = ?
        WHERE source_type = 'ar_collection'
          AND counterparty_tenant_id = ?
          AND source_payment_link_id IN (
              SELECT id FROM payment_links WHERE status = 'paid'
          )
    `,
  ).run(now, tenantId)

  db.prepare(
    `
        UPDATE ap_invoices
        SET
            status = CASE WHEN status = 'paid' THEN 'paid' ELSE 'overdue' END,
            workflow_stage = CASE WHEN status = 'paid' THEN 'paid' ELSE 'overdue' END,
            updated_at = ?
        WHERE source_type = 'ar_collection'
          AND counterparty_tenant_id = ?
          AND status != 'paid'
          AND source_payment_link_id IN (
              SELECT pi.payment_link_id
              FROM ar_plan_installments pi
              JOIN ar_payment_plans p ON p.id = pi.plan_id
              WHERE p.buyer_tenant_id = ?
                AND pi.status = 'overdue'
          )
    `,
  ).run(now, tenantId, tenantId)

  db.prepare(
    `
        UPDATE ap_invoices
        SET
            status = 'outstanding',
            workflow_stage = 'issued',
            updated_at = ?
        WHERE source_type = 'ar_collection'
          AND counterparty_tenant_id = ?
          AND status != 'paid'
          AND source_payment_link_id NOT IN (
              SELECT pi.payment_link_id
              FROM ar_plan_installments pi
              JOIN ar_payment_plans p ON p.id = pi.plan_id
              WHERE p.buyer_tenant_id = ?
                AND pi.status = 'overdue'
          )
    `,
  ).run(now, tenantId, tenantId)

  db.prepare(
    `
        UPDATE ar_ap_workflow_transactions
        SET
            status = 'paid',
            workflow_stage = 'paid',
            trust_status = 'verified',
            required_action = 'acknowledge_remittance',
            required_actor_role = 'supplier',
            required_proof_type = 'RemittanceAdviceVC',
            last_action_at = ?,
            updated_at = ?
        WHERE collector_tenant_id = ?
          AND source_payment_link_id IN (
              SELECT id FROM payment_links WHERE status = 'paid'
          )
    `,
  ).run(now, now, tenantId)

  db.prepare(
    `
        UPDATE ar_ap_workflow_transactions
        SET
            status = CASE WHEN status = 'paid' THEN 'paid' ELSE 'overdue' END,
            workflow_stage = CASE WHEN status = 'paid' THEN 'paid' ELSE 'overdue' END,
            trust_status = CASE WHEN status = 'paid' THEN trust_status ELSE 'pending' END,
            required_action = CASE WHEN status = 'paid' THEN required_action ELSE 'present_payment_proof' END,
            required_actor_role = CASE WHEN status = 'paid' THEN required_actor_role ELSE 'payer' END,
            required_proof_type = CASE WHEN status = 'paid' THEN required_proof_type ELSE 'PaymentProofVC' END,
            last_action_at = ?,
            updated_at = ?
        WHERE collector_tenant_id = ?
          AND status != 'paid'
          AND source_payment_link_id IN (
              SELECT pi.payment_link_id
              FROM ar_plan_installments pi
              JOIN ar_payment_plans p ON p.id = pi.plan_id
              WHERE p.buyer_tenant_id = ?
                AND pi.status = 'overdue'
          )
    `,
  ).run(now, now, tenantId, tenantId)

  db.prepare(
    `
        UPDATE ar_ap_workflow_transactions
        SET
            status = CASE WHEN status = 'paid' THEN 'paid' ELSE 'pending_payment' END,
            workflow_stage = CASE WHEN status = 'paid' THEN 'paid' ELSE 'issued' END,
            trust_status = CASE WHEN status = 'paid' THEN trust_status ELSE 'pending' END,
            required_action = CASE WHEN status = 'paid' THEN required_action ELSE 'present_payment_proof' END,
            required_actor_role = CASE WHEN status = 'paid' THEN required_actor_role ELSE 'payer' END,
            required_proof_type = CASE WHEN status = 'paid' THEN required_proof_type ELSE 'PaymentProofVC' END,
            last_action_at = ?,
            updated_at = ?
        WHERE collector_tenant_id = ?
          AND status != 'paid'
          AND source_payment_link_id NOT IN (
              SELECT pi.payment_link_id
              FROM ar_plan_installments pi
              JOIN ar_payment_plans p ON p.id = pi.plan_id
              WHERE p.buyer_tenant_id = ?
                AND pi.status = 'overdue'
          )
    `,
  ).run(now, now, tenantId, tenantId)

  // Plan-level AP mirror sync (single AP invoice per installment plan).
  // This keeps one mirrored invoice open as partial/unpaid until the full AR plan settles.
  db.prepare(
    `
        UPDATE ap_invoices
        SET
            balance_due = COALESCE((
                SELECT MAX(p.total_amount - p.amount_collected, 0)
                FROM ar_payment_plans p
                WHERE p.id = ap_invoices.source_plan_id
                  AND p.buyer_tenant_id = ?
            ), balance_due),
            status = COALESCE((
                SELECT CASE
                    WHEN p.status = 'completed' THEN 'paid'
                    WHEN p.amount_collected > 0 THEN 'partial'
                    WHEN EXISTS (
                        SELECT 1 FROM ar_plan_installments pi
                        WHERE pi.plan_id = p.id AND pi.status = 'overdue'
                    ) THEN 'overdue'
                    ELSE 'outstanding'
                END
                FROM ar_payment_plans p
                WHERE p.id = ap_invoices.source_plan_id
                  AND p.buyer_tenant_id = ?
            ), status),
            workflow_stage = COALESCE((
                SELECT CASE
                    WHEN p.status = 'completed' THEN 'paid'
                    WHEN p.amount_collected > 0 THEN 'partial'
                    WHEN EXISTS (
                        SELECT 1 FROM ar_plan_installments pi
                        WHERE pi.plan_id = p.id AND pi.status = 'overdue'
                    ) THEN 'overdue'
                    ELSE 'issued'
                END
                FROM ar_payment_plans p
                WHERE p.id = ap_invoices.source_plan_id
                  AND p.buyer_tenant_id = ?
            ), workflow_stage),
            updated_at = ?
        WHERE source_type = 'ar_collection'
          AND counterparty_tenant_id = ?
          AND source_plan_id IS NOT NULL
    `,
  ).run(tenantId, tenantId, tenantId, now, tenantId)

  // Plan-level workflow transaction sync (single workflow per plan).
  db.prepare(
    `
        UPDATE ar_ap_workflow_transactions
        SET
            status = COALESCE((
                SELECT CASE
                    WHEN p.status = 'completed' THEN 'paid'
                    WHEN p.amount_collected > 0 THEN 'partial_payment'
                    WHEN EXISTS (
                        SELECT 1 FROM ar_plan_installments pi
                        WHERE pi.plan_id = p.id AND pi.status = 'overdue'
                    ) THEN 'overdue'
                    ELSE 'pending_payment'
                END
                FROM ar_payment_plans p
                WHERE p.id = ar_ap_workflow_transactions.source_plan_id
                  AND p.buyer_tenant_id = ?
            ), status),
            workflow_stage = COALESCE((
                SELECT CASE
                    WHEN p.status = 'completed' THEN 'paid'
                    WHEN p.amount_collected > 0 THEN 'partial'
                    WHEN EXISTS (
                        SELECT 1 FROM ar_plan_installments pi
                        WHERE pi.plan_id = p.id AND pi.status = 'overdue'
                    ) THEN 'overdue'
                    ELSE 'issued'
                END
                FROM ar_payment_plans p
                WHERE p.id = ar_ap_workflow_transactions.source_plan_id
                  AND p.buyer_tenant_id = ?
            ), workflow_stage),
            required_action = COALESCE((
                SELECT CASE
                    WHEN p.status = 'completed' THEN 'acknowledge_remittance'
                    ELSE 'present_payment_proof'
                END
                FROM ar_payment_plans p
                WHERE p.id = ar_ap_workflow_transactions.source_plan_id
                  AND p.buyer_tenant_id = ?
            ), required_action),
            required_actor_role = COALESCE((
                SELECT CASE
                    WHEN p.status = 'completed' THEN 'supplier'
                    ELSE 'payer'
                END
                FROM ar_payment_plans p
                WHERE p.id = ar_ap_workflow_transactions.source_plan_id
                  AND p.buyer_tenant_id = ?
            ), required_actor_role),
            required_proof_type = COALESCE((
                SELECT CASE
                    WHEN p.status = 'completed' THEN 'RemittanceAdviceVC'
                    ELSE 'PaymentProofVC'
                END
                FROM ar_payment_plans p
                WHERE p.id = ar_ap_workflow_transactions.source_plan_id
                  AND p.buyer_tenant_id = ?
            ), required_proof_type),
            updated_at = ?,
            last_action_at = ?
        WHERE collector_tenant_id = ?
          AND source_type = 'ar_collection'
          AND source_plan_id IS NOT NULL
    `,
  ).run(tenantId, tenantId, tenantId, tenantId, tenantId, now, now, tenantId)

  // Sync trust_status of the ar_payment_plans table based on installments' transactions
  db.prepare(
    `
        UPDATE ar_payment_plans
        SET trust_status = CASE
            WHEN status = 'completed' THEN 'settled'
            WHEN id IN (
                SELECT DISTINCT pi.plan_id
                FROM ar_plan_installments pi
                JOIN ar_ap_workflow_transactions tx ON tx.source_payment_link_id = pi.payment_link_id
                WHERE tx.trust_status = 'disputed'
            ) THEN 'disputed'
            WHEN id IN (
                SELECT DISTINCT pi.plan_id
                FROM ar_plan_installments pi
                JOIN ar_ap_workflow_transactions tx ON tx.source_payment_link_id = pi.payment_link_id
                WHERE tx.status = 'proof_presented'
            ) THEN 'proof_presented'
            ELSE 'pending'
        END
        WHERE debtor_org_id IS NOT NULL
          AND buyer_tenant_id = ?
    `,
  ).run(tenantId)

  db.prepare(
    `
                UPDATE ar_payment_plans
                SET trust_status = CASE
                        WHEN status = 'completed' THEN 'settled'
                        WHEN id IN (
                                SELECT DISTINCT source_plan_id
                                FROM ar_ap_workflow_transactions
                                WHERE source_type = 'ar_collection'
                                    AND source_plan_id IS NOT NULL
                                    AND trust_status = 'disputed'
                        ) THEN 'disputed'
                        WHEN id IN (
                                SELECT DISTINCT source_plan_id
                                FROM ar_ap_workflow_transactions
                                WHERE source_type = 'ar_collection'
                                    AND source_plan_id IS NOT NULL
                                    AND status = 'proof_presented'
                        ) THEN 'proof_presented'
                        ELSE trust_status
                END,
                updated_at = ?
                WHERE debtor_org_id IS NOT NULL
                    AND buyer_tenant_id = ?
        `,
  ).run(now, tenantId)

  // Hydrate proof and receipt linkage fields for cross-org plan reporting.
  db.prepare(
    `
                UPDATE ar_payment_plans
                SET
                        proof_request_id = COALESCE((
                                SELECT tx.proof_request_id
                                FROM ar_ap_workflow_transactions tx
                                JOIN ar_plan_installments pi ON pi.payment_link_id = tx.source_payment_link_id
                                WHERE pi.plan_id = ar_payment_plans.id
                                    AND tx.proof_request_id IS NOT NULL
                                ORDER BY tx.updated_at DESC
                                LIMIT 1
                        ), proof_request_id),
                        proof_response_id = COALESCE((
                                SELECT tx.proof_response_id
                                FROM ar_ap_workflow_transactions tx
                                JOIN ar_plan_installments pi ON pi.payment_link_id = tx.source_payment_link_id
                                WHERE pi.plan_id = ar_payment_plans.id
                                    AND tx.proof_response_id IS NOT NULL
                                ORDER BY tx.updated_at DESC
                                LIMIT 1
                        ), proof_response_id),
                        proof_presented_at = COALESCE((
                                SELECT COALESCE(tx.consent_timestamp, tx.last_action_at)
                                FROM ar_ap_workflow_transactions tx
                                JOIN ar_plan_installments pi ON pi.payment_link_id = tx.source_payment_link_id
                                WHERE pi.plan_id = ar_payment_plans.id
                                    AND (tx.proof_response_id IS NOT NULL OR tx.status = 'proof_presented')
                                ORDER BY tx.updated_at DESC
                                LIMIT 1
                        ), proof_presented_at),
                        receipt_vc_id = COALESCE((
                                SELECT apr.id
                                FROM ar_plan_installments pi
                                JOIN payment_links pl ON pl.id = pi.payment_link_id
                                JOIN ack_payments ap ON ap.provider_ref = pl.provider_ref
                                JOIN ack_payment_receipts apr ON apr.payment_id = ap.id
                                WHERE pi.plan_id = ar_payment_plans.id
                                ORDER BY apr.issued_at DESC
                                LIMIT 1
                        ), receipt_vc_id),
                        receipt_issued_at = COALESCE((
                                SELECT apr.issued_at
                                FROM ar_plan_installments pi
                                JOIN payment_links pl ON pl.id = pi.payment_link_id
                                JOIN ack_payments ap ON ap.provider_ref = pl.provider_ref
                                JOIN ack_payment_receipts apr ON apr.payment_id = ap.id
                                WHERE pi.plan_id = ar_payment_plans.id
                                ORDER BY apr.issued_at DESC
                                LIMIT 1
                        ), receipt_issued_at),
                        updated_at = ?
                WHERE debtor_org_id IS NOT NULL
                    AND buyer_tenant_id = ?
        `,
  ).run(now, tenantId)
}

type MirrorInvoiceInput = {
  sourcePaymentLinkId: string
  sourcePlanId: string | null
  sourceInstallmentNumber: number | null
  invoiceRef: string
  description: string
  amount: number
  currency: string
  dueDate: string | null
}

type EnsureWorkflowTransactionInput = {
  sourceType: 'ar_collection'
  sourcePlanId: string | null
  sourcePaymentLinkId: string
  apInvoiceId: string
  payerTenantId: string
  collectorTenantId: string
  supplierId: string
  amount: number
  currency: string
}

function appendWorkflowAction(
  db: ReturnType<typeof DatabaseManager.getDatabase>,
  params: {
    transactionId: string
    actionType: string
    stageFrom: string | null
    stageTo: string
    actorTenantId: string | null
    actorRole: string | null
    metadata?: Record<string, unknown>
  },
): void {
  const now = new Date().toISOString()
  db.prepare(
    `
        INSERT INTO ar_ap_workflow_actions
          (id, transaction_id, action_type, stage_from, stage_to, actor_tenant_id, actor_role, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    `ARAPACT-${randomUUID().slice(0, 8).toUpperCase()}`,
    params.transactionId,
    params.actionType,
    params.stageFrom,
    params.stageTo,
    params.actorTenantId,
    params.actorRole,
    params.metadata ? JSON.stringify(params.metadata) : null,
    now,
  )

  emitArApActionTraceOutbox({
    transactionId: params.transactionId,
    actionType: params.actionType,
    stageFrom: params.stageFrom,
    stageTo: params.stageTo,
    actorTenantId: params.actorTenantId,
    actorRole: params.actorRole,
    metadata: params.metadata,
  })
}

function ensureWorkflowTransaction(
  db: ReturnType<typeof DatabaseManager.getDatabase>,
  input: EnsureWorkflowTransactionInput,
): { transactionId: string; created: boolean; requiredActorTenantId: string; requiredActorRole: string } {
  const assignment = orgWorkflowActorService.resolveActor({
    orgTenantId: input.payerTenantId,
    workflowType: 'ap_trust_workflow',
    stageAction: 'present_payment_proof',
  })
  const requiredActorTenantId = assignment.walletTenantId || input.payerTenantId
  const requiredActorRole = assignment.role || 'owner'

  const existing = input.sourcePlanId
    ? (db
        .prepare(
          `
            SELECT id
            FROM ar_ap_workflow_transactions
            WHERE source_type = 'ar_collection'
              AND source_plan_id = ?
            LIMIT 1
        `,
        )
        .get(input.sourcePlanId) as { id?: string } | undefined)
    : (db
        .prepare(
          `
            SELECT id
            FROM ar_ap_workflow_transactions
            WHERE source_payment_link_id = ?
            LIMIT 1
        `,
        )
        .get(input.sourcePaymentLinkId) as { id?: string } | undefined)

  const now = new Date().toISOString()
  if (existing?.id) {
    db.prepare(
      `
            UPDATE ar_ap_workflow_transactions
            SET ap_invoice_id = ?,
                source_plan_id = ?,
                source_payment_link_id = ?,
                supplier_id = ?,
                amount = ?,
                currency = ?,
                status = 'pending_payment',
                workflow_stage = 'issued',
                required_action = 'present_payment_proof',
                required_actor_tenant_id = ?,
                required_actor_role = ?,
                required_proof_type = 'PaymentProofVC',
                last_action_at = ?,
                updated_at = ?
            WHERE id = ?
        `,
    ).run(
      input.apInvoiceId,
      input.sourcePlanId,
      input.sourcePaymentLinkId,
      input.supplierId,
      input.amount,
      input.currency,
      requiredActorTenantId,
      requiredActorRole,
      now,
      now,
      existing.id,
    )
    return { transactionId: existing.id, created: false, requiredActorTenantId, requiredActorRole }
  }

  const transactionId = `ARAPTX-${randomUUID().slice(0, 10).toUpperCase()}`
  db.prepare(
    `
        INSERT INTO ar_ap_workflow_transactions
          (id, source_type, source_plan_id, source_payment_link_id, ap_invoice_id,
           payer_tenant_id, collector_tenant_id, supplier_id, amount, currency,
           status, workflow_stage, trust_status,
           required_action, required_actor_tenant_id, required_actor_role, required_proof_type,
           last_action_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                'pending_payment', 'issued', 'pending',
                'present_payment_proof', ?, 'payer', 'PaymentProofVC',
                ?, ?, ?)
    `,
  ).run(
    transactionId,
    input.sourceType,
    input.sourcePlanId,
    input.sourcePaymentLinkId,
    input.apInvoiceId,
    input.payerTenantId,
    input.collectorTenantId,
    input.supplierId,
    input.amount,
    input.currency,
    requiredActorTenantId,
    now,
    now,
    now,
  )

  db.prepare(
    `
        UPDATE ar_ap_workflow_transactions
        SET required_actor_role = ?
        WHERE id = ?
    `,
  ).run(requiredActorRole, transactionId)

  return { transactionId, created: true, requiredActorTenantId, requiredActorRole }
}

function upsertApWorkflowInboxAssignment(
  db: ReturnType<typeof DatabaseManager.getDatabase>,
  params: {
    transactionId: string
    actorTenantId: string
    actorRole: string
    orgTenantId?: string | null
    requiredAction: string
    requiredProofType?: string | null
  },
): string {
  const now = new Date().toISOString()
  const normalizedOrgTenantId = String(params.orgTenantId || '').trim()
  const orgTenantRecord = normalizedOrgTenantId ? getTenantById(normalizedOrgTenantId) : null
  const contextOrgTenantId = orgTenantRecord?.tenantType === 'ORG' ? normalizedOrgTenantId : null

  const txActor = db
    .prepare(
      `
        SELECT required_actor_tenant_id, required_actor_role, source_plan_id, source_payment_link_id
        FROM ar_ap_workflow_transactions
        WHERE id = ?
        LIMIT 1
    `,
    )
    .get(params.transactionId) as
    | {
        required_actor_tenant_id?: string | null
        required_actor_role?: string | null
        source_plan_id?: string | null
        source_payment_link_id?: string | null
      }
    | undefined

  const actorTenantId =
    String(txActor?.required_actor_tenant_id || params.actorTenantId || '').trim() || params.actorTenantId
  const actorRole = String(txActor?.required_actor_role || params.actorRole || 'owner').trim() || 'owner'

  db.prepare(
    `
        UPDATE wallet_pending_offers
        SET resolved_at = COALESCE(resolved_at, ?),
            accepted_at = COALESCE(accepted_at, ?),
            last_attempt_at = ?
        WHERE source_type = 'ap_workflow_assignment'
          AND source_id = ?
          AND tenant_id != ?
          AND resolved_at IS NULL
    `,
  ).run(now, now, now, params.transactionId, actorTenantId)

  const existing = db
    .prepare(
      `
        SELECT id
        FROM wallet_pending_offers
        WHERE tenant_id = ?
          AND source_type = 'ap_workflow_assignment'
          AND source_id = ?
          AND resolved_at IS NULL
        LIMIT 1
    `,
    )
    .get(actorTenantId, params.transactionId) as { id: string } | undefined

  const metadata = JSON.stringify({
    transactionId: params.transactionId,
    targetOrgTenantId: contextOrgTenantId,
    workflowType: 'ap_trust_workflow',
    requestType: 'ap_workflow',
    requiredAction: params.requiredAction,
    requiredProofType: params.requiredProofType || null,
    assigneeRole: actorRole,
    sourcePlanId: txActor?.source_plan_id || null,
    sourcePaymentLinkId: txActor?.source_payment_link_id || null,
  })
  const pushTitle = 'AP Workflow Action Required'
  const pushBody = `Action '${params.requiredAction}' is ready for you to continue in your organization workflow.`
  const pushActionUrl = contextOrgTenantId
    ? `/inbox?focus=ap-workflow&transactionId=${encodeURIComponent(params.transactionId)}&orgTenantId=${encodeURIComponent(contextOrgTenantId)}`
    : `/inbox?focus=ap-workflow&transactionId=${encodeURIComponent(params.transactionId)}`

  if (existing?.id) {
    db.prepare(
      `
            UPDATE wallet_pending_offers
            SET title = ?, body = ?, metadata = ?, last_attempt_at = ?
            WHERE id = ?
        `,
    ).run(
      'AP Workflow Action Required',
      `Action '${params.requiredAction}' is assigned to you for AP workflow execution.`,
      metadata,
      now,
      existing.id,
    )
    notificationService
      .sendWalletPush({
        title: pushTitle,
        body: pushBody,
        actionUrl: pushActionUrl,
        type: 'generic',
      })
      .catch(() => {
        /* logged in service */
      })
    return existing.id
  }

  const inboxItemId = `apw-${randomUUID().slice(0, 12)}`
  db.prepare(
    `
        INSERT INTO wallet_pending_offers (
            id, tenant_id, issuer_tenant_id, source_type, source_id,
            credential_type, offer_uri, title, body, metadata, created_at,
            attempt_count, last_attempt_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `,
  ).run(
    inboxItemId,
    actorTenantId,
    contextOrgTenantId || normalizedOrgTenantId || actorTenantId,
    'ap_workflow_assignment',
    params.transactionId,
    'WorkflowActionAssignment',
    `ap-workflow://${encodeURIComponent(params.transactionId)}`,
    'AP Workflow Action Required',
    `Action '${params.requiredAction}' is assigned to you for AP workflow execution.`,
    metadata,
    now,
    now,
  )

  outboxService.enqueue({
    topic: 'wallet.vc.offered',
    aggregateKey: actorTenantId,
    dedupeKey: `wpo:${actorTenantId}:ap_workflow_assignment:${params.transactionId}:${params.requiredAction}`,
    payload: {
      tenantId: actorTenantId,
      issuerTenantId: contextOrgTenantId || normalizedOrgTenantId || actorTenantId,
      sourceType: 'ap_workflow_assignment',
      sourceId: params.transactionId,
      credentialType: 'WorkflowActionAssignment',
      offerUri: `ap-workflow://${params.transactionId}`,
      queuedAt: now,
    },
  })

  notificationService
    .sendWalletPush({
      title: pushTitle,
      body: pushBody,
      actionUrl: pushActionUrl,
      type: 'generic',
    })
    .catch(() => {
      /* logged in service */
    })

  return inboxItemId
}

function ensureMirroredSupplier(
  db: ReturnType<typeof DatabaseManager.getDatabase>,
  payerTenantId: string,
  collectorTenantId: string,
  collectorName: string,
): { supplierId: string; supplierName: string } {
  const existing = db
    .prepare(
      `
        SELECT *
        FROM ap_suppliers
        WHERE buyer_tenant_id = ?
          AND supplier_wallet_tenant_id = ?
        ORDER BY created_at ASC
        LIMIT 1
    `,
    )
    .get(payerTenantId, collectorTenantId) as Record<string, unknown> | undefined

  if (existing?.id && typeof existing.id === 'string') {
    return {
      supplierId: existing.id,
      supplierName: String(existing.supplier_name || collectorName),
    }
  }

  const now = new Date().toISOString()
  const payerContact = contactRepository.findByWalletTenantId(payerTenantId, collectorTenantId)
  const supplierId = `SUP-${randomUUID().substring(0, 8).toUpperCase()}`
  const supplierName = payerContact?.name?.trim() || collectorName

  db.prepare(
    `
        INSERT INTO ap_suppliers
          (id, buyer_tenant_id, supplier_name, supplier_phone, supplier_email,
           supplier_wallet_tenant_id, contact_id, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    supplierId,
    payerTenantId,
    supplierName,
    payerContact?.phone ?? null,
    payerContact?.email ?? null,
    collectorTenantId,
    payerContact?.id ?? null,
    'Auto-linked from AR trust workflow',
    now,
    now,
  )

  return { supplierId, supplierName }
}

function mirrorArInvoiceIntoAp(
  db: ReturnType<typeof DatabaseManager.getDatabase>,
  payerTenantId: string,
  collectorTenantId: string,
  supplierId: string,
  input: MirrorInvoiceInput,
): { mirrored: boolean; debtorInboxItemId?: string } {
  const payerTenantType = getTenantById(payerTenantId)?.tenantType || 'USER'
  const orgContextTenantId = payerTenantType === 'ORG' ? payerTenantId : null
  const now = new Date().toISOString()

  const existing = db
    .prepare(
      `
        SELECT id
        FROM ap_invoices
        WHERE buyer_tenant_id = ?
          AND source_type = 'ar_collection'
                    AND (
                        (? IS NOT NULL AND source_plan_id = ?)
                        OR
                        (? IS NULL AND source_payment_link_id = ?)
                    )
        LIMIT 1
        `,
    )
    .get(payerTenantId, input.sourcePlanId, input.sourcePlanId, input.sourcePlanId, input.sourcePaymentLinkId) as
    | { id?: string }
    | undefined

  if (existing?.id) {
    // Keep AP mirror identity linkage aligned when a source payment link is reprocessed
    // (for example, contact linkage changes from personal wallet to org tenant).
    db.prepare(
      `
            UPDATE ap_invoices
            SET buyer_tenant_id = ?,
                supplier_id = ?,
                counterparty_tenant_id = ?,
                source_plan_id = COALESCE(?, source_plan_id),
                updated_at = ?
            WHERE id = ?
        `,
    ).run(payerTenantId, supplierId, collectorTenantId, input.sourcePlanId, now, existing.id)

    const tx = ensureWorkflowTransaction(db, {
      sourceType: 'ar_collection',
      sourcePlanId: input.sourcePlanId,
      sourcePaymentLinkId: input.sourcePaymentLinkId,
      apInvoiceId: existing.id,
      payerTenantId,
      collectorTenantId,
      supplierId,
      amount: input.amount,
      currency: input.currency,
    })

    const inboxItemId = upsertApWorkflowInboxAssignment(db, {
      transactionId: tx.transactionId,
      actorTenantId: tx.requiredActorTenantId,
      actorRole: tx.requiredActorRole,
      orgTenantId: orgContextTenantId,
      requiredAction: 'present_payment_proof',
      requiredProofType: 'PaymentProofVC',
    })

    if (tx.created) {
      appendWorkflowAction(db, {
        transactionId: tx.transactionId,
        actionType: 'ar_issued',
        stageFrom: null,
        stageTo: 'issued',
        actorTenantId: collectorTenantId,
        actorRole: 'collector',
        metadata: {
          sourcePaymentLinkId: input.sourcePaymentLinkId,
          sourcePlanId: input.sourcePlanId,
        },
      })
    }
    return { mirrored: false, debtorInboxItemId: inboxItemId }
  }

  const id = `APINV-${randomUUID().substring(0, 8).toUpperCase()}`
  const detail = input.description ? ` · ${input.description}` : ''

  db.prepare(
    `
        INSERT INTO ap_invoices
          (id, buyer_tenant_id, supplier_id, invoice_ref, description,
           amount, currency, due_date, status, balance_due, created_at, updated_at,
           source_type, source_plan_id, source_payment_link_id, source_installment_number,
           counterparty_tenant_id, workflow_stage, last_action_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'outstanding', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    id,
    payerTenantId,
    supplierId,
    input.invoiceRef,
    `AR mirror${detail}`,
    input.amount,
    input.currency,
    input.dueDate,
    input.amount,
    now,
    now,
    'ar_collection',
    input.sourcePlanId,
    input.sourcePaymentLinkId,
    input.sourceInstallmentNumber,
    collectorTenantId,
    'issued',
    now,
  )

  const tx = ensureWorkflowTransaction(db, {
    sourceType: 'ar_collection',
    sourcePlanId: input.sourcePlanId,
    sourcePaymentLinkId: input.sourcePaymentLinkId,
    apInvoiceId: id,
    payerTenantId,
    collectorTenantId,
    supplierId,
    amount: input.amount,
    currency: input.currency,
  })

  const inboxItemId = upsertApWorkflowInboxAssignment(db, {
    transactionId: tx.transactionId,
    actorTenantId: tx.requiredActorTenantId,
    actorRole: tx.requiredActorRole,
    orgTenantId: orgContextTenantId,
    requiredAction: 'present_payment_proof',
    requiredProofType: 'PaymentProofVC',
  })

  if (tx.created) {
    appendWorkflowAction(db, {
      transactionId: tx.transactionId,
      actionType: 'ar_issued',
      stageFrom: null,
      stageTo: 'issued',
      actorTenantId: collectorTenantId,
      actorRole: 'collector',
      metadata: {
        sourcePaymentLinkId: input.sourcePaymentLinkId,
        sourcePlanId: input.sourcePlanId,
        apInvoiceId: id,
      },
    })
  }

  return { mirrored: true, debtorInboxItemId: inboxItemId }
}

function mirrorArWorkflowIntoCounterpartyAp(params: {
  db: ReturnType<typeof DatabaseManager.getDatabase>
  collectorTenantId: string
  contactId?: string
  payerName?: string
  planId?: string | null
  description: string
  currency: string
  links: Array<{ linkId: string; installmentNumber: number; amount: number; dueDate: string | null }>
}): {
  mirrored: boolean
  payerTenantId?: string
  mirroredInvoices: number
  debtorInboxItemId?: string
  debtorContactId?: string
  debtorOrgName?: string
} {
  const resolveOrgTenantForWalletTenant = (
    db: ReturnType<typeof DatabaseManager.getDatabase>,
    walletTenantId: string,
    collectorTenantId: string,
  ): { tenantId: string; isOrg: boolean } => {
    const row = db
      .prepare(
        `
                        SELECT m.org_tenant_id as orgTenantId
                        FROM ssi_users u
                        INNER JOIN org_memberships m ON m.user_id = u.id
                        WHERE u.tenant_id = ?
                            AND m.status = 'active'
                            AND m.org_tenant_id != ?
                        ORDER BY
                            CASE LOWER(m.role)
                                WHEN 'owner' THEN 1
                                WHEN 'admin' THEN 2
                                WHEN 'approver' THEN 3
                                WHEN 'manager' THEN 4
                                WHEN 'finance_manager' THEN 5
                                WHEN 'accountant' THEN 6
                                WHEN 'issuer' THEN 7
                                ELSE 99
                            END,
                            datetime(m.updated_at) DESC
                        LIMIT 1
                `,
      )
      .get(walletTenantId, collectorTenantId) as { orgTenantId?: string } | undefined

    const normalized = String(row?.orgTenantId || '').trim()
    if (normalized) {
      return { tenantId: normalized, isOrg: true }
    }

    return { tenantId: walletTenantId, isOrg: false }
  }

  const contactId = params.contactId?.trim()
  const payerName = params.payerName?.trim()

  let payerContact = contactId ? contactRepository.findByIdInOrg(contactId, params.collectorTenantId) : undefined

  if (!payerContact && payerName) {
    const row = params.db
      .prepare(
        `
            SELECT id
            FROM org_contacts
            WHERE org_tenant_id = ?
              AND wallet_tenant_id IS NOT NULL
              AND LOWER(name) = LOWER(?)
            ORDER BY updated_at DESC
            LIMIT 1
        `,
      )
      .get(params.collectorTenantId, payerName) as { id?: string } | undefined
    if (row?.id) {
      payerContact = contactRepository.findByIdInOrg(row.id, params.collectorTenantId)
    }
  }

  const payerWalletTenantId = payerContact?.walletTenantId
  if (!payerWalletTenantId || payerWalletTenantId === params.collectorTenantId) {
    return { mirrored: false, mirroredInvoices: 0 }
  }

  const payerResolution = resolveOrgTenantForWalletTenant(params.db, payerWalletTenantId, params.collectorTenantId)
  const payerTenantId = payerResolution.tenantId
  if (!payerTenantId || payerTenantId === params.collectorTenantId) {
    return { mirrored: false, mirroredInvoices: 0 }
  }

  const debtorOrgName = getTenantById(payerTenantId)?.label || payerContact?.name || payerName || 'Counterparty'

  const collectorName = getTenantById(params.collectorTenantId)?.label || 'Counterparty'
  const { supplierId } = ensureMirroredSupplier(params.db, payerTenantId, params.collectorTenantId, collectorName)

  let mirroredInvoices = 0
  let debtorInboxItemId: string | undefined = undefined

  if (params.planId) {
    const aggregateAmount = params.links.reduce((sum, link) => sum + link.amount, 0)
    const canonicalLink = params.links[0]
    const dueDate =
      params.links
        .map((link) => link.dueDate)
        .filter((value): value is string => Boolean(value))
        .sort()[0] || null

    if (canonicalLink) {
      const result = mirrorArInvoiceIntoAp(params.db, payerTenantId, params.collectorTenantId, supplierId, {
        sourcePaymentLinkId: canonicalLink.linkId,
        sourcePlanId: params.planId,
        sourceInstallmentNumber: null,
        invoiceRef: `AR-${params.planId}`,
        description: params.description,
        amount: aggregateAmount,
        currency: params.currency,
        dueDate,
      })
      if (result.mirrored) mirroredInvoices += 1
      if (result.debtorInboxItemId) {
        debtorInboxItemId = result.debtorInboxItemId
      }
    }
  } else {
    for (const link of params.links) {
      const invRefBase = params.planId || link.linkId
      const invoiceRef = `AR-${invRefBase}-${String(link.installmentNumber).padStart(2, '0')}`
      const result = mirrorArInvoiceIntoAp(params.db, payerTenantId, params.collectorTenantId, supplierId, {
        sourcePaymentLinkId: link.linkId,
        sourcePlanId: null,
        sourceInstallmentNumber: link.installmentNumber,
        invoiceRef,
        description: params.description,
        amount: link.amount,
        currency: params.currency,
        dueDate: link.dueDate,
      })
      if (result.mirrored) mirroredInvoices += 1
      if (!debtorInboxItemId && result.debtorInboxItemId) {
        debtorInboxItemId = result.debtorInboxItemId
      }
    }
  }

  return {
    mirrored: mirroredInvoices > 0,
    payerTenantId,
    mirroredInvoices,
    debtorInboxItemId,
    debtorContactId: payerContact?.id,
    debtorOrgName,
  }
}

// ─── Controller ───────────────────────────────────────────────────────────────

@Route('api/finance/ar')
@Tags('Accounts Receivable')
export class ArController extends Controller {
  // =========================================================================
  // GET /summary — AR dashboard stats
  // =========================================================================

  @Get('summary')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async getArSummary(@Request() req: ExRequest): Promise<Record<string, unknown>> {
    try {
      const tenantId = getTenantId(req)
      const db = DatabaseManager.getDatabase()
      syncArPlanState(db, tenantId)

      const oneTimeRows = db
        .prepare(
          `
                SELECT
                    pl.id,
                    pl.status,
                    pl.amount,
                    pl.metadata,
                    pi.plan_id
                FROM payment_links pl
                LEFT JOIN ar_plan_installments pi ON pi.payment_link_id = pl.id
                WHERE pl.merchant_id = ?
            `,
        )
        .all(tenantId) as DbPaymentLinkRow[]

      const arOneTimeRows = oneTimeRows.filter((row) => !row.plan_id && isArCollectionRow(row))
      const linkStats = {
        total: arOneTimeRows.length,
        collected: arOneTimeRows
          .filter((row) => row.status === 'paid')
          .reduce((sum, row) => sum + (row.amount || 0), 0),
        outstanding: arOneTimeRows
          .filter((row) => row.status === 'active')
          .reduce((sum, row) => sum + (row.amount || 0), 0),
      }

      const planStats = db
        .prepare(
          `
                SELECT
                    COUNT(*) AS total,
                    COUNT(CASE WHEN status = 'active' THEN 1 END) AS active,
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) AS completed,
                    COALESCE(SUM(total_amount), 0) AS total_value,
                    COALESCE(SUM(amount_collected), 0) AS amount_collected
                FROM ar_payment_plans
                WHERE buyer_tenant_id = ?
            `,
        )
        .get(tenantId) as any

      const overdueStats = db
        .prepare(
          `
                SELECT COUNT(*) AS overdue
                FROM ar_plan_installments pi
                JOIN ar_payment_plans p ON pi.plan_id = p.id
                WHERE p.buyer_tenant_id = ? AND pi.status = 'overdue'
            `,
        )
        .get(tenantId) as any

      return {
        oneTimeLinks: {
          total: linkStats?.total ?? 0,
          collected: linkStats?.collected ?? 0,
          outstanding: linkStats?.outstanding ?? 0,
        },
        plans: {
          total: planStats?.total ?? 0,
          active: planStats?.active ?? 0,
          completed: planStats?.completed ?? 0,
          totalValue: planStats?.total_value ?? 0,
          amountCollected: planStats?.amount_collected ?? 0,
          outstanding: (planStats?.total_value ?? 0) - (planStats?.amount_collected ?? 0),
        },
        overdueInstalments: overdueStats?.overdue ?? 0,
      }
    } catch (error) {
      if (error instanceof StatusException) {
        this.setStatus(error.status)
        return { error: error.message }
      }
      this.setStatus(500)
      return { error: getErrorMessage(error) }
    }
  }

  // =========================================================================
  // POST /plans — Create instalment or recurring plan
  // =========================================================================

  @Post('plans')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async createPlan(
    @Body() body: CreatePlanRequest,
    @Request() req: ExRequest,
  ): Promise<Record<string, unknown>> {
    try {
      assertOrgRole(req)
      const tenantId = getTenantId(req)
      orgSetupProfileService.assertModule(tenantId, 'collections')
      const db = DatabaseManager.getDatabase()
      const now = new Date().toISOString()

      const collectionType = body.collectionType || 'one_time'
      const totalAmount = body.totalAmount
      const currency = body.currency || 'USD'
      const payerName = body.payerName || ''
      const payerPhone = body.payerPhone || ''
      const payerEmail = body.payerEmail || ''
      const numInstalments = collectionType === 'one_time' ? 1 : Math.max(1, body.instalments ?? 1)
      const instAmount = Math.round((totalAmount / numInstalments) * 100) / 100
      const ttlHours = 336
      const expiryDate = new Date(Date.now() + ttlHours * 3_600_000).toISOString()

      const idempotencyAction = `ar:create-plan:${collectionType}`
      const idempotencyCheck = IdempotencyGuard.guard(db, req, tenantId, idempotencyAction)
      if (idempotencyCheck.duplicate) {
        return idempotencyCheck.response
      }

      const naturalReplayKey = buildArPlanNaturalReplayKey(tenantId, body)
      const naturalReplay = IdempotencyGuard.checkAndReturn(db, naturalReplayKey, tenantId, idempotencyAction)
      if (naturalReplay) {
        return naturalReplay.response
      }

      // ── One-time: generate a single payment link, no plan record ──────
      if (collectionType === 'one_time') {
        const linkId = randomUUID()
        const { code, url } = ShortlinkService.createPaymentLink(
          linkId,
          {
            amount: totalAmount,
            currency,
            description: body.description,
          },
          ttlHours,
        )

        db.prepare(
          `
                    INSERT INTO payment_links
                      (id, merchant_id, description, amount, currency, status, expiry,
                       shortlink_code, shortlink_url, metadata, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)
                `,
        ).run(
          linkId,
          tenantId,
          body.description,
          totalAmount,
          currency,
          expiryDate,
          code,
          url,
          JSON.stringify({
            arModule: true,
            collectionType: 'one_time',
            payerName,
            payerPhone,
            payerEmail,
            contactId: body.contactId || null,
          }),
          now,
          now,
        )
        const transactionId = businessTransactionService.ensureTransaction({
          tenantId,
          transactionType: 'sale',
          sourceType: 'payment_link',
          sourceId: linkId,
          title: body.description,
          reference: linkId,
          metadata: { collectionType: 'one_time' },
        })
        const obligationId = businessTransactionService.ensureObligation({
          transactionId,
          tenantId,
          direction: 'receivable',
          sourceType: 'payment_link',
          sourceId: linkId,
          description: body.description,
          amount: totalAmount,
          currency,
          dueDate: expiryDate,
          counterpartyName: payerName || undefined,
          metadata: { collectionType: 'one_time', contactId: body.contactId || undefined },
        })
        db.prepare(`UPDATE payment_links SET business_transaction_id = ?, obligation_id = ? WHERE id = ?`).run(
          transactionId,
          obligationId,
          linkId,
        )
        businessTransactionService.link(transactionId, 'payment_link', linkId, 'collection_attempt')

        const apMirror = mirrorArWorkflowIntoCounterpartyAp({
          db,
          collectorTenantId: tenantId,
          contactId: body.contactId,
          payerName,
          planId: null,
          description: body.description,
          currency,
          links: [{ linkId, installmentNumber: 1, amount: totalAmount, dueDate: null }],
        })

        if (payerPhone || payerEmail) {
          notificationService
            .dispatchContactNotification({
              tenantId,
              dedupeKey: `ar-link:${linkId}`,
              contact: { name: payerName, phone: payerPhone, email: payerEmail },
              type: 'payment_link',
              url,
              amount: totalAmount,
              currency,
            })
            .catch((e) => logger.warn({ err: e }, 'Notification failed for one-time AR link'))
        }

        if (apMirror.payerTenantId) {
          const metadata = {
            arModule: true,
            collectionType: 'one_time',
            payerName,
            payerPhone,
            payerEmail,
            contactId: body.contactId || null,
            debtorOrgId: apMirror.payerTenantId,
            debtorOrgName: apMirror.debtorOrgName || null,
            debtorContactId: apMirror.debtorContactId || null,
            debtorInboxItemId: apMirror.debtorInboxItemId || null,
          }
          db.prepare('UPDATE payment_links SET metadata = ?, updated_at = ? WHERE id = ?').run(
            JSON.stringify(metadata),
            now,
            linkId,
          )
        }

        const responsePayload = {
          collectionType: 'one_time',
          linkId,
          shortlinkCode: code,
          shortlinkUrl: url,
          amount: totalAmount,
          currency,
          apMirror,
        }

        if (idempotencyCheck.key) {
          IdempotencyGuard.record(db, idempotencyCheck.key, tenantId, idempotencyAction, responsePayload)
        }
        IdempotencyGuard.record(db, naturalReplayKey, tenantId, idempotencyAction, responsePayload)
        return responsePayload
      }

      // ── Instalment / recurring: create plan + N payment link rows ─────
      const planId = `ARPLAN-${randomUUID().slice(0, 8).toUpperCase()}`
      const baseDate = body.firstDueDate ? new Date(body.firstDueDate) : new Date()

      db.prepare(
        `
                INSERT INTO ar_payment_plans
                  (id, buyer_tenant_id, payer_contact_id, payer_name, payer_phone, payer_email,
                   description, total_amount, currency, plan_type, cadence,
                   installments_total, installments_paid, amount_collected, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'active', ?, ?)
            `,
      ).run(
        planId,
        tenantId,
        body.contactId || null,
        payerName,
        payerPhone,
        payerEmail,
        body.description,
        totalAmount,
        currency,
        collectionType,
        body.cadence || null,
        numInstalments,
        now,
        now,
      )
      const transactionId = businessTransactionService.ensureTransaction({
        tenantId,
        transactionType: 'collection_plan',
        sourceType: 'ar_plan',
        sourceId: planId,
        title: body.description,
        reference: planId,
        metadata: { collectionType, cadence: body.cadence || undefined },
      })
      db.prepare(`UPDATE ar_payment_plans SET business_transaction_id = ? WHERE id = ?`).run(transactionId, planId)

      const createdLinks: any[] = []

      for (let i = 0; i < numInstalments; i++) {
        const linkId = randomUUID()
        const instId = `ARINST-${randomUUID().slice(0, 8).toUpperCase()}`
        const dueDate = body.cadence
          ? nextDueDate(baseDate, body.cadence, i)
          : body.firstDueDate
            ? nextDueDate(baseDate, 'monthly', i)
            : ''

        const instDescription = `${body.description} — Instalment ${i + 1} of ${numInstalments}`

        const { code, url } = ShortlinkService.createPaymentLink(
          linkId,
          {
            amount: instAmount,
            currency,
            description: instDescription,
          },
          ttlHours,
        )

        db.prepare(
          `
                    INSERT INTO payment_links
                      (id, merchant_id, description, amount, currency, status, expiry,
                       shortlink_code, shortlink_url, metadata, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)
                `,
        ).run(
          linkId,
          tenantId,
          instDescription,
          instAmount,
          currency,
          expiryDate,
          code,
          url,
          JSON.stringify({
            arModule: true,
            collectionType,
            planId,
            instalment: i + 1,
            totalInstalments: numInstalments,
            payerName,
            payerPhone,
            payerEmail,
            contactId: body.contactId || null,
            dueDate: dueDate || null,
          }),
          now,
          now,
        )

        db.prepare(
          `
                    INSERT INTO ar_plan_installments
                      (id, plan_id, payment_link_id, installment_number, amount, due_date, status, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
                `,
        ).run(instId, planId, linkId, i + 1, instAmount, dueDate || null, now)
        const obligationId = businessTransactionService.ensureObligation({
          transactionId,
          tenantId,
          direction: 'receivable',
          sourceType: 'ar_installment',
          sourceId: instId,
          description: instDescription,
          amount: instAmount,
          currency,
          dueDate: dueDate || undefined,
          counterpartyName: payerName || undefined,
          metadata: { planId, installmentNumber: i + 1 },
        })
        db.prepare(`UPDATE ar_plan_installments SET obligation_id = ? WHERE id = ?`).run(obligationId, instId)
        db.prepare(`UPDATE payment_links SET business_transaction_id = ?, obligation_id = ? WHERE id = ?`).run(
          transactionId,
          obligationId,
          linkId,
        )
        businessTransactionService.link(transactionId, 'payment_link', linkId, 'collection_attempt')

        createdLinks.push({
          instalment: i + 1,
          linkId,
          shortlinkCode: code,
          shortlinkUrl: url,
          dueDate: dueDate || null,
          amount: instAmount,
        })
      }

      // Notify payer of first instalment
      if ((payerPhone || payerEmail) && createdLinks.length > 0) {
        notificationService
          .dispatchContactNotification({
            tenantId,
            dedupeKey: `ar-plan:${planId}`,
            contact: { name: payerName, phone: payerPhone, email: payerEmail },
            type: 'payment_link',
            url: createdLinks[0].shortlinkUrl,
            amount: totalAmount,
            currency,
          })
          .catch((e) => logger.warn({ err: e }, 'Notification failed for AR plan'))
      }

      const apMirror = mirrorArWorkflowIntoCounterpartyAp({
        db,
        collectorTenantId: tenantId,
        contactId: body.contactId,
        payerName,
        planId,
        description: body.description,
        currency,
        links: createdLinks.map((item) => ({
          linkId: item.linkId,
          installmentNumber: item.instalment,
          amount: item.amount,
          dueDate: item.dueDate,
        })),
      })

      if (apMirror.payerTenantId) {
        db.prepare(
          `
                    UPDATE ar_payment_plans
                    SET debtor_org_id = ?,
                        debtor_org_name = COALESCE(?, debtor_org_name),
                        debtor_contact_id = COALESCE(?, debtor_contact_id),
                        debtor_inbox_item_id = COALESCE(?, debtor_inbox_item_id),
                        debtor_notified_at = CASE WHEN ? IS NOT NULL THEN ? ELSE debtor_notified_at END,
                        trust_status = CASE WHEN trust_status IS NULL OR trust_status = '' THEN 'pending' ELSE trust_status END,
                        updated_at = ?
                    WHERE id = ?
                      AND buyer_tenant_id = ?
                `,
        ).run(
          apMirror.payerTenantId,
          apMirror.debtorOrgName || null,
          apMirror.debtorContactId || null,
          apMirror.debtorInboxItemId || null,
          apMirror.debtorInboxItemId || null,
          now,
          now,
          planId,
          tenantId,
        )
      }

      logger.info({ planId, tenantId, numInstalments, totalAmount, apMirror }, 'AR payment plan created')
      const responsePayload = {
        planId,
        contactId: body.contactId || null,
        collectionType,
        description: body.description,
        totalAmount,
        currency,
        numInstalments,
        instalmentAmount: instAmount,
        instalments: createdLinks,
        apMirror,
      }

      if (idempotencyCheck.key) {
        IdempotencyGuard.record(db, idempotencyCheck.key, tenantId, idempotencyAction, responsePayload)
      }
      IdempotencyGuard.record(db, naturalReplayKey, tenantId, idempotencyAction, responsePayload)
      return responsePayload
    } catch (error) {
      if (error instanceof StatusException) {
        this.setStatus(error.status)
        return { error: error.message }
      }
      this.setStatus(500)
      return { error: getErrorMessage(error) }
    }
  }

  // =========================================================================
  // GET /plans — list plans
  // =========================================================================

  @Get('plans')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async listPlans(
    @Request() req: ExRequest,
    @Query() status?: string,
    @Query() planType?: string,
  ): Promise<Record<string, unknown>[] | { error: string }> {
    try {
      const tenantId = getTenantId(req)
      const db = DatabaseManager.getDatabase()
      syncArPlanState(db, tenantId)
      let query = 'SELECT * FROM ar_payment_plans WHERE buyer_tenant_id = ?'
      const params: unknown[] = [tenantId]
      if (status) {
        query += ' AND status = ?'
        params.push(status)
      }
      if (planType) {
        query += ' AND plan_type = ?'
        params.push(planType)
      }
      query += ' ORDER BY created_at DESC'
      return db.prepare(query).all(...params) as Record<string, unknown>[]
    } catch (error) {
      this.setStatus(500)
      return { error: getErrorMessage(error) }
    }
  }

  // =========================================================================
  // GET /plans/:planId — plan detail with instalments
  // =========================================================================

  @Get('plans/{planId}')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async getPlanDetail(
    @Path() planId: string,
    @Request() req: ExRequest,
  ): Promise<Record<string, unknown> | { error: string }> {
    try {
      const tenantId = getTenantId(req)
      const db = DatabaseManager.getDatabase()
      syncArPlanState(db, tenantId)

      const plan = db
        .prepare('SELECT * FROM ar_payment_plans WHERE id = ? AND buyer_tenant_id = ?')
        .get(planId, tenantId)
      if (!plan) {
        this.setStatus(404)
        return { error: 'Plan not found' }
      }

      const instalments = db
        .prepare(
          `
                SELECT pi.*, pl.status AS link_status
                FROM ar_plan_installments pi
                LEFT JOIN payment_links pl ON pi.payment_link_id = pl.id
                WHERE pi.plan_id = ?
                ORDER BY pi.installment_number
            `,
        )
        .all(planId) as any[]

      // Sync instalments that have been paid via payment_links
      const now = new Date().toISOString()
      for (const inst of instalments) {
        if (inst.link_status === 'paid' && inst.status !== 'paid') {
          db.prepare('UPDATE ar_plan_installments SET status = ?, paid_at = ? WHERE id = ?').run('paid', now, inst.id)
          inst.status = 'paid'
          inst.paid_at = now
        }
      }

      const paidCount = instalments.filter((i) => i.status === 'paid').length
      const amtCollected = instalments.filter((i) => i.status === 'paid').reduce((s, i) => s + i.amount, 0)
      const planTotal = (plan as any).installments_total

      const collections = db
        .prepare(
          `
                SELECT
                    pl.*,
                    pi.installment_number,
                    pi.plan_id,
                    pi.status AS instalment_status,
                    p.plan_type,
                    p.installments_total,
                    p.payer_name
                FROM payment_links pl
                LEFT JOIN ar_plan_installments pi ON pi.payment_link_id = pl.id
                LEFT JOIN ar_payment_plans p ON pi.plan_id = p.id
                WHERE pi.plan_id = ?
                ORDER BY pi.installment_number ASC, pl.created_at DESC
            `,
        )
        .all(planId) as any[]

      const workflowTransactions = db
        .prepare(
          `
                SELECT *
                FROM ar_ap_workflow_transactions
                WHERE source_plan_id = ?
                ORDER BY updated_at DESC
            `,
        )
        .all(planId) as Record<string, unknown>[]

      const latestArApTx = workflowTransactions.find((tx) => String(tx.source_type || '') === 'ar_collection')
      let counterpartySettlement: Record<string, unknown> | null = null
      if (latestArApTx) {
        const apInvoiceId = String(latestArApTx.ap_invoice_id || '').trim() || null
        const counterpartInvoice = apInvoiceId
          ? (db
              .prepare(
                `
                        SELECT ai.id, ai.invoice_ref, ai.amount, ai.currency, ai.status, ai.balance_due, ai.workflow_stage,
                               ai.supplier_id, s.supplier_name
                        FROM ap_invoices ai
                        LEFT JOIN ap_suppliers s ON s.id = ai.supplier_id
                        WHERE ai.id = ?
                        LIMIT 1
                    `,
              )
              .get(apInvoiceId) as Record<string, unknown> | undefined)
          : undefined

        counterpartySettlement = {
          settlementType: 'ar_ap_counterparty',
          direction: 'receivable',
          sourceType: String(latestArApTx.source_type || 'ar_collection'),
          sourcePlanId: planId,
          sourcePaymentLinkId: String(latestArApTx.source_payment_link_id || '') || null,
          amount: Number(latestArApTx.amount || (plan as any).total_amount || 0),
          currency: String(latestArApTx.currency || (plan as any).currency || 'USD'),
          workflow: {
            transactionId: String(latestArApTx.id || ''),
            status: String(latestArApTx.status || ''),
            stage: String(latestArApTx.workflow_stage || ''),
            trustStatus: String(latestArApTx.trust_status || ''),
            requiredAction: String(latestArApTx.required_action || '') || null,
            requiredActorRole: String(latestArApTx.required_actor_role || '') || null,
            requiredProofType: String(latestArApTx.required_proof_type || '') || null,
          },
          arSide: {
            planId,
            planStatus: String((plan as any).status || ''),
            totalAmount: Number((plan as any).total_amount || 0),
            amountCollected: Number((plan as any).amount_collected || 0),
            outstandingAmount: Math.max(
              0,
              Number((plan as any).total_amount || 0) - Number((plan as any).amount_collected || 0),
            ),
          },
          apSide: {
            invoiceId: apInvoiceId,
            invoiceRef: counterpartInvoice ? String(counterpartInvoice.invoice_ref || '') || null : null,
            invoiceStatus: counterpartInvoice ? String(counterpartInvoice.status || '') : null,
            invoiceWorkflowStage: counterpartInvoice ? String(counterpartInvoice.workflow_stage || '') : null,
            supplierId: counterpartInvoice ? String(counterpartInvoice.supplier_id || '') || null : null,
            supplierName: counterpartInvoice ? String(counterpartInvoice.supplier_name || '') || null : null,
            balanceDue: counterpartInvoice ? Number(counterpartInvoice.balance_due || 0) : null,
          },
          links: {
            arPlanPath: `/finance/ar/${encodeURIComponent(planId)}`,
            apSupplierPath: counterpartInvoice?.supplier_id
              ? `/finance/payables/${encodeURIComponent(String(counterpartInvoice.supplier_id))}`
              : null,
          },
        }
      }

      const actionLookup = db.prepare(`
                SELECT *
                FROM ar_ap_workflow_actions
                WHERE transaction_id = ?
                ORDER BY created_at DESC
            `)

      db.prepare(
        `
                UPDATE ar_payment_plans
                SET installments_paid = ?, amount_collected = ?,
                    status = CASE WHEN ? >= ? THEN 'completed' ELSE status END,
                    updated_at = ?
                WHERE id = ?
            `,
      ).run(paidCount, amtCollected, paidCount, planTotal, now, planId)

      return {
        ...(plan as any),
        installments_paid: paidCount,
        amount_collected: amtCollected,
        instalments,
        collections: collections.map((row) => ({
          ...row,
          collectionType: toArCollectionType(row as DbPaymentLinkRow),
          metadata: row.metadata
            ? (() => {
                try {
                  return JSON.parse(row.metadata)
                } catch {
                  return {}
                }
              })()
            : {},
        })),
        counterpartySettlement,
        workflowTransactions: workflowTransactions.map((tx) => ({
          ...tx,
          recentActions: (actionLookup.all(String(tx.id || '')) as any[]).map((action) => ({
            id: action.id,
            actionType: action.action_type,
            stageFrom: action.stage_from,
            stageTo: action.stage_to,
            actorTenantId: action.actor_tenant_id,
            actorRole: action.actor_role,
            metadata: action.metadata
              ? (() => {
                  try {
                    return JSON.parse(action.metadata)
                  } catch {
                    return {}
                  }
                })()
              : {},
            createdAt: action.created_at,
          })),
        })),
      }
    } catch (error) {
      if (error instanceof StatusException) {
        this.setStatus(error.status)
        return { error: error.message }
      }
      this.setStatus(500)
      return { error: getErrorMessage(error) }
    }
  }

  // =========================================================================
  // PATCH /plans/:planId/cancel
  // =========================================================================

  @Patch('plans/{planId}/cancel')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async cancelPlan(
    @Path() planId: string,
    @Request() req: ExRequest,
  ): Promise<Record<string, unknown> | { error: string }> {
    try {
      assertOrgRole(req)
      const tenantId = getTenantId(req)
      const db = DatabaseManager.getDatabase()

      const idempotencyAction = `ar:cancel-plan:${planId}`
      const idempotencyCheck = IdempotencyGuard.guard(db, req, tenantId, idempotencyAction)
      if (idempotencyCheck.duplicate) {
        return idempotencyCheck.response
      }

      const naturalReplayKey = `ar:cancel-plan:natural:${tenantId}:${planId}`
      const naturalReplay = IdempotencyGuard.checkAndReturn(db, naturalReplayKey, tenantId, idempotencyAction)
      if (naturalReplay) {
        return naturalReplay.response
      }

      const plan = db
        .prepare('SELECT * FROM ar_payment_plans WHERE id = ? AND buyer_tenant_id = ?')
        .get(planId, tenantId) as any
      if (!plan) {
        this.setStatus(404)
        return { error: 'Plan not found' }
      }
      if (plan.status === 'cancelled') {
        this.setStatus(409)
        return { error: 'Plan already cancelled' }
      }

      const now = new Date().toISOString()
      db.prepare('UPDATE ar_payment_plans SET status = ?, updated_at = ? WHERE id = ?').run('cancelled', now, planId)

      // Cancel pending payment links for this plan's instalments
      const pendingLinks = db
        .prepare(
          `
                SELECT payment_link_id FROM ar_plan_installments
                WHERE plan_id = ? AND status = 'pending' AND payment_link_id IS NOT NULL
            `,
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

      logger.info({ planId, tenantId }, 'AR plan cancelled')
      const responsePayload = { planId, status: 'cancelled' }
      if (idempotencyCheck.key) {
        IdempotencyGuard.record(db, idempotencyCheck.key, tenantId, idempotencyAction, responsePayload)
      }
      IdempotencyGuard.record(db, naturalReplayKey, tenantId, idempotencyAction, responsePayload)
      return responsePayload
    } catch (error) {
      if (error instanceof StatusException) {
        this.setStatus(error.status)
        return { error: error.message }
      }
      this.setStatus(500)
      return { error: getErrorMessage(error) }
    }
  }

  @Post('plans/{planId}/installments/{installmentId}/remind')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async remindInstallment(
    @Path() planId: string,
    @Path() installmentId: string,
    @Request() req: ExRequest,
  ): Promise<{ sent: boolean } | { error: string }> {
    assertOrgRole(req)
    const tenantId = getTenantId(req)
    const db = DatabaseManager.getDatabase()
    const owned = db
      .prepare(
        `SELECT i.id FROM ar_plan_installments i JOIN ar_payment_plans p ON p.id = i.plan_id
             WHERE i.id = ? AND p.id = ? AND p.buyer_tenant_id = ?`,
      )
      .get(installmentId, planId, tenantId)
    if (!owned) {
      this.setStatus(404)
      return { error: 'Payment not found' }
    }
    return { sent: await receivableReminderService.sendInstallment(installmentId, true) }
  }

  // =========================================================================
  // GET /my-obligations — debtor-side AR obligations for cross-org plans
  // =========================================================================

  @Get('my-obligations')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async getMyObligations(
    @Request() req: ExRequest,
    @Query() status?: string,
    @Query() trustStatus?: string,
    @Query() limit?: number,
    @Query() offset?: number,
  ): Promise<Record<string, unknown> | { error: string }> {
    try {
      const tenantId = getTenantId(req)
      const db = DatabaseManager.getDatabase()
      const lim = Math.min(limit ?? 50, 200)
      const off = offset ?? 0

      // Keep obligation state fresh by syncing from each collector org that issued plans to this debtor org.
      const collectors = db
        .prepare(
          `
                SELECT DISTINCT buyer_tenant_id
                FROM ar_payment_plans
                WHERE debtor_org_id = ?
            `,
        )
        .all(tenantId) as Array<{ buyer_tenant_id?: string }>

      for (const row of collectors) {
        if (row?.buyer_tenant_id) {
          syncArPlanState(db, String(row.buyer_tenant_id))
        }
      }

      let sql = `
                SELECT
                    p.*,
                    (SELECT COUNT(*) FROM ar_plan_installments pi WHERE pi.plan_id = p.id) AS installments_count,
                    (SELECT COUNT(*) FROM ar_plan_installments pi WHERE pi.plan_id = p.id AND pi.status = 'paid') AS installments_paid_count,
                    (SELECT COALESCE(SUM(pi.amount), 0) FROM ar_plan_installments pi WHERE pi.plan_id = p.id AND pi.status = 'paid') AS amount_paid,
                    (SELECT COALESCE(SUM(pi.amount), 0) FROM ar_plan_installments pi WHERE pi.plan_id = p.id AND pi.status IN ('pending', 'overdue')) AS amount_due,
                    (SELECT MIN(pi.due_date) FROM ar_plan_installments pi WHERE pi.plan_id = p.id AND pi.status IN ('pending', 'overdue') AND pi.due_date IS NOT NULL) AS next_due_date,
                    (SELECT COUNT(*) FROM ar_plan_installments pi WHERE pi.plan_id = p.id AND pi.status = 'overdue') AS overdue_installments,
                    (SELECT tx.id FROM ar_ap_workflow_transactions tx WHERE tx.source_plan_id = p.id ORDER BY tx.updated_at DESC LIMIT 1) AS workflow_tx_id,
                    (SELECT tx.source_type FROM ar_ap_workflow_transactions tx WHERE tx.source_plan_id = p.id ORDER BY tx.updated_at DESC LIMIT 1) AS workflow_source_type,
                    (SELECT tx.source_payment_link_id FROM ar_ap_workflow_transactions tx WHERE tx.source_plan_id = p.id ORDER BY tx.updated_at DESC LIMIT 1) AS workflow_source_payment_link_id,
                    (SELECT tx.ap_invoice_id FROM ar_ap_workflow_transactions tx WHERE tx.source_plan_id = p.id ORDER BY tx.updated_at DESC LIMIT 1) AS workflow_ap_invoice_id,
                    (SELECT tx.required_action FROM ar_ap_workflow_transactions tx WHERE tx.source_plan_id = p.id ORDER BY tx.updated_at DESC LIMIT 1) AS required_action,
                    (SELECT tx.required_proof_type FROM ar_ap_workflow_transactions tx WHERE tx.source_plan_id = p.id ORDER BY tx.updated_at DESC LIMIT 1) AS required_proof_type,
                    (SELECT tx.workflow_stage FROM ar_ap_workflow_transactions tx WHERE tx.source_plan_id = p.id ORDER BY tx.updated_at DESC LIMIT 1) AS workflow_stage
                FROM ar_payment_plans p
                WHERE p.debtor_org_id = ?
            `
      const params: unknown[] = [tenantId]

      if (status) {
        sql += ' AND p.status = ?'
        params.push(status)
      }
      if (trustStatus) {
        sql += ' AND p.trust_status = ?'
        params.push(trustStatus)
      }

      sql += ' ORDER BY p.updated_at DESC LIMIT ? OFFSET ?'
      params.push(lim, off)

      const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>
      const totalRow = db
        .prepare(
          `
                SELECT COUNT(*) AS total
                FROM ar_payment_plans p
                WHERE p.debtor_org_id = ?
            `,
        )
        .get(tenantId) as { total?: number } | undefined

      return {
        total: totalRow?.total ?? 0,
        limit: lim,
        offset: off,
        obligations: rows.map((row) => ({
          ...row,
          collector_org_name: getTenantById(String(row.buyer_tenant_id || ''))?.label || row.buyer_tenant_id || null,
          counterpartySettlement: {
            settlementType: 'ar_ap_counterparty',
            direction: 'payable',
            sourceType: String(row.workflow_source_type || 'ar_collection'),
            sourcePlanId: String(row.id || ''),
            sourcePaymentLinkId: String(row.workflow_source_payment_link_id || '') || null,
            workflow: {
              transactionId: String(row.workflow_tx_id || '') || null,
              stage: String(row.workflow_stage || '') || null,
              trustStatus: String(row.trust_status || 'pending'),
              requiredAction: String(row.required_action || '') || null,
              requiredProofType: String(row.required_proof_type || '') || null,
            },
            apSide: {
              invoiceId: String(row.workflow_ap_invoice_id || '') || null,
            },
            links: {
              arPlanPath: `/finance?tab=ar&planId=${encodeURIComponent(String(row.id || ''))}`,
            },
          },
        })),
      }
    } catch (error) {
      if (error instanceof StatusException) {
        this.setStatus(error.status)
        return { error: error.message }
      }
      this.setStatus(500)
      return { error: getErrorMessage(error) }
    }
  }

  // =========================================================================
  // GET /collections — unified view: one-time + plan instalments
  // =========================================================================

  @Get('collections')
  @Security('jwt', [SCOPES.TENANT_AGENT])
  public async getCollections(
    @Request() req: ExRequest,
    @Query() status?: string,
    @Query() limit?: number,
    @Query() offset?: number,
  ): Promise<Record<string, unknown> | { error: string }> {
    try {
      const tenantId = getTenantId(req)
      const db = DatabaseManager.getDatabase()
      syncArPlanState(db, tenantId)
      const lim = Math.min(limit ?? 50, 200)
      const off = offset ?? 0

      let sql = `
                SELECT
                    pl.*,
                    pi.installment_number,
                    pi.plan_id,
                    pi.status AS instalment_status,
                    p.plan_type,
                    p.installments_total,
                    p.payer_name
                FROM payment_links pl
                LEFT JOIN ar_plan_installments pi ON pi.payment_link_id = pl.id
                LEFT JOIN ar_payment_plans p ON pi.plan_id = p.id
                WHERE pl.merchant_id = ?
            `
      const params: unknown[] = [tenantId]
      if (status) {
        sql += ' AND pl.status = ?'
        params.push(status)
      }
      sql += ' ORDER BY pl.created_at DESC'

      const rows = db.prepare(sql).all(...params) as any[]
      const arRows = rows.filter((row) => isArCollectionRow(row as DbPaymentLinkRow))
      const pagedRows = arRows.slice(off, off + lim)

      return {
        total: arRows.length,
        limit: lim,
        offset: off,
        collections: pagedRows.map((row) => ({
          ...row,
          collectionType: toArCollectionType(row as DbPaymentLinkRow),
          metadata: row.metadata
            ? (() => {
                try {
                  return JSON.parse(row.metadata)
                } catch {
                  return {}
                }
              })()
            : {},
        })),
      }
    } catch (error) {
      if (error instanceof StatusException) {
        this.setStatus(error.status)
        return { error: error.message }
      }
      this.setStatus(500)
      return { error: getErrorMessage(error) }
    }
  }
}
