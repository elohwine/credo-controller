/**
 * Full history of a field job, built from the run state the engine keeps
 * (`workflow_runs.output`). Pure: no fetching, no React. The portal job drawer
 * ("History" tab) and the app job sheet ("See the full history") render the same
 * shape so both sides read identically.
 *
 * Kept in step with `credo-ui/portal/components/finance/jobAuditTrail.ts`.
 */

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

export interface AuditHold {
  checkpoint: string
  label: string
  at?: string
  by?: string
  reason: string
  cleared: boolean
}

export interface AuditStageChange {
  stage: string
  label: string
  at: string
  by?: string
}

export interface JobAuditTrail {
  reference: string
  title: string
  status: string
  people: AuditPersonRow[]
  steps: AuditStep[]
  records: AuditRecord[]
  holds: AuditHold[]
  stageChanges: AuditStageChange[]
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
  PAYMENT_TRIGGERED: 'Payment released',
  RECEIPT_ISSUED: 'Payment receipt issued',
  RECONCILED: 'Job closed',
}

const CHECKPOINT_WORDS: Record<string, string> = {
  site_inspection: 'Site check',
  risk_assessment: 'Safety check',
  arrival: 'Arrival',
  completion_review: 'Work review',
}

const RECORD_WORDS: Record<string, string> = {
  RequisitionVC: 'Job card',
  ReceiptVC: 'Material receipt record',
  ExecutionAckVC: 'Completion record',
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
  const key = String(role || '').toLowerCase().trim()
  if (!key) return undefined
  return ROLE_WORDS[key] || key.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function plainStepName(stage?: string): string | undefined {
  const key = String(stage || '').trim().toLowerCase()
  const words: Record<string, string> = {
    assign_field_worker: 'Who does the job',
    inspect_site: 'Site check',
    review_completion: 'Work review',
    acknowledge_execution: 'Sign-off',
    trigger_payout: 'Payment release',
    release_funds: 'Payment release',
    issue_receipt_vc: 'Receipt',
    record_payment: 'Payment',
  }
  return words[key]
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
    steps.push({
      ...step,
      by: step.by || resolved?.name,
      details: (step.details || []).filter(Boolean),
      photos: step.photos || [],
    })
  }

  const holdFor = (checkpoint: string): AuditHold | undefined => {
    const block = [...blocks].reverse().find((b) => String(b?.checkpoint || '') === checkpoint)
    if (!block) return undefined
    const cpStatus = String(checkpoints[checkpoint]?.status || '')
    return {
      checkpoint,
      label: CHECKPOINT_WORDS[checkpoint] || checkpoint,
      at: block.at ? String(block.at) : undefined,
      by: nameOf(block.by, people)?.name,
      reason: String(block.reason || ''),
      cleared: ['completed', 'waived'].includes(cpStatus),
    }
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
      input.scheduledDate || input.scheduledFor ? `Scheduled for ${String(input.scheduledDate || input.scheduledFor)}` : '',
      moneyWords(input.amount, input.currency) ? `Job value ${moneyWords(input.amount, input.currency)}` : '',
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

  // 3. Site check
  const site = checkpoints.site_inspection
  push({
    id: 'site_inspection',
    title: 'Site check',
    status: checkpointStatus('site_inspection', 'await_site_inspection', started),
    byUserId: site?.completedBy,
    at: site?.completedAt,
    details: [
      site?.data?.outcome ? `Outcome: ${String(site.data.outcome).replace(/_/g, ' ')}` : '',
      site?.data?.findings ? `Findings: ${String(site.data.findings)}` : '',
      site?.status === 'waived' ? 'Not needed for this job' : '',
    ],
    ref: shortRef(site?.data?.evidenceHash),
    photos: site?.data?.photoUri ? [String(site.data.photoUri)] : [],
  })

  // 4. Safety check
  const risk = checkpoints.risk_assessment
  const hazards: string[] = Array.isArray(risk?.data?.hazards) ? risk.data.hazards : []
  push({
    id: 'risk_assessment',
    title: 'Safety check',
    status: checkpointStatus('risk_assessment', 'await_risk_assessment', started),
    byUserId: risk?.completedBy,
    at: risk?.completedAt,
    details: [
      risk?.data ? (hazards.length ? `Hazards: ${hazards.join(', ')}` : 'No hazards found') : '',
      risk?.data?.controls ? `Controls: ${String(risk.data.controls)}` : '',
      risk?.data ? `Protective gear confirmed: ${risk.data.ppeConfirmed ? 'yes' : 'no'} · Safe to start: ${risk.data.safeToProceed ? 'yes' : 'no'}` : '',
      risk?.data?.notes ? `Notes: ${String(risk.data.notes)}` : '',
      risk?.status === 'waived' ? 'Not needed for this job' : '',
    ],
  })

  // 5. Started
  push({
    id: 'started',
    title: 'Job started',
    status: started ? 'done' : pauseReason === 'await_worker_start' ? 'active' : 'pending',
    byUserId: stageBy('IN_PROGRESS') || (started ? assigneeId : undefined),
    at: stageAt('IN_PROGRESS'),
    details: [],
  })

  // 6. Arrival
  const arrival = checkpoints.arrival
  const beforeEvidence = state.evidenceBefore || state.evidence?.before
  push({
    id: 'arrival',
    title: 'Arrived on site',
    status: checkpointStatus('arrival', 'await_arrival', Boolean(beforeEvidence?.evidenceHash)),
    byUserId: arrival?.completedBy,
    at: arrival?.completedAt || arrival?.data?.arrivedAt,
    proof: arrival?.data?.method === 'qr' ? 'Site code scanned' : arrival?.data?.gps ? 'Phone location' : undefined,
    details: [
      gpsWords(arrival?.data?.gps) || '',
      arrival?.data?.qrToken ? `Site code: ${String(arrival.data.qrToken)}` : '',
      arrival?.status === 'waived' ? 'Not needed for this job' : '',
    ],
  })

  // 7–9. Photos
  const evidenceStep = (
    id: string,
    title: string,
    evidence: any,
    pause: string,
    fallbackDone: boolean,
  ) => {
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
    })
  }
  const afterEvidence = state.evidenceAfter || state.evidence?.after
  const receiptEvidence = state.evidenceReceipt || state.evidence?.receipt
  evidenceStep('before', 'Before photos', beforeEvidence, 'await_evidence_before', Boolean(afterEvidence?.evidenceHash))
  evidenceStep('after', 'After photos', afterEvidence, 'await_evidence_after', reached('EVIDENCE_CAPTURED'))
  evidenceStep('receipt', 'Receipts', receiptEvidence, 'await_evidence_receipt', false)
  if (!receiptEvidence?.evidenceHash && reached('ACKNOWLEDGED')) {
    const receiptStep = steps.find((s) => s.id === 'receipt')
    if (receiptStep) {
      receiptStep.status = 'skipped'
      receiptStep.details = ['No receipts were added']
    }
  }

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

  // 12. Payment
  const payment = state.payment || {}
  const paid = payment.status === 'triggered' || reached('PAYMENT_TRIGGERED')
  push({
    id: 'payment',
    title: 'Payment released',
    status: paid ? 'done' : pauseReason === 'await_payout_release' ? 'active' : 'pending',
    byUserId: payment.releasedBy || stageBy('PAYMENT_TRIGGERED'),
    at: payment.triggeredAt || stageAt('PAYMENT_TRIGGERED'),
    proof: paid ? (payment.isVerifiable ? 'Confirmed from their wallet' : 'Recorded by the organization') : undefined,
    details: [
      moneyWords(payment.amount ?? input.amount, payment.currency ?? input.currency) ? `Amount ${moneyWords(payment.amount ?? input.amount, payment.currency ?? input.currency)}` : '',
      payment.notes ? `Notes: ${String(payment.notes)}` : '',
    ],
  })

  // 13. Receipt issued
  const receipt = state.receipt || {}
  push({
    id: 'receipt_issued',
    title: 'Payment receipt issued',
    status: receipt.status === 'issued' || reached('RECEIPT_ISSUED') ? 'done' : 'pending',
    at: receipt.issuedAt || stageAt('RECEIPT_ISSUED'),
    details: [],
  })

  // 14. Closed
  push({
    id: 'closed',
    title: 'Job closed',
    status: reached('RECONCILED') || runStatus === 'completed' ? 'done' : 'pending',
    at: stageAt('RECONCILED') || (runStatus === 'completed' ? run?.completedAt || run?.updatedAt || run?.updated_at : undefined),
    details: reached('RECONCILED') ? ['Work, payment and records all matched up'] : [],
  })

  // People: everyone who actually did something on this job.
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
    (state.issuedCredentials && typeof state.issuedCredentials === 'object' ? state.issuedCredentials : {}) as Record<string, any>,
  ).map(([type, info]) => ({
    type,
    label: RECORD_WORDS[type] || type.replace(/VC$/, '').replace(/([a-z])([A-Z])/g, '$1 $2'),
    issuedAt: info?.issuedAt ? String(info.issuedAt) : undefined,
    to: nameOf(info?.recipientUserId, people)?.name || auditRoleWords(info?.recipientRole),
    stage: plainStepName(info?.recipientStage),
  }))

  const holds: AuditHold[] = blocks.map((block) => {
    const checkpoint = String(block?.checkpoint || '')
    const cpStatus = String(checkpoints[checkpoint]?.status || '')
    return {
      checkpoint,
      label: CHECKPOINT_WORDS[checkpoint] || checkpoint,
      at: block?.at ? String(block.at) : undefined,
      by: nameOf(block?.by, people)?.name,
      reason: String(block?.reason || ''),
      cleared: ['completed', 'waived'].includes(cpStatus),
    }
  })

  const stageChanges: AuditStageChange[] = stageHistory
    .filter((entry) => entry?.stage && entry?.at)
    .map((entry) => ({
      stage: String(entry.stage),
      label: STAGE_WORDS[String(entry.stage).toUpperCase()] || String(entry.stage),
      at: String(entry.at),
      by: nameOf(entry.by, people)?.name,
    }))

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
