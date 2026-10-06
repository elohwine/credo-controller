/**
 * Shared stage catalogs for portal finance workflows.
 *
 * Mirrors the mobile finance detail timelines: each stage carries an SSI proof
 * protocol, the credential it issues, and the configured stage-actor key used
 * by org readiness.
 */

export type StageStatus = 'done' | 'active' | 'pending'

export type FinanceStageDef = {
  key: string
  label: string
  proof: string
  vcType: string
  stageAction?: string
}

export type FinanceStageView = FinanceStageDef & {
  status: StageStatus
}

export type ResolvedStageActor = {
  userId?: string
  walletTenantId?: string
  role: string
  mode:
    | 'configured_user'
    | 'configured_wallet'
    | 'configured_role'
    | 'shared_finance'
    | 'role_fallback'
    | 'owner_fallback'
    | string
}

export type WorkflowActorStage = {
  stageAction: string
  title?: string
  requirement?: string
  actor: ResolvedStageActor
}

export type WorkflowActorReport = {
  templateId?: string
  workflowType: string
  name?: string
  stages: WorkflowActorStage[]
}

// Plain step names, aligned with the phone app (`credo-ui/mobile/lib/uxCopy.ts` REQUISITION_STEPS).
export const REQUISITION_STAGES: FinanceStageDef[] = [
  { key: 'created', label: 'Requisition created', proof: 'Record', vcType: 'RequisitionVC' },
  { key: 'manager', label: 'Manager approval', proof: 'OIDC4VP', vcType: 'ManagerApprovalProof', stageAction: 'approve_requisition' },
  { key: 'finance', label: 'Finance approval', proof: 'OIDC4VP', vcType: 'ApprovalVC', stageAction: 'finance_approve_requisition' },
  { key: 'release', label: 'Money released', proof: 'OIDC4VP', vcType: 'ReleaseAuthorizationVC', stageAction: 'release_funds' },
  { key: 'ack', label: 'Delivery confirmed', proof: 'OIDC4VP', vcType: 'ExecutionAckVC', stageAction: 'acknowledge_execution' },
]

/** Plain status names for an internal requisition badge, aligned with the phone app. */
export const REQUISITION_STATUS_LABEL: Record<string, string> = {
  REQUISITION_CREATED: 'Waiting for manager approval',
  MANAGER_APPROVED: 'Waiting for finance approval',
  APPROVED: 'Approved, waiting for money release',
  RELEASED: 'Money released',
  PAID: 'Paid',
  RECEIPT_ISSUED: 'Receipt issued',
  ACKNOWLEDGED: 'Delivery confirmed',
  EXECUTION_ACKNOWLEDGED: 'Delivery confirmed',
  RECONCILED: 'Closed',
  REJECTED: 'Declined',
  CANCELLED: 'Cancelled',
}

export const REQUISITION_STATUS_COLOR: Record<string, string> = {
  REQUISITION_CREATED: 'blue',
  MANAGER_APPROVED: 'indigo',
  APPROVED: 'green',
  RELEASED: 'yellow',
  PAID: 'yellow',
  RECEIPT_ISSUED: 'teal',
  ACKNOWLEDGED: 'teal',
  EXECUTION_ACKNOWLEDGED: 'teal',
  RECONCILED: 'cyan',
  REJECTED: 'red',
  CANCELLED: 'gray',
}

function sentence(value: string): string {
  const plain = value.toLowerCase().replace(/_/g, ' ')
  return plain.charAt(0).toUpperCase() + plain.slice(1)
}

export function requisitionStatusLabel(status: unknown): string {
  const key = String(status ?? '').trim().toUpperCase().replace(/\s+/g, '_')
  if (!key) return 'Unknown'
  return REQUISITION_STATUS_LABEL[key] || sentence(key)
}

export function requisitionStatusColor(status: unknown): string {
  const key = String(status ?? '').trim().toUpperCase().replace(/\s+/g, '_')
  return REQUISITION_STATUS_COLOR[key] || 'gray'
}

/** Plain titles for requisition history entries. */
export const REQUISITION_EVENT_TITLE: Record<string, string> = {
  REQUISITION_CREATED: 'Requisition created',
  REQUISITION_MANAGER_APPROVED: 'Approved by manager',
  REQUISITION_FINANCE_APPROVED: 'Approved by finance',
  REQUISITION_RELEASED: 'Money released',
  REQUISITION_ACKNOWLEDGED: 'Delivery confirmed',
  REQUISITION_APPROVED: 'Request approved',
  MANAGER_APPROVED: 'Approved by manager',
  APPROVED: 'Approved by finance',
  REQUISITION_REJECTED: 'Declined',
  REJECTED: 'Declined',
  RELEASE_AUTHORIZED: 'Money released',
  RELEASED: 'Money released',
  FUNDS_RELEASED: 'Money released',
  PAYMENT_LINK_CREATED: 'Payment link created',
  PAID: 'Paid',
  RECEIPT_ISSUED: 'Receipt issued',
  EXECUTION_ACKNOWLEDGED: 'Delivery confirmed',
  ACKNOWLEDGED: 'Delivery confirmed',
  RECONCILED: 'Closed',
  PURCHASE_ORDER_CREATED: 'Purchase order created',
}

export function requisitionEventTitle(eventType: unknown): string {
  const key = String(eventType ?? '').trim().toUpperCase().replace(/\s+/g, '_')
  if (!key) return 'Update'
  return REQUISITION_EVENT_TITLE[key] || sentence(key)
}

/**
 * The one thing that can happen next on a requisition. Portal and mobile show a single
 * primary action for this step (no stacked disabled buttons), with a plain explanation
 * of who confirms it. Mirrors `requisitionNextStep` in credo-ui/mobile/lib/uxCopy.ts.
 */
export type RequisitionNextStep = {
  action: 'approval' | 'release' | 'ack' | null
  label: string
  helper: string
}

export function requisitionNextStep(status: unknown, signMode?: 'one' | 'both'): RequisitionNextStep {
  const key = String(status ?? '').trim().toUpperCase()
  switch (key) {
    case 'REQUISITION_CREATED':
      return signMode === 'one'
        ? { action: 'approval', label: 'Approve this request', helper: 'One confirmation from your wallet approves this request.' }
        : { action: 'approval', label: 'Approve as manager', helper: 'A manager confirms from their wallet that this request can go ahead.' }
    case 'MANAGER_APPROVED':
      return { action: 'approval', label: 'Approve as finance', helper: 'Finance confirms from their wallet that the money is available.' }
    case 'APPROVED':
      return { action: 'release', label: 'Release funds', helper: 'Release the money and create the payment link. Confirmed from your wallet.' }
    case 'RELEASED':
    case 'PAID':
    case 'RECEIPT_ISSUED':
      return { action: 'ack', label: 'Confirm delivery', helper: 'Confirm the goods or services were received. This closes the requisition.' }
    case 'REJECTED':
      return { action: null, label: 'Declined', helper: 'This requisition was declined. Nothing more to do.' }
    case 'CANCELLED':
      return { action: null, label: 'Cancelled', helper: 'This requisition was cancelled. Nothing more to do.' }
    default:
      return { action: null, label: 'Closed', helper: 'All steps are done. Nothing more to do on this requisition.' }
  }
}

/**
 * FEPT timeline, aligned to the SGK lifecycle docs. The run's `workflowStage` stays ASSIGNED through
 * site inspection and the field worker's risk assessment, and stays IN_PROGRESS through arrival proof
 * and the BEFORE / AFTER evidence checkpoints, so those milestones are derived from the run output.
 */
export const FEPT_STAGES: FinanceStageDef[] = [
  { key: 'REQUEST_CREATED', label: 'Job created', proof: 'Record', vcType: 'RequisitionVC' },
  { key: 'ASSIGNED', label: 'Assigned', proof: 'SSI', vcType: 'AssignmentVC', stageAction: 'assign_field_worker' },
  { key: 'SITE_INSPECTION', label: 'Site inspection', proof: 'Record', vcType: 'InspectionRecord', stageAction: 'inspect_site' },
  { key: 'RISK_ASSESSMENT', label: 'Safety check (field worker)', proof: 'Record', vcType: 'RiskAssessmentRecord', stageAction: 'assess_risk' },
  { key: 'IN_PROGRESS', label: 'Job started', proof: 'SSI', vcType: 'ExecutionProofVC', stageAction: 'start_job' },
  { key: 'ARRIVAL', label: 'Arrived on site', proof: 'Record', vcType: 'ArrivalProof', stageAction: 'confirm_arrival' },
  { key: 'BEFORE_EVIDENCE', label: 'Before photos', proof: 'SSI', vcType: 'EvidenceBundleVC', stageAction: 'capture_evidence' },
  { key: 'WORK', label: 'Work in progress', proof: 'Record', vcType: 'WorkLog', stageAction: 'start_job' },
  { key: 'EVIDENCE_CAPTURED', label: 'After photos (work done)', proof: 'SSI', vcType: 'EvidenceBundleVC', stageAction: 'capture_evidence' },
  { key: 'COMPLETION_REVIEW', label: 'Work review', proof: 'Record', vcType: 'ReviewRecord', stageAction: 'review_completion' },
  { key: 'ACKNOWLEDGED', label: 'Sign-off', proof: 'OIDC4VP', vcType: 'ExecutionAckVC', stageAction: 'acknowledge_execution' },
  { key: 'PAYMENT_TRIGGERED', label: 'Payment released', proof: 'OIDC4VP', vcType: 'PaymentProofVC', stageAction: 'trigger_payout' },
  { key: 'RECEIPT_ISSUED', label: 'Receipt issued', proof: 'OID4VCI', vcType: 'ReceiptVC', stageAction: 'issue_receipt_vc' },
  { key: 'RECONCILED', label: 'Job closed', proof: 'SSI', vcType: 'ReconciliationVC' },
]

export const AP_STAGES: FinanceStageDef[] = [
  { key: 'invoice', label: 'Supplier invoice', proof: 'Record', vcType: 'InvoiceVC' },
  { key: 'payment', label: 'Payment recorded', proof: 'OIDC4VP', vcType: 'PaymentProofVC', stageAction: 'record_payment' },
  { key: 'remittance', label: 'Remittance acknowledged', proof: 'SSI', vcType: 'RemittanceAdviceVC', stageAction: 'acknowledge_remittance' },
  { key: 'receipt', label: 'Receipt issued', proof: 'OID4VCI', vcType: 'PaymentReceiptVC', stageAction: 'issue_receipt_vc' },
]

export const AR_STAGES: FinanceStageDef[] = [
  { key: 'request', label: 'Collection requested', proof: 'Record', vcType: 'CollectionRequestVC' },
  { key: 'consent', label: 'Consent proof', proof: 'OIDC4VP', vcType: 'CollectionConsentVC', stageAction: 'present_payment_proof' },
  { key: 'settlement', label: 'Settlement recorded', proof: 'SSI', vcType: 'SettlementVC', stageAction: 'record_payment' },
  { key: 'reconciled', label: 'Reconciled', proof: 'OID4VCI', vcType: 'PaymentReceiptVC', stageAction: 'issue_receipt_vc' },
]

export const INVOICE_STAGES: FinanceStageDef[] = [
  { key: 'invoice', label: 'Invoice created', proof: 'OID4VCI', vcType: 'InvoiceVC' },
  { key: 'payment', label: 'Payment', proof: 'EcoCash', vcType: 'PaymentProofVC', stageAction: 'record_payment' },
  { key: 'confirmed', label: 'Payment confirmed', proof: 'Webhook', vcType: 'PaymentReceiptVC', stageAction: 'present_payment_proof' },
  { key: 'receipt', label: 'Receipt VC issued', proof: 'OID4VCI', vcType: 'SchoolFeeReceiptVC', stageAction: 'issue_receipt_vc' },
]

const REQUISITION_STATUS_INDEX: Record<string, number> = {
  REQUISITION_CREATED: 1,
  MANAGER_APPROVED: 2,
  APPROVED: 3,
  RELEASED: 4,
  PAID: 4,
  RECEIPT_ISSUED: 4,
  ACKNOWLEDGED: 5,
  EXECUTION_ACKNOWLEDGED: 5,
  RECONCILED: 5,
}

const REQUEST_STATUS_INDEX: Record<string, number> = {
  draft: 0,
  submitted: 1,
  in_review: 1,
  approved: 2,
  in_fulfilment: 3,
  completed: 4,
}

export function markStages(defs: FinanceStageDef[], activeIndex: number): FinanceStageView[] {
  const bounded = Math.max(0, Math.min(activeIndex, defs.length))
  return defs.map((stage, index) => ({
    ...stage,
    status: index < bounded ? 'done' : index === bounded ? 'active' : 'pending',
  }))
}

export function requisitionStages(status?: string, signMode?: 'one' | 'both'): FinanceStageView[] {
  const key = String(status || '').toUpperCase()
  if (signMode === 'one') {
    const defs = REQUISITION_STAGES.filter((stage) => stage.key !== 'finance').map((stage) =>
      stage.key === 'manager' ? { ...stage, label: 'Approval' } : stage,
    )
    const oneIndex: Record<string, number> = {
      REQUISITION_CREATED: 1,
      MANAGER_APPROVED: 1,
      APPROVED: 2,
      RELEASED: 3,
      PAID: 3,
      RECEIPT_ISSUED: 3,
      ACKNOWLEDGED: 4,
      EXECUTION_ACKNOWLEDGED: 4,
      RECONCILED: 4,
    }
    return markStages(defs, oneIndex[key] ?? 0)
  }
  const index = REQUISITION_STATUS_INDEX[key] ?? 0
  return markStages(REQUISITION_STAGES, index)
}

const FEPT_ENGINE_ORDER = [
  'DRAFT',
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
  'COMPLETED',
]

function engineIndex(stage?: string): number {
  return FEPT_ENGINE_ORDER.indexOf(String(stage || '').toUpperCase())
}

function checkpointDone(output: any, name: string): boolean {
  const status = output?.checkpoints?.[name]?.status
  return status === 'completed' || status === 'waived'
}

/**
 * Timeline for a field run. Pass the run output so checkpoints inside a stage (inspection,
 * risk assessment, arrival, before evidence) are shown as their own steps.
 */
export function feptStages(stage?: string, output?: any): FinanceStageView[] {
  const idx = engineIndex(stage)
  if (!output) {
    const key = String(stage || '').toUpperCase()
    const position = FEPT_STAGES.findIndex((item) => item.key === key)
    return markStages(FEPT_STAGES, position < 0 ? 0 : position)
  }

  const started = idx >= engineIndex('IN_PROGRESS')
  const afterDone = idx >= engineIndex('EVIDENCE_CAPTURED') || Boolean(output?.evidenceAfter?.evidenceHash)
  const done: Record<string, boolean> = {
    REQUEST_CREATED: idx >= engineIndex('REQUEST_CREATED'),
    ASSIGNED: idx >= engineIndex('ASSIGNED'),
    // Runs that started before checkpoints existed are treated as having passed them.
    SITE_INSPECTION: checkpointDone(output, 'site_inspection') || started,
    RISK_ASSESSMENT: checkpointDone(output, 'risk_assessment') || started,
    IN_PROGRESS: started,
    ARRIVAL: checkpointDone(output, 'arrival') || Boolean(output?.evidenceBefore?.evidenceHash) || afterDone,
    BEFORE_EVIDENCE: Boolean(output?.evidenceBefore?.evidenceHash) || afterDone,
    // The work happens between the BEFORE and AFTER checkpoints; it ends when AFTER evidence is captured.
    WORK: afterDone,
    COMPLETION_REVIEW: checkpointDone(output, 'completion_review') || idx >= engineIndex('ACKNOWLEDGED'),
    EVIDENCE_CAPTURED: afterDone,
  }
  let activeAssigned = false
  return FEPT_STAGES.map((item) => {
    const isDone = item.key in done ? done[item.key] : idx >= engineIndex(item.key)
    if (isDone) return { ...item, status: 'done' as const }
    if (!activeAssigned) {
      activeAssigned = true
      return { ...item, status: 'active' as const }
    }
    return { ...item, status: 'pending' as const }
  })
}

/** What a paused job is waiting for, in plain words (keyed by the run's pauseReason). */
export const JOB_WAITING_LABEL: Record<string, string> = {
  await_site_inspection: 'Site inspection',
  await_risk_assessment: 'Worker safety check',
  await_worker_start: 'Worker to start',
  await_arrival: 'Worker arrival',
  await_evidence_before: 'Before photos',
  await_evidence_after: 'After photos',
  await_evidence_receipt: 'Receipts',
  await_completion_review: 'Work review',
  await_acknowledgement: 'Sign-off',
  await_payout_release: 'Payment release',
}

/** Plain stage names for a field job, aligned with the mobile Jobs tab. */
export const JOB_STAGE_LABEL: Record<string, string> = {
  REQUEST_CREATED: 'New',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In progress',
  EVIDENCE_CAPTURED: 'Waiting for sign-off',
  ACKNOWLEDGED: 'Signed off',
  PAYMENT_TRIGGERED: 'Payment released',
  RECEIPT_ISSUED: 'Receipt issued',
  RECONCILED: 'Closed',
  COMPLETED: 'Completed',
  DISPUTED: 'Under review',
  CANCELLED: 'Cancelled',
  REVOKED: 'Cancelled',
}

/** Badge colour for a job; shared by the job board and the job detail drawer. */
export function jobStatusColor(status: string, stage?: string): string {
  if (stage === 'RECONCILED' || status === 'completed') return 'green'
  if (status === 'paused') return 'orange' // waiting on a person
  if (status === 'running') return 'blue'
  return 'gray'
}

/** Plain-language job status; shared by the job board and the job detail drawer. */
export function jobStatusLabel(status: string, stage?: string, pauseReason?: string): string {
  if (status === 'paused' && pauseReason && JOB_WAITING_LABEL[pauseReason]) return `Waiting: ${JOB_WAITING_LABEL[pauseReason]}`
  if (status === 'failed') return 'Needs attention'
  if (stage) return JOB_STAGE_LABEL[stage.toUpperCase()] || stage.replace(/_/g, ' ').toLowerCase()
  if (status === 'paused') return 'In progress'
  if (status === 'completed') return 'Completed'
  return status
}

const FIELD_REQUEST_STATUS_INDEX: Record<string, number> = {
  draft: 0,
  submitted: 0,
  in_review: 0,
  approved: 1,
  in_fulfilment: 2,
  completed: FEPT_STAGES.length,
}

/** Request-level status mapped onto the FEPT timeline when the run's own stage is not known yet. */
export function fieldRequestStages(status?: string): FinanceStageView[] {
  const index = FIELD_REQUEST_STATUS_INDEX[String(status || '').toLowerCase()] ?? 0
  return markStages(FEPT_STAGES, index)
}

export function requestStages(defs: FinanceStageDef[], status?: string): FinanceStageView[] {
  const index = REQUEST_STATUS_INDEX[String(status || '').toLowerCase()] ?? 0
  return markStages(defs, Math.min(index, defs.length - 1))
}

const STAGE_ACTOR_ALIASES: Record<string, string[]> = {
  issue_receipt_vc: ['trigger_payout', 'release_funds', 'record_payment'],
  record_payment: ['release_funds', 'trigger_payout'],
  present_payment_proof: ['finance_approve_requisition', 'approve_requisition'],
  acknowledge_remittance: ['finance_approve_requisition', 'approve_requisition'],
}

const PLAIN_STEP: Record<string, string> = {
  assign_field_worker: 'Who does the job',
  inspect_site: 'Site check',
  assess_risk: 'Safety check',
  start_job: 'Job started',
  confirm_arrival: 'Arrived on site',
  capture_evidence: 'Photos',
  review_completion: 'Work review',
  acknowledge_execution: 'Sign-off',
  trigger_payout: 'Payment release',
  release_funds: 'Payment release',
  issue_receipt_vc: 'Receipt',
  record_payment: 'Payment',
  finance_approve_requisition: 'Approval',
  approve_requisition: 'Approval',
}

/** A step name a person can read. Unknown internal keys are left out. */
export function plainStepName(stage?: string): string | undefined {
  const key = String(stage || '').trim().toLowerCase()
  if (!key) return undefined
  return PLAIN_STEP[key]
}

export function actorForStage(stages: WorkflowActorStage[] | undefined, stageAction?: string): ResolvedStageActor | undefined {
  if (!stageAction || !stages) return undefined
  const direct = stages.find((stage) => stage.stageAction === stageAction)?.actor
  if (direct) return direct
  for (const alias of STAGE_ACTOR_ALIASES[stageAction] || []) {
    const actor = stages.find((stage) => stage.stageAction === alias)?.actor
    if (actor) return actor
  }
  return undefined
}

export function actorsForWorkflow(reports: WorkflowActorReport[] | undefined, hints: string[]): WorkflowActorStage[] {
  if (!reports?.length) return []
  const normalized = hints.map((hint) => hint.toLowerCase())
  const match = reports.find((report) => {
    const type = String(report.workflowType || '').toLowerCase()
    const id = String(report.templateId || '').toLowerCase()
    return normalized.some((hint) => type.includes(hint) || id.includes(hint) || hint.includes(type))
  })
  return match?.stages || []
}

export function actorModeLabel(mode?: string): string {
  switch (mode) {
    case 'configured_user':
    case 'configured_wallet':
      return 'chosen for this step'
    case 'configured_role':
      return 'by role'
    case 'shared_finance':
      return 'same as purchase requests'
    case 'policy_fallback':
      return 'from the organization fallback'
    case 'role_fallback':
      return 'matched by role'
    case 'owner_fallback':
      return 'falls to the owner — choose someone under Who does what'
    case 'unassigned':
      return 'nobody chosen yet'
    default:
      return 'nobody chosen yet'
  }
}

/** True when the stage still needs an explicit actor (setup item). */
export function actorNeedsAssignment(actor?: Pick<ResolvedStageActor, 'mode'>): boolean {
  return !actor || actor.mode === 'owner_fallback' || actor.mode === 'unassigned'
}

export type StagePerson = { userId: string; role?: string; displayName?: string; phone?: string }

/** Steps the assigned field worker does on their phone; when no one else is chosen, the worker is the actor. */
export const FIELD_WORKER_STAGE_ACTIONS = ['inspect_site', 'assess_risk', 'start_job', 'confirm_arrival', 'capture_evidence']

function roleWords(role?: string): string {
  const key = String(role || '').toLowerCase()
  const map: Record<string, string> = {
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
  return map[key] || key.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'Team member'
}

/** A person's name, never a raw ID. */
export function stagePersonName(userId: string | undefined, people?: StagePerson[]): string | undefined {
  if (!userId) return undefined
  const person = people?.find((p) => p.userId === userId)
  if (!person) return undefined
  const name = String(person.displayName || '').trim()
  if (name && !/^(organization owner|team member)$/i.test(name)) return name
  if (person.phone) return person.phone
  return roleWords(person.role)
}

/**
 * Plain-language "who does this step" line. Falls back to the assigned field worker for
 * worker steps, then to the role, and only says "nobody chosen yet" when the step truly has no one.
 */
export function actorDisplay(
  actor?: ResolvedStageActor,
  options: { people?: StagePerson[]; stageAction?: string; assigneeName?: string } = {},
): string {
  const isWorkerStep = options.stageAction ? FIELD_WORKER_STAGE_ACTIONS.includes(options.stageAction) : false
  if (!actor || actorNeedsAssignment(actor)) {
    if (isWorkerStep && options.assigneeName) return `${options.assigneeName} (assigned field worker)`
    if (!actor) return 'Nobody chosen yet — set under Who does what'
  }
  if (!actor) return 'Nobody chosen yet'
  const name = stagePersonName(actor.userId, options.people)
  if (name) return name === roleWords(actor.role) ? name : `${name} · ${roleWords(actor.role)}`
  if (actor.userId || actor.walletTenantId) return `${roleWords(actor.role)} · ${actorModeLabel(actor.mode)}`
  return `${roleWords(actor.role)} · ${actorModeLabel(actor.mode)}`
}

/** How a step is confirmed, in customer words. */
export function proofWords(proof?: string): string | undefined {
  switch (String(proof || '').toLowerCase()) {
    case 'oidc4vp':
      return 'Confirmed from a wallet'
    case 'oid4vci':
      return 'Sent to a wallet'
    case 'ssi':
      return undefined
    case 'ecocash':
      return 'Paid with EcoCash'
    case 'webhook':
      return 'Confirmed automatically'
    case 'record':
      return undefined
    default:
      return undefined
  }
}
