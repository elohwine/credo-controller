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
  PAYMENT_TRIGGERED: 'Payment released',
  RECEIPT_ISSUED: 'Receipt issued',
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
  await_evidence_receipt: 'Receipts',
  await_completion_review: 'Work review',
  await_acknowledgement: 'Sign-off',
  await_payout_release: 'Payment release',
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
  if (normalized.includes('submitted') || normalized.includes('request created')) {
    return 'Needs your review'
  }
  if (normalized.includes('api post')) {
    if (target === 'payment request') return 'Payment ready'
    if (target === 'field_execution') return 'Field job update'
    if (target === 'requisition') return 'Needs your review'
    if (target === 'invoice') return 'Invoice ready'
    if (target === 'payment') return 'Payment confirmed'
    return 'Needs your review'
  }
  if (normalized.includes('api put') || normalized.includes('api patch')) {
    if (normalized.includes('approve')) return 'Approved'
    if (normalized.includes('reject')) return 'Needs attention'
    if (target === 'field_execution') return 'Field job update'
    return 'Updated'
  }
  if (normalized.includes('requisition')) return 'Needs your review'
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
  if (actionLabel === 'Field job update') return `${contextText}, the field job is ready for the next step.`
  if (actionLabel === 'Updated') return `${contextText}, the request was updated.`
  if (actionLabel === 'Verified') return `${contextText}, the record was verified.`
  if (actionLabel === 'Evidence captured') return `${contextText}, evidence was captured.`
  return `${contextText}, ${actionLabel.toLowerCase()}.`
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
