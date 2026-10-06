import axios from 'axios'

export type PortalTenantAuth = {
  tenantId: string
  tenantToken: string
}

type ActiveOrgRecord = {
  orgTenantId?: string
  name?: string
  role?: string
}

export type PortalContextMode = 'personal' | 'org'

function normalizeStored(value: string | null | undefined) {
  if (!value) return undefined
  if (value === 'undefined' || value === 'null') return undefined
  return value
}

function getActiveOrgRecord(): ActiveOrgRecord | undefined {
  if (typeof window === 'undefined') return undefined

  const raw = normalizeStored(window.localStorage.getItem('credoActiveOrg'))
  if (!raw) return undefined

  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed as ActiveOrgRecord
  } catch {
    return undefined
  }

  return undefined
}

function getStoredContextMode(): PortalContextMode {
  if (typeof window === 'undefined') return 'personal'
  const mode = normalizeStored(window.localStorage.getItem('credoContextMode'))
  return mode === 'org' ? 'org' : 'personal'
}

function hasValidOrgTokenForActiveOrg(): boolean {
  if (typeof window === 'undefined') return false

  const activeOrg = getActiveOrgRecord()
  const activeOrgId =
    normalizeStored(activeOrg?.orgTenantId) || normalizeStored(window.localStorage.getItem('credoTenantId'))
  const orgToken = normalizeStored(window.localStorage.getItem('credoOrgToken'))
  if (!activeOrgId || !orgToken) return false

  const tokenTenantId = extractTenantFromJwt(orgToken)
  if (!tokenTenantId) return false
  return tokenTenantId === activeOrgId
}

export function isOrgContextActive(): boolean {
  if (typeof window === 'undefined') return false
  return getStoredContextMode() === 'org' && hasValidOrgTokenForActiveOrg()
}

export function getPortalContextMode(): PortalContextMode {
  if (typeof window === 'undefined') return 'personal'
  if (isOrgContextActive()) return 'org'
  return 'personal'
}

export function getPreferredTenantToken(): string | undefined {
  if (typeof window === 'undefined') return undefined

  // Org mode must use the active org token only.
  if (getStoredContextMode() === 'org') {
    if (hasValidOrgTokenForActiveOrg()) {
      return normalizeStored(window.localStorage.getItem('credoOrgToken'))
    }
    return undefined
  }

  // Personal mode should prefer holder wallet token.
  const walletToken = normalizeStored(window.localStorage.getItem('walletToken'))
  if (walletToken) return walletToken

  const tenantToken =
    normalizeStored(window.localStorage.getItem('credoTenantToken')) ||
    normalizeStored(window.localStorage.getItem('tenantToken'))
  const orgToken = normalizeStored(window.localStorage.getItem('credoOrgToken'))
  if (tenantToken && (!orgToken || tenantToken !== orgToken)) return tenantToken

  return undefined
}

export function getPersonalWalletTenantId(): string | undefined {
  if (typeof window === 'undefined') return undefined

  const walletToken = normalizeStored(window.localStorage.getItem('walletToken'))
  if (!walletToken) return undefined
  return extractTenantFromJwt(walletToken)
}

export function getPersonalWalletToken(): string | undefined {
  if (typeof window === 'undefined') return undefined
  const token = normalizeStored(window.localStorage.getItem('walletToken'))
  if (!token) return undefined
  return token
}

export function getPreferredTenantId(token?: string): string | undefined {
  if (typeof window === 'undefined') return undefined

  if (isOrgContextActive()) {
    return (
      normalizeStored(getActiveOrgRecord()?.orgTenantId) ||
      normalizeStored(window.localStorage.getItem('credoTenantId')) ||
      normalizeStored(window.localStorage.getItem('tenantId'))
    )
  }

  const walletToken = normalizeStored(window.localStorage.getItem('walletToken'))
  if (walletToken) {
    const walletTenantId = extractTenantFromJwt(walletToken)
    if (walletTenantId) return walletTenantId
  }

  const explicitTenantId =
    normalizeStored(window.localStorage.getItem('credoTenantId')) ||
    normalizeStored(window.localStorage.getItem('tenantId'))
  const activeOrgId = normalizeStored(getActiveOrgRecord()?.orgTenantId)
  if (explicitTenantId && (!activeOrgId || explicitTenantId !== activeOrgId)) {
    return explicitTenantId
  }

  return token ? extractTenantFromJwt(token) : undefined
}

/**
 * Try to decode JWT and extract tenantId
 * Works with both logged-in user tokens and anonymous tenant tokens
 */
function extractTenantFromJwt(token: string): string | undefined {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return undefined
    const payload = JSON.parse(atob(parts[1]))
    return payload.tenantId
  } catch {
    return undefined
  }
}

function extractRoleFromJwt(token: string): string | undefined {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return undefined
    const payload = JSON.parse(atob(parts[1]))
    const role = payload?.role
    if (Array.isArray(role)) return String(role[0] || '').trim() || undefined
    return typeof role === 'string' ? role.trim() || undefined : undefined
  } catch {
    return undefined
  }
}

export async function ensurePortalTenant(
  credoBackend: string,
  options?: { forceRefresh?: boolean; holderBackend?: string; holderApiKey?: string },
): Promise<PortalTenantAuth> {
  if (typeof window === 'undefined') {
    throw new Error('ensurePortalTenant must be called in the browser')
  }

  const holderBackend = options?.holderBackend || credoBackend

  // PRIORITY 1: Check if user is logged in (SSI auth token contains their registered tenant)
  const authToken =
    normalizeStored(window.localStorage.getItem('authToken')) ||
    normalizeStored(window.localStorage.getItem('auth.token')) ||
    normalizeStored(window.localStorage.getItem('walletToken')) ||
    normalizeStored(window.localStorage.getItem('credoTenantToken'))

  if (authToken) {
    const loggedInTenantId = extractTenantFromJwt(authToken)
    if (loggedInTenantId) {
      // User is logged in - use their registered tenant, not anonymous one
      console.log('[ensurePortalTenant] Using logged-in user tenant:', loggedInTenantId)

      // Persist to match expected localStorage keys
      window.localStorage.setItem('credoTenantId', loggedInTenantId)
      window.localStorage.setItem('tenantId', loggedInTenantId)
      window.localStorage.setItem('tenantToken', authToken)

      return { tenantId: loggedInTenantId, tenantToken: authToken }
    }
  }

  // PRIORITY 2: Check cached anonymous tenant
  let tenantToken: string | undefined = normalizeStored(window.localStorage.getItem('tenantToken'))
  let tenantId: string | undefined =
    normalizeStored(window.localStorage.getItem('credoTenantId')) ||
    normalizeStored(window.localStorage.getItem('tenantId'))

  const persist = (id: string, token: string) => {
    window.localStorage.setItem('credoTenantId', id)
    window.localStorage.setItem('tenantId', id)
    window.localStorage.setItem('credoTenantToken', token)
    window.localStorage.setItem('tenantToken', token)
  }

  if (options?.forceRefresh) {
    tenantToken = undefined
  }

  // Return cached anonymous token if available
  if (tenantId && tenantToken) {
    return { tenantId, tenantToken }
  }

  // PRIORITY 3: Create new anonymous tenant for guest user
  const apiKey = options?.holderApiKey || 'test-api-key-12345'
  const rootTokenRes = await axios.post(`${holderBackend}/agent/token`, {}, { headers: { Authorization: apiKey } })
  const rootToken: string | undefined = rootTokenRes?.data?.token
  if (!rootToken) {
    throw new Error('Failed to get root token from backend')
  }

  if (!tenantId) {
    const createRes = await axios.post(
      `${holderBackend}/multi-tenancy/create-tenant`,
      {
        config: {
          label: 'Portal Tenant',
          tenantType: 'USER',
          connectionImageUrl: `${window.location.origin}/favicon.ico`,
        },
        baseUrl: credoBackend,
      },
      { headers: { Authorization: `Bearer ${rootToken}` } },
    )

    tenantId = createRes?.data?.tenantId
    tenantToken = createRes?.data?.token
  } else {
    try {
      const tokenRes = await axios.post(
        `${holderBackend}/multi-tenancy/get-token/${tenantId}`,
        {},
        { headers: { Authorization: `Bearer ${rootToken}` } },
      )
      tenantToken = tokenRes?.data?.token
    } catch {
      const createRes = await axios.post(
        `${holderBackend}/multi-tenancy/create-tenant`,
        {
          config: {
            label: 'Portal Tenant',
            tenantType: 'USER',
            connectionImageUrl: `${window.location.origin}/favicon.ico`,
          },
          baseUrl: credoBackend,
        },
        { headers: { Authorization: `Bearer ${rootToken}` } },
      )
      tenantId = createRes?.data?.tenantId
      tenantToken = createRes?.data?.token
    }
  }

  if (!tenantId || !tenantToken) {
    throw new Error('Failed to initialize tenant authentication')
  }

  persist(tenantId, tenantToken)
  return { tenantId, tenantToken }
}
