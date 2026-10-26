import React, { useEffect, useMemo, useRef, useState } from 'react'
import { feedback } from '@/lib/feedback'
import { milestone } from '@/components/feedback/Milestone'
import { LottiePlayer } from '@/components/feedback/LottiePlayer'
import axios from 'axios'
import Link from 'next/link'
import { useRouter } from 'next/router'
import {
  Alert,
  Anchor,
  Badge,
  Box,
  Divider,
  Button,
  Card,
  FileInput,
  Group,
  Image,
  Modal,
  NumberInput,
  Paper,
  SimpleGrid,
  SegmentedControl,
  Select,
  Stack,
  Tabs,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
  UnstyledButton,
} from '@mantine/core'
import { IconActivity, IconAlertCircle, IconArrowRight, IconCash, IconChevronRight, IconInbox, IconListDetails, IconReceipt, IconRefresh, IconShieldCheck, IconUserHeart, IconUsers } from '@tabler/icons-react'
import {
  getOrgScopedToken,
  getPersonalToken,
  isActingAsOrganization,
  organizationNameFor,
  readActiveOrganization,
  switchOrganizationContext,
} from '@/utils/organizationContext'
import { beginPortalTask, endPortalTask, getPortalTask, openOrgSwitcher, readPortalContext } from '@/lib/portalContext'
import { captureOrganizationSwitchContext } from '../../../shared/taskContext'
import { announceInboxChanged } from '../../../shared/guides'
import { CARD_TARGET_ATTR, celebrateSaved } from '../../../shared/cardMotion'
import { familyLinks, requestEventLinks } from '../../../shared/relatedWork'
import { assertRequestDetail, requestExperienceForRow, requestIdFromStageCard, type RequestExperience } from '../../../shared/requestExperience'
import { requestFamily } from '../../../../src/config/requestExperience'
import { readOrgProfile } from '@/utils/orgProfile'
import {
  classifyBusinessCentre,
  getWorkflowCapabilityFlags,
  INBOX_TAB_LABELS,
  isPeopleRequestType,
  visibleInboxTabs,
  type InboxTabKey,
} from '@/lib/workflowCapabilities'
import {
  buildInboxFeed,
  inboxAttention,
  inboxFlowSection,
  INBOX_FLOW_SECTION_LABELS,
  formatTxnTime,
  inboxWhenLabel,
  INBOX_ATTENTION_FILTERS,
  matchesInboxAttention,
  type InboxAttention,
  type InboxAttentionFilter,
} from '@/lib/inboxAttention'
import { purchaseReceiptLine, trailFromRequest } from '@/components/finance/jobAuditTrail'
import BottomSheet from '@/components/shared/BottomSheet'
import { FamilyStrip, RelatedWorkLinks, useRelatedWorkNavigation } from '@/components/workflows/JobHandoffsPanel'
import JobAuditTrailPanel from '@/components/workflows/JobAuditTrailPanel'
import RequestSheet from '@/components/requests/RequestSheet'
import { DetailStatusCard, type DetailTimelineItem, WorkflowDetailBody, type WorkflowDetailSection } from '@/components/finance/WorkflowDetailBody'
import { StageActorTimeline } from '@/components/finance/StageActorTimeline'
import {
  actorsForWorkflow,
  requisitionStages,
  feptStages,
  offerReplacement,
  requestKindLabel,
  stepRequiredLabel,
  familyChain,
  relatedWorkLine,
  type WorkFamily,
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
  people?: StagePerson[]
  inboxItemId?: string
  experience?: RequestExperience
  events?: unknown[]
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
  /** Mirrors PlatformRequestService.RequestNextStep: what an approved request still needs. */
  nextStep?: {
    toStatus: 'completed'
    label: string
    hint: string
    /** `image`: a photo of the receipt or bill (uploaded here; taken live on the phone). */
    fields: Array<{ name: string; label: string; type: 'text' | 'number' | 'image'; required?: boolean; hint?: string }>
  }
  /** Mirrors PlatformRequestService.RequestReceipt without the photo bytes: what was recorded when it was finished. */
  receipt?: {
    receiptRef?: string
    billRef?: string
    amount?: number
    hasPhoto: boolean
    record?: { id: string; type: string; label: string }
    recordedAt?: string
  }
  /** Where this request sits: the job that raised it, or the request it follows. */
  family?: WorkFamily
}

interface RequestListResponse {
  items: RequestRow[]
  nextCursor: string | null
}

interface RequestWorkspaceProps {
  mode: 'inbox' | 'requests'
  category?: RequestCategoryTab
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

/** Same tab keys and labels as the phone inbox (credo-ui/mobile/pages/inbox.tsx); receipts and archive live on the phone only. */
type RequestCategoryTab = Extract<InboxTabKey, 'all' | 'jobs' | 'requisitions' | 'people' | 'school_fees' | 'payments' | 'supplier_bills' | 'counter_sales'>
const REQUEST_CATEGORY_TABS: RequestCategoryTab[] = ['all', 'jobs', 'requisitions', 'people', 'school_fees', 'payments', 'supplier_bills', 'counter_sales']
const TAB_ICONS: Record<RequestCategoryTab, React.ReactNode> = {
  all: <IconListDetails size={14} />,
  jobs: <IconActivity size={14} />,
  requisitions: <IconUsers size={14} />,
  people: <IconUserHeart size={14} />,
  school_fees: <IconReceipt size={14} />,
  payments: <IconReceipt size={14} />,
  supplier_bills: <IconCash size={14} />,
  counter_sales: <IconReceipt size={14} />,
}

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

/** Leave, expense claims and their records: the People & payroll module (same rule as the phone inbox). */
function isPeopleLikeRequest(row: RequestRow): boolean {
  return isPeopleRequestType(normalizeRequestType(row))
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
    || requestType.includes('cash')
    || workflowType.includes('cash-counter')
    || workflowType.includes('cash_counter')
  )
}

function isPaymentsLikeRequest(row: RequestRow): boolean {
  const requestType = normalizeRequestTypeForFilter(normalizeRequestType(row))
  const routing = getWorkflowRequestRouting(row)
  const workflowType = normalizeRequestTypeForFilter(routing.workflowType)
  return (
    routing.mode === 'ar'
    || requestType.includes('collection')
    || workflowType.includes('collection')
    || requestType.includes('receivable')
    || workflowType.includes('receivable')
    || requestType.includes('payment')
    || workflowType.includes('payment')
  )
}

function isSupplierBillLikeRequest(row: RequestRow): boolean {
  return getWorkflowRequestRouting(row).mode === 'ap'
}

function matchesCategoryTab(row: RequestRow, tab: RequestCategoryTab): boolean {
  if (tab === 'all') return true
  const routing = getWorkflowRequestRouting(row)
  const classification = classifyBusinessCentre({
    requestType: normalizeRequestType(row),
    workflowType: routing.workflowType,
  })
  // Staff requests are decided first so a request id in the context cannot file them under Jobs.
  if (classification.centre === 'people' || isPeopleLikeRequest(row)) return tab === 'people'
  if (tab === 'people') return false
  if (tab === 'school_fees') return classification.centre === 'school_fees' || isSchoolFeesLikeRequest(row)
  if (tab === 'jobs') return classification.centre === 'field_jobs' || isFeptLikeRequest(row)
  if (tab === 'requisitions') return classification.centre === 'purchases' || isRequisitionLikeRequest(row)
  if (tab === 'payments') return classification.centre === 'standalone_collection' || isPaymentsLikeRequest(row)
  if (tab === 'supplier_bills') return isSupplierBillLikeRequest(row)
  if (tab === 'counter_sales') return isRtcLikeRequest(row)
  return true
}

function normalizeCreatedAt(row: RequestRow): string | undefined {
  return row.createdAt || row.created_at || row.submittedAt || row.submitted_at
}

/** Latest activity on a row: a request that moved on today counts as today's. */
function inboxActivityTime(row: RequestRow): number {
  const times = [normalizeCreatedAt(row), row.updatedAt || row.updated_at]
    .map((value) => Date.parse(value || ''))
    .filter((value) => Number.isFinite(value))
  return times.length ? Math.max(...times) : NaN
}

/** The inbox whose read marks are kept on the server: the person's own, or the active organisation's. */
function portalInboxReadTarget(): { token: string; scope: string } | null {
  if (readPortalContext().mode === 'org') {
    const orgId = readActiveOrganization()?.orgTenantId
    const token = getOrgScopedToken()
    return orgId && token ? { token, scope: orgId } : null
  }
  const token = getPersonalToken()
  return token ? { token, scope: 'personal' } : null
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

  if (requestFamily(normalizeRequestType(row), workflowType)?.experience.family === 'field_jobs') {
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
  offerUri?: string
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

interface PendingPaymentReceipt {
  receiptRowId: string
  sourceType?: string
  offerUri?: string
  credentialType?: string
  invoiceRef?: string
  issuedAt?: string
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
  if (requestIdFromStageCard(card.sourceId, claims)) return null
  const workflowType = String(claims.workflowType || claims.requestType || '').toLowerCase()
  const requestType = String(claims.requestType || '').toLowerCase()
  if (!/fept|field/.test(`${workflowType} ${requestType}`)) return null
  const workflowRunId = String(
    card.workflowRunId
      || claims.workflowRunId
      || String(card.sourceId || '').replace(/:(signoff|payout|review|inspection|safety-hold:[^:]+|safety-resume:[^:]+)(:delegation:.*)?$/i, ''),
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
    title: String(card.title || stepRequiredLabel({ stageAction }) || 'Job waiting for you'),
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
      stageAction,
      requiredAction: stageAction,
      workflowRunId,
      source: 'workflow_stage_card',
      replaces: claims.replaces,
    }),
    __source: 'workflow_request',
    workflowRequestId: cardId,
    workflowRequestContext: 'personal',
  }
}

/** A purchase, bill or payment card. Opens the request, and says which job it belongs to. */
function mapPurchaseStageCardToRow(card: StageCardApiRow): RequestRow | null {
  const sourceType = String(card.sourceType || '')
  const credentialType = String(card.credentialType || '').toLowerCase()
  if (sourceType !== 'workflow_stage_action' && credentialType !== 'workflowstageaction') return null
  if (['accepted', 'resolved'].includes(String(card.status || '').toLowerCase())) return null
  const claims = card.claims && typeof card.claims === 'object' ? card.claims : {}
  const requestType = String(claims.requestType || '').toLowerCase()
  const declaredRequestId = requestIdFromStageCard(card.sourceId, claims)
  if (!declaredRequestId && /field|fept/.test(requestType)) return null
  // Purchases and payments, plus what staff raise from Home: time off, expense claims, payout
  // nudges, and general asks. Same rule as the phone inbox (`<module>.<kind>`, not a job step).
  if (!declaredRequestId && !/requisition|purchase|payment|procurement|expense|invoice|quote|hr\.leave|payout_request|platform\.general/.test(requestType)) return null
  const requestId = declaredRequestId || String(card.sourceId || '').replace(/:delegation:.*$/, '')
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return null
  const partOf = String(claims.partOfLine || '').trim()
  const hold = String(claims.holdLine || '').trim()
  // The organisation the request belongs to, so a personal inbox can switch into it before deciding.
  const ownerOrgTenantId = String(claims.targetOrgTenantId || claims.orgTenantId || card.issuerTenantId || '')
  return {
    id: requestId,
    __source: 'platform',
    requestType,
    request_type: requestType,
    title: String(card.title || 'Request'),
    description: [partOf, hold].filter(Boolean).join('. ') || String(card.body || ''),
    status: String(claims.requestStatus || 'submitted'),
    createdAt: card.createdAt,
    context_json: JSON.stringify({ ownerOrgTenantId, workflowType: claims.workflowType, source: 'workflow_stage_card' }),
    family: partOf
      ? {
          partOfLine: partOf,
          holdLine: hold || undefined,
          fromLabel: String(claims.fromLabel || 'From a job'),
          chain: [],
          root: claims.parentRunId
            ? {
                kind: 'job',
                id: String(claims.parentRunId),
                label: claims.parentReference ? `Job ${String(claims.parentReference)}` : 'Job',
                reference: claims.parentReference ? String(claims.parentReference) : undefined,
                title: claims.parentTitle ? String(claims.parentTitle) : undefined,
                statusLabel: 'Waiting',
              }
            : undefined,
        }
      : undefined,
  }
}

/** Record offers stay in the holder's inbox, separate from workflow action cards. */
function mapRecordOfferToRow(card: StageCardApiRow, holder: 'personal' | 'org'): RequestRow | null {
  const sourceType = String(card.sourceType || '')
  const sources = holder === 'org'
    ? ['workflow_vc_offer']
    : ['workflow_vc_offer', 'org_employee', 'org_workflow_actor', 'org_delegation', 'employment_contract', 'platform_identity', 'payment', 'invoice_offer', 'quote_offer']
  if (!sources.includes(sourceType) || !card.offerUri) return null
  if (['accepted', 'resolved'].includes(String(card.status || '').toLowerCase())) return null
  const claims = card.claims && typeof card.claims === 'object' ? card.claims : {}
  const cardId = String(card.id || card.offerId || card.offerUri)
  return {
    id: `rec:${cardId}`,
    request_type: holder === 'org' ? 'org_record' : 'personal_record',
    requestType: holder === 'org' ? 'org_record' : 'personal_record',
    title: String(card.title || 'Record'),
    description: String(card.body || ''),
    status: 'submitted',
    createdAt: card.createdAt,
    updatedAt: card.createdAt,
    context_json: JSON.stringify({
      source: 'record_offer',
      offerSourceType: sourceType,
      offerUri: card.offerUri,
      workflowRunId: String(card.workflowRunId || claims.workflowRunId || ''),
      replaces: claims.replaces,
    }),
    workflowRequestContext: holder,
  }
}

function isRecordOfferRow(row: RequestRow | null): boolean {
  if (!row) return false
  return String((parseRequestContext(row) as Record<string, unknown>).source || '') === 'record_offer'
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
    ? `Waiting on ${String(workflowStage || requiredAction).replace(/_/g, ' ')}`
    : 'Waiting for a decision'

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

function getRoutingActionLabel(routing: ReturnType<typeof getWorkflowRequestRouting>): string {
  const step = stepRequiredLabel({ requiredAction: routing.requiredAction })
  if (step) return step.toLowerCase()

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

function buildDetailTimelineItems(row: RequestRow, people: StagePerson[]): DetailTimelineItem[] {
  if (Array.isArray(row.events)) {
    return trailFromRequest(row, people).steps.map((step) => ({
      id: step.id,
      title: step.title,
      source: step.by || 'Recorded',
      timestamp: step.at ? formatTxnTime(step.at) : undefined,
      description: step.details.join(' · '),
      content: <RelatedWorkLinks links={step.related} />,
    }))
  }
  const createdAt = normalizeCreatedAt(row)
  const updatedAt = row.updatedAt || row.updated_at

  const auditItems: DetailTimelineItem[] = []
  if (createdAt) {
    auditItems.push({
      id: `${row.id}:created`,
      title: 'Request created',
      source: 'Recorded',
      timestamp: formatTxnTime(createdAt),
      content: <RelatedWorkLinks links={requestEventLinks(row.family, row.id, 'request.created')} />,
      badge: { label: 'done', color: 'teal' },
    })
  }
  if (updatedAt) {
    auditItems.push({
      id: `${row.id}:updated`,
      title: 'Last status update',
      source: 'workflow',
      timestamp: formatTxnTime(updatedAt),
      badge: { label: 'recorded', color: 'gray' },
    })
  }

  return auditItems
}

function stagesForInboxRow(row: RequestRow): { stages: FinanceStageView[]; hints: string[] } {
  const routing = getWorkflowRequestRouting(row)
  const workflowStage = String((parseRequestContext(row) as any).workflowStage || '')
  if (routing.mode === 'requisition' && workflowStage) {
    return {
      stages: requisitionStages(workflowStage),
      hints: ['requisition'],
    }
  }
  if (routing.mode === 'field' && workflowStage) {
    return {
      stages: feptStages(workflowStage, parseRequestContext(row) as any),
      hints: ['field', 'fept'],
    }
  }
  const experience = requestExperienceForRow(row, routing.workflowType)
  return { stages: experience.stages, hints: [experience.workflowType] }
}

export default function RequestWorkspace({ mode, category }: RequestWorkspaceProps) {
  const router = useRouter()
  const openRelatedWork = useRelatedWorkNavigation()
  const [taskOnly, setTaskOnly] = useState(false)
  useEffect(() => { setTaskOnly(Boolean(getPortalTask())) }, [router.asPath])
  const [orgTenantId, setOrgTenantId] = useState('')
  const [orgName, setOrgName] = useState('')
  const [orgProfile, setOrgProfile] = useState<ReturnType<typeof readOrgProfile>>(null)
  const [activeWorkflowTemplateId, setActiveWorkflowTemplateId] = useState<string | null>(null)
  const [actorReports, setActorReports] = useState<WorkflowActorReport[]>([])
  const [orgMembers, setOrgMembers] = useState<StagePerson[]>([])
  const [items, setItems] = useState<RequestRow[]>([])
  const [selectedRequest, setSelectedRequest] = useState<RequestRow | null>(null)
  const [requestView, setRequestView] = useState<'cards' | 'table'>('cards')
  const [detailError, setDetailError] = useState('')
  const [detailLoading, setDetailLoading] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [linkedOnly, setLinkedOnly] = useState(false)
  const [attention, setAttention] = useState<InboxAttentionFilter>('all')
  const [openedIds, setOpenedIds] = useState<Set<string>>(new Set())
  // When the person last looked at this inbox, as it was when the page opened.
  const [lastSeenSnapshot, setLastSeenSnapshot] = useState<string | null>(null)
  const [arrivals, setArrivals] = useState(0)
  const knownRowIdsRef = useRef<Set<string> | null>(null)
  const [requestCategoryTab, setRequestCategoryTab] = useState<RequestCategoryTab>('all')
  // Enabled workflow templates of the organisation: the same source the Money page uses for
  // its tabs, so Inbox, Requests and Money offer the same set.
  const [activeTemplates, setActiveTemplates] = useState<OrganizationWorkflowTemplate[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  // Same step as the app's inbox: an item that belongs to an organization is opened as that
  // organization, and the person confirms the switch first.
  const [orgSwitchPrompt, setOrgSwitchPrompt] = useState<{ orgTenantId: string; orgName: string; href: string; purpose: OrgSwitchPurpose } | null>(null)
  const [orgSwitching, setOrgSwitching] = useState(false)

  const backendUrl = process.env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'

  useEffect(() => {
    try {
      const raw = localStorage.getItem('portal-inbox-opened')
      const parsed = raw ? JSON.parse(raw) : []
      if (Array.isArray(parsed)) setOpenedIds(new Set(parsed.map(String)))
    } catch {
      setOpenedIds(new Set())
    }
  }, [])

  // Read marks and "last seen" live on the server, so an item opened on the phone is not new here.
  useEffect(() => {
    if (mode !== 'inbox') return undefined
    const target = portalInboxReadTarget()
    if (!target) return undefined
    let cancelled = false
    axios
      .get(`${backendUrl}/api/wallet/credentials/inbox-read-state`, {
        params: { scope: target.scope },
        headers: { Authorization: 'Bearer ' + target.token },
      })
      .then((res) => {
        if (cancelled) return
        const keys: string[] = Array.isArray(res.data?.readKeys) ? res.data.readKeys.filter((key: unknown) => typeof key === 'string') : []
        if (keys.length) setOpenedIds((prev) => new Set([...prev, ...keys]))
        setLastSeenSnapshot(typeof res.data?.lastSeenAt === 'string' ? res.data.lastSeenAt : null)
        postReadState({ lastSeenAt: new Date().toISOString() })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [mode])

  const postReadState = (update: { readKeys?: string[]; lastSeenAt?: string }) => {
    const target = portalInboxReadTarget()
    if (!target) return
    axios
      .post(`${backendUrl}/api/wallet/credentials/inbox-read-state`, { scope: target.scope, ...update }, {
        headers: { Authorization: 'Bearer ' + target.token },
      })
      .catch(() => undefined)
  }

  // Rows that arrive while the person is scrolled down: a pill offers to jump back to the top.
  useEffect(() => {
    if (mode !== 'inbox') return
    const ids = new Set(items.map((row) => row.id))
    const known = knownRowIdsRef.current
    knownRowIdsRef.current = ids
    if (!known || typeof window === 'undefined') return
    let fresh = 0
    ids.forEach((id) => { if (!known.has(id)) fresh += 1 })
    if (fresh > 0 && window.scrollY > 200) setArrivals((count) => count + fresh)
  }, [items, mode])

  useEffect(() => {
    if (arrivals === 0 || typeof window === 'undefined') return undefined
    const onScroll = () => { if (window.scrollY < 80) setArrivals(0) }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [arrivals])

  useEffect(() => {
    const activeOrg = readActiveOrganization()
    setOrgProfile(readOrgProfile())
    if (activeOrg?.orgTenantId) {
      setOrgTenantId(activeOrg.orgTenantId)
      setOrgName(activeOrg.name)
    }
  }, [])

  useEffect(() => {
    const requestTypeFromQuery = String(router.query?.requestType || '').trim().toLowerCase()
    if (requestTypeFromQuery) {
      if (requestTypeFromQuery.includes('requis')) setRequestCategoryTab('requisitions')
      else if (requestTypeFromQuery.includes('field') || requestTypeFromQuery.includes('fept') || requestTypeFromQuery === 'jobs') setRequestCategoryTab('jobs')
      else if (requestTypeFromQuery.includes('school') || requestTypeFromQuery.includes('education')) setRequestCategoryTab('school_fees')
      else if (requestTypeFromQuery.includes('payable') || requestTypeFromQuery.startsWith('ap')) setRequestCategoryTab('supplier_bills')
      else if (requestTypeFromQuery.includes('collection') || requestTypeFromQuery.includes('payment')) setRequestCategoryTab('payments')
      else setRequestCategoryTab('all')
    }

    const statusFromQuery = String(router.query?.status || '').trim().toLowerCase()
    if (statusFromQuery) {
      setStatusFilter(statusFromQuery)
    }
  }, [router.query])

  // `?request=<id>` (alias `?requestId=`) opens that request: a child clicked on a job's
  // "Where this fits", the request just raised on the Purchases page, or an inbox link.
  // The list only holds the first page, so a request not on it is fetched on its own.
  const requestIdFromQuery = String(router.query?.request || router.query?.requestId || '').trim()
  const openedNotificationItem = useRef('')
  useEffect(() => {
    const itemId = typeof router.query.item === 'string' ? router.query.item : ''
    if (!itemId || loading || openedNotificationItem.current === itemId) return
    const row = items.find((item) => item.inboxItemId === itemId)
    if (row && isRecordOfferRow(row)) {
      // Card offers are accepted from their row, not the job drawer: bring the row into view instead.
      openedNotificationItem.current = itemId
      requestAnimationFrame(() => {
        const element = document.querySelector<HTMLElement>(`[data-inbox-item="${CSS.escape(itemId)}"]`)
        element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        element?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
      })
    } else if (row) {
      openedNotificationItem.current = itemId
      setSelectedRequest(row)
    } else {
      setError('This inbox item is no longer available in this account. Refresh the inbox or check your records.')
    }
  }, [router.query.item, items, loading])
  useEffect(() => {
    if (!requestIdFromQuery || loading) return
    const row = items.find((item) => item.id === requestIdFromQuery)
    if (row && (row.__source !== 'platform' || Array.isArray(row.events))) {
      setSelectedRequest(row)
      return
    }
    const token = getOrgScopedToken()
    if (!token) return
    let cancelled = false
    const assertCurrent = captureOrganizationSwitchContext(localStorage)
    axios
      .get(`${backendUrl}/api/platform/requests/${encodeURIComponent(requestIdFromQuery)}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (cancelled || !res.data?.id) return
        assertCurrent()
        setSelectedRequest({ ...(res.data as RequestRow), __source: 'platform' })
      })
      .catch((error) => {
        if (!cancelled) setError(error.response?.data?.message || error.message || 'Could not open this request.')
      })
    return () => {
      cancelled = true
    }
  }, [requestIdFromQuery, items, loading])

  const visibleItems = useMemo(() => {
    const requisitionIdFromQuery = String(router.query?.requisitionId || '').trim()
    const transactionIdFromQuery = String(router.query?.transactionId || '').trim()
    const workflowRunIdFromQuery = String(router.query?.workflowRunId || '').trim()
    const workflowRequestIdFromQuery = String(router.query?.workflowRequestId || '').trim()
    const filtered = items.filter((row) => {
      const status = normalizeStatus(row.status)

      if (mode === 'inbox') {
        const state = inboxAttention({ status, isRead: openedIds.has(row.id), stillOpen: Boolean(row.nextStep) })
        if (!matchesInboxAttention(state, attention)) return false
      } else if (statusFilter !== 'all' && status !== statusFilter) return false
      if (mode !== 'inbox' && linkedOnly && !relatedWorkLine(row.family)) return false
      if (!matchesCategoryTab(row, category || requestCategoryTab)) return false
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

    return filtered.sort((a, b) => {
      const aTime = mode === 'inbox' ? inboxActivityTime(a) : new Date(normalizeCreatedAt(a) || 0).getTime()
      const bTime = mode === 'inbox' ? inboxActivityTime(b) : new Date(normalizeCreatedAt(b) || 0).getTime()
      return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime)
    })
  }, [items, mode, category, requestCategoryTab, statusFilter, linkedOnly, attention, openedIds, router.query])

  const requestCategoryCounts = useMemo(() => {
    const counts: Record<RequestCategoryTab, number> = {
      all: 0,
      jobs: 0,
      requisitions: 0,
      people: 0,
      school_fees: 0,
      payments: 0,
      supplier_bills: 0,
      counter_sales: 0,
    }

    items.forEach((row) => {
      const status = normalizeStatus(row.status)
      if (mode === 'inbox') {
        const state = inboxAttention({ status, isRead: openedIds.has(row.id), stillOpen: Boolean(row.nextStep) })
        if (!matchesInboxAttention(state, attention)) return
      } else if (statusFilter !== 'all' && status !== statusFilter) return

      for (const tab of REQUEST_CATEGORY_TABS) {
        if (matchesCategoryTab(row, tab)) counts[tab] += 1
      }
    })

    return counts
  }, [items, mode, statusFilter, attention, openedIds])

  // Tabs follow what the organisation switched on at setup, plus any kind already in the list.
  const visibleCategoryTabs = useMemo(() => {
    const flags = getWorkflowCapabilityFlags(activeTemplates, orgProfile?.access ?? null)
    const orgKinds = orgProfile?.kinds || []
    return visibleInboxTabs({ flags, orgKinds, counts: requestCategoryCounts }, REQUEST_CATEGORY_TABS) as RequestCategoryTab[]
  }, [activeTemplates, requestCategoryCounts, orgProfile])

  useEffect(() => {
    if (!visibleCategoryTabs.includes(requestCategoryTab)) setRequestCategoryTab('all')
  }, [requestCategoryTab, visibleCategoryTabs])

  // `?tab=<category>` is the short form the Money page redirect, the Purchases "New" page and the
  // sidebar ("Staff requests") use (`?requestType=` is the older long form). The tabs only appear
  // once the organisation's templates and rows have loaded, so the choice is applied the first
  // time that tab is on screen and then left alone so a later click is not undone.
  const appliedTabQueryRef = useRef('')
  useEffect(() => {
    const tabFromQuery = String(router.query?.tab || '').trim().toLowerCase()
    if (!tabFromQuery || appliedTabQueryRef.current === tabFromQuery) return
    if (!visibleCategoryTabs.includes(tabFromQuery as RequestCategoryTab)) return
    appliedTabQueryRef.current = tabFromQuery
    setRequestCategoryTab(tabFromQuery as RequestCategoryTab)
  }, [router.query?.tab, visibleCategoryTabs])

  const attentionCounts = useMemo(() => {
    const counts: Record<InboxAttention, number> = { new: 0, opened: 0, done: 0 }
    if (mode !== 'inbox') return counts
    items.forEach((row) => {
      if (!matchesCategoryTab(row, requestCategoryTab)) return
      const state = inboxAttention({ status: normalizeStatus(row.status), isRead: openedIds.has(row.id), stillOpen: Boolean(row.nextStep) })
      counts[state] += 1
    })
    return counts
  }, [items, mode, requestCategoryTab, openedIds])

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

    // No connection: keep the list already on screen. Do not replace it with an empty one.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return
    }

    if (append) setLoadingMore(true)
    else setLoading(true)
    setError(null)

    const loadContext = captureOrganizationSwitchContext(localStorage)
    try {
      const task = getPortalTask()
      if (task) {
        const url = new URL(window.location.href)
        const id = url.searchParams.get('requestId') || url.searchParams.get('request')
        if (!id) throw new Error('Open the request from your inbox to continue.')
        const startingUrl = window.location.href
        setSelectedRequest(null)
        const assertCurrent = captureOrganizationSwitchContext(localStorage)
        const res = await axios.get<RequestRow>(`${backendUrl}/api/platform/requests/${encodeURIComponent(id)}`, {
          headers: { Authorization: `Bearer ${orgToken}` },
        })
        assertCurrent()
        if (window.location.href !== startingUrl) return
        const row: RequestRow = { ...res.data, __source: 'platform' }
        setItems([row])
        setSelectedRequest(row)
        setNextCursor(null)
        return
      }
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
          workflowRequestContext: 'org' as const,
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
      const personalInbox = readPortalContext().mode !== 'org'

      if (personalInbox && personalToken) {
        try {
          const assignedRes = await axios.get<WorkflowRequestApiRow[]>(
            `${backendUrl}/workflow-requests/assigned`,
            {
              params: { limit: 50 },
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
            const row = mapStageCardToRow(card) || mapPurchaseStageCardToRow(card) || mapRecordOfferToRow(card, 'personal')
            if (row) workflowRows.push({ ...row, inboxItemId: card.id || card.offerId })
          })
          // Reading pending offers may have saved cards automatically.
          announceInboxChanged()
        } catch {
          // Cards are optional; the rest of the inbox still loads.
        }
        try {
          const receiptsRes = await axios.get<{ pendingReceipts: PendingPaymentReceipt[] }>(
            `${backendUrl}/api/wallet/credentials/pending-receipts`,
            { headers: { Authorization: `Bearer ${personalToken}` } },
          )
          for (const receipt of receiptsRes.data.pendingReceipts) {
            if (receipt.sourceType !== 'payment') continue
            const row = mapRecordOfferToRow({
              id: receipt.receiptRowId,
              sourceType: receipt.sourceType,
              offerUri: receipt.offerUri,
              credentialType: receipt.credentialType,
              title: `Payment receipt${receipt.invoiceRef ? ` · ${receipt.invoiceRef}` : ''}`,
              body: 'Your payment was recorded. Keep this receipt in your personal records.',
              createdAt: receipt.issuedAt,
            }, 'personal')
            if (row) workflowRows.push(row)
          }
        } catch (err) {
          if (!loadContext.isCurrent()) return
          feedback.error(axios.isAxiosError(err) ? err.response?.data?.message || err.message : 'Refresh your inbox to try again.', { title: 'Could not load payment receipts' })
        }
      }

      if (!personalInbox && orgToken) {
        try {
          const offersRes = await axios.get(`${backendUrl}/api/wallet/credentials/pending-offers`, {
            params: { holder: 'organization' },
            headers: { Authorization: `Bearer ${orgToken}` },
          })
          const offers: StageCardApiRow[] = Array.isArray(offersRes.data?.offers)
            ? offersRes.data.offers
            : Array.isArray(offersRes.data) ? offersRes.data : []
          offers.forEach((card) => {
            const row = mapStageCardToRow(card) || mapPurchaseStageCardToRow(card) || mapRecordOfferToRow(card, 'org')
            if (row) workflowRows.push({ ...row, inboxItemId: card.id || card.offerId, workflowRequestContext: 'org' })
          })
        } catch {
          // Organisation records are optional; the rest of the inbox still loads.
        }
        try {
          const inboundRes = await axios.get<WorkflowRequestApiRow[]>(
            `${backendUrl}/workflow-requests/inbound`,
            {
              params: { limit: 50 },
              headers: { Authorization: `Bearer ${orgToken}` },
            },
          )

          const inbound = Array.isArray(inboundRes.data) ? inboundRes.data : []
          workflowRows.push(...inbound.map((item) => mapWorkflowRequestToRow(item, 'org')))
        } catch {
          // Keep inbox responsive when org inbox context is unavailable.
        }
      }

      if (!loadContext.isCurrent()) return
      setItems((prev) => (append ? [...prev, ...workflowRows] : workflowRows))
      setNextCursor(null)
    } catch (err: any) {
      if (!loadContext.isCurrent()) return
      setError(err?.response?.data?.message || err?.message || 'Failed to load requests')
    } finally {
      if (loadContext.isCurrent()) {
        setLoading(false)
        setLoadingMore(false)
      }
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
      if (owner && mode === 'inbox') beginPortalTask(owner, href)
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
      feedback.warn('Your personal session has ended. Sign in to continue as this organization.', { title: 'Sign in again' })
      setOrgSwitchPrompt(null)
      return
    }
    setOrgSwitching(true)
    try {
      await switchOrganizationContext({ backendUrl, orgTenantId: orgSwitchPrompt.orgTenantId, orgName: orgSwitchPrompt.orgName, personalToken })
      if (mode === 'inbox') beginPortalTask(orgSwitchPrompt.orgTenantId, orgSwitchPrompt.href)
      setSelectedRequest(null)
      // Full load so the header, menus and the finance page all pick up the organization session.
      window.location.assign(orgSwitchPrompt.href)
    } catch (err: any) {
      feedback.fromError(err, { title: 'Could not switch', fallback: 'Try again from the account picker.' })
      setOrgSwitching(false)
      setOrgSwitchPrompt(null)
    }
  }

  const openRequestDetails = (row: RequestRow) => {
    setSelectedRequest(row)
    if (mode !== 'inbox' || !row.id || openedIds.has(row.id)) return
    const next = new Set(openedIds)
    next.add(row.id)
    setOpenedIds(next)
    try {
      const kept = Array.from(next).slice(-500)
      localStorage.setItem('portal-inbox-opened', JSON.stringify(kept))
    } catch {
      // Opening still works if the browser will not store the list.
    }
    postReadState({ readKeys: [row.id] })
  }

  const markAllRead = (rows: RequestRow[]) => {
    const ids = rows.map((row) => row.id).filter(Boolean)
    if (!ids.length) return
    const next = new Set([...openedIds, ...ids])
    setOpenedIds(next)
    try {
      localStorage.setItem('portal-inbox-opened', JSON.stringify(Array.from(next).slice(-500)))
    } catch {
      // Still marked for this visit.
    }
    for (let i = 0; i < ids.length; i += 500) postReadState({ readKeys: ids.slice(i, i + 500) })
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

      setActiveTemplates(templates.filter((template) => template.enabled))
      setActiveWorkflowTemplateId(match?.id || null)
    } catch {
      setActiveTemplates([])
      setActiveWorkflowTemplateId(null)
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
    const owner = ownerOrgFor(row)
    let temporary = false
    let token = owner && isActingAsOrganization(owner) ? getOrgScopedToken() : null
    if (!token && owner) {
      const personalToken = getPersonalToken()
      if (!personalToken) {
        setError('Sign in again, then decide on this request.')
        return
      }
      try {
        token = await switchOrganizationContext({
          backendUrl,
          orgTenantId: owner,
          orgName: organizationNameFor(owner) || undefined,
          personalToken,
        })
      } catch (err: any) {
        setError(err?.response?.data?.message || err?.message || 'Could not open the organisation to decide this.')
        return
      }
    }
    if (!token) token = getOrgScopedToken()
    if (!token) {
      setError('Switch to organization context first.')
      return
    }
    if (owner && mode === 'inbox') {
      beginPortalTask(owner)
      temporary = true
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
      if (temporary) endPortalTask()
      if (action === 'approve') milestone.show({ kind: 'request_approved', title: 'Approved', detail: row.title ? String(row.title) : undefined })
      else feedback.info('The request was declined.', { title: 'Declined' })
      await loadRequests(null, false)
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || `Could not ${action === 'approve' ? 'approve' : 'decline'} this request`)
    } finally {
      if (temporary) endPortalTask()
    }
  }

  // Finish an approved request: mark a purchase bought, an order delivered, a payment paid.
  const [finishing, setFinishing] = useState<RequestRow | null>(null)
  const [finishValues, setFinishValues] = useState<Record<string, string | number>>({})
  /** Photo of the receipt or bill chosen for the finish form, as a data URL. */
  const [finishPhoto, setFinishPhoto] = useState<string | null>(null)
  const [finishBusy, setFinishBusy] = useState(false)
  const [finishError, setFinishError] = useState<string | null>(null)
  /** Photo of the receipt on the request being viewed, loaded when the detail opens. */
  const [receiptPhoto, setReceiptPhoto] = useState<string | null>(null)

  useEffect(() => {
    setDetailError('')
    setDetailLoading(false)
    if (!selectedRequest || selectedRequest.__source !== 'platform' || Array.isArray(selectedRequest.events)) return
    const owner = ownerOrgFor(selectedRequest)
    const orgToken = owner && isActingAsOrganization(owner) ? getOrgScopedToken() : null
    const token = orgToken || getPersonalToken()
    if (!token) return
    const path = orgToken ? `/api/platform/requests/${encodeURIComponent(selectedRequest.id)}`
      : `/api/platform/requests/mine/${encodeURIComponent(selectedRequest.id)}`
    const assertCurrent = captureOrganizationSwitchContext(localStorage)
    let cancelled = false
    setDetailLoading(true)
    axios.get(`${backendUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (cancelled || !assertCurrent.isCurrent()) return
        assertRequestDetail(res.data, selectedRequest.id)
        setSelectedRequest({ ...selectedRequest, ...(res.data as RequestRow), __source: 'platform' })
      })
      .catch((error) => {
        if (!cancelled && assertCurrent.isCurrent()) {
          setDetailError(error?.response?.status === 404
            ? 'Full request history is available in the owning organisation. Use its action to continue in that context.'
            : error?.response?.data?.message || error?.message || 'Could not load request history. Close the request and try again.')
        }
      })
      .finally(() => { if (!cancelled) setDetailLoading(false) })
    return () => { cancelled = true }
  }, [selectedRequest?.id, selectedRequest?.events])

  const openFinish = (row: RequestRow) => {
    setFinishing(row)
    setFinishValues({})
    setFinishPhoto(null)
    setFinishError(null)
  }

  const chooseFinishPhoto = (file: File | null) => {
    setFinishError(null)
    if (!file) {
      setFinishPhoto(null)
      return
    }
    if (!file.type.startsWith('image/')) {
      setFinishError('Choose a photo of the receipt (JPEG or PNG).')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setFinishPhoto(typeof reader.result === 'string' ? reader.result : null)
    reader.onerror = () => setFinishError('Could not read that photo. Try another.')
    reader.readAsDataURL(file)
  }

  useEffect(() => {
    setReceiptPhoto(null)
    if (!selectedRequest?.receipt?.hasPhoto) return
    const token = getOrgScopedToken()
    if (!token) return
    let cancelled = false
    axios
      .get(`${backendUrl}/api/platform/requests/${encodeURIComponent(selectedRequest.id)}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        const photo = res.data?.receipt?.photoUri
        if (!cancelled && typeof photo === 'string') setReceiptPhoto(photo)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [selectedRequest?.id, selectedRequest?.receipt?.hasPhoto])

  const finishPlatformRequest = async () => {
    if (!finishing?.nextStep) return
    const token = getOrgScopedToken()
    if (!token) {
      setFinishError('Switch to organization context first.')
      return
    }
    const imageField = finishing.nextStep.fields.find((field) => field.type === 'image')
    if (imageField?.required && !finishPhoto) {
      setFinishError(`${imageField.label} is needed.`)
      return
    }
    setFinishBusy(true)
    setFinishError(null)
    try {
      await axios.post(
        `${backendUrl}/api/platform/requests/transition`,
        { requestId: finishing.id, toStatus: finishing.nextStep.toStatus, payload: { ...finishValues, receiptImage: finishPhoto || undefined } },
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (finishing.nextStep.toStatus === 'completed') {
        milestone.show({ kind: 'workflow_complete', title: 'Request completed', detail: finishing.title ? String(finishing.title) : undefined })
      } else {
        feedback.success('Saved. Related work can continue when its required steps are complete.', { title: 'Done' })
      }
      setFinishing(null)
      setSelectedRequest(null)
      await loadRequests(null, false)
    } catch (err: any) {
      setFinishError(err?.response?.data?.message || err?.message || 'Could not save this')
    } finally {
      setFinishBusy(false)
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

      if (action === 'approve') milestone.show({ kind: 'request_approved', title: 'Approved' })
      else feedback.info('The request was declined.', { title: 'Declined' })
      await loadRequests(null, false)
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || `Failed to ${action} workflow request`)
    }
  }

  const [keepingRecordId, setKeepingRecordId] = useState<string | null>(null)
  const keepRecordOffer = async (row: RequestRow) => {
    const offerUri = String((parseRequestContext(row) as Record<string, unknown>).offerUri || '')
    const personal = row.workflowRequestContext === 'personal'
    const token = personal ? getPersonalToken() : getOrgScopedToken()
    if (!offerUri || !token) {
      feedback.error('The offer or wallet session is unavailable. Refresh your inbox or sign in again.', { title: 'Could not keep this record' })
      return
    }
    setKeepingRecordId(row.id)
    const assertContext = captureOrganizationSwitchContext(localStorage)
    try {
      await axios.post(
        `${backendUrl}/api/wallet/credentials/accept-offer`,
        { offerUri },
        { headers: { Authorization: `Bearer ${token}` } },
      )
      assertContext()
      const offerSource = String(parseRequestContext(row).offerSourceType || '')
      const showMilestone = () => milestone.show({ kind: 'card_saved', title: 'Saved to records', detail: personal ? 'Kept in your personal records.' : "Kept in the organisation's records." })
      if (personal) {
        void celebrateSaved({
          title: offerSource === 'platform_identity' ? 'Identity card' : String(row.title || 'Record'),
          detail: 'Saved to My records',
        }).then((flew) => {
          if (flew) feedback.success('Kept in your personal records.', { title: 'Saved', action: { label: 'Open', onClick: () => void router.push('/wallet') } })
          else showMilestone()
        })
      } else {
        showMilestone()
      }
      announceInboxChanged()
      await loadRequests(null, false)
    } catch (err: any) {
      if (!assertContext.isCurrent()) return
      feedback.fromError(err, { title: 'Could not keep this record', retry: () => void keepRecordOffer(row) })
    } finally {
      setKeepingRecordId(null)
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
  const selectedProgress = selectedRequest ? stagesForInboxRow(selectedRequest) : { stages: [], hints: [] }
  const selectedSsiIssuedCount = selectedProgress.stages.filter((stage) => stage.status === 'done').length
  const selectedTimelineItems = selectedRequest ? buildDetailTimelineItems(selectedRequest, orgMembers) : []
  const selectedStatusLines = selectedRequest
    ? [
      `Type: ${requestKindLabel(normalizeRequestType(selectedRequest))}`,
      selectedRequest.__source === 'workflow_request' ? 'Came in through the inbox' : 'Raised for this organisation',
    ]
    : []
  const selectedReplaces = selectedRequest ? offerReplacement(selectedContext) : undefined
  const selectedDetailSections: WorkflowDetailSection[] = selectedRequest
    ? [
      ...(selectedReplaces
        ? [{
          title: selectedReplaces.label,
          content: <Text size="sm" c="orange.8" fw={600}>{selectedReplaces.note}</Text>,
        }]
        : []),
      ...(selectedRequest.description
        ? [{
          title: 'Description',
          content: <Text size="sm">{selectedRequest.description}</Text>,
        }]
        : []),
      {
        title: '',
        content: (
          <StageActorTimeline
            title={`Progress (${selectedSsiIssuedCount} of ${selectedProgress.stages.length} steps done)`}
            stages={selectedProgress.stages}
            actors={actorsForWorkflow(actorReports, selectedProgress.hints)}
            whoDid={Object.fromEntries(selectedProgress.stages.flatMap((stage) => {
              const actorUserId = 'actorUserId' in stage ? stage.actorUserId : undefined
              if (typeof actorUserId !== 'string') return []
              const member = (selectedRequest.people || orgMembers).find((person) => person.userId === actorUserId)
              return member?.displayName ? [[stage.key, member.displayName]] : []
            }))}
            people={selectedRequest.people || orgMembers}
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
  }, [statusFilter, requestIdFromQuery])

  const rowAttentionOf = (row: RequestRow) =>
    inboxAttention({ status: normalizeStatus(row.status), isRead: openedIds.has(row.id), stillOpen: Boolean(row.nextStep) })
  // Waiting for this person's step: pinned under "Needs your action".
  const rowNeedsAction = (row: RequestRow) =>
    !isRecordOfferRow(row) && isActionableStatus(normalizeStatus(row.status)) && rowAttentionOf(row) !== 'done'
  const inboxKindLabel = (row: RequestRow) => requestCategoryTab === 'all'
    ? INBOX_FLOW_SECTION_LABELS[inboxFlowSection(
      REQUEST_CATEGORY_TABS.filter((tab) => tab !== 'all' && matchesCategoryTab(row, tab)),
      isRecordOfferRow(row) ? 'credential_offer' : undefined,
    )]
    : INBOX_TAB_LABELS[requestCategoryTab]
  const newInboxRows = mode === 'inbox' ? visibleItems.filter((row) => rowAttentionOf(row) === 'new') : []

  const title = mode === 'inbox' ? 'Inbox' : category === 'requisitions' ? 'Purchase requests' : 'Requests'
  const description =
    mode === 'inbox'
      ? 'New items are unread. Opened means you looked, and the step is still waiting. Done is finished or declined.'
      : category === 'requisitions'
        ? 'Purchase and materials requests, including requests linked to jobs. Approve purchases and keep their receipts here.'
        : 'All organizational requests visible in your current context.'

  const platformRequestActions = (row: RequestRow, closeDetails?: () => void) => (
    <>
      {normalizeStatus(row.status) === 'draft' && (
        <Button size="xs" variant="light" onClick={() => { void submitRequest(row.id); closeDetails?.() }}>Submit</Button>
      )}
      {normalizeStatus(row.status) === 'submitted' && normalizeRequestType(row).includes('ecommerce') && (
        <Button size="xs" onClick={() => { void startWorkflow(row); closeDetails?.() }}>Start workflow</Button>
      )}
      {isDecidablePlatformRequest(row) && (
        <>
          <Button size="xs" onClick={() => { void decidePlatformRequest(row, 'approve'); closeDetails?.() }}>Approve</Button>
          <Button size="xs" variant="light" color="red" onClick={() => { void decidePlatformRequest(row, 'reject'); closeDetails?.() }}>Decline</Button>
        </>
      )}
      {row.nextStep && <Button size="xs" onClick={() => openFinish(row)}>{row.nextStep.label}</Button>}
    </>
  )

  return (
    <Stack gap="lg">
      {taskOnly && error && <Alert color="red">{error}</Alert>}
      {taskOnly && !selectedRequest && !error && <Text size="sm">Opening this request…</Text>}
      <Stack gap="lg" style={{ display: taskOnly ? 'none' : undefined }}>
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

      {mode === 'inbox' ? (
        <SegmentedControl
          value={attention}
          onChange={(value) => setAttention((value as InboxAttentionFilter) || 'all')}
          data={INBOX_ATTENTION_FILTERS.map((entry) => ({
            value: entry.value,
            label: entry.value === 'all'
              ? entry.label
              : `${entry.label}${attentionCounts[entry.value] ? ` ${attentionCounts[entry.value]}` : ''}`,
          }))}
        />
      ) : (
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
      )}

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

      {mode !== 'inbox' && (
      <Card withBorder radius="md" p="lg">
        <Group align="end" wrap="wrap">
          <Select
            label="Status"
            value={statusFilter}
            onChange={(value) => setStatusFilter(value || 'all')}
            data={STATUS_OPTIONS}
            style={{ minWidth: 220 }}
          />
          <Button variant={linkedOnly ? 'filled' : 'light'} onClick={() => setLinkedOnly((current) => !current)}>
            Linked to a job
          </Button>
        </Group>
      </Card>
      )}

      {!category && <Card withBorder radius="md" p="md">
        <Tabs value={requestCategoryTab} onChange={(value) => setRequestCategoryTab((value as RequestCategoryTab) || 'all')}>
          <Tabs.List>
            {visibleCategoryTabs.map((tab) => (
              <Tabs.Tab
                key={tab}
                value={tab}
                leftSection={TAB_ICONS[tab]}
                rightSection={requestCategoryCounts[tab] > 0 ? (
                  <Badge size="sm" circle variant={requestCategoryTab === tab ? 'filled' : 'light'} color="credentis">
                    {requestCategoryCounts[tab] > 99 ? '99+' : requestCategoryCounts[tab]}
                  </Badge>
                ) : undefined}
              >
                {INBOX_TAB_LABELS[tab]}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>
      </Card>}

      {error && (
        <Alert icon={<IconAlertCircle size={16} />} color="red" title="Load error">
          {error}
        </Alert>
      )}

      <Card withBorder radius="md" p="lg">
        <Group justify="space-between" mb="md">
          <Title order={4}>{mode === 'inbox' ? 'Inbox' : 'Request List'}</Title>
          <Group gap="xs">
            {mode === 'requests' && (
              <SegmentedControl
                aria-label="Request list view"
                value={requestView}
                onChange={(value) => setRequestView(value === 'table' ? 'table' : 'cards')}
                data={[{ value: 'cards', label: 'Cards' }, { value: 'table', label: 'Table' }]}
              />
            )}
            {mode === 'requests' && (
              <Button onClick={() => category === 'requisitions' ? void router.push('/finance/requisitions/new') : setCreateOpen(true)}>
                {category === 'requisitions' ? 'New requisition' : 'New Request'}
              </Button>
            )}
            <Badge variant="light">{visibleItems.length}</Badge>
          </Group>
        </Group>

        {loading ? (
          <Text c="dimmed" size="sm">Loading…</Text>
        ) : visibleItems.length === 0 ? (
          <Stack align="center" py="xl" gap="xs">
            {mode === 'inbox' && attention !== 'opened' && attention !== 'done' ? <LottiePlayer kind="empty_inbox" size={110} /> : mode === 'inbox' ? <IconInbox size={40} color="var(--mantine-color-gray-4)" /> : <IconListDetails size={40} color="var(--mantine-color-gray-4)" />}
            <Text c="dimmed">
              {mode === 'inbox'
                ? attention === 'new'
                  ? 'Nothing new. Items you have already opened are under Opened.'
                  : attention === 'opened'
                    ? 'Nothing you have opened is still waiting.'
                    : attention === 'done'
                      ? 'Nothing finished yet.'
                      : 'All caught up. Nothing is waiting for you.'
                : 'No requests found for the current filters.'}
            </Text>
            <Anchor component={Link} href="/organization/setup" size="sm" fw={500}>
              Open organization setup
            </Anchor>
          </Stack>
        ) : mode === 'requests' && requestView === 'table' ? (
          <Table.ScrollContainer minWidth={740}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  {['Request', 'Type', 'Status', 'Current step', 'Created', ''].map((label) => <Table.Th key={label}>{label}</Table.Th>)}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {visibleItems.map((row) => {
                  const progress = stagesForInboxRow(row)
                  const current = progress.stages.find((stage) => stage.status === 'active' || stage.status === 'held')
                  return (
                    <Table.Tr key={row.id}>
                      <Table.Td>{row.title || 'Request'}</Table.Td>
                      <Table.Td>{requestKindLabel(normalizeRequestType(row))}</Table.Td>
                      <Table.Td><Badge variant="light" color={statusColor(normalizeStatus(row.status))}>{statusLabel(normalizeStatus(row.status))}</Badge></Table.Td>
                      <Table.Td>{current?.label || 'No pending step'}</Table.Td>
                      <Table.Td>{formatTxnTime(normalizeCreatedAt(row)) || 'Not recorded'}</Table.Td>
                      <Table.Td><Button size="compact-sm" variant="subtle" onClick={() => openRequestDetails(row)}>Open</Button></Table.Td>
                    </Table.Tr>
                  )
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        ) : (
          <Stack gap="sm">
            {mode === 'inbox' && newInboxRows.length > 0 && (
              <Group justify="space-between" align="center" gap="xs">
                <Text size="xs" c="blue" fw={600}>{newInboxRows.length} new {newInboxRows.length === 1 ? 'item' : 'items'}</Text>
                <Button size="compact-xs" variant="subtle" color="blue" onClick={() => markAllRead(newInboxRows)}>
                  Mark all read
                </Button>
              </Group>
            )}
            {mode === 'inbox' && arrivals > 0 && (
              <Button
                size="xs"
                radius="xl"
                color="blue"
                onClick={() => {
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                  setArrivals(0)
                }}
                style={{ position: 'fixed', top: 72, left: '50%', transform: 'translateX(-50%)', zIndex: 200, boxShadow: '0 2px 8px rgba(0,0,0,0.25)' }}
              >
                ↑ {arrivals} new
              </Button>
            )}
            {(mode === 'inbox'
              ? buildInboxFeed(visibleItems, {
                keyOf: (row) => row.id,
                timeOf: inboxActivityTime,
                needsAction: attention !== 'done' ? rowNeedsAction : undefined,
                lastSeenAt: lastSeenSnapshot,
              }).map((entry) => (entry.kind === 'item'
                ? { kind: 'row' as const, key: `${entry.pinned ? 'pin:' : ''}${entry.key}`, label: inboxKindLabel(entry.item), row: entry.item as RequestRow | null, shown: 0, total: 0 }
                : {
                  kind: entry.kind,
                  key: entry.key,
                  label: entry.label,
                  row: null as RequestRow | null,
                  shown: entry.kind === 'pinned-head' ? entry.shown : 0,
                  total: entry.kind === 'pinned-head' ? entry.total : 0,
                }))
              : visibleItems.map((row) => ({ kind: 'row' as const, key: row.id, label: '', row: row as RequestRow | null, shown: 0, total: 0 }))
            ).map((entry) => {
              if (entry.kind === 'pinned-head') {
                return (
                  <Group key={entry.key} gap={6} mt="xs">
                    <Text size="xs" fw={800} c="orange" tt="uppercase">{entry.label}</Text>
                    <Badge size="xs" color="orange" variant="filled">{entry.total}</Badge>
                    {entry.total > entry.shown && <Text size="xs" c="dimmed">newest {entry.shown} shown here</Text>}
                  </Group>
                )
              }
              if (entry.kind === 'day') {
                return (
                  <Text key={entry.key} size="xs" fw={700} c="dimmed" tt="uppercase" mt="xs">
                    {entry.label}
                  </Text>
                )
              }
              if (entry.kind === 'seen-divider') {
                return <Divider key={entry.key} my={4} label={entry.label} labelPosition="center" />
              }
              const row = entry.row!
              const rowAttention = inboxAttention({ status: normalizeStatus(row.status), isRead: openedIds.has(row.id), stillOpen: Boolean(row.nextStep) })
              const newRowStyle = mode === 'inbox' && rowAttention === 'new'
                ? { background: 'var(--mantine-color-blue-light)', borderLeft: '4px solid var(--mantine-color-blue-filled)' }
                : mode === 'inbox' && rowAttention === 'done' ? { opacity: 0.8 } : undefined
              if (isRecordOfferRow(row)) {
                const recordAt = formatTxnTime(normalizeCreatedAt(row))
                const sourceType = String(parseRequestContext(row).offerSourceType || 'workflow_vc_offer')
                const isReceipt = ['payment', 'invoice_offer', 'quote_offer'].includes(sourceType)
                const highlighted = typeof router.query.item === 'string' && router.query.item === row.inboxItemId
                return (
                  <Paper
                    key={entry.key}
                    withBorder
                    radius="md"
                    p="md"
                    data-inbox-item={row.inboxItemId || undefined}
                    {...(sourceType === 'platform_identity' ? { [CARD_TARGET_ATTR]: 'identity' } : null)}
                    style={{ ...newRowStyle, ...(highlighted ? { boxShadow: '0 0 0 2px var(--mantine-color-blue-filled)' } : null) }}
                  >
                    <Group gap="xs" mb={4}>
                      <Badge size="xs" color={rowAttention === 'new' ? 'blue' : 'gray'} variant={rowAttention === 'new' ? 'filled' : 'light'}>
                        {rowAttention === 'new' ? 'New' : 'Opened'}
                      </Badge>
                      <Badge size="xs" color="teal" variant="light">Record</Badge>
                      <Badge size="xs" color="teal" variant="outline">
                        Your step: {isReceipt
                          ? 'Keep the record'
                          : stepRequiredLabel({ itemType: 'credential_offer', sourceType })}
                      </Badge>
                    </Group>
                    <Group justify="space-between" wrap="nowrap" gap="xs">
                      <Text fw={600} size="sm">{sourceType === 'platform_identity' ? 'Identity card' : row.title}</Text>
                      {recordAt && <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>{recordAt}</Text>}
                    </Group>
                    {row.description && <Text size="xs" c="dimmed" mt={2}>{row.description}</Text>}
                    <Button size="xs" mt="md" loading={keepingRecordId === row.id} onClick={() => void keepRecordOffer(row)}>
                      {isReceipt ? 'Keep record' : 'Accept card'}
                    </Button>
                  </Paper>
                )
              }
              const status = normalizeStatus(row.status)
              const createdAt = normalizeCreatedAt(row)
              const requestType = normalizeRequestType(row)
              const context = parseRequestContext(row)
              const legacyWorkflowRequestId = String((context as any).legacyWorkflowRequestId || '')
              const requisitionId = String((context as any).requisitionId || '')
              const routing = getWorkflowRequestRouting(row)
              const isLegacyWorkflowItem = row.__source === 'workflow_request' && legacyWorkflowRequestId.length > 0
              const inboxStages = stagesForInboxRow(row)
              const currentStage = inboxStages.stages.find((stage) => stage.status === 'active')
              const stepRequired = mode === 'inbox' && isActionableStatus(String(status))
                ? stepRequiredLabel({
                  stageAction: String((context as any).stageAction || ''),
                  requiredAction: routing.requiredAction,
                  workflowStage: String((context as any).workflowStage || ''),
                  module: isLegacyWorkflowItem ? 'approvals' : undefined,
                  workflowRequestId: legacyWorkflowRequestId || undefined,
                })
                : undefined
              const replaces = offerReplacement(context)

              return (
                <Paper
                  key={entry.key}
                  withBorder
                  radius="md"
                  p="md"
                  style={newRowStyle}
                >
                  <UnstyledButton
                    onClick={() => openRequestDetails(row)}
                    aria-label={`Open ${row.title || requestKindLabel(requestType)}`}
                    style={{ display: 'block', width: '100%' }}
                  >
                  <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <Box style={{ flex: 1, minWidth: 0 }}>
                      <Group gap="xs" mb={4} wrap="wrap">
                        {mode === 'inbox' ? (
                          <Badge size="xs" color={rowAttention === 'done' ? 'teal' : rowAttention === 'opened' ? 'gray' : 'blue'} variant={rowAttention === 'new' ? 'filled' : 'light'}>
                            {rowAttention === 'new' ? 'New' : rowAttention === 'opened' ? 'Opened' : 'Done'}
                          </Badge>
                        ) : (
                          <Badge size="xs" variant="light">{requestKindLabel(requestType)}</Badge>
                        )}
                        {mode === 'inbox' ? (
                          <Badge size="xs" variant="outline" color="gray">{entry.label || INBOX_TAB_LABELS[requestCategoryTab]}</Badge>
                        ) : null}
                        {mode !== 'inbox' && <Badge color={statusColor(status)}>{statusLabel(status)}</Badge>}
                        {stepRequired && (
                          <Badge size="xs" color="teal" variant="outline">Your step: {stepRequired}</Badge>
                        )}
                      </Group>
                      <Group justify="space-between" wrap="nowrap" gap="xs">
                        <Text fw={mode === 'inbox' && rowAttention === 'new' ? 700 : 600} size="sm" c={mode === 'inbox' && rowAttention === 'done' ? 'dimmed' : undefined}>
                          {row.title || row.id}
                        </Text>
                        {mode === 'inbox' && (
                          <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>{inboxWhenLabel(createdAt)}</Text>
                        )}
                      </Group>
                      {replaces ? (
                        <Text size="xs" c="orange.8" fw={600} mt={2} lineClamp={2}>
                          {replaces.note}
                        </Text>
                      ) : (mode === 'inbox' && rowAttention === 'done') ? (
                        <Text size="xs" c="dimmed" mt={2} lineClamp={2}>Finished</Text>
                      ) : (row.nextStep?.label || currentStage?.label) && (
                        <Text size="sm" c="dimmed" mt={4} lineClamp={1}>
                          Next: {row.nextStep?.label || currentStage?.label}
                        </Text>
                      )}
                      <Group gap="sm" mt="sm" wrap="wrap">
                        {mode !== 'inbox' && (
                        <Text size="xs" c="dimmed">
                          {formatTxnTime(createdAt) || '—'}
                        </Text>
                        )}
                        {typeof row.amount === 'number' && (
                          <Text size="xs" c="teal.7" fw={600}>
                            {row.currency || ''} {row.amount.toLocaleString()}
                          </Text>
                        )}
                      </Group>
                    </Box>
                    <IconChevronRight size={18} color="var(--mantine-color-gray-5)" />
                  </Group>
                  </UnstyledButton>
                  {mode === 'inbox' && <Group gap="xs" wrap="wrap" mt="md">
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
                    {isLegacyWorkflowItem && routing.mode === 'generic' && rowAttention !== 'done' && (
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
                    {isLegacyWorkflowItem && routing.mode !== 'generic' && !isStageCardRow(row) && rowAttention !== 'done' && (
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
                    {!isLegacyWorkflowItem && rowAttention !== 'done' && platformRequestActions(row)}
                  </Group>}
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

      </Stack>
      <BottomSheet
        opened={Boolean(selectedRequest)}
        onClose={() => {
          const returnTo = endPortalTask()
          setSelectedRequest(null)
          if (returnTo) void router.push(returnTo)
        }}
        title={selectedRequest?.title || 'Request details'}
      >
        {selectedRequest && (
          <Stack gap="md">
            <Group gap="xs" wrap="wrap">
              <Badge variant="light">{selectedRequest.family?.fromLabel || requestKindLabel(normalizeRequestType(selectedRequest))}</Badge>
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
              showHistory={!Array.isArray(selectedRequest.events)}
            />
            {detailLoading && <Text size="sm" c="dimmed">Loading recorded history...</Text>}
            {detailError && <Alert color="orange">{detailError}</Alert>}
            {Array.isArray(selectedRequest.events) && (
              <JobAuditTrailPanel trail={trailFromRequest(selectedRequest, selectedRequest.people || orgMembers)} compact embedded subject="request" />
            )}

            {familyChain(selectedRequest.family).length > 0 && (
              <Paper p="md" radius="md" withBorder>
                <FamilyStrip
                  chain={familyChain(selectedRequest.family)}
                  holdLine={selectedRequest.family?.holdLine}
                  onOpen={(member) => {
                    openRelatedWork(member, familyLinks(selectedRequest.family, selectedRequest.id))
                  }}
                />
              </Paper>
            )}

            {(selectedIsLegacyWorkflowItem || selectedIsRequisitionLike || selectedIsFieldLike || selectedIsPaymentLike) && (
              <Stack gap="xs">
                {familyChain(selectedRequest.family).length === 0 && <Paper p="md" radius="md" withBorder>
                  <Group justify="space-between" align="center">
                    <Text size="xs" c="dimmed" fw={600}>WORKFLOW ROUTING</Text>
                    <Badge variant="light" color={selectedRequest?.workflowRequestContext === 'personal' ? 'blue' : 'teal'}>
                      {selectedRequest?.workflowRequestContext === 'personal' ? 'Delegated approval' : 'Org inbound approval'}
                    </Badge>
                  </Group>
                  <Text size="sm" mt={8}>
                    Action required: {getRoutingActionLabel(selectedRouting)}.
                  </Text>
                </Paper>}

                {familyChain(selectedRequest.family).length === 0 && (selectedWorkflowType || selectedWorkflowStage || selectedRequiredAction) && (
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

                {selectedRequest.receipt && (
                  <Paper p="md" radius="md" withBorder>
                    <Text size="xs" c="dimmed" fw={600} mb={8}>RECEIPT</Text>
                    <Group gap="sm" wrap="nowrap" align="center">
                      {receiptPhoto ? (
                        <Image src={receiptPhoto} alt="Receipt" w={96} h={96} radius="sm" fit="cover" />
                      ) : selectedRequest.receipt.hasPhoto ? (
                        <Text size="xs" c="dimmed">Loading photo…</Text>
                      ) : (
                        <IconReceipt size={24} />
                      )}
                      <Stack gap={2}>
                        <Text size="sm">{purchaseReceiptLine({ step: 'Recorded', ...selectedRequest.receipt, currency: selectedRequest.currency })}</Text>
                        {selectedRequest.receipt.recordedAt && (
                          <Text size="xs" c="dimmed">{formatTxnTime(selectedRequest.receipt.recordedAt)}</Text>
                        )}
                      </Stack>
                    </Group>
                  </Paper>
                )}

              </Stack>
            )}
            {!selectedIsLegacyWorkflowItem && (
              <Group grow>
                {platformRequestActions(selectedRequest, () => setSelectedRequest(null))}
                {!selectedRequest.nextStep && !['draft', 'submitted', 'in_review'].includes(String(normalizeStatus(selectedRequest.status))) && (
                  <Text size="sm" c="dimmed">Nothing to do on this request right now.</Text>
                )}
              </Group>
            )}
          </Stack>
        )}
      </BottomSheet>

      <Modal opened={Boolean(finishing)} onClose={() => setFinishing(null)} title={finishing?.nextStep?.label || 'Finish'} centered>
        {finishing?.nextStep && (
          <Stack gap="sm">
            <Text size="sm" fw={600}>{finishing.title}</Text>
            <Text size="sm" c="dimmed">{finishing.nextStep.hint}</Text>
            {finishing.nextStep.fields.map((field) =>
              field.type === 'image' ? (
                <Stack key={field.name} gap={6}>
                  <FileInput
                    label={field.label}
                    description={field.hint ? field.hint.replace(/, or use a .* record from your wallet\.?$/i, '.') : undefined}
                    placeholder="Choose a photo"
                    accept="image/*"
                    required={field.required}
                    clearable
                    onChange={chooseFinishPhoto}
                  />
                  {finishPhoto && <Image src={finishPhoto} alt={field.label} radius="md" h={160} fit="contain" />}
                </Stack>
              ) : field.type === 'number' ? (
                <NumberInput
                  key={field.name}
                  label={field.label}
                  required={field.required}
                  min={0}
                  value={finishValues[field.name] as number | undefined}
                  onChange={(value) => setFinishValues((current) => ({ ...current, [field.name]: value }))}
                />
              ) : (
                <TextInput
                  key={field.name}
                  label={field.label}
                  required={field.required}
                  value={String(finishValues[field.name] ?? '')}
                  onChange={(event) => {
                    const next = event.currentTarget.value
                    setFinishValues((current) => ({ ...current, [field.name]: next }))
                  }}
                />
              ),
            )}
            {finishError && <Text size="sm" c="red">{finishError}</Text>}
            <Group justify="flex-end">
              <Button variant="subtle" onClick={() => setFinishing(null)}>Cancel</Button>
              <Button loading={finishBusy} onClick={() => void finishPlatformRequest()}>Save</Button>
            </Group>
          </Stack>
        )}
      </Modal>

      <RequestSheet
        opened={createOpen}
        onClose={() => setCreateOpen(false)}
        context={{
          contextMode: isActingAsOrganization(orgTenantId) ? 'org' : 'personal',
          activeOrgTenantId: orgTenantId,
          activeOrgName: orgName,
          orgRole: readActiveOrganization()?.role,
          activeWorkflowTypes: activeTemplates.map((template) => template.workflowType || template.id || ''),
        }}
      />

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
