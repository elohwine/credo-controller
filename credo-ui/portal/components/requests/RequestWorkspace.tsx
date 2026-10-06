import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import Link from 'next/link'
import { useRouter } from 'next/router'
import {
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Group,
  Modal,
  Paper,
  SimpleGrid,
  Select,
  Stack,
  Tabs,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core'
import { IconActivity, IconAlertCircle, IconArrowRight, IconChevronRight, IconInbox, IconListDetails, IconReceipt, IconRefresh, IconShieldCheck, IconUsers } from '@tabler/icons-react'
import {
  getOrgScopedToken,
  getPersonalToken,
  isActingAsOrganization,
  organizationNameFor,
  readActiveOrganization,
  switchOrganizationContext,
} from '@/utils/organizationContext'
import { openOrgSwitcher } from '@/lib/portalContext'
import { notifications } from '@mantine/notifications'
import BottomSheet from '@/components/shared/BottomSheet'
import { DetailStatusCard, type DetailTimelineItem, WorkflowDetailBody, type WorkflowDetailSection } from '@/components/finance/WorkflowDetailBody'
import { StageActorTimeline } from '@/components/finance/StageActorTimeline'
import {
  actorsForWorkflow,
  AP_STAGES,
  AR_STAGES,
  fieldRequestStages,
  INVOICE_STAGES,
  REQUISITION_STAGES,
  actorDisplay,
  actorNeedsAssignment,
  actorForStage,
  requestStages,
  requisitionStages,
  feptStages,
  type FinanceStageView,
  type StagePerson,
  type WorkflowActorReport,
} from '@/components/finance/financeStages'

export type PortalRequestStatus =
  | 'draft'
  | 'submitted'
  | 'in_review'
  | 'approved'
  | 'rejected'
  | 'in_fulfilment'
  | 'completed'
  | 'cancelled'

interface RequestRow {
  id: string
  request_type?: string
  requestType?: string
  title?: string
  description?: string
  amount?: number
  currency?: string
  priority?: 'low' | 'normal' | 'high' | 'urgent' | string
  status?: PortalRequestStatus | string
  created_at?: string
  createdAt?: string
  updated_at?: string
  updatedAt?: string
  submitted_at?: string
  submittedAt?: string
  context_json?: string
  __source?: 'platform' | 'workflow_request'
  workflowRequestId?: string
  workflowRequestContext?: 'personal' | 'org'
}

interface RequestListResponse {
  items: RequestRow[]
  nextCursor: string | null
}

interface RequestWorkspaceProps {
  mode: 'inbox' | 'requests'
}

interface OrganizationWorkflowTemplate {
  id: string
  workflowType?: string
  requestType?: string
  enabled?: boolean
}

interface OrganizationWorkflowsResponse {
  templates?: OrganizationWorkflowTemplate[]
}

type OrgSwitchPurpose = 'job' | 'requisition' | 'payable' | 'collection' | 'request'

/** Same copy as the app inbox's switch step (credo-ui/mobile/pages/inbox.tsx ORG_SWITCH_COPY). */
const ORG_SWITCH_COPY: Record<OrgSwitchPurpose, { banner: string; action: string }> = {
  job: { banner: 'This job belongs to an organization you work with.', action: 'open this job' },
  requisition: { banner: 'This approval is for an organization you work with.', action: 'open this request' },
  payable: { banner: 'This payment is for an organization you work with.', action: 'open this payment' },
  collection: { banner: 'This collection is for an organization you work with.', action: 'open this collection' },
  request: { banner: 'This item is for an organization you work with.', action: 'open it' },
}

interface WorkflowRequestApiRow {
  id: string
  /** Organization the request belongs to; acting on it needs that organization's session. */
  targetOrgTenantId?: string
  requestType?: string
  workflowType?: string
  payload?: Record<string, unknown>
  status?: string
  createdAt?: string
  updatedAt?: string
}

interface FinanceRequisitionRow {
  id: string
  amount?: number
  currency?: string
  status?: string
  department?: string
  createdAt?: string
  updatedAt?: string
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'in_review', label: 'Under review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'in_fulfilment', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

type RequestCategoryTab = 'all' | 'school_fees' | 'fept' | 'requisitions' | 'rtc'

function normalizeStatus(value?: string): PortalRequestStatus | string {
  return value || 'draft'
}

function normalizeRequestType(row: RequestRow): string {
  return row.requestType || row.request_type || 'request'
}

function normalizeRequestTypeForFilter(value: string): string {
  return String(value || '').trim().toLowerCase()
}

function matchesRequestTypeFilter(row: RequestRow, requestTypeFilter: string): boolean {
  if (requestTypeFilter === 'all') return true

  const requestType = normalizeRequestTypeForFilter(normalizeRequestType(row))
  switch (requestTypeFilter) {
    case 'payment':
      return requestType.includes('payment') || requestType.includes('invoice') || requestType.includes('cash') || requestType.includes('ecommerce')
    case 'requisition':
      return requestType.includes('requis') || requestType.includes('procurement')
    case 'onboarding':
      return requestType.includes('onboard')
    case 'supplier_verification':
      return requestType.includes('supplier') || requestType.includes('verification')
    default:
      return requestType.includes(requestTypeFilter)
  }
}

function isRequisitionLikeRequest(row: RequestRow): boolean {
  const requestType = normalizeRequestTypeForFilter(normalizeRequestType(row))
  const context = parseRequestContext(row)
  return requestType.includes('requis') || requestType.includes('procurement') || Boolean((context as any).requisitionId)
}

function isSchoolFeesLikeRequest(row: RequestRow): boolean {
  const requestType = normalizeRequestTypeForFilter(normalizeRequestType(row))
  const routing = getWorkflowRequestRouting(row)
  const workflowType = normalizeRequestTypeForFilter(routing.workflowType)
  return (
    requestType.includes('school')
    || requestType.includes('education')
    || requestType.includes('fees')
    || workflowType.includes('school')
    || workflowType.includes('education')
    || workflowType.includes('tpl-education')
  )
}

function isFeptLikeRequest(row: RequestRow): boolean {
  const requestType = normalizeRequestTypeForFilter(normalizeRequestType(row))
  const routing = getWorkflowRequestRouting(row)
  const workflowType = normalizeRequestTypeForFilter(routing.workflowType)
  return (
    routing.mode === 'field'
    || requestType.includes('field')
    || requestType.includes('fept')
    || workflowType.includes('field')
    || workflowType.includes('fept')
  )
}

function isRtcLikeRequest(row: RequestRow): boolean {
  const requestType = normalizeRequestTypeForFilter(normalizeRequestType(row))
  const routing = getWorkflowRequestRouting(row)
  const workflowType = normalizeRequestTypeForFilter(routing.workflowType)
  return (
    requestType.includes('rtc')
    || workflowType.includes('rtc')
    || requestType.includes('collection')
    || workflowType.includes('collection')
    || routing.mode === 'ar'
  )
}

function matchesCategoryTab(row: RequestRow, tab: RequestCategoryTab): boolean {
  if (tab === 'all') return true
  if (tab === 'school_fees') return isSchoolFeesLikeRequest(row)
  if (tab === 'fept') return isFeptLikeRequest(row)
  if (tab === 'requisitions') return isRequisitionLikeRequest(row)
  if (tab === 'rtc') return isRtcLikeRequest(row)
  return true
}

function normalizeCreatedAt(row: RequestRow): string | undefined {
  return row.createdAt || row.created_at || row.submittedAt || row.submitted_at
}

function parseRequestContext(row: RequestRow): Record<string, unknown> {
  if (!row.context_json) return {}
  try {
    const parsed = JSON.parse(row.context_json)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function getStringValue(value: unknown): string {
  return String(value ?? '').trim()
}

function getWorkflowRequestRouting(row: RequestRow): {
  mode: 'requisition' | 'ap' | 'field' | 'ar' | 'education' | 'generic'
  requisitionId: string
  transactionId: string
  workflowRunId: string
  workflowRequestId: string
  workflowType: string
  requiredAction: string
} {
  const context = parseRequestContext(row)
  const workflowRequestId = getStringValue((context as any).legacyWorkflowRequestId || row.workflowRequestId || '')
  const requisitionId = getStringValue((context as any).requisitionId || '')
  const transactionId = getStringValue((context as any).transactionId || '')
  const workflowRunId = getStringValue((context as any).workflowRunId || '')
  const workflowType = getStringValue((context as any).workflowType || row.requestType || '')
  const requiredAction = getStringValue((context as any).requiredAction || '')

  const requestType = normalizeRequestTypeForFilter(normalizeRequestType(row))
  const workflowTypeLower = workflowType.toLowerCase()

  if (requestType.includes('requis') || requisitionId || workflowTypeLower.includes('requisition')) {
    return { mode: 'requisition', requisitionId, transactionId, workflowRunId, workflowRequestId, workflowType, requiredAction }
  }

  if (workflowTypeLower.includes('field') || workflowRunId || requestType.includes('field')) {
    return { mode: 'field', requisitionId, transactionId, workflowRunId, workflowRequestId, workflowType, requiredAction }
  }

  if (
    requestType.includes('education') ||
    requestType.includes('school') ||
    workflowTypeLower.includes('education') ||
    workflowTypeLower.includes('school') ||
    workflowTypeLower.includes('tpl-education')
  ) {
    return { mode: 'education', requisitionId, transactionId, workflowRunId, workflowRequestId, workflowType, requiredAction }
  }

  if (
    requestType === 'ap_workflow'
    || workflowTypeLower.includes('ap_')
    || workflowTypeLower.includes('ap') && workflowTypeLower.includes('workflow')
    || transactionId
    || requiredAction.toLowerCase().includes('payment')
    || requiredAction.toLowerCase().includes('release_funds')
  ) {
    return { mode: 'ap', requisitionId, transactionId, workflowRunId, workflowRequestId, workflowType, requiredAction }
  }

  if (
    requestType.includes('ar')
    || workflowTypeLower.includes('ar_')
    || workflowTypeLower.includes('ar')
    || requiredAction.toLowerCase().includes('present_payment_proof')
  ) {
    return { mode: 'ar', requisitionId, transactionId, workflowRunId, workflowRequestId, workflowType, requiredAction }
  }

  return { mode: 'generic', requisitionId, transactionId, workflowRunId, workflowRequestId, workflowType, requiredAction }
}

function getSelectedWorkflowRouting(row: RequestRow | null): ReturnType<typeof getWorkflowRequestRouting> {
  if (!row) {
    return {
      mode: 'generic',
      requisitionId: '',
      transactionId: '',
      workflowRunId: '',
      workflowRequestId: '',
      workflowType: '',
      requiredAction: '',
    }
  }

  return getWorkflowRequestRouting(row)
}

/** A job step card written to the signed-in person's wallet inbox (same cards the app inbox shows). */
interface StageCardApiRow {
  id?: string
  offerId?: string
  sourceType?: string
  sourceId?: string
  credentialType?: string
  title?: string
  body?: string
  createdAt?: string
  workflowRunId?: string
  issuerTenantId?: string
  status?: string
  claims?: Record<string, unknown>
}

const STAGE_CARD_STEP_LABEL: Record<string, string> = {
  acknowledge_execution: 'Sign off job',
  trigger_payout: 'Release payment',
  review_completion: 'Review finished work',
  inspect_site: 'Site check',
  assign_field_worker: 'Do the job',
}

/**
 * Field job step cards (sign-off, payment release, review…) as inbox rows, so the portal inbox
 * shows the same "this job is waiting for you" items as the app and opens them in the owning
 * organization after the switch step.
 */
function mapStageCardToRow(card: StageCardApiRow): RequestRow | null {
  const sourceType = String(card.sourceType || '')
  const credentialType = String(card.credentialType || '').toLowerCase()
  if (sourceType !== 'workflow_stage_action' && credentialType !== 'workflowstageaction') return null
  if (['accepted', 'resolved'].includes(String(card.status || '').toLowerCase())) return null
  const claims = card.claims && typeof card.claims === 'object' ? card.claims : {}
  const workflowType = String(claims.workflowType || claims.requestType || '').toLowerCase()
  const requestType = String(claims.requestType || '').toLowerCase()
  if (!/fept|field/.test(`${workflowType} ${requestType}`)) return null
  const workflowRunId = String(
    card.workflowRunId
      || claims.workflowRunId
      || String(card.sourceId || '').replace(/:(signoff|payout|review|inspection)(:delegation:.*)?$/i, ''),
  ).trim()
  if (!workflowRunId) return null
  const stageAction = String(claims.stageAction || '').toLowerCase()
  const cardId = String(card.id || card.offerId || card.sourceId || workflowRunId)
  const ownerOrgTenantId = String(claims.targetOrgTenantId || claims.orgTenantId || card.issuerTenantId || '')
  const amount = Number(claims.amount)
  return {
    id: `wsa:${cardId}`,
    request_type: 'field_job',
    requestType: 'field_job',
    title: String(card.title || STAGE_CARD_STEP_LABEL[stageAction] || 'Job waiting for you'),
    description: String(card.body || ''),
    priority: 'high',
    status: 'submitted',
    amount: Number.isFinite(amount) ? amount : undefined,
    currency: claims.currency ? String(claims.currency) : undefined,
    createdAt: card.createdAt,
    updatedAt: card.createdAt,
    context_json: JSON.stringify({
      legacyWorkflowRequestId: cardId,
      ownerOrgTenantId,
      workflowType: 'field_execution_fept',
      workflowStage: String(claims.workflowStage || ''),
      requiredAction: STAGE_CARD_STEP_LABEL[stageAction] || stageAction,
      workflowRunId,
      source: 'workflow_stage_card',
    }),
    __source: 'workflow_request',
    workflowRequestId: cardId,
    workflowRequestContext: 'personal',
  }
}

function normalizeWorkflowRequestStatus(status?: string): PortalRequestStatus {
  switch ((status || '').toLowerCase()) {
    case 'pending':
      return 'submitted'
    case 'approved':
      return 'approved'
    case 'rejected':
      return 'rejected'
    case 'fulfilled':
      return 'completed'
    case 'cancelled':
      return 'cancelled'
    default:
      return 'submitted'
  }
}

function mapWorkflowRequestToRow(item: WorkflowRequestApiRow, workflowRequestContext: 'personal' | 'org'): RequestRow {
  const payload = item.payload && typeof item.payload === 'object' ? item.payload : {}
  const requisitionId = String((payload as any).requisitionId || '')
  const workflowStage = String((payload as any).workflowStage || (payload as any).stage || '')
  const requiredAction = String((payload as any).requiredAction || '')
  const transactionId = String((payload as any).transactionId || (payload as any).paymentId || (payload as any).paymentReference || '')
  const workflowRunId = String((payload as any).workflowRunId || '')
  const offerUri = String((payload as any).offerUri || '')

  const requestType = item.requestType || 'workflow_request'
  const workflowType = item.workflowType || 'workflow'

  const title = requisitionId
    ? `Requisition approval ${requisitionId}`
    : workflowRunId
      ? `Field execution ${workflowRunId}`
      : transactionId
        ? `AP workflow ${transactionId}`
        : `${requestType} ${item.id}`

  const description = workflowStage || requiredAction
    ? `Workflow: ${workflowType} • ${workflowStage || requiredAction || 'In review'}`
    : `Workflow type: ${workflowType}`

  return {
    id: `wr:${workflowRequestContext}:${item.id}`,
    request_type: requestType,
    requestType: requestType,
    title,
    description,
    priority: 'normal',
    status: normalizeWorkflowRequestStatus(item.status),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    context_json: JSON.stringify({
      legacyWorkflowRequestId: item.id,
      ownerOrgTenantId: String(item.targetOrgTenantId || ''),
      requisitionId,
      workflowType: workflowType || null,
      workflowStage,
      requiredAction,
      transactionId,
      workflowRunId,
      offerUri,
      source: 'workflow_request',
    }),
    __source: 'workflow_request',
    workflowRequestId: item.id,
    workflowRequestContext,
  }
}

function mapRequisitionStatus(status?: string): PortalRequestStatus {
  switch (String(status || '').toUpperCase()) {
    case 'REQUISITION_CREATED':
      return 'submitted'
    case 'MANAGER_APPROVED':
      return 'in_review'
    case 'APPROVED':
      return 'approved'
    case 'RELEASED':
      return 'in_fulfilment'
    case 'ACKNOWLEDGED':
    case 'RECONCILED':
      return 'completed'
    case 'REJECTED':
      return 'rejected'
    default:
      return 'submitted'
  }
}

function mapFinanceRequisitionToRow(item: FinanceRequisitionRow): RequestRow {
  const requisitionId = String(item.id || '')
  const status = String(item.status || '')
  return {
    id: `rq:${requisitionId}`,
    request_type: 'requisition',
    requestType: 'requisition',
    title: `Internal requisition ${requisitionId}`,
    description: item.department ? `Department: ${item.department}` : 'Internal requisition workflow',
    amount: typeof item.amount === 'number' ? item.amount : undefined,
    currency: item.currency || 'USD',
    priority: 'normal',
    status: mapRequisitionStatus(status),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    context_json: JSON.stringify({
      requisitionId,
      workflowType: 'requisition',
      workflowStage: status,
      source: 'finance_requisition',
    }),
    __source: 'platform',
  }
}

/** A job step card: the step is done inside the job, so the row only offers "Open job". */
function isStageCardRow(row: RequestRow | null): boolean {
  if (!row) return false
  return String((parseRequestContext(row) as Record<string, unknown>).source || '') === 'workflow_stage_card'
}

/** A row backed by the request engine (`/api/platform/requests`) that the owner can approve or decline here. */
function isDecidablePlatformRequest(row: RequestRow): boolean {
  if (row.__source === 'workflow_request') return false
  if (String(row.id || '').startsWith('rq:')) return false // finance requisitions have their own flow
  const status = String(normalizeStatus(row.status))
  if (!['submitted', 'in_review'].includes(status)) return false
  return !normalizeRequestType(row).toLowerCase().includes('ecommerce')
}

function isActionableStatus(status?: string) {
  return ['submitted', 'in_review', 'approved', 'in_fulfilment'].includes(status || '')
}

function statusLabel(status?: string) {
  switch (status) {
    case 'in_review':
      return 'Under review'
    case 'in_fulfilment':
      return 'In progress'
    default:
      return status ? status.replace(/_/g, ' ') : 'Draft'
  }
}

function statusColor(status?: string) {
  switch (status) {
    case 'draft':
      return 'gray'
    case 'submitted':
      return 'blue'
    case 'in_review':
      return 'yellow'
    case 'approved':
      return 'teal'
    case 'rejected':
      return 'red'
    case 'in_fulfilment':
      return 'violet'
    case 'completed':
      return 'green'
    case 'cancelled':
      return 'gray'
    default:
      return 'gray'
  }
}

function flowLabel(row: RequestRow): { label: string; color: string } {
  if (isRequisitionLikeRequest(row)) return { label: 'REQUISITION FLOW', color: 'indigo' }
  if (isSchoolFeesLikeRequest(row)) return { label: 'INVOICE FLOW', color: 'teal' }
  if (isFeptLikeRequest(row)) return { label: 'FEPT FLOW', color: 'cyan' }
  if (isRtcLikeRequest(row)) return { label: 'RTC FLOW', color: 'grape' }
  return { label: 'WORKFLOW', color: 'gray' }
}

type SsiStageSummary = {
  stage: string
  proof: string
  vcType: string
  done: boolean
}

function deriveSsiStages(row: RequestRow): SsiStageSummary[] {
  const status = String(normalizeStatus(row.status)).toLowerCase()
  const routing = getWorkflowRequestRouting(row)
  const workflowTypeLower = (routing.workflowType || String(row.requestType || '')).toLowerCase()

  const isDone = (target: 'submitted' | 'approved' | 'in_fulfilment' | 'completed') => {
    if (target === 'submitted') return ['submitted', 'in_review', 'approved', 'in_fulfilment', 'completed'].includes(status)
    if (target === 'approved') return ['approved', 'in_fulfilment', 'completed'].includes(status)
    if (target === 'in_fulfilment') return ['in_fulfilment', 'completed'].includes(status)
    return status === 'completed'
  }

  if (routing.mode === 'requisition') {
    return [
      { stage: 'Request Created', proof: 'N/A', vcType: 'RequisitionVC', done: isDone('submitted') },
      { stage: 'Approval', proof: 'OIDC4VP', vcType: 'ApprovalVC', done: isDone('approved') },
      { stage: 'Release', proof: 'OIDC4VP', vcType: 'ReleaseAuthorizationVC', done: isDone('in_fulfilment') },
      { stage: 'Acknowledge', proof: 'OIDC4VP', vcType: 'ExecutionAckVC', done: isDone('completed') },
    ]
  }

  if (routing.mode === 'ap') {
    return [
      { stage: 'Invoice', proof: 'N/A', vcType: 'InvoiceVC', done: isDone('submitted') },
      { stage: 'Payment Proof', proof: 'OIDC4VP', vcType: 'PaymentProofVC', done: isDone('approved') },
      { stage: 'Remittance', proof: 'SSI', vcType: 'RemittanceAdviceVC', done: isDone('in_fulfilment') },
      { stage: 'Receipt', proof: 'SSI', vcType: 'PaymentReceiptVC', done: isDone('completed') },
    ]
  }

  if (routing.mode === 'ar') {
    return [
      { stage: 'AR Request', proof: 'N/A', vcType: 'CollectionRequestVC', done: isDone('submitted') },
      { stage: 'Consent Proof', proof: 'OIDC4VP', vcType: 'CollectionConsentVC', done: isDone('approved') },
      { stage: 'Settlement', proof: 'SSI', vcType: 'SettlementVC', done: isDone('in_fulfilment') },
      { stage: 'Reconciled', proof: 'SSI', vcType: 'ReconciliationVC', done: isDone('completed') },
    ]
  }

  if (routing.mode === 'field') {
    return [
      { stage: 'Field Task', proof: 'N/A', vcType: 'FieldTaskVC', done: isDone('submitted') },
      { stage: 'Execution Proof', proof: 'OIDC4VP', vcType: 'ExecutionProofVC', done: isDone('approved') },
      { stage: 'Evidence', proof: 'SSI', vcType: 'EvidenceBundleVC', done: isDone('in_fulfilment') },
      { stage: 'Closure', proof: 'SSI', vcType: 'CompletionVC', done: isDone('completed') },
    ]
  }

  if (routing.mode === 'education' || workflowTypeLower.includes('education') || workflowTypeLower.includes('school')) {
    return [
      { stage: 'Invoice Created', proof: 'OID4VCI', vcType: 'InvoiceVC', done: isDone('submitted') },
      { stage: 'EcoCash Payment', proof: 'EcoCash', vcType: 'PaymentProofVC', done: isDone('approved') },
      { stage: 'Payment Confirmed', proof: 'Webhook', vcType: 'PaymentReceiptVC', done: isDone('in_fulfilment') },
      { stage: 'Receipt VC Issued', proof: 'OID4VCI', vcType: 'SchoolFeeReceiptVC', done: isDone('completed') },
    ]
  }

  return [
    { stage: 'Requested', proof: 'N/A', vcType: 'RequestVC', done: isDone('submitted') },
    { stage: 'Reviewed', proof: 'Policy', vcType: 'ApprovalVC', done: isDone('approved') },
    { stage: 'Fulfilment', proof: 'SSI', vcType: 'FulfilmentVC', done: isDone('in_fulfilment') },
    { stage: 'Closed', proof: 'SSI', vcType: 'CompletionVC', done: isDone('completed') },
  ]
}

function getRoutingActionLabel(routing: ReturnType<typeof getWorkflowRequestRouting>): string {
  if (routing.requiredAction) return routing.requiredAction.replace(/_/g, ' ')

  if (routing.mode === 'requisition') return 'approval'
  if (routing.mode === 'ap') return 'payment review'
  if (routing.mode === 'ar') return 'collection review'
  if (routing.mode === 'field') return 'field execution review'
  return 'request review'
}

function prettifyValue(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (part) => part.toUpperCase())
}

function buildDetailTimelineItems(row: RequestRow, stages: SsiStageSummary[]): DetailTimelineItem[] {
  const createdAt = normalizeCreatedAt(row)
  const updatedAt = row.updatedAt || row.updated_at

  const workflowItems = stages.map((stage, index) => ({
    id: `${row.id}:stage:${stage.stage}:${index}`,
    title: stage.stage,
    source: stage.proof === 'OIDC4VP'
      ? 'Confirmed from a wallet'
      : stage.proof === 'OID4VCI'
        ? 'Sent to a wallet'
        : stage.proof === 'EcoCash'
          ? 'Paid with EcoCash'
          : stage.proof === 'Webhook'
            ? 'Confirmed automatically'
            : 'Recorded',
    note: stage.done ? 'Done' : 'Not yet',
    badge: {
      label: stage.done ? 'done' : 'pending',
      color: stage.done ? 'teal' : 'yellow',
    },
  }))

  const auditItems: DetailTimelineItem[] = []
  if (createdAt) {
    auditItems.push({
      id: `${row.id}:created`,
      title: 'Request created',
      source: 'portal',
      timestamp: new Date(createdAt).toLocaleString(),
      badge: { label: 'done', color: 'teal' },
    })
  }
  if (updatedAt) {
    auditItems.push({
      id: `${row.id}:updated`,
      title: 'Last status update',
      source: 'workflow',
      timestamp: new Date(updatedAt).toLocaleString(),
      badge: { label: 'pending', color: 'yellow' },
    })
  }

  return [...workflowItems, ...auditItems]
}

function stagesForInboxRow(row: RequestRow): { stages: FinanceStageView[]; hints: string[] } {
  const routing = getWorkflowRequestRouting(row)
  const workflowStage = String((parseRequestContext(row) as any).workflowStage || '')
  const status = String(row.status || '')
  if (routing.mode === 'requisition') {
    return {
      stages: workflowStage ? requisitionStages(workflowStage) : requestStages(REQUISITION_STAGES, status),
      hints: ['requisition'],
    }
  }
  if (routing.mode === 'field') {
    return {
      stages: workflowStage ? feptStages(workflowStage, parseRequestContext(row) as any) : fieldRequestStages(status),
      hints: ['field', 'fept'],
    }
  }
  if (routing.mode === 'ap') return { stages: requestStages(AP_STAGES, status), hints: ['payable', 'ap'] }
  if (routing.mode === 'ar') return { stages: requestStages(AR_STAGES, status), hints: ['receivable', 'collect', 'ar'] }
  if (routing.mode === 'education') return { stages: requestStages(INVOICE_STAGES, status), hints: ['education', 'school', 'fee'] }
  return { stages: requestStages(REQUISITION_STAGES, status), hints: [routing.workflowType || normalizeRequestType(row)] }
}

export default function RequestWorkspace({ mode }: RequestWorkspaceProps) {
  const router = useRouter()
  const [orgTenantId, setOrgTenantId] = useState('')
  const [orgName, setOrgName] = useState('')
  const [activeWorkflowTemplateId, setActiveWorkflowTemplateId] = useState<string | null>(null)
  const [actorReports, setActorReports] = useState<WorkflowActorReport[]>([])
  const [orgMembers, setOrgMembers] = useState<StagePerson[]>([])
  const [items, setItems] = useState<RequestRow[]>([])
  const [selectedRequest, setSelectedRequest] = useState<RequestRow | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [requestCategoryTab, setRequestCategoryTab] = useState<RequestCategoryTab>('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  // Same step as the app's inbox: an item that belongs to an organization is opened as that
  // organization, and the person confirms the switch first.
  const [orgSwitchPrompt, setOrgSwitchPrompt] = useState<{ orgTenantId: string; orgName: string; href: string; purpose: OrgSwitchPurpose } | null>(null)
  const [orgSwitching, setOrgSwitching] = useState(false)
  const [createForm, setCreateForm] = useState({
    requestType: 'ecommerce.order',
    title: 'E2E Workflow Request',
    description: 'Portal-created request for workflow execution',
    amount: '150',
    currency: 'USD',
    priority: 'normal',
    targetModule: 'finance',
    buyerDid: 'did:key:z6MkhaXgBZDvotDkL5257faWxcqACaGc1LeWxweVMRxo59',
    buyerPhone: '+263770000000',
    discount: '0',
    taxRate: '15',
    itemsJson:
      '[\n  {"description": "Sample Item A", "quantity": 1, "unitPrice": 100},\n  {"description": "Sample Item B", "quantity": 1, "unitPrice": 50}\n]',
  })

  const backendUrl = process.env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'

  useEffect(() => {
    const activeOrg = readActiveOrganization()
    if (activeOrg?.orgTenantId) {
      setOrgTenantId(activeOrg.orgTenantId)
      setOrgName(activeOrg.name)
    }
  }, [])

  useEffect(() => {
    const requestTypeFromQuery = String(router.query?.requestType || '').trim().toLowerCase()
    if (requestTypeFromQuery) {
      if (requestTypeFromQuery.includes('requis')) setRequestCategoryTab('requisitions')
      else if (requestTypeFromQuery.includes('field') || requestTypeFromQuery.includes('fept')) setRequestCategoryTab('fept')
      else setRequestCategoryTab('all')
    }

    const statusFromQuery = String(router.query?.status || '').trim().toLowerCase()
    if (statusFromQuery) {
      setStatusFilter(statusFromQuery)
    }
  }, [router.query])

  const visibleItems = useMemo(() => {
    const requisitionIdFromQuery = String(router.query?.requisitionId || '').trim()
    const transactionIdFromQuery = String(router.query?.transactionId || '').trim()
    const workflowRunIdFromQuery = String(router.query?.workflowRunId || '').trim()
    const workflowRequestIdFromQuery = String(router.query?.workflowRequestId || '').trim()
    const filtered = items.filter((row) => {
      const status = normalizeStatus(row.status)

      if (mode === 'inbox' && !isActionableStatus(status)) return false
      if (statusFilter !== 'all' && status !== statusFilter) return false
      if (!matchesCategoryTab(row, requestCategoryTab)) return false
      if (requisitionIdFromQuery) {
        const context = parseRequestContext(row)
        const rowRequisitionId = String((context as any).requisitionId || '').trim()
        if (rowRequisitionId !== requisitionIdFromQuery) return false
      }

      if (transactionIdFromQuery) {
        const context = parseRequestContext(row)
        const rowTransactionId = String((context as any).transactionId || '').trim()
        if (rowTransactionId !== transactionIdFromQuery) return false
      }

      if (workflowRunIdFromQuery) {
        const context = parseRequestContext(row)
        const rowWorkflowRunId = String((context as any).workflowRunId || '').trim()
        if (rowWorkflowRunId !== workflowRunIdFromQuery) return false
      }

      if (workflowRequestIdFromQuery) {
        const context = parseRequestContext(row)
        const rowWorkflowRequestId = String((context as any).legacyWorkflowRequestId || row.workflowRequestId || '').trim()
        if (rowWorkflowRequestId !== workflowRequestIdFromQuery) return false
      }

      return true
    })

    return filtered
  }, [items, mode, requestCategoryTab, statusFilter, router.query])

  const requestCategoryCounts = useMemo(() => {
    const counts: Record<RequestCategoryTab, number> = {
      all: 0,
      school_fees: 0,
      fept: 0,
      requisitions: 0,
      rtc: 0,
    }

    items.forEach((row) => {
      const status = normalizeStatus(row.status)
      if (mode === 'inbox' && !isActionableStatus(status)) return
      if (statusFilter !== 'all' && status !== statusFilter) return

      counts.all += 1
      if (matchesCategoryTab(row, 'school_fees')) counts.school_fees += 1
      if (matchesCategoryTab(row, 'fept')) counts.fept += 1
      if (matchesCategoryTab(row, 'requisitions')) counts.requisitions += 1
      if (matchesCategoryTab(row, 'rtc')) counts.rtc += 1
    })

    return counts
  }, [items, mode, statusFilter])

  const stats = useMemo(() => {
    const base = visibleItems
    const pending = base.filter((row) => ['submitted', 'in_review'].includes(String(normalizeStatus(row.status)))).length
    const active = base.filter((row) => ['approved', 'in_fulfilment'].includes(String(normalizeStatus(row.status)))).length
    const completed = base.filter((row) => String(normalizeStatus(row.status)) === 'completed').length
    return { total: base.length, pending, active, completed }
  }, [visibleItems])

  const loadRequests = async (cursor?: string | null, append = false) => {
    if (!orgTenantId && mode !== 'inbox') return
    // In personal context only the person's own cards load; organization rows need the org session.
    const orgToken = orgTenantId ? getOrgScopedToken() : null
    const personalToken = getPersonalToken()

    if (mode !== 'inbox' && !orgToken) {
      setError('Switch to organization context first.')
      return
    }

    if (mode === 'inbox' && !personalToken && !orgToken) {
      setError('Sign in with a wallet or switch to organization context first.')
      return
    }

    if (append) setLoadingMore(true)
    else setLoading(true)
    setError(null)

    try {
      if (mode !== 'inbox') {
        const params: Record<string, string | number> = { limit: 25 }
        if (cursor) params.cursor = cursor
        if (statusFilter !== 'all') params.status = statusFilter

        const res = await axios.get<RequestListResponse>(`${backendUrl}/api/platform/requests`, {
          params,
          headers: { Authorization: `Bearer ${orgToken}` },
        })

        const responseItems: RequestRow[] = (Array.isArray(res.data?.items) ? res.data.items : []).map((row) => ({
          ...row,
          __source: 'platform' as const,
        }))

        let workflowRows: RequestRow[] = []
        if (orgToken) {
          try {
            const inboundRes = await axios.get<WorkflowRequestApiRow[]>(
              `${backendUrl}/workflow-requests/inbound`,
              {
                params: { limit: 50 },
                headers: { Authorization: `Bearer ${orgToken}` },
              },
            )

            const inbound = Array.isArray(inboundRes.data) ? inboundRes.data : []
            workflowRows = inbound.map((item) => mapWorkflowRequestToRow(item, 'org'))
          } catch {
            workflowRows = []
          }
        }

        let requisitionRows: RequestRow[] = []
        try {
          const requisitionRes = await axios.get<FinanceRequisitionRow[]>(
            `${backendUrl}/api/finance/requisitions`,
            {
              headers: { Authorization: `Bearer ${orgToken}` },
            },
          )
          const requisitions = Array.isArray(requisitionRes.data) ? requisitionRes.data : []
          requisitionRows = requisitions.map((item) => mapFinanceRequisitionToRow(item))
        } catch {
          requisitionRows = []
        }

        const dedupedById = new Map<string, RequestRow>()
        ;[...workflowRows, ...requisitionRows, ...responseItems].forEach((row) => {
          dedupedById.set(row.id, row)
        })

        const mergedItems = Array.from(dedupedById.values())

        setItems((prev) => (append ? [...prev, ...mergedItems] : mergedItems))
        setNextCursor(res.data?.nextCursor || null)
        return
      }

      const workflowRows: RequestRow[] = []

      if (personalToken) {
        try {
          const assignedRes = await axios.get<WorkflowRequestApiRow[]>(
            `${backendUrl}/workflow-requests/assigned`,
            {
              params: { status: 'pending', limit: 50 },
              headers: { Authorization: `Bearer ${personalToken}` },
            },
          )

          const assigned = Array.isArray(assignedRes.data) ? assignedRes.data : []
          workflowRows.push(...assigned.map((item) => mapWorkflowRequestToRow(item, 'personal')))
        } catch {
          // Keep inbox responsive when wallet inbox context is unavailable.
        }

        // Job step cards (sign-off, payment release, review) land in the person's wallet inbox.
        try {
          const offersRes = await axios.get(`${backendUrl}/api/wallet/credentials/pending-offers`, {
            headers: { Authorization: `Bearer ${personalToken}` },
          })
          const offers: StageCardApiRow[] = Array.isArray(offersRes.data?.offers)
            ? offersRes.data.offers
            : Array.isArray(offersRes.data) ? offersRes.data : []
          offers.forEach((card) => {
            const row = mapStageCardToRow(card)
            if (row) workflowRows.push(row)
          })
        } catch {
          // Cards are optional; the rest of the inbox still loads.
        }
      }

      if (orgToken) {
        try {
          const inboundRes = await axios.get<WorkflowRequestApiRow[]>(
            `${backendUrl}/workflow-requests/inbound`,
            {
              params: { status: 'pending', limit: 50 },
              headers: { Authorization: `Bearer ${orgToken}` },
            },
          )

          const inbound = Array.isArray(inboundRes.data) ? inboundRes.data : []
          workflowRows.push(...inbound.map((item) => mapWorkflowRequestToRow(item, 'org')))
        } catch {
          // Keep inbox responsive when org inbox context is unavailable.
        }
      }

      setItems((prev) => (append ? [...prev, ...workflowRows] : workflowRows))
      setNextCursor(null)
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load requests')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  /** Organization that owns a row: from the request itself, else the session's organization for org-sourced rows. */
  const ownerOrgFor = (row: RequestRow): string => {
    const context = parseRequestContext(row) as Record<string, unknown>
    const fromRow = String(context.ownerOrgTenantId || '').trim()
    if (fromRow) return fromRow
    return row.workflowRequestContext === 'org' ? orgTenantId : ''
  }

  /** Finance link for a row's next step, scoped to the organization that owns it. */
  const financeHrefFor = (row: RequestRow, routing: ReturnType<typeof getWorkflowRequestRouting>): string | null => {
    const owner = ownerOrgFor(row)
    const orgQuery = owner ? `&orgTenantId=${encodeURIComponent(owner)}` : ''
    const legacyId = String((parseRequestContext(row) as Record<string, unknown>).legacyWorkflowRequestId || '')
    if (routing.mode === 'requisition' && routing.requisitionId) {
      return `/finance?tab=requisitions&requestId=${encodeURIComponent(legacyId)}&requisitionId=${encodeURIComponent(routing.requisitionId)}${orgQuery}`
    }
    if (routing.mode === 'field' && routing.workflowRunId) return `/finance?tab=field&runId=${encodeURIComponent(routing.workflowRunId)}${orgQuery}`
    if (routing.mode === 'ap' && routing.transactionId) return `/finance?tab=ap&transactionId=${encodeURIComponent(routing.transactionId)}${orgQuery}`
    if (routing.mode === 'ar' && routing.transactionId) return `/finance?tab=ar&transactionId=${encodeURIComponent(routing.transactionId)}${orgQuery}`
    return null
  }

  const purposeFor = (routing: ReturnType<typeof getWorkflowRequestRouting>): OrgSwitchPurpose => {
    if (routing.mode === 'field') return 'job'
    if (routing.mode === 'requisition') return 'requisition'
    if (routing.mode === 'ap') return 'payable'
    if (routing.mode === 'ar') return 'collection'
    return 'request'
  }

  /** Open an item's next step; ask to switch first when it belongs to an organization we are not acting as. */
  const openInOwnerOrg = (row: RequestRow, routing: ReturnType<typeof getWorkflowRequestRouting>) => {
    const href = financeHrefFor(row, routing)
    if (!href) return
    const owner = ownerOrgFor(row)
    if (!owner || isActingAsOrganization(owner)) {
      setSelectedRequest(null)
      void router.push(href)
      return
    }
    setOrgSwitchPrompt({
      orgTenantId: owner,
      orgName: organizationNameFor(owner) || (owner === orgTenantId && orgName ? orgName : owner),
      href,
      purpose: purposeFor(routing),
    })
  }

  const confirmOrgSwitch = async () => {
    if (!orgSwitchPrompt) return
    const personalToken = getPersonalToken()
    if (!personalToken) {
      notifications.show({ title: 'Sign in again', message: 'Your personal session has ended. Sign in to continue as this organization.', color: 'orange' })
      setOrgSwitchPrompt(null)
      return
    }
    setOrgSwitching(true)
    try {
      await switchOrganizationContext({ backendUrl, orgTenantId: orgSwitchPrompt.orgTenantId, orgName: orgSwitchPrompt.orgName, personalToken })
      setSelectedRequest(null)
      // Full load so the header, menus and the finance page all pick up the organization session.
      window.location.assign(orgSwitchPrompt.href)
    } catch (err: any) {
      notifications.show({ title: 'Could not switch', message: err?.response?.data?.message || err?.message || 'Try again from the account picker.', color: 'red' })
      setOrgSwitching(false)
      setOrgSwitchPrompt(null)
    }
  }

  const openRequestDetails = (row: RequestRow) => {
    setSelectedRequest(row)
  }

  const loadOrganizationWorkflows = async () => {
    if (!orgTenantId) return
    const token = getOrgScopedToken()
    if (!token) {
      setActiveWorkflowTemplateId(null)
      return
    }

    try {
      const res = await axios.get<OrganizationWorkflowsResponse>(
        `${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/workflows`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      )

      const templates = Array.isArray(res.data?.templates) ? res.data.templates : []
      const match =
        templates.find((template) => template.enabled && String(template.workflowType || '').includes('ecommerce')) ||
        templates.find((template) => template.enabled)

      setActiveWorkflowTemplateId(match?.id || null)
    } catch {
      setActiveWorkflowTemplateId(null)
    }
  }

  const createRequest = async () => {
    const token = getOrgScopedToken()
    if (!token) {
      setCreateError('Switch to organization context first.')
      return
    }

    setCreateLoading(true)
    setCreateError(null)

    try {
      let parsedItems: Array<Record<string, unknown>> = []
      try {
        const rawItems = JSON.parse(createForm.itemsJson)
        if (Array.isArray(rawItems)) {
          parsedItems = rawItems as Array<Record<string, unknown>>
        } else {
          throw new Error('Items JSON must be an array')
        }
      } catch {
        throw new Error('Items JSON must be a valid array')
      }

      await axios.post(
        `${backendUrl}/api/platform/requests`,
        {
          requestType: createForm.requestType,
          title: createForm.title,
          description: createForm.description,
          amount: Number(createForm.amount),
          currency: createForm.currency,
          priority: createForm.priority,
          targetModule: createForm.targetModule,
          items: parsedItems,
          context: {
            items: parsedItems,
            buyerDid: createForm.buyerDid,
            buyerPhone: createForm.buyerPhone,
            discount: createForm.discount,
            taxRate: Number(createForm.taxRate),
          },
        },
        { headers: { Authorization: `Bearer ${token}` } },
      )

      setCreateOpen(false)
      await loadRequests(null, false)
    } catch (err: any) {
      setCreateError(err?.response?.data?.message || err?.message || 'Failed to create request')
    } finally {
      setCreateLoading(false)
    }
  }

  const submitRequest = async (requestId: string) => {
    const token = getOrgScopedToken()
    if (!token) {
      setError('Switch to organization context first.')
      return
    }

    try {
      await axios.post(`${backendUrl}/api/platform/requests/${encodeURIComponent(requestId)}/submit`, null, {
        headers: { Authorization: `Bearer ${token}` },
      })
      await loadRequests(null, false)
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to submit request')
    }
  }

  const startWorkflow = async (row: RequestRow) => {
    const token = getOrgScopedToken()
    if (!token) {
      setError('Switch to organization context first.')
      return
    }

    if (!activeWorkflowTemplateId) {
      setError('No active workflow template configured for this organization.')
      return
    }

    try {
      const detailsRes = await axios.get(`${backendUrl}/api/platform/requests/${encodeURIComponent(row.id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const requestDetails = detailsRes.data || {}
      const context = requestDetails.context || parseRequestContext(requestDetails)

      await axios.post(
        `${backendUrl}/api/platform/requests/${encodeURIComponent(row.id)}/workflow/${encodeURIComponent(activeWorkflowTemplateId)}`,
        {
          input: {
            items: context.items || [],
            buyerDid: context.buyerDid,
            buyerPhone: context.buyerPhone,
            discount: context.discount,
            taxRate: context.taxRate,
          },
        },
        { headers: { Authorization: `Bearer ${token}` } },
      )
      await loadRequests(null, false)
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to start workflow')
    }
  }

  /**
   * Approve or decline a platform request (the request engine, `requests` table).
   * Approval walks submitted → in_review → approved; a decline goes straight to rejected.
   * When the request was started from a job (Buy materials), the job continues on its own.
   */
  const decidePlatformRequest = async (row: RequestRow, action: 'approve' | 'reject') => {
    const token = getOrgScopedToken()
    if (!token) {
      setError('Switch to organization context first.')
      return
    }
    const headers = { Authorization: `Bearer ${token}` }
    const transition = (toStatus: string) =>
      axios.post(`${backendUrl}/api/platform/requests/transition`, { requestId: row.id, toStatus }, { headers })
    try {
      const status = String(normalizeStatus(row.status))
      if (action === 'reject') {
        await transition('rejected')
      } else {
        if (status === 'submitted') await transition('in_review')
        await transition('approved')
      }
      await loadRequests(null, false)
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || `Could not ${action === 'approve' ? 'approve' : 'decline'} this request`)
    }
  }

  const callWorkflowRequestDecision = async (workflowRequestId: string, action: 'approve' | 'reject') => {
    const row = items.find((entry) => entry.workflowRequestId === workflowRequestId)
    const workflowContext = row?.workflowRequestContext || 'org'
    const token = workflowContext === 'personal' ? getPersonalToken() : getOrgScopedToken()

    if (!token) {
      setError(
        workflowContext === 'personal'
          ? 'Personal wallet token is required for delegated inbox actions. Sign in to wallet first.'
          : 'Organization token is required for org inbox actions. Switch to the organization context first.',
      )
      return
    }

    try {
      const baseUrl = `${backendUrl}/workflow-requests/${encodeURIComponent(workflowRequestId)}`
      const url = workflowContext === 'personal'
        ? `${baseUrl}/${action === 'approve' ? 'approve-from-inbox' : 'reject-from-inbox'}`
        : `${baseUrl}/${action}`
      const body = action === 'reject'
        ? { reason: 'Rejected from portal inbox' }
        : { executeWorkflow: true }

      await axios.put(url, body, { headers: { Authorization: `Bearer ${token}` } })

      await loadRequests(null, false)
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || `Failed to ${action} workflow request`)
    }
  }

  const selectedContext = selectedRequest ? parseRequestContext(selectedRequest) : {}
  const selectedLegacyWorkflowRequestId = String((selectedContext as any).legacyWorkflowRequestId || '')
  const selectedRequisitionId = String((selectedContext as any).requisitionId || '')
  const selectedWorkflowType = String((selectedContext as any).workflowType || '')
  const selectedWorkflowStage = String((selectedContext as any).workflowStage || '')
  const selectedRequiredAction = String((selectedContext as any).requiredAction || '')
  const selectedTransactionId = String((selectedContext as any).transactionId || '')
  const selectedWorkflowRunId = String((selectedContext as any).workflowRunId || '')
  const selectedOfferUri = String((selectedContext as any).offerUri || '')
  const selectedRouting = getSelectedWorkflowRouting(selectedRequest)
  const selectedIsLegacyWorkflowItem = Boolean(selectedRequest && selectedLegacyWorkflowRequestId.length > 0)
  const selectedIsRequisitionLike = Boolean(selectedRequest && isRequisitionLikeRequest(selectedRequest))
  const selectedIsFieldLike = Boolean(selectedRequest && normalizeRequestTypeForFilter(normalizeRequestType(selectedRequest)).includes('field'))
  const selectedIsPaymentLike = Boolean(selectedRequest && matchesRequestTypeFilter(selectedRequest, 'payment'))
  const selectedSsiStages = selectedRequest ? deriveSsiStages(selectedRequest) : []
  const selectedSsiIssuedCount = selectedSsiStages.filter((stage) => stage.done).length
  const selectedTimelineItems = selectedRequest ? buildDetailTimelineItems(selectedRequest, selectedSsiStages) : []
  const selectedStatusLines = selectedRequest
    ? [
      `Type: ${normalizeRequestType(selectedRequest)}`,
      `Source: ${selectedRequest.__source || 'platform'}`,
    ]
    : []
  const selectedDetailSections: WorkflowDetailSection[] = selectedRequest
    ? [
      ...(selectedRequest.description
        ? [{
          title: 'Description',
          content: <Text size="sm">{selectedRequest.description}</Text>,
        }]
        : []),
      {
        title: `Progress (${selectedSsiIssuedCount} of ${selectedSsiStages.length} steps done)`,
        content: (
          <StageActorTimeline
            stages={stagesForInboxRow(selectedRequest).stages}
            actors={actorsForWorkflow(actorReports, stagesForInboxRow(selectedRequest).hints)}
            people={orgMembers}
          />
        ),
      },
    ]
    : []
  const loadWorkflowActors = async (orgId: string) => {
    const token = getOrgScopedToken() || getPersonalToken()
    if (!token) return
    try {
      const res = await axios.get(`${backendUrl}/api/organizations/${encodeURIComponent(orgId)}/workflows/actors`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setActorReports(Array.isArray(res.data?.workflows) ? res.data.workflows : [])
      setOrgMembers(Array.isArray(res.data?.members) ? res.data.members : [])
    } catch {
      setActorReports([])
      setOrgMembers([])
    }
  }

  // The inbox also works in personal context: it shows the job steps and requests waiting for you.
  useEffect(() => {
    if (!orgTenantId && mode !== 'inbox') return
    if (orgTenantId) {
      void loadOrganizationWorkflows()
      void loadWorkflowActors(orgTenantId)
    }
    void loadRequests(null, false)
  }, [orgTenantId])

  useEffect(() => {
    if (!orgTenantId && mode !== 'inbox') return
    void loadRequests(null, false)
  }, [statusFilter])

  const title = mode === 'inbox' ? 'Inbox' : 'Requests'
  const description =
    mode === 'inbox'
      ? 'Action-oriented work items in your current organization context.'
      : 'All organizational requests visible in your current context.'

  return (
    <Stack gap="lg">
      <Paper withBorder radius="md" p="lg">
        <Group justify="space-between" align="start" wrap="wrap">
          <Box>
            <Group gap="xs" mb={4}>
              {mode === 'inbox' ? <IconInbox size={20} /> : <IconListDetails size={20} />}
              <Title order={2}>{title}</Title>
            </Group>
            <Text size="sm" c="dimmed">
              {orgName ? `${description} Active organization: ${orgName}.` : description}
            </Text>
          </Box>
          <Button leftSection={<IconRefresh size={16} />} onClick={() => void loadRequests(null, false)} loading={loading}>
            Refresh
          </Button>
        </Group>
      </Paper>

      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
        <Paper p="sm" radius="md" withBorder>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Total</Text>
          <Text fw={700} size="lg">{stats.total}</Text>
        </Paper>
        <Paper p="sm" radius="md" withBorder>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Pending</Text>
          <Text fw={700} size="lg" c="orange">{stats.pending}</Text>
        </Paper>
        <Paper p="sm" radius="md" withBorder>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Active</Text>
          <Text fw={700} size="lg" c="blue">{stats.active}</Text>
        </Paper>
        <Paper p="sm" radius="md" withBorder>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Completed</Text>
          <Text fw={700} size="lg" c="teal">{stats.completed}</Text>
        </Paper>
      </SimpleGrid>

      {!orgTenantId && (
        <Alert icon={<IconAlertCircle size={16} />} color="yellow" title="Personal context">
          <Group justify="space-between" align="center" wrap="wrap">
            <Text size="sm">
              {mode === 'inbox'
                ? 'Showing your personal activity. Switch into an organization to see its inbox and act on its requests.'
                : 'Organizational requests are only available in an organization context. Switch into one, or onboard a new organization.'}
            </Text>
            <Group gap="xs">
              <Button size="sm" variant="filled" onClick={openOrgSwitcher}>
                Switch organization
              </Button>
              <Button component={Link} href="/organization/setup" size="sm" variant="light">
                Onboard Organization
              </Button>
            </Group>
          </Group>
        </Alert>
      )}

      <Card withBorder radius="md" p="lg">
        <Group align="end" wrap="wrap">
          <Select
            label="Status"
            value={statusFilter}
            onChange={(value) => setStatusFilter(value || 'all')}
            data={STATUS_OPTIONS}
            style={{ minWidth: 220 }}
          />
        </Group>
      </Card>

      <Card withBorder radius="md" p="md">
        <Tabs value={requestCategoryTab} onChange={(value) => setRequestCategoryTab((value as RequestCategoryTab) || 'all')}>
          <Tabs.List grow>
            <Tabs.Tab value="all" leftSection={<IconListDetails size={14} />}>All ({requestCategoryCounts.all})</Tabs.Tab>
            {/* SGK demo branch: school fees and customer collections are not offered here. */}
            <Tabs.Tab value="fept" leftSection={<IconActivity size={14} />}>Jobs ({requestCategoryCounts.fept})</Tabs.Tab>
            <Tabs.Tab value="requisitions" leftSection={<IconUsers size={14} />}>Purchase requests ({requestCategoryCounts.requisitions})</Tabs.Tab>
          </Tabs.List>
        </Tabs>
      </Card>

      {error && (
        <Alert icon={<IconAlertCircle size={16} />} color="red" title="Load error">
          {error}
        </Alert>
      )}

      <Card withBorder radius="md" p="lg">
        <Group justify="space-between" mb="md">
          <Title order={4}>{mode === 'inbox' ? 'Actionable Work' : 'Request List'}</Title>
          <Group gap="xs">
            {mode === 'requests' && (
              <Button onClick={() => setCreateOpen(true)}>
                New Request
              </Button>
            )}
            <Badge variant="light">{visibleItems.length}</Badge>
          </Group>
        </Group>

        {loading ? (
          <Text c="dimmed" size="sm">Loading…</Text>
        ) : visibleItems.length === 0 ? (
          <Stack align="center" py="xl" gap="xs">
            {mode === 'inbox' ? <IconInbox size={40} color="var(--mantine-color-gray-4)" /> : <IconListDetails size={40} color="var(--mantine-color-gray-4)" />}
            <Text c="dimmed">{mode === 'inbox' ? 'No actionable items right now.' : 'No requests found for the current filters.'}</Text>
            <Anchor component={Link} href="/organization/setup" size="sm" fw={500}>
              Open organization setup
            </Anchor>
          </Stack>
        ) : (
          <Stack gap="sm">
            {visibleItems.map((row) => {
              const status = normalizeStatus(row.status)
              const createdAt = normalizeCreatedAt(row)
              const requestType = normalizeRequestType(row)
              const context = parseRequestContext(row)
              const legacyWorkflowRequestId = String((context as any).legacyWorkflowRequestId || '')
              const requisitionId = String((context as any).requisitionId || '')
              const routing = getWorkflowRequestRouting(row)
              const isLegacyWorkflowItem = row.__source === 'workflow_request' && legacyWorkflowRequestId.length > 0
              const ssiStages = deriveSsiStages(row)
              const issuedCount = ssiStages.filter((stage) => stage.done).length
              const flow = flowLabel(row)
              const inboxStages = stagesForInboxRow(row)
              const currentStage = inboxStages.stages.find((stage) => stage.status === 'active')
              const currentActor = actorForStage(actorsForWorkflow(actorReports, inboxStages.hints), currentStage?.stageAction)

              return (
                <Paper
                  key={row.id}
                  withBorder
                  radius="md"
                  p="md"
                  style={{ cursor: 'pointer' }}
                  onClick={() => openRequestDetails(row)}
                >
                  <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <Box style={{ flex: 1, minWidth: 0 }}>
                      <Group gap="xs" mb={4} wrap="wrap">
                        <Badge size="xs" color={flow.color} variant="light">{flow.label}</Badge>
                        <Badge variant="light">{requestType}</Badge>
                        <Badge color={statusColor(status)}>{statusLabel(status)}</Badge>
                        <Badge variant="outline">{row.priority || 'normal'}</Badge>
                      </Group>
                      <Text fw={600} size="sm">
                        {row.title || row.id}
                      </Text>
                      {row.description && (
                        <Text size="xs" c="dimmed" mt={2} lineClamp={2}>
                          {row.description}
                        </Text>
                      )}
                      <Group gap="sm" mt="sm" wrap="wrap">
                        <Text size="xs" c="dimmed">
                          {createdAt ? new Date(createdAt).toLocaleString() : '—'}
                        </Text>
                        {typeof row.amount === 'number' && (
                          <Text size="xs" c="teal.7" fw={600}>
                            {row.currency || ''} {row.amount.toLocaleString()}
                          </Text>
                        )}
                        <Badge size="xs" color="indigo" variant="light">{issuedCount} of {ssiStages.length} steps done</Badge>
                        {currentStage?.stageAction && actorReports.length > 0 && (
                          <Text size="xs" c={actorNeedsAssignment(currentActor) ? 'orange' : 'dimmed'}>
                            {currentStage.label}: {actorDisplay(currentActor, { people: orgMembers, stageAction: currentStage.stageAction })}
                          </Text>
                        )}
                      </Group>
                      <Group gap="xs" mt="xs" wrap="wrap">
                        {ssiStages.slice(0, 3).map((stage) => (
                          <Badge key={`${row.id}:${stage.stage}`} size="xs" variant="outline" color={stage.done ? 'teal' : 'gray'}>
                            {stage.stage}
                          </Badge>
                        ))}
                      </Group>
                    </Box>
                    <IconChevronRight size={18} color="var(--mantine-color-gray-5)" />
                  </Group>
                  <Group gap="xs" wrap="wrap" mt="md">
                    {isLegacyWorkflowItem && routing.mode === 'requisition' && routing.requisitionId && (
                      <Button size="xs" onClick={(event) => { event.stopPropagation(); openInOwnerOrg(row, routing) }}>
                        Open request
                      </Button>
                    )}
                    {isLegacyWorkflowItem && routing.mode === 'field' && routing.workflowRunId && (
                      <Button size="xs" onClick={(event) => { event.stopPropagation(); openInOwnerOrg(row, routing) }}>
                        Open job
                      </Button>
                    )}
                    {isLegacyWorkflowItem && routing.mode === 'ap' && routing.transactionId && (
                      <Button size="xs" onClick={(event) => { event.stopPropagation(); openInOwnerOrg(row, routing) }}>
                        Open payment
                      </Button>
                    )}
                    {isLegacyWorkflowItem && routing.mode === 'ar' && routing.transactionId && (
                      <Button size="xs" onClick={(event) => { event.stopPropagation(); openInOwnerOrg(row, routing) }}>
                        Open collection
                      </Button>
                    )}
                    {isLegacyWorkflowItem && routing.mode === 'generic' && (
                      <>
                        <Button
                          size="xs"
                          onClick={(event) => {
                            event.stopPropagation()
                            void callWorkflowRequestDecision(legacyWorkflowRequestId, 'approve')
                          }}
                        >
                          Approve
                        </Button>
                        <Button
                          size="xs"
                          variant="light"
                          color="red"
                          onClick={(event) => {
                            event.stopPropagation()
                            void callWorkflowRequestDecision(legacyWorkflowRequestId, 'reject')
                          }}
                        >
                          Reject
                        </Button>
                      </>
                    )}
                    {isLegacyWorkflowItem && routing.mode !== 'generic' && !isStageCardRow(row) && (
                      <>
                        <Button
                          size="xs"
                          variant="light"
                          onClick={(event) => {
                            event.stopPropagation()
                            void callWorkflowRequestDecision(legacyWorkflowRequestId, 'approve')
                          }}
                        >
                          Approve
                        </Button>
                        <Button
                          size="xs"
                          variant="light"
                          color="red"
                          onClick={(event) => {
                            event.stopPropagation()
                            void callWorkflowRequestDecision(legacyWorkflowRequestId, 'reject')
                          }}
                        >
                          Reject
                        </Button>
                      </>
                    )}
                    {status === 'draft' && (
                      <Button size="xs" variant="light" onClick={(event) => { event.stopPropagation(); void submitRequest(row.id) }}>
                        Submit
                      </Button>
                    )}
                    {status === 'submitted' && requestType.includes('ecommerce') && (
                      <Button size="xs" onClick={(event) => { event.stopPropagation(); void startWorkflow(row) }}>
                        Start workflow
                      </Button>
                    )}
                    {!isLegacyWorkflowItem && isDecidablePlatformRequest(row) && (
                      <>
                        <Button size="xs" onClick={(event) => { event.stopPropagation(); void decidePlatformRequest(row, 'approve') }}>
                          Approve
                        </Button>
                        <Button size="xs" variant="light" color="red" onClick={(event) => { event.stopPropagation(); void decidePlatformRequest(row, 'reject') }}>
                          Decline
                        </Button>
                      </>
                    )}
                  </Group>
                </Paper>
              )
            })}
          </Stack>
        )}

        {nextCursor && mode !== 'inbox' && (
          <Group justify="flex-end" mt="md">
            <Button variant="default" rightSection={<IconArrowRight size={14} />} onClick={() => void loadRequests(nextCursor, true)} loading={loadingMore}>
              Load more
            </Button>
          </Group>
        )}
      </Card>

      <BottomSheet
        opened={Boolean(selectedRequest)}
        onClose={() => setSelectedRequest(null)}
        title={selectedRequest?.title || 'Request details'}
      >
        {selectedRequest && (
          <Stack gap="md">
            <Group gap="xs" wrap="wrap">
              <Badge variant="light">{normalizeRequestType(selectedRequest)}</Badge>
              <Badge color={statusColor(normalizeStatus(selectedRequest.status))}>{statusLabel(normalizeStatus(selectedRequest.status))}</Badge>
              <Badge variant="outline">{selectedRequest.priority || 'normal'}</Badge>
            </Group>
            <WorkflowDetailBody
              statusCard={(
                <DetailStatusCard
                  status={prettifyValue(String(normalizeStatus(selectedRequest.status)))}
                  amount={selectedRequest.amount}
                  currency={selectedRequest.currency}
                  lines={selectedStatusLines.map((text) => ({ text }))}
                />
              )}
              sections={selectedDetailSections}
              auditItems={selectedTimelineItems}
              auditEmptyText="No audit timeline yet."
            />

            {(selectedIsLegacyWorkflowItem || selectedIsRequisitionLike || selectedIsFieldLike || selectedIsPaymentLike) && (
              <Stack gap="xs">
                <Paper p="md" radius="md" withBorder>
                  <Group justify="space-between" align="center">
                    <Text size="xs" c="dimmed" fw={600}>WORKFLOW ROUTING</Text>
                    <Badge variant="light" color={selectedRequest?.workflowRequestContext === 'personal' ? 'blue' : 'teal'}>
                      {selectedRequest?.workflowRequestContext === 'personal' ? 'Delegated approval' : 'Org inbound approval'}
                    </Badge>
                  </Group>
                  <Text size="sm" mt={8}>
                    Action required: {getRoutingActionLabel(selectedRouting)}.
                  </Text>
                </Paper>

                {(selectedWorkflowType || selectedWorkflowStage || selectedRequiredAction) && (
                  <Paper p="md" radius="md" withBorder>
                    <Text size="xs" c="dimmed" fw={600} mb={8}>FLOW MARKERS</Text>
                    <Group gap="xs" wrap="wrap">
                      {selectedWorkflowType && <Badge variant="outline">{selectedWorkflowType}</Badge>}
                      {selectedWorkflowStage && <Badge variant="outline">{selectedWorkflowStage.replace(/_/g, ' ')}</Badge>}
                      {selectedRequiredAction && <Badge variant="outline">{selectedRequiredAction.replace(/_/g, ' ')}</Badge>}
                    </Group>
                  </Paper>
                )}

                {selectedRouting.mode === 'requisition' && selectedRequisitionId ? (
                  <Paper p="md" radius="md" withBorder>
                    <Text size="xs" c="dimmed" fw={600}>REQUISITION FLOW</Text>
                    <Text size="sm" mt={8}>
                      Requisition lifecycle details are shown in this panel. Use the action controls above (approval/lifecycle) for the next step.
                    </Text>
                  </Paper>
                ) : selectedRouting.mode === 'field' && selectedWorkflowRunId ? (
                  <Button onClick={() => openInOwnerOrg(selectedRequest, selectedRouting)}>
                    Open job
                  </Button>
                ) : selectedRouting.mode === 'ap' && selectedTransactionId ? (
                  <Button onClick={() => openInOwnerOrg(selectedRequest, selectedRouting)}>
                    Open payment
                  </Button>
                ) : selectedRouting.mode === 'ar' && selectedTransactionId ? (
                  <Button onClick={() => openInOwnerOrg(selectedRequest, selectedRouting)}>
                    Open collection
                  </Button>
                ) : null}

                {selectedIsLegacyWorkflowItem && !isStageCardRow(selectedRequest) ? (
                  <Group grow>
                    <Button
                      onClick={() => {
                        if (!selectedLegacyWorkflowRequestId) return
                        void callWorkflowRequestDecision(selectedLegacyWorkflowRequestId, 'approve')
                        setSelectedRequest(null)
                      }}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="light"
                      color="red"
                      onClick={() => {
                        if (!selectedLegacyWorkflowRequestId) return
                        void callWorkflowRequestDecision(selectedLegacyWorkflowRequestId, 'reject')
                        setSelectedRequest(null)
                      }}
                    >
                      Reject
                    </Button>
                  </Group>
                ) : null}

                {!selectedIsLegacyWorkflowItem && (
                  <Group grow>
                    {selectedRequest.status === 'draft' && (
                      <Button onClick={() => { void submitRequest(selectedRequest.id); setSelectedRequest(null) }}>
                        Submit
                      </Button>
                    )}
                    {selectedRequest.status === 'submitted' && normalizeRequestType(selectedRequest).toLowerCase().includes('ecommerce') && (
                      <Button onClick={() => { void startWorkflow(selectedRequest); setSelectedRequest(null) }}>
                        Start workflow
                      </Button>
                    )}
                    {isDecidablePlatformRequest(selectedRequest) && (
                      <>
                        <Button onClick={() => { void decidePlatformRequest(selectedRequest, 'approve'); setSelectedRequest(null) }}>
                          Approve
                        </Button>
                        <Button variant="light" color="red" onClick={() => { void decidePlatformRequest(selectedRequest, 'reject'); setSelectedRequest(null) }}>
                          Decline
                        </Button>
                      </>
                    )}
                    {!['draft', 'submitted', 'in_review'].includes(String(normalizeStatus(selectedRequest.status))) && (
                      <Text size="sm" c="dimmed">Nothing to do on this request right now.</Text>
                    )}
                  </Group>
                )}
              </Stack>
            )}

          </Stack>
        )}
      </BottomSheet>

      <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="Create Request" centered size="lg">
        <Stack gap="md">
          {createError && (
            <Alert icon={<IconAlertCircle size={16} />} color="red" title="Create error">
              {createError}
            </Alert>
          )}

          <Group grow align="start">
            <TextInput
              label="Request Type"
              value={createForm.requestType}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, requestType: event.currentTarget.value }))}
            />
            <TextInput
              label="Title"
              value={createForm.title}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, title: event.currentTarget.value }))}
            />
          </Group>

          <Textarea
            label="Description"
            value={createForm.description}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, description: event.currentTarget.value }))}
          />

          <Group grow align="start">
            <TextInput
              label="Amount"
              value={createForm.amount}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, amount: event.currentTarget.value }))}
            />
            <TextInput
              label="Currency"
              value={createForm.currency}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, currency: event.currentTarget.value }))}
            />
            <TextInput
              label="Target Module"
              value={createForm.targetModule}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, targetModule: event.currentTarget.value }))}
            />
          </Group>

          <Group grow align="start">
            <TextInput
              label="Buyer DID"
              value={createForm.buyerDid}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, buyerDid: event.currentTarget.value }))}
            />
            <TextInput
              label="Buyer Phone"
              value={createForm.buyerPhone}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, buyerPhone: event.currentTarget.value }))}
            />
          </Group>

          <Group grow align="start">
            <TextInput
              label="Discount"
              value={createForm.discount}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, discount: event.currentTarget.value }))}
            />
            <TextInput
              label="Tax Rate"
              value={createForm.taxRate}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, taxRate: event.currentTarget.value }))}
            />
          </Group>

          <Textarea
            label="Items JSON"
            minRows={6}
            value={createForm.itemsJson}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, itemsJson: event.currentTarget.value }))}
          />

          <Group justify="flex-end">
            <Button variant="default" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void createRequest()} loading={createLoading}>
              Create
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={Boolean(orgSwitchPrompt)}
        onClose={() => { if (!orgSwitching) setOrgSwitchPrompt(null) }}
        title="Switch to organization"
        centered
      >
        <Stack gap="sm">
          <Alert color="blue" variant="light" icon={<IconShieldCheck size={16} />}>
            {ORG_SWITCH_COPY[orgSwitchPrompt?.purpose || 'request'].banner}
          </Alert>
          <Text size="sm" c="dimmed">
            Continue as <Text span fw={700}>{orgSwitchPrompt?.orgName}</Text> to {ORG_SWITCH_COPY[orgSwitchPrompt?.purpose || 'request'].action}.
          </Text>
          <Group grow mt="sm">
            <Button variant="default" onClick={() => setOrgSwitchPrompt(null)} disabled={orgSwitching}>
              Cancel
            </Button>
            <Button onClick={() => void confirmOrgSwitch()} loading={orgSwitching}>
              Continue
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
