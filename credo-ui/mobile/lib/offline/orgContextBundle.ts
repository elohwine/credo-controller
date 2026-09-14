import api from '@/lib/api'
import { getActiveOrgId, getOrgToken } from '@/lib/auth'

import { getOfflineStorageAdapter } from './storage'

export type OrgRole =
  | 'owner'
  | 'admin'
  | 'approver'
  | 'issuer'
  | 'manager'
  | 'bursar'
  | 'verifier'
  | 'inspector'
  | 'member'

export interface OrgRoleCapabilities {
  allowedActions: string[]
  maxApprovalAmount: number | null
  requireEvidenceForActions: string[]
  evidenceRequiredAboveAmount?: number | null
  escalationRole?: OrgRole | null
}

export interface OrgContextBundleSnapshot {
  id: string
  tenantId: string
  bundleType: 'org_context'
  version: number
  payload: Record<string, unknown>
  digest: string
  issuedAt: string
  expiresAt?: string
  revokedAt?: string
}

export interface OrgContextBundlePayload {
  bundleType: 'org_context'
  tenantId: string
  generatedAt: string
  expiresAt: string
  baseUrl: string
  policy: {
    version: string
    strictDeviceTrust: boolean
    requireLocalReauthForHighRiskActions: boolean
    maxQueueSize: number
    actionValidityHours?: number
  }
  roleCapabilities: Record<OrgRole, OrgRoleCapabilities>
}

export interface OrgContextBundleResponse {
  snapshot: OrgContextBundleSnapshot
  bundle: OrgContextBundlePayload
  actor: {
    actorId?: string
    orgRole: OrgRole
    capabilities: OrgRoleCapabilities
  }
}

export interface OrgContextBundleCacheEntry {
  tenantId: string
  snapshot: OrgContextBundleSnapshot
  bundle: OrgContextBundlePayload
  actor: OrgContextBundleResponse['actor']
  cachedAt: string
}

export interface OrgActionPolicyCheckInput {
  actionType: string
  amount?: number | null
  evidenceProvided?: boolean
  actionTimestamp?: string
}

export interface OrgActionPolicyCheckResult {
  allowed: boolean
  reason?: string
  requiresEvidence?: boolean
  suggestedEscalationRole?: OrgRole
  actionExpired?: boolean
  source: 'bundle' | 'fallback'
}

const ORG_CONTEXT_BUNDLE_CACHE_KEY = 'current'

function nowIso(): string {
  return new Date().toISOString()
}

function resolveTenantId(tenantId?: string): string | null {
  if (tenantId && tenantId.trim().length > 0) return tenantId.trim()
  const activeOrgId = getActiveOrgId()
  return activeOrgId && activeOrgId.trim().length > 0 ? activeOrgId.trim() : null
}

export function getCachedOrgContextBundle(tenantId?: string): OrgContextBundleCacheEntry | null {
  const resolvedTenantId = resolveTenantId(tenantId)
  if (!resolvedTenantId) return null

  return getOfflineStorageAdapter().get<OrgContextBundleCacheEntry>(
    'org_capability_bundle',
    `${resolvedTenantId}:${ORG_CONTEXT_BUNDLE_CACHE_KEY}`,
  )
}

export function cacheOrgContextBundle(entry: OrgContextBundleCacheEntry): void {
  getOfflineStorageAdapter().set('org_capability_bundle', `${entry.tenantId}:${ORG_CONTEXT_BUNDLE_CACHE_KEY}`, entry)
}

export async function refreshOrgContextBundle(tenantId?: string): Promise<OrgContextBundleCacheEntry | null> {
  const resolvedTenantId = resolveTenantId(tenantId)
  if (!resolvedTenantId) return null

  const token = getOrgToken()
  if (!token) {
    return getCachedOrgContextBundle(resolvedTenantId)
  }

  try {
    const response = await api.get<OrgContextBundleResponse>('/offline/bundles/org-context', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      skipAuthRedirect: true,
    } as any)

    const snapshot = response.data?.snapshot
    const bundle = response.data?.bundle
    const actor = response.data?.actor
    if (!snapshot || !bundle || !actor) {
      return getCachedOrgContextBundle(resolvedTenantId)
    }

    const entry: OrgContextBundleCacheEntry = {
      tenantId: resolvedTenantId,
      snapshot,
      bundle,
      actor,
      cachedAt: nowIso(),
    }

    cacheOrgContextBundle(entry)
    return entry
  } catch {
    return getCachedOrgContextBundle(resolvedTenantId)
  }
}

export function evaluateOrgActionPolicy(
  entry: OrgContextBundleCacheEntry | null,
  input: OrgActionPolicyCheckInput,
): OrgActionPolicyCheckResult {
  if (!entry) {
    return {
      allowed: true,
      source: 'fallback',
    }
  }

  const actionTimestamp = input.actionTimestamp || nowIso()
  const actionTime = Date.parse(actionTimestamp)
  const bundleExpiry = Date.parse(entry.bundle.expiresAt)
  if (Number.isFinite(actionTime) && Number.isFinite(bundleExpiry) && actionTime > bundleExpiry) {
    return {
      allowed: false,
      actionExpired: true,
      reason: 'Your offline org policy bundle has expired. Refresh org context and try again.',
      source: 'bundle',
    }
  }

  const capabilities = entry.actor.capabilities
  if (!capabilities.allowedActions.includes(input.actionType)) {
    return {
      allowed: false,
      reason: `Action ${input.actionType} is not allowed for your role (${entry.actor.orgRole}).`,
      source: 'bundle',
    }
  }

  if (
    typeof input.amount === 'number' &&
    Number.isFinite(input.amount) &&
    capabilities.maxApprovalAmount !== null &&
    input.amount > capabilities.maxApprovalAmount
  ) {
    return {
      allowed: false,
      reason: `Amount ${input.amount} exceeds your role limit of ${capabilities.maxApprovalAmount}.`,
      suggestedEscalationRole: capabilities.escalationRole || undefined,
      source: 'bundle',
    }
  }

  const requiresEvidenceForAction = capabilities.requireEvidenceForActions.includes(input.actionType)
  let requiresEvidence = requiresEvidenceForAction

  if (
    requiresEvidenceForAction &&
    typeof capabilities.evidenceRequiredAboveAmount === 'number' &&
    typeof input.amount === 'number' &&
    Number.isFinite(input.amount)
  ) {
    requiresEvidence = input.amount > capabilities.evidenceRequiredAboveAmount
  }

  if (requiresEvidence && !input.evidenceProvided) {
    const thresholdMessage =
      typeof capabilities.evidenceRequiredAboveAmount === 'number'
        ? ` above ${capabilities.evidenceRequiredAboveAmount}`
        : ''

    return {
      allowed: false,
      requiresEvidence: true,
      reason: `Evidence is required for ${input.actionType}${thresholdMessage}.`,
      source: 'bundle',
    }
  }

  return {
    allowed: true,
    requiresEvidence,
    source: 'bundle',
  }
}
