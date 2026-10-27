import { readOrgProfile } from './orgProfile'
import type { OrgConfigurationAccess, OrgModule } from '../../src/config/orgModules'

export type WorkflowCapability =
  | 'payment_collection'
  | 'ar_collections'
  | 'ap_payables'
  | 'education_fees'
  | 'internal_requisitions'
  | 'field_execution'
  | 'cash_counter'
  | 'ecommerce'
  | 'hr_ops'

export interface WorkflowTemplateLike {
  id?: string | null
  workflowType?: string | null
  sector?: string | null
  enabled?: boolean
}

const WORKFLOW_TYPE_ALIASES: Record<string, string> = {
  'ecommerce-delivery': 'tpl-quote-invoice-receipt',
  'education-fee-payment': 'tpl-education-fee',
  'cash-counter-payment': 'tpl-cash-counter',
  'collect-payments': 'tpl-payment-collection',
  'payment-collection': 'tpl-payment-collection',
  'accounts-receivable': 'tpl-ar-collections',
  'ar-collections': 'tpl-ar-collections',
  'accounts-payable': 'tpl-ap-payables',
  'ap-payables': 'tpl-ap-payables',
  'field-execution-fept': 'tpl-fept-field-execution',
}

const CAPABILITY_TOKENS: Record<WorkflowCapability, string[]> = {
  payment_collection: ['tpl-payment-collection'],
  ar_collections: ['tpl-ar-collections'],
  ap_payables: ['tpl-ap-payables'],
  education_fees: ['tpl-education-fee'],
  internal_requisitions: [
    'tpl-internal-requisition',
    'tpl-internal-requisitions',
    'tpl-requisition',
    'tpl-requisitions',
    'internal-requisition',
    'internal-requisitions',
    'requisition',
    'requisitions',
  ],
  field_execution: ['tpl-fept-field-execution'],
  cash_counter: ['tpl-cash-counter'],
  ecommerce: ['tpl-quote-invoice-receipt', 'tpl-delivery-escrow'],
  // `hr-requests` is the request type the People & payroll setup answer opens (leave, expense claims).
  hr_ops: ['hr-requests', 'tpl-employee-onboarding', 'tpl-payslip-issuance', 'tpl-payroll-reporting'],
}

function normalizeToken(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
}

function isEnabled(template: WorkflowTemplateLike): boolean {
  return template.enabled !== false
}

export function resolveCanonicalWorkflowType(value: unknown): string {
  const normalized = normalizeToken(value)
  if (!normalized) return ''
  return WORKFLOW_TYPE_ALIASES[normalized] ?? normalized
}

function matchesCapabilityToken(capability: WorkflowCapability, token: string): boolean {
  if (!token) return false

  const allowed = CAPABILITY_TOKENS[capability]
  if (allowed.includes(token)) return true

  if (capability === 'internal_requisitions') {
    return (
      /^tpl-(internal-)?requisitions?([-.].*)?$/.test(token) ||
      /(^|[-.])internal-requisitions?([-.]|$)/.test(token) ||
      /(^|[-.])requisitions?([-.]|$)/.test(token)
    )
  }

  return false
}

function matchesCapabilitySector(capability: WorkflowCapability, sector: string): boolean {
  if (!sector) return false
  if (capability === 'education_fees') return sector === 'education'
  if (capability === 'field_execution') return sector === 'field_execution'
  return false
}

function templateSignals(template: WorkflowTemplateLike): { tokens: Set<string>; sector: string } {
  const id = normalizeToken(template.id)
  const workflowType = normalizeToken(template.workflowType)
  const canonicalType = resolveCanonicalWorkflowType(workflowType || id)
  const sector = normalizeToken(template.sector)

  const tokens = new Set<string>()
  if (id) tokens.add(id)
  if (workflowType) tokens.add(workflowType)
  if (canonicalType) tokens.add(canonicalType)

  return { tokens, sector }
}

export function deriveWorkflowCapabilities(templates: WorkflowTemplateLike[]): Set<WorkflowCapability> {
  const capabilities = new Set<WorkflowCapability>()
  if (!Array.isArray(templates) || templates.length === 0) return capabilities

  for (const template of templates) {
    if (!isEnabled(template)) continue
    const { tokens, sector } = templateSignals(template)

    for (const capability of Object.keys(CAPABILITY_TOKENS) as WorkflowCapability[]) {
      if (matchesCapabilitySector(capability, sector)) {
        capabilities.add(capability)
        continue
      }

      const matched = Array.from(tokens).some((token) => matchesCapabilityToken(capability, token))
      if (matched) capabilities.add(capability)
    }
  }

  return capabilities
}

export function getWorkflowCapabilityFlags(
  templates: WorkflowTemplateLike[],
  access: OrgConfigurationAccess | null | undefined = readOrgProfile()?.access,
) {
  const capabilities = deriveWorkflowCapabilities(templates)
  if (access && access.mode !== 'legacy') {
    const available = (id: OrgModule) => access.modules.some((module) => module.id === id && module.available)
    return {
      paymentCollection: available('collections'),
      arCollections: available('collections'),
      apPayables: available('payables'),
      educationFees: available('school_fees'),
      internalRequisitions: available('purchases'),
      fieldExecution: available('field_jobs'),
      cashCounter: available('commerce'),
      ecommerce: available('commerce'),
      hrOps: available('people_payroll'),
    }
  }
  return {
    paymentCollection: capabilities.has('payment_collection'),
    arCollections: capabilities.has('ar_collections'),
    apPayables: capabilities.has('ap_payables'),
    educationFees: capabilities.has('education_fees'),
    internalRequisitions: capabilities.has('internal_requisitions'),
    fieldExecution: capabilities.has('field_execution'),
    cashCounter: capabilities.has('cash_counter'),
    ecommerce: capabilities.has('ecommerce'),
    hrOps: capabilities.has('hr_ops'),
  }
}

export type WorkflowCapabilityFlags = ReturnType<typeof getWorkflowCapabilityFlags>

export type BusinessCentre =
  | 'field_jobs'
  | 'purchases'
  | 'school_fees'
  | 'commerce'
  | 'people'
  | 'standalone_collection'
  | 'unknown'

export type SharedBusinessLayer = 'receivables' | 'payables' | 'payments' | 'fulfilment'

export interface BusinessCentreClassification {
  centre: BusinessCentre
  layers: SharedBusinessLayer[]
}

/** Classify the business transaction first; money and fulfilment stay attached layers. */
export function classifyBusinessCentre(input: {
  requestType?: unknown
  workflowType?: unknown
  sector?: unknown
}): BusinessCentreClassification {
  const signal = [input.requestType, input.workflowType, input.sector].map(normalizeToken).filter(Boolean).join(' ')
  if (/field|fept|site-access|inspection|maintenance/.test(signal)) {
    return { centre: 'field_jobs', layers: ['receivables', 'payables', 'payments', 'fulfilment'] }
  }
  if (/requisition|purchase-order|supplier|accounts-payable|ap-payable/.test(signal)) {
    return { centre: 'purchases', layers: ['payables', 'payments', 'fulfilment'] }
  }
  if (/education|school-fee/.test(signal)) {
    return { centre: 'school_fees', layers: ['receivables', 'payments'] }
  }
  if (/hr[.-]|leave|expense-claim|payroll|payslip|employee/.test(signal)) {
    return {
      centre: 'people',
      layers: signal.includes('payroll') || signal.includes('payslip') ? ['payables', 'payments'] : [],
    }
  }
  if (/ecommerce|cash-counter|shop|quote|sale|delivery-escrow/.test(signal)) {
    return { centre: 'commerce', layers: ['receivables', 'payments', 'fulfilment'] }
  }
  if (/payment-collection|accounts-receivable|ar-collection|finance[.-]payment-request/.test(signal)) {
    return { centre: 'standalone_collection', layers: ['receivables', 'payments'] }
  }
  return { centre: 'unknown', layers: [] }
}

export function enabledBusinessCentres(flags: WorkflowCapabilityFlags, orgKinds: string[] = []): BusinessCentre[] {
  const explicit = readOrgProfile()?.access?.mode !== undefined && readOrgProfile()?.access?.mode !== 'legacy'
  const kinds = explicit ? [] : orgKinds.map(normalizeToken)
  const centres: BusinessCentre[] = !explicit || flags.internalRequisitions ? ['purchases'] : []
  if (flags.fieldExecution || kinds.includes('field')) centres.push('field_jobs')
  if (flags.educationFees || kinds.includes('school')) centres.push('school_fees')
  if (flags.cashCounter || flags.ecommerce || kinds.includes('shop')) centres.push('commerce')
  if (flags.hrOps) centres.push('people')
  if (flags.paymentCollection || flags.arCollections) centres.push('standalone_collection')
  return centres
}

/**
 * Inbox tabs. Shared by the phone inbox and the portal Inbox / Requests pages so both
 * surfaces offer the same tabs for the same organisation. A workflow tab shows when the
 * organisation has that workflow switched on (same flags the Money page uses) or when the
 * inbox already holds an item of that kind. `all` and `archived` are always there.
 */
export type InboxTabKey =
  | 'all'
  | 'requests'
  | 'jobs'
  | 'requisitions'
  | 'people'
  | 'school_fees'
  | 'payments'
  | 'supplier_bills'
  | 'counter_sales'
  | 'receipts'
  | 'archived'

export const INBOX_TAB_ORDER: InboxTabKey[] = [
  'all',
  'requests',
  'jobs',
  'requisitions',
  'people',
  'school_fees',
  'payments',
  'supplier_bills',
  'counter_sales',
  'receipts',
  'archived',
]

export const INBOX_TAB_LABELS: Record<InboxTabKey, string> = {
  all: 'All kinds',
  requests: 'Requests',
  jobs: 'Jobs',
  requisitions: 'Purchase requests',
  people: 'Staff requests',
  school_fees: 'School fees',
  payments: 'Money in',
  supplier_bills: 'Money out',
  counter_sales: 'Counter sales',
  receipts: 'Receipts',
  archived: 'Archived',
}

export function inboxTabConfigured(tab: InboxTabKey, flags: WorkflowCapabilityFlags, orgKinds: string[] = []): boolean {
  const kinds = orgKinds.map((kind) => String(kind || '').toLowerCase())
  switch (tab) {
    case 'all':
    case 'requests':
    case 'archived':
      return true
    case 'jobs':
      return flags.fieldExecution
    case 'requisitions':
      return flags.internalRequisitions
    case 'people':
      // People & payroll module: leave and expense claims. Off unless the organisation switched it on.
      return flags.hrOps
    case 'school_fees':
      return flags.educationFees || kinds.includes('school')
    case 'payments':
      return flags.arCollections || flags.paymentCollection || flags.ecommerce
    case 'supplier_bills':
      return flags.apPayables
    case 'counter_sales':
      return flags.cashCounter || kinds.includes('shop')
    case 'receipts':
      return (
        flags.paymentCollection || flags.arCollections || flags.ecommerce || flags.cashCounter || flags.educationFees
      )
    default:
      return false
  }
}

/** Request types that belong to the Staff requests tab (People & payroll module). */
export function isPeopleRequestType(value: unknown): boolean {
  const type = String(value || '')
    .trim()
    .toLowerCase()
  if (!type) return false
  return /^hr[._]/.test(type) || type === 'finance.expense_claim' || type === 'expense_claim' || type === 'hr_requests'
}

export function visibleInboxTabs(
  input: { flags: WorkflowCapabilityFlags; orgKinds?: string[]; counts: Partial<Record<InboxTabKey, number>> },
  candidates: InboxTabKey[] = INBOX_TAB_ORDER,
): InboxTabKey[] {
  return candidates.filter(
    (tab) => inboxTabConfigured(tab, input.flags, input.orgKinds || []) || (input.counts[tab] ?? 0) > 0,
  )
}

export function findTemplateForCapability(
  templates: WorkflowTemplateLike[],
  capability: WorkflowCapability,
): WorkflowTemplateLike | undefined {
  if (!Array.isArray(templates) || templates.length === 0) return undefined

  const ranked = templates
    .filter(isEnabled)
    .map((template) => {
      const { tokens, sector } = templateSignals(template)
      const tokenScore = Array.from(tokens).some((token) => CAPABILITY_TOKENS[capability].includes(token)) ? 2 : 0
      const sectorScore = matchesCapabilitySector(capability, sector) ? 1 : 0
      const fallbackScore = Array.from(tokens).some((token) => matchesCapabilityToken(capability, token)) ? 1 : 0
      return { template, score: tokenScore + sectorScore + fallbackScore }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)

  return ranked[0]?.template
}

/**
 * My Records sections. Records are filed under the same words as the inbox tabs (Jobs,
 * Purchase requests, Staff requests, Payments, School fees, Counter sales) plus the cards about
 * the person themself (Identity, Staff cards). Both apps call this so a card sits in the same
 * place on the phone and the website. Only sections that hold a card are shown.
 */
export type RecordSectionKey =
  | 'identity'
  | 'staff'
  | 'jobs'
  | 'requisitions'
  | 'people'
  | 'payments'
  | 'school_fees'
  | 'counter_sales'
  | 'other'

export const RECORD_SECTION_ORDER: RecordSectionKey[] = [
  'identity',
  'staff',
  'jobs',
  'requisitions',
  'people',
  'school_fees',
  'payments',
  'counter_sales',
  'other',
]

export const RECORD_SECTION_LABELS: Record<RecordSectionKey, string> = {
  identity: 'Identity',
  staff: 'Staff cards',
  jobs: INBOX_TAB_LABELS.jobs,
  requisitions: INBOX_TAB_LABELS.requisitions,
  people: INBOX_TAB_LABELS.people,
  payments: INBOX_TAB_LABELS.payments,
  school_fees: INBOX_TAB_LABELS.school_fees,
  counter_sales: INBOX_TAB_LABELS.counter_sales,
  other: 'Other',
}

const RECORD_SECTION_BY_TYPE: Record<string, RecordSectionKey> = {
  PlatformIdentityCredential: 'identity',
  PlatformIdentityVC: 'identity',
  IdentityVerificationVC: 'identity',
  KycAttestationVC: 'identity',
  EmployeeCredential: 'staff',
  OrgWorkflowActorCredential: 'staff',
  EmploymentContractVC: 'staff',
  DelegationCredential: 'staff',
  MemberCredential: 'staff',
  JobAssignmentVC: 'jobs',
  RequisitionVC: 'requisitions',
  SiteInspectionVC: 'jobs',
  ExecutionAckVC: 'jobs',
  RequisitionAcknowledgementVC: 'requisitions',
  ApprovalVC: 'requisitions',
  GoodsReceivedVC: 'requisitions',
  DeliveryConfirmationVC: 'requisitions',
  ReleaseAuthorizationVC: 'requisitions',
  LeaveApprovalVC: 'people',
  ExpenseApprovalVC: 'people',
  PayslipVC: 'people',
  PayrollReportVC: 'people',
  ReceiptVC: 'payments',
  PaymentReceipt: 'payments',
  PaymentReceiptVC: 'payments',
  PaymentReceiptCredential: 'payments',
  InvoiceVC: 'payments',
  QuoteVC: 'payments',
  PaymentProofVC: 'payments',
  RemittanceAdviceVC: 'payments',
  EscrowVC: 'payments',
  DeliveryProofVC: 'payments',
  SchoolFeeReceiptVC: 'school_fees',
  SchoolFeeInvoiceVC: 'school_fees',
  CartSnapshotVC: 'counter_sales',
  SaleFulfillmentVC: 'counter_sales',
  CatalogItemVC: 'counter_sales',
}

function recordReference(claims: Record<string, any> | undefined): string {
  const c = claims || {}
  return String(c.poNumber || c.reference || c.requisitionId || c.jobId || c.jobReference || '').trim()
}

function looksLikeJobRecord(claims: Record<string, any> | undefined): boolean {
  const c = claims || {}
  return Boolean(c.jobId || c.requisitionId || c.jobReference || c.workflowRunId || c.siteName || c.site)
}

/** Which Records section a card belongs to, from its type and (for older cards) its claims. */
export function recordSectionOf(credentialType: unknown, claims?: Record<string, any>): RecordSectionKey {
  const type = String(credentialType || '').trim()
  const known = RECORD_SECTION_BY_TYPE[type]
  if (known) return known
  // Older job assignment records were typed as a generic card.
  if (looksLikeJobRecord(claims)) return 'jobs'
  if (type === 'GenericIDCredential') return 'identity'
  if (/leave|expense|payslip|payroll/i.test(type)) return 'people'
  if (/receipt|invoice|payment|quote/i.test(type)) return 'payments'
  if (/employee|employment|member|staff|role/i.test(type)) return 'staff'
  if (/identity|kyc|passport|licen[cs]e/i.test(type)) return 'identity'
  return 'other'
}

/**
 * The title a record card shows, when the type name alone would mislead (a job record typed as a
 * generic card reads "Job assignment record · FR-12", not "Generic ID"). Returns undefined to keep the default.
 */
export function recordCardTitle(credentialType: unknown, claims?: Record<string, any>): string | undefined {
  const type = String(credentialType || '').trim()
  const ref = recordReference(claims)
  const withRef = (label: string) => (ref ? `${label} · ${ref}` : label)
  if (type === 'EmployeeCredential') {
    const orgName = claims?.orgName || claims?.organizationName
    return typeof orgName === 'string' && orgName.trim() ? `Staff card · ${orgName.trim()}` : 'Staff card'
  }
  if (type === 'JobAssignmentVC') return withRef('Job assignment record')
  if (type === 'RequisitionVC')
    return withRef(
      claims?.jobId || claims?.workflowRunId ? 'Legacy assignment record (RequisitionVC)' : 'Requisition record',
    )
  if (type === 'GenericIDCredential' && looksLikeJobRecord(claims)) return withRef('Job assignment record')
  if (type === 'ExecutionAckVC') return withRef('Completion record')
  if (type === 'SiteInspectionVC') return withRef('Site inspection record')
  if (type === 'ReceiptVC' && (claims?.requisitionId || claims?.jobId)) return withRef('Material receipt')
  return undefined
}
