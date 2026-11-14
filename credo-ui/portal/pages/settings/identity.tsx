import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import axios from 'axios'
import { Anchor, Container, Stack, Text, Title } from '@mantine/core'
import Layout from '@/components/Layout'
import { getPersonalWalletToken } from '@/utils/portalTenant'
import { IdentityVerificationPanel, type RegistryRequestView } from '../../../shared/IdentityVerification'

/** Same choice as the phone: ask the Central Registry later, or add a date of birth now. */
export default function IdentitySettingsPage() {
  const [base, setBase] = useState('http://localhost:3000')
  useEffect(() => {
    axios.get<{ NEXT_PUBLIC_VC_REPO?: string }>('/api/env').then((res) => {
      if (res.data.NEXT_PUBLIC_VC_REPO) setBase(res.data.NEXT_PUBLIC_VC_REPO)
    }).catch(() => undefined)
  }, [])
  const headers = () => ({ Authorization: `Bearer ${getPersonalWalletToken() || ''}` })

  const load = useCallback(async (): Promise<RegistryRequestView> => {
    const res = await axios.get<RegistryRequestView>(`${base}/api/wallet/auth/identity-verification/status`, { headers: headers() })
    return res.data
  }, [base])
  const requestRegistry = useCallback(async (): Promise<RegistryRequestView> => {
    const res = await axios.post<RegistryRequestView>(`${base}/api/wallet/auth/identity-verification/registry-request`, {}, { headers: headers() })
    return res.data
  }, [base])
  const selfAttest = useCallback(async (dateOfBirth: string) => {
    try {
      const displayName = localStorage.getItem('credoUserName') || undefined
      const phone = localStorage.getItem('walletPhone') || undefined
      await axios.post(
        `${base}/api/wallet/auth/identity-verification/self-attest`,
        { dateOfBirth, displayName, phone },
        { headers: headers() },
      )
    } catch (err: any) {
      throw new Error(err?.response?.data?.message || 'Could not add the date of birth.')
    }
  }, [base])

  return (
    <Layout>
      <Container size="sm" py="xl">
        <Stack gap="md">
          <Anchor component={Link} href="/settings" size="sm">← Settings</Anchor>
          <div>
            <Title order={2}>Date of birth</Title>
            <Text size="sm" c="dimmed">Optional. Your identity card works without it.</Text>
          </div>
          <IdentityVerificationPanel load={load} requestRegistry={requestRegistry} selfAttest={selfAttest} />
        </Stack>
      </Container>
    </Layout>
  )
}
