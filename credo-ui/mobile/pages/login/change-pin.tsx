import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { Box, Button, Paper, Stack, Text, Title } from '@mantine/core'
import api from '@/lib/api'
import { applyPersonalWalletContext, clearAuth, getPersonalWalletToken, syncOrgContextFromServer } from '@/lib/auth'
import { BrandMark } from '../../../shared/BrandMark'
import { ChangePinForm, PIN_CHANGE_FLAG } from '../../../shared/security/AccountSecurity'

function safeReturnTo(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/login')
    ? value
    : '/inbox'
}

/**
 * Opened right after signing in with a PIN an organisation set. Nothing else opens until the
 * person chooses their own, so the person who set the temporary one cannot keep using it.
 */
export default function ChangePinPage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)

  const finish = async () => {
    localStorage.removeItem(PIN_CHANGE_FLAG)
    await syncOrgContextFromServer().catch(() => false)
    router.replace(safeReturnTo(router.query.returnTo))
  }

  useEffect(() => {
    if (!router.isReady) return
    const personal = getPersonalWalletToken()
    setToken(personal)
    if (!personal) {
      router.replace('/login')
      return
    }
    // A flag left from an earlier session must not hold anyone here once the PIN is their own.
    api
      .get('/api/wallet/auth/security-status', { headers: { Authorization: `Bearer ${personal}` } })
      .then((res) => {
        if (!res.data?.mustChangePin) void finish()
      })
      .catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady])

  const submit = async (body: { currentPin: string; newPin: string }) => {
    const res = await api.post('/api/wallet/auth/pin/change', body, { headers: { Authorization: `Bearer ${token}` } })
    applyPersonalWalletContext(res.data.token, res.data.tenantId)
    await finish()
  }

  const signOut = () => {
    localStorage.removeItem(PIN_CHANGE_FLAG)
    clearAuth()
    router.replace('/login')
  }

  return (
    <Box p="md" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Paper withBorder radius="md" p="lg" w="100%" maw={420}>
        <Stack gap="sm">
          <BrandMark size={36} />
          <Stack gap={2}>
            <Title order={4}>Choose your own PIN</Title>
            <Text size="sm" c="dimmed">
              You signed in with a temporary PIN from your organisation. Replace it with one only you know before you
              continue.
            </Text>
          </Stack>
          {token && <ChangePinForm temporary submit={submit} submitLabel="Save PIN and continue" />}
          <Button variant="subtle" color="gray" size="sm" onClick={signOut}>
            Sign out
          </Button>
        </Stack>
      </Paper>
    </Box>
  )
}
