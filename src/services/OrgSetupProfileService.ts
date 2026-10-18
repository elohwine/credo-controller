/**
 * What an organization told us about itself during setup.
 *
 * New organisations answer which work areas run here (or connect their own
 * systems only); the server keeps their selected scope separately from plan
 * entitlements. Legacy organisations retain finance and kind-derived work areas.
 * A request type opens once
 * its money steps have someone, and all money steps reuse the purchase-request
 * people (OrgWorkflowActorService.SHARED_FINANCE_STAGES) unless one request type
 * names its own. Who goes to site or checks the work is asked on first use.
 *
 * People & payroll (staff leave, expense claims, payslips) always needs its own
 * selection and plan entitlement, including on legacy organisations.
 *
 * The kind → request type mapping is mirrored in `credo-ui/{portal/utils,mobile/lib}/orgProfile.ts`.
 */

import {
  ORG_MODULE_CATALOGUE,
  ORG_MODULES,
  ORG_OPERATING_MODELS,
  suggestOrgSetup,
  type OrgModule,
  type OrgOperatingModel,
  type OrgConfigurationAccess,
} from '../config/orgModules'
import { StatusException } from '../errors'
import { DatabaseManager } from '../persistence/DatabaseManager'

import { orgEntitlementService } from './OrgEntitlementService'
import { getWorkflowTypeCandidates, getWorkflowTypeForWorkflow, type WorkflowIdentity } from './workflow/initiation'

export { ORG_MODULES, type OrgModule } from '../config/orgModules'

export type OrgKind = 'office' | 'field' | 'school' | 'shop'

export const ORG_KINDS: OrgKind[] = ['office', 'field', 'school', 'shop']

/** Legacy defaults: purchase requests, supplier bills, customer payments. */
export const ALWAYS_ON_REQUEST_TYPES = ['internal_requisitions', 'accounts_payable', 'payment_collection']

export const REQUEST_TYPES_BY_KIND: Record<OrgKind, string[]> = {
  office: [],
  field: ['field_execution_fept'],
  school: ['education_fee_payment'],
  shop: ['cash_counter_payment'],
}

/** Leave and expense claims route through the `hr_requests` people (approve_request). */
export const REQUEST_TYPES_BY_MODULE: Record<OrgModule, string[]> = {
  purchases: ['internal_requisitions'],
  payables: ['accounts_payable'],
  collections: ['payment_collection', 'accounts_receivable'],
  field_jobs: ['field_execution_fept'],
  school_fees: ['education_fee_payment'],
  commerce: ['cash_counter_payment', 'ecommerce_delivery'],
  people_payroll: ['hr_requests'],
}

/** Plain names for request types that have no built-in template to borrow a name from. */
export const REQUEST_TYPE_NAMES: Record<string, string> = {
  hr_requests: 'Staff requests',
}

export interface OrgSetupProfile {
  orgTenantId: string
  kinds: OrgKind[]
  /** Modules the owner switched on. Whether one may be used also depends on the plan. */
  modules: OrgModule[]
  /** The plan the organisation is on and what it grants, so the UI can say "free during the pilot". */
  plan: { id: string; grantedModules: OrgModule[]; note?: string }
  access: OrgConfigurationAccess
  approvalPresetId?: string
  approvalTitle?: string
  paymentChoice?: string
  /**
   * What happens to a person's earlier staff card when their role or steps change.
   * `stop_when_narrower` (default): withdraw it only when it would still prove steps they no
   * longer have; otherwise it stays valid until the new card is accepted. `stop_now`: withdraw
   * it the moment the role changes.
   */
  staffCardChange: StaffCardChangeRule
  /** Set once the owner finished the questions. Missing means they were skipped or never seen. */
  answeredAt?: string
  /** Request types these answers open. */
  requestTypes: string[]
}

export type StaffCardChangeRule = 'stop_when_narrower' | 'stop_now'
export const STAFF_CARD_CHANGE_RULES: StaffCardChangeRule[] = ['stop_when_narrower', 'stop_now']
export const DEFAULT_STAFF_CARD_CHANGE: StaffCardChangeRule = 'stop_when_narrower'

export interface OrgSetupProfileInput {
  operatingModel?: OrgOperatingModel
  expectedRevision?: number
  kinds?: string[]
  modules?: string[]
  approvalPresetId?: string
  approvalTitle?: string
  paymentChoice?: string
  staffCardChange?: string
}

function cleanStaffCardChange(value: unknown): StaffCardChangeRule | undefined {
  const rule = String(value || '')
    .trim()
    .toLowerCase() as StaffCardChangeRule
  return STAFF_CARD_CHANGE_RULES.includes(rule) ? rule : undefined
}

function cleanKinds(values: unknown): OrgKind[] {
  if (!Array.isArray(values)) return []
  const seen = new Set<OrgKind>()
  for (const value of values) {
    const kind = String(value || '')
      .trim()
      .toLowerCase() as OrgKind
    if (ORG_KINDS.includes(kind)) seen.add(kind)
  }
  return Array.from(seen)
}

function cleanModules(values: unknown): OrgModule[] {
  if (!Array.isArray(values)) return []
  const seen = new Set<OrgModule>()
  for (const value of values) {
    const module = String(value || '')
      .trim()
      .toLowerCase() as OrgModule
    if (ORG_MODULES.includes(module)) seen.add(module)
  }
  return Array.from(seen)
}

export function requestTypesFor(kinds: OrgKind[], modules: OrgModule[] = []): string[] {
  const types = new Set<string>(ALWAYS_ON_REQUEST_TYPES)
  kinds.forEach((kind) => REQUEST_TYPES_BY_KIND[kind].forEach((type) => types.add(type)))
  modules.forEach((module) => REQUEST_TYPES_BY_MODULE[module].forEach((type) => types.add(type)))
  return Array.from(types)
}

/** Kept for callers that only know the kinds. */
export function requestTypesForKinds(kinds: OrgKind[]): string[] {
  return requestTypesFor(kinds)
}

function legacyModules(kinds: OrgKind[], modules: OrgModule[]): OrgModule[] {
  return Array.from(
    new Set<OrgModule>([
      'purchases',
      'payables',
      'collections',
      ...modules,
      ...(kinds.includes('field') ? ['field_jobs' as const] : []),
      ...(kinds.includes('school') ? ['school_fees' as const] : []),
      ...(kinds.includes('shop') ? ['commerce' as const] : []),
    ]),
  )
}

export class OrgSetupProfileService {
  private get db() {
    return DatabaseManager.getDatabase()
  }

  public get(orgTenantId: string): OrgSetupProfile {
    const row = this.db.prepare('SELECT * FROM org_setup_profiles WHERE org_tenant_id = ? LIMIT 1').get(orgTenantId) as
      | {
          kinds: string
          modules: string
          configuration_mode: OrgConfigurationAccess['mode']
          operating_model: OrgOperatingModel
          configuration_revision: number
          approval_preset_id?: string
          approval_title?: string
          payment_choice?: string
          staff_card_change?: string
          answered_at?: string
        }
      | undefined
    const parseSelection = <T extends string>(raw: string, allowed: readonly T[]): T[] => {
      const value: unknown = JSON.parse(raw)
      if (!Array.isArray(value) || value.some((item) => !allowed.includes(item))) {
        throw new Error(`Invalid organisation configuration: ${orgTenantId}`)
      }
      return Array.from(new Set<T>(value))
    }
    const kinds = row ? parseSelection(row.kinds, ORG_KINDS) : []
    let modules = row ? parseSelection(row.modules, ORG_MODULES) : []
    const mode = row?.configuration_mode ?? 'unconfigured'
    if (mode === 'legacy') {
      modules = legacyModules(kinds, modules)
    }
    // A module the plan does not cover stays chosen but opens nothing until the plan does.
    const plan = orgEntitlementService.planFor(orgTenantId)
    const usableModules = modules.filter((module) => orgEntitlementService.planAllows(plan, module))
    const activeWork = new Map<OrgModule, { activeRequests: number; activeWorkflowRuns: number }>()
    const addActiveWork = (module: OrgModule | undefined, kind: 'activeRequests' | 'activeWorkflowRuns') => {
      if (!module || usableModules.includes(module)) return
      const count = activeWork.get(module) ?? { activeRequests: 0, activeWorkflowRuns: 0 }
      count[kind] += 1
      activeWork.set(module, count)
    }
    const activeRequests = this.db
      .prepare(
        `
      SELECT r.request_type AS requestType
      FROM requests r JOIN organizations o ON o.id = r.organization_id
      WHERE o.tenant_id = ?
        AND lower(r.status) NOT IN ('completed', 'cancelled', 'rejected', 'closed', 'reconciled')
    `,
      )
      .all(orgTenantId) as Array<{ requestType: string }>
    activeRequests.forEach(({ requestType }) => addActiveWork(this.moduleForOperation(requestType), 'activeRequests'))

    const activeRuns = this.db
      .prepare(
        `
      SELECT w.id, w.category
      FROM workflow_runs r JOIN workflows w ON w.id = r.workflow_id
      WHERE r.tenant_id = ?
        AND lower(r.status) NOT IN ('completed', 'cancelled', 'failed', 'reconciled')
    `,
      )
      .all(orgTenantId) as Array<{ id: string; category: string }>
    activeRuns.forEach((workflow) => addActiveWork(this.moduleForWorkflow(workflow), 'activeWorkflowRuns'))

    return {
      orgTenantId,
      kinds,
      modules,
      access: {
        revision: row?.configuration_revision ?? 0,
        mode,
        operatingModel: row?.operating_model ?? 'internal',
        ssiIdentity: true,
        suggestions: suggestOrgSetup(kinds, row?.operating_model ?? 'internal'),
        drainingWork: ORG_MODULE_CATALOGUE.filter((module) => activeWork.has(module.id)).map((module) => ({
          moduleId: module.id,
          label: module.label,
          ...activeWork.get(module.id)!,
        })),
        modules: ORG_MODULE_CATALOGUE.map(({ id }) => {
          const selected = modules.includes(id)
          const entitled = orgEntitlementService.planAllows(plan, id)
          return {
            id,
            selected,
            entitled,
            available: mode !== 'unconfigured' && selected && entitled,
            reason:
              mode === 'unconfigured'
                ? 'Answer the organisation setup questions.'
                : !selected
                  ? 'Your setup answers do not enable this work area.'
                  : !entitled
                    ? 'This work area is not included in the organisation plan.'
                    : undefined,
          }
        }),
      },
      plan: { id: plan.plan, grantedModules: plan.grantedModules, note: plan.note },
      approvalPresetId: row?.approval_preset_id || undefined,
      approvalTitle: row?.approval_title || undefined,
      paymentChoice: row?.payment_choice || undefined,
      staffCardChange: cleanStaffCardChange(row?.staff_card_change) || DEFAULT_STAFF_CARD_CHANGE,
      answeredAt: row?.answered_at || undefined,
      requestTypes:
        mode === 'legacy'
          ? requestTypesFor(kinds, usableModules)
          : usableModules.flatMap((module) => REQUEST_TYPES_BY_MODULE[module]),
    }
  }

  public initializeNew(orgTenantId: string): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO org_setup_profiles (org_tenant_id, configuration_mode) VALUES (?, 'unconfigured')`,
      )
      .run(orgTenantId)
  }

  public moduleForOperation(operation: string): OrgModule | undefined {
    const normalized = operation.trim().toLowerCase()
    const extra: Record<string, OrgModule> = {
      'procurement.requisition': 'purchases',
      requisition: 'purchases',
      internal_requisition: 'purchases',
      field_job: 'field_jobs',
      'hr.leave': 'people_payroll',
      'finance.expense_claim': 'people_payroll',
      'finance.payment_request': 'collections',
      tpl_employee_onboarding: 'people_payroll',
      tpl_payslip_issuance: 'people_payroll',
      tpl_payroll_reporting: 'people_payroll',
    }
    if (extra[normalized.replace(/-/g, '_')]) return extra[normalized.replace(/-/g, '_')]
    const candidates = getWorkflowTypeCandidates(
      normalized.startsWith('tpl-') ? normalized : normalized.replace(/-/g, '_'),
    )
    return ORG_MODULE_CATALOGUE.find((module) =>
      [...module.requestTypes, ...module.templateIds].some((type) =>
        getWorkflowTypeCandidates(type).some((candidate) => candidates.includes(candidate)),
      ),
    )?.id
  }

  public moduleForWorkflow(workflow: WorkflowIdentity): OrgModule | undefined {
    return this.moduleForOperation(getWorkflowTypeForWorkflow(workflow))
  }

  public assertWorkflow(orgTenantId: string, workflow: WorkflowIdentity): void {
    const module = this.moduleForWorkflow(workflow)
    if (module) this.assertModule(orgTenantId, module)
  }

  public assertModule(orgTenantId: string, module: OrgModule): void {
    const profile = this.get(orgTenantId)
    // Existing organisations may have custom workflows outside their questionnaire.
    if (profile.access.mode === 'legacy' && module !== 'people_payroll') return
    const access = profile.access.modules.find((item) => item.id === module)
    const label = ORG_MODULE_CATALOGUE.find((item) => item.id === module)?.label || module
    if (!access?.available) {
      throw new StatusException(`${label}: ${access?.reason || 'Work area unavailable'} Open Organisation setup.`, 403)
    }
  }

  public assertOperation(orgTenantId: string, operation: string): void {
    const module = this.moduleForOperation(operation)
    if (module) this.assertModule(orgTenantId, module)
  }

  public save(orgTenantId: string, input: OrgSetupProfileInput): OrgSetupProfile {
    return this.db.transaction(() => this.saveConfiguration(orgTenantId, input))()
  }

  private saveConfiguration(orgTenantId: string, input: OrgSetupProfileInput): OrgSetupProfile {
    const current = this.get(orgTenantId)
    if (
      input.kinds?.some((kind) => !ORG_KINDS.includes(kind as OrgKind)) ||
      input.modules?.some((module) => !ORG_MODULES.includes(module as OrgModule))
    ) {
      throw new StatusException('Unknown organisation kind or module. Reload organisation setup.', 400)
    }
    if (input.operatingModel !== undefined && !ORG_OPERATING_MODELS.includes(input.operatingModel)) {
      throw new StatusException('Unknown operating model.', 400)
    }
    const configure = input.operatingModel !== undefined
    const scopeTouched = configure || input.kinds !== undefined || input.modules !== undefined
    if (scopeTouched && input.expectedRevision !== current.access.revision) {
      throw new StatusException('Organisation configuration changed. Reload setup before saving.', 409)
    }
    if (configure && input.modules === undefined) {
      throw new StatusException(
        'Setup answers must specify the work areas to run here, including none when connecting your own systems.',
        400,
      )
    }
    if (
      current.access.mode === 'unconfigured' &&
      !configure &&
      (input.kinds !== undefined || input.modules !== undefined)
    ) {
      throw new StatusException('Answer the organisation setup questions before saving work areas.', 400)
    }
    const kinds = input.kinds !== undefined ? cleanKinds(input.kinds) : current.kinds
    const modules = input.modules !== undefined ? cleanModules(input.modules) : current.modules
    const mode = configure ? 'explicit' : current.access.mode
    const operatingModel = input.operatingModel ?? current.access.operatingModel
    if (mode === 'explicit' && operatingModel === 'integration' && modules.length > 0) {
      throw new StatusException(
        'When you connect your own systems only, no internal work areas may be enabled. Choose hybrid to use both.',
        400,
      )
    }
    const effectiveModules = mode === 'legacy' ? legacyModules(kinds, modules) : modules
    const now = new Date().toISOString()
    // Changing only the staff-card rule is a setting, not an answer to the setup questions.
    const answersTouched =
      input.kinds !== undefined ||
      input.modules !== undefined ||
      input.approvalPresetId !== undefined ||
      input.approvalTitle !== undefined ||
      input.paymentChoice !== undefined
    this.db
      .prepare(
        `INSERT INTO org_setup_profiles (
           org_tenant_id, kinds, modules, approval_preset_id, approval_title, payment_choice, staff_card_change, answered_at, created_at, updated_at,
           configuration_mode, operating_model, configuration_revision
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(org_tenant_id) DO UPDATE SET
           kinds = excluded.kinds,
           modules = excluded.modules,
           approval_preset_id = excluded.approval_preset_id,
           approval_title = excluded.approval_title,
           payment_choice = excluded.payment_choice,
           staff_card_change = excluded.staff_card_change,
           answered_at = excluded.answered_at,
           configuration_mode = excluded.configuration_mode,
           operating_model = excluded.operating_model,
           configuration_revision = excluded.configuration_revision,
           updated_at = excluded.updated_at`,
      )
      .run(
        orgTenantId,
        JSON.stringify(kinds),
        JSON.stringify(modules),
        input.approvalPresetId ?? current.approvalPresetId ?? null,
        input.approvalTitle ?? current.approvalTitle ?? null,
        input.paymentChoice ?? current.paymentChoice ?? null,
        cleanStaffCardChange(input.staffCardChange) ?? current.staffCardChange,
        answersTouched ? now : (current.answeredAt ?? null),
        now,
        now,
        mode,
        operatingModel,
        current.access.revision + 1,
      )
    return this.get(orgTenantId)
  }
}

export const orgSetupProfileService = new OrgSetupProfileService()
