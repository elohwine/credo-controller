/**
 * Shared stage catalogs for portal finance workflows.
 *
 * Mirrors the mobile finance detail timelines: each stage carries an SSI proof
 * protocol, the credential it issues, and the configured stage-actor key used
 * by org readiness.
 */

import { fieldStageOutcome } from '../../../shared/fieldJobOutcomes'

export type StageStatus = 'done' | 'active' | 'pending' | 'skipped' | 'held'

export type FinanceStageDef = {
  key: string
  label: string
  proof: string
  vcType: string
  stageAction?: string
}

export type FinanceStageView = FinanceStageDef & {
  status: StageStatus
  /** When this step happened, when the job recorded a time for it. */
  at?: string
  note?: string
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
  {
    key: 'manager',
    label: 'Manager approval',
    proof: 'OIDC4VP',
    vcType: 'ManagerApprovalProof',
    stageAction: 'approve_requisition',
  },
  {
    key: 'finance',
    label: 'Finance approval',
    proof: 'OIDC4VP',
    vcType: 'ApprovalVC',
    stageAction: 'finance_approve_requisition',
  },
  {
    key: 'release',
    label: 'Money released',
    proof: 'OIDC4VP',
    vcType: 'ReleaseAuthorizationVC',
    stageAction: 'release_funds',
  },
  {
    key: 'ack',
    label: 'Delivery confirmed',
    proof: 'OIDC4VP',
    vcType: 'ExecutionAckVC',
    stageAction: 'acknowledge_execution',
  },
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
  const key = String(status ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')
  if (!key) return 'Unknown'
  return REQUISITION_STATUS_LABEL[key] || sentence(key)
}

export function requisitionStatusColor(status: unknown): string {
  const key = String(status ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')
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
  const key = String(eventType ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')
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
  const key = String(status ?? '')
    .trim()
    .toUpperCase()
  switch (key) {
    case 'REQUISITION_CREATED':
      return signMode === 'one'
        ? {
            action: 'approval',
            label: 'Approve this request',
            helper: 'One confirmation from your wallet approves this request.',
          }
        : {
            action: 'approval',
            label: 'Approve as manager',
            helper: 'A manager confirms from their wallet that this request can go ahead.',
          }
    case 'MANAGER_APPROVED':
      return {
        action: 'approval',
        label: 'Approve as finance',
        helper: 'Finance confirms from their wallet that the money is available.',
      }
    case 'APPROVED':
      return {
        action: 'release',
        label: 'Release funds',
        helper: 'Release the money and create the payment link. Confirmed from your wallet.',
      }
    case 'RELEASED':
    case 'PAID':
    case 'RECEIPT_ISSUED':
      return {
        action: 'ack',
        label: 'Confirm delivery',
        helper: 'Confirm the goods or services were received. This closes the requisition.',
      }
    case 'REJECTED':
      return { action: null, label: 'Declined', helper: 'This requisition was declined. Nothing more to do.' }
    case 'CANCELLED':
      return { action: null, label: 'Cancelled', helper: 'This requisition was cancelled. Nothing more to do.' }
    default:
      return { action: null, label: 'Closed', helper: 'All steps are done. Nothing more to do on this requisition.' }
  }
}

/**
 * FEPT timeline. The worker heads out, proves arrival, then the site is checked and the safety
 * check is done, then the photos. `workflowStage` stays ASSIGNED until the worker heads out and
 * IN_PROGRESS through arrival, the checks and the photos, so those milestones come from the run output.
 */
export const FEPT_STAGES: FinanceStageDef[] = [
  { key: 'REQUEST_CREATED', label: 'Job created', proof: 'Record', vcType: 'RequisitionVC' },
  { key: 'ASSIGNED', label: 'Assigned', proof: 'SSI', vcType: 'AssignmentVC', stageAction: 'assign_field_worker' },
  { key: 'IN_PROGRESS', label: 'Job started', proof: 'SSI', vcType: 'ExecutionProofVC', stageAction: 'start_job' },
  { key: 'ARRIVAL', label: 'Arrived on site', proof: 'Record', vcType: 'ArrivalProof', stageAction: 'confirm_arrival' },
  {
    key: 'SITE_INSPECTION',
    label: 'Site inspection',
    proof: 'Record',
    vcType: 'InspectionRecord',
    stageAction: 'inspect_site',
  },
  {
    key: 'RISK_ASSESSMENT',
    label: 'Safety check (field worker)',
    proof: 'Record',
    vcType: 'RiskAssessmentRecord',
    stageAction: 'assess_risk',
  },
  {
    key: 'BEFORE_EVIDENCE',
    label: 'Before photos',
    proof: 'SSI',
    vcType: 'EvidenceBundleVC',
    stageAction: 'capture_evidence',
  },
  {
    key: 'RECEIPTS',
    label: 'Receipts for materials (or none)',
    proof: 'OID4VCI',
    vcType: 'ReceiptVC',
    stageAction: 'capture_evidence',
  },
  { key: 'WORK', label: 'Work in progress', proof: 'Record', vcType: 'WorkLog', stageAction: 'start_job' },
  {
    key: 'EVIDENCE_CAPTURED',
    label: 'After photos (work done)',
    proof: 'SSI',
    vcType: 'EvidenceBundleVC',
    stageAction: 'capture_evidence',
  },
  {
    key: 'COMPLETION_REVIEW',
    label: 'Work review',
    proof: 'Record',
    vcType: 'ReviewRecord',
    stageAction: 'review_completion',
  },
  {
    key: 'ACKNOWLEDGED',
    label: 'Sign-off',
    proof: 'OIDC4VP',
    vcType: 'ExecutionAckVC',
    stageAction: 'acknowledge_execution',
  },
  { key: 'CLIENT_INVOICE', label: 'Client invoice', proof: 'OID4VCI', vcType: 'InvoiceVC' },
  {
    key: 'PAYMENT_TRIGGERED',
    label: 'Worker payout (only when the job pays a worker)',
    proof: 'OIDC4VP',
    vcType: 'PaymentProofVC',
    stageAction: 'trigger_payout',
  },
  {
    key: 'RECEIPT_ISSUED',
    label: 'Payout receipt issued',
    proof: 'OID4VCI',
    vcType: 'ReceiptVC',
    stageAction: 'issue_receipt_vc',
  },
  { key: 'RECONCILED', label: 'Job closed', proof: 'SSI', vcType: 'ReconciliationVC' },
]

export const AP_STAGES: FinanceStageDef[] = [
  { key: 'invoice', label: 'Supplier invoice', proof: 'Record', vcType: 'InvoiceVC' },
  {
    key: 'payment',
    label: 'Payment recorded',
    proof: 'OIDC4VP',
    vcType: 'PaymentProofVC',
    stageAction: 'record_payment',
  },
  {
    key: 'remittance',
    label: 'Remittance acknowledged',
    proof: 'SSI',
    vcType: 'RemittanceAdviceVC',
    stageAction: 'acknowledge_remittance',
  },
  {
    key: 'receipt',
    label: 'Receipt issued',
    proof: 'OID4VCI',
    vcType: 'PaymentReceiptVC',
    stageAction: 'issue_receipt_vc',
  },
]

export const AR_STAGES: FinanceStageDef[] = [
  { key: 'request', label: 'Collection requested', proof: 'Record', vcType: 'CollectionRequestVC' },
  {
    key: 'consent',
    label: 'Consent proof',
    proof: 'OIDC4VP',
    vcType: 'CollectionConsentVC',
    stageAction: 'present_payment_proof',
  },
  {
    key: 'settlement',
    label: 'Settlement recorded',
    proof: 'SSI',
    vcType: 'SettlementVC',
    stageAction: 'record_payment',
  },
  {
    key: 'reconciled',
    label: 'Reconciled',
    proof: 'OID4VCI',
    vcType: 'PaymentReceiptVC',
    stageAction: 'issue_receipt_vc',
  },
]

export const INVOICE_STAGES: FinanceStageDef[] = [
  { key: 'invoice', label: 'Invoice created', proof: 'OID4VCI', vcType: 'InvoiceVC' },
  { key: 'payment', label: 'Payment', proof: 'EcoCash', vcType: 'PaymentProofVC', stageAction: 'record_payment' },
  {
    key: 'confirmed',
    label: 'Payment confirmed',
    proof: 'Webhook',
    vcType: 'PaymentReceiptVC',
    stageAction: 'present_payment_proof',
  },
  {
    key: 'receipt',
    label: 'Receipt VC issued',
    proof: 'OID4VCI',
    vcType: 'SchoolFeeReceiptVC',
    stageAction: 'issue_receipt_vc',
  },
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
  const beforeDone = Boolean(output?.evidenceBefore?.evidenceHash) || afterDone
  const done: Record<string, boolean> = {
    REQUEST_CREATED: idx >= engineIndex('REQUEST_CREATED'),
    ASSIGNED: idx >= engineIndex('ASSIGNED'),
    IN_PROGRESS: started,
    ARRIVAL: checkpointDone(output, 'arrival') || beforeDone,
    // Photos already taken means the on-site checks happened. Heading out does not.
    SITE_INSPECTION: checkpointDone(output, 'site_inspection') || beforeDone,
    RISK_ASSESSMENT: checkpointDone(output, 'risk_assessment') || beforeDone,
    BEFORE_EVIDENCE: Boolean(output?.evidenceBefore?.evidenceHash) || afterDone,
    // Receipts for materials bought during the job (or "none bought") come before the work.
    RECEIPTS: Boolean(output?.evidenceReceipt?.evidenceHash || output?.evidenceReceipt?.skipped) || afterDone,
    // The work happens between the BEFORE and AFTER checkpoints; it ends when AFTER evidence is captured.
    WORK: afterDone,
    COMPLETION_REVIEW: checkpointDone(output, 'completion_review') || idx >= engineIndex('ACKNOWLEDGED'),
    EVIDENCE_CAPTURED: afterDone,
    // The client is invoiced at sign-off; a job with no client or no payment setup has no invoice.
    CLIENT_INVOICE:
      Boolean(output?.startedWorkflows?.['tpl-payment-collection']) || idx >= engineIndex('PAYMENT_TRIGGERED'),
    // The worker payout only exists when the job pays a worker; otherwise it is passed over.
    PAYMENT_TRIGGERED: idx >= engineIndex('PAYMENT_TRIGGERED') || output?.payment?.status === 'not_needed',
    RECEIPT_ISSUED: idx >= engineIndex('RECEIPT_ISSUED') || output?.receipt?.status === 'not_needed',
  }
  let activeAssigned = false
  return FEPT_STAGES.map((item) => {
    const outcome = fieldStageOutcome(item.key, output)
    if (outcome) return { ...item, ...outcome }
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
  await_evidence_concealed: 'Photo before work is covered',
  await_evidence_after: 'After photos',
  await_evidence_receipt: 'Receipts for materials',
  await_completion_review: 'Work review',
  await_acknowledgement: 'Sign-off',
  await_payout_release: 'Worker payout',
}

/** Plain stage names for a field job, aligned with the mobile Jobs tab. */
export const JOB_STAGE_LABEL: Record<string, string> = {
  REQUEST_CREATED: 'New',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In progress',
  EVIDENCE_CAPTURED: 'Waiting for sign-off',
  ACKNOWLEDGED: 'Signed off',
  PAYMENT_TRIGGERED: 'Worker paid',
  RECEIPT_ISSUED: 'Payout receipt issued',
  RECONCILED: 'Closed',
  COMPLETED: 'Completed',
  DISPUTED: 'Under review',
  CANCELLED: 'Cancelled',
  REVOKED: 'Cancelled',
}

/** Badge colour for a job; shared by the job board and the job detail drawer. */
export function jobStatusColor(status: string, stage?: string): string {
  if (stage === 'RECONCILED' || status === 'completed') return 'green'
  if (status === 'failed') return 'red'
  if (status === 'paused') return 'orange' // waiting on a person
  if (status === 'running') return 'blue'
  return 'gray'
}

/** Plain-language job status; shared by the job board and the job detail drawer. */
export function jobStatusLabel(status: string, stage?: string, pauseReason?: string): string {
  if (status === 'paused' && pauseReason && JOB_WAITING_LABEL[pauseReason])
    return `Waiting: ${JOB_WAITING_LABEL[pauseReason]}`
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
  resolve_safety_hold: 'Safety hold',
  acknowledge_execution: 'Sign-off',
  trigger_payout: 'Worker payout',
  release_funds: 'Payment release',
  issue_receipt_vc: 'Receipt',
  record_payment: 'Payment',
  finance_approve_requisition: 'Approval',
  approve_requisition: 'Approval',
}

/** A step name a person can read. Unknown internal keys are left out. */
export function plainStepName(stage?: string): string | undefined {
  const key = String(stage || '')
    .trim()
    .toLowerCase()
  if (!key) return undefined
  return PLAIN_STEP[key]
}

export function actorForStage(
  stages: WorkflowActorStage[] | undefined,
  stageAction?: string,
): ResolvedStageActor | undefined {
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
export const FIELD_WORKER_STAGE_ACTIONS = [
  'inspect_site',
  'assess_risk',
  'start_job',
  'confirm_arrival',
  'capture_evidence',
]

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
  if (options.stageAction === 'inspect_site' && options.assigneeName) {
    return `${options.assigneeName} (assigned field worker)`
  }
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

// ── The step a person must do on an inbox item, in plain words ──────────────────────────────
// Keep this block identical in credo-ui/mobile/lib/uxCopy.ts and
// credo-ui/portal/components/finance/financeStages.ts.

/** Keys stored on stage cards, approvals and payment tasks → the step the person must do. */
const STEP_REQUIRED_LABEL: Record<string, string> = {
  assign_field_worker: 'Choose who does the job',
  inspect_site: 'Site check',
  assess_risk: 'Safety check',
  start_job: 'Start the job',
  confirm_arrival: 'Confirm arrival',
  capture_evidence: 'Add photos',
  review_completion: 'Review work',
  resolve_safety_hold: 'Sort out the safety hold',
  acknowledge_execution: 'Sign off job',
  trigger_payout: 'Release worker payout',
  release_funds: 'Release payment',
  approve_payment: 'Approve payment',
  record_payment: 'Record payment',
  acknowledge_remittance: 'Confirm payment received',
  issue_receipt_vc: 'Issue receipt',
  present_payment_proof: 'Share payment proof',
  finance_approve_requisition: 'Approve request',
  approve_requisition: 'Approve request',
  approve_request: 'Decide on this request',
  approve: 'Approve request',
  review: 'Review',
}

/** Field job stage → what the person holding the card does next. */
const STEP_REQUIRED_BY_STAGE: Record<string, string> = {
  REQUEST_CREATED: 'Start the job',
  ASSIGNED: 'Start the job',
  IN_PROGRESS: 'Add photos',
  EVIDENCE_CAPTURED: 'Sign off job',
  COMPLETION_REVIEW: 'Review work',
  ACKNOWLEDGED: 'Release payment',
}

/** A paused field job names the step it is actually waiting on, ahead of the coarse stage. */
const STEP_REQUIRED_BY_PAUSE: Record<string, string> = {
  await_worker_start: 'Start the job',
  await_arrival: 'Confirm arrival',
  await_site_inspection: 'Site check',
  await_risk_assessment: 'Safety check',
  await_evidence_before: 'Add photos',
  await_evidence_concealed: 'Add in-progress photo',
  await_evidence_after: 'Add photos',
  await_evidence_receipt: 'Add receipts',
  await_completion_review: 'Review work',
  await_acknowledgement: 'Sign off job',
  await_payout_release: 'Release worker payout',
}

export interface StepRequiredInput {
  stageAction?: string
  requiredAction?: string
  workflowStage?: string
  /** Why a field job is paused, when the stage name is too coarse (for example in progress). */
  pauseReason?: string
  itemType?: string
  sourceType?: string
  module?: string
  platformRequestId?: string
  workflowRequestId?: string
}

export interface OfferReplacementNote {
  /** Short badge, e.g. "Replaces your current card". */
  label: string
  /** Why it arrived, in plain words. */
  note: string
}

/**
 * Why a person received a card they seem to already hold. Read from the offer's stored
 * `replaces` block so a re-issued staff card, delegation or step card never looks like a
 * duplicate. Same words on the phone and the website.
 */
export function offerReplacement(claims: unknown): OfferReplacementNote | undefined {
  const replaces = (claims as { replaces?: { why?: unknown; note?: unknown } } | null | undefined)?.replaces
  if (!replaces || typeof replaces !== 'object') return undefined
  const why = String(replaces.why || '')
  const note = String(replaces.note || '').trim()
  const label =
    why === 'sent_again'
      ? 'Sent again'
      : why === 'role_changed'
        ? 'Replaces your current card: role changed'
        : why === 'steps_changed'
          ? 'Replaces your current card: steps changed'
          : why === 'disclosure'
            ? 'Replaces your current card: shares one step'
            : 'Replaces your current card'
  return { label, note: note || 'This replaces the one you already hold. Accept it to keep using it.' }
}

/** The line above a share: the step, and the job or amount when the screen already has them. */
export function sharePurposeLine(input: {
  mode?: string
  purpose?: string
  reference?: string
  amount?: string
  currency?: string
}): string {
  const given = String(input.purpose || '').trim()
  if (given) return given
  const mode = String(input.mode || '').trim()
  const step =
    mode === 'field-payout' || mode === 'payout'
      ? 'Release worker payout'
      : mode === 'field-signoff' || mode === 'acknowledgement'
        ? 'Sign off this job'
        : mode === 'requisition-approve' || mode === 'approve-requisition'
          ? 'Approve this request'
          : mode === 'requisition-release'
            ? 'Release the money'
            : mode === 'requisition-ack'
              ? 'Acknowledge this request'
              : mode === 'ap-workflow-transition'
                ? 'Confirm this supplier bill'
                : mode === 'ar-collection-consent'
                  ? 'Agree to this collection'
                  : ''
  const reference = String(input.reference || '').trim()
  const human = reference && !/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(reference) ? `Job ${reference}` : ''
  const amount = String(input.amount || '').trim()
  const money = amount ? `${String(input.currency || '').trim()} ${amount}`.trim() : ''
  return [step, human, money].filter(Boolean).join(' · ')
}

/**
 * "Your step: …" for an inbox card. Reads the stored step key first, then the kind of item.
 * Returns undefined when there is nothing for the person to do beyond opening it.
 */
export function stepRequiredLabel(input: StepRequiredInput): string | undefined {
  const key = String(input.stageAction || input.requiredAction || '')
    .trim()
    .toLowerCase()
  const stage = String(input.workflowStage || '')
    .trim()
    .toUpperCase()
  // A job already given to a worker is waiting for them to begin, not for someone to pick a worker.
  if (stage === 'ASSIGNED' && (!key || key === 'assign_field_worker' || key === 'start_job')) return 'Start the job'
  if (key) {
    if (STEP_REQUIRED_LABEL[key]) return STEP_REQUIRED_LABEL[key]
    const words = key.replace(/[_-]+/g, ' ').trim()
    if (words && !/[0-9a-f]{8}-[0-9a-f]{4}/i.test(words)) return words.charAt(0).toUpperCase() + words.slice(1)
  }
  const pause = String(input.pauseReason || '')
    .trim()
    .toLowerCase()
  if (pause && STEP_REQUIRED_BY_PAUSE[pause]) return STEP_REQUIRED_BY_PAUSE[pause]
  const itemType = String(input.itemType || '').toLowerCase()
  if (input.sourceType === 'workflow_vc_offer') return 'Keep the record'
  if (itemType === 'credential_offer') return 'Accept card'
  if (itemType === 'receipt_offer') return 'Save receipt'
  if (itemType === 'payment_link') return 'Pay'
  if (itemType === 'invoice_offer') return 'Review invoice'
  if (itemType === 'ar_collection') return 'Share payment proof'
  const module = String(input.module || '').toLowerCase()
  if (module === 'present') return 'Share proof'
  if (stage && STEP_REQUIRED_BY_STAGE[stage]) return STEP_REQUIRED_BY_STAGE[stage]
  if (module === 'approvals' || input.platformRequestId || input.workflowRequestId) return 'Approve or decline'
  return undefined
}

// ── Safety holds (a worker's stop-work call), in plain words ───────────────────────────────
// Keep this block identical in credo-ui/mobile/lib/uxCopy.ts and
// credo-ui/portal/components/finance/financeStages.ts.

export type SafetyHoldState = 'open' | 'resolved' | 'cleared' | 'reassigned'

/** Who is reading the hold: the worker who raised it, or someone at the organisation. */
export type SafetyHoldViewer = 'worker' | 'org'

export const SAFETY_HOLD_COPY = {
  /** Shown after the worker puts the job on hold. Not an error: the hold was saved. */
  savedTitle: 'Job on hold',
  savedMessage:
    'Your organisation has been told. You will get a message when the issue is sorted; then redo the safety check.',
  /** Section title on the job screen. */
  sectionTitle: 'Safety hold',
  /** Helper text under the organisation's resolve form. */
  resolveHelp:
    'Say what was done about the issue. The worker is told and must redo the safety check before any work; nobody at the office passes it for them.',
  resolveButton: 'Mark the issue resolved',
  resolveNoteLabel: 'What was done',
  /** Worker's primary button while a hold is live. */
  redoButton: 'Redo the safety check',
  /** Safety modal choice labels. */
  choiceSafe: 'Safe to start',
  choiceNotSafe: 'Not safe - hold the job',
  hazardsLabel: 'What hazards did you find?',
  hazardsHelp: 'List each hazard on a separate line, including hazards you can control. Leave empty if none.',
  reasonLabel: 'What prevents you working safely?',
  reasonHelp:
    'Explain what is missing or uncontrolled, and what needs to change. You do not need to repeat the hazards above.',
  reasonPlaceholder: 'For example: no suitable fall protection is available for work at height',
  photoLabel: 'Photo of what makes it unsafe',
  whatChangedLabel: 'What changed since the hold?',
  submitSafe: 'Save safety check',
  submitHold: 'Put the job on hold',
  /** Who fixes the problem: chosen by the worker when putting the job on hold. */
  fixByLabel: 'Who needs to fix it?',
  fixByOrganisation: 'My organisation must fix it',
  fixByWorker: 'I can fix it on site',
  fixByHelp:
    'Choose "My organisation" if you need equipment, people or a decision before work can start. Choose "on site" if you can make it safe yourself; your organisation is still told.',
  savedMessageWorker: 'Your organisation has been told. Fix the problem, then redo the safety check.',
  /** Worker's button while the organisation still has to fix the problem. */
  waitingButton: 'Waiting for your organisation',
  waitingHelp: 'You can redo the safety check once your organisation marks the issue resolved. You will get a message.',
  /** Shown on the organisation's inbox card. */
  inboxResolveHelp:
    'Sort the issue out first (on site or off app), then say what was done. The worker is told to redo the safety check.',
} as const

export type SafetyHoldFixBy = 'organisation' | 'worker'

/** "1st hold on this job", "2nd hold on this job", … */
export function holdCountWords(count: number): string {
  const n = Math.max(1, Math.floor(Number(count) || 1))
  const suffix =
    n % 100 >= 11 && n % 100 <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'
  return `${n}${suffix} hold on this job`
}

/** Badge and one-line state for a hold, from either side of it. */
export function safetyHoldStateWords(
  state: SafetyHoldState,
  viewer: SafetyHoldViewer,
  names: { by?: string; resolvedBy?: string; fixBy?: SafetyHoldFixBy } = {},
): { label: string; color: string; line: string } {
  const resolver = names.resolvedBy ? names.resolvedBy : 'your organisation'
  switch (state) {
    case 'open':
      if (names.fixBy === 'worker') {
        return {
          label: 'Fixing on site',
          color: 'orange',
          line:
            viewer === 'worker'
              ? 'You said you can fix this on site. When it is fixed, redo the safety check.'
              : `The worker${names.by ? ` (${names.by})` : ''} is fixing this on site and will redo the safety check. You can also mark it resolved.`,
        }
      }
      return {
        label: 'Open',
        color: 'orange',
        line:
          viewer === 'worker'
            ? 'Waiting for your organisation to sort the issue out.'
            : `Waiting for the organisation to sort the issue out${names.by ? ` (raised by ${names.by})` : ''}.`,
      }
    case 'resolved':
      return {
        label: 'Issue sorted',
        color: 'blue',
        line:
          viewer === 'worker'
            ? `${resolver.charAt(0).toUpperCase()}${resolver.slice(1)} says the issue is sorted. Redo the safety check before any work.`
            : `Marked resolved${names.resolvedBy ? ` by ${names.resolvedBy}` : ''}. Waiting for the worker to redo the safety check.`,
      }
    case 'reassigned':
      return { label: 'Ended', color: 'gray', line: 'The job moved to another worker while this was open.' }
    default:
      return { label: 'Cleared', color: 'gray', line: 'A later safety check passed and cleared this hold.' }
  }
}

// ── Where a request sits in its family (job, purchase, bill, payment) ─────────────────────
// Keep this block identical in credo-ui/mobile/lib/uxCopy.ts and
// credo-ui/portal/components/finance/financeStages.ts.

export interface WorkFamilyMember {
  kind?: 'job' | 'request'
  id?: string
  label: string
  reference?: string
  title?: string
  status?: string
  statusLabel: 'Done' | 'Waiting' | 'Next' | 'Declined' | string
  current?: boolean
}

export interface WorkFamily {
  root?: WorkFamilyMember
  parent?: WorkFamilyMember
  chain?: WorkFamilyMember[]
  partOfLine?: string
  fromLabel?: string
  holdLine?: string
  inboxLine?: string
}

/** Dimmed line under a list title: "Part of job FR-… · title". */
export function relatedWorkLine(family?: WorkFamily | null): string | undefined {
  const line = String(family?.partOfLine || '').trim()
  return line || undefined
}

/** Nodes for the "Where this fits" strip, oldest first. */
export function familyChain(family?: WorkFamily | null): WorkFamilyMember[] {
  return Array.isArray(family?.chain) ? family.chain : []
}

/**
 * Which job tab a purchase belongs on. A finished purchase opens Receipts.
 * One still in progress opens the job details, where the job says what it is waiting for.
 */
export function familyJobStage(family?: WorkFamily | null): 'details' | 'receipts' {
  const current = (family?.chain || []).find((member) => member.current)
  const done = current?.statusLabel === 'Done' || current?.status === 'completed'
  return done ? 'receipts' : 'details'
}

type HandoffStepLike = { requestId?: string; label?: string; status?: string; statusLabel?: string }
type HandoffLike = {
  label?: string
  status?: string
  holdParent?: boolean
  childId?: string
  steps?: HandoffStepLike[]
  result?: { receipts?: Array<{ receiptRef?: string }> }
}

/**
 * "Purchase request RCT-… (bought, receipt in)" for a job that is waiting on a child.
 * Undefined when nothing is holding the job.
 */
export function handoffWaitingLine(handoffs: unknown): { line: string; requestId?: string } | undefined {
  const list = Array.isArray(handoffs) ? (handoffs as HandoffLike[]) : []
  const held = list.find((item) => item && item.status === 'running' && item.holdParent !== false)
  if (!held) return undefined
  const steps = Array.isArray(held.steps) ? held.steps : []
  const step =
    [...steps].reverse().find((item) => item && item.status && item.status !== 'completed') || steps[steps.length - 1]
  const label = String(step?.label || held.label || 'Related work').trim()
  const receipt = String(held.result?.receipts?.[0]?.receiptRef || '').trim()
  const status = String(step?.statusLabel || '').trim()
  const detail = status ? ` (${status.toLowerCase()})` : ''
  const line = `${label}${receipt ? ` ${receipt}` : ''}${detail}`.replace(/\s+/g, ' ').trim()
  const requestId = String(
    step?.requestId || (String(held.childId || '').startsWith('pending:') ? '' : held.childId) || '',
  ).trim()
  return { line, requestId: requestId || undefined }
}

export interface ClientPayCopy {
  title: string
  payLabel: string
  canDecline: boolean
  declineLabel: string
  declinedTitle: string
  declinedBody: string
  phoneLabel: string
  phoneHelp: string
  keepLabel: string
  keepHelp: string
  paidTitle: string
  paidBody: string
  referenceLabel: string
  openRecordsLabel: string
}

/** Words on the client pay page (/pay/{code}); the same on the website and the phone. */
export function clientPayCopy(kind?: string): ClientPayCopy {
  const quote = kind === 'quote'
  return {
    title: quote ? 'Your quote' : 'Pay your bill',
    payLabel: quote ? 'Accept and pay' : 'Pay',
    canDecline: quote,
    declineLabel: 'Decline quote',
    declinedTitle: 'Quote declined',
    declinedBody: 'We have told the business. Nothing was charged.',
    phoneLabel: 'Your mobile number',
    phoneHelp: 'The payment prompt goes to this number.',
    keepLabel: 'Keep the invoice and receipt on my phone',
    keepHelp: quote
      ? 'The quote, the invoice and the receipt are saved in your records.'
      : 'The invoice and the receipt are saved in your records.',
    paidTitle: 'Paid',
    paidBody: 'Thank you. Your receipt is in your records.',
    referenceLabel: 'Payment reference',
    openRecordsLabel: 'Open my records',
  }
}

// School fee progress mirrors mobile/lib/uxCopy.ts. One fee is one run; the steps come from the
// run state (state.clientBill, state.payment), never from a request status.
export type SchoolFeeStepStatus = 'done' | 'active' | 'pending'
export interface SchoolFeeStep {
  key: 'FEE_SET' | 'LINK_SENT' | 'PAID' | 'RECEIPT'
  label: string
  status: SchoolFeeStepStatus
  at?: string
  /** Who did the step when it was not a staff member (the parent pays). */
  by?: string
}
export interface SchoolFeeRunLike {
  workflowId?: string
  status?: string
  input?: any
  output?: any
  actionsSnapshot?: any
}

export function isSchoolFeeRun(run: SchoolFeeRunLike | undefined): boolean {
  if (!run) return false
  const steps = Array.isArray(run.actionsSnapshot) ? run.actionsSnapshot : []
  if (steps.some((step: any) => step?.config?.transactionType === 'fee_assessment')) return true
  return /education|school/i.test(String(run.workflowId || '')) && Boolean(run.input?.studentName)
}

export function schoolFeeProgress(run: SchoolFeeRunLike): SchoolFeeStep[] {
  const output = run.output || {}
  const bill = output.clientBill || {}
  const instalments = Number(bill.instalments || 1)
  const paid = bill.status === 'paid' || output.payment?.status === 'completed'
  const sent = bill.status === 'sent' || paid
  const receipt = Boolean(output.issuedCredentials?.SchoolFeeReceiptVC) || run.status === 'completed'
  const steps: Array<Omit<SchoolFeeStep, 'status'> & { done: boolean }> = [
    { key: 'FEE_SET', label: 'Fee set', done: run.status !== 'failed' || Boolean(output.finance) },
    {
      key: 'LINK_SENT',
      label:
        bill.status === 'not_sent'
          ? `Pay link not sent: ${bill.reason || 'no parent phone'}`
          : 'Pay link sent to parent',
      done: sent,
      at: bill.sentAt,
    },
    {
      key: 'PAID',
      label: instalments > 1 ? `First instalment paid (1 of ${instalments})` : 'Paid',
      done: paid,
      at: bill.paidAt,
      by: String(run.input?.payerName || '').trim() ? `${String(run.input.payerName).trim()} (parent)` : 'The parent',
    },
    {
      key: 'RECEIPT',
      label: 'Receipt kept',
      done: receipt,
      at: output.issuedCredentials?.SchoolFeeReceiptVC?.issuedAt,
    },
  ]
  let activeAssigned = false
  return steps.map(({ done, ...step }) => {
    if (done) return { ...step, status: 'done' as const }
    if (!activeAssigned) {
      activeAssigned = true
      return { ...step, status: 'active' as const }
    }
    return { ...step, status: 'pending' as const }
  })
}

export function schoolFeeStatusWords(run: SchoolFeeRunLike): { label: string; color: string } {
  const status = String(run.status || '').toLowerCase()
  const bill = run.output?.clientBill || {}
  if (status === 'completed') return { label: 'Paid', color: 'green' }
  if (status === 'failed') return { label: 'Needs attention', color: 'red' }
  if (status === 'cancelled') return { label: 'Cancelled', color: 'gray' }
  if (bill.status === 'not_sent') return { label: 'Pay link not sent', color: 'orange' }
  if (status === 'paused' && bill.status === 'sent') return { label: 'Waiting for the parent to pay', color: 'blue' }
  return { label: 'Setting up', color: 'gray' }
}

export function schoolFeeTitle(run: SchoolFeeRunLike): string {
  const input = run.input || {}
  const who = String(input.studentName || 'Student').trim()
  const term = String(input.term || '').trim()
  return term ? `${who} · ${term}` : who
}

export const SCHOOL_FEE_HELP = {
  title: 'School fee progress',
  points: [
    'The pay link goes to the parent phone on the fee.',
    'The parent pays from the link; instalments follow the payment plan.',
    'The receipt is kept once the payment is in. The person named for that step gets it in their inbox.',
  ],
}

const SCHOOL_FEE_PROOF: Record<SchoolFeeStep['key'], string> = {
  FEE_SET: 'Record',
  LINK_SENT: 'Pay link',
  PAID: 'Payment',
  RECEIPT: 'Receipt',
}

/** School fee steps in the shared Progress list. The receipt step is the staff step from Who does what. */
export function schoolFeeStages(run: SchoolFeeRunLike) {
  return schoolFeeProgress(run).map((step) => ({
    key: step.key,
    label: step.label,
    proof: SCHOOL_FEE_PROOF[step.key],
    vcType: step.key === 'RECEIPT' ? 'SchoolFeeReceiptVC' : '',
    stageAction: step.key === 'RECEIPT' ? 'issue_receipt_vc' : undefined,
    status: step.status,
    at: step.at,
  }))
}

/** Who did a school fee step when it was not staff: the parent pays. */
export function schoolFeeWhoDid(run: SchoolFeeRunLike): Record<string, string> {
  const out: Record<string, string> = {}
  for (const step of schoolFeeProgress(run)) if (step.by) out[step.key] = step.by
  return out
}

/** The pay link and payment plan a school fee made, for the Related work strip. */
export function schoolFeeRelated(run: SchoolFeeRunLike): Array<{ kind: 'pay_link' | 'payment_plan'; id: string; label: string }> {
  const bill = run.output?.clientBill || {}
  const out: Array<{ kind: 'pay_link' | 'payment_plan'; id: string; label: string }> = []
  if (typeof bill.linkId === 'string' && bill.linkId) out.push({ kind: 'pay_link', id: bill.linkId, label: 'Pay link' })
  if (typeof bill.planId === 'string' && bill.planId) out.push({ kind: 'payment_plan', id: bill.planId, label: 'Payment plan' })
  return out
}

/** First word of a money-in finance line: a school fee link says so, everything else is a sale. */
export function moneyInKindWord(link: { sector?: string } | undefined): string {
  return String(link?.sector || '').toLowerCase() === 'education' ? 'School fee' : 'Sale'
}

/** Words for requests a person raises from Home live with the shared Request catalogue. */
export { requestKindLabel, requestKindLine, requestStatusWords, resendStatusWords } from '../../lib/requestCatalog'
