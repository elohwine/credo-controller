/**
 * Stores and vans, plus the schedule check and incoming jobs, for both apps.
 * Mirrors `src/services/OperationsRegisterService.ts`; the words people read live here once.
 */

import {
  ONBOARDING_PATH,
  sendCardsPath,
  staffCardChangeRule,
  type MemberCardKind,
  type MemberOnboarding,
  type StaffCardChangeRule,
} from '../orgOnboarding'
import { SETUP_PROFILE_PATH } from '../orgProfile'
import type { FailedVisit } from '../../../src/config/failedVisit'
import type {
  FieldImportKind,
  FieldImportOptions,
  FieldImportPreview,
  FieldImportResult,
  ImportedJobDetails,
} from '../../../src/config/fieldDataImport'
import type { ListPage } from '../../../src/config/listPage'

export type JobCategory =
  | 'pending'
  | 'assigned'
  | 'active'
  | 'arrived'
  | 'on_hold'
  | 'failed'
  | 'completed'
  | 'reconciled'
  | 'cancelled'

export interface JobSummary {
  runId: string
  reference: string
  storeNumber?: string
  poNumber?: string
  description: string
  location?: string
  scheduledDate?: string
  category: JobCategory
  callOut: boolean
  assigneeId?: string
  vanId?: string
  vehicle?: string
  createdAt: string
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
}

export interface PendingIntakeSummary {
  id: string
  reference: string
  description: string
  scheduledDate?: string
  source: 'manual' | 'email' | 'import'
  duplicateOf?: string
  createdAt: string
}

export interface StoreSummary {
  storeNumber: string
  contactId?: string
  name: string
  phone?: string
  email?: string
  address?: string
  postcode?: string
  /** The branch that usually covers this store. */
  branch?: string
  openJobs: number
  totalJobs: number
}

/** Branches and problem types already in use, most used first. */
export interface JobChoices {
  branches: string[]
  problemTypes: string[]
}

/** The store, branch, van and site a job is linked to. An empty value clears the link. */
export interface JobLinksInput {
  storeNumber?: string | null
  branch?: string | null
  vanId?: string | null
  location?: string | null
}

/** One line for a store's site: address and postcode. */
export function storeSite(store?: Pick<StoreSummary, 'address' | 'postcode'> | null): string {
  if (!store) return ''
  const address = store.address?.trim() || ''
  const postcode = store.postcode?.trim() || ''
  if (address && postcode && address.toUpperCase().includes(postcode.toUpperCase())) return address
  return [address, postcode].filter(Boolean).join(', ')
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

export type JobSource = 'email' | 'office' | 'booking' | 'import'
export type JobRegisterCategory = JobCategory | 'not_booked'

export interface JobRegisterRow {
  /** `history` is a finished job brought in from a file: shown and counted, never opened or billed. */
  kind: 'job' | 'intake' | 'history'
  id: string
  reference: string
  source: JobSource
  category: JobRegisterCategory
  storeNumber?: string
  poNumber?: string
  clientName?: string
  description: string
  location?: string
  problemType?: string
  scheduledDate?: string
  branch?: string
  priority?: 'urgent' | 'out_of_hours' | 'normal'
  assigneeId?: string
  vehicle?: string
  callOut: boolean
  amount?: number
  currency?: string
  createdAt: string
  completedAt?: string
  possibleRepeat?: boolean
  /** Who did the job, as the old system named them (imported jobs only). */
  workerName?: string
  /** What the old system said about an imported job: status, branch, times, notes and checks. */
  details?: ImportedJobDetails
}

export interface JobReport {
  from?: string
  to?: string
  total: number
  counts: Record<JobRegisterCategory, number>
  bySource: Array<{ source: JobSource; label: string; count: number }>
  /** Busiest stores first: most open jobs, then most jobs overall. */
  byStore: Array<{ storeNumber: string; name?: string; open: number; completed: number; total: number }>
  /** Team members, and the people the old system had on imported jobs (`userId` empty, `oldSystem` set). */
  byWorker: Array<{
    userId: string
    name: string
    open: number
    completed: number
    failed: number
    oldSystem?: boolean
    /** Open imported jobs naming this old-system worker but not yet assigned in LDK. */
    toAssign?: number
  }>
  /** Stage figures are missing from older APIs. */
  byBranch?: Array<{
    branch: string
    open: number
    completed: number
    total: number
    unassigned?: number
    assigned?: number
    inProgress?: number
    onHold?: number
    failed?: number
    urgent?: number
  }>
  byProblemType?: Array<{ problemType: string; open: number; total: number }>
  averageDaysToComplete?: number
  /** Jobs done on the first visit, out of every job that is done or had to be visited again. */
  firstTimeFix?: { fixed: number; returnVisits: number; percent?: number }
  /** Where the work stands today, whatever the date filter (missing from servers older than this screen). */
  today?: {
    date: string
    scheduled: number
    overdue: number
    unassigned: number
    urgent: number
    outOfHours?: number
    receivedLast7Days: number
    completedLast7Days: number
    completedLast30Days: number
    oldestOpenDays?: number
  }
  /** The last eight weeks, oldest first (Monday start). */
  weekly?: Array<{ weekStart: string; received: number; completed: number }>
}

/** "2035 · Brierley Hill", without repeating a number the saved store name already starts with. */
export function storeLabel(storeNumber: string, name?: string): string {
  if (!name) return `Store ${storeNumber}`
  const number = storeNumber.replace(/^0+/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const rest = name.replace(new RegExp(`^0*${number}(?!\\d)\\s*[-–:]?\\s*`, 'i'), '').trim()
  return `${storeNumber} · ${rest || name}`
}

export interface MailMessage {
  id: string
  direction: 'in' | 'out'
  sender?: string
  subject?: string
  bodyText?: string
  receivedAt: string
  webLink?: string
}

export interface RateCard {
  id: string
  name: string
  unit: string
  unitPrice: number
  currency: string
  problemType?: string
  active: boolean
}

export interface JobSheetItem {
  id: string
  label: string
  kind: 'check' | 'measure' | 'text'
  unit?: string
  required?: boolean
}

export type VanStatus = 'active' | 'off_road' | 'retired'

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
}

export interface EquipmentItem {
  id: string
  name: string
  category?: string
  productCode?: string
  serialNumber?: string
  value?: number
  currency?: string
  holderName?: string
  notes?: string
  createdAt: string
}

export interface VanEvent {
  id: string
  vanId: string
  registration?: string
  kind: 'allocated' | 'service' | 'mot' | 'accident' | 'daily_check'
  userId?: string
  userName?: string
  eventDate: string
  notes?: string
  outcome?: 'ok' | 'defect'
  checklist?: Array<{ item: string; ok: boolean; note?: string }>
  mileage?: number
  photos?: Array<{ id: string; filename: string; mediaType: string; sizeBytes: number }>
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
  storeOpenJobs: JobSummary[]
  storeWaiting: PendingIntakeSummary[]
  workerSameDay: JobSummary[]
  vanSameDay: JobSummary[]
  vanWarning?: string
}

export interface IntakeAttachment {
  id: string
  filename: string
  mediaType: string
  sizeBytes: number
}

export interface IntakeItem {
  id: string
  status: 'pending' | 'assigning' | 'assigned'
  payload: {
    reference: string
    storeNumber?: string
    poNumber?: string
    problemType?: string
    description: string
    clientName?: string
    clientPhone?: string
    location?: string
    scheduledDate?: string
    amount: number
    currency: string
    vanId?: string
    vehicleReference?: string
    callOut?: boolean
    sourceType?: 'manual' | 'email' | 'import'
    sourceSender?: string
    sourceSubject?: string
    importedWorkerName?: string
    importedDetails?: { oldStatus?: string; priority?: string }
  }
  assignedTo?: string
  workflowRunId?: string
  duplicateOf?: string
  createdAt: string
  attachments: IntakeAttachment[]
}

export interface MailStatus {
  connected: boolean
  /** Settings still to be filled in on the server, by name. */
  missing?: string[]
  mailbox?: string
  lastReadAt?: string
  lastError?: string
  imported?: number
  repeats?: number
}

export type AttentionKind =
  | 'failed'
  | 'overdue'
  | 'unassigned'
  | 'stalled'
  | 'waiting'
  | 'response_at_risk'
  | 'response_breached'

/** A job that is stopped, late, has nobody on it, is not moving, or was never booked. Mirrors `JobAttentionService`. */
export interface AttentionItem {
  kind: AttentionKind
  runId?: string
  intakeId?: string
  reference: string
  label: string
  storeNumber?: string
  assigneeId?: string
  since: string
  days: number
  headline: string
  detail: string
  elapsedMinutes?: number
  targetMinutes?: number
}

export const ATTENTION_WORDS: Record<AttentionKind, { label: string; color: string }> = {
  failed: { label: 'Stopped', color: 'red' },
  overdue: { label: 'Late', color: 'orange' },
  unassigned: { label: 'Nobody on it', color: 'yellow' },
  stalled: { label: 'Not moving', color: 'orange' },
  waiting: { label: 'Not booked', color: 'blue' },
  response_at_risk: { label: 'Response at risk', color: 'orange' },
  response_breached: { label: 'Response late', color: 'red' },
}

export type ResponsePriority = 'urgent' | 'out_of_hours' | 'normal'
export type JobResponseTargets = Record<ResponsePriority, number | null>

export interface TodayMapJob {
  runId: string
  reference: string
  description: string
  storeNumber?: string
  location: string
  priority?: ResponsePriority
  latitude?: number
  longitude?: number
}

export interface TodayJobsMap {
  date: string
  jobs: TodayMapJob[]
  pendingLocations: number
  notFoundLocations: number
}

/** One person on the team, as `GET /api/organizations/{org}/members` returns them. */
export interface TeamMember {
  userId: string
  role: string
  status: string
  createdAt?: string
  displayName?: string
  phone?: string
  invitePending?: boolean
}

export interface EmployeeQualification {
  name: string
  expiresAt?: string
  issuer?: string
}

/** A payroll employee. Everyone on the team has one; this is the single record for a person. */
export interface EmployeeRecord {
  id: string
  firstName: string
  lastName: string
  email?: string | null
  phone?: string | null
  did?: string | null
  baseSalary: number
  currency: string
  nssaNumber?: string | null
  tin?: string | null
  staffNumber?: string
  skills?: string[]
  qualifications?: EmployeeQualification[]
  userId?: string
  status: string
}

export class OperationsApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
  }
}

export function operationsApi(backend: string, token: string | null | undefined) {
  const call = async <T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> => {
    if (!token) throw new OperationsApiError('Sign in to the organisation first.', 401)
    const response = await fetch(`${backend.replace(/\/$/, '')}${path}`, {
      method: init?.method || 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new OperationsApiError(
        String(data?.message || data?.error || 'Something went wrong. Try again.'),
        response.status,
      )
    }
    return data as T
  }
  const base = '/api/platform/operations'
  const orgBase = (org: string) => `/api/organizations/${encodeURIComponent(org)}`
  const query = (params: Record<string, string | undefined>) => {
    const search = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => value && search.set(key, value))
    const text = search.toString()
    return text ? `?${text}` : ''
  }
  return {
    stores: () => call<{ items: StoreSummary[] }>(`${base}/stores`).then((data) => data.items),
    jobChoices: () => call<JobChoices>(`${base}/job-choices`),
    linkJob: (jobId: string, links: JobLinksInput) =>
      call<JobSummary | PendingIntakeSummary>(`${base}/jobs/${encodeURIComponent(jobId)}/links`, {
        method: 'PUT',
        body: links,
      }),
    storeFile: (storeNumber: string) => call<StoreFile>(`${base}/stores/${encodeURIComponent(storeNumber)}`),
    saveStore: (input: { contactId?: string; name: string; phone?: string; email?: string; storeNumber: string }) =>
      input.contactId
        ? call(`/api/contacts/${encodeURIComponent(input.contactId)}`, {
            method: 'PATCH',
            body: {
              name: input.name,
              phone: input.phone || undefined,
              email: input.email || undefined,
              storeNumber: input.storeNumber,
            },
          })
        : call('/api/contacts', {
            method: 'POST',
            body: {
              name: input.name,
              phone: input.phone || undefined,
              email: input.email || undefined,
              storeNumber: input.storeNumber,
              contactScope: 'external',
            },
          }),
    attendants: () => call<{ items: AttendantSummary[] }>(`${base}/attendants`).then((data) => data.items),
    attendantFile: (userId: string) => call<AttendantFile>(`${base}/attendants/${encodeURIComponent(userId)}`),
    saveAttendant: (userId: string, input: { staffNumber: string; skills: string[] }) =>
      call<AttendantSummary>(`${base}/attendants/${encodeURIComponent(userId)}`, { method: 'PUT', body: input }),
    vans: () => call<{ items: VanRecord[] }>(`${base}/vans`).then((data) => data.items),
    vanFile: (vanId: string) => call<VanFile>(`${base}/vans/${encodeURIComponent(vanId)}`),
    saveVan: (input: Partial<VanRecord> & { registration?: string }) =>
      input.id
        ? call<VanRecord>(`${base}/vans/${encodeURIComponent(input.id)}`, {
            method: 'PUT',
            body: {
              registration: input.registration,
              description: input.description ?? '',
              serviceDay: input.serviceDay ?? '',
              motDue: input.motDue ?? '',
              taxDue: input.taxDue ?? '',
              branch: input.branch ?? '',
              mileage: input.mileage ?? null,
              driverUserId: input.driverUserId ?? null,
              status: input.status,
            },
          })
        : call<VanRecord>(`${base}/vans`, {
            method: 'POST',
            body: {
              registration: input.registration,
              description: input.description || undefined,
              serviceDay: input.serviceDay || undefined,
              motDue: input.motDue || undefined,
              taxDue: input.taxDue || undefined,
              branch: input.branch || undefined,
              mileage: input.mileage ?? undefined,
              driverUserId: input.driverUserId || undefined,
            },
          }),
    addVanEvent: (
      vanId: string,
      input: {
        kind: 'service' | 'mot' | 'accident'
        eventDate?: string
        userId?: string
        notes?: string
        nextDue?: string
      },
    ) => call<VanEvent>(`${base}/vans/${encodeURIComponent(vanId)}/events`, { method: 'POST', body: input }),
    scheduleCheck: (params: {
      storeNumber?: string
      date?: string
      assigneeId?: string
      vanId?: string
      excludeRunId?: string
      excludeIntakeId?: string
    }) => call<ScheduleCheck>(`${base}/schedule-check${query(params)}`),
    attention: () => call<{ items: AttentionItem[] }>(`${base}/attention`).then((data) => data.items),
    responseTargets: () =>
      call<{ targets: JobResponseTargets }>(`${base}/response-targets`).then((data) => data.targets),
    saveResponseTargets: (targets: JobResponseTargets) =>
      call<{ targets: JobResponseTargets }>(`${base}/response-targets`, { method: 'PUT', body: { targets } }).then(
        (data) => data.targets,
      ),
    todayJobsMap: () => call<TodayJobsMap>(`${base}/map/today`),
    geocodeTodayJobs: (limit = 10) =>
      call<TodayJobsMap>(`${base}/map/today/geocode`, { method: 'POST', body: { confirmed: true, limit } }),
    intakes: () => call<{ items: IntakeItem[] }>('/api/platform/job-intake').then((data) => data.items),
    assignIntake: (
      intakeId: string,
      input: { assigneeId: string; receiverId?: string; vanId?: string; amount?: number; confirmRepeat?: boolean },
    ) =>
      call<{ runId?: string; status: string }>(`/api/platform/job-intake/${encodeURIComponent(intakeId)}/assign`, {
        method: 'POST',
        body: input,
      }),
    intakeAttachment: (intakeId: string, attachmentId: string) =>
      call<{ filename: string; mediaType: string; dataBase64: string }>(
        `/api/platform/job-intake/${encodeURIComponent(intakeId)}/attachments/${encodeURIComponent(attachmentId)}`,
      ),
    // ── People: the payroll employee is the one record; app access hangs off it ──
    employees: () => call<EmployeeRecord[]>('/api/payroll/employees'),
    saveEmployee: (input: Partial<EmployeeRecord> & { firstName: string; lastName: string; baseSalary: number }) =>
      // Only the fields the API takes, and no empty ones: a null is not a valid text.
      call<EmployeeRecord>('/api/payroll/employees', {
        method: 'POST',
        body: Object.fromEntries(
          (
            [
              'id',
              'status',
              'firstName',
              'lastName',
              'email',
              'phone',
              'baseSalary',
              'currency',
              'nssaNumber',
              'tin',
              'did',
              'staffNumber',
              'skills',
              'qualifications',
              'userId',
            ] as const
          )
            .map((key) => [key, input[key]])
            .filter(([, value]) => value !== null && value !== undefined),
        ),
      }),
    members: (org: string) => call<TeamMember[]>(`${orgBase(org)}/members`),
    memberOnboarding: (org: string) => call<MemberOnboarding[]>(`${orgBase(org)}${ONBOARDING_PATH}`),
    teamRoles: (org: string) => call<Array<{ name?: string; membershipRole?: string }>>(`${orgBase(org)}/roles`),
    inviteMember: (
      org: string,
      input: { phone: string; name: string; role: string; email?: string; whatsappConsent: boolean },
    ) =>
      call<{ targetUserId: string; message?: string; invite?: { channel?: string; link?: string } }>(
        `${orgBase(org)}/members/invite`,
        { method: 'POST', body: input },
      ),
    resendInvite: (org: string, userId: string) =>
      call<{ message?: string; invite?: { channel?: string; link?: string } }>(
        `${orgBase(org)}/members/${encodeURIComponent(userId)}/resend-invite`,
        { method: 'POST', body: {} },
      ),
    changeRole: (org: string, userId: string, role: string) =>
      call(`${orgBase(org)}/members/${encodeURIComponent(userId)}`, { method: 'PATCH', body: { role } }),
    removeMember: (org: string, userId: string) =>
      call(`${orgBase(org)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
    sendCards: (org: string, userId: string, kind: MemberCardKind | 'all') =>
      call<{ sent?: string[]; skipped?: Array<{ reason: string }>; member?: MemberOnboarding }>(
        `${orgBase(org)}${sendCardsPath(userId)}`,
        { method: 'POST', body: { kind } },
      ),
    staffCardChange: (org: string) =>
      call<{ staffCardChange?: string }>(`${orgBase(org)}${SETUP_PROFILE_PATH}`).then((data) =>
        staffCardChangeRule(data?.staffCardChange),
      ),
    saveStaffCardChange: (org: string, rule: StaffCardChangeRule) =>
      call(`${orgBase(org)}${SETUP_PROFILE_PATH}`, { method: 'PUT', body: { staffCardChange: rule } }),
    reportFailedVisit: (runId: string, input: { reason: string; note?: string }) =>
      call<{ visit: FailedVisit; created: boolean }>(`/workflows/runs/${encodeURIComponent(runId)}/failed-visit`, {
        method: 'POST',
        body: { reason: input.reason, ...(input.note ? { note: input.note } : {}) },
      }),
    rebookFailedVisit: (
      runId: string,
      visitId: string,
      input: { scheduledDate: string; assigneeUserId?: string; vanId?: string; note?: string },
    ) =>
      call<{ visit: FailedVisit; scheduledDate: string }>(
        `/workflows/runs/${encodeURIComponent(runId)}/failed-visits/${encodeURIComponent(visitId)}/rebook`,
        {
          method: 'POST',
          body: Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== '')),
        },
      ),
    /** One page of the Jobs list and how many matched; without `limit`, every match. */
    jobs: (filter: Record<string, string | undefined> = {}) =>
      call<ListPage<JobRegisterRow>>(`${base}/jobs${query(filter)}`),
    jobReport: (filter: Record<string, string | undefined> = {}) => call<JobReport>(`${base}/reports${query(filter)}`),
    exportJobs: async (filter: Record<string, string | undefined> = {}) => {
      if (!token) throw new OperationsApiError('Sign in to the organisation first.', 401)
      const response = await fetch(`${backend.replace(/\/$/, '')}${base}/jobs/export${query(filter)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const raw = await response.text()
      const text = raw.trim().startsWith('"') ? String(JSON.parse(raw)) : raw
      if (!response.ok) {
        let message = 'The job list could not be exported.'
        try {
          message = String(JSON.parse(text)?.message || JSON.parse(text)?.error || message)
        } catch {
          /* the body is not JSON */
        }
        throw new OperationsApiError(message, response.status)
      }
      return text.charCodeAt(0) === 0xfeff || text.startsWith('Job,') ? text : text
    },
    intakeThread: (intakeId: string) =>
      call<{ messages: MailMessage[] }>(`/api/platform/job-intake/${encodeURIComponent(intakeId)}/thread`).then(
        (data) => data.messages,
      ),
    jobSheet: (runId: string) =>
      call<{
        sheet: { problemType?: string; items: JobSheetItem[]; general: boolean }
        saved: {
          answers: Record<string, { ok?: boolean; value?: string }>
          materials: Array<{ name: string; quantity: number; unit?: string }>
        } | null
      }>(`/workflows/runs/${encodeURIComponent(runId)}/job-sheet`),
    saveJobSheet: (
      runId: string,
      body: {
        answers: Record<string, { ok?: boolean; value?: string }>
        materials: Array<{ name: string; quantity: number; unit?: string }>
      },
    ) => call(`/workflows/runs/${encodeURIComponent(runId)}/job-sheet`, { method: 'POST', body }),
    saveStoreSignature: (runId: string, body: { signerName: string; signerRole?: string; imageDataUrl: string }) =>
      call(`/workflows/runs/${encodeURIComponent(runId)}/store-signature`, { method: 'POST', body }),
    createStatusLink: (runId: string) =>
      call<{ url: string; code: string }>(`/workflows/runs/${encodeURIComponent(runId)}/status-link`, {
        method: 'POST',
      }),
    revokeStatusLink: (runId: string) =>
      call<{ revoked: number }>(`/workflows/runs/${encodeURIComponent(runId)}/status-link`, { method: 'DELETE' }),
    rateCards: () => call<{ items: RateCard[] }>(`${base}/rate-cards`).then((data) => data.items),
    saveJobSheetTemplate: (problemType: string, items: JobSheetItem[]) =>
      call(`${base}/job-sheets`, { method: 'PUT', body: { problemType, items } }),
    saveRateCard: (input: {
      id?: string
      name: string
      unit?: string
      unitPrice: number
      currency?: string
      problemType?: string
      active?: boolean
    }) =>
      input.id
        ? call<RateCard>(`${base}/rate-cards/${encodeURIComponent(input.id)}`, { method: 'PUT', body: input })
        : call<RateCard>(`${base}/rate-cards`, { method: 'POST', body: input }),
    previewImport: (kind: FieldImportKind, content: string, options: FieldImportOptions = {}) =>
      call<FieldImportPreview>(`${base}/import/preview`, { method: 'POST', body: { kind, content, ...options } }),
    runImport: (kind: FieldImportKind, content: string, options: FieldImportOptions = {}) =>
      call<FieldImportResult>(`${base}/import`, { method: 'POST', body: { kind, content, ...options } }),
    equipment: () => call<{ items: EquipmentItem[] }>(`${base}/equipment`).then((data) => data.items),
    vanCheckItems: () => call<{ items: string[] }>(`${base}/van-checks`).then((data) => data.items),
    dailyCheck: (
      vanId: string,
      body: {
        checks: Array<{ item: string; ok: boolean; note?: string }>
        mileage?: number
        notes?: string
        photos?: Array<{ filename: string; mediaType: string; contentBase64: string }>
      },
    ) => call<VanEvent>(`${base}/vans/${encodeURIComponent(vanId)}/checks`, { method: 'POST', body }),
    reportVanAccident: (
      vanId: string,
      body: {
        eventDate?: string
        notes: string
        photos?: Array<{ filename: string; mediaType: string; contentBase64: string }>
      },
    ) => call<VanEvent>(`${base}/vans/${encodeURIComponent(vanId)}/accidents`, { method: 'POST', body }),
    mailStatus: () => call<MailStatus>('/api/platform/job-intake/mail'),
    mailSync: () =>
      call<{
        imported: number
        repeats: number
        alreadySaved: number
        skipped: number
        failed: number
        error?: string
      }>('/api/platform/job-intake/mail/sync', { method: 'POST' }),
  }
}

export type OperationsApi = ReturnType<typeof operationsApi>

/**
 * Job state, colour-coded the way the office asked (SGK meeting): completed, arrived and failed
 * stand out, and no two states share a colour. Used by the job board, the registers and the reports.
 */
export const JOB_CATEGORY_WORDS: Record<JobRegisterCategory, { label: string; color: string }> = {
  not_booked: { label: 'Not booked yet', color: 'grape' },
  pending: { label: 'Unassigned', color: 'yellow' },
  assigned: { label: 'Assigned', color: 'indigo' },
  active: { label: 'In progress', color: 'blue' },
  arrived: { label: 'Arrived', color: 'cyan' },
  on_hold: { label: 'On hold', color: 'orange' },
  failed: { label: 'Needs attention', color: 'red' },
  completed: { label: 'Completed', color: 'green' },
  reconciled: { label: 'Closed', color: 'teal' },
  cancelled: { label: 'Cancelled', color: 'gray' },
}

/** An unassigned or unbooked job older than this is flagged on the list (gap map: "waiting over a week"). */
export const JOB_WAITING_FLAG_DAYS = 7

/** Whole days a job has waited for a worker, or 0 when it is not waiting. */
export function jobWaitingDays(row: Pick<JobRegisterRow, 'category' | 'createdAt'>, now = Date.now()): number {
  if (row.category !== 'pending' && row.category !== 'not_booked') return 0
  const value = String(row.createdAt || '').trim()
  if (!value) return 0
  const timestamp = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value)
    ? value
    : `${value.replace(' ', 'T')}${value.length === 10 ? 'T00:00:00' : ''}Z`
  const created = Date.parse(timestamp)
  return Number.isFinite(created) ? Math.max(0, Math.floor((now - created) / 86_400_000)) : 0
}

export const SERVICE_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(
  (day) => ({
  value: day,
  label: day.charAt(0).toUpperCase() + day.slice(1),
  }),
)

export const LEAVE_WORDS: Record<string, string> = {
  annual: 'Holiday',
  sick: 'Off sick',
  maternity: 'Maternity leave',
  paternity: 'Paternity leave',
  unpaid: 'Unpaid leave',
  other: 'Leave',
}

export function jobLine(job: JobSummary, names: Record<string, string> = {}): string {
  return [
    job.scheduledDate || 'No date',
    job.assigneeId ? names[job.assigneeId] || 'Assigned' : 'Not assigned',
    job.vehicle,
  ]
    .filter(Boolean)
    .join(' · ')
}

export interface ScheduleWarning {
  tone: 'warning' | 'danger'
  title: string
  text: string
}

/** The schedule check in plain sentences, most serious first. */
export function scheduleWarnings(check: ScheduleCheck | null, names: Record<string, string> = {}): ScheduleWarning[] {
  if (!check) return []
  const warnings: ScheduleWarning[] = []
  const store = check.storeName ? `${check.storeName} (store ${check.storeNumber})` : `Store ${check.storeNumber}`
  if (check.storeOpenJobs.length) {
    const list = check.storeOpenJobs
      .slice(0, 3)
      .map((job) => `${job.reference} (${job.scheduledDate || 'no date'})`)
      .join(', ')
    warnings.push({
      tone: 'warning',
      title: 'Already booked for this store',
      text: `${store} already has ${check.storeOpenJobs.length} open job${check.storeOpenJobs.length === 1 ? '' : 's'}: ${list}. Check this is not the same job, or send one person for both.`,
    })
  }
  if (check.storeWaiting.length) {
    warnings.push({
      tone: 'warning',
      title: 'Waiting for this store',
      text: `${check.storeWaiting.length} more job${check.storeWaiting.length === 1 ? '' : 's'} for ${store} ${check.storeWaiting.length === 1 ? 'is' : 'are'} still to check.`,
    })
  }
  if (check.workerSameDay.length) {
    const person = names[check.workerSameDay[0].assigneeId || ''] || 'This person'
    warnings.push({
      tone: 'danger',
      title: 'Double booking',
      text: `${person} already has ${check.workerSameDay.length} job${check.workerSameDay.length === 1 ? '' : 's'} that day: ${check.workerSameDay
        .slice(0, 3)
        .map((job) => job.reference)
        .join(', ')}.`,
    })
  }
  if (check.vanSameDay.length) {
    warnings.push({
      tone: 'danger',
      title: 'Double booking',
      text: `This van is already out that day on ${check.vanSameDay
        .slice(0, 3)
        .map((job) => job.reference)
        .join(', ')}.`,
    })
  }
  if (check.vanWarning) warnings.push({ tone: 'danger', title: 'Check the van', text: check.vanWarning })
  return warnings.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'danger' ? -1 : 1))
}

export function readableDate(value?: string): string {
  if (!value) return '—'
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value)
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : value
}
