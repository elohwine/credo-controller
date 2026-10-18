/**
 * Request choices and status words shared by the phone and website.
 *
 * A request kind is one thing a person can ask for from Home. Kinds fall into groups:
 *  - my_orgs:     asks to an organisation the person belongs to (time off, an expense, a payout)
 *  - my_records:  "send it to me again" for records the person already earned
 *  - businesses:  asks to other organisations (a quote, a bill, a service) found in Discover
 *  - org_ops:     things the organisation itself starts, only shown in organisation context
 *
 * The server says what applies (`GET /api/platform/requests/options`); this file turns that into
 * the rows the sheet shows for the current context. No raw ids or stage codes reach the screen.
 */

export type RequestGroup = 'my_orgs' | 'my_records' | 'businesses' | 'org_ops'

export type RequestKindIcon =
  | 'calendar'
  | 'receipt'
  | 'cash'
  | 'message'
  | 'id'
  | 'file'
  | 'briefcase'
  | 'search'
  | 'cart'
  | 'tool'
  | 'coins'

/** Screens the sheet can open instead of showing a form. Each app maps these to its own paths. */
export type RequestRouteKey = 'discover' | 'purchase_request' | 'new_job' | 'collect_payment' | 'my_requests'

export interface RequestKind {
  /** Stable key: the request type for forms, or a `record.*` / `business.*` / `org.*` key. */
  id: string
  group: RequestGroup
  label: string
  line: string
  icon: RequestKindIcon
  /** Opens a screen rather than a form. */
  routeKey?: RequestRouteKey
  /** The organisation this row is about, when the row is per organisation. */
  orgTenantId?: string
  orgName?: string
  /** For the payout nudge: the job it is about. */
  payoutJob?: RequestOptionsPayoutJob
  /** For "send it to me again": which record. */
  recordItem?: 'staff_card' | 'receipts' | 'payslips'
  /** Already asked; the row shows as waiting instead of opening a form. */
  disabledLine?: string
}

/** Mirror of the server's `RequestOptions`. */
export interface RequestOptionsMembership {
  orgTenantId: string
  orgName: string
  role: string
  kinds: string[]
}
export interface RequestOptionsPayoutJob {
  workflowRunId: string
  orgTenantId: string
  orgName: string
  reference: string
  amount?: number
  currency?: string
  alreadyAsked: boolean
}
export interface RequestOptionsRecord {
  item: 'staff_card' | 'receipts' | 'payslips'
  orgTenantId?: string
  orgName?: string
}
export interface RequestOptions {
  memberships: RequestOptionsMembership[]
  payoutJobs: RequestOptionsPayoutJob[]
  records: RequestOptionsRecord[]
}

export interface RequestContext {
  contextMode: 'personal' | 'org'
  activeOrgTenantId?: string
  activeOrgName?: string
  activeWorkflowTypes?: string[]
  orgRole?: string
}

export const REQUEST_GROUP_WORDS: Record<RequestGroup, { title: string; line: string }> = {
  my_orgs: { title: 'Ask my organisation', line: 'Time off, an expense, a payout. Goes to the person who decides.' },
  my_records: { title: 'Send me a record again', line: 'New phone or lost a card? Ask for it again.' },
  businesses: {
    title: 'Ask another organisation',
    line: 'A quote, a bill, or a service from a business you deal with.',
  },
  org_ops: {
    title: 'Start work for the organisation',
    line: 'Things the organisation starts: purchases, jobs, collections.',
  },
}

/** Request types a member can raise, in the order the sheet shows them. */
const MEMBER_KIND_WORDS: Record<string, { label: string; line: string; icon: RequestKindIcon }> = {
  'procurement.requisition': {
    label: 'Request an item',
    line: 'Ask for an item or purchase for work. Goes for approval.',
    icon: 'cart',
  },
  'hr.leave': { label: 'Time off', line: 'Ask for leave. Your manager decides.', icon: 'calendar' },
  'finance.expense_claim': {
    label: 'Expense claim',
    line: 'Money you spent for work. Add the receipt.',
    icon: 'receipt',
  },
  'finance.payout_request': {
    label: 'Ask for my payout',
    line: 'A finished job is waiting for its payment.',
    icon: 'cash',
  },
  'platform.general': { label: 'Something else', line: 'Any other request to your organisation.', icon: 'message' },
}

const RECORD_WORDS: Record<RequestOptionsRecord['item'], { label: string; line: string; icon: RequestKindIcon }> = {
  staff_card: { label: 'Staff card', line: 'Your card for this organisation, sent to this phone.', icon: 'id' },
  receipts: { label: 'Payment receipts', line: 'Receipts for payments you made through the app.', icon: 'receipt' },
  payslips: { label: 'Payslips', line: 'Your payroll person sends them again.', icon: 'file' },
}

export const BUSINESS_KINDS: RequestKind[] = [
  {
    id: 'business.quote',
    group: 'businesses',
    label: 'Ask for a quote',
    line: 'Tell a business what you need and get a price.',
    icon: 'search',
    routeKey: 'discover',
  },
  {
    id: 'business.invoice',
    group: 'businesses',
    label: 'Ask for a bill',
    line: 'Get a bill you can pay from the app.',
    icon: 'file',
    routeKey: 'discover',
  },
  {
    id: 'business.service',
    group: 'businesses',
    label: 'Book a service',
    line: 'Request a service a business offers.',
    icon: 'briefcase',
    routeKey: 'discover',
  },
]

const ORG_OPS_KINDS: Array<RequestKind & { workflowTypes: string[] }> = [
  {
    id: 'org.purchase_request',
    group: 'org_ops',
    label: 'Purchase request',
    line: 'Buy something for the organisation. Goes for approval.',
    icon: 'cart',
    routeKey: 'purchase_request',
    workflowTypes: ['requisition'],
  },
  {
    id: 'org.new_job',
    group: 'org_ops',
    label: 'New field job',
    line: 'Send someone out to do a job.',
    icon: 'tool',
    routeKey: 'new_job',
    workflowTypes: ['field', 'fept'],
  },
  {
    id: 'org.collect_payment',
    group: 'org_ops',
    label: 'Collect a payment',
    line: 'Send a bill or a payment link to a client.',
    icon: 'coins',
    routeKey: 'collect_payment',
    workflowTypes: ['receivable', 'collection', 'collect_payment', 'cash_counter', 'fee_payment'],
  },
]

/** Leave kinds a person can pick. The key is stored; the label is shown. */
export const LEAVE_TYPES: Array<{ value: string; label: string }> = [
  { value: 'annual', label: 'Annual leave' },
  { value: 'sick', label: 'Sick leave' },
  { value: 'family', label: 'Family or compassionate' },
  { value: 'study', label: 'Study leave' },
  { value: 'unpaid', label: 'Unpaid leave' },
]

export const EXPENSE_CATEGORIES: Array<{ value: string; label: string }> = [
  { value: 'travel', label: 'Travel and transport' },
  { value: 'meals', label: 'Meals' },
  { value: 'materials', label: 'Materials and tools' },
  { value: 'airtime', label: 'Airtime and data' },
  { value: 'other', label: 'Other' },
]

function normalize(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
}

/**
 * The rows to show, in group order, for this person in this context.
 *
 * Personal context: everything the person may ask for across all their organisations, plus
 * records and businesses. Organisation context: only the work the organisation itself starts;
 * personal kinds belong to the person, not the operator, and stay under the personal account.
 * Options may be null while loading: businesses still show.
 */
export function requestKindsFor(options: RequestOptions | null | undefined, context: RequestContext): RequestKind[] {
  const rows: RequestKind[] = []
  if (context.contextMode === 'org') {
    const active = new Set((context.activeWorkflowTypes || []).map(normalize))
    for (const kind of ORG_OPS_KINDS) {
      // Active workflow lists carry canonical types or template ids (tpl-fept-field-execution),
      // so match on the family fragment, the way the inbox tabs do.
      const activeList = Array.from(active)
      if (!kind.workflowTypes.some((type) => activeList.some((entry) => entry.includes(type)))) continue
      const { workflowTypes: _ignored, ...row } = kind
      rows.push(row)
    }
    return rows
  }
  const memberships = options?.memberships || []
  const manyOrgs = memberships.length > 1

  for (const membership of memberships) {
    for (const kind of membership.kinds) {
      const words = MEMBER_KIND_WORDS[kind]
      if (!words) continue
      if (kind === 'finance.payout_request') {
        for (const job of (options?.payoutJobs || []).filter(
          (candidate) => candidate.orgTenantId === membership.orgTenantId,
        )) {
          const money = job.amount ? ` · ${job.currency || ''} ${job.amount}`.replace(/\s+/g, ' ') : ''
          rows.push({
            id: kind,
            group: 'my_orgs',
            label: `${words.label} · Job ${job.reference}`,
            line: job.alreadyAsked ? 'You asked already. The payout person has your request.' : `${words.line}${money}`,
            icon: words.icon,
            orgTenantId: membership.orgTenantId,
            orgName: membership.orgName,
            payoutJob: job,
            disabledLine: job.alreadyAsked ? 'Waiting' : undefined,
          })
        }
        continue
      }
      rows.push({
        id: kind,
        group: 'my_orgs',
        label: manyOrgs ? `${words.label} · ${membership.orgName}` : words.label,
        line: words.line,
        icon: words.icon,
        orgTenantId: membership.orgTenantId,
        orgName: membership.orgName,
      })
    }
  }

  for (const record of options?.records || []) {
    const words = RECORD_WORDS[record.item]
    if (!words) continue
    rows.push({
      id: `record.${record.item}`,
      group: 'my_records',
      label: record.orgName && manyOrgs ? `${words.label} · ${record.orgName}` : words.label,
      line: words.line,
      icon: words.icon,
      orgTenantId: record.orgTenantId,
      orgName: record.orgName,
      recordItem: record.item,
    })
  }

  rows.push(...BUSINESS_KINDS)

  return rows
}

/** Groups present in a row list, in display order. */
export function requestGroupsIn(rows: RequestKind[]): RequestGroup[] {
  const order: RequestGroup[] = ['my_orgs', 'my_records', 'businesses', 'org_ops']
  return order.filter((group) => rows.some((row) => row.group === group))
}

/** Plain name for a request type, as both apps print it in lists and history. */
export function requestKindLabel(requestType: unknown): string {
  const key = normalize(requestType)
  const known: Record<string, string> = {
    'procurement.requisition': 'Purchase request',
    requisition: 'Purchase request',
    'finance.purchase_order': 'Purchase order',
    'finance.payment_request': 'Payment request',
    'hr.onboarding': 'New staff member',
    'hr.offboarding': 'Staff member leaving',
    'hr.delegation_request': 'Stand-in request',
    'field.site_access': 'Site access',
    'field.inspection': 'Site check',
    'field.maintenance': 'Maintenance job',
    quote: 'Quote',
    invoice: 'Bill',
    service: 'Service request',
    vc_issuance: 'Record request',
    payment_link: 'Payment link',
  }
  if (known[key]) return known[key]
  if (MEMBER_KIND_WORDS[key]) return MEMBER_KIND_WORDS[key].label
  return (
    key
      .replace(/^[a-z]+\./, '')
      .replace(/[._]/g, ' ')
      .replace(/^\w/, (letter) => letter.toUpperCase()) || 'Request'
  )
}

/** One line under a request in a list: what it is about, from its stored details. */
export function requestKindLine(requestType: unknown, context?: Record<string, unknown> | null): string {
  const key = normalize(requestType)
  const details = context || {}
  if (key === 'hr.leave') {
    const type = LEAVE_TYPES.find((entry) => entry.value === details.leaveType)?.label || 'Leave'
    const span = details.startDate && details.endDate ? `${details.startDate} to ${details.endDate}` : ''
    const days = details.days ? `${details.days} day${Number(details.days) === 1 ? '' : 's'}` : ''
    return [type, span, days].filter(Boolean).join(' · ')
  }
  if (key === 'finance.expense_claim') {
    const category = EXPENSE_CATEGORIES.find((entry) => entry.value === details.categoryCode)?.label
    return category || 'Expense claim'
  }
  if (key === 'finance.payout_request') {
    return details.jobReference ? `Job ${details.jobReference}` : 'Finished job waiting for its payment'
  }
  if (key === 'platform.general') {
    return String(details.purposeCode || '') === 'resend_record' ? 'Asked for a record to be sent again' : ''
  }
  return ''
}

/** Status words and colour for a request a person raised, as both apps show them. */
export function requestStatusWords(status: unknown): { label: string; color: string } {
  switch (normalize(status)) {
    case 'draft':
      return { label: 'Not sent yet', color: 'gray' }
    case 'submitted':
    case 'pending':
      return { label: 'Sent · waiting', color: 'blue' }
    case 'in_review':
    case 'under_review':
      return { label: 'Being looked at', color: 'blue' }
    case 'approved':
      return { label: 'Approved', color: 'green' }
    case 'in_fulfilment':
      return { label: 'Being done', color: 'teal' }
    case 'completed':
    case 'issued':
    case 'fulfilled':
      return { label: 'Done', color: 'green' }
    case 'rejected':
      return { label: 'Declined', color: 'red' }
    case 'cancelled':
      return { label: 'Cancelled', color: 'gray' }
    case 'expired':
      return { label: 'Expired', color: 'gray' }
    case 'failed':
      return { label: 'Did not go through', color: 'red' }
    default:
      return { label: 'Sent', color: 'blue' }
  }
}

/**
 * Kinds that are finished the moment someone says yes (server: PlatformRequestService.DONE_WHEN_APPROVED).
 * Other kinds still have work after approval (pay back, deliver), so "approved" is still waiting.
 */
const DONE_WHEN_APPROVED = new Set(['hr.leave', 'platform.general', 'finance.payout_request'])

export type RequestListBucket = 'waiting' | 'done' | 'closed'

/** Which "My requests" section a row belongs to; identical on phone and website. */
export function requestListBucket(kind: unknown, status: unknown): RequestListBucket {
  const s = normalize(status)
  if (s === 'completed' || s === 'issued' || s === 'fulfilled') return 'done'
  if (s === 'approved') return DONE_WHEN_APPROVED.has(normalize(kind)) ? 'done' : 'waiting'
  if (
    s === 'draft' ||
    s === 'submitted' ||
    s === 'pending' ||
    s === 'in_review' ||
    s === 'under_review' ||
    s === 'in_fulfilment'
  )
    return 'waiting'
  return 'closed'
}

/** What to tell the person after "send it to me again". */
export function resendStatusWords(
  status: unknown,
  item: RequestOptionsRecord['item'],
  count?: number,
): { title: string; message: string; color: string } {
  const words = RECORD_WORDS[item] || { label: 'Record' }
  switch (normalize(status)) {
    case 'queued':
      return {
        title: 'On its way',
        message:
          count && count > 1
            ? `${count} records are coming to your inbox. Accept each one.`
            : `${words.label} is coming to your inbox. Accept it there.`,
        color: 'green',
      }
    case 'nothing_to_send':
      return { title: 'Nothing to send', message: `We found no ${words.label.toLowerCase()} for you.`, color: 'gray' }
    case 'ask_org':
      return {
        title: 'Ask the organisation',
        message: `${words.label}: the organisation sends this from its side. Send them a request from here.`,
        color: 'blue',
      }
    default:
      return { title: 'Sent', message: 'Your request was sent.', color: 'blue' }
  }
}
