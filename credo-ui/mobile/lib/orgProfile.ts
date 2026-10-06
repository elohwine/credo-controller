/**
 * The short questions an owner answers when an organization is created.
 *
 * Nothing here is a workflow to switch on. The answers are saved on the server
 * (`PUT /api/organizations/{id}/setup/profile`) and the server decides which request
 * types follow. Purchase requests, supplier bills and customer payments always work;
 * every money step uses the people chosen for purchase requests unless one request
 * type names its own. Who goes to site or checks the work is asked on first use.
 *
 * Keep this file identical to `credo-ui/mobile/lib/orgProfile.ts`.
 */

export type OrgKind = 'office' | 'field' | 'school' | 'shop'

export type OrgKindOption = {
  id: OrgKind
  label: string
  detail: string
}

export const ORG_KIND_OPTIONS: OrgKindOption[] = [
  { id: 'office', label: 'Buys things and pays suppliers', detail: 'Purchase requests and supplier bills' },
  { id: 'field', label: 'Sends people out to do jobs', detail: 'Jobs with photos, sign-off and payment' },
  { id: 'school', label: 'Teaches students', detail: 'School fees and receipts' },
  { id: 'shop', label: 'Sells to customers', detail: 'Payments and receipts' },
]

/**
 * Read-only: which request types point back to an answer. Used to pre-select answers
 * for organizations set up before the answers were saved. Mirrors the server mapping.
 */
export const REQUEST_TYPES_BY_KIND: Record<OrgKind, string[]> = {
  office: [],
  field: ['field_execution_fept'],
  school: ['education_fee_payment'],
  shop: ['cash_counter_payment'],
}

export function kindsFromRequestTypes(types: string[]): OrgKind[] {
  const present = new Set(types)
  return (Object.keys(REQUEST_TYPES_BY_KIND) as OrgKind[]).filter((kind) =>
    REQUEST_TYPES_BY_KIND[kind].some((type) => present.has(type)),
  )
}

export type PaymentChoice = 'clicknpay' | 'ecocash' | 'simulated' | 'none'

export const PAYMENT_CHOICES: Array<{ id: PaymentChoice; label: string; detail: string }> = [
  { id: 'clicknpay', label: 'Click n Pay', detail: 'Card payments' },
  { id: 'ecocash', label: 'EcoCash', detail: 'Mobile money' },
  { id: 'simulated', label: 'Practice payments', detail: 'No real money moves. Good for trying things out.' },
  { id: 'none', label: 'Not yet', detail: 'Choose later under Organization → Payments' },
]

export type OrgProfile = {
  kinds: OrgKind[]
  approvalPresetId: string
  approvalTitle: string
  paymentChoice: PaymentChoice
  completedAt: string
}

/** Path under `/api/organizations/{orgTenantId}`. */
export const SETUP_PROFILE_PATH = '/setup/profile'

function cleanKinds(values: unknown): OrgKind[] {
  if (!Array.isArray(values)) return []
  return values.filter((kind): kind is OrgKind => ORG_KIND_OPTIONS.some((option) => option.id === kind))
}

function cleanPayment(value: unknown): PaymentChoice {
  return PAYMENT_CHOICES.some((choice) => choice.id === value) ? (value as PaymentChoice) : 'none'
}

/** Server answers → profile. Null when the questions were never finished. */
export function profileFromServer(data: any): OrgProfile | null {
  if (!data?.answeredAt) return null
  return {
    kinds: cleanKinds(data.kinds),
    approvalPresetId: String(data.approvalPresetId || ''),
    approvalTitle: String(data.approvalTitle || ''),
    paymentChoice: cleanPayment(data.paymentChoice),
    completedAt: String(data.answeredAt),
  }
}

export function profileToServer(profile: OrgProfile) {
  return {
    kinds: profile.kinds,
    approvalPresetId: profile.approvalPresetId || undefined,
    approvalTitle: profile.approvalTitle || undefined,
    paymentChoice: profile.paymentChoice,
  }
}

const ORG_PROFILE_KEY = 'credoOrgProfile'

/** Local copy of the last answers so the page can draw before the server replies. */
export function persistOrgProfile(profile: OrgProfile) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(ORG_PROFILE_KEY, JSON.stringify(profile))
}

export function readOrgProfile(): OrgProfile | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(ORG_PROFILE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed?.kinds)) return null
    return {
      kinds: cleanKinds(parsed.kinds),
      approvalPresetId: String(parsed.approvalPresetId || ''),
      approvalTitle: String(parsed.approvalTitle || ''),
      paymentChoice: cleanPayment(parsed.paymentChoice),
      completedAt: String(parsed.completedAt || ''),
    }
  } catch {
    return null
  }
}

export function clearOrgProfile() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(ORG_PROFILE_KEY)
}

/** Steps that approve, release, record or receipt money. They share the purchase-request people. */
const MONEY_STAGES = new Set([
  'approve_requisition',
  'finance_approve_requisition',
  'release_funds',
  'trigger_payout',
  'record_payment',
  'issue_receipt_vc',
  'present_payment_proof',
  'acknowledge_remittance',
])

export type SetupStepId = 'kinds' | 'money' | 'payments' | 'team'

export type SetupStep = { id: SetupStepId; label: string; done: boolean }

/**
 * The getting-started checklist, in order. Each step opens on its own screen.
 * `items` are setup readiness items (`GET .../setup/readiness`).
 */
export function setupChecklist(input: {
  profile: OrgProfile | null
  items: Array<{ key: string; status: string; stageAction?: string }>
  memberCount: number
}): SetupStep[] {
  const needs = (item: { status: string }) => item.status === 'needs_attention'
  const moneyMissing = input.items.some(
    (item) =>
      item.key.startsWith('stage_actor:') &&
      needs(item) &&
      MONEY_STAGES.has(String(item.stageAction || item.key.slice('stage_actor:'.length))),
  )
  const paymentMissing = input.items.some((item) => item.key === 'payment_provider' && needs(item))
  return [
    { id: 'kinds', label: 'Say what you do', done: Boolean(input.profile) },
    { id: 'money', label: 'Choose who handles money', done: !moneyMissing },
    { id: 'payments', label: 'Pick how you take payments', done: !paymentMissing },
    { id: 'team', label: 'Invite your team', done: input.memberCount > 1 },
  ]
}

export function describeOrgProfile(profile: OrgProfile): string[] {
  const lines: string[] = []
  const kinds = profile.kinds
    .map((kind) => ORG_KIND_OPTIONS.find((option) => option.id === kind)?.label)
    .filter(Boolean) as string[]
  if (kinds.length > 0) lines.push(kinds.join(' · '))
  if (profile.approvalTitle) lines.push(`Money: ${profile.approvalTitle}`)
  const payment = PAYMENT_CHOICES.find((choice) => choice.id === profile.paymentChoice)
  if (payment && payment.id !== 'none') lines.push(`Payments: ${payment.label}`)
  return lines
}
