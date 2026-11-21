import { useCallback, useEffect, useMemo, useState } from 'react'
import { notifications } from '@mantine/notifications'

import { API_BASE_URL } from '@/lib/api'
import { getOrgToken } from '@/lib/auth'
import { operationsApi } from '../../shared/operations/operationsApi'

/** Stores, vans and incoming jobs for the active organisation. */
export function usePhoneOperations() {
  // Read after mount so the server render and the first browser render match.
  const [token, setToken] = useState<string | null>(null)
  useEffect(() => setToken(getOrgToken()), [])
  const api = useMemo(() => (token ? operationsApi(API_BASE_URL, token) : null), [token])
  const notify = useCallback((message: string, tone: 'success' | 'error' | 'info') => {
    notifications.show({
      message,
      color: tone === 'error' ? 'danger' : tone === 'success' ? 'success' : 'credentis',
      autoClose: 4000,
    })
  }, [])
  return { api, notify }
}
