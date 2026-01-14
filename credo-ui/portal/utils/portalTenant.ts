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

  const apiKey = process.env.NEXT_PUBLIC_CREDO_API_KEY || 'test-api-key-12345'

  let tenantId =
    normalizeStored(window.localStorage.getItem('credoTenantId')) ||
    normalizeStored(window.localStorage.getItem('tenantId'))

  const rootTokenRes = await axios.post(`${credoBackend}/agent/token`, {}, { headers: { Authorization: apiKey } })
  const rootToken: string | undefined = rootTokenRes?.data?.token
  if (!rootToken) {
    throw new Error('Failed to get root token from backend')
  }

  let tenantToken: string | undefined

  const persist = (id: string, token: string) => {
    window.localStorage.setItem('credoTenantId', id)
    window.localStorage.setItem('tenantId', id)
    window.localStorage.setItem('credoTenantToken', token)
    window.localStorage.setItem('tenantToken', token)
  }

  if (!tenantId) {
    const createRes = await axios.post(
      `${credoBackend}/multi-tenancy/create-tenant`,
      { config: { label: 'Portal Tenant' }, baseUrl: credoBackend },
      { headers: { Authorization: `Bearer ${rootToken}` } }
    )

    tenantId = createRes?.data?.tenantId
    tenantToken = createRes?.data?.token
  } else {
    try {
      const tokenRes = await axios.post(
        `${credoBackend}/multi-tenancy/get-token/${tenantId}`,
        {},
        { headers: { Authorization: `Bearer ${rootToken}` } }
      )
      tenantToken = tokenRes?.data?.token
    } catch {
      const createRes = await axios.post(
        `${credoBackend}/multi-tenancy/create-tenant`,
        { config: { label: 'Portal Tenant' }, baseUrl: credoBackend },
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
