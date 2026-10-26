import axios from 'axios'
import { captureOrganizationSwitchContext } from '../../shared/taskContext'
import { readMemberships, persistMemberships, refreshMemberships } from '../../shared/organizationMemberships'

export type OrganizationMembership = {
  orgTenantId: string
  name: string
  role?: string
  canOpenOrgContext?: boolean
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

/** The signed-in person's user id, read from the organisation token (empty when signed out). */
export function readCurrentUserId(): string {
  const token = getOrgScopedToken()
  if (!token) return ''
  const payload = decodeJwtPayload(token)
  return String(payload?.id || payload?.userId || '')
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
  if (payload?.orgRole) return null

  return candidate
}

export function readOrganizationsFromCache(): OrganizationMembership[] {
  if (typeof window === 'undefined') return []

  return readMemberships(window.localStorage, getPersonalToken())
}

export function persistOrganizationsToCache(orgs: OrganizationMembership[]) {
  if (typeof window === 'undefined') return
  persistMemberships(window.localStorage, getPersonalToken(), orgs.map((org) => ({ ...org, role: org.role || 'member' })))
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
  if (!personalToken) throw new Error('Sign in to your personal account to refresh organisations.')
  return refreshMemberships(window.localStorage, personalToken, async () => {
    const response = await axios.get(`${backendUrl}/api/organizations`, {
      headers: { Authorization: `Bearer ${personalToken}` },
    })
    return response.data
  }, getPersonalToken)
}

export async function switchOrganizationContext(params: {
  backendUrl: string
  orgTenantId: string
  orgName?: string
  personalToken: string
}): Promise<string> {
  const { backendUrl, orgTenantId, orgName, personalToken } = params
  const assertContextUnchanged =
    typeof window === 'undefined' ? undefined : captureOrganizationSwitchContext(window.localStorage)

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
    assertContextUnchanged?.()
    applyOrganizationSession(orgTenantId, response.data, orgName)
  }

  return orgToken
}

export function applyOrganizationSession(
  orgTenantId: string,
  session: {
    token: string
    orgName?: string
    name?: string
    role?: string
    orgRole?: string
    sector?: string
    workflowTypes?: string[]
  },
  orgName?: string,
): void {
  if (!session.token) throw new Error('Organisation entry did not return a session')
  const orgToken = session.token
  const resolvedName = session.orgName || session.name || orgName || orgTenantId
  const role = session.role || session.orgRole || 'member'

  // Same keys the header account picker writes, so every page sees the org session.
  window.localStorage.setItem('credoOrgToken', orgToken)
  window.localStorage.setItem('tenantToken', orgToken)
  window.localStorage.setItem('credoTenantToken', orgToken)
  window.localStorage.setItem('credoContextMode', 'org')
  window.localStorage.setItem('credoTenantId', orgTenantId)
  window.localStorage.setItem('tenantId', orgTenantId)
  window.localStorage.setItem('credoOrgName', resolvedName)
  if (session.sector) window.localStorage.setItem('credoTenantSector', session.sector)
  else window.localStorage.removeItem('credoTenantSector')
  if (session.workflowTypes)
    window.localStorage.setItem('credoActiveWorkflowTypes', JSON.stringify(session.workflowTypes))
  else window.localStorage.removeItem('credoActiveWorkflowTypes')

  persistActiveOrganization({ orgTenantId, name: resolvedName, role })
  const cached = readOrganizationsFromCache()
  persistOrganizationsToCache([
    { orgTenantId, name: resolvedName, role },
    ...cached.filter((org) => org.orgTenantId !== orgTenantId),
  ])
  window.dispatchEvent(new Event('credo:workflow-context-updated'))
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
