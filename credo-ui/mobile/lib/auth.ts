/**
 * Auth helpers — mirrors portal localStorage key conventions
 */
import { resolveMobileApiBaseUrl } from './baseUrl'

export interface UserProfile {
  phone: string
  username?: string
  role: 'guest' | 'holder' | 'issuer'
  tenantId?: string
  orgLabel?: string
}

export type ContextMode = 'personal' | 'org'

function decodeJwtBase64UrlSegment(segment: string): string | null {
  if (!segment) return null
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=')

  try {
    if (typeof atob === 'function') {
      return atob(padded)
    }
  } catch {
    // Fallback to Buffer in non-browser runtimes.
  }

  try {
    const bufferCtor = (globalThis as any).Buffer
    if (bufferCtor) {
      return bufferCtor.from(padded, 'base64').toString('utf8')
    }
  } catch {
    return null
  }

  return null
}

export function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const parts = token.split('.')
    if (parts.length < 2) return null
    const decoded = decodeJwtBase64UrlSegment(parts[1])
    if (!decoded) return null
    return JSON.parse(decoded)
  } catch {
    return null
  }
}

export function getWalletToken(): string | null {
  if (typeof window === 'undefined') return null
  return (
    localStorage.getItem('walletToken') ||
    localStorage.getItem('credoTenantToken') ||
    localStorage.getItem('tenantToken')
  )
}

export function getPersonalWalletTenantId(): string | null {
  if (typeof window === 'undefined') return null
  const token = getPersonalWalletToken()
  if (!token) return null
  const payload = decodeJwtPayload(token)
  return payload?.tenantId ?? null
}

export function getOrgToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('credoOrgToken') || null
}

function getStoredActiveOrg(): {
  orgTenantId?: string
  id?: string
  name?: string
  label?: string
  config?: { label?: string }
} | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = localStorage.getItem('credoActiveOrg')
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function getStoredActiveOrgId(): string | null {
  if (typeof window === 'undefined') return null
  const stored = getStoredActiveOrg()
  return stored?.orgTenantId ?? stored?.id ?? localStorage.getItem('credoTenantId') ?? null
}

function hasValidOrgTokenForActiveOrg(activeOrgId: string | null): boolean {
  if (typeof window === 'undefined' || !activeOrgId) return false

  const orgToken = localStorage.getItem('credoOrgToken')
  if (!orgToken) return false

  const payload = decodeJwtPayload(orgToken)
  const tokenTenantId = payload?.tenantId ?? payload?.orgTenantId ?? payload?.sub

  // When no tenant claim is present, treat token as potentially valid and let API enforce auth.
  if (!tokenTenantId || typeof tokenTenantId !== 'string') return true

  return tokenTenantId === activeOrgId
}

export function getContextMode(): ContextMode {
  if (typeof window === 'undefined') return 'personal'

  const mode = localStorage.getItem('credoContextMode')
  const activeOrgId = getStoredActiveOrgId()

  // Strict mode: if the user selected org context and an org is active,
  // keep org mode even when token is stale/missing. Do not silently downgrade
  // to personal context, because that mixes user/org data visibility.
  if (mode === 'org' && !!activeOrgId) {
    return 'org'
  }

  return 'personal'
}

/**
 * Strict token resolver: never falls back across contexts.
 * - org mode -> org token only
 * - personal mode -> wallet token only
 */
export function getContextTokenStrict(): string | null {
  if (typeof window === 'undefined') return null

  if (getContextMode() === 'org') {
    const activeOrgId = getStoredActiveOrgId()
    // Never use an org token that does not match the currently active org.
    if (!hasValidOrgTokenForActiveOrg(activeOrgId)) {
      return null
    }
    return getOrgToken()
  }

  return getWalletToken()
}

export function getActiveOrgId(): string | null {
  if (typeof window === 'undefined') return null

  const activeOrgId = getStoredActiveOrgId()
  if (!activeOrgId) return null

  return getContextMode() === 'org' ? activeOrgId : null
}

export function getActiveOrgLabel(): string | null {
  if (typeof window === 'undefined') return null
  if (getContextMode() !== 'org') return null

  const stored = getStoredActiveOrg()
  return stored?.name ?? stored?.label ?? stored?.config?.label ?? localStorage.getItem('credoOrgName') ?? null
}

export function getTenantSector(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('credoTenantSector')
}

export function getTenantFeatures(): string[] {
  // DEPRECATED (migration 062): features removed - query workflow_templates instead
  // Return empty array to avoid breaking existing code gracefully
  return []
}

export function getUserRole(): string | null {
  if (typeof window === 'undefined') return null

  if (getContextMode() === 'org') {
    // In org context return the human-facing org role (owner/admin/approver/…),
    // NOT the JWT 'role' field which is always 'RestTenantAgent'.
    return getOrgRoleClaim()
  }

  const walletToken = getWalletToken()
  const payload = walletToken ? decodeJwtPayload(walletToken) : null
  return (payload?.role as string | undefined) ?? 'holder'
}

export function getUserPhone(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('credoUserPhone') ?? localStorage.getItem('holderPhone')
}

export function getUserName(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('credoUserName') ?? localStorage.getItem('holderUsername')
}

export function clearAuth(): void {
  if (typeof window === 'undefined') return
  ;[
    'walletToken',
    'credoOrgToken',
    'credoActiveOrg',
    'credoTenantToken',
    'tenantToken',
    'credoTenantId',
    'tenantId',
    'credoOrgName',
    'credoTenantSector',
    'credoActiveWorkflowTypes',
    'credoActiveTemplateId',
    'credoUserRole',
    'credoUserPhone',
    'credoUserName',
    'holderPhone',
    'holderUsername',
    'credoRunningActions.v1',
  ].forEach((key) => localStorage.removeItem(key))
}

interface ApplyOrgContextInput {
  orgId: string
  orgName: string
  orgToken: string
  orgRole?: string | null
  sector?: string | null
  workflowTypes?: string[]
}

export function setPersonalContext(): void {
  if (typeof window === 'undefined') return

  localStorage.removeItem('credoOrgToken')
  localStorage.removeItem('credoTenantToken')
  localStorage.removeItem('tenantToken')
  localStorage.removeItem('credoTenantId')
  localStorage.removeItem('tenantId')
  localStorage.removeItem('credoOrgName')
  localStorage.removeItem('credoActiveOrg')
  localStorage.removeItem('credoTenantSector')
  localStorage.removeItem('credoActiveWorkflowTypes')
  localStorage.removeItem('credoActiveTemplateId')
  localStorage.removeItem('credoRunningActions.v1')
  localStorage.setItem('credoContextMode', 'personal')
  localStorage.setItem('credoUserRole', 'holder')
}

export function applyPersonalWalletContext(token: string, tenantId?: string | null): void {
  if (typeof window === 'undefined') return

  setPersonalContext()
  localStorage.setItem('walletToken', token)
  // Keep compatibility with API clients still reading tenant token keys.
  localStorage.setItem('credoTenantToken', token)
  localStorage.setItem('tenantToken', token)

  const normalizedTenantId = tenantId && String(tenantId).trim().length > 0 ? String(tenantId) : null
  if (normalizedTenantId) {
    localStorage.setItem('credoTenantId', normalizedTenantId)
    localStorage.setItem('tenantId', normalizedTenantId)
  }
}

export function applyOrgContext({
  orgId,
  orgName,
  orgToken,
  orgRole,
  sector,
  workflowTypes,
}: ApplyOrgContextInput): void {
  if (typeof window === 'undefined') return

  localStorage.setItem('credoOrgToken', orgToken)
  localStorage.setItem('credoTenantToken', orgToken)
  localStorage.setItem('tenantToken', orgToken)
  localStorage.setItem('credoContextMode', 'org')
  localStorage.setItem('credoTenantId', orgId)
  localStorage.setItem('tenantId', orgId)
  localStorage.setItem('credoOrgName', orgName)
  localStorage.setItem('credoActiveOrg', JSON.stringify({ orgTenantId: orgId, name: orgName }))

  if (sector && String(sector).trim().length > 0) localStorage.setItem('credoTenantSector', sector)
  else localStorage.removeItem('credoTenantSector')

  // features removed (migration 062) - no longer stored in localStorage

  if (orgRole && String(orgRole).trim().length > 0) localStorage.setItem('credoUserRole', orgRole)

  if (workflowTypes && Array.isArray(workflowTypes)) {
    localStorage.setItem('credoActiveWorkflowTypes', JSON.stringify(workflowTypes))
  } else {
    localStorage.removeItem('credoActiveWorkflowTypes')
  }
}

/**
 * Decodes the org JWT and returns the `role` claim.
 * Returns null when there is no org token or the token cannot be decoded.
 * Possible values from the backend: 'owner', 'admin', 'approver', 'field_worker', 'holder'
 */
export function getOrgRoleClaim(): string | null {
  if (typeof window === 'undefined') return null
  // Prefer the persisted credoUserRole written by syncOrgContextFromServer / org switch.
  const persisted = localStorage.getItem('credoUserRole')
  // If persisted is 'holder' (default set by setPersonalContext), it means no org role has been set yet.
  // Fall through to the token to get the real org role.
  if (persisted && persisted !== 'holder' && persisted !== 'RestTenantAgent') return persisted
  // Fall back to decoding the org token — read orgRole claim, NOT 'role' (which is always 'RestTenantAgent').
  const orgToken = localStorage.getItem('credoOrgToken')
  if (!orgToken) return null
  const payload = decodeJwtPayload(orgToken)
  // orgRole is the human-facing role: owner/admin/approver/manager/field_worker
  // 'role' in the token is always 'RestTenantAgent' — never use that as an org role.
  return payload?.orgRole ?? null
}

/**
 * Returns true when the user has an org-role that allows approve / reject / issue actions.
 * Does NOT return true for field_worker or holder roles.
 */
export function isOrgActionRole(): boolean {
  const role = getOrgRoleClaim()
  return ['owner', 'admin', 'approver'].includes(role ?? '')
}

/**
 * Returns true when the user has an org-role that allows release / payout actions.
 * Stricter than isOrgActionRole — approver alone is not sufficient.
 */
export function isReleaseRole(): boolean {
  const role = getOrgRoleClaim()
  return ['owner', 'admin'].includes(role ?? '')
}

/**
 * Returns true for internal org employee/operator roles.
 * External org-interacting users (e.g. holder/member/guest) must not see FEPT ops UI.
 */
export function isEmployeeOrgRole(): boolean {
  const role = String(getOrgRoleClaim() || '').toLowerCase()
  return ['owner', 'admin', 'manager', 'approver', 'issuer', 'field_worker', 'technician', 'dispatcher'].includes(role)
}

export function isAuthenticated(): boolean {
  if (typeof window === 'undefined') return false
  // Authenticated if either personal wallet token OR org token exists.
  return !!(localStorage.getItem('walletToken') || localStorage.getItem('credoOrgToken'))
}

/**
 * Backward-compatible alias for strict context token selection.
 * Never falls back across personal/org boundaries.
 */
export function getPreferredToken(): string | null {
  return getContextTokenStrict()
}

/**
 * Always returns the personal wallet token regardless of current context mode.
 * Use this when making calls to holder-scoped endpoints from any context
 * (e.g., inbox sync, credential fetching, personal offer endpoints).
 */
export function getPersonalWalletToken(): string | null {
  if (typeof window === 'undefined') return null

  const strictWalletToken = localStorage.getItem('walletToken')
  if (strictWalletToken) return strictWalletToken

  // Compatibility fallback for older sessions where only tenantToken keys were stored.
  // Never use this fallback in org context to avoid leaking org tokens into holder calls.
  if (getContextMode() === 'personal') {
    return localStorage.getItem('credoTenantToken') || localStorage.getItem('tenantToken')
  }

  return null
}

function allowBrowserCustomHeadersForApi(apiBase: string): boolean {
  if (typeof window === 'undefined') return true

  try {
    return new URL(apiBase).origin === window.location.origin
  } catch {
    return false
  }
}

/**
 * Align mobile org context with the backend's most recently active org membership.
 * Returns true when local org context changed.
 */
export async function syncOrgContextFromServer(): Promise<boolean> {
  if (typeof window === 'undefined') return false

  // Respect explicit user choice to stay in personal mode.
  if (localStorage.getItem('credoContextMode') === 'personal') {
    return false
  }

  const walletToken = getWalletToken()
  if (!walletToken) return false

  const apiBase = resolveMobileApiBaseUrl()
  const walletTenantId = getPersonalWalletTenantId()
  const allowCustomHeaders = allowBrowserCustomHeadersForApi(apiBase)
  const personalGuardHeaders = {
    Authorization: `Bearer ${walletToken}`,
    ...(allowCustomHeaders ? { 'x-context-mode': 'personal' } : {}),
    ...(allowCustomHeaders && walletTenantId ? { 'x-context-tenant-id': walletTenantId } : {}),
    ...(allowCustomHeaders ? { 'x-context-guard-version': 'v1' } : {}),
  }

  try {
    const orgsRes = await fetch(`${apiBase}/api/organizations`, {
      headers: personalGuardHeaders,
    })
    if (!orgsRes.ok) return false

    const organizations = await orgsRes.json()
    if (!Array.isArray(organizations) || organizations.length === 0) {
      setPersonalContext()
      return true
    }

    const orgById = new Map<string, any>()
    for (const org of organizations) {
      const orgId = org?.orgTenantId ?? org?.id
      if (orgId) orgById.set(orgId, org)
    }

    const currentOrgId = getActiveOrgId()

    // Never auto-promote personal users into org context.
    if (!currentOrgId) return false

    const currentOrg = orgById.get(currentOrgId)
    if (!currentOrg) {
      setPersonalContext()
      return true
    }

    const existingOrgToken = localStorage.getItem('credoOrgToken')
    const existingPayload = existingOrgToken ? decodeJwtPayload(existingOrgToken) : null
    const tokenTenantId = existingPayload?.tenantId ?? existingPayload?.orgTenantId ?? existingPayload?.sub

    if (existingOrgToken && (!tokenTenantId || tokenTenantId === currentOrgId)) {
      return false
    }

    const switchRes = await fetch(`${apiBase}/api/organizations/${currentOrgId}/switch`, {
      method: 'POST',
      headers: {
        ...personalGuardHeaders,
        ...(allowCustomHeaders
          ? { 'x-idempotency-key': `mobile:personal:${walletTenantId || 'unknown'}:switch-org:${currentOrgId}` }
          : {}),
      },
    })
    if (!switchRes.ok) return false

    const switched = await switchRes.json()
    const orgToken = switched?.token
    if (!orgToken) return false

    const currentOrgName = currentOrg?.name ?? currentOrg?.label ?? currentOrgId
    applyOrgContext({
      orgId: currentOrgId,
      orgName: currentOrgName,
      orgToken,
      orgRole: switched?.orgRole,
      sector: switched?.sector,
      workflowTypes: switched?.workflowTypes,
    })

    return true
  } catch {
    return false
  }
}
