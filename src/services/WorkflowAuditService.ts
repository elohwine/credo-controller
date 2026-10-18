import { DatabaseManager } from '../persistence/DatabaseManager'
import { workflowRunRepository } from '../persistence/WorkflowRunRepository'

export type WorkflowAuditFormat = 'json' | 'csv'

export interface WorkflowAuditRow {
  id: string
  occurredAt: string
  event: string
  status: string
  person?: string
  stage?: string
  source: 'event' | 'step'
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

function providerReference(run: { input?: any; output?: any; triggerRef?: string }): string | undefined {
  const input = parsed(run.input)
  const output = parsed(run.output)
  const candidates = [
    output.providerRef,
    output.providerReference,
    output.payment?.providerRef,
    output.receipt?.providerRef,
    input.providerRef,
    input.providerReference,
    run.triggerRef,
  ]
  return candidates.map((value) => String(value || '').trim()).find(Boolean)
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
    const providerRef = providerReference(run)
    const eventRows = providerRef
      ? (db
          .prepare(
            `SELECT id, event_type, source, metadata, occurred_at
             FROM reconciliation_events
            WHERE provider_ref = ?
            ORDER BY occurred_at ASC`,
          )
          .all(providerRef) as any[])
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

    const filtered = rows
      .filter((row) => !options.status || row.status === options.status)
      .filter((row) => !options.event || row.event.toLowerCase().includes(options.event.toLowerCase()))
      .filter((row) => !options.from || row.occurredAt >= options.from)
      .filter((row) => !options.to || row.occurredAt <= options.to)
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))

    const result: WorkflowAuditResult = { runId, generatedAt: new Date().toISOString(), rows: filtered }
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
}

export const workflowAuditService = new WorkflowAuditService()
