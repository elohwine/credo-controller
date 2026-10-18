import { fieldStageOutcome } from '../../shared/fieldJobOutcomes'

type ActivityDetails = Record<string, any>

type InboxLikeItem = {
  title?: string
  description?: string
  itemType?: string
  module?: string
  workflowRunId?: string
  workflowRequestId?: string
  workflowStage?: string
  status?: string
  actionLabel?: string
  assignmentRole?: string
  ownerDisplayName?: string
  paymentCode?: string
  invoiceRef?: string
  offerUri?: string
  flowType?: string
  priority?: string
}

const FEPT_STAGES = new Set([
  'DRAFT',
  'REQUEST_CREATED',
  'APPROVAL_PENDING',
  'APPROVED',
  'RELEASE_AUTHORIZED',
  'ASSIGNED',
  'IN_PROGRESS',
  'EVIDENCE_CAPTURED',
  'ACKNOWLEDGED',
  'PAYMENT_TRIGGERED',
  'RECEIPT_ISSUED',
  'RECONCILED',
  'COMPLETED',
  'DISPUTED',
  'CANCELLED',
  'REVOKED',
])

function normalizeActionText(value?: string): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[._-]+/g, ' ')
}

function normalizeStage(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')
}

function extractFeptStage(
  details?: ActivityDetails,
  fallback?: { workflowStep?: string; workflowStage?: string; status?: string; eventType?: string },
): string {
  const merged = {
    ...(details || {}),
    ...(details?.requestSummary && typeof details.requestSummary === 'object' ? details.requestSummary : {}),
    ...(fallback || {}),
  }

  const candidates = [
    merged.workflowStage,
    merged.stage,
    merged.state,
    details?.workflowStage,
    details?.status,
    details?.eventType,
    fallback?.workflowStep,
    fallback?.workflowStage,
    fallback?.status,
    fallback?.eventType,
  ]

  for (const candidate of candidates) {
    const normalized = normalizeStage(candidate)
    if (normalized && FEPT_STAGES.has(normalized)) return normalized
  }

  return ''
}

/**
 * Plain stage names for a field job. Shared by the home, activity, inbox and finance screens
 * and aligned with the portal (`credo-ui/portal/components/finance/financeStages.ts`).
 */
export const FEPT_STAGE_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  REQUEST_CREATED: 'New',
  APPROVAL_PENDING: 'Waiting for approval',
  APPROVED: 'Approved',
  RELEASE_AUTHORIZED: 'Money cleared',
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

export function toFeptStageLabel(stage: string): string {
  const key = normalizeStage(stage)
  return FEPT_STAGE_LABEL[key] || key.toLowerCase().replace(/_/g, ' ')
}

/** What a paused field job is waiting for, in a few words. Same words as the portal job board. */
export const FEPT_WAITING_LABEL: Record<string, string> = {
  await_site_inspection: 'Site inspection',
  await_risk_assessment: 'Worker safety check',
  await_worker_start: 'Worker to start',
  await_arrival: 'Worker arrival',
  await_evidence_before: 'Before photos',
  await_evidence_after: 'After photos',
  await_evidence_receipt: 'Receipts for materials',
  await_completion_review: 'Work review',
  await_acknowledgement: 'Sign-off',
  await_payout_release: 'Worker payout',
}

/**
 * Badge text for a field job. A paused job says what it is waiting for (so "after photos
 * taken" never reads as "waiting for sign-off" while receipts or the review are still due).
 */
export function fieldJobStatusLabel(status: unknown, stage: unknown, pauseReason?: unknown): string {
  const runStatus = String(status || '').toLowerCase()
  const pause = String(pauseReason || '').toLowerCase()
  if (runStatus === 'paused' && FEPT_WAITING_LABEL[pause]) return `Waiting: ${FEPT_WAITING_LABEL[pause]}`
  if (runStatus === 'failed') return 'Needs attention'
  const key = normalizeStage(String(stage || ''))
  if (key) return FEPT_STAGE_LABEL[key] || key.toLowerCase().replace(/_/g, ' ')
  if (runStatus === 'completed') return 'Completed'
  return runStatus || 'In progress'
}

/**
 * Plain status names for an internal requisition (what the badge says), aligned with the portal
 * requisition list and detail. The engine status stays as-is in the data; only the display changes.
 */
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

export function requisitionStatusLabel(status: unknown): string {
  const key = normalizeStage(status)
  if (!key) return 'Unknown'
  return REQUISITION_STATUS_LABEL[key] || toSentenceCase(key.toLowerCase().replace(/_/g, ' '))
}

/** Plain titles for the requisition history ("Audit") entries. */
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
  const key = normalizeStage(eventType)
  if (!key) return 'Update'
  return REQUISITION_EVENT_TITLE[key] || toSentenceCase(key.toLowerCase().replace(/_/g, ' '))
}

/**
 * The one thing that can happen next on a requisition. Portal and mobile show a single
 * primary action for this step (no stacked disabled buttons), with a plain explanation
 * of who confirms it. Mirrors `requisitionNextStep` in credo-ui/portal/components/finance/financeStages.ts.
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

/** The five requisition steps in plain words, in order. Shared by the portal stage table. */
export const REQUISITION_STEPS = [
  { key: 'created', label: 'Requisition created', confirmedBy: 'Automatic', record: 'Requisition record' },
  { key: 'manager', label: 'Manager approval', confirmedBy: 'From wallet', record: 'Manager approval' },
  { key: 'finance', label: 'Finance approval', confirmedBy: 'From wallet', record: 'Finance approval' },
  { key: 'release', label: 'Money released', confirmedBy: 'From wallet', record: 'Release authorisation' },
  { key: 'ack', label: 'Delivery confirmed', confirmedBy: 'From wallet', record: 'Delivery confirmation' },
] as const

function toSentenceCase(value: string): string {
  if (!value) return ''
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function inferDomainTarget(details?: ActivityDetails): string {
  if (!details || typeof details !== 'object') return 'activity'

  const requestSummary =
    details.requestSummary && typeof details.requestSummary === 'object' ? details.requestSummary : {}
  const all = { ...requestSummary, ...details }
  const path = String(all.path || all.route || '').toLowerCase()
  const workflowType = String(all.workflowType || all.templateId || all.workflowId || '').toLowerCase()
  const workflowStage = extractFeptStage(details, { workflowStep: all.workflowStep })
  const ref = String(all.providerRef || all.sourceReference || all.reference || '').toLowerCase()

  if (path.includes('/payment-link') || ref.startsWith('paylink-')) return 'payment request'
  if (
    workflowType.includes('fept') ||
    workflowType.includes('field') ||
    FEPT_STAGES.has(workflowStage) ||
    path.includes('/workflows/runs')
  )
    return 'field_execution'
  if (path.includes('/requis') || String(all.requisitionId || '').trim()) return 'requisition'
  if (String(all.invoiceId || all.invoiceRef || '').trim()) return 'invoice'
  if (String(all.transactionId || all.paymentId || all.paymentReference || '').trim()) return 'payment'
  if (path.includes('/credential') || String(all.credentialType || '').trim()) return 'credential'

  return 'activity'
}

export function getFriendlyActivityActionLabel(
  actionType?: string,
  workflowStep?: string,
  details?: ActivityDetails,
): string {
  const normalized = normalizeActionText(actionType || workflowStep)
  const target = inferDomainTarget(details)
  const feptStage = extractFeptStage(details, {
    workflowStep,
    workflowStage: details?.workflowStage,
    status: details?.status,
    eventType: details?.eventType,
  })

  if (target === 'field_execution' && feptStage) return toFeptStageLabel(feptStage)

  if (!normalized) return 'Activity updated'
  if (normalized.includes('payment settled') || normalized === 'paid') return 'Payment confirmed'
  if (normalized.includes('payment link')) return 'Payment ready'
  if (normalized.includes('receipt issued') || normalized.includes('receipt')) return 'Receipt ready'
  if (normalized.includes('invoice issued') || normalized.includes('invoice')) return 'Invoice ready'
  if (normalized.includes('quote issued') || normalized.includes('quote')) return 'Quote ready'
  if (normalized.includes('approved') || normalized.includes('approval')) return 'Approved'
  if (normalized.includes('reject')) return 'Needs attention'
  // Audit entries are history: a submitted request is reported as sent, not as a task.
  if (normalized.includes('submitted') || normalized.includes('request created')) {
    return target === 'requisition' ? 'Purchase request sent' : 'Request sent'
  }
  if (normalized.includes('api post')) {
    if (target === 'payment request') return 'Payment ready'
    if (target === 'field_execution') return 'Field job update'
    if (target === 'requisition') return 'Purchase request sent'
    if (target === 'invoice') return 'Invoice ready'
    if (target === 'payment') return 'Payment confirmed'
    return 'Request sent'
  }
  if (normalized.includes('api put') || normalized.includes('api patch')) {
    if (normalized.includes('approve')) return 'Approved'
    if (normalized.includes('reject')) return 'Needs attention'
    if (target === 'field_execution') return 'Field job update'
    return 'Updated'
  }
  if (normalized.includes('requisition')) return 'Purchase request updated'
  if (normalized.includes('presentation verified') || normalized.includes('verified')) return 'Verified'
  if (normalized.includes('failed') || normalized.includes('mismatch') || normalized.includes('dispute')) {
    return 'Needs attention'
  }
  if (normalized.includes('credential')) return 'Document ready'
  if (normalized.includes('evidence')) return 'Evidence captured'

  return toSentenceCase(normalized)
}

export function getFriendlyActivitySummary(actionLabel: string, contextText: string, amountText?: string): string {
  if (actionLabel === 'Approved') return `${contextText}, everything is all set.`
  if (actionLabel === 'Needs attention') return `${contextText}, this needs a quick follow-up.`
  if (actionLabel === 'Payment ready') {
    return amountText
      ? `${contextText}, this payment is ready to share for ${amountText}.`
      : `${contextText}, this payment is ready to share.`
  }
  if (actionLabel === 'Payment confirmed') {
    return amountText
      ? `${contextText}, payment has been confirmed for ${amountText}.`
      : `${contextText}, payment has been confirmed.`
  }
  if (actionLabel === 'Invoice ready') return `${contextText}, an invoice is ready for review.`
  if (actionLabel === 'Receipt ready') return `${contextText}, a receipt is ready to save.`
  if (actionLabel === 'Needs your review') return `${contextText}, this needs your review.`
  if (actionLabel === 'Request sent') return `${contextText}, a request was sent.`
  if (actionLabel === 'Purchase request sent') return `${contextText}, a purchase request was sent.`
  if (actionLabel === 'Purchase request updated') return `${contextText}, a purchase request was updated.`
  if (actionLabel === 'Field job update') return `${contextText}, the field job is ready for the next step.`
  if (actionLabel === 'Updated') return `${contextText}, the request was updated.`
  if (actionLabel === 'Verified') return `${contextText}, the record was verified.`
  if (actionLabel === 'Evidence captured') return `${contextText}, evidence was captured.`
  return `${contextText}, ${actionLabel.toLowerCase()}.`
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

export function getInboxDisplayTitle(item: InboxLikeItem): string {
  const rawTitle = String(item.title || '').trim()
  const actionLabel = normalizeActionText(item.actionLabel || item.title)
  const stage = extractFeptStage(
    { workflowStage: item.workflowStage, status: item.status, eventType: item.actionLabel },
    {
      workflowStep: item.actionLabel,
      workflowStage: item.workflowStage,
      status: item.status,
      eventType: item.actionLabel,
    },
  )
  const stageLabel = stage ? toFeptStageLabel(stage) : ''

  if (item.itemType === 'payment_link') return 'Payment ready'
  if (item.itemType === 'invoice_offer') return rawTitle.includes('Invoice') ? rawTitle : 'Invoice ready'
  if (item.itemType === 'receipt_offer') return rawTitle.includes('Receipt') ? rawTitle : 'Receipt ready'
  if (item.itemType === 'credential_offer')
    return rawTitle.includes('Credential') || rawTitle.includes('Offer') ? 'Document ready' : rawTitle
  if (stageLabel) return stageLabel
  if (item.module === 'field' || item.workflowRunId) return stageLabel ? `Job Card · ${stageLabel}` : 'Job Card'
  if (item.module === 'present' || item.itemType === 'workflow' || item.workflowRequestId) {
    if (actionLabel.includes('approve') || actionLabel.includes('review')) return 'Needs your review'
    if (actionLabel.includes('payment')) return 'Payment ready'
    return 'Needs your review'
  }
  if (rawTitle) return rawTitle
  return 'New update'
}

export function getInboxDisplayDescription(item: InboxLikeItem): string {
  const stage = extractFeptStage(
    { workflowStage: item.workflowStage, status: item.status, eventType: item.actionLabel },
    {
      workflowStep: item.actionLabel,
      workflowStage: item.workflowStage,
      status: item.status,
      eventType: item.actionLabel,
    },
  )
  if (item.itemType === 'payment_link') return 'Review the payment details and continue.'
  if (item.itemType === 'invoice_offer') return 'An invoice is ready for you to review.'
  if (item.itemType === 'receipt_offer') return 'Your receipt is ready to save.'
  if (item.itemType === 'credential_offer') return 'A document was shared with you.'
  if (item.description && !/^the latest update is /i.test(item.description.trim())) return item.description
  if (stage) return `The latest update is ${toFeptStageLabel(stage).toLowerCase()}.`
  if (item.module === 'field' || item.workflowRunId) return 'Open this job card and complete the next required step.'
  if (item.module === 'present') return 'Open to share the requested information.'
  if (item.workflowRequestId || item.module === 'approvals') return 'Open to review and respond.'
  if (item.description) return item.description
  return 'Open to see what needs attention.'
}

export function getInboxPrimaryActionLabel(item: InboxLikeItem): string {
  const stage = extractFeptStage(
    { workflowStage: item.workflowStage, status: item.status, eventType: item.actionLabel },
    {
      workflowStep: item.actionLabel,
      workflowStage: item.workflowStage,
      status: item.status,
      eventType: item.actionLabel,
    },
  )
  if (item.itemType === 'payment_link') return 'Pay'
  if (item.itemType === 'invoice_offer') return 'Review'
  if (item.itemType === 'receipt_offer') return 'Save'
  if (stage) return 'Continue'
  if (item.module === 'field' || item.workflowRunId) return 'Open job card'
  if (item.module === 'present' || item.workflowRequestId || item.module === 'approvals') return 'Review'
  return 'Open'
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
      ? 'Keep the quote, invoice and receipt offers from your inbox.'
      : 'Keep the invoice and receipt offers from your inbox.',
    paidTitle: 'Paid',
    paidBody: 'Payment recorded. Check your inbox for the receipt offer and keep it in your records.',
    referenceLabel: 'Payment reference',
    openRecordsLabel: 'Open my inbox',
  }
}

// Job Progress mirrors portal/components/finance/financeStages.ts. Keep the stage
// keys and customer-facing words aligned so website and phone show one history.
export type JobStageStatus = 'done' | 'active' | 'pending' | 'skipped' | 'held'
export type JobStageView = {
  key: string
  label: string
  proof: string
  stageAction?: string
  status: JobStageStatus
  at?: string
  note?: string
}
export type JobStageActor = {
  userId?: string
  walletTenantId?: string
  role: string
  mode: string
}
export type JobActorStage = { stageAction: string; actor?: JobStageActor }
export type JobStagePerson = { userId: string; role?: string; displayName?: string; phone?: string }

const JOB_PROGRESS_STAGES: Array<Omit<JobStageView, 'status'>> = [
  { key: 'REQUEST_CREATED', label: 'Job created', proof: 'Record' },
  { key: 'ASSIGNED', label: 'Assigned', proof: 'SSI', stageAction: 'assign_field_worker' },
  { key: 'IN_PROGRESS', label: 'Job started', proof: 'SSI', stageAction: 'start_job' },
  { key: 'ARRIVAL', label: 'Arrived on site', proof: 'Record', stageAction: 'confirm_arrival' },
  { key: 'SITE_INSPECTION', label: 'Site inspection', proof: 'Record', stageAction: 'inspect_site' },
  { key: 'RISK_ASSESSMENT', label: 'Safety check (field worker)', proof: 'Record', stageAction: 'assess_risk' },
  { key: 'BEFORE_EVIDENCE', label: 'Before photos', proof: 'SSI', stageAction: 'capture_evidence' },
  { key: 'RECEIPTS', label: 'Receipts for materials (or none)', proof: 'OID4VCI', stageAction: 'capture_evidence' },
  { key: 'WORK', label: 'Work in progress', proof: 'Record', stageAction: 'start_job' },
  { key: 'EVIDENCE_CAPTURED', label: 'After photos (work done)', proof: 'SSI', stageAction: 'capture_evidence' },
  { key: 'COMPLETION_REVIEW', label: 'Work review', proof: 'Record', stageAction: 'review_completion' },
  { key: 'ACKNOWLEDGED', label: 'Sign-off', proof: 'OIDC4VP', stageAction: 'acknowledge_execution' },
  { key: 'CLIENT_INVOICE', label: 'Client invoice', proof: 'OID4VCI' },
  {
    key: 'PAYMENT_TRIGGERED',
    label: 'Worker payout (only when the job pays a worker)',
    proof: 'OIDC4VP',
    stageAction: 'trigger_payout',
  },
  { key: 'RECEIPT_ISSUED', label: 'Payout receipt issued', proof: 'OID4VCI', stageAction: 'issue_receipt_vc' },
  { key: 'RECONCILED', label: 'Job closed', proof: 'SSI' },
]

const JOB_ENGINE_ORDER = [
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

function jobEngineIndex(stage?: string): number {
  return JOB_ENGINE_ORDER.indexOf(String(stage || '').toUpperCase())
}

function jobCheckpointDone(output: any, name: string): boolean {
  const status = output?.checkpoints?.[name]?.status
  return status === 'completed' || status === 'waived'
}

export function feptStages(stage?: string, output?: any): JobStageView[] {
  const idx = jobEngineIndex(stage)
  const afterDone = idx >= jobEngineIndex('EVIDENCE_CAPTURED') || Boolean(output?.evidenceAfter?.evidenceHash)
  const beforeDone = Boolean(output?.evidenceBefore?.evidenceHash) || afterDone
  const done: Record<string, boolean> = {
    REQUEST_CREATED: idx >= jobEngineIndex('REQUEST_CREATED'),
    ASSIGNED: idx >= jobEngineIndex('ASSIGNED'),
    IN_PROGRESS: idx >= jobEngineIndex('IN_PROGRESS'),
    ARRIVAL: jobCheckpointDone(output, 'arrival') || beforeDone,
    SITE_INSPECTION: jobCheckpointDone(output, 'site_inspection') || beforeDone,
    RISK_ASSESSMENT: jobCheckpointDone(output, 'risk_assessment') || beforeDone,
    BEFORE_EVIDENCE: beforeDone,
    RECEIPTS: Boolean(output?.evidenceReceipt?.evidenceHash || output?.evidenceReceipt?.skipped) || afterDone,
    WORK: afterDone,
    EVIDENCE_CAPTURED: afterDone,
    COMPLETION_REVIEW: jobCheckpointDone(output, 'completion_review') || idx >= jobEngineIndex('ACKNOWLEDGED'),
    ACKNOWLEDGED: idx >= jobEngineIndex('ACKNOWLEDGED'),
    CLIENT_INVOICE:
      Boolean(output?.startedWorkflows?.['tpl-payment-collection']) || idx >= jobEngineIndex('PAYMENT_TRIGGERED'),
    PAYMENT_TRIGGERED: idx >= jobEngineIndex('PAYMENT_TRIGGERED') || output?.payment?.status === 'not_needed',
    RECEIPT_ISSUED: idx >= jobEngineIndex('RECEIPT_ISSUED') || output?.receipt?.status === 'not_needed',
    RECONCILED: idx >= jobEngineIndex('RECONCILED'),
  }
  let activeAssigned = false
  return JOB_PROGRESS_STAGES.map((item) => {
    const outcome = fieldStageOutcome(item.key, output)
    if (outcome) return { ...item, ...outcome }
    if (done[item.key]) return { ...item, status: 'done' }
    if (!activeAssigned) {
      activeAssigned = true
      return { ...item, status: 'active' }
    }
    return { ...item, status: 'pending' }
  })
}

const JOB_ACTOR_ALIASES: Record<string, string[]> = {
  inspect_site: ['assess_risk'],
  assess_risk: ['inspect_site'],
  trigger_payout: ['release_funds'],
}

export function actorForStage(stages: JobActorStage[] | undefined, stageAction?: string): JobStageActor | undefined {
  if (!stageAction || !stages) return undefined
  const direct = stages.find((item) => item.stageAction === stageAction)?.actor
  if (direct) return direct
  for (const alias of JOB_ACTOR_ALIASES[stageAction] || []) {
    const actor = stages.find((item) => item.stageAction === alias)?.actor
    if (actor) return actor
  }
  return undefined
}

/** Mirrors portal financeStages.ts WorkflowActorReport / actorsForWorkflow (GET /workflows/actors). */
export type WorkflowActorReport = { templateId?: string; workflowType: string; name?: string; stages: JobActorStage[] }

export function actorsForWorkflow(reports: WorkflowActorReport[] | undefined, hints: string[]): JobActorStage[] {
  if (!reports?.length) return []
  const normalized = hints.map((hint) => hint.toLowerCase())
  const match = reports.find((report) => {
    const type = String(report.workflowType || '').toLowerCase()
    const id = String(report.templateId || '').toLowerCase()
    return normalized.some((hint) => type.includes(hint) || id.includes(hint) || hint.includes(type))
  })
  return match?.stages || []
}

export function actorNeedsAssignment(actor?: Pick<JobStageActor, 'mode'>): boolean {
  return !actor || actor.mode === 'owner_fallback' || actor.mode === 'unassigned'
}

const JOB_WORKER_ACTIONS = ['inspect_site', 'assess_risk', 'start_job', 'confirm_arrival', 'capture_evidence']

function jobRoleWords(role?: string): string {
  const key = String(role || '').toLowerCase()
  const words: Record<string, string> = {
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
  return words[key] || key.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'Team member'
}

export function actorDisplay(
  actor?: JobStageActor,
  options: { people?: JobStagePerson[]; stageAction?: string; assigneeName?: string } = {},
): string {
  if (options.stageAction === 'inspect_site' && options.assigneeName) {
    return `${options.assigneeName} (assigned field worker)`
  }
  const workerStep = options.stageAction ? JOB_WORKER_ACTIONS.includes(options.stageAction) : false
  if ((!actor || actorNeedsAssignment(actor)) && workerStep && options.assigneeName) {
    return `${options.assigneeName} (assigned field worker)`
  }
  if (!actor) return 'Nobody chosen yet — set under Who does what'
  const person = options.people?.find((item) => item.userId === actor.userId)
  const name = String(person?.displayName || '').trim()
  const readableName =
    name && !/^(organization owner|team member)$/i.test(name)
      ? name
      : person?.phone || jobRoleWords(person?.role || actor.role)
  return readableName === jobRoleWords(actor.role) ? readableName : `${readableName} · ${jobRoleWords(actor.role)}`
}

export function proofWords(proof?: string): string | undefined {
  switch (String(proof || '').toLowerCase()) {
    case 'oidc4vp':
      return 'Confirmed from a wallet'
    case 'oid4vci':
      return 'Sent to a wallet'
    case 'ecocash':
      return 'Paid with EcoCash'
    case 'webhook':
      return 'Confirmed automatically'
    default:
      return undefined
  }
}

// School fee progress mirrors portal/components/finance/financeStages.ts. One fee is one run; the steps come from the
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

/** First word of a money-in finance line: a school fee link says so, everything else is a sale. */
export function moneyInKindWord(link: { sector?: string } | undefined): string {
  return String(link?.sector || '').toLowerCase() === 'education' ? 'School fee' : 'Sale'
}

/** Words for requests a person raises from Home live with the shared Request catalogue. */
export { requestKindLabel, requestKindLine, requestStatusWords, resendStatusWords } from './requestCatalog'

// ── What a field job step asks of the person, shown before they open the job ───────────────

const FIELD_STEP_EXPLANATION: Record<string, string> = {
  'Choose who does the job': 'Pick the worker who will go to the site. They get the job in their inbox.',
  'Start the job': 'Tell the organisation you are taking the job and heading out. Nothing is charged yet.',
  'Confirm arrival': 'When you reach the site, confirm you are there. Your phone location is saved with the job.',
  'Site check': 'Look over the site and note what you find: access, the state of the area and anything that changes the work.',
  'Safety check': 'List any hazards and say whether it is safe to start. If it is not safe, the job stops until the organisation sorts it out.',
  'Add photos': 'Take the photos the job asks for (before or after the work). Each photo is saved on the phone first, so a bad signal does not lose it.',
  'Add receipts': 'Photograph the receipts for materials you bought so they can be paid back.',
  'Review work': 'Check the photos and notes from the worker and accept the work or send it back.',
  'Sort out the safety hold': 'The worker stopped because the site was not safe. Fix the problem, then mark it resolved so the worker can carry on.',
  'Sign off job': 'Confirm the job is finished so payment can go ahead.',
  'Release worker payout': 'Pay the worker for the finished job.',
  'Release payment': 'Release the payment for the finished job.',
}

/** A plain sentence on what the named step asks the person to do; undefined when there is none. */
export function fieldStepExplanation(stepLabel: string | undefined): string | undefined {
  if (!stepLabel) return undefined
  return FIELD_STEP_EXPLANATION[stepLabel]
}
