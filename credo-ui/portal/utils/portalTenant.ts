import axios from 'axios'

export type PortalTenantAuth = {
  tenantId: string
  tenantToken: string
}

function normalizeStored(value: string | null | undefined) {
  if (!value) return undefined
  if (value === 'undefined' || value === 'null') return undefined
  return value
}

export async function ensurePortalTenant(credoBackend: string): Promise<PortalTenantAuth> {
  if (typeof window === 'undefined') {
    throw new Error('ensurePortalTenant must be called in the browser')
  }

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

  // Optimize: Return cached token if available
  if (tenantId && tenantToken) {
    return { tenantId, tenantToken }
  }

  // Use Holder URL (Port 6000) for tenant operations if available, otherwise fallback to provided backend
  const holderBackend = process.env.NEXT_PUBLIC_HOLDER_URL || credoBackend

  const apiKey = process.env.NEXT_PUBLIC_CREDO_API_KEY || 'test-api-key-12345'
  const rootTokenRes = await axios.post(`${holderBackend}/agent/token`, {}, { headers: { Authorization: apiKey } })
  const rootToken: string | undefined = rootTokenRes?.data?.token
  if (!rootToken) {
    throw new Error('Failed to get root token from backend')
  }

  if (!tenantId) {
    const createRes = await axios.post(
      `${holderBackend}/multi-tenancy/create-tenant`,
      { config: { label: 'Portal Tenant', tenantType: 'USER' }, baseUrl: holderBackend },
      { headers: { Authorization: `Bearer ${rootToken}` } }
    )

    tenantId = createRes?.data?.tenantId
    tenantToken = createRes?.data?.token
  } else {
    try {
      const tokenRes = await axios.post(
        `${holderBackend}/multi-tenancy/get-token/${tenantId}`,
        {},
        { headers: { Authorization: `Bearer ${rootToken}` } }
      )
      tenantToken = tokenRes?.data?.token
    } catch {
      const createRes = await axios.post(
        `${holderBackend}/multi-tenancy/create-tenant`,
        { config: { label: 'Portal Tenant', tenantType: 'USER' }, baseUrl: holderBackend },
        { headers: { Authorization: `Bearer ${rootToken}` } }
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
