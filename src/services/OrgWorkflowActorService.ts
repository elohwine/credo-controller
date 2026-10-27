import { randomUUID } from 'crypto'

import { DatabaseManager } from '../persistence/DatabaseManager'

type Db = ReturnType<typeof DatabaseManager.getDatabase>

export interface WorkflowActorDefaultRecord {
  id: string
  orgTenantId: string
  workflowType: string
  stageAction: string
  defaultRole?: string
  defaultUserId?: string
  defaultWalletTenantId?: string
  /** Other named people who may also act on this stage, besides defaultUserId. */
  additionalUserIds: string[]
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface OrgMemberActor {
  userId: string
  role: string
  walletTenantId?: string
  status: string
  updatedAt?: string
  /** Name from the org's internal contact row, so pickers can show people, not IDs. */
  displayName?: string
  phone?: string
}

export interface ResolveOrgWorkflowActorInput {
  orgTenantId: string
  workflowType: string
  stageAction: string
}

/**
 * How a stage actor was resolved, strongest first:
 *  - configured_user / configured_wallet / configured_role: a stage default saved for this workflow+stage
 *  - shared_finance: a money step in another workflow (payout, supplier payment, receipt) with no
 *    setting of its own, covered by the purchase-request money setup (SHARED_FINANCE_STAGES)
 *  - policy_fallback: the organization's own fallback chain (per stage or org-wide) matched
 *  - role_fallback: the platform's built-in role order for the stage matched
 *  - owner_fallback: nothing matched, routed to owner/admin (surfaced as a setup item)
 *  - unassigned: nothing matched and the org disabled the owner fallback (blocks readiness)
 */
export type OrgWorkflowActorMode =
  | 'configured_user'
  | 'configured_wallet'
  | 'configured_role'
  | 'shared_finance'
  | 'policy_fallback'
  | 'role_fallback'
  | 'owner_fallback'
  | 'unassigned'

export interface ResolvedOrgWorkflowActor {
  userId?: string
  walletTenantId?: string
  role: string
  mode: OrgWorkflowActorMode
  /** Which fallback chain entry produced a `policy_fallback` result. */
  via?: ActorFallbackEntry
  /** Other people the organisation named for this stage; each may act on it too. */
  coActorUserIds?: string[]
}

/** One step of an organization-defined fallback chain. */
export interface ActorFallbackEntry {
  type: 'user' | 'role' | 'wallet'
  value: string
  /** Optional display label kept for the settings UI. */
  label?: string
}

/**
 * Per-organization fallback policy, edited in Organization → Workflow actors (portal)
 * and Settings → Organisation (mobile). Applies to every workflow the org runs.
 */
export interface OrgWorkflowActorPolicy {
  orgTenantId: string
  /** Tried for a stage before `defaultChain` when no stage default matches. Keyed by stage action. */
  stageChains: Record<string, ActorFallbackEntry[]>
  /** Org-wide chain tried for any stage without a configured default. */
  defaultChain: ActorFallbackEntry[]
  /** Apply the platform's built-in role order per stage after the org chains. Default true. */
  useBuiltInRoleFallbacks: boolean
  /** Route to owner/admin as the last resort. When false unresolved stages are `unassigned`. Default true. */
  ownerFallbackEnabled: boolean
  /**
   * How a paired decision is satisfied. Keyed by group id.
   * `one` — a single confirmation finishes every step in the group.
   * `both` — each step needs its own confirmation.
   * Missing keys mean `both`, which is how requests already work.
   */
  signGroups: Record<string, StageSignMode>
  updatedAt?: string
}

/** One confirmation, or each person confirms separately. */
export type StageSignMode = 'one' | 'both'

/** Manager approval and finance approval on a purchase request. */
export const REQUISITION_APPROVAL_SIGN_GROUP = 'requisition_approval'

export type OrgWorkflowActorPolicyPatch = Partial<Omit<OrgWorkflowActorPolicy, 'orgTenantId' | 'updatedAt'>>

export const DEFAULT_ACTOR_POLICY: Omit<OrgWorkflowActorPolicy, 'orgTenantId'> = {
  stageChains: {},
  defaultChain: [],
  useBuiltInRoleFallbacks: true,
  ownerFallbackEnabled: true,
  signGroups: {},
}

export interface ActorPreset {
  id: string
  title: string
  detail: string
  workflowType: string
  signGroup: string
  signMode: StageSignMode
  /** Stage action → membership role. */
  roles: Record<string, string>
}

/**
 * Ready-made "who does what" for purchase requests.
 * Applied from Organization → Who does what (portal) and Settings → Organisation (phone).
 */
export const ACTOR_PRESETS: ActorPreset[] = [
  {
    id: 'owner_handles_money',
    title: 'Owner handles money',
    detail: 'One confirmation from the owner approves a request. The owner also releases the money.',
    workflowType: 'internal_requisitions',
    signGroup: REQUISITION_APPROVAL_SIGN_GROUP,
    signMode: 'one',
    roles: {
      approve_requisition: 'owner',
      finance_approve_requisition: 'owner',
      release_funds: 'owner',
    },
  },
  {
    id: 'finance_team',
    title: 'Manager, then finance',
    detail: 'The manager confirms, then the finance officer confirms separately. A director releases the money.',
    workflowType: 'internal_requisitions',
    signGroup: REQUISITION_APPROVAL_SIGN_GROUP,
    signMode: 'both',
    roles: {
      approve_requisition: 'manager',
      finance_approve_requisition: 'finance_manager',
      release_funds: 'director',
    },
  },
  {
    id: 'director_signs_once',
    title: 'Director confirms once',
    detail: 'One confirmation from a director approves a request. A finance officer releases the money.',
    workflowType: 'internal_requisitions',
    signGroup: REQUISITION_APPROVAL_SIGN_GROUP,
    signMode: 'one',
    roles: {
      approve_requisition: 'director',
      finance_approve_requisition: 'director',
      release_funds: 'finance_manager',
    },
  },
]

export function requisitionApprovalSignMode(
  policy: Pick<OrgWorkflowActorPolicy, 'signGroups'> | undefined,
): StageSignMode {
  return policy?.signGroups?.[REQUISITION_APPROVAL_SIGN_GROUP] === 'one' ? 'one' : 'both'
}

/**
 * Role fallback order per workflow stage action.
 *
 * Owner / admin are intentionally NOT listed here: when no listed role matches,
 * `resolveActor` falls through to OWNER_FALLBACK and reports `mode: 'owner_fallback'`
 * so readiness can surface "no actor configured for this stage" as a setup item
 * instead of silently routing everything to the owner.
 */
export const ROLE_FALLBACK_BY_STAGE_ACTION: Record<string, string[]> = {
  // Finance / AR / AP
  present_payment_proof: ['finance_manager', 'accountant', 'approver', 'manager'],
  record_payment: ['accountant', 'finance_manager', 'cashier', 'approver', 'manager'],
  acknowledge_remittance: ['finance_manager', 'accountant', 'manager'],
  issue_receipt_vc: ['issuer', 'finance_manager', 'accountant', 'cashier', 'approver'],
  mark_disputed: ['manager', 'approver'],
  resolve_dispute: ['manager', 'approver'],
  // Requisitions / procurement
  approve_requisition: ['approver', 'manager', 'director', 'procurement_approver'],
  finance_approve_requisition: ['finance_manager', 'director', 'accountant', 'approver'],
  release_funds: ['finance_manager', 'director', 'accountant', 'approver'],
  acknowledge_execution: ['requester', 'receiver', 'customer', 'field_worker', 'technician', 'manager'],
  // Field execution (FEPT)
  assign_field_worker: ['field_worker', 'technician', 'driver', 'inspector', 'dispatcher'],
  inspect_site: ['inspector', 'supervisor', 'field_worker', 'technician'],
  review_completion: ['supervisor', 'inspector', 'manager', 'dispatcher'],
  assess_risk: ['field_worker', 'technician', 'driver', 'inspector'],
  // Sorts out a "not safe to start" hold raised by the worker; owner/admin stand in when unset.
  resolve_safety_hold: ['supervisor', 'operations_manager', 'dispatcher', 'manager'],
  confirm_arrival: ['field_worker', 'technician', 'driver', 'inspector'],
  start_job: ['field_worker', 'technician', 'driver', 'inspector'],
  capture_evidence: ['field_worker', 'technician', 'driver', 'inspector'],
  dispatch_job: ['dispatcher', 'operations_manager', 'manager'],
  trigger_payout: ['finance_manager', 'accountant', 'approver'],
  // HR / payroll
  approve_onboarding: ['hr_manager', 'hr', 'approver', 'manager'],
  // Time off and expense claims raised from Home: the manager decides, HR or a director stands in.
  approve_request: ['manager', 'hr_manager', 'director', 'approver'],
  issue_payslip: ['payroll', 'hr_manager', 'finance_manager', 'accountant'],
}

/**
 * Where one workflow reads a shared step differently. On a field job the sign-off is the
 * person who checks the work (supervisor / inspector), never the worker who did it; on a
 * purchase request the same step is the requester confirming the goods arrived.
 */
export const ROLE_FALLBACK_BY_WORKFLOW_STAGE: Record<string, Record<string, string[]>> = {
  field_execution_fept: {
    acknowledge_execution: ['supervisor', 'inspector', 'manager', 'dispatcher'],
    // The worker on site checks it unless the organisation names an inspector in Who does what.
    // No built-in role here, so an unconfigured step resolves to the job's assigned worker.
    inspect_site: [],
  },
}

/** Built-in role order for a step, with the workflow's own reading of the step first. */
export function roleFallbackFor(workflowType: string, stageAction: string): string[] {
  const stage = normalize(stageAction)
  for (const candidate of workflowActorTypeCandidates(workflowType)) {
    const byWorkflow = ROLE_FALLBACK_BY_WORKFLOW_STAGE[normalize(candidate)]?.[stage]
    if (byWorkflow) return byWorkflow
  }
  return ROLE_FALLBACK_BY_STAGE_ACTION[stage] || []
}

const OWNER_FALLBACK = ['owner', 'admin']

/**
 * Money steps outside purchase requests reuse the purchase-request money setup.
 *
 * An organization sets who approves and who releases money once (Who does what →
 * Purchase requests). Every other workflow's money step — releasing a job payout, paying a
 * supplier bill, confirming a remittance, issuing a receipt — resolves to that same person
 * unless the organization explicitly picks someone for that step. Keys are stage actions
 * in other workflows; values are the purchase-request stage action they borrow from.
 */
export const SHARED_FINANCE_STAGES: Record<string, string> = {
  trigger_payout: 'release_funds',
  record_payment: 'release_funds',
  issue_receipt_vc: 'release_funds',
  present_payment_proof: 'finance_approve_requisition',
  acknowledge_remittance: 'finance_approve_requisition',
  // The same stage names used by a workflow outside the purchase-request group
  // (for example a procurement step started from a field job).
  approve_requisition: 'approve_requisition',
  finance_approve_requisition: 'finance_approve_requisition',
  release_funds: 'release_funds',
}

/** Workflow types whose money setup every other workflow borrows from. */
export const SHARED_FINANCE_WORKFLOW_TYPE = 'internal_requisitions'

/**
 * Workflow-type keys that share one actor configuration.
 *
 * Org templates are keyed by the configured workflow type (e.g. `internal_requisitions`), while
 * runtime request rows and older clients use aliases (`internal_requisition_approval`,
 * `ap_trust_workflow`, ...). A default saved under any key in a group applies to the whole group so
 * the inbox assignment and the Finance/Setup actor views agree.
 */
export const WORKFLOW_ACTOR_ALIASES: string[][] = [
  [
    'internal_requisitions',
    'internal_requisition',
    'internal_requisition_approval',
    'requisition_workflow',
    'tpl-requisition-approval',
    'procurement.requisition',
    'requisition',
  ],
  ['field_execution_fept', 'field_execution', 'field_service', 'tpl-fept-field-execution'],
  ['accounts_payable', 'ap_payables', 'ap_trust_workflow', 'tpl-ap-payables'],
  [
    'accounts_receivable',
    'ar_collections',
    'collect_payments',
    'payment_collection',
    'tpl-ar-collections',
    'tpl-payment-collection',
  ],
  ['education_fee_payment', 'school_fee_payment', 'school_fees', 'tpl-education-fee'],
  ['cash_counter_payment', 'cash_payment', 'tpl-cash-counter'],
  // Member requests (leave, expense claims) share the people set up for employee onboarding.
  ['hr_requests', 'employee_onboarding', 'tpl-employee-onboarding', 'hr.leave', 'finance.expense_claim'],
]

/** All workflow-type keys whose actor defaults apply to `workflowType` (itself first). */
export function workflowActorTypeCandidates(workflowType: string): string[] {
  const normalized = normalize(workflowType)
  const group = WORKFLOW_ACTOR_ALIASES.find((aliases) => aliases.includes(normalized))
  const types = group ? [normalized, ...group] : [normalized]
  return Array.from(new Set(types.filter(Boolean)))
}

function normalize(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function normalizeId(value: unknown): string {
  return String(value || '').trim()
}

function toRecord(row: any): WorkflowActorDefaultRecord {
  return {
    id: String(row.id),
    orgTenantId: String(row.org_tenant_id),
    workflowType: String(row.workflow_type),
    stageAction: String(row.stage_action),
    defaultRole: row.default_role ? String(row.default_role) : undefined,
    defaultUserId: row.default_user_id ? String(row.default_user_id) : undefined,
    defaultWalletTenantId: row.default_wallet_tenant_id ? String(row.default_wallet_tenant_id) : undefined,
    additionalUserIds: parseUserIds(row.additional_user_ids),
    enabled: Number(row.enabled || 0) === 1,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function parseUserIds(value: unknown): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(String(value))
    return Array.isArray(parsed) ? Array.from(new Set(parsed.map((id) => normalizeId(String(id))).filter(Boolean))) : []
  } catch {
    return []
  }
}

function findMemberByRole(db: Db, orgTenantId: string, roles: string[]): OrgMemberActor | undefined {
  if (roles.length === 0) return undefined

  const normalizedRoles = roles.map((r) => normalize(r)).filter(Boolean)
  for (const role of normalizedRoles) {
    const row = db
      .prepare(
        `
      SELECT m.user_id as userId,
             m.role as role,
             m.status as status,
             m.updated_at as updatedAt,
             u.tenant_id as walletTenantId
      FROM org_memberships m
      LEFT JOIN ssi_users u ON u.id = m.user_id
      WHERE m.org_tenant_id = ?
        AND m.status = 'active'
        AND LOWER(m.role) = ?
      ORDER BY datetime(m.updated_at) DESC
      LIMIT 1
    `,
      )
      .get(orgTenantId, role) as OrgMemberActor | undefined

    if (row?.walletTenantId) {
      return row
    }
  }

  return undefined
}

/** Every active member holding one of the roles, newest membership first. */
function listMembersByRole(db: Db, orgTenantId: string, roles: string[]): OrgMemberActor[] {
  const normalizedRoles = roles.map((r) => normalize(r)).filter(Boolean)
  if (normalizedRoles.length === 0) return []
  const rows = db
    .prepare(
      `
      SELECT m.user_id as userId,
             m.role as role,
             m.status as status,
             m.updated_at as updatedAt,
             u.tenant_id as walletTenantId
      FROM org_memberships m
      LEFT JOIN ssi_users u ON u.id = m.user_id
      WHERE m.org_tenant_id = ?
        AND m.status = 'active'
        AND LOWER(m.role) IN (${normalizedRoles.map(() => '?').join(', ')})
      ORDER BY datetime(m.updated_at) DESC
    `,
    )
    .all(orgTenantId, ...normalizedRoles) as OrgMemberActor[]
  return rows.filter((row) => Boolean(row?.walletTenantId))
}

function findMemberByUserId(db: Db, orgTenantId: string, userId: string): OrgMemberActor | undefined {
  if (!userId) return undefined
  return db
    .prepare(
      `
      SELECT m.user_id as userId,
             m.role as role,
             m.status as status,
             m.updated_at as updatedAt,
             u.tenant_id as walletTenantId
      FROM org_memberships m
      LEFT JOIN ssi_users u ON u.id = m.user_id
      WHERE m.org_tenant_id = ?
        AND m.user_id = ?
        AND m.status = 'active'
      LIMIT 1
    `,
    )
    .get(orgTenantId, userId) as OrgMemberActor | undefined
}

/** Walk an org-defined chain and return the first entry that resolves to a wallet. */
function resolveChain(
  db: Db,
  orgTenantId: string,
  chain: ActorFallbackEntry[],
): (Omit<ResolvedOrgWorkflowActor, 'mode'> & { via: ActorFallbackEntry }) | undefined {
  for (const entry of chain) {
    const value = normalizeId(entry.value)
    if (!value) continue
    if (entry.type === 'user') {
      const member = findMemberByUserId(db, orgTenantId, value)
      if (member?.walletTenantId) {
        return {
          userId: member.userId,
          walletTenantId: member.walletTenantId,
          role: normalize(member.role) || 'member',
          via: entry,
        }
      }
    } else if (entry.type === 'role') {
      const member = findMemberByRole(db, orgTenantId, [value])
      if (member?.walletTenantId) {
        return {
          userId: member.userId,
          walletTenantId: member.walletTenantId,
          role: normalize(member.role) || normalize(value),
          via: entry,
        }
      }
    } else if (entry.type === 'wallet') {
      return { walletTenantId: value, role: normalize(entry.label) || 'member', via: entry }
    }
  }
  return undefined
}

function sanitizeSignGroups(input: unknown): Record<string, StageSignMode> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  const out: Record<string, StageSignMode> = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const normalized = normalize(key)
    if (normalized !== REQUISITION_APPROVAL_SIGN_GROUP) continue
    if (value === 'one' || value === 'both') out[normalized] = value
  }
  return out
}

function sanitizeChain(input: unknown): ActorFallbackEntry[] {
  if (!Array.isArray(input)) return []
  const out: ActorFallbackEntry[] = []
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const type = normalize((raw as any).type)
    const value = type === 'role' ? normalize((raw as any).value) : normalizeId((raw as any).value)
    if (!value || (type !== 'user' && type !== 'role' && type !== 'wallet')) continue
    const label = (raw as any).label ? String((raw as any).label).slice(0, 120) : undefined
    if (out.some((entry) => entry.type === type && entry.value === value)) continue
    out.push(label ? { type, value, label } : { type, value })
  }
  return out.slice(0, 20)
}

function parsePolicy(
  orgTenantId: string,
  row: { policy_json?: string; updated_at?: string } | undefined,
): OrgWorkflowActorPolicy {
  let parsed: any = {}
  if (row?.policy_json) {
    try {
      parsed = JSON.parse(row.policy_json) || {}
    } catch {
      parsed = {}
    }
  }
  const stageChains: Record<string, ActorFallbackEntry[]> = {}
  if (parsed.stageChains && typeof parsed.stageChains === 'object') {
    for (const [stage, chain] of Object.entries(parsed.stageChains)) {
      const key = normalize(stage)
      const sanitized = sanitizeChain(chain)
      if (key && sanitized.length > 0) stageChains[key] = sanitized
    }
  }
  return {
    orgTenantId,
    stageChains,
    defaultChain: sanitizeChain(parsed.defaultChain),
    useBuiltInRoleFallbacks:
      typeof parsed.useBuiltInRoleFallbacks === 'boolean'
        ? parsed.useBuiltInRoleFallbacks
        : DEFAULT_ACTOR_POLICY.useBuiltInRoleFallbacks,
    ownerFallbackEnabled:
      typeof parsed.ownerFallbackEnabled === 'boolean'
        ? parsed.ownerFallbackEnabled
        : DEFAULT_ACTOR_POLICY.ownerFallbackEnabled,
    signGroups: sanitizeSignGroups(parsed.signGroups),
    updatedAt: row?.updated_at ? String(row.updated_at) : undefined,
  }
}

export class OrgWorkflowActorService {
  private get db(): Db {
    return DatabaseManager.getDatabase()
  }

  // ---------------------------------------------------------------------------
  // Fallback policy
  // ---------------------------------------------------------------------------

  public getPolicy(orgTenantId: string): OrgWorkflowActorPolicy {
    const normalizedOrg = normalizeId(orgTenantId)
    let row: any
    try {
      row = this.db
        .prepare('SELECT policy_json, updated_at FROM org_workflow_actor_policies WHERE org_tenant_id = ? LIMIT 1')
        .get(normalizedOrg)
    } catch {
      row = undefined
    }
    return parsePolicy(normalizedOrg, row)
  }

  /** Merge a partial policy into the stored one. Chains are replaced wholesale, flags individually. */
  public savePolicy(orgTenantId: string, patch: OrgWorkflowActorPolicyPatch): OrgWorkflowActorPolicy {
    const normalizedOrg = normalizeId(orgTenantId)
    const current = this.getPolicy(normalizedOrg)

    const next: Omit<OrgWorkflowActorPolicy, 'orgTenantId' | 'updatedAt'> = {
      stageChains: { ...current.stageChains },
      defaultChain: patch.defaultChain !== undefined ? sanitizeChain(patch.defaultChain) : current.defaultChain,
      useBuiltInRoleFallbacks:
        typeof patch.useBuiltInRoleFallbacks === 'boolean'
          ? patch.useBuiltInRoleFallbacks
          : current.useBuiltInRoleFallbacks,
      ownerFallbackEnabled:
        typeof patch.ownerFallbackEnabled === 'boolean' ? patch.ownerFallbackEnabled : current.ownerFallbackEnabled,
      signGroups: { ...current.signGroups, ...sanitizeSignGroups(patch.signGroups) },
    }
    if (patch.stageChains && typeof patch.stageChains === 'object') {
      for (const [stage, chain] of Object.entries(patch.stageChains)) {
        const key = normalize(stage)
        if (!key) continue
        const sanitized = sanitizeChain(chain)
        if (sanitized.length === 0) delete next.stageChains[key]
        else next.stageChains[key] = sanitized
      }
    }

    const now = new Date().toISOString()
    this.db
      .prepare(
        `
      INSERT INTO org_workflow_actor_policies (org_tenant_id, policy_json, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(org_tenant_id) DO UPDATE SET policy_json = excluded.policy_json, updated_at = excluded.updated_at
    `,
      )
      .run(normalizedOrg, JSON.stringify(next), now, now)

    return { orgTenantId: normalizedOrg, ...next, updatedAt: now }
  }

  /**
   * Apply a ready-made setup: role defaults for the purchase-request steps, plus whether
   * one confirmation or two separate confirmations are required.
   */
  public applyPreset(orgTenantId: string, presetId: string): ActorPreset {
    const preset = ACTOR_PRESETS.find((item) => item.id === normalize(presetId))
    if (!preset) {
      throw new Error('Unknown setup')
    }
    this.savePolicy(orgTenantId, { signGroups: { [preset.signGroup]: preset.signMode } })
    for (const [stageAction, role] of Object.entries(preset.roles)) {
      this.upsertDefault({
        orgTenantId,
        workflowType: preset.workflowType,
        stageAction,
        defaultRole: role,
      })
    }
    return preset
  }

  /**
   * Role keys an admin can pick as a stage default or fallback entry: membership roles in use,
   * organization roles defined in setup (slugified), and the platform's built-in stage roles.
   */
  public listRoleOptions(orgTenantId: string): string[] {
    const normalizedOrg = normalizeId(orgTenantId)
    const roles = new Set<string>(OWNER_FALLBACK)
    try {
      const membershipRoles = this.db
        .prepare(
          `SELECT DISTINCT LOWER(role) as role FROM org_memberships WHERE org_tenant_id = ? AND status = 'active'`,
        )
        .all(normalizedOrg) as Array<{ role: string }>
      membershipRoles.forEach((row) => row.role && roles.add(normalize(row.role)))
    } catch {
      // membership table missing in minimal deployments
    }
    try {
      const orgRoles = this.db
        .prepare(
          `SELECT r.name as name FROM roles r JOIN organizations o ON o.id = r.organization_id WHERE o.tenant_id = ?`,
        )
        .all(normalizedOrg) as Array<{ name: string }>
      orgRoles.forEach((row) => {
        const slug = normalize(row.name)
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '')
        if (slug) roles.add(slug)
      })
    } catch {
      // platform org tables missing
    }
    Object.values(ROLE_FALLBACK_BY_STAGE_ACTION).forEach((list) => list.forEach((role) => roles.add(role)))
    return Array.from(roles).sort()
  }

  /** Remove a stage default so the fallback policy applies again. */
  public deleteDefault(orgTenantId: string, workflowType: string, stageAction: string): boolean {
    const candidates = workflowActorTypeCandidates(workflowType)
    const result = this.db
      .prepare(
        `
      DELETE FROM org_workflow_actor_defaults
      WHERE org_tenant_id = ?
        AND workflow_type IN (${candidates.map(() => '?').join(', ')})
        AND stage_action = ?
    `,
      )
      .run(normalizeId(orgTenantId), ...candidates, normalize(stageAction))
    return Number(result.changes || 0) > 0
  }

  public listDefaults(orgTenantId: string, workflowType?: string): WorkflowActorDefaultRecord[] {
    const normalizedOrg = normalizeId(orgTenantId)
    const normalizedWorkflow = normalize(workflowType)
    const candidates = normalizedWorkflow ? workflowActorTypeCandidates(normalizedWorkflow) : []
    const rows = normalizedWorkflow
      ? this.db
          .prepare(
            `
          SELECT *
          FROM org_workflow_actor_defaults
          WHERE org_tenant_id = ?
            AND workflow_type IN (${candidates.map(() => '?').join(', ')})
          ORDER BY stage_action ASC
        `,
          )
          .all(normalizedOrg, ...candidates)
      : this.db
          .prepare(
            `
          SELECT *
          FROM org_workflow_actor_defaults
          WHERE org_tenant_id = ?
          ORDER BY workflow_type ASC, stage_action ASC
        `,
          )
          .all(normalizedOrg)

    return rows.map((row: any) => toRecord(row))
  }

  public listOrgMembers(orgTenantId: string): OrgMemberActor[] {
    const rows = this.db
      .prepare(
        `
      SELECT m.user_id as userId,
             m.role as role,
             m.status as status,
             m.updated_at as updatedAt,
             u.tenant_id as walletTenantId,
             (
               SELECT c.name FROM org_contacts c
               WHERE c.org_tenant_id = m.org_tenant_id AND c.wallet_tenant_id = u.tenant_id
                 AND c.name IS NOT NULL AND c.name != ''
               ORDER BY CASE WHEN c.contact_scope = 'internal' THEN 0 ELSE 1 END
               LIMIT 1
             ) as displayName,
             (
               SELECT c.phone FROM org_contacts c
               WHERE c.org_tenant_id = m.org_tenant_id AND c.wallet_tenant_id = u.tenant_id
                 AND c.phone IS NOT NULL AND c.phone != ''
               ORDER BY CASE WHEN c.contact_scope = 'internal' THEN 0 ELSE 1 END
               LIMIT 1
             ) as phone
      FROM org_memberships m
      LEFT JOIN ssi_users u ON u.id = m.user_id
      WHERE m.org_tenant_id = ?
        AND m.status = 'active'
      ORDER BY
        CASE LOWER(m.role)
          WHEN 'owner' THEN 1
          WHEN 'admin' THEN 2
          WHEN 'approver' THEN 3
          WHEN 'manager' THEN 4
          WHEN 'finance_manager' THEN 5
          WHEN 'accountant' THEN 6
          WHEN 'issuer' THEN 7
          ELSE 99
        END,
        datetime(m.updated_at) DESC
    `,
      )
      .all(normalizeId(orgTenantId))

    return rows.map((row: any) => ({
      userId: String(row.userId),
      role: String(row.role),
      status: String(row.status),
      walletTenantId: row.walletTenantId ? String(row.walletTenantId) : undefined,
      updatedAt: row.updatedAt ? String(row.updatedAt) : undefined,
      displayName: row.displayName ? String(row.displayName) : undefined,
      phone: row.phone ? String(row.phone) : undefined,
    }))
  }

  public upsertDefault(params: {
    orgTenantId: string
    workflowType: string
    stageAction: string
    defaultRole?: string
    defaultUserId?: string
    defaultWalletTenantId?: string
    /** Other people who may also act. Left out keeps the saved list; [] clears it. */
    additionalUserIds?: string[]
    enabled?: boolean
  }): WorkflowActorDefaultRecord {
    const orgTenantId = normalizeId(params.orgTenantId)
    const workflowType = normalize(params.workflowType)
    const stageAction = normalize(params.stageAction)

    const now = new Date().toISOString()
    const existing = this.db
      .prepare(
        `
      SELECT id
      FROM org_workflow_actor_defaults
      WHERE org_tenant_id = ?
        AND workflow_type = ?
        AND stage_action = ?
      LIMIT 1
    `,
      )
      .get(orgTenantId, workflowType, stageAction) as { id: string } | undefined

    const defaultRole = params.defaultRole ? normalize(params.defaultRole) : null
    const defaultUserId = params.defaultUserId ? normalizeId(params.defaultUserId) : null
    const defaultWalletTenantId = params.defaultWalletTenantId ? normalizeId(params.defaultWalletTenantId) : null
    const enabled = params.enabled === false ? 0 : 1
    const additional = params.additionalUserIds
      ? Array.from(new Set(params.additionalUserIds.map((id) => normalizeId(id)).filter(Boolean))).filter(
          (id) => id !== defaultUserId,
        )
      : undefined
    const additionalJson = additional === undefined ? undefined : additional.length ? JSON.stringify(additional) : null

    if (existing?.id) {
      this.db
        .prepare(
          `
        UPDATE org_workflow_actor_defaults
        SET default_role = ?,
            default_user_id = ?,
            default_wallet_tenant_id = ?,
            additional_user_ids = CASE WHEN ? = 1 THEN ? ELSE additional_user_ids END,
            enabled = ?,
            updated_at = ?
        WHERE id = ?
      `,
        )
        .run(
          defaultRole,
          defaultUserId,
          defaultWalletTenantId,
          additionalJson === undefined ? 0 : 1,
          additionalJson ?? null,
          enabled,
          now,
          existing.id,
        )

      const updated = this.db.prepare('SELECT * FROM org_workflow_actor_defaults WHERE id = ? LIMIT 1').get(existing.id)
      return toRecord(updated)
    }

    const id = `owad-${randomUUID().slice(0, 12)}`
    this.db
      .prepare(
        `
      INSERT INTO org_workflow_actor_defaults (
        id, org_tenant_id, workflow_type, stage_action,
        default_role, default_user_id, default_wallet_tenant_id, additional_user_ids,
        enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        id,
        orgTenantId,
        workflowType,
        stageAction,
        defaultRole,
        defaultUserId,
        defaultWalletTenantId,
        additionalJson ?? null,
        enabled,
        now,
        now,
      )

    const created = this.db.prepare('SELECT * FROM org_workflow_actor_defaults WHERE id = ? LIMIT 1').get(id)
    return toRecord(created)
  }

  public resolveActor(input: ResolveOrgWorkflowActorInput): ResolvedOrgWorkflowActor {
    const orgTenantId = normalizeId(input.orgTenantId)
    const workflowType = normalize(input.workflowType)
    const stageAction = normalize(input.stageAction)

    const configured = this.resolveConfigured(orgTenantId, workflowType, stageAction)
    // A borrowed money step (job payment, supplier payment, and the rest) may name a person.
    // A role with nobody named is not an override: use who releases the money, then If nobody is chosen.
    const unnamedRole =
      configured?.mode === 'configured_role' && OrgWorkflowActorService.borrowedMoneyStep(workflowType, stageAction)
    if (configured && !unnamedRole) return configured

    // Money steps borrow the purchase-request setup unless this workflow set its own person.
    const sharedStage = SHARED_FINANCE_STAGES[stageAction]
    if (sharedStage && !workflowActorTypeCandidates(workflowType).includes(SHARED_FINANCE_WORKFLOW_TYPE)) {
      const shared = this.resolveConfigured(orgTenantId, SHARED_FINANCE_WORKFLOW_TYPE, sharedStage)
      if (shared) return { ...shared, mode: 'shared_finance' }
    }

    // Organization-defined fallback chains: per stage first, then org-wide.
    const policy = this.getPolicy(orgTenantId)
    const stageChain = policy.stageChains[stageAction] || []
    const byPolicy = resolveChain(this.db, orgTenantId, [...stageChain, ...policy.defaultChain])
    if (byPolicy) {
      return { ...byPolicy, mode: 'policy_fallback' }
    }

    if (policy.useBuiltInRoleFallbacks) {
      const roleFallback = roleFallbackFor(workflowType, stageAction)
      const byFallbackRole = findMemberByRole(this.db, orgTenantId, roleFallback)
      if (byFallbackRole?.walletTenantId) {
        return {
          userId: byFallbackRole.userId,
          walletTenantId: byFallbackRole.walletTenantId,
          role: normalize(byFallbackRole.role) || 'member',
          mode: 'role_fallback',
        }
      }
    }

    if (!policy.ownerFallbackEnabled) {
      return { role: 'unassigned', mode: 'unassigned' }
    }

    const ownerFallback = findMemberByRole(this.db, orgTenantId, OWNER_FALLBACK)
    if (ownerFallback?.walletTenantId) {
      return {
        userId: ownerFallback.userId,
        walletTenantId: ownerFallback.walletTenantId,
        role: normalize(ownerFallback.role) || 'owner',
        mode: 'owner_fallback',
      }
    }

    return {
      role: 'owner',
      mode: 'owner_fallback',
    }
  }

  /**
   * The other people in the same role who may also act on a step.
   *
   * When a step falls to a role — the built-in role order, a role entry in a backup list, a
   * role default, or the owner stand-in — the organisation meant "a supervisor" / "an owner",
   * not one person. Every active member with that role then gets the inbox card and the step
   * on their staff card, so whichever of them is on duty can finish it. Owner and admin count
   * as one role. A step that names a specific person stays with that person.
   */
  public roleStandIns(orgTenantId: string, resolved: ResolvedOrgWorkflowActor): OrgMemberActor[] {
    const org = normalizeId(orgTenantId)
    const role = normalize(resolved.role)
    const byRole =
      OrgWorkflowActorService.resolvedByRole(resolved) && role
        ? listMembersByRole(this.db, org, OWNER_FALLBACK.includes(role) ? OWNER_FALLBACK : [role])
        : []
    // People the organisation named for the step alongside the first one.
    const named = (resolved.coActorUserIds || [])
      .map((userId) => findMemberByUserId(this.db, org, userId))
      .filter((member): member is OrgMemberActor => Boolean(member?.walletTenantId))
    const seen = new Set<string>([String(resolved.userId || '')])
    return [...named, ...byRole].filter((member) => {
      if (seen.has(member.userId)) return false
      seen.add(member.userId)
      return true
    })
  }

  /** True when this member is one of the people the organisation named for the stage. */
  public isNamedActor(input: ResolveOrgWorkflowActorInput & { userId: string }): boolean {
    const userId = normalizeId(input.userId)
    if (!userId) return false
    const resolved = this.resolveActor(input)
    if ((resolved.coActorUserIds || []).some((id) => normalizeId(id) === userId)) return true
    // Fallbacks to a role, the built-in order or the owner are not a person the organisation chose.
    if (OrgWorkflowActorService.resolvedByRole(resolved) || OrgWorkflowActorService.needsAssignment(resolved)) {
      return false
    }
    if (resolved.userId && normalizeId(resolved.userId) === userId) return true
    const member = findMemberByUserId(this.db, normalizeId(input.orgTenantId), userId)
    return Boolean(resolved.walletTenantId && member?.walletTenantId === resolved.walletTenantId)
  }

  /** @deprecated use roleStandIns — kept for callers that only knew about owners. */
  public ownerStandIns(orgTenantId: string, resolved: ResolvedOrgWorkflowActor): OrgMemberActor[] {
    return this.roleStandIns(orgTenantId, resolved)
  }

  /**
   * May this member finish the step? One answer for the inbox, the finishing endpoints and
   * the wallet-proof check, so a person is never offered a step they cannot finish:
   *  - named: this job names them for the step (for example the sign-off person chosen when
   *    the job was created, or the worker assigned to it);
   *  - configured: they are the person the organisation chose for the step;
   *  - role: the step belongs to a role and they hold it (supervisor, owner, …);
   *  - admin: an owner or admin standing in.
   */
  public mayAct(input: ResolveOrgWorkflowActorInput & { userId: string; namedUserId?: string }): {
    allowed: boolean
    why?: 'named' | 'configured' | 'role' | 'admin'
  } {
    const userId = normalizeId(input.userId)
    if (!userId) return { allowed: false }
    const named = normalizeId(input.namedUserId)
    if (named && named === userId) return { allowed: true, why: 'named' }
    const resolved = this.resolveActor(input)
    if (resolved.userId && normalizeId(resolved.userId) === userId) {
      return { allowed: true, why: OrgWorkflowActorService.resolvedByRole(resolved) ? 'role' : 'configured' }
    }
    const member = findMemberByUserId(this.db, normalizeId(input.orgTenantId), userId)
    if (resolved.walletTenantId && member?.walletTenantId === resolved.walletTenantId) {
      return { allowed: true, why: 'configured' }
    }
    if ((resolved.coActorUserIds || []).some((id) => normalizeId(id) === userId) && member) {
      return { allowed: true, why: 'configured' }
    }
    if (this.roleStandIns(input.orgTenantId, resolved).some((member) => normalizeId(member.userId) === userId)) {
      return { allowed: true, why: 'role' }
    }
    if (member && OWNER_FALLBACK.includes(normalize(member.role))) return { allowed: true, why: 'admin' }
    return { allowed: false }
  }

  /** True when the step was resolved through a role rather than a chosen person or wallet. */
  public static resolvedByRole(resolved: Pick<ResolvedOrgWorkflowActor, 'mode' | 'via'>): boolean {
    if (
      resolved.mode === 'owner_fallback' ||
      resolved.mode === 'role_fallback' ||
      resolved.mode === 'configured_role'
    ) {
      return true
    }
    // A backup-list role entry, or a role default borrowed from the purchase-request money setup.
    return (resolved.mode === 'policy_fallback' || resolved.mode === 'shared_finance') && resolved.via?.type === 'role'
  }

  /** The explicit setting for a stage (person, wallet or role), or undefined when none is saved. */
  /** The saved row for a stage. Exact workflow type wins; otherwise any alias in the same group applies. */
  private configuredRow(orgTenantId: string, workflowType: string, stageAction: string): any | undefined {
    const candidates = workflowActorTypeCandidates(workflowType)
    return this.db
      .prepare(
        `
      SELECT *
      FROM org_workflow_actor_defaults
      WHERE org_tenant_id = ?
        AND workflow_type IN (${candidates.map(() => '?').join(', ')})
        AND stage_action = ?
        AND enabled = 1
      ORDER BY CASE WHEN workflow_type = ? THEN 0 ELSE 1 END, datetime(updated_at) DESC
      LIMIT 1
    `,
      )
      .get(orgTenantId, ...candidates, stageAction, workflowType) as any | undefined
  }

  /**
   * The role chosen for a stage (its own, or the purchase-request money role it borrows) when
   * nobody on the team holds that role yet. Undefined when a person is named or the role is filled.
   */
  public chosenRoleWithoutMember(input: ResolveOrgWorkflowActorInput): string | undefined {
    const orgTenantId = normalizeId(input.orgTenantId)
    const workflowType = normalize(input.workflowType)
    const stageAction = normalize(input.stageAction)
    const own = this.configuredRow(orgTenantId, workflowType, stageAction)
    const sharedStage = SHARED_FINANCE_STAGES[stageAction]
    const row =
      own?.default_role || own?.default_user_id || own?.default_wallet_tenant_id || !sharedStage
        ? own
        : this.configuredRow(orgTenantId, SHARED_FINANCE_WORKFLOW_TYPE, sharedStage)
    const role = row?.default_role ? normalize(row.default_role) : ''
    if (!role || row.default_user_id || row.default_wallet_tenant_id) return undefined
    return findMemberByRole(this.db, orgTenantId, [role])?.walletTenantId ? undefined : role
  }

  private resolveConfigured(
    orgTenantId: string,
    workflowType: string,
    stageAction: string,
  ): ResolvedOrgWorkflowActor | undefined {
    const config = this.configuredRow(orgTenantId, workflowType, stageAction)

    if (config) {
      const defaultUserId = config.default_user_id ? normalizeId(config.default_user_id) : ''
      // Everyone named for the step, first choice first. The first active one leads; the rest act too.
      const namedMembers = [defaultUserId, ...parseUserIds(config.additional_user_ids)]
        .filter(Boolean)
        .filter((id, index, all) => all.indexOf(id) === index)
        .map((id) => findMemberByUserId(this.db, orgTenantId, id))
        .filter((member): member is OrgMemberActor => Boolean(member?.walletTenantId))
      const coActorUserIds = (lead?: string) =>
        namedMembers.map((member) => member.userId).filter((id) => id !== lead)
      const userMember = namedMembers[0]
      if (userMember) {
        const others = coActorUserIds(userMember.userId)
        return {
          userId: userMember.userId,
          walletTenantId: userMember.walletTenantId,
          role: normalize(userMember.role) || normalize(config.default_role) || 'member',
          mode: 'configured_user',
          ...(others.length ? { coActorUserIds: others } : {}),
        }
      }

      const defaultWalletTenantId = config.default_wallet_tenant_id ? normalizeId(config.default_wallet_tenant_id) : ''
      if (defaultWalletTenantId) {
        return {
          walletTenantId: defaultWalletTenantId,
          role: normalize(config.default_role) || 'member',
          mode: 'configured_wallet',
        }
      }

      const defaultRole = config.default_role ? normalize(config.default_role) : ''
      if (defaultRole) {
        const byRole = findMemberByRole(this.db, orgTenantId, [defaultRole])
        if (byRole?.walletTenantId) {
          return {
            userId: byRole.userId,
            walletTenantId: byRole.walletTenantId,
            role: normalize(byRole.role) || defaultRole,
            mode: 'configured_role',
            // Remember it was the role that was chosen, so borrowed (shared finance) results keep that.
            via: { type: 'role', value: defaultRole },
            ...(coActorUserIds(byRole.userId).length ? { coActorUserIds: coActorUserIds(byRole.userId) } : {}),
          }
        }
      }
    }

    return undefined
  }

  /** True when the stage would fall back to the owner or has nobody at all — i.e. needs setup. */
  public static needsAssignment(actor: Pick<ResolvedOrgWorkflowActor, 'mode'>): boolean {
    return actor.mode === 'owner_fallback' || actor.mode === 'unassigned'
  }

  /** Approving, releasing, recording or receipting money. These share the purchase-request people. */
  public static isMoneyStage(stageAction: string): boolean {
    return Object.prototype.hasOwnProperty.call(SHARED_FINANCE_STAGES, normalize(stageAction))
  }

  /**
   * A money step on a workflow other than purchase requests. It uses the purchase-request
   * person unless this workflow names its own person. A role alone is not that person.
   */
  public static borrowedMoneyStep(workflowType: string, stageAction: string): boolean {
    if (!OrgWorkflowActorService.isMoneyStage(stageAction)) return false
    return !workflowActorTypeCandidates(workflowType).includes(SHARED_FINANCE_WORKFLOW_TYPE)
  }
}

/** Human-readable explanation of a resolution mode, shared by API responses and inbox notes. */
export function describeActorMode(mode: OrgWorkflowActorMode | string): string {
  switch (mode) {
    case 'configured_user':
      return 'Chosen person'
    case 'configured_wallet':
      return 'Chosen wallet'
    case 'configured_role':
      return 'Chosen role'
    case 'shared_finance':
      return 'Same as purchase requests'
    case 'policy_fallback':
      return 'From your backup list'
    case 'role_fallback':
      return 'From the usual role'
    case 'owner_fallback':
      return 'Owner is standing in'
    case 'unassigned':
      return 'Nobody chosen'
    default:
      return String(mode || 'unknown')
  }
}

export const orgWorkflowActorService = new OrgWorkflowActorService()
