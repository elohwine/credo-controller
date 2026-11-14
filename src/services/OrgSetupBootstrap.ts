/**
 * One-step organisation setup from the setup answers.
 *
 * The questions (what you do, work areas, teams, who handles money, payments) are answered
 * once; this turns them into the organisation's starting structure using the services that
 * already own each part:
 *
 *   answers      → OrgSetupProfileService (work areas → request types)
 *   teams        → OrgStarterDepartments ("General" when none are named)
 *   roles        → OrgStarterRoles (from the answers and the money choice)
 *   money people → OrgWorkflowActorService presets (every money step borrows them)
 *   main people  → OrgWorkflowActorService.fillMainPeopleFromAnswers (approver, finance, HR, operations)
 *   payments     → OrgSetupProvisioningService
 *   staff card   → ProofVcPolicyService (ask for the staff card on purchases above an amount)
 *
 * `buildOrgSetupPlan` is the read-only preview shown on the review screen; `applyOrgSetupBootstrap`
 * applies it (called by `OrganizationService.bootstrapOrganizationSetup` after the admin check). Steps nobody was named for fall back to
 * the usual role order and then the owner, so no request waits on structure.
 */

import { ORG_MODULE_CATALOGUE, ORG_MODULES, type OrgModule } from '../config/orgModules'
import { cleanDepartmentNames } from '../config/orgStructure'
import { StatusException } from '../errors'
import { DatabaseManager } from '../persistence/DatabaseManager'

import { orgEntitlementService } from './OrgEntitlementService'
import { getOrCreateOrgProofVcPolicy, updateOrgProofVcPolicy } from './ProofVcPolicyService'
import { SUGGESTED_CARD_REQUIRED_ABOVE } from './stepAssurance'
import { orgSetupProfileService, type OrgSetupProfile, type OrgSetupProfileInput } from './OrgSetupProfileService'
import { orgSetupProvisioningService, PAYMENT_METHODS } from './OrgSetupProvisioningService'
import {
  ensureDepartments,
  planDepartments,
  suggestedDepartmentsFor,
  type DepartmentPlanItem,
} from './OrgStarterDepartments'
import { ensureStarterRoles, rolesInUse, starterRoleName, starterRolesFor } from './OrgStarterRoles'
import {
  ACTOR_MAIN_ROLE_LABEL,
  ACTOR_MAIN_ROLES,
  ACTOR_PRESETS,
  mainPeopleForAnswers,
  orgWorkflowActorService,
  type ActorMainRole,
} from './OrgWorkflowActorService'

/** Leave the money people already chosen under Who does what. */
export const KEEP_CURRENT_MONEY = 'keep_current'

export interface OrgSetupBootstrapRequest extends OrgSetupProfileInput {
  /** Teams to have. Existing ones stay; missing ones are added. Empty or omitted: "General" if none exist. */
  departments?: string[]
  /** Money preset to apply under Who does what. Omitted or `keep_current` leaves it as it is. */
  moneyPresetId?: string
  /**
   * Ask for the staff card on purchase and payment approvals above this amount.
   * A number turns it on, null turns it off, omitted leaves it as it is.
   */
  cardRequiredAbove?: number | null
  /** Preview only. Nothing is saved. */
  dryRun?: boolean
}

export interface OrgSetupBootstrapRole {
  name: string
  membershipRole: string
  status: 'existing' | 'new'
}

export interface OrgSetupBootstrapResult {
  applied: boolean
  departments: DepartmentPlanItem[]
  suggestedDepartments: string[]
  roles: OrgSetupBootstrapRole[]
  money: {
    keepCurrent: boolean
    presetId?: string
    title?: string
    approves?: string
    financeConfirms?: string
    releases?: string
  }
  /**
   * Who each kind of work goes to, from these answers. `kept` means someone was already chosen;
   * a role nobody holds yet stands with the owner until a person with it joins.
   */
  mainPeople: Array<{ role: ActorMainRole; label: string; assignee: string; status: 'kept' | 'new' }>
  workAreas: Array<{ id: string; label: string; opens: string; included: boolean }>
  payment: { method?: string; name?: string }
  /** Staff card on large amounts: the limit after applying (null: off) and the suggested amount. */
  staffCard: { cardRequiredAbove: number | null; suggested: number; keepCurrent: boolean }
  /** Steps asked the first time they are used, in plain words. */
  askedOnFirstUse: string[]
  profile?: OrgSetupProfile
}

/** Reject anything the apply step would fail on, before anything is written. */
export function validateOrgSetupBootstrap(input: OrgSetupBootstrapRequest): void {
  const preset = input.moneyPresetId?.trim()
  if (preset && preset !== KEEP_CURRENT_MONEY && !ACTOR_PRESETS.some((item) => item.id === preset)) {
    throw new StatusException('Unknown money choice. Reload setup and pick again.', 400)
  }
  const payment = input.paymentChoice?.trim()
  if (payment && payment !== 'none' && !PAYMENT_METHODS.some((method) => method.id === payment)) {
    throw new StatusException('Choose Click n Pay, EcoCash, Simulated pay, or Not yet.', 400)
  }
  if (input.departments !== undefined && !Array.isArray(input.departments)) {
    throw new StatusException('Teams must be a list of names.', 400)
  }
  const limit = input.cardRequiredAbove
  if (limit !== undefined && limit !== null && !(typeof limit === 'number' && Number.isFinite(limit) && limit >= 0)) {
    throw new StatusException('The staff card amount must be zero or more.', 400)
  }
}

/** The money preset the request asks to apply, if any. */
export function moneyPresetToApply(input: OrgSetupBootstrapRequest) {
  const id = input.moneyPresetId?.trim()
  if (!id || id === KEEP_CURRENT_MONEY) return undefined
  return ACTOR_PRESETS.find((preset) => preset.id === id)
}

function organizationIdFor(orgTenantId: string): string | undefined {
  const row = DatabaseManager.getDatabase()
    .prepare('SELECT id FROM organizations WHERE tenant_id = ? LIMIT 1')
    .get(orgTenantId) as { id: string } | undefined
  return row?.id
}

function existingRoleKeys(organizationId: string | undefined): { byRole: Set<string>; byName: Set<string> } {
  if (!organizationId) return { byRole: new Set(), byName: new Set() }
  const rows = DatabaseManager.getDatabase()
    .prepare(`SELECT name, membership_role FROM roles WHERE organization_id = ?`)
    .all(organizationId) as Array<{ name: string; membership_role: string | null }>
  return {
    byRole: new Set(rows.map((row) => String(row.membership_role || '').toLowerCase()).filter(Boolean)),
    byName: new Set(rows.map((row) => row.name.trim().toLowerCase())),
  }
}

/**
 * What applying these answers would set up. Reads only; safe for a preview.
 * Answers that are not given fall back to what is saved now.
 */
export function buildOrgSetupPlan(orgTenantId: string, input: OrgSetupBootstrapRequest): OrgSetupBootstrapResult {
  const current = orgSetupProfileService.get(orgTenantId)
  const organizationId = organizationIdFor(orgTenantId)
  const kinds = input.kinds ?? current.kinds
  const modules = (input.modules ?? current.modules).filter((module): module is OrgModule =>
    ORG_MODULES.includes(module as OrgModule),
  )
  const preset = moneyPresetToApply(input)
  const approvalPresetId = preset?.id ?? input.approvalPresetId ?? current.approvalPresetId
  const answers = { kinds, modules, approvalPresetId }

  const existing = existingRoleKeys(organizationId)
  const roles = starterRolesFor(answers, rolesInUse(orgTenantId)).map((role) => ({
    name: role.name,
    membershipRole: role.membershipRole,
    status:
      existing.byRole.has(role.membershipRole) || existing.byName.has(role.name.toLowerCase())
        ? ('existing' as const)
        : ('new' as const),
  }))

  const plan = orgEntitlementService.planFor(orgTenantId)
  const workAreas = ORG_MODULE_CATALOGUE.filter((module) => modules.includes(module.id)).map((module) => ({
    id: module.id,
    label: module.label,
    opens: module.opens,
    included: orgEntitlementService.planAllows(plan, module.id),
  }))

  const paymentChoice = input.paymentChoice ?? current.paymentChoice
  const paymentMethod = PAYMENT_METHODS.find((method) => method.id === paymentChoice)

  const savedMainPeople = orgWorkflowActorService.getPolicy(orgTenantId).mainPeople
  const derivedMainPeople = mainPeopleForAnswers(answers)
  const mainPeople = ACTOR_MAIN_ROLES.flatMap((role): OrgSetupBootstrapResult['mainPeople'] => {
    const saved = savedMainPeople[role]
    const derived = derivedMainPeople[role]
    if (!derived) return []
    // An explicit money choice replaces approver/finance roles, as applyPreset does.
    const presetReplaces = Boolean(preset) && (role === 'approver' || role === 'finance') && saved?.type === 'role'
    if (saved && !presetReplaces) {
      const member =
        saved.type === 'user'
          ? orgWorkflowActorService.listOrgMembers(orgTenantId).find((item) => item.userId === saved.value)
          : undefined
      const assignee =
        saved.type === 'role' ? starterRoleName(saved.value) : saved.label || member?.displayName || 'Chosen person'
      return [{ role, label: ACTOR_MAIN_ROLE_LABEL[role], assignee, status: 'kept' }]
    }
    return [{ role, label: ACTOR_MAIN_ROLE_LABEL[role], assignee: starterRoleName(derived), status: 'new' }]
  })

  const askedOnFirstUse: string[] = []
  if (modules.includes('field_jobs') || kinds.includes('field')) {
    askedOnFirstUse.push('Who goes out on a job is picked on the first job.')
  }

  return {
    applied: false,
    departments: planDepartments(organizationId, cleanDepartmentNames(input.departments ?? [])),
    suggestedDepartments: suggestedDepartmentsFor(answers),
    roles,
    money: preset
      ? {
          keepCurrent: false,
          presetId: preset.id,
          title: preset.title,
          approves: starterRoleName(preset.roles.approve_requisition),
          financeConfirms:
            preset.signMode === 'both' ? starterRoleName(preset.roles.finance_approve_requisition) : undefined,
          releases: starterRoleName(preset.roles.release_funds),
        }
      : { keepCurrent: true, presetId: current.approvalPresetId, title: current.approvalTitle },
    mainPeople,
    workAreas,
    payment: paymentMethod ? { method: paymentMethod.id, name: paymentMethod.name } : {},
    staffCard: {
      cardRequiredAbove:
        input.cardRequiredAbove !== undefined
          ? input.cardRequiredAbove
          : getOrCreateOrgProofVcPolicy(orgTenantId).stepAssurance.cardRequiredAbove,
      suggested: SUGGESTED_CARD_REQUIRED_ABOVE,
      keepCurrent: input.cardRequiredAbove === undefined,
    },
    askedOnFirstUse,
  }
}

export interface OrgSetupBootstrapHooks {
  /** Saves the answers (with the caller's own follow-ups, e.g. discovery profile). */
  saveProfile(answers: OrgSetupProfileInput): Promise<OrgSetupProfile>
  /** Runs after money people change (e.g. refresh staff cards). */
  afterMoneyPeopleChanged?(): void
}

/**
 * Apply the answers in one go. The caller has already checked the user may change setup.
 * Every step is safe to repeat; departments and roles are only added or restored.
 */
export async function applyOrgSetupBootstrap(
  orgTenantId: string,
  organizationId: string,
  input: OrgSetupBootstrapRequest,
  hooks: OrgSetupBootstrapHooks,
): Promise<OrgSetupBootstrapResult> {
  validateOrgSetupBootstrap(input)
  const plan = buildOrgSetupPlan(orgTenantId, input)
  if (input.dryRun) return plan

  const {
    departments,
    moneyPresetId: _moneyPresetId,
    dryRun: _dryRun,
    cardRequiredAbove: _cardRequiredAbove,
    ...answers
  } = input
  const preset = moneyPresetToApply(input)
  if (preset) {
    answers.approvalPresetId = preset.id
    answers.approvalTitle = answers.approvalTitle || preset.title
  }
  const profile = await hooks.saveProfile(answers)
  const runsWorkHere = profile.modules.length > 0
  // Each kind of work these answers call for gets its main person (only kinds nobody was chosen for).
  const filled = runsWorkHere ? orgWorkflowActorService.fillMainPeopleFromAnswers(orgTenantId, profile) : {}
  if (preset && runsWorkHere) {
    orgWorkflowActorService.applyPreset(orgTenantId, preset.id)
  }
  if ((preset || Object.keys(filled).length > 0) && runsWorkHere) hooks.afterMoneyPeopleChanged?.()
  ensureDepartments(organizationId, departments ?? [])
  const payment = answers.paymentChoice
  if (payment && payment !== 'none' && runsWorkHere) {
    orgSetupProvisioningService.selectPaymentMethod(orgTenantId, payment)
  }
  ensureStarterRoles(orgTenantId, organizationId)
  if (input.cardRequiredAbove !== undefined) {
    const current = getOrCreateOrgProofVcPolicy(orgTenantId).stepAssurance
    updateOrgProofVcPolicy(orgTenantId, {
      stepAssurance: { ...current, cardRequiredAbove: input.cardRequiredAbove },
    })
    // Everyone who may approve gets their staff card now, so no large purchase waits on one.
    if (input.cardRequiredAbove !== null && current.cardRequiredAbove === null) hooks.afterMoneyPeopleChanged?.()
  }
  return { ...plan, applied: true, profile }
}
