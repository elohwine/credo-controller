import { randomUUID } from 'crypto'

import { DatabaseManager } from '../persistence/DatabaseManager'
import { operationsRegisterService } from './OperationsRegisterService'
import { ensureExecutableWorkflow } from './workflow/materialize'

const FIELD_JOB_WORKFLOW = 'field_execution_fept'

interface HistoryRow {
  id: string
  reference: string
  storeNumber?: string | null
  clientName?: string | null
  description: string
  location?: string | null
  problemType?: string | null
  poNumber?: string | null
  scheduledDate?: string | null
  completedDate?: string | null
  outcome: 'completed' | 'cancelled' | 'failed'
  workerName?: string | null
  amount?: number | null
  currency?: string | null
  createdAt: string
  detailsJson?: string | null
  runId?: string | null
}

export interface HistoryPromotionResult {
  converted: number
  updated: number
}

function parse(json?: string | null): Record<string, any> {
  if (!json) return {}
  try {
    const value = JSON.parse(json)
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

/** "2026-11-03T08:00:00" or "2026-11-03" as SQLite's "2026-11-03 08:00:00", so runs sort by time with the rest. */
export function sqliteTime(value?: string | null): string | undefined {
  const text = String(value || '').trim()
  const match = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(text)
  if (!match) return undefined
  return `${match[1]} ${match[2] || '00'}:${match[3] || '00'}:${match[4] || '00'}`
}

const nameKey = (name: string) => name.toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * Jobs brought in from the old system (MyMobileWorkers) as finished history become ordinary closed
 * field jobs, so they are on the Jobs list and open into the same job view (timeline, details,
 * history) as any other job. Runs again safely: a converted row is only refreshed (for example
 * when its check results are imported later).
 */
export class JobHistoryPromotionService {
  public constructor(private readonly fieldJobWorkflow = (orgTenantId: string) => ensureExecutableWorkflow(orgTenantId, FIELD_JOB_WORKFLOW)) {}

  public promote(orgTenantId: string): HistoryPromotionResult {
    const db = DatabaseManager.getDatabase()
    const rows = db
      .prepare(
        `SELECT id, external_reference AS reference, store_number AS storeNumber, client_name AS clientName,
                description, location, problem_type AS problemType, po_number AS poNumber,
                scheduled_date AS scheduledDate, completed_date AS completedDate, outcome,
                worker_name AS workerName, amount, currency, created_at AS createdAt,
                details_json AS detailsJson, workflow_run_id AS runId
           FROM job_history WHERE org_tenant_id = ?`,
      )
      .all(orgTenantId) as HistoryRow[]
    if (!rows.length) return { converted: 0, updated: 0 }

    const workflow = this.fieldJobWorkflow(orgTenantId)
    if (!workflow) throw new Error('The field job workflow is not available for this organisation')

    const members = new Map<string, string>()
    for (const [userId, name] of operationsRegisterService.memberNamesSafe(orgTenantId)) {
      if (name) members.set(nameKey(name), userId)
    }

    const insert = db.prepare(
      `INSERT INTO workflow_runs (id, workflow_id, tenant_id, status, input, output, trigger_type, trigger_ref,
                                  current_step, total_steps, started_at, completed_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'manual', ?, 0, 0, ?, ?, ?)`,
    )
    const link = db.prepare('UPDATE job_history SET workflow_run_id = ? WHERE id = ?')
    const findRun = db.prepare('SELECT id, input, output FROM workflow_runs WHERE tenant_id = ? AND trigger_ref = ? LIMIT 1')
    const refresh = db.prepare('UPDATE workflow_runs SET input = ?, output = ? WHERE id = ?')

    let converted = 0
    let updated = 0
    const run = db.transaction(() => {
      for (const row of rows) {
        const details = parse(row.detailsJson)
        const assigneeId = row.workerName ? members.get(nameKey(row.workerName)) : undefined
        const input: Record<string, any> = {
          sourceType: 'import',
          reference: row.reference,
          description: row.description,
          ...(row.storeNumber ? { storeNumber: row.storeNumber } : {}),
          ...(row.poNumber ? { poNumber: row.poNumber } : {}),
          ...(row.clientName ? { clientName: row.clientName } : {}),
          ...(row.location ? { location: row.location } : {}),
          ...(row.problemType ? { problemType: row.problemType } : {}),
          ...(row.scheduledDate ? { scheduledDate: row.scheduledDate } : {}),
          ...(row.workerName ? { workerName: row.workerName } : {}),
          ...(assigneeId ? { assigneeId } : {}),
          ...(row.amount !== null && row.amount !== undefined ? { amount: Number(row.amount) } : {}),
          ...(row.currency ? { currency: row.currency } : {}),
          ...(Object.keys(details).length ? { importedDetails: details } : {}),
        }
        const cancelled = row.outcome !== 'completed'
        const stage = cancelled ? 'CANCELLED' : 'COMPLETED'
        const output: Record<string, any> = {
          workflowStage: stage,
          stage,
          workflowInput: input,
          importedOutcome: row.outcome,
          ...(assigneeId ? { assigneeId } : {}),
          ...(row.outcome === 'failed'
            ? { cancelReason: `Not done in the old system${details.failureType ? `: ${details.failureType}` : ''}` }
            : {}),
        }
        const triggerRef = `job-history:${row.id}`
        const existing = (row.runId ? { id: row.runId } : undefined) || (findRun.get(orgTenantId, triggerRef) as { id: string } | undefined)
        if (existing) {
          refresh.run(JSON.stringify(input), JSON.stringify(output), existing.id)
          if (!row.runId) link.run(existing.id, row.id)
          updated += 1
          continue
        }
        const id = randomUUID()
        const received = sqliteTime(details.receivedAt) || sqliteTime(row.scheduledDate) || sqliteTime(row.completedDate)
        const finished = sqliteTime(details.completedAt) || sqliteTime(row.completedDate) || received
        insert.run(
          id,
          workflow.id,
          orgTenantId,
          cancelled ? 'cancelled' : 'completed',
          JSON.stringify(input),
          JSON.stringify(output),
          triggerRef,
          received || null,
          finished || null,
          received || sqliteTime(row.createdAt) || new Date().toISOString().replace('T', ' ').slice(0, 19),
        )
        link.run(id, row.id)
        converted += 1
      }
    })
    run()
    return { converted, updated }
  }
}

export const jobHistoryPromotionService = new JobHistoryPromotionService()
