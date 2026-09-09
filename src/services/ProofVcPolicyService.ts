import { DatabaseManager } from '../persistence/DatabaseManager'
import { PLATFORM_IDENTITY_VC_TYPE } from '../config/credentials/PlatformIdentityVC'

export type ProofVcActionKey =
  | 'requisition_approval'
  | 'requisition_release'
  | 'requisition_ack'
  | 'ap_workflow_proof'

export interface OrgProofVcPolicy {
  orgTenantId: string
  defaultAcceptedVcTypes: string[]
  actionOverrides: Record<string, string[]>
  createdAt?: string
  updatedAt?: string
}

export interface OrgProofVcPolicyUpdate {
  defaultAcceptedVcTypes?: string[]
  actionOverrides?: Record<string, string[]>
}

const DEFAULT_POLICY_TYPES = [PLATFORM_IDENTITY_VC_TYPE]

function uniqueVcTypes(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return [...new Set(input
    .map((entry) => String(entry || '').trim())
    .filter((entry) => entry.length > 0))]
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

export function getOrCreateOrgProofVcPolicy(orgTenantId: string): OrgProofVcPolicy {
  const db = DatabaseManager.getDatabase()
  const row = db.prepare(`
    SELECT org_tenant_id, default_vc_types, action_overrides, created_at, updated_at
    FROM org_proof_vc_policies
    WHERE org_tenant_id = ?
    LIMIT 1
  `).get(orgTenantId) as {
    org_tenant_id: string
    default_vc_types: string
    action_overrides: string
    created_at?: string
    updated_at?: string
  } | undefined

  if (!row) {
    const now = new Date().toISOString()
    const defaultTypes = withPlatformFallback(DEFAULT_POLICY_TYPES)
    const actionOverrides: Record<string, string[]> = {}
    db.prepare(`
      INSERT INTO org_proof_vc_policies (
        org_tenant_id, default_vc_types, action_overrides, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?)
    `).run(orgTenantId, JSON.stringify(defaultTypes), JSON.stringify(actionOverrides), now, now)

    return {
      orgTenantId,
      defaultAcceptedVcTypes: defaultTypes,
      actionOverrides,
      createdAt: now,
      updatedAt: now,
    }
  }

  const defaultAcceptedVcTypes = withPlatformFallback(uniqueVcTypes(parseJsonArray(row.default_vc_types)))
  const actionOverrides = parseActionOverrides(parseJsonObject(row.action_overrides))

  return {
    orgTenantId: row.org_tenant_id,
    defaultAcceptedVcTypes,
    actionOverrides,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function updateOrgProofVcPolicy(orgTenantId: string, updates: OrgProofVcPolicyUpdate): OrgProofVcPolicy {
  const db = DatabaseManager.getDatabase()
  const current = getOrCreateOrgProofVcPolicy(orgTenantId)

  const defaultAcceptedVcTypes = updates.defaultAcceptedVcTypes !== undefined
    ? withPlatformFallback(uniqueVcTypes(updates.defaultAcceptedVcTypes))
    : current.defaultAcceptedVcTypes

  const actionOverrides = updates.actionOverrides !== undefined
    ? parseActionOverrides(updates.actionOverrides)
    : current.actionOverrides

  const now = new Date().toISOString()
  db.prepare(`
    UPDATE org_proof_vc_policies
    SET default_vc_types = ?, action_overrides = ?, updated_at = ?
    WHERE org_tenant_id = ?
  `).run(JSON.stringify(defaultAcceptedVcTypes), JSON.stringify(actionOverrides), now, orgTenantId)

  return {
    orgTenantId,
    defaultAcceptedVcTypes,
    actionOverrides,
    createdAt: current.createdAt,
    updatedAt: now,
  }
}

export function resolveAcceptedProofVcTypes(orgTenantId: string | undefined, actionKey: ProofVcActionKey): string[] {
  if (!orgTenantId) {
    return withPlatformFallback(DEFAULT_POLICY_TYPES)
  }

  const policy = getOrCreateOrgProofVcPolicy(orgTenantId)
  const fromAction = policy.actionOverrides[actionKey]
  if (Array.isArray(fromAction) && fromAction.length > 0) {
    return withPlatformFallback(fromAction)
  }
  return withPlatformFallback(policy.defaultAcceptedVcTypes)
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
