import React, { useCallback } from 'react'
import { useRouter } from 'next/router'
import { Button, Stack, Title } from '@mantine/core'
import { IconArrowLeft } from '@tabler/icons-react'
import AppShellMobile from '@/components/layout/AppShellMobile'
import api from '@/lib/api'
import { getPersonalWalletToken, getUserName, getUserPhone } from '@/lib/auth'
import { friendlyRequestError } from '@/lib/requestError'
import { IdentityVerificationPanel, type RegistryRequestView } from '../../../shared/IdentityVerification'

/** Ask the Central Registry later, or add a date of birth to the identity card now. */
export default function IdentitySettingsPage() {
  const router = useRouter()
  const personal = useCallback(
    () => ({ headers: { Authorization: `Bearer ${getPersonalWalletToken() || ''}` } }),
    [],
  )
  const load = useCallback(async (): Promise<RegistryRequestView> => {
    const res = await api.get<RegistryRequestView>('/api/wallet/auth/identity-verification/status', personal())
    return res.data
  }, [personal])
  const requestRegistry = useCallback(async (): Promise<RegistryRequestView> => {
    const res = await api.post<RegistryRequestView>('/api/wallet/auth/identity-verification/registry-request', {}, personal())
    return res.data
  }, [personal])
  const selfAttest = useCallback(async (dateOfBirth: string) => {
    try {
      await api.post(
        '/api/wallet/auth/identity-verification/self-attest',
        { dateOfBirth, displayName: getUserName() || undefined, phone: getUserPhone() || undefined },
        personal(),
      )
    } catch (err) {
      throw new Error(friendlyRequestError(err, 'Could not add the date of birth.'))
    }
  }, [personal])

  return (
    <AppShellMobile>
      <Stack gap="md" p="md">
        <Button variant="subtle" color="gray" leftSection={<IconArrowLeft size={16} />} w="fit-content" h={48} onClick={() => router.back()}>
          Back
        </Button>
        <Title order={3}>Date of birth</Title>
        <IdentityVerificationPanel load={load} requestRegistry={requestRegistry} selfAttest={selfAttest} />
      </Stack>
    </AppShellMobile>
  )
}
