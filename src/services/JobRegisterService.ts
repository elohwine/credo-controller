/**
 * One list of an organisation's field jobs: booked jobs (workflow runs) and jobs still waiting
 * in intake (from the jobs mailbox or written down by the office). The Jobs screens, the
 * calendar, the CSV export and the reports all read it, so a filter means the same everywhere.
 *
 * It only reads `OperationsRegisterService.listJobs` and `pendingIntakes`; it keeps no copy.
 */

import { FIELD_JOB_CATEGORY_LABELS, type FieldJobCategory } from '../config/fieldJobCategory'
import { fieldJobSourceLabel, isFieldJobSource, type FieldJobSource } from '../config/fieldJobSource'

import { DatabaseManager } from '../persistence/DatabaseManager'

import { operationsRegisterService } from './OperationsRegisterService'

export type JobRegisterCategory = FieldJobCategory | 'not_booked'

export interface JobRegisterRow {
  /** `history` is a finished job brought in from a file: shown and counted, never opened or billed. */
  kind: 'job' | 'intake' | 'history'
  /** The run id for a booked job, the intake id for one waiting to be booked. */
  id: string
  reference: string
  source: FieldJobSource
  category: JobRegisterCategory
  storeNumber?: string
  poNumber?: string
  clientName?: string
  description: string
  location?: string
  problemType?: string
  scheduledDate?: string
  assigneeId?: string
  vehicle?: string
  callOut: boolean
  amount?: number
  currency?: string
  createdAt: string
  completedAt?: string
  possibleRepeat?: boolean
  /** Who did the job, as the old system named them (history only; not a team member). */
  workerName?: string
}

export interface JobRegisterFilter {
  source?: string
  category?: string
  storeNumber?: string
  assigneeId?: string
  /** First and last day, on the date the job is booked for (or was received when it has none). */
  from?: string
  to?: string
  q?: string
}

export interface JobReport {
  from?: string
  to?: string
  total: number
  counts: Record<JobRegisterCategory, number>
  bySource: Array<{ source: FieldJobSource; label: string; count: number }>
  byStore: Array<{ storeNumber: string; open: number; completed: number; total: number }>
  byWorker: Array<{ userId: string; name: string; open: number; completed: number; failed: number }>
  /** Days from receiving a job to completing it, over completed jobs. */
  averageDaysToComplete?: number
}

const DONE = new Set<JobRegisterCategory>(['completed', 'reconciled'])
const OPEN = new Set<JobRegisterCategory>(['pending', 'assigned', 'active', 'on_hold', 'failed'])

const DATE = /^\d{4}-\d{2}-\d{2}$/

function dayOf(row: Pick<JobRegisterRow, 'scheduledDate' | 'createdAt'>): string {
  const scheduled = String(row.scheduledDate || '').slice(0, 10)
  return DATE.test(scheduled) ? scheduled : String(row.createdAt || '').slice(0, 10)
}

export function jobRegisterCategoryLabel(category: JobRegisterCategory): string {
  return category === 'not_booked' ? 'Not booked yet' : FIELD_JOB_CATEGORY_LABELS[category]
}

function checkDate(value: string | undefined, field: string): string | undefined {
  const text = String(value || '').trim()
  if (!text) return undefined
  if (!DATE.test(text)) throw new Error(`${field} must be a date (YYYY-MM-DD)`)
  return text
}

/** A cell a spreadsheet would run as a formula starts with a quote instead. */
function csvCell(value: unknown): string {
  let text = value === undefined || value === null ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export class JobRegisterService {
  public rows(orgTenantId: string, filter: JobRegisterFilter = {}): JobRegisterRow[] {
    const from = checkDate(filter.from, 'From')
    const to = checkDate(filter.to, 'To')
    const jobs: JobRegisterRow[] = operationsRegisterService.listJobs(orgTenantId).map((job) => ({
      kind: 'job',
      id: job.runId,
      reference: job.reference,
      source: job.source,
      category: job.category,
      storeNumber: job.storeNumber,
      poNumber: job.poNumber,
      clientName: job.clientName,
      description: job.description,
      location: job.location,
      problemType: job.problemType,
      scheduledDate: job.scheduledDate,
      assigneeId: job.assigneeId,
      vehicle: job.vehicle,
      callOut: job.callOut,
      amount: job.amount,
      currency: job.currency,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
    }))
    const waiting: JobRegisterRow[] = operationsRegisterService.pendingIntakes(orgTenantId).map((intake) => ({
      kind: 'intake',
      id: intake.id,
      reference: intake.reference,
      source: intake.source === 'email' ? 'email' : intake.source === 'import' ? 'import' : 'office',
      category: 'not_booked',
      storeNumber: intake.storeNumber,
      poNumber: intake.poNumber,
      clientName: intake.clientName,
      description: intake.description,
      location: intake.location,
      scheduledDate: intake.scheduledDate,
      callOut: intake.callOut === true,
      createdAt: intake.createdAt,
      possibleRepeat: Boolean(intake.duplicateOf),
    }))
    const q = String(filter.q || '').trim().toLowerCase()
    const source = isFieldJobSource(filter.source) ? filter.source : undefined
    const category = filter.category && filter.category !== 'all' ? filter.category : undefined
    return [...waiting, ...jobs, ...this.history(orgTenantId)]
      .filter((row) => !source || row.source === source)
      .filter((row) => !category || row.category === category)
      .filter((row) => !filter.storeNumber || row.storeNumber === filter.storeNumber)
      .filter((row) => !filter.assigneeId || row.assigneeId === filter.assigneeId)
      .filter((row) => !from || dayOf(row) >= from)
      .filter((row) => !to || dayOf(row) <= to)
      .filter(
        (row) =>
          !q ||
          [row.reference, row.storeNumber, row.poNumber, row.clientName, row.description, row.location]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(q)),
      )
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  }

  /** Finished jobs brought in from a file. Read-only: nothing here has a workflow, a bill or a payout. */
  private history(orgTenantId: string): JobRegisterRow[] {
    try {
      const rows = DatabaseManager.getDatabase()
        .prepare(
          `SELECT id, external_reference AS reference, store_number AS storeNumber, client_name AS clientName,
                  description, location, problem_type AS problemType, po_number AS poNumber,
                  scheduled_date AS scheduledDate, completed_date AS completedDate, outcome,
                  worker_name AS workerName, amount, currency, created_at AS createdAt
             FROM job_history WHERE org_tenant_id = ? ORDER BY COALESCE(completed_date, scheduled_date, created_at) DESC
            LIMIT 2000`,
        )
        .all(orgTenantId) as Array<Record<string, any>>
      return rows.map((row) => ({
        kind: 'history' as const,
        id: String(row.id),
        reference: String(row.reference),
        source: 'import' as const,
        category: row.outcome === 'cancelled' ? ('cancelled' as const) : ('completed' as const),
        storeNumber: row.storeNumber || undefined,
        poNumber: row.poNumber || undefined,
        clientName: row.clientName || undefined,
        description: String(row.description || ''),
        location: row.location || undefined,
        problemType: row.problemType || undefined,
        scheduledDate: row.scheduledDate || undefined,
        callOut: false,
        amount: row.amount === null || row.amount === undefined ? undefined : Number(row.amount),
        currency: row.currency || undefined,
        // Sorted by the day the job was done, not the day it was imported.
        createdAt: String(row.completedDate || row.scheduledDate || row.createdAt),
        completedAt: row.completedDate || undefined,
        workerName: row.workerName || undefined,
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : String((error as { message?: unknown } | null)?.message ?? error)
      if (/no such table/i.test(message)) return []
      throw error
    }
  }

  public csv(orgTenantId: string, filter: JobRegisterFilter = {}): string {
    const names = operationsRegisterService.memberNamesSafe(orgTenantId)
    const header = [
      'Job',
      'Source',
      'Status',
      'Store',
      'PO',
      'Client',
      'Description',
      'Location',
      'Problem',
      'Booked for',
      'Worker',
      'Van',
      'Call-out',
      'Amount',
      'Currency',
      'Received',
      'Completed',
    ]
    const lines = this.rows(orgTenantId, filter).map((row) =>
      [
        row.reference,
        fieldJobSourceLabel(row.source),
        jobRegisterCategoryLabel(row.category),
        row.storeNumber,
        row.poNumber,
        row.clientName,
        row.description,
        row.location,
        row.problemType,
        row.scheduledDate,
        row.assigneeId ? names.get(row.assigneeId) || 'Team member' : row.workerName,
        row.vehicle,
        row.callOut ? 'Yes' : 'No',
        row.amount,
        row.currency,
        String(row.createdAt || '').slice(0, 10),
        String(row.completedAt || '').slice(0, 10),
      ]
        .map(csvCell)
        .join(','),
    )
    return `\uFEFF${[header.join(','), ...lines].join('\r\n')}\r\n`
  }

  public report(orgTenantId: string, filter: Pick<JobRegisterFilter, 'from' | 'to' | 'source'> = {}): JobReport {
    const rows = this.rows(orgTenantId, filter)
    const names = operationsRegisterService.memberNamesSafe(orgTenantId)
    const counts = {
      not_booked: 0,
      pending: 0,
      assigned: 0,
      active: 0,
      on_hold: 0,
      failed: 0,
      completed: 0,
      reconciled: 0,
      cancelled: 0,
    } as Record<JobRegisterCategory, number>
    const sources = new Map<FieldJobSource, number>()
    const stores = new Map<string, { open: number; completed: number; total: number }>()
    const workers = new Map<string, { open: number; completed: number; failed: number }>()
    const durations: number[] = []
    for (const row of rows) {
      counts[row.category] += 1
      sources.set(row.source, (sources.get(row.source) || 0) + 1)
      if (row.storeNumber) {
        const store = stores.get(row.storeNumber) || { open: 0, completed: 0, total: 0 }
        store.total += 1
        if (OPEN.has(row.category) || row.category === 'not_booked') store.open += 1
        if (DONE.has(row.category)) store.completed += 1
        stores.set(row.storeNumber, store)
      }
      if (row.assigneeId) {
        const worker = workers.get(row.assigneeId) || { open: 0, completed: 0, failed: 0 }
        if (OPEN.has(row.category)) worker.open += 1
        if (DONE.has(row.category)) worker.completed += 1
        if (row.category === 'failed') worker.failed += 1
        workers.set(row.assigneeId, worker)
      }
      // An imported job has no "received" day, so it would only pull the average to zero.
      if (DONE.has(row.category) && row.completedAt && row.kind !== 'history') {
        const days = (Date.parse(row.completedAt) - Date.parse(row.createdAt)) / 86_400_000
        if (Number.isFinite(days) && days >= 0) durations.push(days)
      }
    }
    return {
      from: filter.from || undefined,
      to: filter.to || undefined,
      total: rows.length,
      counts,
      bySource: [...sources.entries()]
        .map(([source, count]) => ({ source, label: fieldJobSourceLabel(source), count }))
        .sort((a, b) => b.count - a.count),
      byStore: [...stores.entries()]
        .map(([storeNumber, value]) => ({ storeNumber, ...value }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 20),
      byWorker: [...workers.entries()]
        .map(([userId, value]) => ({ userId, name: names.get(userId) || 'Team member', ...value }))
        .sort((a, b) => b.open - a.open || b.completed - a.completed),
      ...(durations.length
        ? { averageDaysToComplete: Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10 }
        : {}),
    }
  }
}

export const jobRegisterService = new JobRegisterService()
