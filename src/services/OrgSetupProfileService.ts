/**
 * What an organization told us about itself during setup.
 *
 * Request types are never picked or switched on. Every organization can raise
 * purchase requests, pay supplier bills and take customer payments. The "what do
 * you do" answer adds jobs, school fees or counter sales. A request type opens once
 * its money steps have someone, and all money steps reuse the purchase-request
 * people (OrgWorkflowActorService.SHARED_FINANCE_STAGES) unless one request type
 * names its own. Who goes to site or checks the work is asked on first use.
 *
 * The kind → request type mapping is mirrored in `credo-ui/{portal/utils,mobile/lib}/orgProfile.ts`.
 */

import { DatabaseManager } from '../persistence/DatabaseManager'

export type OrgKind = 'office' | 'field' | 'school' | 'shop'

export const ORG_KINDS: OrgKind[] = ['office', 'field', 'school', 'shop']

/** Purchase requests, supplier bills, customer payments. */
export const ALWAYS_ON_REQUEST_TYPES = ['internal_requisitions', 'accounts_payable', 'payment_collection']

export const REQUEST_TYPES_BY_KIND: Record<OrgKind, string[]> = {
  office: [],
  field: ['field_execution_fept'],
  school: ['education_fee_payment'],
  shop: ['cash_counter_payment'],
}

export interface OrgSetupProfile {
  orgTenantId: string
  kinds: OrgKind[]
  approvalPresetId?: string
  approvalTitle?: string
  paymentChoice?: string
  /** Set once the owner finished the questions. Missing means they were skipped or never seen. */
  answeredAt?: string
  /** Request types these answers open. */
  requestTypes: string[]
}

export interface OrgSetupProfileInput {
  kinds?: string[]
  approvalPresetId?: string
  approvalTitle?: string
  paymentChoice?: string
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

export function requestTypesForKinds(kinds: OrgKind[]): string[] {
  const types = new Set<string>(ALWAYS_ON_REQUEST_TYPES)
  kinds.forEach((kind) => REQUEST_TYPES_BY_KIND[kind].forEach((type) => types.add(type)))
  return Array.from(types)
}

export class OrgSetupProfileService {
  private get db() {
    return DatabaseManager.getDatabase()
  }

  public get(orgTenantId: string): OrgSetupProfile {
    let row: any
    try {
      row = this.db.prepare('SELECT * FROM org_setup_profiles WHERE org_tenant_id = ? LIMIT 1').get(orgTenantId)
    } catch {
      row = undefined
    }
    let kinds: OrgKind[] = []
    if (row?.kinds) {
      try {
        kinds = cleanKinds(JSON.parse(row.kinds))
      } catch {
        kinds = []
      }
    }
    return {
      orgTenantId,
      kinds,
      approvalPresetId: row?.approval_preset_id || undefined,
      approvalTitle: row?.approval_title || undefined,
      paymentChoice: row?.payment_choice || undefined,
      answeredAt: row?.answered_at || undefined,
      requestTypes: requestTypesForKinds(kinds),
    }
  }

  public save(orgTenantId: string, input: OrgSetupProfileInput): OrgSetupProfile {
    const current = this.get(orgTenantId)
    const kinds = input.kinds !== undefined ? cleanKinds(input.kinds) : current.kinds
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO org_setup_profiles (
           org_tenant_id, kinds, approval_preset_id, approval_title, payment_choice, answered_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(org_tenant_id) DO UPDATE SET
           kinds = excluded.kinds,
           approval_preset_id = excluded.approval_preset_id,
           approval_title = excluded.approval_title,
           payment_choice = excluded.payment_choice,
           answered_at = excluded.answered_at,
           updated_at = excluded.updated_at`,
      )
      .run(
        orgTenantId,
        JSON.stringify(kinds),
        input.approvalPresetId ?? current.approvalPresetId ?? null,
        input.approvalTitle ?? current.approvalTitle ?? null,
        input.paymentChoice ?? current.paymentChoice ?? null,
        now,
        now,
        now,
      )
    return this.get(orgTenantId)
  }
}

export const orgSetupProfileService = new OrgSetupProfileService()
