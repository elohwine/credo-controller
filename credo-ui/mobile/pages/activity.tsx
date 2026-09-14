import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/router'
import {
  Stack,
  Title,
  Text,
  Box,
  Group,
  Paper,
  Center,
  Loader,
  Alert,
  TextInput,
  ActionIcon,
  Drawer,
  Badge,
  Card,
  ThemeIcon,
  Image,
  Divider,
  Button,
} from '@mantine/core'
import {
  IconSearch,
  IconRefresh,
  IconAlertCircle,
  IconReceipt,
  IconClock,
  IconCheck,
  IconX,
  IconChevronRight,
  IconActivity,
  IconStar,
  IconStarFilled,
} from '@tabler/icons-react'
import AppShellMobile from '@/components/layout/AppShellMobile'
import ErrorAlert from '@/components/shared/ErrorAlert'
import api, { safeArray } from '@/lib/api'
import { getActiveOrgId, getContextMode, getUserRole, getPreferredToken, getWalletToken, getOrgToken } from '@/lib/auth'
import { getFriendlyActivityActionLabel, getFriendlyActivitySummary } from '@/lib/uxCopy'
import { evaluateOrgActionPolicy, getCachedOrgContextBundle, refreshOrgContextBundle } from '@/lib/offline/orgContextBundle'
import { getRunningActions, RunningAction, upsertRunningAction } from '@/lib/runningActions'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import EvidenceCapture, { EvidencePayload } from '@/components/scan/EvidenceCapture'

dayjs.extend(relativeTime)

interface ReconSummary {
  total: number
  reconciled: number
  payoutFailed: number
  disputed: number
  refunded: number
}

interface TxnEvent {
  id: string
  eventType:
  | 'quote_issued'
  | 'invoice_issued'
  | 'payment_link_created'
  | 'receipt_issued'
  | 'payment_settled'
  | 'reconciliation_failed'
  | 'unknown'
  occurredAt: string
  metadata?: Record<string, any>
}

interface AuditItem {
  id: string
  eventType: string
  title: string
  displayTitle: string
  source: string
  sourceLabel: string
  status?: string
  amount?: number
  currency?: string
  occurredAt: string
  actorDid?: string
  actorName?: string
  subjectDid?: string
  subjectName?: string
  contactId?: string
  contactName?: string
  evidenceImages?: string[]
  evidenceAttachments?: Array<{ url: string; label?: string }>
  details?: Record<string, unknown>
  friendlyDetails?: Array<{ label: string; value: string }>
}

type AuditContext = 'organization' | 'personal' | 'guest' | 'service'

interface AuditLogEntry {
  id: string
  tenantId: string
  actorDid?: string
  actorName?: string
  actorContext?: AuditContext
  onBehalfOf?: string
  onBehalfOfName?: string
  workflowId?: string
  workflowStep?: string
  workflowTemplateId?: string
  actionType: string
  resourceId?: string
  details?: Record<string, unknown>
  ipAddress?: string
  userAgent?: string
  createdAt: string
  contextType?: AuditContext
  _authToken?: string
}

interface PagedAuditResponse<T> {
  items: T[]
  hasMore: boolean
  nextCursor?: string
}

interface TokenAuditCursorState {
  nextCursor?: string
  hasMore: boolean
}

interface DelegatedCredentialSummary {
  credentialId: string
  credentialType: string
  orgTenantId: string
  orgRole: string
  actionType: string
  auditEventId: string
  issuedAt: string
  onBehalfOfName?: string
  previewClaims?: {
    amount?: number | string
    currency?: string
    invoiceId?: string
    invoiceHash?: string
    transactionId?: string
    providerRef?: string
    holder?: string
  }
}

interface RecentTxnRow {
  id: string
  ref: string
  title: string
  subtitle: string
  status?: string
  stage?: string
  eventType?: string
  flow: FlowCategory
  context: AuditContext
  scopeLabel: 'personal' | 'on-behalf'
  createdAt: string
  actorLabel: string
  orgLabel?: string
  authToken: string
}

type ActivityFeedFilter = 'all' | 'org' | 'personal' | 'payments' | 'documents' | 'issues' | 'favorites'
type ActivityLens = 'personal' | 'org'

const FAVORITE_ACTIVITY_REFS_KEY = 'credoFavoriteActivityRefs.v1'

type FlowCategory = 'PAYMENT' | 'REQUISITION' | 'FIELD_EXECUTION' | 'SETTLEMENT' | 'EXCEPTION' | 'EVIDENCE' | 'CREDENTIAL' | 'SYSTEM'

const FLOW_BADGE: Record<FlowCategory, { label: string; color: string }> = {
  PAYMENT: { label: 'Payment', color: 'green' },
  REQUISITION: { label: 'Request', color: 'blue' },
  FIELD_EXECUTION: { label: 'Field Run', color: 'grape' },
  SETTLEMENT: { label: 'Settlement', color: 'cyan' },
  EXCEPTION: { label: 'Issue', color: 'red' },
  EVIDENCE: { label: 'Delivery', color: 'violet' },
  CREDENTIAL: { label: 'Verification', color: 'indigo' },
  SYSTEM: { label: 'Activity', color: 'gray' },
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

function normalizeStage(value: unknown): string {
  return String(value ?? '').trim().toUpperCase().replace(/\s+/g, '_')
}

function isFeptWorkflowType(value: unknown): boolean {
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized.includes('field') || normalized.includes('fept')
}

function toFeptStageLabel(stage: string): string {
  const labels: Record<string, string> = {
    DRAFT: 'Draft',
    REQUEST_CREATED: 'Request created',
    APPROVAL_PENDING: 'Approval pending',
    APPROVED: 'Approved',
    RELEASE_AUTHORIZED: 'Release authorized',
    ASSIGNED: 'Task assigned',
    IN_PROGRESS: 'Work in progress',
    EVIDENCE_CAPTURED: 'Evidence captured',
    ACKNOWLEDGED: 'Execution acknowledged',
    PAYMENT_TRIGGERED: 'Payment triggered',
    RECEIPT_ISSUED: 'Receipt issued',
    RECONCILED: 'Reconciled',
    COMPLETED: 'Completed',
    DISPUTED: 'Disputed',
    CANCELLED: 'Cancelled',
    REVOKED: 'Revoked',
  }

  return labels[stage] || stage.toLowerCase().replace(/_/g, ' ')
}

function extractFeptStage(details?: Record<string, any>, entry?: any): string {
  const requestSummary = details?.requestSummary && typeof details.requestSummary === 'object' ? details.requestSummary : {}
  const all = { ...requestSummary, ...(details || {}) }

  const candidates = [
    all.workflowStage,
    all.stage,
    all.state,
    entry?.workflowStage,
    entry?.status,
    entry?.eventType,
    entry?.workflowStep,
  ]

  for (const candidate of candidates) {
    const normalized = normalizeStage(candidate)
    if (normalized && FEPT_STAGES.has(normalized)) return normalized
  }

  return ''
}

function normalizeActionText(value?: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[._-]+/g, ' ')
}

function toSentenceCase(value: string): string {
  const normalized = value
    .trim()
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
  if (!normalized) return 'Activity updated'
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function readFavoriteActivityRefs(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(FAVORITE_ACTIVITY_REFS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((entry) => String(entry || '').trim())
      .filter((entry) => entry.length > 0)
      .slice(0, 200)
  } catch {
    return []
  }
}

function writeFavoriteActivityRefs(values: string[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(FAVORITE_ACTIVITY_REFS_KEY, JSON.stringify(values.slice(0, 200)))
  } catch {
    // Best effort persistence.
  }
}

// ── PII masking (OWASP: never expose raw phone/DID in default rows) ──
function maskPhone(value?: string): string {
  if (!value) return 'Unknown'
  const digits = value.replace(/\D/g, '')
  if (digits.length >= 7) {
    return value.slice(0, value.length - 4).replace(/\d(?=.*\d{3}$)/g, '•') + digits.slice(-3)
  }
  return value
}

function maskDid(value?: string): string {
  if (!value) return 'Unknown'
  if (!value.startsWith('did:')) return value
  const parts = value.split(':')
  const method = parts[1] || ''
  const id = parts.slice(2).join(':')
  if (id.length <= 12) return value
  return `did:${method}:${id.slice(0, 6)}…${id.slice(-4)}`
}

function formatActorLabel(name?: string, did?: string): string {
  if (name && name.trim() && !name.startsWith('did:')) return name.trim()
  if (name && name.startsWith('did:')) return maskDid(name)
  if (did) return maskDid(did)
  return 'You'
}

// ── Event outcome indicator (RFC 3881: required on every event) ──
function resolveOutcome(entry: any): { label: string; color: string } {
  const details = (entry?.details || {}) as Record<string, any>
  const all = { ...((details.requestSummary && typeof details.requestSummary === 'object') ? details.requestSummary : {}), ...details }
  const status = String(all.status || all.result || entry?.status || '').toLowerCase()
  if (
    status.includes('success') || status.includes('reconciled') || status.includes('completed') ||
    status.includes('approved') || status.includes('paid') || status.includes('issued') || status.includes('settled')
  ) return { label: 'Success', color: 'green' }
  if (
    status.includes('fail') || status.includes('error') || status.includes('mismatch') ||
    status.includes('disputed') || status.includes('reject') || status.includes('revoke')
  ) return { label: 'Failed', color: 'red' }
  if (
    status.includes('pending') || status.includes('awaiting') || status.includes('in_progress') ||
    status.includes('processing')
  ) return { label: 'Pending', color: 'yellow' }
  if (status.includes('cancelled')) return { label: 'Cancelled', color: 'orange' }
  return { label: 'Recorded', color: 'gray' }
}

// ── Category taxonomy (GitHub/RFC pattern: category.operation) ──
function resolveCategory(entry: any): string {
  const action = String(entry?.actionType || entry?.workflowStep || '').toLowerCase()
  const target = inferDomainTarget(entry?.details)
  if (target === 'field_execution') return 'workflow'
  if (target === 'requisition') return 'workflow'
  if (action.includes('receipt') || action.includes('invoice') || action.includes('quote')) return 'commerce'
  if (action.includes('payment') || action.includes('ecocash')) return 'payments'
  if (action.includes('credential') || action.includes('vc') || action.includes('proof') || action.includes('did')) return 'credentials'
  if (action.includes('member') || action.includes('role') || action.includes('login')) return 'members'
  if (action.includes('reconciliation') || action.includes('reconcile')) return 'reconciliation'
  if (action.includes('org') || action.includes('capability') || action.includes('visibility')) return 'org-settings'
  return 'activity'
}

const CATEGORY_COLORS: Record<string, string> = {
  commerce: 'teal',
  payments: 'green',
  credentials: 'indigo',
  workflow: 'grape',
  members: 'blue',
  reconciliation: 'cyan',
  'org-settings': 'orange',
  activity: 'gray',
}

function inferDomainTarget(details?: Record<string, any>): string {
  if (!details || typeof details !== 'object') return 'activity'

  const requestSummary = details.requestSummary && typeof details.requestSummary === 'object' ? details.requestSummary : {}
  const all = { ...requestSummary, ...details }
  const path = String(all.path || all.route || '').toLowerCase()
  const workflowType = String(all.workflowType || all.templateId || all.workflowId || '').toLowerCase()
  const workflowStage = extractFeptStage(details, { workflowStep: all.workflowStep, status: all.status, eventType: all.eventType })
  const ref = String(all.providerRef || all.sourceReference || all.reference || '').toLowerCase()

  if (
    isFeptWorkflowType(workflowType)
    || FEPT_STAGES.has(workflowStage)
    || path.includes('/workflows/runs')
  ) return 'field_execution'
  if (path.includes('/requis') || String(all.requisitionId || '').trim()) return 'requisition'
  if (path.includes('/payment-link') || ref.startsWith('paylink-')) return 'payment request'
  if (String(all.invoiceId || all.invoiceRef || '').trim()) return 'invoice'
  if (String(all.transactionId || all.paymentId || all.paymentReference || '').trim()) return 'payment'
  if (path.includes('/credential') || String(all.credentialType || '').trim()) return 'credential'

  return 'activity'
}

function getFriendlyActionLabel(actionType?: string, workflowStep?: string, details?: Record<string, any>): string {
  return getFriendlyActivityActionLabel(actionType, workflowStep, details)
}

function getFriendlySourceLabel(source: string, details?: Record<string, any>): string {
  const normalized = normalizeActionText(source)
  const path = String(details?.path || details?.route || '').toLowerCase()

  if (normalized.includes('payment') || normalized.includes('ecocash')) return 'Payments'
  if (path.includes('/finance')) return 'Finance'
  if (path.includes('/workflow')) return 'Approvals'
  if (normalized.includes('reconciliation')) return 'Reconciliation'
  if (normalized.includes('workflow')) return 'Approvals'
  if (normalized.includes('did') || normalized.includes('oid') || normalized.includes('ssi')) return 'Verification'
  return 'App'
}

function buildFriendlySummary(entry: any, all: Record<string, any>, actionLabel: string): string {
  const delegated = Boolean(entry?.onBehalfOf || entry?.onBehalfOfName || entry?.actorContext === 'organization')
  const role = String(all.orgRole || all.approverRole || '').trim()
  const contextText = delegated
    ? `On behalf of your organization${role ? ` (${role})` : ''}`
    : 'In your personal account'
  const amount = all.amount
  const currency = typeof all.currency === 'string' ? all.currency.toUpperCase() : ''
  const amountText =
    typeof amount === 'number' || (typeof amount === 'string' && amount.trim().length > 0)
      ? `${currency ? `${currency} ` : ''}${amount}`
      : ''

  return getFriendlyActivitySummary(actionLabel, contextText, amountText || undefined)
}

function resolveOrgLabel(entry: any, details: Record<string, any>): string | undefined {
  const requestSummary = details?.requestSummary && typeof details.requestSummary === 'object' ? details.requestSummary : {}
  const all = { ...requestSummary, ...details }
  const candidate =
    entry?.onBehalfOfName ||
    all.orgName ||
    all.organizationName ||
    all.merchantName ||
    all.tenantName ||
    entry?.onBehalfOf

  const normalized = String(candidate || '').trim()
  return normalized.length > 0 ? normalized : undefined
}

function resolveCommerceLabel(details: Record<string, any>): string | undefined {
  const requestSummary = details?.requestSummary && typeof details.requestSummary === 'object' ? details.requestSummary : {}
  const all = { ...requestSummary, ...details }
  const raw =
    all.itemName ||
    all.serviceName ||
    all.productName ||
    all.invoiceId ||
    all.invoiceRef ||
    all.reference
  const label = String(raw || '').trim()
  return label.length > 0 ? label : undefined
}

function buildRecentTxnMessage(entry: any): { title: string; subtitle: string; orgLabel?: string } {
  const details = (entry?.details || {}) as Record<string, any>
  const actionLabel = getFriendlyActionLabel(entry?.actionType, entry?.workflowStep, details)
  const orgLabel = resolveOrgLabel(entry, details)
  const commerceLabel = resolveCommerceLabel(details)
  const amount = details?.amount
  const currency = typeof details?.currency === 'string' ? details.currency.toUpperCase() : ''
  const amountText =
    typeof amount === 'number' || (typeof amount === 'string' && amount.trim().length > 0)
      ? `${currency ? `${currency} ` : ''}${amount}`
      : undefined

  if (actionLabel === 'Payment received') {
    const orgText = orgLabel ? ` to ${orgLabel}` : ''
    const forText = commerceLabel ? ` for ${commerceLabel}` : ''
    return {
      title: `Payment completed${orgText}${forText}`,
      subtitle: amountText ? `Amount ${amountText}. Receipt and invoice available.` : 'Receipt and invoice available.',
      orgLabel,
    }
  }

  if (actionLabel === 'Payment request created') {
    const orgText = orgLabel ? ` by ${orgLabel}` : ''
    return {
      title: `Payment request created${orgText}`,
      subtitle: amountText ? `Requested ${amountText}${commerceLabel ? ` for ${commerceLabel}` : ''}.` : 'Ready to share with payer.',
      orgLabel,
    }
  }

  if (actionLabel === 'Invoice created') {
    return {
      title: orgLabel ? `Invoice received from ${orgLabel}` : 'Invoice created',
      subtitle: commerceLabel ? `Reference ${commerceLabel}.` : 'Open timeline for invoice details.',
      orgLabel,
    }
  }

  if (actionLabel === 'Receipt issued') {
    return {
      title: orgLabel ? `Receipt received from ${orgLabel}` : 'Receipt issued',
      subtitle: commerceLabel ? `Reference ${commerceLabel}.` : 'Open timeline to view verification state.',
      orgLabel,
    }
  }

  return {
    title: actionLabel,
    subtitle: orgLabel ? `With ${orgLabel}` : 'Open timeline for full details.',
    orgLabel,
  }
}

function buildFriendlyDetails(entry: any, details: Record<string, any>, actionLabel: string): Array<{ label: string; value: string }> {
  if (!details || typeof details !== 'object') return []

  const requestSummary = details.requestSummary && typeof details.requestSummary === 'object' ? details.requestSummary : {}
  const all = { ...requestSummary, ...details }
  const entries: Array<{ label: string; value: string }> = []

  const add = (label: string, rawValue: unknown) => {
    if (rawValue == null) return
    const text = String(rawValue).trim()
    if (!text) return
    if (entries.some((entry) => entry.label === label && entry.value === text)) return
    entries.push({ label, value: text })
  }

  add('Summary', buildFriendlySummary(entry, all, actionLabel))

  const amount = all.amount
  const currency = typeof all.currency === 'string' ? all.currency.toUpperCase() : ''
  if (typeof amount === 'number' || (typeof amount === 'string' && amount.trim().length > 0)) {
    add('Amount', currency ? `${currency} ${amount}` : amount)
  }

  add('Reference', all.providerRef || all.sourceReference || all.reference)
  add('Transaction ID', all.transactionId || all.paymentId || all.paymentReference)
  add('Invoice', all.invoiceId || all.invoiceRef)
  add('Contact', all.contactName || all.subjectName)
  add('Context', entry?.onBehalfOfName ? `Delegated for ${entry.onBehalfOfName}` : entry?.actorContext === 'organization' ? 'Handled for your organization' : 'Personal account activity')
  add('Reason', all.mismatchReason || all.reason || all.notes || all.error)

  return entries.slice(0, 6)
}

function classifyFlowType(...parts: Array<string | undefined>): FlowCategory {
  const joined = parts.filter(Boolean).join(' ').toLowerCase()

  if (
    joined.includes('field')
    || joined.includes('fept')
    || joined.includes('request_created')
    || joined.includes('approval_pending')
    || joined.includes('release_authorized')
    || joined.includes('workflowstage')
    || joined.includes('in_progress')
    || joined.includes('evidence_captured')
    || joined.includes('payment_triggered')
    || joined.includes('receipt_issued')
    || joined.includes('reconciled')
    || joined.includes('completed')
    || joined.includes('cancelled')
    || joined.includes('revoked')
    || joined.includes('assigned')
  ) {
    return 'FIELD_EXECUTION'
  }

  if (
    joined.includes('failed') ||
    joined.includes('disput') ||
    joined.includes('refund') ||
    joined.includes('mismatch') ||
    joined.includes('revoke') ||
    joined.includes('exception')
  ) {
    return 'EXCEPTION'
  }
  if (
    joined.includes('requis') ||
    joined.includes('approve') ||
    joined.includes('release') ||
    joined.includes('acknowledg') ||
    joined.includes('assign')
  ) {
    return 'REQUISITION'
  }
  if (joined.includes('escrow') || joined.includes('settlement') || joined.includes('payout')) {
    return 'SETTLEMENT'
  }
  if (
    joined.includes('delivery') ||
    joined.includes('evidence') ||
    joined.includes('signature') ||
    joined.includes('photo') ||
    joined.includes('gps')
  ) {
    return 'EVIDENCE'
  }
  if (
    joined.includes('receipt') ||
    joined.includes('invoice') ||
    joined.includes('quote') ||
    joined.includes('payment')
  ) {
    return 'PAYMENT'
  }
  if (
    joined.includes('credential') ||
    joined.includes('vc') ||
    joined.includes('proof') ||
    joined.includes('did') ||
    joined.includes('verify')
  ) {
    return 'CREDENTIAL'
  }

  return 'SYSTEM'
}

function isTerminalActivityState(...parts: Array<string | undefined>): boolean {
  const normalized = parts
    .map((part) => String(part || '').trim().toLowerCase().replace(/[._-]+/g, ' '))
    .filter(Boolean)
    .join(' ')

  if (!normalized) return false

  return (
    normalized.includes('completed')
    || normalized.includes('done')
    || normalized.includes('expired')
    || normalized.includes('cancelled')
    || normalized.includes('canceled')
    || normalized.includes('revoked')
    || normalized.includes('rejected')
    || normalized.includes('failed')
    || normalized.includes('failure')
    || normalized.includes('error')
    || normalized.includes('settled')
    || normalized.includes('reconciled')
    || normalized.includes('receipt issued')
    || normalized.includes('closed')
    || normalized.includes('paid')
    || normalized.includes('success')
  )
}

function inferAuditContext(entry: Partial<AuditLogEntry>, fallback?: AuditContext): AuditContext {
  // Prefer dedicated DB column returned by API, then details JSON fallback
  if (entry.actorContext && ['organization', 'personal', 'guest', 'service'].includes(entry.actorContext)) {
    return entry.actorContext
  }
  const explicit = (entry.details as any)?.actorContext
  const normalized = typeof explicit === 'string' ? explicit.toLowerCase() : undefined
  if (
    normalized === 'organization' ||
    normalized === 'personal' ||
    normalized === 'guest' ||
    normalized === 'service'
  ) {
    return normalized
  }
  if ((entry as any)?.contextType) return (entry as any).contextType as AuditContext
  return fallback || 'service'
}

function normalizePagedResponse<T>(payload: any): PagedAuditResponse<T> {
  if (Array.isArray(payload)) {
    return {
      items: payload as T[],
      hasMore: false,
    }
  }

  const items = Array.isArray(payload?.items) ? (payload.items as T[]) : []
  return {
    items,
    hasMore: Boolean(payload?.hasMore),
    nextCursor: typeof payload?.nextCursor === 'string' ? payload.nextCursor : undefined,
  }
}

function mapAuditLogToTimelineItem(entry: any): AuditItem {
  const details = (entry.details || {}) as Record<string, any>
  const eventType = String(entry.actionType || entry.workflowStep || 'audit_event')
  const occurredAt = entry.createdAt || new Date().toISOString()
  const source = String(details.source || details.module || 'audit').toUpperCase()
  const displayTitle = getFriendlyActionLabel(entry.actionType, entry.workflowStep, details)

  const collectEvidenceImages = () => {
    const candidates: string[] = []
    const maybePush = (value: unknown) => {
      if (typeof value !== 'string') return
      const trimmed = value.trim()
      if (!trimmed) return
      if (
        trimmed.startsWith('data:image/')
        || trimmed.startsWith('http://')
        || trimmed.startsWith('https://')
      ) {
        candidates.push(trimmed)
      }
    }

    maybePush(details.photoUri)
    maybePush(details.evidenceImage)
    maybePush(details.imageDataUrl)
    maybePush(details?.evidence?.photoUri)
    maybePush(details?.workflowInput?.photoUri)
    maybePush(details?.workflowOutput?.photoUri)

    const evidenceList = Array.isArray(details.evidenceImages)
      ? details.evidenceImages
      : Array.isArray(details.evidenceAttachments)
        ? details.evidenceAttachments.map((item: any) => item?.url)
        : []
    for (const item of evidenceList) maybePush(item)

    return Array.from(new Set(candidates)).slice(0, 8)
  }

  const evidenceImages = collectEvidenceImages()

  return {
    id: String(entry.id || `${eventType}:${occurredAt}`),
    eventType,
    title: String(entry.actionType || entry.workflowStep || 'Audit Event').replace(/[._]/g, ' '),
    displayTitle,
    source,
    sourceLabel: getFriendlySourceLabel(source, details),
    status: String(details.status || details.result || ''),
    amount: typeof details.amount === 'number' ? details.amount : undefined,
    currency: typeof details.currency === 'string' ? details.currency : undefined,
    occurredAt,
    actorDid: entry.actorDid,
    actorName: entry.actorName,
    subjectDid: typeof details.subjectDid === 'string' ? details.subjectDid : undefined,
    subjectName: typeof details.subjectName === 'string' ? details.subjectName : undefined,
    contactName: typeof details.contactName === 'string' ? details.contactName : undefined,
    evidenceImages: evidenceImages.length > 0 ? evidenceImages : undefined,
    details,
    friendlyDetails: buildFriendlyDetails(entry, details, displayTitle),
  }
}

export default function ActivityPage() {
  const router = useRouter()
  const [isIssuer, setIsIssuer] = useState(false)
  const [tenantId, setTenantId] = useState<string | null>(null)

  useEffect(() => {
    const orgMode = getContextMode() === 'org'
    const role = getUserRole() ?? ''
    setIsIssuer(orgMode && ['owner', 'admin', 'issuer', 'approver', 'manager', 'finance'].includes(role))
    setTenantId(orgMode ? getActiveOrgId() : null)
  }, [])

  const [summary, setSummary] = useState<ReconSummary | null>(null)
  const [exceptions, setExceptions] = useState<any[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditLoadingMore, setAuditLoadingMore] = useState(false)
  const [auditHasMore, setAuditHasMore] = useState(false)
  const [auditTokenCursors, setAuditTokenCursors] = useState<Record<string, TokenAuditCursorState>>({})
  const [delegatedSummaries, setDelegatedSummaries] = useState<DelegatedCredentialSummary[]>([])
  const [delegatedLoading, setDelegatedLoading] = useState(false)
  const [delegatedError, setDelegatedError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Lookup state
  const [searchRef, setSearchRef] = useState('')
  const [searchResult, setSearchResult] = useState<{ status: string; events: AuditItem[] } | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)

  // Drilldown state
  const [selectedRef, setSelectedRef] = useState<string | null>(null)
  const [events, setEvents] = useState<AuditItem[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventsLoadingMore, setEventsLoadingMore] = useState(false)
  const [eventsHasMore, setEventsHasMore] = useState(false)
  const [eventsCursor, setEventsCursor] = useState<string | undefined>(undefined)
  const [eventsToken, setEventsToken] = useState<string | undefined>(undefined)
  const [recentTxns, setRecentTxns] = useState<RecentTxnRow[]>([])
  const [runningActions, setRunningActions] = useState<RunningAction[]>([])
  const [txnFilter, setTxnFilter] = useState<ActivityFeedFilter>('all')
  const [activityLens, setActivityLens] = useState<ActivityLens>('personal')
  const [favoriteRefs, setFavoriteRefs] = useState<string[]>([])
  const [dateFilter, setDateFilter] = useState<'all' | '1d' | '7d' | '30d'>('all')

  const [evidenceMode, setEvidenceMode] = useState(false)
  const [evidenceLoading, setEvidenceLoading] = useState(false)
  const resumeKeyByRunRef = useRef<Record<string, string>>({})
  const auditLoadMoreRef = useRef<HTMLDivElement | null>(null)

  const fetchAuditPageForToken = useCallback(
    async (
      token: string,
      options?: { limit?: number; cursor?: string; resourceId?: string },
    ): Promise<PagedAuditResponse<AuditLogEntry>> => {
      const limit = options?.limit ?? 24
      const cursor = options?.cursor
      const resourceId = options?.resourceId

      try {
        const res = await api.get('/api/audit/logs/paged', {
          params: { limit, cursor, resourceId },
          headers: { Authorization: `Bearer ${token}` },
          skipAuthRedirect: true as any,
        } as any)

        const normalized = normalizePagedResponse<AuditLogEntry>(res.data)
        return {
          ...normalized,
          items: normalized.items.map((entry: AuditLogEntry) => ({
            ...entry,
            contextType: inferAuditContext(entry),
            _authToken: token,
          })),
        }
      } catch {
        if (cursor) {
          return { items: [], hasMore: false }
        }

        try {
          const fallback = await api.get('/api/audit/logs', {
            params: { limit, resourceId },
            headers: { Authorization: `Bearer ${token}` },
            skipAuthRedirect: true as any,
          } as any)

          const raw = Array.isArray(fallback.data) ? fallback.data : []
          return {
            items: raw.map((entry: AuditLogEntry) => ({
              ...entry,
              contextType: inferAuditContext(entry),
              _authToken: token,
            })),
            hasMore: false,
          }
        } catch {
          return { items: [], hasMore: false }
        }
      }
    },
    [],
  )

  const mergeAuditLogs = useCallback((rows: AuditLogEntry[]): AuditLogEntry[] => {
    return Array.from(new Map(rows.map((entry) => [entry.id, entry])).values()).sort(
      (a, b) => dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf(),
    )
  }, [])

  const getContextAuditTokens = useCallback((): string[] => {
    const mode = getContextMode()
    const primaryToken = mode === 'org' ? getOrgToken() : getWalletToken()
    const fallbackToken = getPreferredToken()

    return [primaryToken, fallbackToken]
      .filter((token): token is string => typeof token === 'string' && token.trim().length > 0)
      .filter((token, index, list) => list.indexOf(token) === index)
  }, [])

  const getResumeIdempotencyKey = useCallback((runId: string, action: 'capture_evidence') => {
    const cacheKey = `${runId}:${action}`
    const existing = resumeKeyByRunRef.current[cacheKey]
    if (existing) return existing

    const randomPart =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const next = `resume:${runId}:${action}:${randomPart}`
    resumeKeyByRunRef.current[cacheKey] = next
    return next
  }, [])

  const handleEvidenceCapture = async (payload: EvidencePayload) => {
    if (!selectedRef) return
    setEvidenceLoading(true)
    try {
      const idempotencyKey = getResumeIdempotencyKey(selectedRef, 'capture_evidence')
      const token = getPreferredToken()
      if (!token) {
        throw new Error('Missing active context session')
      }

      if (getContextMode() === 'org') {
        const orgTenantId = getActiveOrgId()
        const bundle = (orgTenantId ? getCachedOrgContextBundle(orgTenantId) : null)
          || (orgTenantId ? await refreshOrgContextBundle(orgTenantId) : null)
        const policyDecision = evaluateOrgActionPolicy(bundle, {
          actionType: 'workflow.capture_evidence',
          evidenceProvided: true,
          actionTimestamp: new Date().toISOString(),
        })

        if (!policyDecision.allowed) {
          const escalationHint = policyDecision.suggestedEscalationRole
            ? ` Escalate to ${policyDecision.suggestedEscalationRole}.`
            : ''
          throw new Error(`${policyDecision.reason || 'Evidence capture blocked by org policy.'}${escalationHint}`)
        }
      }

      const phaseFromQuery = typeof router.query.phase === 'string' ? router.query.phase.trim().toLowerCase() : ''
      const phase = phaseFromQuery === 'after' ? 'after' : 'before'

      const resumeRes = await api.post(
        `/workflows/runs/${selectedRef}/resume`,
        {
          evidenceHash: payload.sha256,
          photoUri: payload.imageBase64 ? `data:${payload.mimeType};base64,${payload.imageBase64}` : undefined,
          gps: payload.gpsLat ? { lat: payload.gpsLat, lng: payload.gpsLng } : undefined,
          notes: payload.notes,
          phase,
          performanceVc: payload.performanceVc,
          receiptVc: payload.receiptVc,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-idempotency-key': idempotencyKey,
          },
        },
      )

      if (String(resumeRes?.data?.status || '').toLowerCase() === 'failed') {
        throw new Error(String(resumeRes?.data?.error || `Evidence ${phase} stage failed`))
      }

      delete resumeKeyByRunRef.current[`${selectedRef}:capture_evidence`]
      import('@mantine/notifications').then((n) => {
        n.notifications.show({ title: 'Task Updated', message: 'Evidence captured successfully.', color: 'green' })
      })
      setEvidenceMode(false)
      if (router.query.capture === '1') {
        setSelectedRef(null)
        setEvents([])
        setEventsHasMore(false)
        setEventsCursor(undefined)
        setEventsToken(undefined)
        void router.push('/finance?tab=field')
      } else {
        handleSelectRef(selectedRef)
      }
    } catch (err: any) {
      const errorMessage = String(
        err?.response?.data?.error
          || err?.response?.data?.message
          || err?.message
          || 'Server error',
      )
      import('@mantine/notifications').then((n) => {
        n.notifications.show({ title: 'Capture Failed', message: errorMessage, color: 'red' })
      })
    } finally {
      setEvidenceLoading(false)
    }
  }

  const fetchIssuerData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const p1 = api.get('/api/reconciliation/summary')
      const p2 = api.get('/api/reconciliation/exceptions?limit=10')
      const [r1, r2] = await Promise.all([p1, p2])
      const d = r1.data
      setSummary({
        total: d.total ?? 0,
        reconciled: d.reconciled ?? 0,
        payoutFailed: (d.payoutFailed ?? 0) + (d.disputed ?? 0),
        disputed: d.disputed ?? 0,
        refunded: d.refunded ?? 0,
      })
      setExceptions(r2.data.exceptions ?? [])
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Failed to load activity')
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  const fetchAuditLogs = useCallback(async () => {
    setAuditLoading(true)
    try {
      const tokenCandidates = getContextAuditTokens()

      if (tokenCandidates.length === 0) {
        setAuditLogs([])
        setAuditHasMore(false)
        setAuditTokenCursors({})
        return
      }

      const resultSets = await Promise.all(tokenCandidates.map((token) => fetchAuditPageForToken(token, { limit: 20 })))
      const rows = resultSets.flatMap((result) => result.items)
      const cursorState: Record<string, TokenAuditCursorState> = {}

      tokenCandidates.forEach((token, index) => {
        const result = resultSets[index]
        cursorState[token] = {
          nextCursor: result.nextCursor,
          hasMore: result.hasMore,
        }
      })

      setAuditTokenCursors(cursorState)
      setAuditHasMore(Object.values(cursorState).some((state) => state.hasMore))
      setAuditLogs(mergeAuditLogs(rows))
    } catch {
      setAuditLogs([])
      setAuditHasMore(false)
      setAuditTokenCursors({})
    } finally {
      setAuditLoading(false)
    }
  }, [fetchAuditPageForToken, getContextAuditTokens, mergeAuditLogs])

  const loadMoreAuditLogs = useCallback(async () => {
    if (auditLoading || auditLoadingMore || !auditHasMore) return

    const entries = Object.entries(auditTokenCursors).filter(([, state]) => state.hasMore)
    if (entries.length === 0) {
      setAuditHasMore(false)
      return
    }

    setAuditLoadingMore(true)
    try {
      const resultSets = await Promise.all(
        entries.map(([token, state]) => fetchAuditPageForToken(token, { limit: 20, cursor: state.nextCursor })),
      )

      const nextCursorState: Record<string, TokenAuditCursorState> = { ...auditTokenCursors }
      const appendedRows: AuditLogEntry[] = []

      entries.forEach(([token], index) => {
        const result = resultSets[index]
        appendedRows.push(...result.items)
        nextCursorState[token] = {
          nextCursor: result.nextCursor,
          hasMore: result.hasMore,
        }
      })

      setAuditTokenCursors(nextCursorState)
      setAuditHasMore(Object.values(nextCursorState).some((state) => state.hasMore))
      if (appendedRows.length > 0) {
        setAuditLogs((current) => mergeAuditLogs([...current, ...appendedRows]))
      }
    } finally {
      setAuditLoadingMore(false)
    }
  }, [auditHasMore, auditLoading, auditLoadingMore, auditTokenCursors, fetchAuditPageForToken, mergeAuditLogs])

  const fetchRecentTxns = useCallback(async () => {
    try {
      const tokenCandidates = getContextAuditTokens()

      if (tokenCandidates.length === 0) {
        setRecentTxns([])
        return
      }

      const resultSets = await Promise.all(tokenCandidates.map((token) => fetchAuditPageForToken(token, { limit: 16 })))
      const rows = resultSets.flatMap((result) => result.items)

      const deduped = Array.from(new Map(rows.map((entry) => [entry.id, entry])).values())
        .sort((a, b) => dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf())
        .slice(0, 12)

      const mapped = deduped
        .map((entry: any): RecentTxnRow | null => {
          const ref = String(
            entry?.resourceId ??
            entry?.workflowId ??
            entry?.details?.providerRef ??
            entry?.details?.transactionId ??
            entry?.id ??
            '',
          ).trim()
          if (!ref) return null
          const context = inferAuditContext(entry)
          const friendlyMessage = buildRecentTxnMessage(entry)
          const details = (entry?.details && typeof entry.details === 'object') ? entry.details : {}
          return {
            id: String(entry?.id ?? ref),
            ref,
            title: friendlyMessage.title,
            subtitle: friendlyMessage.subtitle,
            status: String(entry?.status ?? details?.status ?? details?.result ?? '').trim() || undefined,
            stage: extractFeptStage(details as Record<string, any>, entry) || undefined,
            eventType: String(entry?.eventType ?? entry?.actionType ?? '').trim() || undefined,
            flow: classifyFlowType(entry?.actionType, entry?.workflowStep, entry?.resourceId, ref),
            context,
            scopeLabel: entry?.onBehalfOf || entry?.onBehalfOfName ? 'on-behalf' : 'personal',
            createdAt: entry?.createdAt ?? new Date().toISOString(),
            actorLabel: formatIdentity(entry?.actorName, entry?.actorDid),
            orgLabel: friendlyMessage.orgLabel,
            authToken: String(entry?._authToken || ''),
          }
        })
        .filter((row): row is RecentTxnRow => !!row && typeof row.authToken === 'string' && row.authToken.length > 0)
        .slice(0, 5)
      setRecentTxns(mapped)
    } catch {
      setRecentTxns([])
    }
  }, [fetchAuditPageForToken, getContextAuditTokens])

  useEffect(() => {
    setFavoriteRefs(readFavoriteActivityRefs())
    setActivityLens(getContextMode() === 'org' ? 'org' : 'personal')
    setTxnFilter('all')
    setDateFilter('all')
  }, [])

  const dateFilteredAuditLogs = auditLogs.filter((log) => {
    if (dateFilter === 'all') return true
    const cutoff = dayjs().subtract(dateFilter === '1d' ? 1 : dateFilter === '7d' ? 7 : 30, 'day')
    return dayjs(log.createdAt).isAfter(cutoff)
  })

  const toggleFavoriteRef = useCallback((ref: string) => {
    const normalized = String(ref || '').trim()
    if (!normalized) return

    setFavoriteRefs((current) => {
      const exists = current.includes(normalized)
      const next = exists ? current.filter((item) => item !== normalized) : [normalized, ...current]
      writeFavoriteActivityRefs(next)
      return next
    })
  }, [])

  const scopedRecentTxns = recentTxns.filter((txn) => {
    if (activityLens === 'org') return txn.scopeLabel === 'on-behalf'
    return txn.scopeLabel === 'personal'
  })

  const filteredRecentTxns = scopedRecentTxns.filter((txn) => {
    if (txnFilter === 'all') return true
    if (txnFilter === 'favorites') return favoriteRefs.includes(txn.ref)
    if (txnFilter === 'org') return txn.scopeLabel === 'on-behalf'
    if (txnFilter === 'personal') return txn.scopeLabel === 'personal'
    if (txnFilter === 'payments') return txn.flow === 'PAYMENT' || txn.flow === 'SETTLEMENT'
    if (txnFilter === 'issues') return txn.flow === 'EXCEPTION'
    if (txnFilter === 'documents') {
      const title = txn.title.toLowerCase()
      return txn.flow === 'CREDENTIAL' || title.includes('invoice') || title.includes('receipt') || title.includes('quote')
    }
    return true
  })

  const inferLaunchRoute = useCallback((flow: FlowCategory, ref: string): string => {
    const trimmed = String(ref || '').trim()
    if (!trimmed) return '/activity'

    if (flow === 'FIELD_EXECUTION') return `/finance?tab=field&runId=${encodeURIComponent(trimmed)}`
    if (flow === 'REQUISITION') return `/finance?tab=requisitions&requestId=${encodeURIComponent(trimmed)}`
    if (flow === 'PAYMENT') return `/pay/${encodeURIComponent(trimmed)}`
    return `/activity?ref=${encodeURIComponent(trimmed)}`
  }, [])

  const launchTxnAction = useCallback((txn: RecentTxnRow) => {
    const route = inferLaunchRoute(txn.flow, txn.ref)
    upsertRunningAction({
      id: `${txn.flow.toLowerCase()}:${txn.ref}`,
      type: txn.flow === 'FIELD_EXECUTION' ? 'field_run' : txn.flow === 'REQUISITION' ? 'requisition' : txn.flow === 'PAYMENT' ? 'payment' : 'workflow',
      title: txn.title,
      description: `Resume ${txn.title.toLowerCase()}`,
      route,
      refId: txn.ref,
      status: 'active',
    })
    void router.push(route)
  }, [inferLaunchRoute, router])

  const fetchDelegatedSummaries = useCallback(async () => {
    const walletToken = getWalletToken()
    if (!walletToken) {
      setDelegatedSummaries([])
      setDelegatedError(null)
      return
    }

    setDelegatedLoading(true)
    setDelegatedError(null)
    try {
      const res = await api.get('/api/audit/on-behalf-credentials', {
        params: { limit: 16 },
        headers: { Authorization: `Bearer ${walletToken}` },
      })

      const rows = Array.isArray(res.data) ? res.data : []
      setDelegatedSummaries(rows as DelegatedCredentialSummary[])
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Unable to load delegated credential summaries'
      setDelegatedSummaries([])
      setDelegatedError(message)
    } finally {
      setDelegatedLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isIssuer) fetchIssuerData()
    else setLoading(false)
  }, [isIssuer, fetchIssuerData])

  useEffect(() => {
    fetchAuditLogs()
    fetchRecentTxns()
    fetchDelegatedSummaries()
    setRunningActions(getRunningActions().filter((entry) => entry.status !== 'completed').slice(0, 6))
  }, [fetchAuditLogs, fetchDelegatedSummaries, fetchRecentTxns])

  useEffect(() => {
    const sentinel = auditLoadMoreRef.current
    if (!sentinel || !auditHasMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry?.isIntersecting) {
          void loadMoreAuditLogs()
        }
      },
      {
        root: null,
        threshold: 0.25,
        rootMargin: '80px 0px',
      },
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [auditHasMore, loadMoreAuditLogs])

  useEffect(() => {
    const ref = typeof router.query.ref === 'string' ? router.query.ref.trim() : ''
    const capture = router.query.capture === '1'
    if (ref && ref !== searchRef) {
      setSearchRef(ref)
      void handleSelectRef(ref)
    }
    if (ref && capture) {
      setEvidenceMode(true)
    }
  }, [router.query.ref, router.query.capture])

  const fetchActivityPage = useCallback(
    async (
      ref: string,
      token: string,
      options?: { limit?: number; cursor?: string },
    ): Promise<PagedAuditResponse<AuditItem>> => {
      const limit = options?.limit ?? 40
      const cursor = options?.cursor

      try {
        const res = await api.get(`/api/audit/activity/${encodeURIComponent(ref)}/paged`, {
          params: { limit, cursor, ts: Date.now() },
          headers: { Authorization: `Bearer ${token}` },
          skipAuthRedirect: true as any,
        } as any)

        const normalized = normalizePagedResponse<any>(res.data)
        return {
          hasMore: normalized.hasMore,
          nextCursor: normalized.nextCursor,
          items: normalized.items.map((entry: any) => mapAuditLogToTimelineItem(entry)),
        }
      } catch {
        if (cursor) {
          return { items: [], hasMore: false }
        }

        try {
          const fallback = await api.get(`/api/audit/activity/${encodeURIComponent(ref)}`, {
            params: { limit, ts: Date.now() },
            headers: { Authorization: `Bearer ${token}` },
            skipAuthRedirect: true as any,
          } as any)

          return {
            items: safeArray(fallback.data).map((entry: any) => mapAuditLogToTimelineItem(entry)),
            hasMore: false,
          }
        } catch {
          return { items: [], hasMore: false }
        }
      }
    },
    [],
  )

  const loadMoreEvents = useCallback(async () => {
    if (!selectedRef || !eventsToken || !eventsHasMore || eventsLoadingMore) return

    setEventsLoadingMore(true)
    try {
      const page = await fetchActivityPage(selectedRef, eventsToken, {
        limit: 40,
        cursor: eventsCursor,
      })

      setEventsCursor(page.nextCursor)
      setEventsHasMore(page.hasMore)
      if (page.items.length > 0) {
        setEvents((current) => {
          const deduped = Array.from(new Map([...current, ...page.items].map((entry) => [entry.id, entry])).values())
          return deduped.sort(
            (a: AuditItem, b: AuditItem) => dayjs(b.occurredAt).valueOf() - dayjs(a.occurredAt).valueOf(),
          )
        })
      }
    } finally {
      setEventsLoadingMore(false)
    }
  }, [eventsCursor, eventsHasMore, eventsLoadingMore, eventsToken, fetchActivityPage, selectedRef])

  const handleSearch = async () => {
    if (!searchRef.trim()) return
    setSearchLoading(true)
    try {
      const [statusResult] = await Promise.allSettled([api.get(`/api/reconciliation/status/${searchRef}`)])

      const tokenCandidates = [getWalletToken(), getPreferredToken()]
        .filter((token): token is string => typeof token === 'string' && token.length > 0)
        .filter((token, index, list) => list.indexOf(token) === index)

      const mode = getContextMode()
      const scopedTokenCandidates =
        mode === 'org'
          ? tokenCandidates.filter((token) => token === getOrgToken() || token === getPreferredToken())
          : tokenCandidates.filter((token) => token === getWalletToken() || token === getPreferredToken())

      const activitySets = await Promise.all(
        scopedTokenCandidates.map(async (token) => {
          try {
            const page = await fetchActivityPage(searchRef, token, { limit: 40 })
            return page.items
          } catch {
            return [] as AuditItem[]
          }
        }),
      )

      const statusData =
        statusResult.status === 'fulfilled'
          ? statusResult.value.data
          : statusResult.reason?.response?.status === 404
            ? statusResult.reason?.response?.data
            : null

      const deduped = Array.from(new Map(activitySets.flat().map((entry) => [entry.id, entry])).values())
      const sortedItems = deduped.sort(
        (a: AuditItem, b: AuditItem) => dayjs(b.occurredAt).valueOf() - dayjs(a.occurredAt).valueOf(),
      )

      setSearchResult({
        status:
          statusData?.status?.status ??
          statusData?.status ??
          (sortedItems.length > 0 ? 'found' : statusData?.found === false ? 'not found' : null),
        events: sortedItems,
      })
      setSelectedRef(searchRef)
      setEvents(sortedItems)
      setEventsHasMore(false)
      setEventsCursor(undefined)
      setEventsToken(undefined)
    } catch {
      setSearchResult(null)
    } finally {
      setSearchLoading(false)
    }
  }

  const handleSelectRef = async (ref: string, tokenOverride?: string) => {
    setSelectedRef(ref)
    setEventsLoading(true)
    try {
      // In org context prefer the org token so the activity endpoint returns org-scoped events.
      const contextMode = getContextMode()
      const token = tokenOverride ||
        (contextMode === 'org' ? getOrgToken() : null) ||
        getWalletToken() ||
        getPreferredToken() ||
        getOrgToken()
      if (!token) {
        setEvents([])
        setEventsHasMore(false)
        setEventsCursor(undefined)
        setEventsToken(undefined)
        return
      }

      const firstPage = await fetchActivityPage(ref, token, { limit: 40 })
      let timelineItems = firstPage.items.sort(
        (a: AuditItem, b: AuditItem) => dayjs(b.occurredAt).valueOf() - dayjs(a.occurredAt).valueOf(),
      )

      if (timelineItems.length === 0) {
        try {
          const runRes = await api.get(`/workflows/runs/${encodeURIComponent(ref)}`, {
            headers: { Authorization: `Bearer ${token}` },
            skipAuthRedirect: true as any,
          } as any)

          const run = runRes.data || {}
          const rawOutput = run.output
          const parsedOutput = typeof rawOutput === 'string'
            ? (() => {
                try {
                  return JSON.parse(rawOutput)
                } catch {
                  return {}
                }
              })()
            : (rawOutput && typeof rawOutput === 'object' ? rawOutput : {})

          const stage = extractFeptStage(parsedOutput as Record<string, any>, {
            workflowStep: run.currentStep,
            status: run.status,
            eventType: run.eventType,
          })
          const occurredAt = run.updatedAt || run.completedAt || run.startedAt || run.createdAt || new Date().toISOString()

          timelineItems = [
            {
              id: `workflow-run:${String(run.id || ref)}:${stage || String(run.status || 'UNKNOWN')}`,
              eventType: stage || String(run.status || 'workflow_run_status'),
              title: stage ? toFeptStageLabel(stage) : 'Workflow run status',
              displayTitle: stage ? toFeptStageLabel(stage) : 'Workflow run status',
              source: 'WORKFLOW',
              sourceLabel: 'Approvals',
              status: stage || String(run.status || ''),
              occurredAt,
              details: {
                workflowRunId: String(run.id || ref),
                workflowId: run.workflowId || run.workflow_id,
                workflowStage: stage || undefined,
                photoUri: parsedOutput?.evidence?.photoUri || parsedOutput?.photoUri,
                evidenceImage: parsedOutput?.evidenceImage,
              },
              friendlyDetails: [
                { label: 'Summary', value: stage ? `Current stage: ${toFeptStageLabel(stage)}` : 'Workflow run exists and is awaiting next action.' },
                { label: 'Run ID', value: String(run.id || ref) },
              ],
              evidenceImages: Array.from(
                new Set(
                  [
                    parsedOutput?.evidence?.photoUri,
                    parsedOutput?.photoUri,
                    parsedOutput?.evidenceImage,
                  ].filter((item): item is string => typeof item === 'string' && item.trim().length > 0),
                ),
              ),
            },
          ]
        } catch {
          // Keep empty timeline when run lookup is unavailable.
        }
      }

      setEvents(timelineItems)
      setEventsCursor(firstPage.nextCursor)
      setEventsHasMore(firstPage.hasMore)
      setEventsToken(token)
    } catch {
      setEvents([])
      setEventsHasMore(false)
      setEventsCursor(undefined)
      setEventsToken(undefined)
    } finally {
      setEventsLoading(false)
    }
  }

  const getEventIcon = (type: string) => {
    const normalized = type.toLowerCase()
    switch (type) {
      case 'quote_issued':
      case 'invoice_issued':
        return <IconReceipt size={16} />
      case 'payment_link_created':
        return <IconCheck size={16} />
      case 'receipt_issued':
      case 'payment_settled':
        return <IconCheck size={16} />
      case 'PRESENTATION_VERIFIED':
      case 'presentation_verified':
        return <IconCheck size={16} />
      case 'reconciliation_failed':
        return <IconX size={16} />
      default:
        if (normalized.includes('receipt')) return <IconReceipt size={16} />
        if (normalized.includes('payment') || normalized.includes('requis')) return <IconCheck size={16} />
        if (normalized.includes('presentation') || normalized.includes('proof') || normalized.includes('verify'))
          return <IconCheck size={16} />
        return <IconClock size={16} />
    }
  }

  const getEventColor = (type: string) => {
    const normalized = type.toLowerCase()
    switch (type) {
      case 'payment_settled':
      case 'receipt_issued':
        return 'green'
      case 'PRESENTATION_VERIFIED':
      case 'presentation_verified':
        return 'indigo'
      case 'reconciliation_failed':
        return 'red'
      default:
        if (normalized.includes('presentation') || normalized.includes('proof') || normalized.includes('verify'))
          return 'indigo'
        return 'blue'
    }
  }

  const formatIdentity = (name?: string, did?: string) => {
    if (name && name.trim()) return name.trim()
    if (did && did.trim()) return did.trim()
    return 'Unknown actor'
  }

  const formatStatus = (status?: string) => (status ? status.replace(/_/g, ' ') : 'Pending review')

  const statusColor = (status?: string) => {
    const normalized = (status || '').toUpperCase()
    if (normalized.includes('RECONCILED') || normalized.includes('RECEIPT') || normalized.includes('ACKNOWLEDGED'))
      return 'green'
    if (normalized.includes('FAILED') || normalized.includes('DISPUTED') || normalized.includes('MISMATCH'))
      return 'red'
    if (normalized.includes('PAID') || normalized.includes('RELEASED') || normalized.includes('APPROVED')) return 'blue'
    return 'gray'
  }

  const onBehalfAuditLogs = dateFilteredAuditLogs.filter((entry) => Boolean(entry.onBehalfOf || entry.onBehalfOfName))
  const personalAuditLogs = dateFilteredAuditLogs.filter((entry) => !entry.onBehalfOf && !entry.onBehalfOfName)
  const scopedActionLogs = activityLens === 'org' ? onBehalfAuditLogs : personalAuditLogs

  return (
    <AppShellMobile>
      <Stack gap="md" px="md" pt="md">
        {/* Header */}
        <Group justify="space-between" align="center">
          <Box>
            <Title order={3}>{isIssuer ? 'Audit Trail' : 'My History'}</Title>
            <Text size="sm" c="dimmed">
              {isIssuer
                ? 'Organisation audit trail — actions, exceptions, and reconciliation.'
                : 'Your personal activity — payments, receipts, and verified actions.'}
            </Text>
          </Box>
          <ActionIcon variant="subtle" color="gray" size="lg" onClick={fetchIssuerData} loading={loading}>
            <IconRefresh size={18} />
          </ActionIcon>
        </Group>

        {/* Lookup */}
        <Group align="flex-end" gap="sm">
          <TextInput
            style={{ flex: 1 }}
            placeholder="Search org, receipt, invoice, provider ref..."
            value={searchRef}
            onChange={(e) => setSearchRef(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <ActionIcon
            size={36}
            radius="md"
            color="credentis"
            variant="filled"
            onClick={handleSearch}
            loading={searchLoading}
          >
            <IconSearch size={18} />
          </ActionIcon>
        </Group>

        {loading ? (
          <Center py="xl">
            <Loader size="sm" />
          </Center>
        ) : error ? (
          <ErrorAlert message={error} />
        ) : (
          <>
            {/* Stats (issuer/admin context) */}
            {isIssuer && summary && (
              <Group grow>
                <Paper p="xs" radius="md" withBorder>
                  <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                    Pending
                  </Text>
                  <Text fw={700} size="lg" c="blue">
                    {summary.total - summary.reconciled - summary.payoutFailed}
                  </Text>
                </Paper>
                <Paper p="xs" radius="md" withBorder>
                  <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                    Errors
                  </Text>
                  <Text fw={700} size="lg" c="red">
                    {summary.payoutFailed}
                  </Text>
                </Paper>
                <Paper p="xs" radius="md" withBorder>
                  <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                    Reconciled
                  </Text>
                  <Text fw={700} size="md" c="green">
                    {summary.reconciled}
                  </Text>
                </Paper>
              </Group>
            )}

            {/* Exceptions */}
            {isIssuer && exceptions.length > 0 && (
              <Box>
                <Group justify="space-between" mb="xs">
                  <Text size="sm" fw={600}>
                    Recent Exceptions
                  </Text>
                  <Text size="xs" c="dimmed">
                    These are unresolved timeline entries, not app errors.
                  </Text>
                </Group>
                <Stack gap="xs">
                  {exceptions.map((ex, index) => (
                    <Card
                      key={`${ex.providerRef || 'exception'}-${ex.id || index}`}
                      radius="md"
                      withBorder
                      padding="sm"
                      onClick={() => handleSelectRef(ex.providerRef)}
                      style={{ cursor: 'pointer' }}
                    >
                      {(() => {
                        const flow = classifyFlowType(ex.status, ex.providerRef, ex.mismatchReason || ex.reason)
                        return (
                          <Badge color={FLOW_BADGE[flow].color} variant="light" size="xs" mb={6}>
                            {FLOW_BADGE[flow].label}
                          </Badge>
                        )
                      })()}
                      <Group justify="space-between" wrap="nowrap">
                        <Box style={{ flex: 1, minWidth: 0 }}>
                          <Group gap={6}>
                            <Badge color="red" variant="light" size="xs">
                              EXCEPTION
                            </Badge>
                            <Text fw={600} size="sm" truncate style={{ fontFamily: 'monospace' }}>
                              {ex.providerRef}
                            </Text>
                          </Group>
                          <Text size="xs" c="dimmed" mt={4} truncate>
                            {ex.mismatchReason || ex.reason || ex.status || 'Awaiting reconciliation'}
                          </Text>
                        </Box>
                        <IconChevronRight size={16} color="#94a3b8" />
                      </Group>
                    </Card>
                  ))}
                </Stack>
              </Box>
            )}

            {isIssuer && exceptions.length === 0 && !summary?.payoutFailed && (
              <Paper p="md" radius="md" withBorder bg="green.0">
                <Group gap="sm">
                  <ThemeIcon color="green" radius="xl" variant="light">
                    <IconCheck size={20} />
                  </ThemeIcon>
                  <Box>
                    <Text fw={600} size="sm" c="green.9">
                      All clear
                    </Text>
                    <Text size="xs" c="green.8">
                      No active reconciliation exceptions.
                    </Text>
                  </Box>
                </Group>
              </Paper>
            )}
            {!isIssuer && (
              <Paper p="md" radius="md" withBorder>
                <Text size="sm" fw={600}>
                  Holder Audit View
                </Text>
                <Text size="xs" c="dimmed" mt={4}>
                  Search by provider reference to view your receipt/payment timeline. Sensitive issuer internals are
                  hidden.
                </Text>
              </Paper>
            )}

            <Paper p="md" radius="md" withBorder>
              <Group justify="space-between" align="flex-start" mb="xs">
                <Box>
                  <Text size="sm" fw={600}>
                    Running Actions
                  </Text>
                  <Text size="xs" c="dimmed">
                    Reopen in-progress holder tasks across flows.
                  </Text>
                </Box>
              </Group>
              {runningActions.length === 0 ? (
                <Text size="xs" c="dimmed">
                  No running actions saved yet.
                </Text>
              ) : (
                <Stack gap="xs" mb="md">
                  {runningActions.map((entry) => (
                    <Paper
                      key={entry.id}
                      p="xs"
                      radius="md"
                      withBorder
                      style={{ cursor: 'pointer' }}
                      onClick={() => router.push(entry.route)}
                    >
                      <Group justify="space-between" align="flex-start" wrap="nowrap">
                        <Box style={{ minWidth: 0, flex: 1 }}>
                          <Text size="sm" fw={600} truncate>{entry.title}</Text>
                          <Text size="xs" c="dimmed" lineClamp={1}>{entry.description || 'Resume action'}</Text>
                        </Box>
                        <Text size="xs" c="dimmed">{dayjs(entry.updatedAt).fromNow()}</Text>
                      </Group>
                    </Paper>
                  ))}
                </Stack>
              )}

              <Divider mb="sm" />

              <Group justify="space-between" align="flex-start" mb="xs">
                <Box>
                  <Text size="sm" fw={600}>
                    Recent Transactions
                  </Text>
                  <Text size="xs" c="dimmed">
                    Payments, invoices, and workflow updates across contexts.
                  </Text>
                </Box>
                <ActionIcon variant="subtle" color="gray" size="lg" onClick={fetchRecentTxns}>
                  <IconRefresh size={16} />
                </ActionIcon>
              </Group>
              <Paper withBorder radius="xl" p={4} mt={6} mb={6} style={{ background: 'rgba(148, 163, 184, 0.08)' }}>
                <Group gap={4} wrap="nowrap" grow>
                  <Button
                    size="xs"
                    radius="xl"
                    variant={activityLens === 'personal' ? 'filled' : 'subtle'}
                    color={activityLens === 'personal' ? 'indigo' : 'gray'}
                    onClick={() => setActivityLens('personal')}
                  >
                    Mine
                  </Button>
                  <Button
                    size="xs"
                    radius="xl"
                    variant={activityLens === 'org' ? 'filled' : 'subtle'}
                    color={activityLens === 'org' ? 'indigo' : 'gray'}
                    onClick={() => setActivityLens('org')}
                  >
                    Org
                  </Button>
                </Group>
              </Paper>
              <Paper withBorder radius="xl" p={4} mb={6} style={{ background: 'rgba(148, 163, 184, 0.08)' }}>
                <Group gap={4} wrap="nowrap" style={{ overflowX: 'auto', paddingBottom: 2 }}>
                  {([
                    { key: 'all', label: 'All' },
                    { key: 'payments', label: 'Payments' },
                    { key: 'documents', label: 'Documents' },
                    { key: 'issues', label: 'Issues' },
                    { key: 'favorites', label: 'Starred' },
                  ] as const).map((item) => (
                    <Button
                      key={item.key}
                      size="xs"
                      radius="xl"
                      variant={txnFilter === item.key ? 'filled' : 'subtle'}
                      color={txnFilter === item.key ? 'indigo' : 'gray'}
                      style={{ flexShrink: 0 }}
                      onClick={() => setTxnFilter(item.key as ActivityFeedFilter)}
                    >
                      {item.label}
                    </Button>
                  ))}
                </Group>
              </Paper>
              {scopedRecentTxns.length === 0 ? (
                <Text size="xs" c="dimmed">
                  No activity found for this context yet.
                </Text>
              ) : filteredRecentTxns.length === 0 ? (
                <Text size="xs" c="dimmed">
                  No transactions match this filter.
                </Text>
              ) : (
                <Stack gap="xs">
                  {filteredRecentTxns.map((txn) => {
                    const actionable = !isTerminalActivityState(txn.status, txn.stage, txn.eventType, txn.title, txn.subtitle)
                    return (
                    <Paper
                      key={txn.id}
                      p="sm"
                      radius="md"
                      withBorder
                      style={{
                        cursor: 'pointer',
                        background: 'linear-gradient(160deg, rgba(15,23,42,0.02), rgba(148,163,184,0.02))',
                      }}
                      onClick={() => handleSelectRef(txn.ref, txn.authToken)}
                    >
                      <Group justify="space-between" align="flex-start" wrap="nowrap">
                        <Box style={{ flex: 1, minWidth: 0 }}>
                          <Group gap={6} mb={4} wrap="nowrap">
                            <Badge size="xs" variant="light" color={FLOW_BADGE[txn.flow].color}>
                              {FLOW_BADGE[txn.flow].label}
                            </Badge>
                            {txn.orgLabel && (
                              <Badge size="xs" variant="light" color="gray">
                                {txn.orgLabel}
                              </Badge>
                            )}
                          </Group>
                          <Text size="sm" fw={700} truncate>
                            {txn.title}
                          </Text>
                          <Text size="xs" c="dimmed" truncate>
                            {txn.subtitle}
                          </Text>
                          <Text size="10px" c="dimmed" truncate ff="monospace">
                            {txn.ref}
                          </Text>
                        </Box>
                        <Stack gap={4} align="flex-end">
                          <ActionIcon
                            variant="subtle"
                            color={favoriteRefs.includes(txn.ref) ? 'yellow' : 'gray'}
                            onClick={(event) => {
                              event.stopPropagation()
                              toggleFavoriteRef(txn.ref)
                            }}
                            aria-label={favoriteRefs.includes(txn.ref) ? 'Remove favorite' : 'Add favorite'}
                          >
                            {favoriteRefs.includes(txn.ref) ? <IconStarFilled size={16} /> : <IconStar size={16} />}
                          </ActionIcon>
                          <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                            {dayjs(txn.createdAt).fromNow()}
                          </Text>
                        </Stack>
                      </Group>
                      <Group mt={8}>
                        {actionable ? (
                          <Button size="xs" variant="subtle" color="indigo" onClick={(event) => {
                            event.stopPropagation()
                            launchTxnAction(txn)
                          }}>
                            Resume
                          </Button>
                        ) : (
                          <Badge size="xs" variant="light" color="gray">Done</Badge>
                        )}
                      </Group>
                    </Paper>
                    )
                  })}
                </Stack>
              )}
            </Paper>

            <Paper p="md" radius="md" withBorder>
              <Group justify="space-between" align="flex-start" mb="xs">
                <Box>
                  <Text size="sm" fw={600}>
                    Recent Actions
                  </Text>
                  <Text size="xs" c="dimmed">
                    What changed, where it happened, and what you can do next.
                  </Text>
                </Box>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="lg"
                  onClick={() => {
                    void fetchAuditLogs()
                    void fetchDelegatedSummaries()
                  }}
                  loading={auditLoading || delegatedLoading}
                >
                  <IconRefresh size={16} />
                </ActionIcon>
              </Group>

              <Group gap={6} mb="sm" wrap="wrap">
                <Text size="xs" c="dimmed" fw={600}>Date range:</Text>
                {(['all', '1d', '7d', '30d'] as const).map((range) => (
                  <Badge
                    key={range}
                    size="sm"
                    variant={dateFilter === range ? 'filled' : 'outline'}
                    color={dateFilter === range ? 'teal' : 'gray'}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setDateFilter(range)}
                  >
                    {range === 'all' ? 'All time' : range === '1d' ? 'Today' : range === '7d' ? '7 days' : '30 days'}
                  </Badge>
                ))}
              </Group>

              {auditLoading ? (
                <Center py="md">
                  <Loader size="sm" />
                </Center>
              ) : auditLogs.length === 0 ? (
                <Text size="xs" c="dimmed">
                  No recent audit events found for this tenant.
                </Text>
              ) : (
                <Stack gap="sm">
                  <Group justify="space-between" mb={6}>
                    <Text size="xs" fw={700} tt="uppercase">
                      {activityLens === 'org' ? 'Org Actions' : 'My Actions'}
                    </Text>
                    <Badge size="xs" color="gray" variant="light">
                      {scopedActionLogs.length}
                    </Badge>
                  </Group>

                  {scopedActionLogs.length === 0 ? (
                    <Text size="xs" c="dimmed">
                      {activityLens === 'org'
                        ? 'No on-behalf-of-organization actions in the recent window.'
                        : 'No personal-context actions in the recent window.'}
                    </Text>
                  ) : (
                    <Stack gap="xs">
                      {scopedActionLogs.map((log) => {
                        const flow = classifyFlowType(log.actionType, log.workflowStep, log.resourceId)
                        const actorLabel = formatActorLabel(log.actorName, log.actorDid)
                        const onBehalf = log.onBehalfOfName || log.onBehalfOf
                        const outcome = resolveOutcome(log)
                        const category = resolveCategory(log)
                        const details = (log.details || {}) as Record<string, any>
                        const actionHash = String(details.actionHash || (log as any).actionHash || '').trim()
                        const role = String(details.orgRole || details.approverRole || (log as any).actorRole || '').trim()
                        const amount = details.amount
                        const currency = typeof details.currency === 'string' ? details.currency.toUpperCase() : ''
                        const amountText = (typeof amount === 'number' || (typeof amount === 'string' && amount.trim().length > 0))
                          ? `${currency ? `${currency} ` : ''}${amount}` : ''
                        return (
                          <Paper key={log.id} p="sm" radius="md" withBorder style={{ borderLeft: '3px solid var(--mantine-color-gray-4)' }}>
                            <Group gap={6} mb={6} wrap="wrap">
                              <Badge size="xs" variant="light" color={CATEGORY_COLORS[category] || 'gray'}>
                                {category}
                              </Badge>
                              <Badge size="xs" variant="light" color={FLOW_BADGE[flow].color}>
                                {FLOW_BADGE[flow].label}
                              </Badge>
                              <Badge size="xs" variant="filled" color={outcome.color}>
                                {outcome.label}
                              </Badge>
                              {activityLens === 'org' && role && (
                                <Badge size="xs" variant="outline" color="gray">
                                  {role}
                                </Badge>
                              )}
                            </Group>
                            <Group justify="space-between" align="flex-start" wrap="nowrap">
                              <Box style={{ flex: 1, minWidth: 0 }}>
                                <Text size="sm" fw={700} truncate>
                                  {getFriendlyActionLabel(log.actionType, log.workflowStep, details as Record<string, any>)}
                                </Text>
                                <Text size="xs" c="dimmed" truncate mt={2}>
                                  {activityLens === 'org' && onBehalf
                                    ? `${actorLabel} · for ${typeof onBehalf === 'string' && onBehalf.length > 20 ? onBehalf.slice(0, 16) + '…' : onBehalf}`
                                    : actorLabel}
                                </Text>
                                {amountText && (
                                  <Text size="xs" c="teal.7" fw={600} truncate mt={2}>
                                    {amountText}
                                  </Text>
                                )}
                                {log.resourceId && (
                                  <Text size="10px" c="dimmed" ff="monospace" truncate mt={2}>
                                    {log.resourceId}
                                  </Text>
                                )}
                                {actionHash && (
                                  <Group gap={4} mt={4}>
                                    <IconCheck size={10} color="green" />
                                    <Text size="10px" ff="monospace" c="green.7" fw={700}>
                                      Verified: {actionHash.slice(0, 12)}…
                                    </Text>
                                  </Group>
                                )}
                              </Box>
                              <Text size="xs" c="dimmed" ta="right" style={{ whiteSpace: 'nowrap' }}>
                                {dayjs(log.createdAt).fromNow()}
                              </Text>
                            </Group>
                          </Paper>
                        )
                      })}
                    </Stack>
                  )}

                  <Box ref={auditLoadMoreRef}>
                    {auditLoadingMore ? (
                      <Center py="xs">
                        <Loader size="xs" />
                      </Center>
                    ) : auditHasMore ? (
                      <Center py="xs">
                        <Text size="xs" c="dimmed">
                          Scroll to load more activity...
                        </Text>
                      </Center>
                    ) : (
                      <Center py="xs">
                        <Text size="xs" c="dimmed">
                          You are up to date.
                        </Text>
                      </Center>
                    )}
                  </Box>
                </Stack>
              )}
            </Paper>

            {searchResult && (
              <Alert color="blue" variant="light" icon={<IconCheck size={14} />}>
                Transaction found. Details are open below.
              </Alert>
            )}
          </>
        )}
      </Stack>

      <Drawer
        opened={!!selectedRef}
        onClose={() => {
          setSelectedRef(null)
          setEvidenceMode(false)
          setEvents([])
          setEventsHasMore(false)
          setEventsCursor(undefined)
          setEventsToken(undefined)
        }}
        position="bottom"
        size="auto"
        title={selectedRef && selectedRef.length > 32 ? `${selectedRef.slice(0, 16)}…${selectedRef.slice(-8)}` : (selectedRef || 'Details')}
        radius="lg"
        styles={{ content: { borderRadius: '16px 16px 0 0' } }}
      >
        <Stack gap="md" pb="lg">
          {evidenceMode ? (
            <EvidenceCapture
              workflowLabel={`${selectedRef || 'Task'} (${typeof router.query.phase === 'string' ? router.query.phase.toUpperCase() : 'BEFORE'} evidence)`}
              onCapture={handleEvidenceCapture}
              onCancel={() => setEvidenceMode(false)}
            />
          ) : eventsLoading ? (
            <Center py="xl">
              <Loader size="sm" />
            </Center>
          ) : events.length === 0 ? (
            <Text c="dimmed" ta="center">
              No timeline events yet for this reference.
            </Text>
          ) : (
            <Stack gap="sm">
              {events.map((ev) => (
                <Paper key={ev.id} withBorder radius="md" p="sm">
                  <Stack gap="xs">
                    <Group justify="space-between" align="flex-start" wrap="nowrap">
                      <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                        <ThemeIcon radius="xl" size="lg" color={getEventColor(ev.eventType)} variant="light">
                          {getEventIcon(ev.eventType)}
                        </ThemeIcon>
                        <Box style={{ flex: 1, minWidth: 0 }}>
                          <Text size="sm" fw={700} truncate>
                            {ev.displayTitle || getFriendlyActionLabel(ev.eventType)}
                          </Text>
                          <Text size="xs" c="dimmed" truncate>
                            {formatActorLabel(ev.actorName || ev.contactName)}
                          </Text>
                        </Box>
                      </Group>
                      <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                        {dayjs(ev.occurredAt).fromNow()}
                      </Text>
                    </Group>

                    <Group gap="xs">
                      {ev.status && (
                        <Badge size="xs" variant="light" color={statusColor(ev.status)}>
                          {formatStatus(ev.status)}
                        </Badge>
                      )}
                      <Badge size="xs" variant="outline">
                        {ev.sourceLabel || 'App'}
                      </Badge>
                      {!!ev.amount && (
                        <Badge size="xs" variant="light" color="teal">
                          {(ev.currency || 'USD').toUpperCase()} {ev.amount}
                        </Badge>
                      )}
                    </Group>

                    {ev.friendlyDetails && ev.friendlyDetails.length > 0 && (
                      <Paper withBorder radius="md" p="xs" style={{ background: 'rgba(15, 23, 42, 0.02)' }}>
                        <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb={4}>
                          What happened
                        </Text>
                        <Stack gap={4}>
                          {ev.friendlyDetails.map((entry) => (
                            <Group
                              key={`${ev.id}-${entry.label}-${entry.value}`}
                              justify="space-between"
                              align="flex-start"
                              gap="xs"
                              wrap="nowrap"
                            >
                              <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                                {entry.label}
                              </Text>
                              <Text size="xs" fw={500} ta="right" style={{ wordBreak: 'break-word' }}>
                                {entry.value}
                              </Text>
                            </Group>
                          ))}
                        </Stack>
                      </Paper>
                    )}

                    {ev.evidenceImages && ev.evidenceImages.length > 0 && (
                      <Box>
                        <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb={6}>
                          Evidence
                        </Text>
                        <Group gap={8} wrap="wrap">
                          {ev.evidenceImages.slice(0, 4).map((img, idx) => (
                            <Image
                              key={`${ev.id}-${idx}`}
                              src={img}
                              alt="Evidence"
                              radius="sm"
                              h={72}
                              w={72}
                              fit="cover"
                            />
                          ))}
                        </Group>
                      </Box>
                    )}
                  </Stack>
                </Paper>
              ))}
            </Stack>
          )}

          {!evidenceMode && selectedRef && !eventsLoading && (
            <Button
              variant="light"
              color="gray"
              fullWidth
              loading={eventsLoadingMore}
              disabled={!eventsHasMore}
              onClick={() => void loadMoreEvents()}
            >
              {eventsHasMore ? 'Load older events' : 'No more events'}
            </Button>
          )}

          {!evidenceMode && selectedRef && (
            <Button
              color="orange"
              size="lg"
              fullWidth
              mt="md"
              leftSection={<IconActivity size={18} />}
              onClick={() => setEvidenceMode(true)}
            >
              Capture Evidence
            </Button>
          )}
        </Stack>
      </Drawer>
    </AppShellMobile>
  )
}
