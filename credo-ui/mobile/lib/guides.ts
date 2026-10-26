import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { getPersonalWalletTenantId, getPersonalWalletToken } from '@/lib/auth'
import { useGuides, type GuideClient, type GuideKey } from '../../shared/guides'

const headers = () => ({ Authorization: `Bearer ${getPersonalWalletToken() || ''}` })

/** Guide progress belongs to the person, so it always uses the personal wallet session. */
export const guideClient: GuideClient = {
  get: async (path) => (await api.get(path, { headers: headers() })).data,
  put: async (path, body) => (await api.put(path, body, { headers: headers() })).data,
}

export const TIP_KEYS: GuideKey[] = ['tip_inbox', 'tip_records', 'tip_network', 'tip_scan', 'tip_operations', 'tip_org_settings']

export function useAppGuides() {
  const [account, setAccount] = useState<string | null>(null)
  useEffect(() => {
    setAccount(getPersonalWalletTenantId())
  }, [])
  return useGuides(account ? guideClient : null, account)
}
