/**
 * Full history of a field job, built from the run state the engine keeps
 * (`workflow_runs.output`). Pure: no fetching, no React. The portal job drawer
 * ("History" tab) and the app job sheet ("See the full history") render the same
 * shape so both sides read identically.
 *
 * Kept in step with `credo-ui/mobile/lib/jobAuditTrail.ts`.
 */

import { plainStepName } from './financeStages'
import { fieldStageOutcome, isOrganisationJobRecord } from '../../../shared/fieldJobOutcomes'
import { requestEventLinks, handoffLinksForStep, type RelatedWorkLink } from '../../../shared/relatedWork'

export type AuditPerson = { userId: string; role?: string; displayName?: string; phone?: string }

export type AuditStepStatus = 'done' | 'active' | 'pending' | 'held' | 'skipped'

export interface AuditStep {
  id: string
  title: string
  status: AuditStepStatus
  /** Who did it (resolved to a name, never a raw id). */
  by?: string
  byUserId?: string
  /** Server time the step was recorded. */
  at?: string
  /** Time on the phone when the photo was taken (shown next to the recorded time). */
  deviceAt?: string
  /** Plain-language facts about the step. */
  details: string[]
  /** How the step was confirmed. */
  proof?: string
  /** Short record reference (first characters of the sealed hash). */
  ref?: string
  /** Photo URIs for a quick preview (primary first). */
  photos: string[]
  /** Wallet records attached at this step (for example a supplier receipt), by label. */
  documents?: string[]
  related?: RelatedWorkLink[]
}

export interface AuditPersonRow {
  userId?: string
  name: string
  role?: string
  /** Steps this person did, in order. */
  did: string[]
  firstAt?: string
  lastAt?: string
}

export interface AuditRecord {
  type: string
  label: string
  issuedAt?: string
  to?: string
  stage?: string
}

/** One familiar Web2-style row for the same steps shown by the tick timeline. */
export interface AuditTableRow {
  details: string[]
  id: string
  at?: string
  event: string
  status: AuditStepStatus
  person?: string
  evidence: StageMediaItem[]
  confirmation?: string
}

export function auditTableRows(trail: JobAuditTrail): AuditTableRow[] {
  return trail.steps.map((step) => ({
    id: step.id,
    at: step.at,
    event: step.title,
    details: step.details,
    status: step.status,
    person: step.by,
    evidence: [
      ...step.photos.map((src, index) => ({
        src,
        label: `${step.title} ${index + 1}`,
        lines: mediaLines(step),
      })),
      ...(step.documents || []).map((label) => ({
        label,
        record: true,
        src: step.photos[0],
        lines: mediaLines(step),
      })),
    ],
    confirmation: step.proof
      ? `${step.proof}${step.ref ? ` · ref ${step.ref}` : ''}`
      : step.ref
        ? `Ref ${step.ref}`
        : undefined,
  }))
}

/**
 * open: the worker said stop and nobody has acted yet.
 * resolved: the organisation sorted the issue out; the worker still has to redo the check.
 * cleared: a later passing check closed it.
 * reassigned: the job moved to another worker while it was open.
 */
export type AuditHoldStatus = 'open' | 'resolved' | 'cleared' | 'reassigned'

export interface AuditHold {
  id?: string
  checkpoint: string
  label: string
  status: AuditHoldStatus
  at?: string
  by?: string
  byUserId?: string
  reason: string
  /** Photo of what made the job unsafe, when one was taken. */
  photo?: string
  hazards?: string[]
  resolvedAt?: string
  resolvedBy?: string
  resolutionNote?: string
  clearedAt?: string
  clearedBy?: string
  /** What the worker said had changed when they passed the check after a hold. */
  whatChanged?: string
  /** Who the worker said must fix the problem. Older holds default to the organisation. */
  fixBy: 'organisation' | 'worker'
  /** Kept for older callers: true once the hold no longer gates the step. */
  cleared: boolean
}

/**
 * Status of one raw hold from run output. Older holds carry no status, so the checkpoint
 * they belong to decides: a completed or waived checkpoint means the hold is cleared.
 */
export function holdStatusOf(block: any, checkpoints: Record<string, any> | undefined): AuditHoldStatus {
  const explicit = String(block?.status || '').toLowerCase()
  if (explicit === 'open' || explicit === 'resolved' || explicit === 'cleared' || explicit === 'reassigned')
    return explicit
  const cpStatus = String(checkpoints?.[String(block?.checkpoint || '')]?.status || '')
  return ['completed', 'waived'].includes(cpStatus) ? 'cleared' : 'open'
}

/** A hold still gates its step while it is open or resolved-but-not-rechecked. */
export function holdIsLive(status: AuditHoldStatus | undefined): boolean {
  return status === 'open' || status === 'resolved'
}

/** Who must fix a hold, from the raw block. Anything but an on-site choice means the organisation. */
export function holdFixByOf(block: any): 'organisation' | 'worker' {
  const raw = String(block?.fixBy || block?.attempt?.fixBy || '')
    .trim()
    .toLowerCase()
  return ['worker', 'self', 'on_site', 'me'].includes(raw) ? 'worker' : 'organisation'
}

/** The worker cannot redo the safety check yet: the organisation still has to fix the problem. */
export function holdWaitsForOrganisation(hold: Pick<AuditHold, 'status' | 'fixBy'> | null | undefined): boolean {
  return !!hold && hold.status === 'open' && hold.fixBy !== 'worker'
}

/** The newest hold on a checkpoint that still gates it, read straight from run output. */
export function liveHoldOf(
  run: any,
  checkpoint = 'risk_assessment',
  people: AuditPerson[] = [],
): AuditHold | undefined {
  const trail = buildJobAuditTrail(run, people)
  return [...trail.holds].reverse().find((hold) => hold.checkpoint === checkpoint && holdIsLive(hold.status))
}

export interface AuditStageChange {
  stage: string
  label: string
  at: string
  by?: string
}

/** What a history is about. The panel picks its words from this ("Supplier bill …", "People on this school fee"). */
export type AuditSubject = 'job' | 'request' | 'bill' | 'payment' | 'fee'

export const AUDIT_SUBJECT_WORDS: Record<AuditSubject, { noun: string; title: string }> = {
  job: { noun: 'job', title: 'Job' },
  request: { noun: 'request', title: 'Request' },
  bill: { noun: 'supplier bill', title: 'Supplier bill' },
  payment: { noun: 'payment', title: 'Payment' },
  fee: { noun: 'school fee', title: 'School fee' },
}

export interface JobAuditTrail {
  reference: string
  title: string
  status: string
  /** Left out for a field job. */
  subject?: AuditSubject
  people: AuditPersonRow[]
  steps: AuditStep[]
  records: AuditRecord[]
  holds: AuditHold[]
  stageChanges: AuditStageChange[]
}

/** Office closeout at a glance: steps finished (or not needed) and the ones still to do, in order. */
export function closeoutSummary(trail: JobAuditTrail): { settled: number; total: number; stillOpen: string[] } {
  const settled = trail.steps.filter((step) => step.status === 'done' || step.status === 'skipped').length
  const stillOpen = trail.steps
    .filter((step) => step.status !== 'done' && step.status !== 'skipped')
    .map((step) => step.title)
  return { settled, total: trail.steps.length, stillOpen }
}

const STAGE_ORDER = [
  'REQUEST_CREATED',
  'APPROVAL_PENDING',
  'APPROVED',
  'ASSIGNED',
  'IN_PROGRESS',
  'EVIDENCE_CAPTURED',
  'ACKNOWLEDGED',
  'PAYMENT_TRIGGERED',
  'RECEIPT_ISSUED',
  'RECONCILED',
]

const STAGE_WORDS: Record<string, string> = {
  REQUEST_CREATED: 'Job created',
  APPROVAL_PENDING: 'Waiting for approval',
  APPROVED: 'Approved',
  ASSIGNED: 'Assigned to a worker',
  IN_PROGRESS: 'Job started',
  EVIDENCE_CAPTURED: 'After photos taken',
  ACKNOWLEDGED: 'Signed off',
  PAYMENT_TRIGGERED: 'Worker payout released',
  RECEIPT_ISSUED: 'Payout receipt issued',
  RECONCILED: 'Job closed',
}

const CHECKPOINT_WORDS: Record<string, string> = {
  site_inspection: 'Site check',
  risk_assessment: 'Safety check',
  arrival: 'Arrival',
  completion_review: 'Work review',
}

const RECORD_WORDS: Record<string, string> = {
  JobAssignmentVC: 'Job assignment record',
  RequisitionVC: 'Job card',
  ReceiptVC: 'Material receipt record',
  ExecutionAckVC: 'Completion record',
  SiteInspectionVC: 'Site inspection',
  InvoiceVC: 'Invoice',
  PaymentReceiptVC: 'Payment receipt',
  EmployeeRoleVC: 'Role card',
}

const ROLE_WORDS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Team member',
  field_worker: 'Field worker',
  supervisor: 'Supervisor',
  approver: 'Approver',
  manager: 'Manager',
  finance_manager: 'Finance officer',
  director: 'Director',
  dispatcher: 'Dispatcher',
}

export function auditRoleWords(role?: string): string | undefined {
  const key = String(role || '')
    .toLowerCase()
    .trim()
  if (!key) return undefined
  return ROLE_WORDS[key] || key.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function nameOf(userId: unknown, people: AuditPerson[]): { name: string; role?: string } | undefined {
  const id = String(userId || '').trim()
  if (!id) return undefined
  const person = people.find((p) => p.userId === id)
  if (!person) return { name: `Team member · ${id.slice(0, 6)}` }
  const display = String(person.displayName || '').trim()
  if (display && !/^(organization owner|team member)$/i.test(display)) return { name: display, role: person.role }
  if (person.phone) return { name: person.phone, role: person.role }
  const roleName = auditRoleWords(person.role)
  if (roleName && roleName !== 'Team member') return { name: roleName, role: person.role }
  return { name: `Team member · ${id.slice(0, 6)}`, role: person.role }
}

function shortRef(hash: unknown): string | undefined {
  const value = String(hash || '').trim()
  if (!value) return undefined
  return value.length > 12 ? `${value.slice(0, 12)}…` : value
}

function gpsWords(gps: any): string | undefined {
  const lat = Number(gps?.lat ?? gps?.latitude)
  const lng = Number(gps?.lng ?? gps?.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined
  const accuracy = Number(gps?.accuracy)
  return `Location ${lat.toFixed(5)}, ${lng.toFixed(5)}${Number.isFinite(accuracy) ? ` (±${Math.round(accuracy)} m)` : ''}`
}

function photoList(evidence: any): string[] {
  const out: string[] = []
  if (evidence?.photoUri) out.push(String(evidence.photoUri))
  for (const item of Array.isArray(evidence?.attachments) ? evidence.attachments : []) {
    if (item?.photoUri) out.push(String(item.photoUri))
  }
  return out
}

function moneyWords(amount: unknown, currency: unknown): string | undefined {
  const value = Number(amount)
  if (!Number.isFinite(value)) return undefined
  return `${String(currency || 'USD')} ${value.toFixed(2)}`
}

/** Everyone who did a finished step, with what they did and when (first and last). */
function peopleFromSteps(steps: AuditStep[], people: AuditPerson[] = []): Map<string, AuditPersonRow> {
  const peopleMap = new Map<string, AuditPersonRow>()
  for (const step of steps) {
    if (!step.byUserId || step.status !== 'done') continue
    const resolved = nameOf(step.byUserId, people)
    const key = String(step.byUserId)
    const row = peopleMap.get(key) || {
      userId: key,
      name: resolved?.name || `Team member · ${key.slice(0, 6)}`,
      role: auditRoleWords(resolved?.role),
      did: [],
      firstAt: undefined,
      lastAt: undefined,
    }
    row.did.push(step.title)
    if (step.at) {
      if (!row.firstAt || step.at < row.firstAt) row.firstAt = step.at
      if (!row.lastAt || step.at > row.lastAt) row.lastAt = step.at
    }
    peopleMap.set(key, row)
  }
  return peopleMap
}

/** What the client sent with the job, as the office logged it on intake. */
function sourceDocumentWords(input: Record<string, any>): string {
  const count = Array.isArray(input.sourceAttachments) ? input.sourceAttachments.length : 0
  if (count > 0) return `${count} client source document${count === 1 ? '' : 's'} attached`
  return input.jobIntakeId ? 'No client source documents attached' : ''
}

export function buildJobAuditTrail(run: any, people: AuditPerson[] = []): JobAuditTrail {
  const state = (run?.output && typeof run.output === 'object' ? run.output : {}) as Record<string, any>
  const input = (state.workflowInput || run?.input || {}) as Record<string, any>
  const stage = String(state.workflowStage || state.stage || '').toUpperCase()
  const stageIdx = STAGE_ORDER.indexOf(stage)
  const reached = (key: string) => stageIdx >= STAGE_ORDER.indexOf(key)
  const runStatus = String(run?.status || '').toLowerCase()
  const pauseReason = runStatus === 'paused' ? String(state.pauseReason || '').toLowerCase() : ''
  const checkpoints = (state.checkpoints || {}) as Record<string, any>
  const blocks: any[] = Array.isArray(state.checkpointBlocks) ? state.checkpointBlocks : []
  const stageHistory: any[] = Array.isArray(state.stageHistory) ? state.stageHistory : []
  const stageAt = (key: string): string | undefined => {
    const hit = stageHistory.find((entry) => String(entry?.stage || '').toUpperCase() === key)
    return hit?.at ? String(hit.at) : undefined
  }
  const stageBy = (key: string): string | undefined => {
    const hit = stageHistory.find((entry) => String(entry?.stage || '').toUpperCase() === key)
    return hit?.by ? String(hit.by) : undefined
  }

  const reference = String(input.reference || input.poNumber || run?.id || '')
  const title = String(input.title || input.description || 'Field job')

  const steps: AuditStep[] = []
  const push = (step: Omit<AuditStep, 'details' | 'photos'> & { details?: string[]; photos?: string[] }) => {
    const resolved = nameOf(step.byUserId, people)
    const stageKeys: Record<string, string> = {
      receipt: 'RECEIPTS',
      payment: 'PAYMENT_TRIGGERED',
      receipt_issued: 'RECEIPT_ISSUED',
      client_invoice: 'CLIENT_INVOICE',
    }
    const stageKey = stageKeys[step.id]
    const outcome = stageKey ? fieldStageOutcome(stageKey, state) : undefined
    steps.push({
      ...step,
      ...(outcome ? { status: outcome.status } : {}),
      by: step.by || resolved?.name,
      details: outcome ? [outcome.note] : (step.details || []).filter(Boolean),
      photos: step.photos || [],
    })
  }

  const toHold = (block: any): AuditHold => {
    const checkpoint = String(block?.checkpoint || '')
    const status = holdStatusOf(block, checkpoints)
    const hazards: string[] = Array.isArray(block?.hazards)
      ? block.hazards
      : Array.isArray(block?.attempt?.hazards)
        ? block.attempt.hazards
        : []
    return {
      id: block?.id ? String(block.id) : undefined,
      checkpoint,
      label: CHECKPOINT_WORDS[checkpoint] || checkpoint,
      status,
      at: block?.at ? String(block.at) : undefined,
      by: nameOf(block?.by, people)?.name,
      byUserId: block?.by ? String(block.by) : undefined,
      reason: String(block?.reason || ''),
      photo: block?.photo?.photoUri
        ? String(block.photo.photoUri)
        : block?.attempt?.holdPhoto?.photoUri
          ? String(block.attempt.holdPhoto.photoUri)
          : undefined,
      hazards: hazards.map((h) => String(h)).filter(Boolean),
      resolvedAt: block?.resolvedAt ? String(block.resolvedAt) : undefined,
      resolvedBy: nameOf(block?.resolvedBy, people)?.name,
      resolutionNote: block?.resolutionNote ? String(block.resolutionNote) : undefined,
      clearedAt: block?.clearedAt ? String(block.clearedAt) : undefined,
      clearedBy: nameOf(block?.clearedBy, people)?.name,
      whatChanged: block?.whatChanged ? String(block.whatChanged) : undefined,
      fixBy: holdFixByOf(block),
      cleared: !holdIsLive(status),
    }
  }

  const holdFor = (checkpoint: string): AuditHold | undefined => {
    const block = [...blocks].reverse().find((b) => String(b?.checkpoint || '') === checkpoint)
    return block ? toHold(block) : undefined
  }

  const checkpointStatus = (checkpoint: string, pause: string, fallbackDone: boolean): AuditStepStatus => {
    const cp = checkpoints[checkpoint]
    if (cp?.status === 'completed') return 'done'
    if (cp?.status === 'waived') return 'skipped'
    if (fallbackDone) return 'done'
    const hold = holdFor(checkpoint)
    if (hold && !hold.cleared) return 'held'
    if (pauseReason === pause) return 'active'
    return 'pending'
  }

  // 1. Created
  push({
    id: 'created',
    title: 'Job created',
    status: 'done',
    byUserId: input.createdByUserId || input.requesterId || input.requestedBy || input.dispatcherId,
    at: run?.createdAt || run?.created_at || stageAt('REQUEST_CREATED'),
    details: [
      input.location ? `Site: ${String(input.location)}` : '',
      input.scheduledDate || input.scheduledFor
        ? `Scheduled for ${String(input.scheduledDate || input.scheduledFor)}`
        : '',
      moneyWords(input.amount, input.currency) ? `Job value ${moneyWords(input.amount, input.currency)}` : '',
      input.problemType ? `Problem: ${String(input.problemType)}` : '',
      sourceDocumentWords(input),
    ],
  })

  // 2. Assigned
  const assignment = state.assignment || {}
  const assigneeId = String(assignment.assigneeId || input.assigneeId || '')
  push({
    id: 'assigned',
    title: 'Assigned',
    status: assignment.assignedAt || reached('ASSIGNED') ? 'done' : 'pending',
    byUserId: assignment.dispatcherId || stageBy('ASSIGNED'),
    at: assignment.assignedAt || stageAt('ASSIGNED'),
    details: [
      assigneeId ? `Field worker: ${nameOf(assigneeId, people)?.name || 'a team member'}` : 'No worker yet',
      input.receiverId ? `Sign-off person: ${nameOf(input.receiverId, people)?.name || 'chosen'}` : '',
      assignment.assignmentNote ? `Note: ${String(assignment.assignmentNote)}` : '',
    ],
  })

  const started = reached('IN_PROGRESS')
  const beforeEvidence = state.evidenceBefore || state.evidence?.before
  const photosStarted = Boolean(beforeEvidence?.evidenceHash)
  const riskDone = ['completed', 'waived'].includes(String(checkpoints.risk_assessment?.status || ''))

  // 3. Started — the worker accepts and heads out. Nobody is on site yet.
  push({
    id: 'started',
    title: 'Job started',
    status: started ? 'done' : pauseReason === 'await_worker_start' ? 'active' : 'pending',
    byUserId: stageBy('IN_PROGRESS') || (started ? assigneeId : undefined),
    at: stageAt('IN_PROGRESS'),
    details: [],
  })

  // 4. Arrival — on site before any check
  const arrival = checkpoints.arrival
  push({
    id: 'arrival',
    title: 'Arrived on site',
    status: checkpointStatus('arrival', 'await_arrival', photosStarted),
    byUserId: arrival?.completedBy,
    at: arrival?.completedAt || arrival?.data?.arrivedAt,
    proof: arrival?.data?.method === 'qr' ? 'Site code scanned' : arrival?.data?.gps ? 'Phone location' : undefined,
    details: [
      gpsWords(arrival?.data?.gps) || '',
      arrival?.data?.qrToken ? `Site code: ${String(arrival.data.qrToken)}` : '',
      arrival?.status === 'waived' ? 'Not needed for this job' : '',
    ],
  })

  // 5. Site check — recorded on site, not before arrival
  const site = checkpoints.site_inspection
  push({
    id: 'site_inspection',
    title: 'Site check',
    status: checkpointStatus('site_inspection', 'await_site_inspection', riskDone || photosStarted),
    byUserId: site?.completedBy || assigneeId || undefined,
    at: site?.completedAt,
    details: [
      site?.data?.outcome ? `Outcome: ${String(site.data.outcome).replace(/_/g, ' ')}` : '',
      site?.data?.findings ? `Findings: ${String(site.data.findings)}` : '',
      site?.status === 'waived' ? 'Not needed for this job' : '',
    ],
    ref: shortRef(site?.data?.evidenceHash),
    photos: site?.data?.photoUri ? [String(site.data.photoUri)] : [],
  })

  // 6. Safety check — on site, before any photos. Every stop-work hold on it is listed here.
  const risk = checkpoints.risk_assessment
  const hazards: string[] = Array.isArray(risk?.data?.hazards) ? risk.data.hazards : []
  const safetyHolds = blocks.filter((b) => String(b?.checkpoint || '') === 'risk_assessment').map(toHold)
  const holdLine = (hold: AuditHold, index: number): string => {
    const who = hold.by ? ` by ${hold.by}` : ''
    const state =
      hold.status === 'open'
        ? hold.fixBy === 'worker'
          ? 'worker fixing it on site'
          : 'waiting for the organisation'
        : hold.status === 'resolved'
          ? `issue sorted${hold.resolvedBy ? ` by ${hold.resolvedBy}` : ''}, waiting for the worker to re-check`
          : hold.status === 'reassigned'
            ? 'ended when the job was reassigned'
            : `cleared${hold.whatChanged ? ` — what changed: ${hold.whatChanged}` : ''}`
    return `Hold ${index + 1}${who}: ${hold.reason} (${state})`
  }
  push({
    id: 'risk_assessment',
    title: 'Safety check',
    status: checkpointStatus('risk_assessment', 'await_risk_assessment', photosStarted),
    byUserId: risk?.completedBy,
    at: risk?.completedAt,
    details: [
      risk?.data ? (hazards.length ? `Hazards: ${hazards.join(', ')}` : 'No hazards found') : '',
      risk?.data?.controls ? `Controls: ${String(risk.data.controls)}` : '',
      risk?.data
        ? `Protective gear confirmed: ${risk.data.ppeConfirmed ? 'yes' : 'no'} · Safe to start: ${risk.data.safeToProceed ? 'yes' : 'no'}`
        : '',
      risk?.data?.whatChanged ? `What changed since the hold: ${String(risk.data.whatChanged)}` : '',
      risk?.data?.notes ? `Notes: ${String(risk.data.notes)}` : '',
      ...safetyHolds.map(holdLine),
      risk?.status === 'waived' ? 'Not needed for this job' : '',
    ],
    photos: safetyHolds.map((hold) => hold.photo || '').filter(Boolean),
  })

  // 7–10. Evidence photos
  const evidenceStep = (id: string, title: string, evidence: any, pause: string, fallbackDone: boolean) => {
    const done = Boolean(evidence?.evidenceHash) || fallbackDone
    const count = photoList(evidence).length
    push({
      id,
      title,
      status: done ? 'done' : pauseReason === pause ? 'active' : 'pending',
      byUserId: evidence?.capturedBy,
      at: evidence?.capturedAt,
      deviceAt: evidence?.deviceCapturedAt,
      proof: evidence?.vcType ? 'Record attached' : evidence?.evidenceHash ? 'Sealed photo' : undefined,
      ref: shortRef(evidence?.evidenceHash),
      details: [
        count > 1 ? `${count} photos` : count === 1 ? '1 photo' : '',
        gpsWords(evidence?.gps) || '',
        evidence?.notes ? `Notes: ${String(evidence.notes)}` : '',
      ],
      photos: photoList(evidence),
      documents: evidence?.vcType ? [String(evidence.notes || 'Attached record')] : [],
    })
  }
  const afterEvidence = state.evidenceAfter || state.evidence?.after
  const concealedEvidence = state.evidenceConcealed || state.evidence?.concealed
  const receiptEvidence = state.evidenceReceipt || state.evidence?.receipt
  const concealedFlag = String(input.requireConcealedWorkPhoto ?? '').trim().toLowerCase()
  const concealedRequired =
    Boolean(input.requireConcealedWorkPhoto) && !['false', '0', 'no', 'off'].includes(concealedFlag)
  // Materials are bought during the job, so receipts sit between the before and after photos.
  const afterDone = Boolean(afterEvidence?.evidenceHash) || reached('EVIDENCE_CAPTURED')
  evidenceStep('before', 'Before photos', beforeEvidence, 'await_evidence_before', afterDone)
  evidenceStep('receipt', 'Receipts for materials', receiptEvidence, 'await_evidence_receipt', false)
  if (!receiptEvidence?.evidenceHash && (receiptEvidence?.skipped || afterDone || reached('ACKNOWLEDGED'))) {
    const receiptStep = steps.find((s) => s.id === 'receipt')
    if (receiptStep) {
      receiptStep.status = 'skipped'
      receiptStep.byUserId = receiptEvidence?.capturedBy
      receiptStep.at = receiptEvidence?.capturedAt
      receiptStep.details = [
        receiptEvidence?.skipped ? 'No materials were bought for this job' : 'No receipts were added',
        receiptEvidence?.notes ? `Notes: ${String(receiptEvidence.notes)}` : '',
      ]
    }
  }
  evidenceStep(
    'concealed',
    'In-progress photo before work is covered',
    concealedEvidence,
    'await_evidence_concealed',
    false,
  )
  if (!concealedRequired && !concealedEvidence?.evidenceHash && (afterDone || reached('ACKNOWLEDGED'))) {
    const concealedStep = steps.find((step) => step.id === 'concealed')
    if (concealedStep) {
      concealedStep.status = 'skipped'
      concealedStep.details = ['Not required for this job']
    }
  }
  evidenceStep('after', 'After photos', afterEvidence, 'await_evidence_after', reached('EVIDENCE_CAPTURED'))

  // 10. Review
  const review = checkpoints.completion_review
  push({
    id: 'completion_review',
    title: 'Work review',
    status: checkpointStatus('completion_review', 'await_completion_review', reached('ACKNOWLEDGED')),
    byUserId: review?.completedBy,
    at: review?.completedAt,
    details: [
      review?.data?.outcome ? `Outcome: ${String(review.data.outcome).replace(/_/g, ' ')}` : '',
      review?.data?.notes ? `Notes: ${String(review.data.notes)}` : '',
      review?.status === 'waived' ? 'Not needed for this job' : '',
    ],
  })

  // 11. Sign-off
  const ack = state.ack || {}
  const signedOff = ack.status === 'acknowledged' || reached('ACKNOWLEDGED')
  push({
    id: 'signoff',
    title: 'Sign-off',
    status: signedOff ? 'done' : pauseReason === 'await_acknowledgement' ? 'active' : 'pending',
    byUserId: ack.receiverId || input.receiverId,
    at: ack.acknowledgedAt || stageAt('ACKNOWLEDGED'),
    proof: signedOff ? (ack.isVerifiable ? 'Confirmed from their wallet' : 'Recorded by the organization') : undefined,
    details: [ack.notes ? `Notes: ${String(ack.notes)}` : ''],
  })

  // 12. Client invoice: sent at sign-off by the payment collection workflow.
  const collection = state.startedWorkflows?.['tpl-payment-collection']
  const invoiceAmount = moneyWords(input.amount, input.currency)
  if (collection || signedOff) {
    const collectionStatus = String(collection?.status || '')
    push({
      id: 'client_invoice',
      title: 'Client invoice',
      status:
        collectionStatus === 'started' || collectionStatus === 'completed'
          ? 'done'
          : collection
            ? 'skipped'
            : 'pending',
      at: collection?.startedAt || collection?.at,
      ref: shortRef(collection?.childRunId || collection?.runId),
      details: [
        collectionStatus === 'started' || collectionStatus === 'completed'
          ? `Invoice sent to the client${invoiceAmount ? ` for ${invoiceAmount}` : ''}`
          : collectionStatus === 'not_needed'
            ? 'No client to invoice on this job'
            : collectionStatus === 'blocked'
              ? 'Invoice not sent: payments are not set up for this organization yet'
              : collectionStatus === 'skipped'
                ? 'Invoice not sent'
                : '',
      ],
    })
  }

  // 13. Worker or subcontractor payout: only when the job has a payout amount.
  const payment = state.payment || {}
  const payoutAmount = Number(input.payoutAmount)
  const hasPayout = Number.isFinite(payoutAmount) && payoutAmount > 0
  const paid = payment.status === 'triggered' || reached('PAYMENT_TRIGGERED')
  const payoutSkipped = !paid && (payment.status === 'not_needed' || (!hasPayout && reached('RECONCILED')))
  push({
    id: 'payment',
    title: 'Worker payout',
    status: paid ? 'done' : payoutSkipped ? 'skipped' : pauseReason === 'await_payout_release' ? 'active' : 'pending',
    byUserId: payment.releasedBy || stageBy('PAYMENT_TRIGGERED'),
    at: payment.triggeredAt || stageAt('PAYMENT_TRIGGERED'),
    proof: paid ? (payment.isVerifiable ? 'Confirmed from their wallet' : 'Recorded by the organization') : undefined,
    details: payoutSkipped
      ? ['No worker payout on this job']
      : [
          moneyWords(payment.amount ?? (hasPayout ? payoutAmount : undefined), payment.currency ?? input.currency)
            ? `Amount ${moneyWords(payment.amount ?? (hasPayout ? payoutAmount : undefined), payment.currency ?? input.currency)}`
            : '',
          payment.notes ? `Notes: ${String(payment.notes)}` : '',
        ],
  })

  // 14. Payout receipt
  const receipt = state.receipt || {}
  push({
    id: 'receipt_issued',
    title: 'Payout receipt issued',
    status:
      receipt.status === 'issued' || reached('RECEIPT_ISSUED')
        ? 'done'
        : receipt.status === 'not_needed' || payoutSkipped
          ? 'skipped'
          : 'pending',
    byUserId: receipt.issuedBy || payment.releasedBy,
    at: receipt.issuedAt || stageAt('RECEIPT_ISSUED'),
    details: receipt.status === 'not_needed' || payoutSkipped ? ['No worker payout on this job'] : [],
  })

  // 15. Closed
  push({
    id: 'closed',
    title: 'Job closed',
    status: reached('RECONCILED') || runStatus === 'completed' ? 'done' : 'pending',
    at:
      stageAt('RECONCILED') ||
      (runStatus === 'completed' ? run?.completedAt || run?.updatedAt || run?.updated_at : undefined),
    details: reached('RECONCILED')
      ? ['Job closed. Client billing, collection and worker payout are tracked separately.']
      : [],
  })

  // People: everyone who actually did something on this job.
  const peopleMap = peopleFromSteps(steps, people)
  // The assigned worker shows even before they act.
  if (assigneeId && !peopleMap.has(assigneeId)) {
    const resolved = nameOf(assigneeId, people)
    peopleMap.set(assigneeId, {
      userId: assigneeId,
      name: resolved?.name || `Team member · ${assigneeId.slice(0, 6)}`,
      role: auditRoleWords(resolved?.role) || 'Field worker',
      did: ['Assigned to do the job'],
    })
  }

  const records: AuditRecord[] = Object.entries(
    (state.issuedCredentials && typeof state.issuedCredentials === 'object' ? state.issuedCredentials : {}) as Record<
      string,
      any
    >,
  ).map(([type, info]) => ({
    type,
    label: RECORD_WORDS[type] || type.replace(/VC$/, '').replace(/([a-z])([A-Z])/g, '$1 $2'),
    issuedAt: info?.issuedAt ? String(info.issuedAt) : undefined,
    to: isOrganisationJobRecord(type, info)
      ? 'Organisation records'
      : nameOf(info?.recipientUserId, people)?.name || auditRoleWords(info?.recipientRole),
    stage: plainStepName(info?.recipientStage),
  }))

  const holds: AuditHold[] = blocks.map(toHold)

  const stageChanges: AuditStageChange[] = stageHistory
    .filter((entry) => entry?.stage && entry?.at)
    .map((entry) => ({
      stage: String(entry.stage),
      label:
        STAGE_WORDS[String(entry.stage).toUpperCase()] ||
        String(entry.stage)
          .replace(/[_-]+/g, ' ')
          .toLowerCase()
          .replace(/\b\w/g, (part) => part.toUpperCase()),
      at: String(entry.at),
      by: nameOf(entry.by, people)?.name,
    }))

  for (const entry of steps) entry.related = handoffLinksForStep(state.handoffs, entry.id)

  return {
    reference,
    title,
    status: runStatus,
    people: Array.from(peopleMap.values()),
    steps,
    records,
    holds,
    stageChanges,
  }
}

/** Progress-timeline stage key → the audit step that records who did (or is chosen for) it. */
const AUDIT_STEP_FOR_STAGE: Record<string, string> = {
  IN_PROGRESS: 'started',
  ARRIVAL: 'arrival',
  SITE_INSPECTION: 'site_inspection',
  RISK_ASSESSMENT: 'risk_assessment',
  BEFORE_EVIDENCE: 'before',
  RECEIPTS: 'receipt',
  EVIDENCE_CAPTURED: 'after',
  COMPLETION_REVIEW: 'completion_review',
  ACKNOWLEDGED: 'signoff',
  PAYMENT_TRIGGERED: 'payment',
  RECEIPT_ISSUED: 'receipt_issued',
}

/** Progress-timeline stage key → the audit step that holds that step's own time. */
const AUDIT_TIME_FOR_STAGE: Record<string, string> = {
  ...AUDIT_STEP_FOR_STAGE,
  REQUEST_CREATED: 'created',
  ASSIGNED: 'assigned',
  CLIENT_INVOICE: 'client_invoice',
  RECEIPT_ISSUED: 'receipt_issued',
  RECONCILED: 'closed',
}

export function stageRelatedWork(trail: JobAuditTrail): Record<string, RelatedWorkLink[]> {
  return Object.fromEntries(
    Object.entries(AUDIT_TIME_FOR_STAGE).map(([stage, id]) => [
      stage,
      trail.steps.find((step) => step.id === id)?.related || [],
    ]),
  )
}

/** When each progress step happened, by stage key. A step with no recorded time is omitted. */
export function stageTimes(trail: JobAuditTrail): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [stageKey, stepId] of Object.entries(AUDIT_TIME_FOR_STAGE)) {
    const at = trail.steps.find((step) => step.id === stepId)?.at
    if (at) out[stageKey] = at
  }
  return out
}

/**
 * Who actually did each step on this job (or, for sign-off, who this job chose), by stage key.
 * The progress timeline prefers this over the organization's default "Who does what" table,
 * so a step done by someone else (or a job-level sign-off person) is shown truthfully.
 */
export function whoDidStages(trail: JobAuditTrail): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [stageKey, stepId] of Object.entries(AUDIT_STEP_FOR_STAGE)) {
    const step = trail.steps.find((s) => s.id === stepId)
    if (!step?.by) continue
    if (step.status === 'done' || stepId === 'signoff') out[stageKey] = step.by
  }
  return out
}

export interface StageMediaItem {
  /** Image shown in the preview. A record can carry one and still use the file icon. */
  src?: string
  label: string
  /** File icon on the step; the preview still shows the image and the lines. */
  record?: boolean
  /** What the step or record actually says, in plain words. */
  lines?: string[]
}

/** Heading for a job: the work itself, with client, site and reference underneath. */
export function jobHeading(
  input?: {
    description?: string
    title?: string
    clientName?: string
    location?: string
    reference?: string
    poNumber?: string
  } | null,
): { title: string; detail: string } {
  const work = String(input?.description || input?.title || '').trim()
  const client = String(input?.clientName || '').trim()
  const location = String(input?.location || '').trim()
  const reference = String(input?.reference || input?.poNumber || '').trim()
  const title = work || [client, location].filter(Boolean).join(', ') || 'Job'
  const detail = [client, location, reference].filter((part) => part && !title.includes(part)).join(' · ')
  return { title, detail }
}

function mediaLines(step: AuditStep | undefined, extra: string[] = []): string[] {
  const seen = new Set<string>()
  const lines: string[] = []
  for (const line of [...extra, step?.by ? `By ${step.by}` : '', ...(step?.details || [])]) {
    const text = String(line || '').trim()
    if (!text || seen.has(text)) continue
    seen.add(text)
    lines.push(text)
  }
  return lines
}

/** Receipts for materials bought during the job have their own step, between the before and after photos. */
const MEDIA_STEPS_FOR_STAGE: Record<string, string[]> = {
  SITE_INSPECTION: ['site_inspection'],
  BEFORE_EVIDENCE: ['before'],
  RECEIPTS: ['receipt'],
  EVIDENCE_CAPTURED: ['after'],
}

/** Issued records sit on the same stage as the work that produced them. */
const RECORD_ON_STAGE: Record<string, string> = {
  JobAssignmentVC: 'ASSIGNED',
  RequisitionVC: 'ASSIGNED',
  SiteInspectionVC: 'SITE_INSPECTION',
  ReceiptVC: 'RECEIPTS',
  ExecutionAckVC: 'ACKNOWLEDGED',
}

/** Photos and attached records for each progress-timeline stage, so a step can show small previews. */
export function stageMedia(trail: JobAuditTrail): Record<string, StageMediaItem[]> {
  const out: Record<string, StageMediaItem[]> = {}
  for (const [stageKey, stepIds] of Object.entries(MEDIA_STEPS_FOR_STAGE)) {
    const items: StageMediaItem[] = []
    for (const stepId of stepIds) {
      const step = trail.steps.find((s) => s.id === stepId)
      if (!step) continue
      const lines = mediaLines(step)
      step.photos.forEach((src, index) => items.push({ src, label: `${step.title} ${index + 1}`, lines }))
      for (const label of step.documents || []) items.push({ label, record: true, src: step.photos[0], lines })
    }
    if (items.length > 0) out[stageKey] = items
  }
  for (const record of trail.records) {
    const stageKey = RECORD_ON_STAGE[record.type]
    if (!stageKey) continue
    const stepId = AUDIT_TIME_FOR_STAGE[stageKey]
    const step = stepId ? trail.steps.find((s) => s.id === stepId) : undefined
    const sent = [record.to ? `Sent to ${record.to}` : '', record.stage || ''].filter(Boolean).join(' · ')
    const lines = mediaLines(step, sent ? [sent] : [])
    const items = out[stageKey] || []
    if (!items.some((item) => item.record && item.label === record.label)) {
      items.push({ label: record.label, record: true, src: step?.photos[0], lines })
    }
    out[stageKey] = items
  }
  return out
}

/** A receipt or supplier bill that came back to the job from "Buy materials". */
export interface PurchaseReceipt {
  step: string
  receiptRef?: string
  billRef?: string
  amount?: number
  currency?: string
  /** Photo taken of the receipt or bill when the purchase step was finished. */
  photoUri?: string
  sha256?: string
  /** A receipt record from the wallet that stood in for the photo. */
  record?: { id: string; type: string; label: string }
}

/** One short line per purchase receipt, the same on the job page and the phone. */
export function purchaseReceiptLine(receipt: PurchaseReceipt): string {
  const what = receipt.billRef ? `Supplier bill ${receipt.billRef}` : `Receipt ${receipt.receiptRef || ''}`.trim()
  const amount =
    typeof receipt.amount === 'number' ? ` · ${receipt.currency || 'USD'} ${receipt.amount.toFixed(2)}` : ''
  const proof = receipt.photoUri ? '' : receipt.record ? ` · ${receipt.record.label}` : ''
  return `${receipt.step}: ${what}${amount}${proof}`
}

/** Receipts from finished "Buy materials" hand-offs, read from the job's `handoffs` list. */
export function purchaseReceiptsFromHandoffs(handoffs: unknown): PurchaseReceipt[] {
  if (!Array.isArray(handoffs)) return []
  return handoffs
    .filter((link: any) => link?.status === 'completed' && Array.isArray(link?.result?.receipts))
    .flatMap((link: any) => link.result.receipts as PurchaseReceipt[])
}

/** One sealed photo on the Photos or Receipts tab. Same split as the website job card. */
export interface JobSheetPhoto {
  key: string
  phase: string
  label: string
  photoUri?: string
  extras: Array<{ src: string; label: string }>
  sealed: boolean
  deviceAt?: string
  capturedAt?: string
  location?: string
  notes?: string
}

export interface JobSheetEvidence {
  before?: JobSheetPhoto
  after?: JobSheetPhoto
  otherPhotos: JobSheetPhoto[]
  receiptPhotos: JobSheetPhoto[]
  supplierReceipts: Array<{ supplierName: string; reference: string; amount: string }>
  records: Array<{ type: string; label: string; to?: string }>
  /** Minutes between the before and after photos, when both have a time. */
  workDuration?: string
  photoCount: number
  receiptCount: number
}

const SHEET_RECORD_LABEL: Record<string, string> = {
  JobAssignmentVC: 'Job assignment record (sent to the worker)',
  RequisitionVC: 'Job card (sent to the worker)',
  ReceiptVC: 'Material receipt record',
  ExecutionAckVC: 'Completion record',
  SiteInspectionVC: 'Site inspection (kept by the organisation)',
  InvoiceVC: 'Invoice',
  PaymentReceiptVC: 'Payment receipt',
}

const SHEET_PHASE_LABEL: Record<string, string> = {
  before: 'Before work',
  after: 'After work',
  receipt: 'Receipt',
}

const SHEET_STEP_WORDS: Record<string, string> = {
  assign_field_worker: 'Who does the job',
  inspect_site: 'Site check',
  review_completion: 'Work review',
  acknowledge_execution: 'Sign-off',
  trigger_payout: 'Worker payout',
  release_funds: 'Payment release',
  issue_receipt_vc: 'Receipt',
  record_payment: 'Payment',
}

function sheetMinutesBetween(a?: string, b?: string): string | undefined {
  if (!a || !b) return undefined
  const ms = new Date(b).getTime() - new Date(a).getTime()
  if (Number.isNaN(ms) || ms < 0) return undefined
  const mins = Math.round(ms / 60000)
  if (mins < 60) return `${mins} min`
  const hours = Math.floor(mins / 60)
  return `${hours} h ${mins % 60} min`
}

function sheetPhoto(ev: any, index: number): JobSheetPhoto {
  const phase = String(ev?.phase || ev?.type || '').toLowerCase()
  const extras = Array.isArray(ev?.attachments) ? ev.attachments : []
  const gps = ev?.gps
  const lat = gps?.lat != null ? Number(gps.lat) : undefined
  const lng = gps?.lng != null ? Number(gps.lng) : undefined
  return {
    key: `${phase || 'photo'}-${index}`,
    phase,
    label: SHEET_PHASE_LABEL[phase] || 'Photo',
    photoUri: typeof ev?.photoUri === 'string' ? ev.photoUri : undefined,
    extras: extras
      .map((item: any, extraIndex: number) => ({
        src: typeof item?.photoUri === 'string' ? item.photoUri : '',
        label: item?.label || `Photo ${extraIndex + 2}`,
      }))
      .filter((item: { src: string }) => item.src),
    sealed: Boolean(ev?.evidenceHash),
    deviceAt: ev?.deviceCapturedAt ? String(ev.deviceCapturedAt) : undefined,
    capturedAt: ev?.capturedAt || ev?.timestamp ? String(ev.capturedAt || ev.timestamp) : undefined,
    location:
      lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
        ? `${lat.toFixed(5)}, ${lng.toFixed(5)}`
        : undefined,
    notes: ev?.notes ? String(ev.notes) : undefined,
  }
}

/**
 * Photos, receipt photos, supplier receipts and issued records for the job tabs.
 * The website job card and the phone job sheet both read this.
 */
export function jobSheetEvidence(state: any): JobSheetEvidence {
  const evidence: any[] = []
  if (state?.evidenceBefore) evidence.push({ ...state.evidenceBefore, phase: 'before' })
  if (state?.evidenceAfter) evidence.push({ ...state.evidenceAfter, phase: 'after' })
  if (state?.evidenceReceipt) evidence.push({ ...state.evidenceReceipt, phase: 'receipt' })
  if (Array.isArray(state?.evidence)) {
    evidence.push(...state.evidence)
  } else if (state?.evidence && !state.evidenceBefore && !state.evidenceAfter && !state.evidenceReceipt) {
    evidence.push(state.evidence)
  }
  const isReceipt = (item: any) => String(item?.type || item?.phase || '').toLowerCase() === 'receipt'
  const photos = evidence.filter((item) => !isReceipt(item)).map(sheetPhoto)
  const receiptPhotos = evidence.filter((item) => isReceipt(item) && !item.skipped).map(sheetPhoto)
  const before = photos.find((item) => item.phase === 'before')
  const after = photos.find((item) => item.phase === 'after')
  const supplierReceipts = (Array.isArray(state?.receipts) ? state.receipts : []).map((vc: any) => ({
    supplierName: String(vc?.supplierName || 'Verified Supplier'),
    reference: String(vc?.issuerDID || '').slice(-8) || '—',
    amount: vc?.amount != null && vc?.amount !== '' ? `$${vc.amount}` : '',
  }))
  const issued = state?.issuedCredentials && typeof state.issuedCredentials === 'object' ? state.issuedCredentials : {}
  const records = Object.entries(issued as Record<string, any>).map(([type, info]) => ({
    type,
    label: SHEET_RECORD_LABEL[type] || type.replace(/VC$/, '').replace(/([a-z])([A-Z])/g, '$1 $2'),
    to: isOrganisationJobRecord(type, info)
      ? 'Organisation records'
      : SHEET_STEP_WORDS[
          String(info?.recipientStage || '')
            .trim()
            .toLowerCase()
        ],
  }))
  const beforeAt = before?.deviceAt || before?.capturedAt
  const afterAt = after?.deviceAt || after?.capturedAt
  return {
    before,
    after,
    otherPhotos: photos.filter((item) => item !== before && item !== after),
    receiptPhotos,
    supplierReceipts,
    records,
    workDuration: sheetMinutesBetween(beforeAt, afterAt),
    photoCount: photos.length,
    receiptCount: receiptPhotos.length + supplierReceipts.length,
  }
}

function emptyTrail(reference: string, title: string, status: string, steps: AuditStep[]): JobAuditTrail {
  return { reference, title, status, people: [], steps, records: [], holds: [], stageChanges: [] }
}

function step(id: string, title: string, at: string | undefined, details: string[], photos: string[] = []): AuditStep {
  return { id, title, status: 'done', at, details, photos }
}

/** Open each related item in its owning workspace, rather than a finance list or a history-only preview. */
export function financePathForChainMember(member: { kind?: string; id?: string; label: string }): string | undefined {
  if (!member.id) return undefined
  if (member.kind === 'job') return `/finance/job-cards?runId=${encodeURIComponent(member.id)}`
  return `/requests?requestId=${encodeURIComponent(member.id)}`
}

/**
 * Drawer heading for one member of a purchase chain. The bill number is shared by the whole
 * chain, so only the supplier payment is headed by it; a purchase request or order keeps its own title.
 */
export function chainHistoryTitle(request: any): string {
  if (!request) return 'History'
  const invoiceRef = request?.ledger?.invoiceRef
  if (invoiceRef && String(request.request_type || '') === 'finance.payment_request')
    return `Supplier bill ${invoiceRef}`
  return String(request.title || 'History')
}

/** History of a purchase request, purchase order or supplier payment, from its own events. */
export function trailFromRequest(request: any, people: AuditPerson[] = []): JobAuditTrail {
  const events = Array.isArray(request?.events) ? request.events : []
  const steps = events.map((event: any, index: number) => {
    let payload: Record<string, any> = {}
    if (event?.payload && typeof event.payload === 'object') payload = event.payload
    else if (typeof event?.payload_json === 'string') {
      try {
        payload = JSON.parse(event.payload_json)
      } catch {
        payload = {}
      }
    }
    const to = String(event.to_status || event.toStatus || '')
    const type = String(event.event_type || event.eventType || '')
    let title = 'Updated'
    if (type === 'request.created') title = 'Raised'
    else if (type === 'request.handoff') title = 'Next step started'
    else if (type === 'request.record_issued') title = 'Record sent'
    else if (to === 'submitted') title = 'Submitted'
    else if (to === 'in_review') title = 'In review'
    else if (to === 'approved') title = 'Approved'
    else if (to === 'rejected') title = 'Declined'
    else if (to === 'completed')
      title = payload.invoiceRef ? 'Marked delivered' : payload.receiptRef ? 'Marked paid' : 'Finished'
    else if (to === 'cancelled') title = 'Cancelled'
    const details: string[] = []
    if (payload.recordLabel) details.push(String(payload.recordLabel))
    if (payload.invoiceRef) details.push(`Supplier bill ${payload.invoiceRef}`)
    if (payload.receiptRef) details.push(`Receipt ${payload.receiptRef}`)
    const amount = payload.amountPaid ?? payload.amount
    if (amount) details.push(`Amount ${amount}`)
    const photo =
      typeof payload.receiptImage === 'string' && payload.receiptImage.startsWith('data:image')
        ? [payload.receiptImage]
        : []
    const actorUserId = event.actor_user_id || event.actorUserId
    const who = actorUserId ? nameOf(actorUserId, people) : undefined
    return {
      ...step(String(event.id || index), title, event.created_at || event.createdAt, details, photo),
      by: who?.name,
      byUserId: actorUserId ? String(actorUserId) : undefined,
      related: requestEventLinks(request?.family, String(request?.id || ''), type, payload.childRequestId),
    }
  })
  const reference = String(request?.ledger?.invoiceRef || request?.context?.projectRef || request?.id || 'Request')
  const trail = emptyTrail(reference, String(request?.title || 'Request'), String(request?.status || ''), steps)
  trail.subject = 'request'
  trail.people = Array.from(peopleFromSteps(steps, people).values())
  return trail
}

/** History of money a client paid us. */
export function trailFromPaymentLink(link: any): JobAuditTrail {
  const steps = [
    step('created', 'Payment requested', link.created_at || link.createdAt, [link.description].filter(Boolean)),
  ]
  if (link.paid_at || link.paidAt || link.status === 'paid') {
    steps.push(
      step(
        'paid',
        'Client paid',
        link.paid_at || link.paidAt,
        [link.provider_ref || link.providerRef ? `Reference ${link.provider_ref || link.providerRef}` : ''].filter(
          Boolean,
        ),
      ),
    )
  }
  return {
    ...emptyTrail(
      String(link.invoice_ref || link.invoiceRef || link.shortlink_code || link.id || 'Payment'),
      String(link.description || 'Client payment'),
      String(link.status || ''),
      steps,
    ),
    subject: String(link.sector || '').toLowerCase() === 'education' ? 'fee' : 'payment',
  }
}

/** History of a supplier bill (money we owe). */
export function trailFromSupplierBill(bill: any): JobAuditTrail {
  const steps = [
    step(
      'recorded',
      'Supplier bill recorded',
      bill.created_at || bill.createdAt || bill.recordedAt,
      [
        bill.supplierName || bill.supplier_name,
        bill.project_ref || bill.projectRef ? `Job ${bill.project_ref || bill.projectRef}` : '',
      ].filter(Boolean),
    ),
  ]
  for (const payment of bill.payments || []) {
    steps.push(
      step(
        payment.paymentId || payment.id,
        'Supplier paid',
        payment.paidAt || payment.paid_at,
        [
          payment.reference ? `Reference ${payment.reference}` : '',
          payment.amount ? `Amount ${payment.amount}` : '',
        ].filter(Boolean),
      ),
    )
  }
  return {
    ...emptyTrail(
      String(bill.invoice_ref || bill.invoiceRef || bill.id || 'Bill'),
      String(bill.description || bill.supplierName || 'Supplier bill'),
      String(bill.status || ''),
      steps,
    ),
    subject: 'bill',
  }
}

/**
 * History of one school fee. The steps come from `schoolFeeProgress` (financeStages / uxCopy), so
 * the Progress list and this history never disagree; the receipt record is added when it was kept.
 */
export function trailFromSchoolFee(
  run: any,
  progress: Array<{ key: string; label: string; status: 'done' | 'active' | 'pending'; at?: string; by?: string }>,
): JobAuditTrail {
  const input = run?.input || {}
  const output = run?.output || {}
  const bill = output.clientBill || {}
  const steps: AuditStep[] = progress.map((item) => ({
    id: item.key.toLowerCase(),
    title: item.label,
    status: item.status === 'active' ? 'active' : item.status,
    at: item.at,
    by: item.status === 'done' ? item.by : undefined,
    details: [
      item.key === 'FEE_SET' ? [input.feeType, input.term].filter(Boolean).join(' · ') : '',
      item.key === 'LINK_SENT' && bill.notification?.to ? `Sent to ${bill.notification.to}` : '',
      item.key === 'PAID' && bill.reference ? `Reference ${bill.reference}` : '',
    ].filter(Boolean),
    photos: [],
  }))
  const trail: JobAuditTrail = {
    ...emptyTrail(
      String(input.reference || run?.id || 'Fee'),
      String(input.studentName || 'School fee'),
      String(run?.status || ''),
      steps,
    ),
    subject: 'fee',
  }
  const receipt = output.issuedCredentials?.SchoolFeeReceiptVC
  if (receipt) {
    trail.records.push({
      type: 'SchoolFeeReceiptVC',
      label: 'School fee receipt',
      issuedAt: receipt.issuedAt,
      to: String(input.payerName || '').trim() || undefined,
    })
  }
  return trail
}
