/**
 * Stores and vans, plus the schedule check and incoming jobs, for both apps.
 * Mirrors `src/services/OperationsRegisterService.ts`; the words people read live here once.
 */

export type JobCategory = 'pending' | 'assigned' | 'active' | 'on_hold' | 'failed' | 'completed' | 'reconciled' | 'cancelled'

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
  source: 'manual' | 'email'
  duplicateOf?: string
  createdAt: string
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

export type VanStatus = 'active' | 'off_road' | 'retired'

export interface VanRecord {
  id: string
  registration: string
  description?: string
  serviceDay?: string
  motDue?: string
  driverUserId?: string
  driverName?: string
  status: VanStatus
}

export interface VanEvent {
  id: string
  vanId: string
  registration?: string
  kind: 'allocated' | 'service' | 'mot' | 'accident'
  userId?: string
  userName?: string
  eventDate: string
  notes?: string
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
    sourceType?: 'manual' | 'email'
    sourceSender?: string
    sourceSubject?: string
  }
  assignedTo?: string
  workflowRunId?: string
  duplicateOf?: string
  createdAt: string
  attachments: IntakeAttachment[]
}

export interface MailStatus {
  connected: boolean
  mailbox?: string
  lastReadAt?: string
  lastError?: string
  imported?: number
  repeats?: number
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
      headers: { Authorization: `Bearer ${token}`, ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new OperationsApiError(String(data?.message || data?.error || 'Something went wrong. Try again.'), response.status)
    }
    return data as T
  }
  const base = '/api/platform/operations'
  const query = (params: Record<string, string | undefined>) => {
    const search = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => value && search.set(key, value))
    const text = search.toString()
    return text ? `?${text}` : ''
  }
  return {
    stores: () => call<{ items: StoreSummary[] }>(`${base}/stores`).then((data) => data.items),
    storeFile: (storeNumber: string) => call<StoreFile>(`${base}/stores/${encodeURIComponent(storeNumber)}`),
    saveStore: (input: { contactId?: string; name: string; phone?: string; email?: string; storeNumber: string }) =>
      input.contactId
        ? call(`/api/contacts/${encodeURIComponent(input.contactId)}`, {
            method: 'PATCH',
            body: { name: input.name, phone: input.phone || undefined, email: input.email || undefined, storeNumber: input.storeNumber },
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
              driverUserId: input.driverUserId || undefined,
            },
          }),
    addVanEvent: (vanId: string, input: { kind: 'service' | 'mot' | 'accident'; eventDate?: string; userId?: string; notes?: string; nextDue?: string }) =>
      call<VanEvent>(`${base}/vans/${encodeURIComponent(vanId)}/events`, { method: 'POST', body: input }),
    scheduleCheck: (params: {
      storeNumber?: string
      date?: string
      assigneeId?: string
      vanId?: string
      excludeRunId?: string
      excludeIntakeId?: string
    }) => call<ScheduleCheck>(`${base}/schedule-check${query(params)}`),
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
    mailStatus: () => call<MailStatus>('/api/platform/job-intake/mail'),
    mailSync: () =>
      call<{ imported: number; repeats: number; alreadySaved: number; failed: number; error?: string }>(
        '/api/platform/job-intake/mail/sync',
        { method: 'POST' },
      ),
  }
}

export type OperationsApi = ReturnType<typeof operationsApi>

/** Job state, colour-coded the way the office asked: completed, arrived/in progress, failed, waiting. */
/** Job state, colour-coded as on the job board. */
export const JOB_CATEGORY_WORDS: Record<JobCategory, { label: string; color: string }> = {
  pending: { label: 'Unassigned', color: 'gray' },
  assigned: { label: 'Assigned', color: 'indigo' },
  active: { label: 'In progress', color: 'blue' },
  on_hold: { label: 'On hold', color: 'orange' },
  failed: { label: 'Needs attention', color: 'red' },
  completed: { label: 'Completed', color: 'teal' },
  reconciled: { label: 'Closed', color: 'green' },
  cancelled: { label: 'Cancelled', color: 'dark' },
}

export const SERVICE_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => ({
  value: day,
  label: day.charAt(0).toUpperCase() + day.slice(1),
}))

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
      text: `${check.storeWaiting.length} more job${check.storeWaiting.length === 1 ? '' : 's'} for ${store} ${check.storeWaiting.length === 1 ? 'is' : 'are'} waiting to be booked.`,
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
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : value
}
