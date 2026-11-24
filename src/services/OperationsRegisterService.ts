/**
 * Stores, attendants and vans for an organisation that runs field jobs.
 *
 * A store is a client contact with a store number; every job, quote, invoice and call-out that
 * names that number lands in the store's file. An attendant is a team member with a staff number;
 * their jobs, leave, van and accidents land in their file. A van has a registration, a service day,
 * an MOT date, a driver and a history of services, MOTs, accidents and drivers.
 *
 * Jobs stay workflow runs and bills stay pay links: this service only reads them by store number,
 * worker and van. It never keeps a second copy.
 */

import { randomUUID } from 'crypto'

import type { ImportedJobDetails } from '../config/fieldDataImport'

import { DatabaseManager } from '../persistence/DatabaseManager'
import {
  findContactByStoreNumber,
  listContacts,
  normalizeStoreNumber,
  type OrgContact,
} from '../persistence/ContactRepository'
import {
  OPEN_FIELD_JOB_CATEGORIES,
  fieldJobAssigneeId,
  fieldJobCategory,
  fieldJobInput,
  fieldJobPriority,
  fieldJobUrgent,
  type FieldJobCategory,
  type FieldJobPriority,
} from '../config/fieldJobCategory'
import { failedVisitReasonLabel, failedVisitsOf, openFailedVisit } from '../config/failedVisit'
import { fieldJobSourceOf, type FieldJobSource } from '../config/fieldJobSource'
import { getWorkflowTypeForWorkflow, normalizeWorkflowTypeAlias } from './workflow/initiation'
import { OrganizationService } from './OrganizationService'
import { nextStaffNumber, payrollService } from './PayrollService'

export type VanStatus = 'active' | 'off_road' | 'retired'
export type VanEventKind = 'allocated' | 'service' | 'mot' | 'accident' | 'daily_check'

/** What a driver checks before the van goes out. */
export const VAN_DAILY_CHECKS = [
  'Tyres and wheels',
  'Lights and indicators',
  'Brakes',
  'Oil, water and fuel',
  'Mirrors and windscreen',
  'Load secured',
  'First aid kit and fire extinguisher',
] as const

export interface VanPhotoInput {
  filename: string
  mediaType: string
  contentBase64: string
}

const VAN_PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const VAN_PHOTO_MAX_BYTES = 5 * 1024 * 1024
const VAN_PHOTO_LIMIT = 6

const RETURN_VISIT = /return visit|revisit|access denied|no access/i

export interface JobSummary {
  runId: string
  reference: string
  storeNumber?: string
  poNumber?: string
  description: string
  location?: string
  scheduledDate?: string
  branch?: string
  priority?: FieldJobPriority
  category: FieldJobCategory
  callOut: boolean
  assigneeId?: string
  vanId?: string
  vehicle?: string
  /** Email, added by the office, or booked by the client. */
  source: FieldJobSource
  clientName?: string
  problemType?: string
  amount?: number
  currency?: string
  createdAt: string
  completedAt?: string
  /** Who the old system had on an imported job, when they are not on the team here. */
  workerName?: string
  /** The job needed another visit: a failed visit here, or the old system said so. */
  returnVisit?: boolean
  /** The visit waiting to be re-booked. */
  failedVisit?: { reason: string; label: string; note?: string; at: string; workerId?: string }
  /** Everyone who had a failed visit on this job, even after it was re-booked to someone else. */
  failedVisitWorkers?: string[]
}

export interface BillSummary {
  id: string
  kind: 'quote' | 'invoice'
  reference?: string
  description: string
  amount: number
  currency: string
  status: string
  jobRunId?: string
  createdAt: string
  /** The page the client pays the bill on. */
  payUrl?: string
}

export interface PendingIntakeSummary {
  id: string
  reference: string
  description: string
  scheduledDate?: string
  branch?: string
  priority?: FieldJobPriority
  source: 'manual' | 'email' | 'import'
  duplicateOf?: string
  createdAt: string
  clientName?: string
  location?: string
  poNumber?: string
  callOut?: boolean
  status?: string
  /** Who did it in the old system, for a job brought in from a file. */
  workerName?: string
  details?: ImportedJobDetails
}

export interface StoreSummary {
  storeNumber: string
  contactId?: string
  name: string
  phone?: string
  email?: string
  /** Street address, kept from the store import; the job's location when the office picks the store. */
  address?: string
  postcode?: string
  /** The branch that usually covers this store: the one most of its jobs went to. */
  branch?: string
  openJobs: number
  totalJobs: number
}

/** Branches and problem types the office already uses, for the job form's choices. */
export interface JobChoices {
  branches: string[]
  problemTypes: string[]
}

/** The store, branch, van and site a job is linked to. Empty string or null clears a link. */
export interface JobLinksInput {
  storeNumber?: string | null
  branch?: string | null
  vanId?: string | null
  location?: string | null
}

export const DEFAULT_PROBLEM_TYPES = ['Plumbing', 'Electrical', 'Painting', 'HVAC', 'General maintenance', 'Other']

export interface StoreFile {
  store: StoreSummary
  jobCards: JobSummary[]
  outstanding: JobSummary[]
  callOuts: JobSummary[]
  cancelled: JobSummary[]
  completed: JobSummary[]
  quotes: BillSummary[]
  invoices: BillSummary[]
  waitingToBook: PendingIntakeSummary[]
}

export interface VanRecord {
  id: string
  registration: string
  description?: string
  serviceDay?: string
  motDue?: string
  taxDue?: string
  branch?: string
  mileage?: number
  lastCheckDate?: string
  lastCheckOutcome?: 'ok' | 'defect'
  driverUserId?: string
  driverName?: string
  status: VanStatus
  createdAt: string
  updatedAt: string
}

export interface EquipmentItem {
  id: string
  name: string
  category?: string
  productCode?: string
  serialNumber?: string
  value?: number
  currency?: string
  /** Who holds it, as written in the file it came from. */
  holderName?: string
  notes?: string
  createdAt: string
}

export interface VanEvent {
  id: string
  vanId: string
  registration?: string
  kind: VanEventKind
  userId?: string
  userName?: string
  eventDate: string
  notes?: string
  outcome?: 'ok' | 'defect'
  checklist?: Array<{ item: string; ok: boolean; note?: string }>
  mileage?: number
  photos?: Array<{ id: string; filename: string; mediaType: string; sizeBytes: number }>
  createdAt: string
}

export interface AttendantSummary {
  userId: string
  name: string
  role: string
  phone?: string
  staffNumber?: string
  skills: string[]
  van?: { id: string; registration: string }
  openJobs: number
}

export interface LeaveSummary {
  requestId: string
  leaveType: string
  startDate?: string
  endDate?: string
  status: string
}

export interface AttendantFile {
  attendant: AttendantSummary
  jobCards: JobSummary[]
  failed: JobSummary[]
  completed: JobSummary[]
  holidays: LeaveSummary[]
  offSick: LeaveSummary[]
  accidents: VanEvent[]
}

export interface VanFile {
  van: VanRecord
  services: VanEvent[]
  mots: VanEvent[]
  accidents: VanEvent[]
  drivers: VanEvent[]
  dailyChecks: VanEvent[]
  jobs: JobSummary[]
}

export interface ScheduleCheck {
  storeNumber?: string
  storeName?: string
  /** Open jobs for the same store, any date. */
  storeOpenJobs: JobSummary[]
  /** Jobs for this store waiting in intake, not yet booked. */
  storeWaiting: PendingIntakeSummary[]
  /** The worker's other open jobs on the same day. */
  workerSameDay: JobSummary[]
  /** The van's other open jobs on the same day. */
  vanSameDay: JobSummary[]
  vanWarning?: string
}

const FIELD_JOB_TEMPLATE = normalizeWorkflowTypeAlias('field_execution_fept')
const SKILL_LIMIT = 20
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function clean(value: unknown, max = 200): string {
  return String(value ?? '')
    .trim()
    .slice(0, max)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value))
}

function cleanDate(value: unknown, field: string): string | undefined {
  const text = clean(value, 20)
  if (!text) return undefined
  if (!isDate(text)) throw new Error(`${field} must be a date (YYYY-MM-DD)`)
  return text
}

export class OperationsRegisterService {
  private get db() {
    return DatabaseManager.getDatabase()
  }

  // ─── Jobs ──────────────────────────────────────────────────────────────

  /** Field job runs for the organisation, newest first. */
  public listJobs(orgTenantId: string): JobSummary[] {
    const rows = this.db
      .prepare(
        `SELECT r.id, r.workflow_id AS workflowId, w.category, r.status, r.input, r.output, r.created_at AS createdAt,
                r.completed_at AS completedAt
           FROM workflow_runs r LEFT JOIN workflows w ON w.id = r.workflow_id
          WHERE r.tenant_id = ?
          ORDER BY r.created_at DESC`,
      )
      .all(orgTenantId) as Array<{
      id: string
      workflowId: string
      category?: string
      status: string
      input?: string
      output?: string
      createdAt: string
      completedAt?: string
    }>
    const storeNumbers = new Set(
      listContacts(orgTenantId)
        .map((contact) => contact.storeNumber)
        .filter(Boolean) as string[],
    )
    const vans = new Map(this.listVans(orgTenantId).map((van) => [van.id, van]))
    const jobs: JobSummary[] = []
    for (const row of rows) {
      const workflowType = getWorkflowTypeForWorkflow({ id: row.workflowId, category: row.category })
      if (normalizeWorkflowTypeAlias(workflowType) !== FIELD_JOB_TEMPLATE) continue
      const run = { status: row.status, input: parse(row.input), output: parse(row.output) }
      const input = fieldJobInput(run)
      // Jobs saved before store numbers had their own field put the store in the PO box.
      const po = clean(input.poNumber, 120)
      const storeNumber =
        normalizeStoreNumber(input.storeNumber) ||
        (storeNumbers.has(normalizeStoreNumber(po)) ? normalizeStoreNumber(po) : '')
      const vanId = clean(input.vanId, 80)
      const visits = failedVisitsOf(run.output)
      const open = fieldJobCategory(run) === 'failed' ? openFailedVisit(run.output) : undefined
      const visitWorkers = [...new Set(visits.map((visit) => String(visit?.workerId || '')).filter(Boolean))]
      jobs.push({
        runId: row.id,
        reference: clean(input.reference || input.requestId || row.id, 120),
        storeNumber: storeNumber || undefined,
        poNumber: po || undefined,
        description: clean(input.description, 500),
        location: clean(input.location, 500) || undefined,
        scheduledDate: clean(input.scheduledDate, 20) || undefined,
        branch: clean(input.branch || input.importedDetails?.branch, 100) || undefined,
        priority: fieldJobPriority(run),
        category: fieldJobCategory(run),
        callOut: fieldJobUrgent(run),
        assigneeId: fieldJobAssigneeId(run) || undefined,
        vanId: vanId || undefined,
        vehicle: (vanId && vans.get(vanId)?.registration) || clean(input.vehicleReference, 120) || undefined,
        source: fieldJobSourceOf(input),
        clientName: clean(input.clientName, 240) || undefined,
        problemType: clean(input.problemType, 120) || undefined,
        amount: Number.isFinite(Number(input.amount)) ? Number(input.amount) : undefined,
        currency: clean(input.currency, 3) || undefined,
        createdAt: row.createdAt,
        completedAt: row.completedAt || undefined,
        workerName: clean(input.importedWorkerName || input.workerName, 160) || undefined,
        ...(visits.length || RETURN_VISIT.test(String(input.importedDetails?.failureType || ''))
          ? { returnVisit: true }
          : {}),
        ...(open
          ? {
              failedVisit: {
                reason: open.reason,
                label: failedVisitReasonLabel(open.reason),
                note: clean(open.note, 500) || undefined,
                at: open.at,
                workerId: open.workerId,
              },
            }
          : {}),
        ...(visitWorkers.length ? { failedVisitWorkers: visitWorkers } : {}),
      })
    }
    return jobs
  }

  public billsForRuns(orgTenantId: string, jobRunIds: string[]): BillSummary[] {
    if (jobRunIds.length === 0) return []
    const ids = new Set(jobRunIds)
    const owner = new Map<string, string>(jobRunIds.map((id) => [id, id]))
    // The client's bill is raised by a billing run started from the job.
    const childRuns = this.db
      .prepare(
        `SELECT id, json_extract(input, '$.parentRunId') AS parentRunId
           FROM workflow_runs WHERE tenant_id = ? AND json_extract(input, '$.parentRunId') IS NOT NULL`,
      )
      .all(orgTenantId) as Array<{ id: string; parentRunId: string }>
    for (const child of childRuns) {
      if (ids.has(child.parentRunId)) owner.set(child.id, child.parentRunId)
    }
    const links = this.db
      .prepare(
        `SELECT id, description, amount, currency, status, invoice_ref AS reference, metadata, created_at AS createdAt,
                shortlink_url AS payUrl
           FROM payment_links WHERE merchant_id = ? ORDER BY created_at DESC`,
      )
      .all(orgTenantId) as Array<{
      id: string
      description: string
      amount: number
      currency: string
      status: string
      reference?: string
      metadata?: string
      createdAt: string
      payUrl?: string
    }>
    const bills: BillSummary[] = []
    for (const link of links) {
      const metadata = parse(link.metadata) || {}
      const runId = owner.get(String(metadata.parentRunId || '')) || owner.get(String(metadata.workflowRunId || ''))
      if (!runId) continue
      bills.push({
        id: link.id,
        kind: metadata.kind === 'quote' ? 'quote' : 'invoice',
        reference: link.reference || undefined,
        description: link.description,
        amount: Number(link.amount || 0),
        currency: link.currency,
        status: link.status,
        jobRunId: runId,
        createdAt: link.createdAt,
        ...(link.payUrl ? { payUrl: link.payUrl } : {}),
      })
    }
    return bills
  }

  /** Jobs in intake that are not booked yet: from the jobs mailbox or written down by the office. */
  public pendingIntakes(orgTenantId: string): Array<PendingIntakeSummary & { storeNumber?: string }> {
    const rows = this.db
      .prepare(
        `SELECT id, status, payload_json AS payloadJson, duplicate_of AS duplicateOf, created_at AS createdAt
           FROM job_intakes WHERE tenant_id = ? AND status <> 'assigned' ORDER BY created_at DESC`,
      )
      .all(orgTenantId) as Array<{
      id: string
      status: string
      payloadJson: string
      duplicateOf?: string
      createdAt: string
    }>
    return rows.map((row) => {
      const payload = parse(row.payloadJson) || {}
      return {
        id: row.id,
        reference: clean(payload.reference || row.id, 120),
        description: clean(payload.description, 500),
        scheduledDate: clean(payload.scheduledDate, 20) || undefined,
        source: payload.sourceType === 'email' ? 'email' : payload.sourceType === 'import' ? 'import' : 'manual',
        duplicateOf: row.duplicateOf || undefined,
        createdAt: row.createdAt,
        storeNumber: normalizeStoreNumber(payload.storeNumber) || undefined,
        branch: clean(payload.branch || payload.importedDetails?.branch, 100) || undefined,
        priority: fieldJobPriority({ input: payload }),
        clientName: clean(payload.clientName, 240) || undefined,
        location: clean(payload.location, 500) || undefined,
        poNumber: clean(payload.poNumber, 120) || undefined,
        callOut: fieldJobUrgent({ input: payload }),
        status: row.status,
        workerName: clean(payload.importedWorkerName, 160) || undefined,
        details:
          payload.importedDetails &&
          typeof payload.importedDetails === 'object' &&
          !Array.isArray(payload.importedDetails)
            ? (payload.importedDetails as ImportedJobDetails)
            : undefined,
      }
    })
  }

  // ─── Stores ────────────────────────────────────────────────────────────

  public listStores(orgTenantId: string): StoreSummary[] {
    const jobs = this.listJobs(orgTenantId)
    const stores = new Map<string, StoreSummary>()
    for (const contact of listContacts(orgTenantId)) {
      if (!contact.storeNumber) continue
      stores.set(contact.storeNumber, storeFromContact(contact))
    }
    for (const job of jobs) {
      if (!job.storeNumber) continue
      const store =
        stores.get(job.storeNumber) ||
        ({ storeNumber: job.storeNumber, name: `Store ${job.storeNumber}`, openJobs: 0, totalJobs: 0 } as StoreSummary)
      store.totalJobs += 1
      if (OPEN_FIELD_JOB_CATEGORIES.has(job.category)) store.openJobs += 1
      stores.set(job.storeNumber, store)
    }
    const branches = this.storeBranches(orgTenantId, jobs)
    for (const store of stores.values()) {
      const branch = branches.get(store.storeNumber)
      if (branch) store.branch = branch
    }
    return [...stores.values()].sort((a, b) => a.storeNumber.localeCompare(b.storeNumber, undefined, { numeric: true }))
  }

  /** Each store's usual branch: the branch most of its live and old-system jobs went to. */
  private storeBranches(orgTenantId: string, jobs: JobSummary[] = this.listJobs(orgTenantId)): Map<string, string> {
    const counts = new Map<string, Map<string, number>>()
    const add = (store: unknown, branch: unknown) => {
      const storeNumber = normalizeStoreNumber(store)
      const name = clean(branch, 100)
      if (!storeNumber || !name) return
      const perStore = counts.get(storeNumber) || new Map<string, number>()
      perStore.set(name, (perStore.get(name) || 0) + 1)
      counts.set(storeNumber, perStore)
    }
    for (const job of jobs) add(job.storeNumber, job.branch)
    for (const item of this.pendingIntakes(orgTenantId)) add(item.storeNumber, item.branch)
    for (const row of this.historyBranches(orgTenantId)) add(row.storeNumber, row.branch)
    return new Map(
      [...counts.entries()].map(([storeNumber, perStore]) => [
        storeNumber,
        [...perStore.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0],
      ]),
    )
  }

  private historyBranches(orgTenantId: string): Array<{ storeNumber?: string; branch?: string }> {
    try {
      return this.db
        .prepare(
          `SELECT store_number AS storeNumber, json_extract(details_json, '$.branch') AS branch
             FROM job_history WHERE org_tenant_id = ?`,
        )
        .all(orgTenantId) as Array<{ storeNumber?: string; branch?: string }>
    } catch {
      return []
    }
  }

  private distinctColumn(sql: string, orgTenantId: string): string[] {
    try {
      return (this.db.prepare(sql).all(orgTenantId) as Array<{ value?: string }>)
        .map((row) => clean(row.value, 120))
        .filter(Boolean)
    } catch {
      return []
    }
  }

  /**
   * The branches and problem types this organisation already uses: from its vans, staff, jobs,
   * old-system history, rate cards and job sheets. Most used first.
   */
  public jobChoices(orgTenantId: string): JobChoices {
    const tally = (values: string[]) => {
      const counts = new Map<string, { label: string; count: number }>()
      for (const value of values) {
        const key = value.toLowerCase()
        const entry = counts.get(key) || { label: value, count: 0 }
        entry.count += 1
        counts.set(key, entry)
      }
      return [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).map((e) => e.label)
    }
    const jobs = this.listJobs(orgTenantId)
    const intakes = this.pendingIntakes(orgTenantId)
    const branches = tally([
      ...this.listVans(orgTenantId).map((van) => clean(van.branch, 100)),
      ...this.distinctColumn(`SELECT branch AS value FROM employees WHERE tenant_id = ?`, orgTenantId),
      ...jobs.map((job) => clean(job.branch, 100)),
      ...intakes.map((item) => clean(item.branch, 100)),
      ...this.historyBranches(orgTenantId).map((row) => clean(row.branch, 100)),
    ].filter(Boolean))
    const used = tally([
      ...this.distinctColumn(`SELECT problem_type AS value FROM org_job_sheets WHERE org_tenant_id = ?`, orgTenantId),
      ...this.distinctColumn(
        `SELECT problem_type AS value FROM org_rate_cards WHERE org_tenant_id = ? AND active = 1`,
        orgTenantId,
      ),
      ...jobs.map((job) => clean(job.problemType, 120)),
      ...this.distinctColumn(`SELECT problem_type AS value FROM job_history WHERE org_tenant_id = ?`, orgTenantId),
    ].filter(Boolean))
    const seen = new Set(used.map((value) => value.toLowerCase()))
    return {
      branches,
      problemTypes: [...used, ...DEFAULT_PROBLEM_TYPES.filter((value) => !seen.has(value.toLowerCase()))],
    }
  }

  /**
   * The store a client's email is about: its store number when the email gives one we know, else a
   * known store number at the start of the subject ("1535 Swadlincote_Signage"), else the store
   * whose postcode the email mentions.
   */
  public matchStore(
    orgTenantId: string,
    hints: { storeNumber?: string; subject?: string; text?: string; senderEmail?: string },
  ): StoreSummary | undefined {
    const contacts = listContacts(orgTenantId).filter((contact) => contact.storeNumber)
    if (contacts.length === 0) return undefined
    const byNumber = new Map(contacts.map((contact) => [contact.storeNumber!, contact]))
    const pick = (contact?: OrgContact) => {
      if (!contact) return undefined
      const store = storeFromContact(contact)
      const branch = this.storeBranches(orgTenantId).get(store.storeNumber)
      return branch ? { ...store, branch } : store
    }
    const given = normalizeStoreNumber(hints.storeNumber)
    if (given && byNumber.has(given)) return pick(byNumber.get(given))
    const sender = String(hints.senderEmail || '').toLowerCase()
    if (sender) {
      const bySender = contacts.find((contact) => contact.email?.toLowerCase() === sender)
      if (bySender) return pick(bySender)
    }
    for (const candidate of String(hints.subject || '').match(/\b\d{3,6}\b/g) || []) {
      const contact = byNumber.get(normalizeStoreNumber(candidate))
      if (contact) return pick(contact)
    }
    const text = `${hints.subject || ''}\n${hints.text || ''}`.toUpperCase().replace(/\s+/g, ' ')
    const byPostcode = contacts.find((contact) => {
      const postcode = String(contact.postcode || '').toUpperCase().replace(/\s+/g, ' ').trim()
      return postcode.length >= 5 && text.includes(postcode)
    })
    return pick(byPostcode)
  }

  /**
   * Link a job to a store, branch, van and site after it came in, the way a worker is given out.
   * A finished or cancelled job keeps what it was done with.
   */
  public linkJob(orgTenantId: string, jobId: string, changes: JobLinksInput): JobSummary | PendingIntakeSummary {
    const updates: Record<string, unknown> = {}
    const removals: string[] = []
    const set = (key: string, value: string) => {
      if (value) updates[key] = value
      else removals.push(key)
    }
    if (changes.storeNumber !== undefined) {
      const storeNumber = normalizeStoreNumber(changes.storeNumber)
      if (changes.storeNumber && !storeNumber) throw new Error('That store number is not valid.')
      set('storeNumber', storeNumber)
      const contact = storeNumber ? findContactByStoreNumber(orgTenantId, storeNumber) : undefined
      if (contact) updates.clientName = contact.name
    }
    if (changes.branch !== undefined) set('branch', clean(changes.branch, 100))
    if (changes.location !== undefined) set('location', clean(changes.location, 500))
    if (changes.vanId !== undefined) {
      const vanId = clean(changes.vanId, 80)
      if (vanId) {
        const van = this.getVan(orgTenantId, vanId)
        if (!van) throw new Error('That van is not on the register.')
        if (van.status !== 'active') throw new Error(this.vanWarning(van) || 'That van is not available.')
        updates.vanId = van.id
        updates.vehicleReference = van.registration
      } else {
        removals.push('vanId', 'vehicleReference')
      }
    }
    const apply = (input: Record<string, any>) => {
      const next = { ...input, ...updates }
      for (const key of removals) delete next[key]
      return next
    }

    const job = this.listJobs(orgTenantId).find((item) => item.runId === jobId)
    if (job) {
      if (['completed', 'reconciled', 'cancelled'].includes(job.category)) {
        throw new Error('A finished or cancelled job keeps the store, branch and van it was done with.')
      }
      const row = this.db
        .prepare('SELECT input, output FROM workflow_runs WHERE id = ? AND tenant_id = ?')
        .get(jobId, orgTenantId) as { input?: string; output?: string }
      const input = apply(parse(row.input) || {})
      const output = parse(row.output)
      const nextOutput =
        output && typeof output === 'object' && output.workflowInput && typeof output.workflowInput === 'object'
          ? { ...output, workflowInput: apply(output.workflowInput) }
          : output
      this.db
        .prepare('UPDATE workflow_runs SET input = ?, output = ? WHERE id = ? AND tenant_id = ?')
        .run(JSON.stringify(input), nextOutput === undefined ? row.output ?? null : JSON.stringify(nextOutput), jobId, orgTenantId)
      return this.listJobs(orgTenantId).find((item) => item.runId === jobId)!
    }

    const intake = this.db
      .prepare(`SELECT payload_json AS payload FROM job_intakes WHERE id = ? AND tenant_id = ? AND status = 'pending'`)
      .get(jobId, orgTenantId) as { payload?: string } | undefined
    if (!intake) throw new Error('Job not found')
    const payload = apply(parse(intake.payload) || {})
    this.db
      .prepare(
        `UPDATE job_intakes SET payload_json = ?, dedupe_key = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND tenant_id = ? AND status = 'pending'`,
      )
      .run(JSON.stringify(payload), intakeDedupeKey(payload.storeNumber, payload.poNumber) || null, jobId, orgTenantId)
    return this.pendingIntakes(orgTenantId).find((item) => item.id === jobId)!
  }

  /** The van on the road that this person drives, if the register gives them one. */
  public driverVan(orgTenantId: string, userId: string | undefined): VanRecord | undefined {
    if (!userId) return undefined
    return this.listVans(orgTenantId).find((van) => van.driverUserId === userId && van.status === 'active')
  }

  /** A van whose registration the text mentions, written with or without spaces. */
  public matchVan(orgTenantId: string, text: string | undefined): VanRecord | undefined {
    const squashed = String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (!squashed) return undefined
    return this.listVans(orgTenantId).find((van) => {
      const registration = van.registration.toUpperCase().replace(/[^A-Z0-9]/g, '')
      return registration.length >= 5 && squashed.includes(registration)
    })
  }

  /**
   * A known branch the text names on a "Branch:", "Depot:", "Area:" or "Region:" line. Branch names
   * are often town names, so a town in an address is not read as the branch.
   */
  public matchBranch(orgTenantId: string, text: string | undefined, branches?: string[]): string | undefined {
    const lines = String(text || '').match(/(?:^|\n)\s*(?:branch|depot|area|region)\s*[:\-]\s*[^\n]+/gi) || []
    if (lines.length === 0) return undefined
    const known = branches || this.jobChoices(orgTenantId).branches
    for (const line of lines) {
      const value = line.replace(/^\s*(?:branch|depot|area|region)\s*[:\-]\s*/i, '').trim().toLowerCase()
      const found = known.find((branch) => new RegExp(`\\b${escapeRegExp(branch.toLowerCase())}\\b`).test(value))
      if (found) return found
    }
    return undefined
  }

  /** One of the organisation's own problem types the text names; the longest name wins ("Fire alarm" over "Alarm"). */
  public matchProblemType(orgTenantId: string, text: string | undefined, fallback?: string, problemTypes?: string[]): string | undefined {
    const types = problemTypes || this.jobChoices(orgTenantId).problemTypes
    const haystack = String(text || '').toLowerCase()
    const named = types
      .filter((type) => type.toLowerCase() !== 'other')
      .sort((a, b) => b.length - a.length)
      .find((type) => new RegExp(`\\b${escapeRegExp(type.toLowerCase())}\\b`).test(haystack))
    if (named) return named
    if (!fallback) return undefined
    return types.find((type) => type.toLowerCase() === fallback.toLowerCase()) || fallback
  }

  /**
   * Link a job request from email or another system to the registers, the way the office would on
   * "New job": its store (with the store's name, phone, site and usual branch), a branch the email
   * names, a van whose registration it gives, and one of the organisation's problem types. Values
   * the request already carries are kept.
   */
  public linkIntake(
    orgTenantId: string,
    payload: {
      storeNumber?: string
      branch?: string
      vanId?: string
      vehicleReference?: string
      problemType?: string
      clientName?: string
      clientPhone?: string
      location?: string
    },
    hints: { subject?: string; text?: string; senderEmail?: string; problemTypeGuess?: string } = {},
  ): {
    storeNumber?: string
    branch?: string
    vanId?: string
    vehicleReference?: string
    problemType?: string
    clientName?: string
    clientPhone?: string
    location?: string
  } {
    const text = `${hints.subject || ''}\n${hints.text || ''}`
    const store = this.matchStore(orgTenantId, {
      storeNumber: payload.storeNumber,
      subject: hints.subject,
      text: hints.text,
      senderEmail: hints.senderEmail,
    })
    const choices = this.jobChoices(orgTenantId)
    const givenVan = payload.vanId ? this.getVan(orgTenantId, payload.vanId) : undefined
    const van =
      givenVan ||
      (payload.vanId ? undefined : this.matchVan(orgTenantId, `${payload.vehicleReference || ''}\n${text}`))
    const usableVan = van && van.status === 'active' ? van : undefined
    const branch =
      clean(payload.branch, 100) ||
      this.matchBranch(orgTenantId, text, choices.branches) ||
      store?.branch ||
      usableVan?.branch ||
      undefined
    const given = clean(payload.problemType, 120)
    const problemType = given
      ? choices.problemTypes.find((type) => type.toLowerCase() === given.toLowerCase()) || given
      : this.matchProblemType(orgTenantId, text, hints.problemTypeGuess, choices.problemTypes)
    const storeNumber = store?.storeNumber || normalizeStoreNumber(payload.storeNumber) || undefined
    return {
      ...(storeNumber ? { storeNumber } : {}),
      ...(branch ? { branch } : {}),
      ...(usableVan ? { vanId: usableVan.id, vehicleReference: usableVan.registration } : {}),
      ...(problemType ? { problemType } : {}),
      ...(payload.clientName || store?.name ? { clientName: payload.clientName || store?.name } : {}),
      ...(payload.clientPhone || store?.phone ? { clientPhone: payload.clientPhone || store?.phone } : {}),
      ...(payload.location || store ? { location: payload.location || (store ? storeSiteLocation(store) : undefined) } : {}),
    }
  }

  /**
   * When a worker is given a job, their van goes with it: a job with no van, or still on the
   * previous worker's van, takes the van the new worker drives. A van the office chose stays.
   */
  public linkAssigneeVan(orgTenantId: string, jobId: string, assigneeUserId: string, previousAssigneeId?: string): VanRecord | undefined {
    const van = this.driverVan(orgTenantId, assigneeUserId)
    if (!van) return undefined
    const row = this.db
      .prepare('SELECT input FROM workflow_runs WHERE id = ? AND tenant_id = ?')
      .get(jobId, orgTenantId) as { input?: string } | undefined
    if (!row) return undefined
    const currentVanId = clean(parse(row.input)?.vanId, 80)
    if (currentVanId === van.id) return van
    if (currentVanId) {
      const current = this.getVan(orgTenantId, currentVanId)
      const followsPreviousWorker = Boolean(previousAssigneeId) && current?.driverUserId === previousAssigneeId
      if (current && !followsPreviousWorker) return undefined
    }
    this.linkJob(orgTenantId, jobId, { vanId: van.id })
    return van
  }

  public storeFile(orgTenantId: string, rawStoreNumber: string): StoreFile | undefined {
    const storeNumber = normalizeStoreNumber(rawStoreNumber)
    if (!storeNumber) return undefined
    const contact = findContactByStoreNumber(orgTenantId, storeNumber)
    const jobs = this.listJobs(orgTenantId).filter((job) => job.storeNumber === storeNumber)
    const waiting = this.pendingIntakes(orgTenantId).filter((item) => item.storeNumber === storeNumber)
    if (!contact && jobs.length === 0 && waiting.length === 0) return undefined
    const bills = this.billsForRuns(
      orgTenantId,
      jobs.map((job) => job.runId),
    )
    const store = contact
      ? storeFromContact(contact)
      : { storeNumber, name: `Store ${storeNumber}`, openJobs: 0, totalJobs: 0 }
    store.totalJobs = jobs.length
    store.openJobs = jobs.filter((job) => OPEN_FIELD_JOB_CATEGORIES.has(job.category)).length
    return {
      store,
      jobCards: jobs,
      outstanding: jobs.filter((job) => OPEN_FIELD_JOB_CATEGORIES.has(job.category)),
      callOuts: jobs.filter((job) => job.callOut),
      cancelled: jobs.filter((job) => job.category === 'cancelled'),
      completed: jobs.filter((job) => job.category === 'completed' || job.category === 'reconciled'),
      quotes: bills.filter((bill) => bill.kind === 'quote'),
      invoices: bills.filter((bill) => bill.kind === 'invoice'),
      waitingToBook: waiting.map(({ storeNumber: _store, ...item }) => item),
    }
  }

  // ─── Attendants ────────────────────────────────────────────────────────

  private members(orgTenantId: string) {
    return new OrganizationService(undefined as any)
      .listOrgMembers(orgTenantId)
      .filter((member: any) => member?.userId && member.status !== 'inactive')
  }

  private memberNames(orgTenantId: string): Map<string, string> {
    return new Map(
      this.members(orgTenantId).map((member: any) => [
        String(member.userId),
        String(member.displayName || member.phone || 'Team member'),
      ]),
    )
  }

  private profiles(orgTenantId: string): Map<string, { staffNumber: string; skills: string[] }> {
    const rows = this.db
      .prepare(
        `SELECT user_id AS userId, staff_number AS staffNumber, skills_json AS skills
           FROM employees WHERE tenant_id = ? AND user_id IS NOT NULL AND user_id != ''`,
      )
      .all(orgTenantId) as Array<{ userId: string; staffNumber: string; skills: string }>
    return new Map(
      rows.map((row) => [row.userId, { staffNumber: row.staffNumber, skills: (parse(row.skills) as string[]) || [] }]),
    )
  }

  public listAttendants(orgTenantId: string): AttendantSummary[] {
    // Every team member has an employee record (People & payroll), where the staff number lives.
    payrollService.syncTeam(orgTenantId, this.members(orgTenantId))
    const profiles = this.profiles(orgTenantId)
    const vans = this.listVans(orgTenantId)
    const jobs = this.listJobs(orgTenantId)
    return this.members(orgTenantId).map((member: any) => {
      const userId = String(member.userId)
      const profile = profiles.get(userId)
      const van = vans.find((item) => item.driverUserId === userId && item.status !== 'retired')
      return {
        userId,
        name: String(member.displayName || member.phone || 'Team member'),
        role: String(member.role || 'member'),
        phone: member.phone ? String(member.phone) : undefined,
        staffNumber: profile?.staffNumber,
        skills: profile?.skills || [],
        van: van ? { id: van.id, registration: van.registration } : undefined,
        openJobs: jobs.filter((job) => job.assigneeId === userId && OPEN_FIELD_JOB_CATEGORIES.has(job.category)).length,
      }
    })
  }

  public saveAttendantProfile(
    orgTenantId: string,
    userId: string,
    input: { staffNumber?: string; skills?: string[] },
  ): AttendantSummary {
    if (!this.members(orgTenantId).some((member: any) => String(member.userId) === userId)) {
      throw new Error('That person is not an active member of this organisation')
    }
    payrollService.syncTeam(orgTenantId, this.members(orgTenantId))
    const before = this.db
      .prepare('SELECT staff_number AS staffNumber FROM employees WHERE tenant_id = ? AND user_id = ?')
      .get(orgTenantId, userId) as { staffNumber?: string | null } | undefined
    // Left blank, they keep their number or are given the next one.
    const staffNumber = clean(input.staffNumber, 40).toUpperCase() || before?.staffNumber || nextStaffNumber(orgTenantId)
    const taken = this.db
      .prepare('SELECT user_id AS userId FROM employees WHERE tenant_id = ? AND staff_number = ?')
      .get(orgTenantId, staffNumber) as { userId: string } | undefined
    if (taken && taken.userId !== userId) throw new Error(`Staff number ${staffNumber} is already in use`)
    const skillsByKey = new Map<string, string>()
    for (const skill of Array.isArray(input.skills) ? input.skills : []) {
      const name = clean(skill, 60)
      if (name && !skillsByKey.has(name.toLowerCase())) skillsByKey.set(name.toLowerCase(), name)
    }
    const skills = Array.from(skillsByKey.values()).slice(0, SKILL_LIMIT)
    const updated = this.db
      .prepare(
        `UPDATE employees SET staff_number = ?, skills_json = ?, updated_at = CURRENT_TIMESTAMP
          WHERE tenant_id = ? AND user_id = ?`,
      )
      .run(staffNumber, JSON.stringify(skills), orgTenantId, userId)
    if (!updated.changes) throw new Error('That person has no record yet. Open People & payroll and try again.')
    if ((before?.staffNumber || '') !== staffNumber) {
      // The staff number is on their staff card, so they get a new one to accept.
      void import('./OrganizationService')
        .then(({ OrganizationService }) =>
          new OrganizationService(undefined as any).staffCardDetailsChanged(orgTenantId, userId),
        )
        .catch(() => undefined)
    }
    return this.listAttendants(orgTenantId).find((item) => item.userId === userId)!
  }

  private leave(orgTenantId: string, userId: string): LeaveSummary[] {
    const rows = this.db
      .prepare(
        `SELECT r.id, r.status, r.context_json AS context
           FROM requests r
           JOIN organizations o ON o.id = r.organization_id
           JOIN people p ON p.id = r.requester_person_id
          WHERE o.tenant_id = ? AND p.subject_ref = ? AND r.request_type = 'hr.leave'
          ORDER BY r.created_at DESC LIMIT 200`,
      )
      .all(orgTenantId, userId) as Array<{ id: string; status: string; context?: string }>
    return rows.map((row) => {
      const context = parse(row.context) || {}
      return {
        requestId: row.id,
        leaveType: clean(context.leaveType, 40) || 'other',
        startDate: clean(context.startDate, 20) || undefined,
        endDate: clean(context.endDate, 20) || undefined,
        status: row.status,
      }
    })
  }

  public attendantFile(orgTenantId: string, userId: string): AttendantFile | undefined {
    const attendant = this.listAttendants(orgTenantId).find((item) => item.userId === userId)
    if (!attendant) return undefined
    const all = this.listJobs(orgTenantId)
    const jobs = all.filter((job) => job.assigneeId === userId)
    const leave = this.leave(orgTenantId, userId)
    return {
      attendant,
      jobCards: jobs,
      // A failed visit stays on the file of the person who had it, even once the job moved on.
      failed: all.filter(
        (job) => (job.assigneeId === userId && job.category === 'failed') || job.failedVisitWorkers?.includes(userId),
      ),
      completed: jobs.filter((job) => job.category === 'completed' || job.category === 'reconciled'),
      holidays: leave.filter((item) => item.leaveType !== 'sick'),
      offSick: leave.filter((item) => item.leaveType === 'sick'),
      accidents: this.events(orgTenantId, { userId, kind: 'accident' }),
    }
  }

  // ─── Vans ──────────────────────────────────────────────────────────────

  public listEquipment(orgTenantId: string): EquipmentItem[] {
    try {
      const rows = this.db
        .prepare(
          `SELECT id, name, category, product_code AS productCode, serial_number AS serialNumber, value, currency,
                  holder_name AS holderName, notes, created_at AS createdAt
             FROM org_equipment WHERE org_tenant_id = ? ORDER BY category, name`,
        )
        .all(orgTenantId) as Array<Record<string, any>>
      return rows.map((row) => {
        const item: EquipmentItem = { id: String(row.id), name: String(row.name), createdAt: String(row.createdAt) }
        for (const key of ['category', 'productCode', 'serialNumber', 'currency', 'holderName', 'notes'] as const) {
          if (row[key]) item[key] = String(row[key])
        }
        if (row.value !== null && row.value !== undefined) item.value = Number(row.value)
        return item
      })
    } catch (error) {
      if (/no such table/i.test(error instanceof Error ? error.message : String(error))) return []
      throw error
    }
  }

  public listVans(orgTenantId: string): VanRecord[] {
    const names = this.memberNamesSafe(orgTenantId)
    const rows = this.db
      .prepare(
        `SELECT id, registration, description, service_day AS serviceDay, mot_due AS motDue, tax_due AS taxDue,
                branch, mileage, last_check_date AS lastCheckDate, last_check_outcome AS lastCheckOutcome,
                driver_user_id AS driverUserId, status, created_at AS createdAt, updated_at AS updatedAt
           FROM org_vans WHERE org_tenant_id = ? ORDER BY registration`,
      )
      .all(orgTenantId) as Array<Omit<VanRecord, 'driverName'>>
    return rows.map((row) => ({
      ...row,
      description: row.description || undefined,
      serviceDay: row.serviceDay || undefined,
      motDue: row.motDue || undefined,
      taxDue: row.taxDue || undefined,
      branch: row.branch || undefined,
      mileage: row.mileage ?? undefined,
      lastCheckDate: row.lastCheckDate || undefined,
      lastCheckOutcome: row.lastCheckOutcome || undefined,
      driverUserId: row.driverUserId || undefined,
      driverName: row.driverUserId ? names.get(row.driverUserId) : undefined,
    }))
  }

  /** Van lists are read inside job lists, so a missing member table must not break them. */
  public memberNamesSafe(orgTenantId: string): Map<string, string> {
    try {
      return this.memberNames(orgTenantId)
    } catch {
      return new Map()
    }
  }

  public getVan(orgTenantId: string, vanId: string): VanRecord | undefined {
    return this.listVans(orgTenantId).find((van) => van.id === vanId)
  }

  public saveVan(
    orgTenantId: string,
    actorId: string,
    input: {
      id?: string
      registration?: string
      description?: string
      serviceDay?: string
      motDue?: string
      taxDue?: string
      branch?: string
      mileage?: number | null
      lastCheckDate?: string
      lastCheckOutcome?: 'ok' | 'defect' | null
      driverUserId?: string | null
      status?: VanStatus
    },
  ): VanRecord {
    const existing = input.id ? this.getVan(orgTenantId, input.id) : undefined
    if (input.id && !existing) throw new Error('Van not found')
    const registration = clean(input.registration ?? existing?.registration, 20)
      .toUpperCase()
      .replace(/\s+/g, ' ')
    if (!registration) throw new Error('Add the registration')
    const taken = this.db
      .prepare('SELECT id FROM org_vans WHERE org_tenant_id = ? AND registration = ?')
      .get(orgTenantId, registration) as { id: string } | undefined
    if (taken && taken.id !== existing?.id) throw new Error(`Van ${registration} is already on the register`)
    const serviceDay = clean(input.serviceDay ?? existing?.serviceDay, 12).toLowerCase()
    if (serviceDay && !DAY_NAMES.includes(serviceDay)) throw new Error('Service day must be a day of the week')
    const motDue = input.motDue === undefined ? existing?.motDue : cleanDate(input.motDue, 'MOT due date')
    const taxDue = input.taxDue === undefined ? existing?.taxDue : cleanDate(input.taxDue, 'Tax due date')
    const lastCheckDate =
      input.lastCheckDate === undefined ? existing?.lastCheckDate : cleanDate(input.lastCheckDate, 'Last check date')
    const lastCheckOutcome =
      input.lastCheckOutcome === undefined ? existing?.lastCheckOutcome : input.lastCheckOutcome || undefined
    if (lastCheckOutcome && !['ok', 'defect'].includes(lastCheckOutcome)) throw new Error('Unknown check outcome')
    const mileage = input.mileage === undefined ? existing?.mileage : (input.mileage ?? undefined)
    if (mileage !== undefined && (!Number.isInteger(mileage) || mileage < 0)) {
      throw new Error('Mileage must be a whole number')
    }
    const branch = clean(input.branch ?? existing?.branch, 80)
    const status: VanStatus = input.status ?? existing?.status ?? 'active'
    if (!['active', 'off_road', 'retired'].includes(status)) throw new Error('Unknown van status')
    const driverUserId =
      input.driverUserId === undefined ? existing?.driverUserId : clean(input.driverUserId, 160) || undefined
    if (driverUserId && !this.members(orgTenantId).some((member: any) => String(member.userId) === driverUserId)) {
      throw new Error('The driver must be an active member of this organisation')
    }
    const id = existing?.id || randomUUID()
    const save = this.db.transaction(() => {
      if (driverUserId) {
        // One van per driver: moving a driver frees the van they had.
        const others = this.db
          .prepare('SELECT id FROM org_vans WHERE org_tenant_id = ? AND driver_user_id = ? AND id <> ?')
          .all(orgTenantId, driverUserId, id) as Array<{ id: string }>
        for (const other of others) {
          this.db
            .prepare('UPDATE org_vans SET driver_user_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(other.id)
        }
      }
      this.db
        .prepare(
          `INSERT INTO org_vans (id, org_tenant_id, registration, description, service_day, mot_due, driver_user_id, status,
                                 tax_due, branch, mileage, last_check_date, last_check_outcome)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET
             registration = excluded.registration, description = excluded.description,
             service_day = excluded.service_day, mot_due = excluded.mot_due,
             driver_user_id = excluded.driver_user_id, status = excluded.status,
             tax_due = excluded.tax_due, branch = excluded.branch, mileage = excluded.mileage,
             last_check_date = excluded.last_check_date, last_check_outcome = excluded.last_check_outcome,
             updated_at = CURRENT_TIMESTAMP`,
        )
        .run(
          id,
          orgTenantId,
          registration,
          clean(input.description ?? existing?.description, 200) || null,
          serviceDay || null,
          motDue || null,
          driverUserId || null,
          status,
          taxDue || null,
          branch || null,
          mileage ?? null,
          lastCheckDate || null,
          lastCheckOutcome || null,
        )
      if (driverUserId && driverUserId !== existing?.driverUserId) {
        this.insertEvent(orgTenantId, actorId, {
          vanId: id,
          kind: 'allocated',
          userId: driverUserId,
          eventDate: new Date().toISOString().slice(0, 10),
        })
      }
    })
    save()
    return this.getVan(orgTenantId, id)!
  }

  public addVanEvent(
    orgTenantId: string,
    actorId: string,
    vanId: string,
    input: { kind?: string; eventDate?: string; userId?: string; notes?: string; nextDue?: string },
  ): VanEvent {
    const van = this.getVan(orgTenantId, vanId)
    if (!van) throw new Error('Van not found')
    const kind = clean(input.kind, 20) as VanEventKind
    if (!['service', 'mot', 'accident'].includes(kind)) throw new Error('Record a service, an MOT or an accident')
    const eventDate = cleanDate(input.eventDate, 'Date') || new Date().toISOString().slice(0, 10)
    const userId = clean(input.userId, 160) || (kind === 'accident' ? van.driverUserId : undefined)
    if (kind === 'accident' && !clean(input.notes)) throw new Error('Say what happened')
    const nextDue = cleanDate(input.nextDue, 'Next MOT date')
    const event = this.db.transaction(() => {
      const created = this.insertEvent(orgTenantId, actorId, {
        vanId,
        kind,
        userId,
        eventDate,
        notes: clean(input.notes, 1000) || undefined,
      })
      if (kind === 'mot' && nextDue) {
        this.db
          .prepare('UPDATE org_vans SET mot_due = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND org_tenant_id = ?')
          .run(nextDue, vanId, orgTenantId)
      }
      return created
    })()
    return this.events(orgTenantId, { vanId }).find((item) => item.id === event)!
  }

  private insertEvent(
    orgTenantId: string,
    actorId: string,
    input: {
      vanId: string
      kind: VanEventKind
      userId?: string
      eventDate: string
      notes?: string
      outcome?: 'ok' | 'defect'
      checklist?: unknown
      mileage?: number
    },
  ): string {
    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO org_van_events
           (id, org_tenant_id, van_id, kind, user_id, event_date, notes, outcome, checklist_json, mileage, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        orgTenantId,
        input.vanId,
        input.kind,
        input.userId || null,
        input.eventDate,
        input.notes || null,
        input.outcome || null,
        input.checklist ? JSON.stringify(input.checklist) : null,
        input.mileage ?? null,
        actorId,
      )
    return id
  }

  private events(orgTenantId: string, filter: { vanId?: string; userId?: string; kind?: VanEventKind }): VanEvent[] {
    const names = this.memberNamesSafe(orgTenantId)
    const clauses = ['e.org_tenant_id = ?']
    const params: string[] = [orgTenantId]
    if (filter.vanId) {
      clauses.push('e.van_id = ?')
      params.push(filter.vanId)
    }
    if (filter.userId) {
      clauses.push('e.user_id = ?')
      params.push(filter.userId)
    }
    if (filter.kind) {
      clauses.push('e.kind = ?')
      params.push(filter.kind)
    }
    const rows = this.db
      .prepare(
        `SELECT e.id, e.van_id AS vanId, v.registration, e.kind, e.user_id AS userId, e.event_date AS eventDate,
                e.notes, e.outcome, e.checklist_json AS checklistJson, e.mileage, e.created_at AS createdAt
           FROM org_van_events e JOIN org_vans v ON v.id = e.van_id
          WHERE ${clauses.join(' AND ')}
          ORDER BY e.event_date DESC, e.created_at DESC LIMIT 500`,
      )
      .all(...params) as Array<VanEvent & { checklistJson?: string | null }>
    const photos = this.db
      .prepare(
        `SELECT id, event_id AS eventId, filename, media_type AS mediaType, size_bytes AS sizeBytes
           FROM org_van_event_photos WHERE org_tenant_id = ? ORDER BY created_at`,
      )
      .all(orgTenantId) as Array<{
      id: string
      eventId: string
      filename: string
      mediaType: string
      sizeBytes: number
    }>
    const photosOf = new Map<string, NonNullable<VanEvent['photos']>>()
    for (const { eventId, ...photo } of photos) photosOf.set(eventId, [...(photosOf.get(eventId) || []), photo])
    return rows.map(({ checklistJson, ...row }) => ({
      ...row,
      userId: row.userId || undefined,
      userName: row.userId ? names.get(row.userId) : undefined,
      notes: row.notes || undefined,
      outcome: row.outcome || undefined,
      mileage: row.mileage ?? undefined,
      ...(checklistJson ? { checklist: parse(checklistJson) || undefined } : {}),
      ...(photosOf.has(row.id) ? { photos: photosOf.get(row.id) } : {}),
    }))
  }

  /**
   * The driver's check before the van goes out. Any item not ok marks the check as a defect and
   * needs a note; a defect is kept in the van's file for the office to act on.
   */
  public recordDailyCheck(
    orgTenantId: string,
    actorId: string,
    vanId: string,
    input: {
      checks?: Array<{ item?: string; ok?: boolean; note?: string }>
      mileage?: number
      notes?: string
      photos?: VanPhotoInput[]
    },
  ): VanEvent {
    const van = this.getVan(orgTenantId, vanId)
    if (!van) throw new Error('Van not found')
    if (van.status === 'retired') throw new Error('This van is retired')
    const given = new Map((input.checks || []).map((check) => [clean(check.item, 120), check]))
    const checklist = VAN_DAILY_CHECKS.map((item) => {
      const check = given.get(item)
      if (!check || typeof check.ok !== 'boolean') throw new Error(`Say whether "${item}" is ok`)
      const note = clean(check.note, 300)
      if (!check.ok && !note) throw new Error(`Say what is wrong with "${item}"`)
      return { item, ok: check.ok, ...(note ? { note } : {}) }
    })
    const mileage = input.mileage === undefined || input.mileage === null ? undefined : Number(input.mileage)
    if (mileage !== undefined && (!Number.isInteger(mileage) || mileage < 0))
      throw new Error('Mileage must be a whole number')
    const today = new Date().toISOString().slice(0, 10)
    const already = this.db
      .prepare(
        `SELECT id FROM org_van_events WHERE org_tenant_id = ? AND van_id = ? AND kind = 'daily_check'
            AND event_date = ? AND user_id = ?`,
      )
      .get(orgTenantId, vanId, today, actorId) as { id: string } | undefined
    if (already) throw new Error('You already checked this van today')
    const photos = this.decodePhotos(input.photos)
    const id = this.db.transaction(() => {
      const eventId = this.insertEvent(orgTenantId, actorId, {
        vanId,
        kind: 'daily_check',
        userId: actorId,
        eventDate: today,
        notes: clean(input.notes, 1000) || undefined,
        outcome: checklist.every((check) => check.ok) ? 'ok' : 'defect',
        checklist,
        mileage,
      })
      this.insertPhotos(orgTenantId, eventId, photos)
      return eventId
    })()
    return this.events(orgTenantId, { vanId }).find((item) => item.id === id)!
  }

  /** A driver reports an accident with the van, with photos. The office sees it in the van's file. */
  public reportAccident(
    orgTenantId: string,
    actorId: string,
    vanId: string,
    input: { eventDate?: string; notes?: string; photos?: VanPhotoInput[] },
  ): VanEvent {
    const van = this.getVan(orgTenantId, vanId)
    if (!van) throw new Error('Van not found')
    const notes = clean(input.notes, 1000)
    if (!notes) throw new Error('Say what happened')
    const eventDate = cleanDate(input.eventDate, 'Date') || new Date().toISOString().slice(0, 10)
    const photos = this.decodePhotos(input.photos)
    const id = this.db.transaction(() => {
      const eventId = this.insertEvent(orgTenantId, actorId, {
        vanId,
        kind: 'accident',
        userId: actorId,
        eventDate,
        notes,
      })
      this.insertPhotos(orgTenantId, eventId, photos)
      return eventId
    })()
    return this.events(orgTenantId, { vanId }).find((item) => item.id === id)!
  }

  public vanEventPhoto(orgTenantId: string, vanId: string, eventId: string, photoId: string) {
    return this.db
      .prepare(
        `SELECT p.filename, p.media_type AS mediaType, p.content
           FROM org_van_event_photos p JOIN org_van_events e ON e.id = p.event_id
          WHERE p.id = ? AND p.event_id = ? AND e.van_id = ? AND p.org_tenant_id = ?`,
      )
      .get(photoId, eventId, vanId, orgTenantId) as { filename: string; mediaType: string; content: Buffer } | undefined
  }

  private decodePhotos(photos: VanPhotoInput[] | undefined): Array<VanPhotoInput & { bytes: Buffer }> {
    const list = Array.isArray(photos) ? photos : []
    if (list.length > VAN_PHOTO_LIMIT) throw new Error(`Add at most ${VAN_PHOTO_LIMIT} photos`)
    return list.map((photo) => {
      const type = clean(photo?.mediaType, 40).toLowerCase()
      if (!VAN_PHOTO_TYPES.has(type)) throw new Error('Photos must be JPEG, PNG or WebP')
      const bytes = Buffer.from(String(photo.contentBase64 || ''), 'base64')
      if (!bytes.length || bytes.length > VAN_PHOTO_MAX_BYTES) throw new Error('Each photo must be smaller than 5 MB')
      const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8
      const png = bytes[0] === 0x89 && bytes[1] === 0x50
      const webp = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
      if (!(type === 'image/jpeg' ? jpeg : type === 'image/png' ? png : webp)) {
        throw new Error('A photo does not match its file type')
      }
      return { filename: clean(photo.filename, 200) || 'photo', mediaType: type, contentBase64: '', bytes }
    })
  }

  private insertPhotos(orgTenantId: string, eventId: string, photos: Array<VanPhotoInput & { bytes: Buffer }>): void {
    const insert = this.db.prepare(
      `INSERT INTO org_van_event_photos (id, org_tenant_id, event_id, filename, media_type, size_bytes, content)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const photo of photos) {
      insert.run(randomUUID(), orgTenantId, eventId, photo.filename, photo.mediaType, photo.bytes.length, photo.bytes)
    }
  }

  public vanFile(orgTenantId: string, vanId: string): VanFile | undefined {
    const van = this.getVan(orgTenantId, vanId)
    if (!van) return undefined
    const events = this.events(orgTenantId, { vanId })
    return {
      van,
      services: events.filter((event) => event.kind === 'service'),
      mots: events.filter((event) => event.kind === 'mot'),
      accidents: events.filter((event) => event.kind === 'accident'),
      drivers: events.filter((event) => event.kind === 'allocated'),
      dailyChecks: events.filter((event) => event.kind === 'daily_check'),
      jobs: this.listJobs(orgTenantId).filter((job) => job.vanId === vanId),
    }
  }

  /** Why a van should not go out on a date, in words for the dispatcher. */
  public vanWarning(van: VanRecord, date?: string): string | undefined {
    if (van.status === 'off_road') return `${van.registration} is off the road.`
    if (van.status === 'retired') return `${van.registration} is no longer in the fleet.`
    const warnings: string[] = []
    if (date && van.motDue && van.motDue < date) warnings.push(`${van.registration}'s MOT ran out on ${van.motDue}.`)
    if (date && van.serviceDay && DAY_NAMES[new Date(`${date}T12:00:00Z`).getUTCDay()] === van.serviceDay) {
      warnings.push(
        `${van.registration} goes in for its service on ${van.serviceDay.charAt(0).toUpperCase()}${van.serviceDay.slice(1)}s.`,
      )
    }
    return warnings.length ? warnings.join(' ') : undefined
  }

  // ─── Schedule check ────────────────────────────────────────────────────

  /**
   * What else is booked for this store, this worker and this van, so one job is not booked twice
   * and nobody is sent to two places with one van.
   */
  public scheduleCheck(
    orgTenantId: string,
    input: {
      storeNumber?: string
      date?: string
      assigneeId?: string
      vanId?: string
      excludeRunId?: string
      excludeIntakeId?: string
    },
  ): ScheduleCheck {
    const storeNumber = normalizeStoreNumber(input.storeNumber)
    const date = clean(input.date, 20)
    const jobs = this.listJobs(orgTenantId).filter(
      (job) => job.runId !== input.excludeRunId && OPEN_FIELD_JOB_CATEGORIES.has(job.category),
    )
    const sameDay = (job: JobSummary) => Boolean(date && job.scheduledDate === date)
    const van = input.vanId ? this.getVan(orgTenantId, input.vanId) : undefined
    const contact = storeNumber ? findContactByStoreNumber(orgTenantId, storeNumber) : undefined
    return {
      storeNumber: storeNumber || undefined,
      storeName: contact?.name,
      storeOpenJobs: storeNumber ? jobs.filter((job) => job.storeNumber === storeNumber) : [],
      storeWaiting: storeNumber
        ? this.pendingIntakes(orgTenantId)
            .filter((item) => item.storeNumber === storeNumber && item.id !== input.excludeIntakeId)
            .map(({ storeNumber: _store, ...item }) => item)
        : [],
      workerSameDay: input.assigneeId ? jobs.filter((job) => job.assigneeId === input.assigneeId && sameDay(job)) : [],
      vanSameDay: input.vanId ? jobs.filter((job) => job.vanId === input.vanId && sameDay(job)) : [],
      vanWarning: van ? this.vanWarning(van, date || undefined) : undefined,
    }
  }

  /** An existing booking for the same store and client reference, if there is one. */
  public findBookedRepeat(
    orgTenantId: string,
    storeNumber: string,
    poNumber: string,
    excludeIntakeId?: string,
  ): { kind: 'job' | 'intake'; id: string; reference: string } | undefined {
    const store = normalizeStoreNumber(storeNumber)
    const po = clean(poNumber, 120).toUpperCase()
    if (!store || !po) return undefined
    const job = this.listJobs(orgTenantId).find(
      (item) =>
        item.storeNumber === store && clean(item.poNumber).toUpperCase() === po && item.category !== 'cancelled',
    )
    if (job) return { kind: 'job', id: job.runId, reference: job.reference }
    const intake = this.db
      .prepare(
        `SELECT id, json_extract(payload_json, '$.reference') AS reference FROM job_intakes
          WHERE tenant_id = ? AND dedupe_key = ? AND id <> ? ORDER BY created_at LIMIT 1`,
      )
      .get(orgTenantId, intakeDedupeKey(store, po), excludeIntakeId || '') as
      | { id: string; reference?: string }
      | undefined
    return intake ? { kind: 'intake', id: intake.id, reference: intake.reference || intake.id } : undefined
  }
}

export function intakeDedupeKey(storeNumber: unknown, poNumber: unknown): string | undefined {
  const store = normalizeStoreNumber(storeNumber)
  const po = clean(poNumber, 120).toUpperCase()
  return store && po ? `${store}|${po}` : undefined
}

function storeFromContact(contact: OrgContact): StoreSummary {
  const address = /^Address:\s*(.+)$/im.exec(contact.notes || '')?.[1]?.trim()
  return {
    storeNumber: contact.storeNumber!,
    contactId: contact.id,
    name: contact.name,
    phone: contact.phone,
    email: contact.email,
    ...(address ? { address: address.slice(0, 400) } : {}),
    ...(contact.postcode ? { postcode: contact.postcode } : {}),
    openJobs: 0,
    totalJobs: 0,
  }
}

/** Where a job at this store happens: its address, with the postcode added when it is not already in it. */
export function storeSiteLocation(store: Pick<StoreSummary, 'address' | 'postcode'>): string | undefined {
  const address = String(store.address || '').trim()
  const postcode = String(store.postcode || '').trim()
  if (!address) return postcode || undefined
  if (!postcode || address.toUpperCase().replace(/\s/g, '').includes(postcode.toUpperCase().replace(/\s/g, ''))) {
    return address
  }
  return `${address}, ${postcode}`
}

function parse(value: unknown): any {
  if (!value) return undefined
  if (typeof value === 'object') return value
  try {
    return JSON.parse(String(value))
  } catch {
    return undefined
  }
}

export const operationsRegisterService = new OperationsRegisterService()
