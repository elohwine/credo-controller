import {
  ORG_MODULE_CATALOGUE,
  suggestOrgSetup,
  suggestedOrgModules,
  type OrgModule,
  type OrgOperatingModel,
  type OrgConfigurationAccess,
} from '../../src/config/orgModules'
export type { OrgModule, OrgOperatingModel, OrgConfigurationAccess } from '../../src/config/orgModules'
export { suggestedOrgModules, suggestOrgSetup } from '../../src/config/orgModules'
export { DEFAULT_DEPARTMENT_NAME, cleanDepartmentNames, suggestedDepartmentsFor } from '../../src/config/orgStructure'

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

/** What the organisation does. Shop and school turn on the store and school-fee invoices. Jobs and supplier payments stay either way. */
export const ORG_KIND_OPTIONS: OrgKindOption[] = [
  { id: 'office', label: 'Buys things and pays suppliers', detail: 'Purchase requests and supplier bills' },
  { id: 'field', label: 'Sends people out to do jobs', detail: 'Jobs with photos, sign-off and payment' },
  { id: 'school', label: 'Collects school fees', detail: 'Fee invoices for students and parents' },
  {
    id: 'shop',
    label: 'Sells from a shop or advertises what it delivers',
    detail: 'Counter sales, a catalog, and a public store',
  },
]

/**
 * Modules an organisation switches on by its own question. People & payroll is not assumed:
 * not every organisation manages staff here, and it is part of the paid plan once plans are
 * charged. Mirrors `OrgModule` on the server (`OrgSetupProfileService`).
 */
export type OrgModuleOption = {
  id: OrgModule
  label: string
  detail: string
  /** What the module opens, in plain words, for the "set up" summary. */
  opens: string
}

/** Why a work area is suggested for these answers, or its plain description (staff tools). */
export function moduleSuggestionText(
  kinds: readonly string[],
  operatingModel: OrgOperatingModel,
  option: OrgModuleOption,
): string {
  return suggestOrgSetup(kinds, operatingModel).find((item) => item.id === option.id)?.reason || option.detail
}

/**
 * Work areas to tick when the questions open. Saved areas once the questions were answered
 * (an empty list then means the owner unticked them); before that, the ones the answers suggest.
 */
export function startingModules(
  saved: { modules: OrgModule[]; completedAt?: string } | null | undefined,
  kinds: readonly string[],
  operatingModel: OrgOperatingModel = 'internal',
): OrgModule[] {
  if (saved?.completedAt) return saved.modules
  return suggestedOrgModules(kinds.length > 0 ? kinds : ['office'], operatingModel)
}

export const ORG_MODULE_OPTIONS: OrgModuleOption[] = ORG_MODULE_CATALOGUE.map(({ id, label, detail, opens }) => ({
  id,
  label,
  detail,
  opens,
}))

const OPENS_FOR_KIND: Record<OrgKind, string> = { office: '', field: 'Jobs', school: 'School fees', shop: 'Counter sales' }

/** "What you can do now" after setup: purchase requests and supplier bills always, then each answer once. */
export function openedWorkAreas(kinds: readonly OrgKind[], modules: readonly OrgModule[]): string[] {
  const opens = [
    'Purchase requests',
    'Supplier bills',
    ...modules.map((module) => ORG_MODULE_OPTIONS.find((option) => option.id === module)?.opens || ''),
    ...kinds.map((kind) => OPENS_FOR_KIND[kind] || ''),
  ]
  return Array.from(new Set(opens.filter(Boolean)))
}

/** The plan the organisation is on, as the server reports it with the setup answers. */
export type OrgPlanSummary = {
  id: string
  grantedModules: OrgModule[]
  note?: string
}

/** Under "How will you use the platform?": sign-in, cards and step checks cannot be switched off. */
export const OPERATING_MODEL_NOTE = 'Whichever you pick, sign-in, staff cards and the checks on each step stay on.'

/** One line under a module choice: whether it costs anything right now. */
export function modulePlanNote(module: OrgModule, plan: OrgPlanSummary | null | undefined): string {
  if (!ORG_MODULE_CATALOGUE.find((item) => item.id === module)?.paid) return 'Included.'
  if (!plan) return 'Part of the paid plan.'
  if (plan.id === 'premium') return 'Included in your plan.'
  if (plan.grantedModules.includes(module)) {
    return plan.note === 'pilot'
      ? 'Part of the paid plan. Free during the pilot.'
      : 'Part of the paid plan. Included for you.'
  }
  return 'Part of the paid plan. Not included in your plan yet.'
}

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

/** Ready-made money choices. Ids match the server presets in OrgWorkflowActorService. */
export type MoneyChoice = {
  id: string
  title: string
  detail: string
  /** Who confirms a request, in plain words. */
  confirms: string
  /** Who releases the money, in plain words. */
  releases: string
  /** Membership roles this choice needs on the team. The owner is always there. */
  needs: string[]
}

export const MONEY_CHOICES: MoneyChoice[] = [
  {
    id: 'owner_handles_money',
    title: 'Owner handles money',
    detail: 'One confirmation from the owner approves a request. The owner also releases the money.',
    confirms: 'The owner',
    releases: 'The owner',
    needs: [],
  },
  {
    id: 'finance_team',
    title: 'Manager, then finance',
    detail: 'The manager confirms, then the finance officer confirms separately. A director releases the money.',
    confirms: 'A manager, then a finance officer',
    releases: 'A director',
    needs: ['manager', 'finance_manager', 'director'],
  },
  {
    id: 'director_signs_once',
    title: 'Director confirms once',
    detail: 'One confirmation from a director approves a request. A finance officer releases the money.',
    confirms: 'A director',
    releases: 'A finance officer',
    needs: ['director', 'finance_manager'],
  },
]

const ROLE_WORDS: Record<string, string> = {
  manager: 'a manager',
  finance_manager: 'a finance officer',
  director: 'a director',
}

/** One line for the checklist when a money choice is saved but those people are not on the team yet. */
export function moneyInviteNote(presetId: string, roles: string[]): string | undefined {
  const choice = MONEY_CHOICES.find((item) => item.id === presetId)
  if (!choice || choice.needs.length === 0) return undefined
  const have = new Set(roles.map((role) => role.toLowerCase()))
  const missing = choice.needs
    .filter((role) => !have.has(role))
    .map((role) => ROLE_WORDS[role] || role.replace(/_/g, ' '))
  if (missing.length === 0) return undefined
  const list =
    missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`
  return `Invite ${list}. The owner stands in until then.`
}

export const PAYMENT_CHOICES: Array<{ id: PaymentChoice; label: string; detail: string }> = [
  { id: 'clicknpay', label: 'Click n Pay', detail: 'Card payments' },
  { id: 'ecocash', label: 'EcoCash', detail: 'Mobile money' },
  { id: 'simulated', label: 'Simulated pay', detail: 'Practice payment. No real money moves. Good for trying things out.' },
  { id: 'none', label: 'Not yet', detail: 'Choose later under Organisation → Payments' },
]

export type OrgProfile = {
  orgTenantId?: string
  operatingModel?: OrgOperatingModel
  access?: OrgConfigurationAccess
  kinds: OrgKind[]
  modules: OrgModule[]
  approvalPresetId: string
  approvalTitle: string
  paymentChoice: PaymentChoice
  completedAt: string
  /** Not stored locally as an answer; read from the server when present. */
  plan?: OrgPlanSummary
}

/** Path under `/api/organizations/{orgTenantId}`. */
export const SETUP_PROFILE_PATH = '/setup/profile'

/** Path under `/api/organizations/{orgTenantId}`: preview (`dryRun`) or apply all setup answers at once. */
export const SETUP_BOOTSTRAP_PATH = '/setup/bootstrap'

/** Money choice value meaning "leave the people already chosen under Who does what". */
export const KEEP_CURRENT_MONEY = 'keep_current'

/** What the setup answers will create, as returned by the bootstrap preview. */
export type OrgSetupPlan = {
  applied: boolean
  departments: Array<{ name: string; status: 'existing' | 'new' | 'restored' }>
  suggestedDepartments: string[]
  roles: Array<{ name: string; membershipRole: string; status: 'existing' | 'new' }>
  money: {
    keepCurrent: boolean
    presetId?: string
    title?: string
    approves?: string
    financeConfirms?: string
    releases?: string
  }
  workAreas: Array<{ id: string; label: string; opens: string; included: boolean }>
  payment: { method?: string; name?: string }
  askedOnFirstUse: string[]
}

/** Request body for the bootstrap call: the answers plus teams and the money choice. */
export function bootstrapRequest(
  profile: OrgProfile,
  extra: { departments: string[]; moneyPresetId: string; dryRun?: boolean },
) {
  return { ...profileToServer(profile), ...extra }
}

function cleanKinds(values: unknown): OrgKind[] {
  if (!Array.isArray(values)) return []
  return values.filter((kind): kind is OrgKind => ORG_KIND_OPTIONS.some((option) => option.id === kind))
}

export function cleanModules(values: unknown): OrgModule[] {
  if (!Array.isArray(values)) return []
  return values.filter((module): module is OrgModule => ORG_MODULE_OPTIONS.some((option) => option.id === module))
}

function cleanPlan(value: unknown): OrgPlanSummary | undefined {
  if (!value || typeof value !== 'object') return undefined
  const plan = value as Record<string, unknown>
  if (!plan.id) return undefined
  return {
    id: String(plan.id),
    grantedModules: cleanModules(plan.grantedModules),
    note: plan.note ? String(plan.note) : undefined,
  }
}

function cleanPayment(value: unknown): PaymentChoice {
  return PAYMENT_CHOICES.some((choice) => choice.id === value) ? (value as PaymentChoice) : 'none'
}

/** Server answers → profile. Null when the questions were never finished. */
export function profileFromServer(data: any): OrgProfile | null {
  if (!data?.orgTenantId) return null
  return {
    orgTenantId: data.orgTenantId,
    operatingModel: data.access?.operatingModel,
    access: data.access,
    kinds: cleanKinds(data.kinds),
    modules: cleanModules(data.modules),
    approvalPresetId: String(data.approvalPresetId || ''),
    approvalTitle: String(data.approvalTitle || ''),
    paymentChoice: cleanPayment(data.paymentChoice),
    completedAt: String(data.answeredAt || ''),
    plan: cleanPlan(data.plan),
  }
}

export function profileToServer(profile: OrgProfile) {
  return {
    operatingModel: profile.operatingModel,
    expectedRevision: profile.access?.revision ?? 0,
    kinds: profile.kinds,
    modules: profile.modules,
    approvalPresetId: profile.approvalPresetId || undefined,
    approvalTitle: profile.approvalTitle || undefined,
    paymentChoice: profile.paymentChoice,
  }
}

const ORG_PROFILE_KEY = 'credoOrgProfile'

/** Local copy of the last answers so the page can draw before the server replies. */
export function persistOrgProfile(profile: OrgProfile) {
  if (typeof window === 'undefined') return
  const active = window.localStorage.getItem('credoActiveOrg')
  const orgTenantId = profile.orgTenantId || (active ? JSON.parse(active).orgTenantId : undefined)
  if (!orgTenantId) return
  window.localStorage.setItem(ORG_PROFILE_KEY, JSON.stringify({ ...profile, orgTenantId }))
  window.dispatchEvent(new Event('orgConfigurationChanged'))
}

export function readOrgProfile(): OrgProfile | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(ORG_PROFILE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const active = JSON.parse(window.localStorage.getItem('credoActiveOrg') || 'null')
    if (!parsed.orgTenantId || parsed.orgTenantId !== active?.orgTenantId) return null
    if (!Array.isArray(parsed?.kinds)) return null
    return {
      orgTenantId: parsed.orgTenantId,
      operatingModel: parsed.operatingModel,
      access: parsed.access,
      kinds: cleanKinds(parsed.kinds),
      modules: cleanModules(parsed.modules),
      approvalPresetId: String(parsed.approvalPresetId || ''),
      approvalTitle: String(parsed.approvalTitle || ''),
      paymentChoice: cleanPayment(parsed.paymentChoice),
      completedAt: String(parsed.completedAt || ''),
      plan: cleanPlan(parsed.plan),
    }
  } catch {
    return null
  }
}

/** Update only this organisation's projection without overwriting saved questionnaire answers. */
export function persistOrgAccess(orgTenantId: string, access: OrgConfigurationAccess) {
  if (typeof window === 'undefined') return
  const active = JSON.parse(window.localStorage.getItem('credoActiveOrg') || 'null')
  if (active?.orgTenantId !== orgTenantId) return
  const current = readOrgProfile()
  persistOrgProfile({
    kinds: [],
    approvalPresetId: '',
    approvalTitle: '',
    paymentChoice: 'none',
    completedAt: '',
    ...current,
    orgTenantId,
    access,
    operatingModel: access.operatingModel,
    modules: access.modules.filter((module) => module.selected).map((module) => module.id),
  })
}

export function clearOrgProfile() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(ORG_PROFILE_KEY)
}

const SETUP_LATER_KEY = 'credoOrgSetupLater'

/** The owner chose "I'll answer later"; the questions should not open on their own again for this organisation. */
export function markOrgSetupLater(orgTenantId: string) {
  if (typeof window === 'undefined' || !orgTenantId) return
  try {
    const later: string[] = JSON.parse(window.localStorage.getItem(SETUP_LATER_KEY) || '[]')
    if (!later.includes(orgTenantId)) window.localStorage.setItem(SETUP_LATER_KEY, JSON.stringify([...later, orgTenantId]))
  } catch {
    window.localStorage.setItem(SETUP_LATER_KEY, JSON.stringify([orgTenantId]))
  }
}

export function orgSetupLater(orgTenantId: string): boolean {
  if (typeof window === 'undefined' || !orgTenantId) return false
  try {
    return (JSON.parse(window.localStorage.getItem(SETUP_LATER_KEY) || '[]') as string[]).includes(orgTenantId)
  } catch {
    return false
  }
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

export type SetupStepId = 'kinds' | 'people' | 'money' | 'payments' | 'brand' | 'team'

export type SetupStep = { id: SetupStepId; label: string; done: boolean; note?: string }

/**
 * The getting-started checklist, in order. Each step opens on its own screen.
 * `items` are setup readiness items (`GET .../setup/readiness`).
 * A saved money choice ticks that step even when the named people are not on the team yet.
 */
export function setupChecklist(input: {
  profile: OrgProfile | null
  items: Array<{ key: string; status: string; stageAction?: string }>
  memberCount: number
  roles?: string[]
  /** True once an owner or admin has saved the brand (logo, colour, document wording). */
  brandConfigured?: boolean
}): SetupStep[] {
  const needs = (item: { status: string }) => item.status === 'needs_attention'
  const moneyMissing = input.items.some(
    (item) =>
      item.key.startsWith('stage_actor:') &&
      needs(item) &&
      MONEY_STAGES.has(String(item.stageAction || item.key.slice('stage_actor:'.length))),
  )
  const paymentMissing = input.items.some((item) => item.key === 'payment_provider' && needs(item))
  const choiceSaved = Boolean(input.profile?.approvalPresetId)
  const moneyDone = choiceSaved || !moneyMissing
  const moneyNote =
    moneyDone && moneyMissing ? moneyInviteNote(input.profile?.approvalPresetId || '', input.roles || []) : undefined
  return [
    { id: 'kinds', label: 'Say what your organisation does', done: Boolean(input.profile?.completedAt) },
    // Answered together with "what you do"; the same saved answers tick both.
    { id: 'people', label: 'Choose what you will use', done: Boolean(input.profile?.completedAt) },
    { id: 'money', label: 'Choose who handles money', done: moneyDone, note: moneyNote },
    { id: 'payments', label: 'Pick how you take payments', done: !paymentMissing },
    { id: 'brand', label: 'Add your logo and document details', done: Boolean(input.brandConfigured) },
    { id: 'team', label: 'Invite your team', done: input.memberCount > 1 },
  ]
}

/** Used when the organisation has not answered setup yet, so the team list has nothing to offer. */
export const TEAM_ROLE_FALLBACK: Array<{ value: string; label: string }> = [
  { value: 'member', label: 'Team member' },
  { value: 'field_worker', label: 'Field worker' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'dispatcher', label: 'Dispatcher' },
  { value: 'approver', label: 'Approver' },
  { value: 'manager', label: 'Manager' },
  { value: 'finance_manager', label: 'Finance officer' },
  { value: 'director', label: 'Director' },
  { value: 'admin', label: 'Admin' },
]

/** Roles the owner can give someone. Owner is never offered; it is set when the organisation is created. */
export function teamRolesFromCatalog(
  roles: Array<{ name?: string; membershipRole?: string }>,
): Array<{ value: string; label: string }> {
  const seen = new Set<string>()
  const fromSetup: Array<{ value: string; label: string }> = []
  for (const role of roles) {
    const value = String(role.membershipRole || '').trim()
    if (!value || value === 'owner' || seen.has(value)) continue
    seen.add(value)
    fromSetup.push({ value, label: String(role.name || value).trim() || value })
  }
  return fromSetup
}

export function describeOrgProfile(profile: OrgProfile): string[] {
  const lines: string[] = []
  const kinds = profile.kinds
    .map((kind) => ORG_KIND_OPTIONS.find((option) => option.id === kind)?.label)
    .filter(Boolean) as string[]
  if (kinds.length > 0) lines.push(kinds.join(' · '))
  const modules = profile.modules
    .map((module) => ORG_MODULE_OPTIONS.find((option) => option.id === module)?.label)
    .filter(Boolean) as string[]
  if (modules.length > 0) lines.push(modules.join(' · '))
  if (profile.approvalTitle) lines.push(`Money: ${profile.approvalTitle}`)
  const payment = PAYMENT_CHOICES.find((choice) => choice.id === profile.paymentChoice)
  if (payment && payment.id !== 'none') lines.push(`Payments: ${payment.label}`)
  return lines
}
