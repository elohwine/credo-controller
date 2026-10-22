/**
 * Your own activity: who has your data, what you shared, for what.
 *
 * Reads rows from GET /api/wallet/activity (one row per event, written once) and turns them
 * into plain sentences for the Home strip, the Activity page and the CSV export. The same
 * words on the phone and the website.
 *
 * Keep this file identical in credo-ui/mobile/lib/holderActivity.ts and
 * credo-ui/portal/lib/holderActivity.ts.
 *
 * Nothing here shows a claim value, a DID or a stage code: the server keeps names only, and
 * step keys are turned into words by the caller's `labelStep` (stepRequiredLabel on both apps).
 */

export type HolderActivityKind =
  | 'shared'
  | 'share_verified'
  | 'share_refused'
  | 'share_declined'
  | 'card_received'
  | 'card_withdrawn'

export type HolderActivityOutcome =
  | 'shared'
  | 'verified'
  | 'refused'
  | 'declined'
  | 'received'
  | 'replaced'
  | 'withdrawn'

export interface HolderActivityEntry {
  id: string
  kind: HolderActivityKind
  orgTenantId?: string
  orgName?: string
  purposeLabel?: string
  stageAction?: string
  workflowRunId?: string
  requestId?: string
  reference?: string
  requestedTypes: string[]
  requestedClaims: string[]
  sharedClaims: string[]
  withheldClaims: string[]
  signedLine?: string
  outcome: HolderActivityOutcome
  reason?: string
  occurredAt: string
}

export interface HolderActivityPartner {
  orgTenantId: string
  orgName: string
  cards: Array<{ type: string; stageActions: string[]; role?: string; receivedAt: string; withdrawn: boolean }>
  shareCount: number
  lastSharedAt?: string
  lastActivityAt: string
  member: boolean
}

export type HolderActivityFilter = 'all' | 'shares' | 'cards' | 'declined'

export const HOLDER_ACTIVITY_FILTERS: Array<{ value: HolderActivityFilter; label: string }> = [
  { value: 'all', label: 'Everything' },
  { value: 'shares', label: 'Shares' },
  { value: 'cards', label: 'Cards' },
  { value: 'declined', label: 'Turned down' },
]

/** Server `kind` values behind each filter chip; empty means no filter. */
export function holderActivityKindsFor(filter: HolderActivityFilter): HolderActivityKind[] {
  if (filter === 'shares') return ['shared', 'share_verified', 'share_refused']
  if (filter === 'cards') return ['card_received', 'card_withdrawn']
  if (filter === 'declined') return ['share_declined']
  return []
}

/** Plain name of a card type: "Staff card", "Job assignment record", "Identity card", "Leave record". */
export function holderCardName(type: string | undefined): string {
  const key = String(type || '').trim()
  const named: Record<string, string> = {
    EmployeeCredential: 'Staff card',
    OrgWorkflowActorCredential: 'Role card',
    PlatformIdentityCredential: 'Identity card',
    JobAssignmentVC: 'Job assignment record',
    RequisitionVC: 'Requisition record',
    RequisitionAcknowledgementVC: 'Completion record',
    SiteInspectionVC: 'Site inspection record',
    ExecutionAckVC: 'Completion record',
    DeliveryProofVC: 'Material receipt',
    PaymentReceiptVC: 'Payment receipt',
    QuoteVC: 'Quote',
    LeaveApprovalVC: 'Leave record',
    ExpenseApprovalVC: 'Expense claim record',
    PayslipVC: 'Payslip',
    WorkflowRequestApproval: 'Approval card',
    RequisitionStageAction: 'Step card',
  }
  if (named[key]) return named[key]
  // Organisation-defined records (`CourseCertificateRecord`) are named by their label.
  if (/^[A-Z][A-Za-z0-9]*[a-z0-9]Record$/.test(key)) {
    const label = key
      .replace(/Record$/, '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([a-z])([0-9])/, '$1 $2')
      .trim()
    if (label) return `${label.charAt(0)}${label.slice(1).toLowerCase()}`
  }
  const words = key
    .replace(/(VC|Credential)$/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
  return words ? `${words.charAt(0).toUpperCase()}${words.slice(1).toLowerCase()} card` : 'Card'
}

/** "a staff card", "an identity card". */
function withArticle(name: string): string {
  const lower = name.charAt(0).toLowerCase() + name.slice(1)
  return `${/^[aeiou]/i.test(lower) ? 'an' : 'a'} ${lower}`
}

/** The card types on a row as one phrase: "your staff card", "your Job card and Staff card". */
function cardPhrase(types: string[]): string {
  const names = Array.from(new Set(types.map(holderCardName)))
  if (names.length === 0) return 'card'
  if (names.length === 1) return names[0].charAt(0).toLowerCase() + names[0].slice(1)
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`.toLowerCase()
}

/** Plain words for a claim name on a staff or job card. */
export function holderClaimLabel(name: string): string {
  const named: Record<string, string> = {
    orgTenantId: 'Organisation',
    orgName: 'Organisation name',
    role: 'Your role',
    memberRole: 'Your role',
    employmentStatus: 'Employment status',
    orgAccess: 'Organisation access',
    stageActions: 'Steps on your card',
    workflowType: 'Kind of work',
    userId: 'You, as named on the job',
    fullName: 'Your name',
    name: 'Your name',
    phone: 'Phone number',
    email: 'Email',
    startDate: 'Start date',
    issuedAt: 'Date issued',
    assignedAt: 'Date assigned',
    assignmentMode: 'How you were assigned',
    platformName: 'Platform',
    fingerprint: 'Card fingerprint',
    poNumber: 'Job reference',
    reference: 'Reference',
    amount: 'Amount',
    currency: 'Currency',
    description: 'Description',
    status: 'Status',
    scope: 'Scope',
  }
  if (named[name]) return named[name]
  const words = String(name || '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1).toLowerCase() : ''
}

export function holderClaimLabels(names: string[]): string[] {
  return Array.from(new Set(names.map(holderClaimLabel).filter(Boolean)))
}

export interface HolderActivityCopy {
  /** Step key → words, e.g. `trigger_payout` → "Release worker payout". */
  labelStep: (stageAction: string) => string | undefined
}

/** What the step was for: the signed line when we have it, else the step words and the job. */
export function holderActivityPurpose(entry: HolderActivityEntry, copy: HolderActivityCopy): string {
  const signed = String(entry.signedLine || entry.purposeLabel || '').trim()
  if (signed) return signed
  const step = entry.stageAction ? copy.labelStep(entry.stageAction) : undefined
  const job = entry.reference && !/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(entry.reference) ? `Job ${entry.reference}` : ''
  return [step, job].filter(Boolean).join(' · ')
}

export interface HolderActivityLine {
  title: string
  summary: string
  /** Mantine colour for the dot / badge. */
  color: 'green' | 'blue' | 'red' | 'gray' | 'orange' | 'violet'
  outcomeLabel: string
}

/** One row → the sentence a person reads. */
export function describeHolderActivity(entry: HolderActivityEntry, copy: HolderActivityCopy): HolderActivityLine {
  const org = entry.orgName || 'An organisation'
  const purpose = holderActivityPurpose(entry, copy)
  const cards = cardPhrase(entry.requestedTypes)
  switch (entry.kind) {
    case 'shared':
      return {
        title: `You shared your ${cards} with ${org}`,
        summary: purpose ? `For: ${purpose}` : 'For a step at this organisation',
        color: 'blue',
        outcomeLabel: 'Shared',
      }
    case 'share_verified':
      return {
        title: `${org} checked your ${cards}`,
        summary: purpose ? `Accepted for: ${purpose}` : 'Accepted',
        color: 'green',
        outcomeLabel: 'Accepted',
      }
    case 'share_refused':
      return {
        title: `${org} did not accept your ${cards}`,
        summary: entry.reason || (purpose ? `For: ${purpose}` : 'The card did not fit this step'),
        color: 'red',
        outcomeLabel: 'Not accepted',
      }
    case 'share_declined':
      return {
        title: `You turned down a request from ${org}`,
        summary: purpose ? `Asked for: ${purpose}. Nothing left your phone.` : 'Nothing left your phone.',
        color: 'gray',
        outcomeLabel: 'Turned down',
      }
    case 'card_received': {
      const name = holderCardName(entry.requestedTypes[0])
      const replaced = entry.outcome === 'replaced'
      return {
        title: `${org} gave you ${withArticle(name)}${replaced ? ' (replaces your earlier one)' : ''}`,
        summary:
          entry.reason ||
          (entry.reference ? `Job ${entry.reference}` : '') ||
          (entry.requestedClaims.length
            ? `It says: ${holderClaimLabels(entry.requestedClaims).join(', ').toLowerCase()}`
            : 'Saved to your records'),
        color: replaced ? 'orange' : 'violet',
        outcomeLabel: replaced ? 'Replaced' : 'Received',
      }
    }
    case 'card_withdrawn':
      return {
        title: `${org} withdrew your ${holderCardName(entry.requestedTypes[0]).toLowerCase()}`,
        summary: entry.reason ? `Why: ${entry.reason}` : 'It no longer works for their steps',
        color: 'red',
        outcomeLabel: 'Withdrawn',
      }
    default:
      return {
        title: `${org}: ${String(entry.kind).replace(/_/g, ' ')}`,
        summary: purpose,
        color: 'gray',
        outcomeLabel: entry.outcome,
      }
  }
}

/** "Your card lets SGK Trial check you for: sign off, release payout". */
export function partnerScopeLine(partner: HolderActivityPartner, copy: HolderActivityCopy): string {
  const live = partner.cards.filter((card) => !card.withdrawn)
  const steps = Array.from(new Set(live.flatMap((card) => card.stageActions)))
    .map((step) => copy.labelStep(step) || '')
    .filter(Boolean)
  if (steps.length === 0) {
    return live.length > 0
      ? `${partner.orgName} holds your ${cardPhrase(live.map((card) => card.type))}.`
      : `${partner.orgName} no longer holds a working card of yours.`
  }
  return `Your card lets ${partner.orgName} check you for: ${steps.map((step) => step.toLowerCase()).join(', ')}.`
}

/** One line of what happened with this organisation: cards, shares, membership. */
export function partnerSummaryLine(partner: HolderActivityPartner): string {
  const live = partner.cards.filter((card) => !card.withdrawn).length
  const parts: string[] = []
  parts.push(
    live === 0 ? (partner.cards.length > 0 ? 'no working card' : 'no card') : live === 1 ? '1 card' : `${live} cards`,
  )
  parts.push(
    partner.shareCount === 0 ? 'no shares' : partner.shareCount === 1 ? '1 share' : `${partner.shareCount} shares`,
  )
  parts.push(partner.member ? 'you are a member' : 'not a member')
  return parts.join(' · ')
}

/** Columns for the CSV a person downloads. Matches the server export. */
export const HOLDER_ACTIVITY_CSV_COLUMNS = [
  'Date and time',
  'What happened',
  'Organisation',
  'Step',
  'Job or request',
  'Cards asked for',
  'Details asked for',
  'Details shared',
  'Details kept on your phone',
  'Signed line',
  'Outcome',
  'Reason',
  'Reference',
] as const

export function holderActivityCsvRow(entry: HolderActivityEntry, copy: HolderActivityCopy): string[] {
  const line = describeHolderActivity(entry, copy)
  return [
    entry.occurredAt,
    line.title,
    entry.orgName || '',
    entry.stageAction ? copy.labelStep(entry.stageAction) || entry.stageAction : '',
    entry.reference || entry.workflowRunId || '',
    entry.requestedTypes.map(holderCardName).join('; '),
    holderClaimLabels(entry.requestedClaims).join('; '),
    holderClaimLabels(entry.sharedClaims).join('; '),
    holderClaimLabels(entry.withheldClaims).join('; '),
    entry.signedLine || '',
    line.outcomeLabel,
    entry.reason || '',
    entry.requestId || '',
  ]
}

function csvCell(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

export function holderActivityCsv(entries: HolderActivityEntry[], copy: HolderActivityCopy): string {
  return [[...HOLDER_ACTIVITY_CSV_COLUMNS], ...entries.map((entry) => holderActivityCsvRow(entry, copy))]
    .map((cells) => cells.map(csvCell).join(','))
    .join('\n')
}
