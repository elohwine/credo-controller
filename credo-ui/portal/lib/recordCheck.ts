/**
 * "Check a record", in plain words. One copy on the website (`credo-ui/portal/lib`) and one on
 * the phone (`credo-ui/mobile/lib`); keep them identical.
 *
 * The server answers `GET /api/verify/:reference` from the issued-card register. This file turns
 * that answer into the title, the line under it, and the rows a person reads — on the public
 * check page, on Home, and inside a record's own details. No raw ids or stage codes reach the
 * screen.
 */

export type RecordCheckStatus = 'valid' | 'invalid' | 'revoked' | 'expired' | 'not_found'

/** The part of the server's answer this file renders. */
export interface RecordCheck {
  status: RecordCheckStatus
  vcType?: string
  /** Why the organisation ended it, when status is revoked. */
  reason?: string
  /** The organisation that issued it, in words. */
  issuerName?: string
  issuanceDate?: string
  expirationDate?: string
  /** What the record says. */
  subject?: Record<string, unknown>
}

export interface RecordCheckWords {
  title: string
  detail: string
  color: string
}

const STATUS_WORDS: Record<RecordCheckStatus, RecordCheckWords> = {
  valid: { title: 'Still valid', detail: 'This record was issued here and it is still good.', color: 'teal' },
  revoked: {
    title: 'No longer valid',
    detail: 'The organisation that issued this record has withdrawn it.',
    color: 'red',
  },
  expired: { title: 'Expired', detail: 'This record is past its end date.', color: 'orange' },
  invalid: { title: 'Not valid', detail: 'This record could not be confirmed.', color: 'red' },
  not_found: { title: 'Not found', detail: 'No record issued here matches that reference.', color: 'yellow' },
}

/** The heading and the line under it for a check result. */
export function recordCheckWords(status: RecordCheckStatus | string | undefined): RecordCheckWords {
  return STATUS_WORDS[(status || '') as RecordCheckStatus] || STATUS_WORDS.invalid
}

/** Cards the team list already names in plain words. */
const CARD_LABELS: Record<string, string> = {
  EmployeeCredential: 'Staff card',
  OrgWorkflowActorCredential: 'Role card (older)',
  PlatformIdentityCredential: 'Identity card',
  GenericIDCredential: 'Job card',
  LeaveApprovalVC: 'Leave approved',
  ExpenseApprovalVC: 'Expense approved',
  PaymentReceiptVC: 'Payment receipt',
  ReceiptVC: 'Receipt',
}

/** The record's kind in words ("Leave approved"), from its type. */
export function recordKindLabel(vcType: string | undefined): string {
  const type = String(vcType || '').trim()
  if (!type || type === 'Unknown' || type === 'VerifiableCredential') return ''
  if (CARD_LABELS[type]) return CARD_LABELS[type]
  return type
    .replace(/VC$/, '')
    .replace(/Credential$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
}

/** What the staff card's organisation access claim lets the holder do. */
export const ORG_ACCESS_WORDS: Record<string, string> = {
  manage: 'Opens the organisation and its dashboard',
  tasks: 'Tasks from the personal inbox',
}

/** Plain labels for the claims a person sees when they open a record. */
export const CLAIM_LABELS: Record<string, string> = {
  orgName: 'Organisation',
  merchantName: 'Shop',
  schoolName: 'School',
  memberRole: 'Role',
  role: 'Role',
  department: 'Department',
  employmentStatus: 'Status',
  orgAccess: 'Organisation access',
  receiptRef: 'Receipt number',
  merchant: 'Paid at',
  stageActions: 'You confirm',
  displayName: 'Name',
  username: 'Name',
  name: 'Name',
  phone: 'Phone',
  email: 'Email',
  amount: 'Amount',
  currency: 'Currency',
  totalAmount: 'Total',
  paymentDate: 'Paid on',
  issuedAt: 'Issued',
  leaveType: 'Kind of leave',
  startDate: 'From',
  endDate: 'Until',
  daysCount: 'Days',
  cover: 'Cover',
  note: 'Reason',
  employeeName: 'Name',
  approvedBy: 'Approved by',
  approvedAt: 'Approved',
  category: 'Category',
  description: 'What it was for',
  registeredAt: 'Registered',
  platformName: 'Platform',
}

/** Internal fields a person never needs to read. */
export const HIDDEN_CLAIMS =
  /^(id|claims|fingerprint|source|offerId|expiresAt|reason|.*TenantId|.*Id|.*Hash|.*Did|did)$/i

/** Same words the team list uses for each step (mirrors the server's describeStageForPeople). */
const STEP_LABELS: Record<string, string> = {
  assign_field_worker: 'doing the job',
  inspect_site: 'checking the site',
  review_completion: 'reviewing finished work',
  resolve_safety_hold: 'sorting out safety holds',
  acknowledge_execution: 'signing off',
  trigger_payout: 'releasing payment',
  approve_requisition: 'approving requests',
  finance_approve_requisition: 'approving requests for finance',
  release_funds: 'releasing funds',
  record_payment: 'recording payments',
  acknowledge_remittance: 'confirming payments received',
  issue_receipt_vc: 'issuing receipts',
  issue_receipt: 'issuing receipts',
}

/** One step in plain words ("signing off"); used by the card rows and the share review. */
export function plainStep(step: string): string {
  const key = step.trim().toLowerCase()
  return (
    STEP_LABELS[key] ||
    key
      .replace(/_(vc|credential|did)$/i, '')
      .replace(/_/g, ' ')
      .trim()
  )
}

function formatWhen(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * The record's details as label/value rows, without identifiers, hashes or codes. The same rows
 * the wallet shows when a person opens a record, so a check and the record itself read alike.
 */
export function credentialClaimRows(
  subject: Record<string, any> | undefined | null,
): Array<{ label: string; value: string }> {
  if (!subject || typeof subject !== 'object') return []
  const nested = subject.claims && typeof subject.claims === 'object' ? subject.claims : {}
  const flat: Record<string, any> = { ...subject, ...nested }
  const rows: Array<{ label: string; value: string }> = []
  const seen = new Set<string>()
  for (const [key, raw] of Object.entries(flat)) {
    if (HIDDEN_CLAIMS.test(key)) continue
    const label = CLAIM_LABELS[key] || key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())
    if (seen.has(label)) continue
    let value = ''
    if (Array.isArray(raw))
      value = raw
        .map((item) => plainStep(String(item)))
        .filter(Boolean)
        .join(', ')
    else if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(raw)) value = formatWhen(raw)
    else if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') value = String(raw)
    if (!value.trim() || value.startsWith('did:')) continue
    seen.add(label)
    rows.push({
      label,
      value:
        key === 'memberRole' || key === 'role'
          ? value.replace(/_/g, ' ')
          : key === 'orgAccess'
            ? ORG_ACCESS_WORDS[value] || value
            : value,
    })
  }
  return rows
}
