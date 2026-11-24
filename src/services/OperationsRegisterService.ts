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
import { payrollService } from './PayrollService'

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
  openJobs: number
  totalJobs: number
}

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
    return [...stores.values()].sort((a, b) => a.storeNumber.localeCompare(b.storeNumber, undefined, { numeric: true }))
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
    const staffNumber = clean(input.staffNumber, 40).toUpperCase()
    if (!staffNumber) throw new Error('Add a staff number')
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
  return {
    storeNumber: contact.storeNumber!,
    contactId: contact.id,
    name: contact.name,
    phone: contact.phone,
    email: contact.email,
    openJobs: 0,
    totalJobs: 0,
  }
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
