import { useContext, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { EnvContext } from '@/pages/_app'
import { getPersonalWalletTenantId, getPersonalWalletToken } from '@/utils/portalTenant'
import { useGuides, type GuideClient, type GuideKey } from '../../shared/guides'

export const TIP_KEYS: GuideKey[] = ['tip_inbox', 'tip_records', 'tip_network', 'tip_scan', 'tip_operations', 'tip_org_settings']

const headers = () => ({ Authorization: `Bearer ${getPersonalWalletToken() || ''}` })

export function makeGuideClient(backend: string): GuideClient {
  return {
    get: async (path) => (await axios.get(`${backend}${path}`, { headers: headers() })).data,
    put: async (path, body) => (await axios.put(`${backend}${path}`, body, { headers: headers() })).data,
  }
}

/** Guide progress belongs to the person, so it always uses the personal wallet session. */
export function useGuideClient(): GuideClient {
  const env = useContext(EnvContext)
  const backend = env?.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'
  return useMemo(() => makeGuideClient(backend), [backend])
}

export function useAppGuides() {
  const client = useGuideClient()
  const [account, setAccount] = useState<string | null>(null)
  useEffect(() => {
    setAccount(getPersonalWalletTenantId() || null)
  }, [])
  return { ...useGuides(account ? client : null, account), client }
}
