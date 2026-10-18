/**
 * Which paid modules an organisation may use.
 *
 * A module is usable when the owner switched it on in setup (`org_setup_profiles.modules`)
 * AND the organisation's plan covers it. Plans live in `org_plans`: a tier (`free`,
 * `premium`) plus modules granted outside the tier. During the pilot every organisation is
 * on `free` with People & payroll granted, so nothing is charged yet but the gate is in place
 * for when plans are sold.
 *
 * Controllers and services ask `orgEntitlementService.hasModule(orgTenantId, 'people_payroll')`;
 * nobody reads `org_plans` or the modules column anywhere else.
 */

import { DatabaseManager } from '../persistence/DatabaseManager'

import { ORG_MODULES, type OrgModule } from '../config/orgModules'
import { orgSetupProfileService } from './OrgSetupProfileService'

export type OrgPlanTier = 'free' | 'premium'

export const ORG_PLAN_TIERS: OrgPlanTier[] = ['free', 'premium']

/** The lowest tier that includes each module. */
export const MODULE_PLAN: Record<OrgModule, OrgPlanTier> = {
  purchases: 'free',
  payables: 'free',
  collections: 'free',
  field_jobs: 'free',
  school_fees: 'free',
  commerce: 'free',
  people_payroll: 'premium',
}

/** Modules every organisation gets at no charge while the pilot runs. */
export const PILOT_GRANTED_MODULES: OrgModule[] = ['people_payroll']

export interface OrgPlan {
  orgTenantId: string
  plan: OrgPlanTier
  /** Modules granted beyond the tier (pilot grant, a promotion, a manual grant). */
  grantedModules: OrgModule[]
  note?: string
}

const TIER_RANK: Record<OrgPlanTier, number> = { free: 0, premium: 1 }

function cleanTier(value: unknown): OrgPlanTier {
  const tier = String(value || '')
    .trim()
    .toLowerCase() as OrgPlanTier
  return ORG_PLAN_TIERS.includes(tier) ? tier : 'free'
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

export class OrgEntitlementService {
  private get db() {
    return DatabaseManager.getDatabase()
  }

  /** The organisation's plan. Without a row it is the pilot default: free, People & payroll granted. */
  public planFor(orgTenantId: string): OrgPlan {
    const row = this.db.prepare('SELECT * FROM org_plans WHERE org_tenant_id = ? LIMIT 1').get(orgTenantId) as
      | { plan: string; granted_modules: string; note?: string }
      | undefined
    if (!row) {
      return { orgTenantId, plan: 'free', grantedModules: [...PILOT_GRANTED_MODULES], note: 'pilot' }
    }
    const raw: unknown = JSON.parse(row.granted_modules)
    if (
      !Array.isArray(raw) ||
      raw.some((module) => !ORG_MODULES.includes(module)) ||
      !ORG_PLAN_TIERS.includes(row.plan as OrgPlanTier)
    ) {
      throw new Error(`Invalid organisation entitlement configuration: ${orgTenantId}`)
    }
    const granted = cleanModules(raw)
    return { orgTenantId, plan: cleanTier(row.plan), grantedModules: granted, note: row.note || undefined }
  }

  /** True when the plan tier includes the module or it was granted outside the tier. */
  public planAllows(plan: OrgPlan, module: OrgModule): boolean {
    return TIER_RANK[plan.plan] >= TIER_RANK[MODULE_PLAN[module]] || plan.grantedModules.includes(module)
  }

  /** Modules the organisation switched on and the plan lets it use. */
  public enabledModules(orgTenantId: string): OrgModule[] {
    const plan = this.planFor(orgTenantId)
    return orgSetupProfileService.get(orgTenantId).modules.filter((module) => this.planAllows(plan, module))
  }

  public hasModule(orgTenantId: string, module: OrgModule): boolean {
    return this.enabledModules(orgTenantId).includes(module)
  }

  /** Set the plan. Used by operators; there is no self-service upgrade yet. */
  public setPlan(orgTenantId: string, input: { plan?: string; grantedModules?: string[]; note?: string }): OrgPlan {
    const current = this.planFor(orgTenantId)
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO org_plans (org_tenant_id, plan, granted_modules, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(org_tenant_id) DO UPDATE SET
           plan = excluded.plan,
           granted_modules = excluded.granted_modules,
           note = excluded.note,
           updated_at = excluded.updated_at`,
      )
      .run(
        orgTenantId,
        input.plan !== undefined ? cleanTier(input.plan) : current.plan,
        JSON.stringify(
          input.grantedModules !== undefined ? cleanModules(input.grantedModules) : current.grantedModules,
        ),
        input.note ?? current.note ?? null,
        now,
        now,
      )
    return this.planFor(orgTenantId)
  }
}

export const orgEntitlementService = new OrgEntitlementService()
