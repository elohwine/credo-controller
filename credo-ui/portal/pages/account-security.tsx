import React, { useCallback, useContext } from 'react'
import { useRouter } from 'next/router'
import axios from 'axios'
import { Anchor, Container, Text } from '@mantine/core'
import Layout from '@/components/Layout'
import { EnvContext } from '@/pages/_app'
import { getPersonalWalletToken } from '@/utils/portalTenant'
import { clearCurrentSession } from '@/lib/savedAccounts'
import { DeviceSecurityPanel, type AccountDevice } from '../../shared/security/DeviceSecurityPanel'
import Link from 'next/link'

export default function AccountSecurity() {
  const env = useContext(EnvContext)
  const router = useRouter()
  const backend = env?.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'
  const headers = () => ({ Authorization: `Bearer ${getPersonalWalletToken() || ''}` })
  const load = useCallback(async (): Promise<AccountDevice[]> => {
    const result = (await axios.get(`${backend}/api/wallet/device-keys`, { headers: headers() })).data
    return Array.isArray(result) ? result : result?.devices || []
  }, [backend])
  const remove = async (id: string) => {
    await axios.delete(`${backend}/api/wallet/device-keys/${encodeURIComponent(id)}`, { headers: headers() })
    clearCurrentSession()
    await router.replace('/auth/login')
  }
  return <Layout><Container size="sm" py="xl">
    <Anchor component={Link} href="/settings" size="sm" mb="md" display="inline-block">← Settings</Anchor>
    <DeviceSecurityPanel load={load} remove={remove}>
      <Text size="sm">Device enrollment and screen-lock confirmation are available in the Android app. This page lists and removes your personal device keys; it does not enroll this browser or change organisation payment controls.</Text>
    </DeviceSecurityPanel>
  </Container></Layout>
}
