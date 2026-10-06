import axios from 'axios'

export type OrganizationMembership = {
  orgTenantId: string
  name: string
  role?: string
}

/** Older builds stored a "first workflow" choice here; onboarding now stores answers in orgProfile.ts. */
const LEGACY_ONBOARDING_FOCUS_KEY = 'credoOnboardingWorkflowFocus'

function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(atob(parts[1]))
    return payload
  } catch {
    return null
  }
}

function normalizeRole(role: unknown): string {
  if (Array.isArray(role)) return String(role[0] || '').trim()
  return String(role || '').trim()
}

export function getOrgScopedToken(): string | null {
  if (typeof window === 'undefined') return null
  return (
    window.localStorage.getItem('credoOrgToken') ||
    window.localStorage.getItem('credoTenantToken') ||
    window.localStorage.getItem('tenantToken') ||
    window.localStorage.getItem('walletToken') ||
    null
  )
}

export function getPersonalToken(): string | null {
  if (typeof window === 'undefined') return null

  const authToken =
    window.localStorage.getItem('authToken') ||
    window.localStorage.getItem('auth.token') ||
    window.localStorage.getItem('walletToken')

  if (authToken) return authToken

  const candidate = window.localStorage.getItem('tenantToken') || window.localStorage.getItem('credoTenantToken')
  if (!candidate) return null

  const payload = decodeJwtPayload(candidate)
  const role = normalizeRole(payload?.role)

  // Tenant-scoped org tokens should not be used to discover the user's org memberships.
  if (role === 'RestTenantAgent') return null

  return candidate
}

export function readOrganizationsFromCache(): OrganizationMembership[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem('credoOrganizations')
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed
      .map((entry: any) => ({
        orgTenantId: entry?.orgTenantId || entry?.id || entry?.orgTenantID,
        name: entry?.name || entry?.label || 'Organization',
        role: entry?.role || 'member',
      }))
      .filter((entry) => !!entry.orgTenantId)
  } catch {
    return []
  }
}

export function persistOrganizationsToCache(orgs: OrganizationMembership[]) {
  if (typeof window === 'undefined') return
  if (!Array.isArray(orgs) || orgs.length === 0) return
  window.localStorage.setItem('credoOrganizations', JSON.stringify(orgs))
}

export function readActiveOrganization(): OrganizationMembership | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem('credoActiveOrg')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.orgTenantId) return null

    return {
      orgTenantId: parsed.orgTenantId,
      name: parsed.name || 'Organization',
      role: parsed.role || 'member',
    }
  } catch {
    return null
  }
}

export function persistActiveOrganization(org: OrganizationMembership) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem('credoActiveOrg', JSON.stringify(org))
}

/** Drop the previous organisation so a new sign-in does not keep acting as it. */
export function clearStoredOrganizationContext() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem('credoActiveOrg')
  window.localStorage.removeItem('credoOrganizations')
  window.localStorage.removeItem('credoOrgToken')
  window.localStorage.removeItem(LEGACY_ONBOARDING_FOCUS_KEY)
  window.localStorage.removeItem('credoOrgProfile')
}

export async function fetchOrganizations(backendUrl: string, personalToken: string): Promise<OrganizationMembership[]> {
  if (!personalToken) return readOrganizationsFromCache()

  const response = await axios.get(`${backendUrl}/api/organizations`, {
    headers: { Authorization: `Bearer ${personalToken}` },
  })

  const orgs = Array.isArray(response.data)
    ? response.data
    : Array.isArray(response.data?.organizations)
      ? response.data.organizations
      : Array.isArray(response.data?.data)
        ? response.data.data
        : []

  const normalized = orgs
    .map((entry: any) => ({
      orgTenantId: entry?.orgTenantId || entry?.id || entry?.tenantId,
      name: entry?.name || entry?.label || 'Organization',
      role: entry?.role || 'member',
    }))
    .filter((entry: OrganizationMembership) => !!entry.orgTenantId)

  if (normalized.length > 0) {
    persistOrganizationsToCache(normalized)
    return normalized
  }

  return readOrganizationsFromCache()
}

export async function switchOrganizationContext(params: {
  backendUrl: string
  orgTenantId: string
  orgName?: string
  personalToken: string
}): Promise<string> {
  const { backendUrl, orgTenantId, orgName, personalToken } = params

  const response = await axios.post(
    `${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/switch`,
    {},
    { headers: { Authorization: `Bearer ${personalToken}` } },
  )

  const orgToken = response.data?.token
  if (!orgToken) {
    throw new Error('Organization switch succeeded but no token was returned')
  }

  if (typeof window !== 'undefined') {
    const resolvedName = response.data?.orgName || response.data?.name || orgName || orgTenantId
    const role = response.data?.role || response.data?.orgRole || 'member'

    // Same keys the header account picker writes, so every page sees the org session.
    window.localStorage.setItem('credoOrgToken', orgToken)
    window.localStorage.setItem('tenantToken', orgToken)
    window.localStorage.setItem('credoTenantToken', orgToken)
    window.localStorage.setItem('credoContextMode', 'org')
    window.localStorage.setItem('credoTenantId', orgTenantId)
    window.localStorage.setItem('tenantId', orgTenantId)
    window.localStorage.setItem('credoOrgName', resolvedName)
    if (response.data?.sector) window.localStorage.setItem('credoTenantSector', response.data.sector)
    else window.localStorage.removeItem('credoTenantSector')
    if (response.data?.workflowTypes) window.localStorage.setItem('credoActiveWorkflowTypes', JSON.stringify(response.data.workflowTypes))
    else window.localStorage.removeItem('credoActiveWorkflowTypes')

    persistActiveOrganization({ orgTenantId, name: resolvedName, role })
    const cached = readOrganizationsFromCache()
    persistOrganizationsToCache([
      { orgTenantId, name: resolvedName, role },
      ...cached.filter((org) => org.orgTenantId !== orgTenantId),
    ])
    window.dispatchEvent(new Event('credo:workflow-context-updated'))
  }

  return orgToken
}

/** True when the session is already acting as this organization. */
export function isActingAsOrganization(orgTenantId: string): boolean {
  if (typeof window === 'undefined' || !orgTenantId) return false
  if (window.localStorage.getItem('credoContextMode') !== 'org') return false
  const active = readActiveOrganization()
  if (active?.orgTenantId !== orgTenantId) return false
  const orgToken = window.localStorage.getItem('credoOrgToken')
  return Boolean(orgToken && decodeJwtPayload(orgToken)?.tenantId === orgTenantId)
}

/** Display name for an organization the person belongs to, from the cached list. */
export function organizationNameFor(orgTenantId: string): string | undefined {
  return readOrganizationsFromCache().find((org) => org.orgTenantId === orgTenantId)?.name
}
