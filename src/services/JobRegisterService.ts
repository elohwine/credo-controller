/**
 * One list of an organisation's field jobs: booked jobs (workflow runs) and jobs still waiting
 * in intake (from the jobs mailbox or written down by the office). The Jobs screens, the
 * calendar, the CSV export and the reports all read it, so a filter means the same everywhere.
 *
 * It only reads `OperationsRegisterService.listJobs` and `pendingIntakes`; it keeps no copy.
 */

import type { ImportedJobDetails } from '../config/fieldDataImport'
import { FIELD_JOB_CATEGORY_LABELS, type FieldJobCategory } from '../config/fieldJobCategory'
import { fieldJobSourceLabel, isFieldJobSource, type FieldJobSource } from '../config/fieldJobSource'
import { pageLimit, pageOffset, pageRows, sortRows, type ListPage, type SortValue } from '../config/listPage'
import { DatabaseManager } from '../persistence/DatabaseManager'
import { listContacts } from '../persistence/ContactRepository'

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
  /** Who did the job, as the old system named them (imported jobs only; not a team member). */
  workerName?: string
  /** The job needed another visit: a failed visit here, or the old system said so. */
  returnVisit?: boolean
  /** What the old system said about an imported job: its status, branch, times, notes and checks. */
  details?: ImportedJobDetails
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

export interface JobRegisterPaging {
  /** One of `JOB_REGISTER_SORTS`; newest received first when not given. */
  sort?: string
  dir?: string
  limit?: string | number
  offset?: string | number
}

export interface JobReport {
  from?: string
  to?: string
  total: number
  counts: Record<JobRegisterCategory, number>
  bySource: Array<{ source: FieldJobSource; label: string; count: number }>
  /** Busiest stores first: most open jobs, then most jobs overall. */
  byStore: Array<{ storeNumber: string; name?: string; open: number; completed: number; total: number }>
  /** Team members, and the people the old system had on imported jobs (`userId` empty, `oldSystem` set). */
  byWorker: Array<{ userId: string; name: string; open: number; completed: number; failed: number; oldSystem?: boolean }>
  byProblemType: Array<{ problemType: string; open: number; total: number }>
  /** Days from receiving a job to completing it, over completed jobs. */
  averageDaysToComplete?: number
  /**
   * Jobs done on the first visit, out of every job that is done or had to be visited again
   * (`percent` is missing when there is nothing to count yet).
   */
  firstTimeFix: { fixed: number; returnVisits: number; percent?: number }
  /** Where the work stands today, whatever the date filter. */
  today: {
    date: string
    /** Open jobs booked for today. */
    scheduled: number
    /** Open jobs whose booked day has passed. */
    overdue: number
    /** Open jobs nobody is on yet. */
    unassigned: number
    /** Open call-outs. */
    urgent: number
    receivedLast7Days: number
    completedLast7Days: number
    completedLast30Days: number
    /** Days since the oldest open job came in. */
    oldestOpenDays?: number
  }
  /** The last eight weeks, oldest first: jobs received and jobs completed in each week (Monday start). */
  weekly: Array<{ weekStart: string; received: number; completed: number }>
}

const DONE = new Set<JobRegisterCategory>(['completed', 'reconciled'])
const OPEN = new Set<JobRegisterCategory>(['pending', 'assigned', 'active', 'arrived', 'on_hold', 'failed'])

const DATE = /^\d{4}-\d{2}-\d{2}$/
const RETURN_VISIT = /return visit|revisit|access denied|no access/i

/** Status sorts in the order a job moves through, so the colours group together. */
const CATEGORY_ORDER: JobRegisterCategory[] = [
  'not_booked',
  'pending',
  'assigned',
  'active',
  'arrived',
  'on_hold',
  'failed',
  'completed',
  'reconciled',
  'cancelled',
]

function dayOf(row: Pick<JobRegisterRow, 'scheduledDate' | 'createdAt'>): string {
  const scheduled = String(row.scheduledDate || '').slice(0, 10)
  return DATE.test(scheduled) ? scheduled : String(row.createdAt || '').slice(0, 10)
}

/** The columns the Jobs list can be sorted by, the same on both apps. */
export const JOB_REGISTER_SORTS: Record<string, SortValue<JobRegisterRow>> = {
  received: (row) => row.createdAt,
  date: (row) => dayOf(row),
  reference: (row) => row.reference,
  store: (row) => row.storeNumber,
  client: (row) => row.clientName,
  status: (row) => CATEGORY_ORDER.indexOf(row.category),
  amount: (row) => row.amount,
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

function parseDetails(json: unknown): ImportedJobDetails | undefined {
  if (typeof json !== 'string' || !json) return undefined
  try {
    const parsed = JSON.parse(json)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as ImportedJobDetails) : undefined
  } catch {
    return undefined
  }
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
      workerName: job.workerName,
      ...(job.returnVisit ? { returnVisit: true } : {}),
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
      // An imported job sorts by when the old system received it, not when the file was brought in.
      createdAt: intake.details?.receivedAt || intake.createdAt,
      possibleRepeat: Boolean(intake.duplicateOf),
      workerName: intake.workerName,
      details: intake.details,
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

  /**
   * One page of the list in the asked order, with how many rows match in all. Without a page
   * size every matching row comes back (the calendar asks for one week at a time).
   */
  public page(orgTenantId: string, filter: JobRegisterFilter = {}, paging: JobRegisterPaging = {}): ListPage<JobRegisterRow> {
    const limit = pageLimit(paging.limit)
    const offset = pageOffset(paging.offset)
    if (paging.sort && !JOB_REGISTER_SORTS[paging.sort]) throw new Error(`Jobs cannot be sorted by "${paging.sort}"`)
    const rows = this.rows(orgTenantId, filter)
    const sorted = paging.sort ? sortRows(rows, JOB_REGISTER_SORTS, { key: paging.sort, dir: paging.dir === 'asc' ? 'asc' : 'desc' }) : rows
    return pageRows(sorted, offset, limit)
  }

  /** Finished jobs brought in from a file. Read-only: nothing here has a workflow, a bill or a payout. */
  private history(orgTenantId: string): JobRegisterRow[] {
    try {
      const rows = DatabaseManager.getDatabase()
        .prepare(
          `SELECT id, external_reference AS reference, store_number AS storeNumber, client_name AS clientName,
                  description, location, problem_type AS problemType, po_number AS poNumber,
                  scheduled_date AS scheduledDate, completed_date AS completedDate, outcome,
                  worker_name AS workerName, amount, currency, created_at AS createdAt, details_json AS detailsJson
             FROM job_history WHERE org_tenant_id = ? AND workflow_run_id IS NULL ORDER BY COALESCE(completed_date, scheduled_date, created_at) DESC`,
        )
        .all(orgTenantId) as Array<Record<string, any>>
      return rows.map((row) => ({
        kind: 'history' as const,
        id: String(row.id),
        reference: String(row.reference),
        source: 'import' as const,
        category:
          row.outcome === 'cancelled'
            ? ('cancelled' as const)
            : row.outcome === 'failed'
              ? ('failed' as const)
              : ('completed' as const),
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
        details: parseDetails(row.detailsJson),
      })).map((row) => (RETURN_VISIT.test(String(row.details?.failureType || '')) ? { ...row, returnVisit: true } : row))
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
      arrived: 0,
      on_hold: 0,
      failed: 0,
      completed: 0,
      reconciled: 0,
      cancelled: 0,
    } as Record<JobRegisterCategory, number>
    const sources = new Map<FieldJobSource, number>()
    const stores = new Map<string, { name?: string; open: number; completed: number; total: number }>()
    const workers = new Map<string, { userId: string; name: string; oldSystem?: boolean; open: number; completed: number; failed: number }>()
    const problems = new Map<string, { problemType: string; open: number; total: number }>()
    const durations: number[] = []
    let fixed = 0
    let returnVisits = 0
    for (const row of rows) {
      // A visit that failed and needed another one counts against the first-time fix rate, even if the old system closed it as cancelled.
      if (row.returnVisit) returnVisits += 1
      else if (DONE.has(row.category)) fixed += 1
      counts[row.category] += 1
      sources.set(row.source, (sources.get(row.source) || 0) + 1)
      const open = isOpen(row.category)
      if (row.storeNumber) {
        const store = stores.get(row.storeNumber) || { open: 0, completed: 0, total: 0 }
        store.total += 1
        if (open) store.open += 1
        if (DONE.has(row.category)) store.completed += 1
        if (!store.name && row.clientName) store.name = row.clientName
        stores.set(row.storeNumber, store)
      }
      const workerName = row.workerName?.trim()
      const workerKey = row.assigneeId || (workerName ? `old:${workerName.toLowerCase()}` : '')
      if (workerKey) {
        const worker =
          workers.get(workerKey) ||
          (row.assigneeId
            ? { userId: row.assigneeId, name: names.get(row.assigneeId) || 'Team member', open: 0, completed: 0, failed: 0 }
            : { userId: '', name: workerName!, oldSystem: true, open: 0, completed: 0, failed: 0 })
        if (OPEN.has(row.category)) worker.open += 1
        if (DONE.has(row.category)) worker.completed += 1
        if (row.category === 'failed') worker.failed += 1
        workers.set(workerKey, worker)
      }
      const problemType = row.problemType?.trim()
      if (problemType) {
        const key = problemType.toLowerCase()
        const problem = problems.get(key) || { problemType, open: 0, total: 0 }
        problem.total += 1
        if (open) problem.open += 1
        problems.set(key, problem)
      }
      // An imported job has no "received" day, so it would only pull the average to zero.
      if (DONE.has(row.category) && row.completedAt && row.kind !== 'history') {
        const days = (Date.parse(row.completedAt) - Date.parse(row.createdAt)) / 86_400_000
        if (Number.isFinite(days) && days >= 0) durations.push(days)
      }
    }
    const storeNames = new Map(
      listContacts(orgTenantId)
        .filter((contact) => contact.storeNumber)
        .map((contact) => [String(contact.storeNumber), contact.name]),
    )
    const filtered = Boolean(filter.from || filter.to)
    return {
      from: filter.from || undefined,
      to: filter.to || undefined,
      total: rows.length,
      counts,
      bySource: [...sources.entries()]
        .map(([source, count]) => ({ source, label: fieldJobSourceLabel(source), count }))
        .sort((a, b) => b.count - a.count),
      byStore: [...stores.entries()]
        .map(([storeNumber, { name, open, completed, total }]) => {
          const storeName = storeNames.get(storeNumber) || name
          return { storeNumber, ...(storeName ? { name: storeName } : {}), open, completed, total }
        })
        .sort((a, b) => b.open - a.open || b.total - a.total)
        .slice(0, 20),
      byWorker: [...workers.values()].sort((a, b) => b.open - a.open || b.completed - a.completed),
      byProblemType: [...problems.values()].sort((a, b) => b.open - a.open || b.total - a.total).slice(0, 10),
      ...(durations.length
        ? { averageDaysToComplete: Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10 }
        : {}),
      firstTimeFix: {
        fixed,
        returnVisits,
        ...(fixed + returnVisits ? { percent: Math.round((fixed / (fixed + returnVisits)) * 100) } : {}),
      },
      ...nowFigures(filtered ? this.rows(orgTenantId, { source: filter.source }) : rows),
    }
  }
}

function isOpen(category: JobRegisterCategory): boolean {
  return OPEN.has(category) || category === 'not_booked'
}

function timeOf(value: string | undefined): number {
  const text = String(value || '').trim()
  if (!text) return NaN
  return Date.parse(/^\d{4}-\d{2}-\d{2} \d/.test(text) ? `${text.replace(' ', 'T')}Z` : text)
}

/** When a job came in: the old system's received time for an imported one, otherwise when it was made. */
function receivedAt(row: JobRegisterRow): number {
  const received = timeOf(row.details?.receivedAt)
  return Number.isFinite(received) ? received : row.kind === 'history' ? NaN : timeOf(row.createdAt)
}

function mondayOf(time: number): number {
  const day = new Date(time)
  day.setUTCHours(0, 0, 0, 0)
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7))
  return day.getTime()
}

/** Today, overdue and the weekly trend, from every row (the date filter does not apply to "now"). */
function nowFigures(rows: JobRegisterRow[], now = Date.now()): Pick<JobReport, 'today' | 'weekly'> {
  const DAY = 86_400_000
  const today = new Date(now).toISOString().slice(0, 10)
  const thisWeek = mondayOf(now)
  const weekly = Array.from({ length: 8 }, (_, index) => ({
    weekStart: new Date(thisWeek - (7 - index) * 7 * DAY).toISOString().slice(0, 10),
    received: 0,
    completed: 0,
  }))
  const firstWeek = thisWeek - 7 * 7 * DAY
  const figures = { date: today, scheduled: 0, overdue: 0, unassigned: 0, urgent: 0, receivedLast7Days: 0, completedLast7Days: 0, completedLast30Days: 0 }
  let oldest = NaN
  for (const row of rows) {
    const received = receivedAt(row)
    const completed = DONE.has(row.category) ? timeOf(row.completedAt) : NaN
    if (Number.isFinite(received)) {
      if (now - received <= 7 * DAY) figures.receivedLast7Days += 1
      if (received >= firstWeek) weekly[Math.min(7, Math.floor((received - firstWeek) / (7 * DAY)))].received += 1
    }
    if (Number.isFinite(completed)) {
      if (now - completed <= 7 * DAY) figures.completedLast7Days += 1
      if (now - completed <= 30 * DAY) figures.completedLast30Days += 1
      if (completed >= firstWeek) weekly[Math.min(7, Math.floor((completed - firstWeek) / (7 * DAY)))].completed += 1
    }
    if (!isOpen(row.category)) continue
    if (row.category === 'pending' || row.category === 'not_booked') figures.unassigned += 1
    if (row.callOut) figures.urgent += 1
    const booked = String(row.scheduledDate || '').slice(0, 10)
    if (DATE.test(booked)) {
      if (booked === today) figures.scheduled += 1
      else if (booked < today && row.category !== 'failed') figures.overdue += 1
    }
    if (Number.isFinite(received) && !(received >= oldest)) oldest = received
  }
  return {
    today: {
      ...figures,
      ...(Number.isFinite(oldest) ? { oldestOpenDays: Math.max(0, Math.floor((now - oldest) / DAY)) } : {}),
    },
    weekly,
  }
}

export const jobRegisterService = new JobRegisterService()
