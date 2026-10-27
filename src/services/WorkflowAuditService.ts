import { DatabaseManager } from '../persistence/DatabaseManager'
import { workflowRunRepository } from '../persistence/WorkflowRunRepository'

import { orgWorkflowActorService } from './OrgWorkflowActorService'

export type WorkflowAuditFormat = 'json' | 'csv'

/** The records that share one History, export and cancel path (`/api/records/{kind}/{id}`). */
export type AuditRecordKind = 'job' | 'request' | 'supplier_bill' | 'collection'
export const AUDIT_RECORD_KINDS: AuditRecordKind[] = ['job', 'request', 'supplier_bill', 'collection']

export interface AuditFilterOptions {
  status?: string
  event?: string
  from?: string
  to?: string
  format?: WorkflowAuditFormat
}

export interface WorkflowAuditRow {
  id: string
  occurredAt: string
  event: string
  status: string
  person?: string
  stage?: string
  source: 'event' | 'step' | 'record'
  evidence: Array<{ kind: string; label: string; reference: string }>
  confirmation?: string
}

export interface WorkflowAuditResult {
  runId: string
  generatedAt: string
  rows: WorkflowAuditRow[]
  csv?: string
}

const EVENT_LABELS: Record<string, string> = {
  AGENT_ASSIGNED: 'Job assigned',
  JOB_STARTED: 'Job started',
  SITE_INSPECTION_COMPLETED: 'Site inspected',
  RISK_ASSESSMENT_COMPLETED: 'Risk assessment completed',
  RISK_ASSESSMENT_HOLD_RAISED: 'Safety hold raised',
  RISK_ASSESSMENT_HOLD_RESOLVED: 'Safety hold resolved',
  ARRIVAL_CONFIRMED: 'Arrival confirmed',
  WORK_EVIDENCE_BEFORE: 'Before-work evidence recorded',
  WORK_EVIDENCE_AFTER: 'After-work evidence recorded',
  WORK_EVIDENCE_RECEIPT: 'Receipt recorded',
  COMPLETION_REVIEWED: 'Completion reviewed',
  EXECUTION_ACKNOWLEDGED: 'Work signed off',
  PAYMENT_SUCCESS: 'Payment released',
  RECEIPT_ISSUED: 'Payment receipt issued',
  SETTLEMENT_CONFIRMED: 'Payment reconciled',
  JOB_CLOSED: 'Job closed',
}

function parsed(value: unknown): Record<string, any> {
  if (!value) return {}
  if (typeof value === 'object') return value as Record<string, any>
  try {
    return JSON.parse(String(value)) as Record<string, any>
  } catch {
    return {}
  }
}

/**
 * The reference a job's events are filed under. FieldExecutionActions writes with this and the
 * History reads with it, so the two cannot drift.
 */
export function jobEventReference(input: Record<string, any> | undefined, runId: string | undefined): string {
  return String(input?.providerReference || input?.reference || input?.requestId || runId || '').trim()
}

/** Every reference a run's events may sit under: the job's own key first, then payment references. */
function eventReferences(run: { id: string; input?: any; output?: any; triggerRef?: string }): string[] {
  const input = parsed(run.input)
  const output = parsed(run.output)
  const candidates = [
    jobEventReference(input, run.id),
    output.providerRef,
    output.providerReference,
    output.payment?.providerRef,
    output.receipt?.providerRef,
    input.providerRef,
    run.triggerRef,
  ]
  return [...new Set(candidates.map((value) => String(value || '').trim()).filter(Boolean))]
}

function safeReference(value: unknown): string {
  const reference = String(value || '').trim()
  if (!reference || reference.startsWith('data:') || reference.length > 240) return ''
  return reference
}

function evidence(metadata: Record<string, any>): WorkflowAuditRow['evidence'] {
  const result: WorkflowAuditRow['evidence'] = []
  const add = (kind: string, label: string, value: unknown) => {
    const reference = safeReference(value)
    if (reference) result.push({ kind, label, reference })
  }
  if (metadata.photoUri)
    result.push({ kind: 'image', label: 'Photo', reference: safeReference(metadata.photoUri) || 'Photo' })
  add('evidence', 'Evidence seal', metadata.evidenceHash)
  add('record', metadata.vcType || 'Record', metadata.vcId)
  add('confirmation', 'Wallet confirmation', metadata.presentationId)
  return result
}

/** One CSV cell, quoted. Shared with the personal activity export. */
export function csvCell(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

export class WorkflowAuditService {
  public readRun(
    runId: string,
    tenantId: string,
    options: { status?: string; event?: string; from?: string; to?: string; format?: WorkflowAuditFormat } = {},
  ): WorkflowAuditResult | undefined {
    const run = workflowRunRepository.findRunById(runId)
    if (!run || run.tenantId !== tenantId) return undefined

    const db = DatabaseManager.getDatabase()
    const references = eventReferences(run)
    const eventRows = references.length
      ? (db
          .prepare(
            `SELECT id, event_type, source, metadata, occurred_at
             FROM reconciliation_events
            WHERE provider_ref IN (${references.map(() => '?').join(', ')})
            ORDER BY occurred_at ASC`,
          )
          .all(...references) as any[])
      : []

    const durableEvents: WorkflowAuditRow[] = eventRows
      .map((row) => {
        const metadata = parsed(row.metadata)
        if (metadata.tenantId && metadata.tenantId !== tenantId) return undefined
        return {
          id: row.id,
          occurredAt: row.occurred_at,
          event: EVENT_LABELS[row.event_type] || String(row.event_type).replace(/_/g, ' ').toLowerCase(),
          status: /HOLD_RAISED|FAILED/.test(row.event_type) ? 'attention' : 'completed',
          person: metadata.displayName || metadata.actorName,
          stage: metadata.stage || metadata.phase,
          source: 'event' as const,
          evidence: evidence(metadata),
          confirmation: metadata.isVerifiable ? 'Wallet confirmed' : undefined,
        }
      })
      .filter(Boolean) as WorkflowAuditRow[]

    // Recorded events are the audit. Saved workflow steps fill in only when a workflow has
    // not recorded any events, so a field job is not listed twice.
    let rows = durableEvents
    if (rows.length === 0) {
      const stepRows = db
        .prepare(
          `SELECT id, action_name, status, output_state, error,
                COALESCE(completed_at, started_at, created_at) AS occurred_at
           FROM workflow_steps
          WHERE run_id = ?
          ORDER BY step_index ASC`,
        )
        .all(runId) as any[]
      rows = stepRows.map((step) => ({
        id: step.id,
        occurredAt: step.occurred_at,
        event: String(step.action_name)
          .replace(/[._-]+/g, ' ')
          .replace(/\b\w/g, (letter) => letter.toUpperCase()),
        status: step.status,
        source: 'step' as const,
        evidence: evidence(parsed(step.output_state)),
        confirmation: step.error || undefined,
      }))
    }

    return finishAudit(runId, rows, options)
  }

  /**
   * History for any record kind, in the same rows and CSV as a job. Returns undefined when the
   * record does not belong to this organisation.
   */
  public readRecord(
    kind: AuditRecordKind,
    id: string,
    tenantId: string,
    options: AuditFilterOptions = {},
  ): WorkflowAuditResult | undefined {
    if (kind === 'job') return this.readRun(id, tenantId, options)
    const rows =
      kind === 'request'
        ? requestRows(id, tenantId)
        : kind === 'supplier_bill'
          ? supplierBillRows(id, tenantId)
          : collectionRows(id, tenantId)
    if (!rows) return undefined
    return finishAudit(id, rows, options)
  }
}

function finishAudit(recordId: string, rows: WorkflowAuditRow[], options: AuditFilterOptions): WorkflowAuditResult {
  const filtered = rows
    .filter((row) => !options.status || row.status === options.status)
    .filter((row) => !options.event || row.event.toLowerCase().includes(options.event.toLowerCase()))
    .filter((row) => !options.from || row.occurredAt >= options.from)
    .filter((row) => !options.to || row.occurredAt <= options.to)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))

  const result: WorkflowAuditResult = { runId: recordId, generatedAt: new Date().toISOString(), rows: filtered }
  if (options.format === 'csv') {
    result.csv = [
      ['Date and time', 'Event', 'Status', 'Person', 'Stage', 'Evidence and records', 'Confirmation'],
      ...filtered.map((row) => [
        row.occurredAt,
        row.event,
        row.status,
        row.person || '',
        row.stage || '',
        row.evidence.map((item) => `${item.label}: ${item.reference}`).join('; '),
        row.confirmation || '',
      ]),
    ]
      .map((cells) => cells.map(csvCell).join(','))
      .join('\n')
  }
  return result
}

const REQUEST_STATUS_EVENTS: Record<string, string> = {
  draft: 'Request drafted',
  submitted: 'Sent for approval',
  in_review: 'Opened for review',
  approved: 'Approved',
  rejected: 'Declined',
  in_fulfilment: 'Being carried out',
  completed: 'Finished',
  cancelled: 'Cancelled',
}

const MONEY_STEP_EVENTS: Record<string, string> = {
  approve_payment: 'Payment approved',
  record_payment: 'Payment recorded',
  release_funds: 'Money released',
  acknowledge_remittance: 'Payment arrival confirmed',
  issue_receipt_vc: 'Receipt sent',
  present_payment_proof: 'Payment proof shared',
}

function humanize(value: unknown): string {
  const text = String(value || '')
    .replace(/[._-]+/g, ' ')
    .trim()
  return text ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase() : ''
}

function memberNames(tenantId: string): Map<string, string> {
  try {
    return new Map(
      orgWorkflowActorService
        .listOrgMembers(tenantId)
        .filter((member) => member.displayName)
        .map((member) => [member.userId, String(member.displayName)]),
    )
  } catch {
    return new Map()
  }
}

function requestRows(requestId: string, tenantId: string): WorkflowAuditRow[] | undefined {
  const db = DatabaseManager.getDatabase()
  const request = db
    .prepare(
      `SELECT r.id FROM requests r JOIN organizations o ON o.id = r.organization_id WHERE r.id = ? AND o.tenant_id = ?`,
    )
    .get(requestId, tenantId)
  if (!request) return undefined
  const names = memberNames(tenantId)
  const events = db
    .prepare(
      `SELECT e.id, e.event_type, e.from_status, e.to_status, e.payload_json, e.created_at, p.subject_ref
       FROM request_events e LEFT JOIN people p ON p.id = e.actor_person_id
       WHERE e.request_id = ? ORDER BY e.created_at ASC, e.rowid ASC`,
    )
    .all(requestId) as any[]
  return events.map((event) => {
    const payload = parsed(event.payload_json)
    const toStatus = String(event.to_status || '')
    const staffCard = payload.staffCard && typeof payload.staffCard === 'object' ? payload.staffCard : undefined
    const evidenceRows = evidence(payload)
    if (payload.receiptRef)
      evidenceRows.push({ kind: 'record', label: 'Receipt or bill', reference: safeReference(payload.receiptRef) })
    return {
      id: event.id,
      occurredAt: String(event.created_at || ''),
      event: REQUEST_STATUS_EVENTS[toStatus] || humanize(event.event_type),
      status: toStatus === 'rejected' || toStatus === 'cancelled' ? 'attention' : 'completed',
      person: event.subject_ref ? names.get(String(event.subject_ref)) : undefined,
      stage: toStatus ? humanize(toStatus) : undefined,
      source: 'record' as const,
      evidence: evidenceRows.filter((item) => item.reference),
      confirmation: staffCard
        ? 'Staff card checked'
        : payload.reason
          ? `Reason: ${String(payload.reason).slice(0, 200)}`
          : undefined,
    }
  })
}

function moneyStepRows(where: string, id: string): WorkflowAuditRow[] {
  const rows = DatabaseManager.getDatabase()
    .prepare(
      `SELECT a.id, a.action_type, a.stage_to, a.actor_role, a.proof_response_id, a.created_at
       FROM ar_ap_workflow_actions a JOIN ar_ap_workflow_transactions t ON t.id = a.transaction_id
       WHERE ${where} ORDER BY a.created_at ASC`,
    )
    .all(id) as any[]
  return rows.map((row) => ({
    id: row.id,
    occurredAt: String(row.created_at || ''),
    event: MONEY_STEP_EVENTS[String(row.action_type)] || humanize(row.action_type),
    status: 'completed',
    person: row.actor_role ? humanize(row.actor_role) : undefined,
    stage: row.stage_to ? humanize(row.stage_to) : undefined,
    source: 'record' as const,
    evidence: [],
    confirmation: row.proof_response_id ? 'Staff card checked' : undefined,
  }))
}

function supplierBillRows(invoiceId: string, tenantId: string): WorkflowAuditRow[] | undefined {
  const db = DatabaseManager.getDatabase()
  const bill = db
    .prepare(
      `SELECT id, invoice_ref, amount, currency, status, created_at, updated_at FROM ap_invoices WHERE id = ? AND buyer_tenant_id = ?`,
    )
    .get(invoiceId, tenantId) as any
  if (!bill) return undefined
  const rows: WorkflowAuditRow[] = [
    {
      id: `${bill.id}:created`,
      occurredAt: String(bill.created_at),
      event: 'Supplier bill recorded',
      status: 'completed',
      source: 'record',
      evidence: bill.invoice_ref
        ? [{ kind: 'record', label: 'Bill number', reference: safeReference(bill.invoice_ref) }]
        : [],
      confirmation: `${bill.currency} ${Number(bill.amount).toFixed(2)}`,
    },
  ]
  const payments = db
    .prepare(
      `SELECT id, amount_paid, currency, payment_method, reference, paid_at, supplier_acknowledged_at
       FROM ap_payments WHERE ap_invoice_id = ? AND buyer_tenant_id = ? ORDER BY paid_at ASC`,
    )
    .all(invoiceId, tenantId) as any[]
  for (const payment of payments) {
    rows.push({
      id: payment.id,
      occurredAt: String(payment.paid_at),
      event: 'Supplier paid',
      status: 'completed',
      source: 'record',
      evidence: payment.reference
        ? [{ kind: 'record', label: 'Payment reference', reference: safeReference(payment.reference) }]
        : [],
      confirmation: `${payment.currency} ${Number(payment.amount_paid).toFixed(2)}${payment.payment_method ? ` by ${humanize(payment.payment_method).toLowerCase()}` : ''}`,
    })
    if (payment.supplier_acknowledged_at) {
      rows.push({
        id: `${payment.id}:ack`,
        occurredAt: String(payment.supplier_acknowledged_at),
        event: 'Supplier confirmed the payment arrived',
        status: 'completed',
        source: 'record',
        evidence: [],
      })
    }
  }
  rows.push(...moneyStepRows('t.ap_invoice_id = ?', invoiceId))
  if (bill.status === 'cancelled') {
    rows.push({
      id: `${bill.id}:cancelled`,
      occurredAt: String(bill.updated_at),
      event: 'Cancelled',
      status: 'attention',
      source: 'record',
      evidence: [],
    })
  }
  return rows
}

function collectionRows(planId: string, tenantId: string): WorkflowAuditRow[] | undefined {
  const db = DatabaseManager.getDatabase()
  const plan = db
    .prepare(
      `SELECT id, description, total_amount, currency, status, created_at, updated_at FROM ar_payment_plans WHERE id = ? AND buyer_tenant_id = ?`,
    )
    .get(planId, tenantId) as any
  if (!plan) return undefined
  const rows: WorkflowAuditRow[] = [
    {
      id: `${plan.id}:created`,
      occurredAt: String(plan.created_at),
      event: 'Payment plan set up',
      status: 'completed',
      source: 'record',
      evidence: [],
      confirmation: `${plan.currency} ${Number(plan.total_amount).toFixed(2)}`,
    },
  ]
  const instalments = db
    .prepare(
      `SELECT id, installment_number, amount, status, paid_at FROM ar_plan_installments
       WHERE plan_id = ? AND paid_at IS NOT NULL ORDER BY paid_at ASC`,
    )
    .all(planId) as any[]
  for (const instalment of instalments) {
    rows.push({
      id: instalment.id,
      occurredAt: String(instalment.paid_at),
      event: `Instalment ${instalment.installment_number} paid`,
      status: 'completed',
      source: 'record',
      evidence: [],
      confirmation: `${plan.currency} ${Number(instalment.amount).toFixed(2)}`,
    })
  }
  rows.push(...moneyStepRows('t.source_plan_id = ?', planId))
  if (plan.status === 'cancelled' || plan.status === 'completed') {
    rows.push({
      id: `${plan.id}:${plan.status}`,
      occurredAt: String(plan.updated_at),
      event: plan.status === 'cancelled' ? 'Cancelled' : 'Paid in full',
      status: plan.status === 'cancelled' ? 'attention' : 'completed',
      source: 'record',
      evidence: [],
    })
  }
  return rows
}

export const workflowAuditService = new WorkflowAuditService()
