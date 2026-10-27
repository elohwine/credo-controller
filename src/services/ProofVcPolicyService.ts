import { isStageAction } from '../config/requestExperience'
import { DELEGATION_VC_TYPE } from '../config/credentials/DelegationVC'
import { EMPLOYEE_VC_TYPE } from '../config/credentials/EmployeeVC'
import { ORG_WORKFLOW_ACTOR_VC_TYPE } from '../config/credentials/OrgWorkflowActorVC'
import { PLATFORM_IDENTITY_VC_TYPE } from '../config/credentials/PlatformIdentityVC'
import { DatabaseManager } from '../persistence/DatabaseManager'
import {
  type DeviceTrustPolicy,
  defaultDeviceTrustPolicy,
  deviceTrustRequired,
  parseDeviceTrust,
} from './DeviceTrustService'

import { orgWorkflowActorService } from './OrgWorkflowActorService'
import { TEMPLATE_PREREQUISITES } from './workflow/prerequisites'

/** The proof steps the platform ships with; each one maps to a stage action below. */
export type KnownProofVcActionKey =
  | 'requisition_approval'
  | 'requisition_release'
  | 'requisition_ack'
  | 'ap_workflow_proof'
  | 'payment_record'
  | 'field_assignment'
  | 'hr_onboarding'
  | 'payslip_issue'
  | 'receipt_issue'
  | 'field_ack'
  | 'field_payout'

/**
 * A step a template declared for itself gets its own key, `stage:<step>`, so the organisation can
 * name the cards it accepts for that step exactly as it does for a built-in one.
 */
export type DerivedProofVcActionKey = `stage:${string}`

export type ProofVcActionKey = KnownProofVcActionKey | DerivedProofVcActionKey

export interface OrgProofVcPolicy {
  orgTenantId: string
  defaultAcceptedVcTypes: string[]
  actionOverrides: Record<string, string[]>
  deviceTrust: DeviceTrustPolicy
  createdAt?: string
  updatedAt?: string
}

export interface OrgProofVcPolicyUpdate {
  defaultAcceptedVcTypes?: string[]
  actionOverrides?: Record<string, string[]>
  deviceTrust?: DeviceTrustPolicy
}

const DEFAULT_POLICY_TYPES = [PLATFORM_IDENTITY_VC_TYPE]
const WORKFLOW_REQUEST_APPROVAL_VC_TYPE = 'WorkflowRequestApproval'

const PROOF_VC_HINT_KEYS = [
  'acceptedProofVcTypes',
  'proofVcTypes',
  'inputVcTypes',
  'inputVCs',
  'requiredVcTypes',
  'requiredVCs',
] as const

const ACTION_STAGE_MAP: Record<KnownProofVcActionKey, string> = {
  requisition_approval: 'approve_requisition',
  requisition_release: 'release_funds',
  requisition_ack: 'acknowledge_execution',
  ap_workflow_proof: 'approve_requisition',
  payment_record: 'record_payment',
  field_assignment: 'assign_field_worker',
  hr_onboarding: 'approve_onboarding',
  payslip_issue: 'issue_payslip',
  receipt_issue: 'issue_receipt_vc',
  field_ack: 'acknowledge_execution',
  field_payout: 'trigger_payout',
}

/**
 * Legacy explicit candidates kept for backwards compatibility. The primary source
 * is now the prerequisite registry: any template that declares a `stage_actor`
 * prerequisite for the action's stage is a candidate for that action.
 */
const LEGACY_ACTION_WORKFLOW_CANDIDATES: Record<KnownProofVcActionKey, string[]> = {
  requisition_approval: ['internal_requisitions', 'requisition_workflow', 'internal_requisition_approval'],
  requisition_release: ['internal_requisitions', 'requisition_workflow', 'internal_requisition_approval'],
  requisition_ack: ['internal_requisitions', 'requisition_workflow', 'internal_requisition_approval'],
  ap_workflow_proof: ['accounts_receivable', 'ap_trust_workflow', 'accounts_payable', 'ap_payables'],
  payment_record: [],
  field_assignment: [],
  hr_onboarding: [],
  payslip_issue: [],
  receipt_issue: [],
  field_ack: ['field_execution_fept', 'tpl-fept-field-execution'],
  field_payout: ['field_execution_fept', 'tpl-fept-field-execution'],
}

function resolveActionWorkflowCandidates(actionKey: ProofVcActionKey): string[] {
  const stageAction = stageActionForProofAction(actionKey)
  const candidates = new Set<string>(LEGACY_ACTION_WORKFLOW_CANDIDATES[actionKey as KnownProofVcActionKey] || [])
  for (const [templateRef, prerequisites] of Object.entries(TEMPLATE_PREREQUISITES)) {
    if (
      prerequisites.some((entry) => entry.key === 'stage_actor' && normalizeStage(entry.stageAction) === stageAction)
    ) {
      candidates.add(templateRef.toLowerCase())
    }
  }
  return Array.from(candidates)
}

function normalizeStage(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function uniqueVcTypes(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return [...new Set(input.map((entry) => String(entry || '').trim()).filter((entry) => entry.length > 0))]
}

function withPlatformFallback(vcTypes: string[]): string[] {
  const merged = [...vcTypes]
  if (!merged.includes(PLATFORM_IDENTITY_VC_TYPE)) {
    merged.push(PLATFORM_IDENTITY_VC_TYPE)
  }
  return [...new Set(merged)]
}

function parseActionOverrides(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const entries = Object.entries(raw as Record<string, unknown>)
  const normalized: Record<string, string[]> = {}
  for (const [actionKey, value] of entries) {
    normalized[actionKey] = withPlatformFallback(uniqueVcTypes(value))
  }
  return normalized
}

function parseJsonObject(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // ignore malformed legacy payloads
  }
  return {}
}

function parseJsonArray(raw: string | null | undefined): unknown[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed
    }
  } catch {
    // ignore malformed legacy payloads
  }
  return []
}

function readPolicyHintArray(policy: Record<string, unknown>, key: string): string[] {
  const candidate = policy[key]
  return uniqueVcTypes(Array.isArray(candidate) ? candidate : [])
}

function resolveTemplatePolicyTypes(orgTenantId: string, actionKey: ProofVcActionKey): string[] {
  const db = DatabaseManager.getDatabase()
  const workflowCandidates = resolveActionWorkflowCandidates(actionKey)

  // Configured templates are consulted regardless of the legacy `enabled` flag:
  // readiness (prerequisites) decides whether a workflow is operational.
  const rows = db
    .prepare(
      `
      SELECT id, workflow_type as workflowType, credential_policy as credentialPolicy
      FROM workflow_templates
      WHERE tenant_id = ?
      ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC
    `,
    )
    .all(orgTenantId) as Array<{ id: string; workflowType: string; credentialPolicy: string | null }>

  const templateRows = rows.filter(
    (row) =>
      workflowCandidates.includes(String(row.workflowType || '').toLowerCase()) ||
      workflowCandidates.includes(String(row.id || '').toLowerCase()),
  )
  if (templateRows.length === 0) return []

  const resolved = new Set<string>()
  for (const row of templateRows) {
    const policy = parseJsonObject(row.credentialPolicy)
    for (const key of PROOF_VC_HINT_KEYS) {
      for (const vcType of readPolicyHintArray(policy, key)) {
        resolved.add(vcType)
      }
    }
  }

  return Array.from(resolved)
}

/**
 * True when the organization has an explicit actor for the action's stage — either a saved
 * stage default or a match in its own fallback policy (per-stage / org-wide chain). Built-in
 * role order and owner fallback do not count: nobody was *chosen*, so no actor credential is
 * offered and the stage keeps identity-only proof.
 */
function configuredWorkflowTypesForStage(orgTenantId: string, stageAction: string): string[] {
  try {
    const rows = DatabaseManager.getDatabase()
      .prepare(
        `SELECT DISTINCT workflow_type AS workflowType
         FROM org_workflow_actor_defaults
         WHERE org_tenant_id = ? AND stage_action = ? AND enabled = 1`,
      )
      .all(orgTenantId, stageAction) as Array<{ workflowType?: string }>
    return rows.map((row) => String(row.workflowType || '')).filter(Boolean)
  } catch {
    return []
  }
}

export function hasResolvedStageActor(orgTenantId: string, actionKey: ProofVcActionKey): boolean {
  const stageAction = stageActionForProofAction(actionKey)
  if (!stageAction) return false

  const workflowTypes = new Set<string>([
    ...resolveActionWorkflowCandidates(actionKey),
    ...configuredWorkflowTypesForStage(orgTenantId, stageAction),
  ])

  for (const workflowType of workflowTypes) {
    try {
      const resolved = orgWorkflowActorService.resolveActor({ orgTenantId, workflowType, stageAction })
      if (
        ['configured_user', 'configured_wallet', 'configured_role', 'shared_finance', 'policy_fallback'].includes(
          resolved.mode,
        )
      ) {
        return true
      }
      // Built-in role / owner fallbacks still name a real member of the organization. That member
      // must be able to confirm the step with their org evidence credential, otherwise the stage
      // dead-ends on a "no matching credential" error until someone edits Who does what. Readiness
      // keeps flagging the fallback as a setup item; scope is checked when the proof is verified.
      if (['role_fallback', 'owner_fallback'].includes(resolved.mode) && resolved.walletTenantId) {
        return true
      }
    } catch {
      // Resolution is best-effort here; a failing lookup must not block proof requests.
    }
  }
  return false
}

function orgHasActiveDelegation(orgTenantId: string): boolean {
  try {
    const row = DatabaseManager.getDatabase()
      .prepare(
        `
        SELECT d.id
        FROM delegations d
        JOIN organizations o ON o.id = d.organization_id
        WHERE o.tenant_id = ? AND d.status = 'active'
          AND (d.valid_until IS NULL OR d.valid_until >= ?)
        LIMIT 1
      `,
      )
      .get(orgTenantId, new Date().toISOString()) as { id?: string } | undefined
    return Boolean(row?.id)
  } catch {
    return false
  }
}

/** Every workflow the organisation could be running this step for (built-in and configured). */
export function workflowTypesForStageAction(orgTenantId: string, stageAction: string): string[] {
  const stage = normalizeStage(stageAction)
  if (!stage) return []
  const types = new Set<string>()
  for (const [actionKey, mapped] of Object.entries(ACTION_STAGE_MAP) as Array<[KnownProofVcActionKey, string]>) {
    if (mapped === stage) resolveActionWorkflowCandidates(actionKey).forEach((type) => types.add(type))
  }
  if (orgTenantId) configuredWorkflowTypesForStage(orgTenantId, stage).forEach((type) => types.add(type))
  return Array.from(types)
}

/** Stage action key (as used by actor defaults / actor credentials) for a proof action. */
export function stageActionForProofAction(actionKey: ProofVcActionKey): string {
  if (typeof actionKey === 'string' && actionKey.startsWith('stage:')) {
    return normalizeStage(actionKey.slice('stage:'.length))
  }
  return ACTION_STAGE_MAP[actionKey as KnownProofVcActionKey] || ''
}

/**
 * The proof key for a step. A step the platform ships keeps its own key, so the organisation's
 * existing policy still applies; a step a template declared for itself gets `stage:<step>`.
 *
 * Two keys can describe one step (a requisition and a job both acknowledge execution), so a
 * caller that knows its flow passes `prefer` and gets that key back.
 */
export function proofActionForStage(stageAction: unknown, prefer?: ProofVcActionKey): ProofVcActionKey | undefined {
  const stage = normalizeStage(stageAction)
  if (!isStageAction(stage)) return undefined
  if (prefer && stageActionForProofAction(prefer) === stage) return prefer
  for (const [actionKey, mapped] of Object.entries(ACTION_STAGE_MAP) as Array<[KnownProofVcActionKey, string]>) {
    if (mapped === stage) return actionKey
  }
  return `stage:${stage}`
}

/** The step a share screen is completing. Unknown values do not widen the cards that are offered. */
export function stageActionFromClientStage(stage: unknown): string {
  const key = String(stage || '')
    .trim()
    .toLowerCase()
  const named: Record<string, string> = {
    acknowledgement: 'acknowledge_execution',
    payout: 'trigger_payout',
    'field-signoff': 'acknowledge_execution',
    'field-payout': 'trigger_payout',
    'requisition-approve': 'approve_requisition',
    'requisition-release': 'release_funds',
    'requisition-ack': 'acknowledge_execution',
  }
  if (named[key]) return named[key]
  // A step the platform ships, or one a template declared for itself; anything else stays empty
  // so an unknown value never widens the cards that are offered.
  return isStageAction(key) ? key : ''
}

function readStoredPolicy(row: {
  org_tenant_id: string
  default_vc_types: string
  action_overrides: string
  device_trust?: string | null
  created_at?: string
  updated_at?: string
}): OrgProofVcPolicy {
  return {
    orgTenantId: row.org_tenant_id,
    defaultAcceptedVcTypes: withPlatformFallback(uniqueVcTypes(parseJsonArray(row.default_vc_types))),
    actionOverrides: parseActionOverrides(parseJsonObject(row.action_overrides)),
    deviceTrust: parseDeviceTrust(parseJsonObject(row.device_trust)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function getOrCreateOrgProofVcPolicy(orgTenantId: string): OrgProofVcPolicy {
  const db = DatabaseManager.getDatabase()
  const row = db
    .prepare(
      `
    SELECT org_tenant_id, default_vc_types, action_overrides, device_trust, created_at, updated_at
    FROM org_proof_vc_policies
    WHERE org_tenant_id = ?
    LIMIT 1
  `,
    )
    .get(orgTenantId) as
    | {
        org_tenant_id: string
        default_vc_types: string
        action_overrides: string
        device_trust?: string | null
        created_at?: string
        updated_at?: string
      }
    | undefined

  if (!row) {
    const now = new Date().toISOString()
    const defaultTypes = withPlatformFallback(DEFAULT_POLICY_TYPES)
    const actionOverrides: Record<string, string[]> = {}
    const deviceTrust = defaultDeviceTrustPolicy()
    db.prepare(
      `
      INSERT INTO org_proof_vc_policies (
        org_tenant_id, default_vc_types, action_overrides, device_trust, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `,
    ).run(orgTenantId, JSON.stringify(defaultTypes), JSON.stringify(actionOverrides), JSON.stringify(deviceTrust), now, now)

    return {
      orgTenantId,
      defaultAcceptedVcTypes: defaultTypes,
      actionOverrides,
      deviceTrust,
      createdAt: now,
      updatedAt: now,
    }
  }

  return readStoredPolicy(row)
}

export function updateOrgProofVcPolicy(orgTenantId: string, updates: OrgProofVcPolicyUpdate): OrgProofVcPolicy {
  const db = DatabaseManager.getDatabase()
  const current = getOrCreateOrgProofVcPolicy(orgTenantId)

  const defaultAcceptedVcTypes =
    updates.defaultAcceptedVcTypes !== undefined
      ? withPlatformFallback(uniqueVcTypes(updates.defaultAcceptedVcTypes))
      : current.defaultAcceptedVcTypes

  const actionOverrides =
    updates.actionOverrides !== undefined ? parseActionOverrides(updates.actionOverrides) : current.actionOverrides
  const deviceTrust = updates.deviceTrust !== undefined ? parseDeviceTrust(updates.deviceTrust) : current.deviceTrust

  const now = new Date().toISOString()
  db.prepare(
    `
    UPDATE org_proof_vc_policies
    SET default_vc_types = ?, action_overrides = ?, device_trust = ?, updated_at = ?
    WHERE org_tenant_id = ?
  `,
  ).run(
    JSON.stringify(defaultAcceptedVcTypes),
    JSON.stringify(actionOverrides),
    JSON.stringify(deviceTrust),
    now,
    orgTenantId,
  )

  return {
    orgTenantId,
    defaultAcceptedVcTypes,
    actionOverrides,
    deviceTrust,
    createdAt: current.createdAt,
    updatedAt: now,
  }
}

export function stageRequiresDeviceTrust(orgTenantId: string | undefined, stageAction: string): boolean {
  if (!orgTenantId || !stageAction) return false
  return deviceTrustRequired(getOrCreateOrgProofVcPolicy(orgTenantId).deviceTrust, stageAction)
}


export function resolveAcceptedProofVcTypes(orgTenantId: string | undefined, actionKey: ProofVcActionKey): string[] {
  if (!orgTenantId) {
    return withPlatformFallback(DEFAULT_POLICY_TYPES)
  }

  const policy = getOrCreateOrgProofVcPolicy(orgTenantId)
  const fromAction = Array.isArray(policy.actionOverrides[actionKey]) ? policy.actionOverrides[actionKey] : []
  const fromDefault = Array.isArray(policy.defaultAcceptedVcTypes) ? policy.defaultAcceptedVcTypes : []
  const fromTemplatePolicy = resolveTemplatePolicyTypes(orgTenantId, actionKey)

  const merged = new Set<string>([...fromDefault, ...fromTemplatePolicy, ...fromAction].filter(Boolean))

  if (hasResolvedStageActor(orgTenantId, actionKey) || orgHasActiveDelegation(orgTenantId)) {
    // The org chose who acts, or delegated that access: accept the evidence credentials offered
    // for that role. Scope is checked when the presentation is verified.
    merged.add(ORG_WORKFLOW_ACTOR_VC_TYPE)
    merged.add(EMPLOYEE_VC_TYPE)
    merged.add(DELEGATION_VC_TYPE)
    merged.add(WORKFLOW_REQUEST_APPROVAL_VC_TYPE)
  }

  const resolved = Array.from(merged)
  if (resolved.length === 0) {
    return withPlatformFallback(DEFAULT_POLICY_TYPES)
  }

  return resolved
}

export function buildVcTypeArrayFilter(acceptedVcTypes: string[]): Record<string, unknown> {
  const normalized = withPlatformFallback(uniqueVcTypes(acceptedVcTypes))
  if (normalized.length === 1) {
    return {
      type: 'array',
      contains: { const: normalized[0] },
    }
  }

  return {
    type: 'array',
    contains: { enum: normalized },
  }
}
