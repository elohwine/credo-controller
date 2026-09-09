import axios from 'axios'

export type OrganizationMembership = {
  orgTenantId: string
  name: string
  role?: string
}

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
    window.localStorage.getItem('tenantToken') ||
    window.localStorage.getItem('credoTenantToken') ||
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
    .filter((entry) => !!entry.orgTenantId)

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
    window.localStorage.setItem('credoOrgToken', orgToken)
    window.localStorage.setItem('tenantToken', orgToken)
    window.localStorage.setItem('credoTenantToken', orgToken)

    persistActiveOrganization({
      orgTenantId,
      name: response.data?.orgName || orgName || orgTenantId,
      role: response.data?.role || 'member',
    })
  }

  return orgToken
}
