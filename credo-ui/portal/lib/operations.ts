import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { notifications } from '@mantine/notifications'

import { EnvContext } from '@/pages/_app'
import { getOrgScopedToken } from '@/utils/organizationContext'
import { getPreferredTenantToken } from '@/utils/portalTenant'
import { operationsApi } from '../../shared/operations/operationsApi'

/** Stores, vans and incoming jobs for the active organisation. */
export function usePortalOperations() {
  const env = useContext(EnvContext)
  const backend = env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'
  // Read after mount so the server render and the first browser render match.
  const [token, setToken] = useState<string | null>(null)
  useEffect(() => setToken(getOrgScopedToken() || getPreferredTenantToken() || null), [])
  const api = useMemo(() => (token ? operationsApi(backend, token) : null), [backend, token])
  const notify = useCallback((message: string, tone: 'success' | 'error' | 'info') => {
    notifications.show({ message, color: tone === 'error' ? 'red' : tone === 'success' ? 'teal' : 'blue' })
  }, [])
  return { api, notify }
}
