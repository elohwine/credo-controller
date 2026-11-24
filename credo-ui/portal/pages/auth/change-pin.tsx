import React, { useContext, useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import axios from 'axios'
import { Box, Button, Paper, Stack, Text, Title } from '@mantine/core'
import { EnvContext } from '@/pages/_app'
import { applyPersonalLogin } from '@/lib/personalSession'
import { clearCurrentSession } from '@/lib/savedAccounts'
import { getPersonalToken } from '@/utils/organizationContext'
import { BrandMark } from '../../../shared/BrandMark'
import { ChangePinForm, PIN_CHANGE_FLAG } from '../../../shared/security/AccountSecurity'

function safeReturnUrl(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/auth')
    ? value
    : '/'
}

/**
 * Opened right after signing in with a PIN an organisation set. Nothing else opens until the
 * person chooses their own, so the person who set the temporary one cannot keep using it.
 */
export default function ChangePinPage() {
  const router = useRouter()
  const env = useContext(EnvContext)
  const backend = env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'
  const [token, setToken] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (!router.isReady) return
    const personal = getPersonalToken()
    setToken(personal)
    setChecked(true)
    if (!personal) {
      router.replace('/auth/login')
      return
    }
    // A flag left from an earlier session must not hold anyone here once the PIN is their own.
    axios
      .get(`${backend}/api/wallet/auth/security-status`, { headers: { Authorization: `Bearer ${personal}` } })
      .then((res) => {
        if (res.data?.mustChangePin) return
        localStorage.removeItem(PIN_CHANGE_FLAG)
        window.location.replace(safeReturnUrl(router.query.returnUrl))
      })
      .catch(() => undefined)
  }, [router, backend])

  const submit = async (body: { currentPin: string; newPin: string }) => {
    const res = await axios.post(`${backend}/api/wallet/auth/pin/change`, body, {
      headers: { Authorization: `Bearer ${token}` },
    })
    applyPersonalLogin({ token: res.data.token, tenantId: res.data.tenantId })
    localStorage.removeItem(PIN_CHANGE_FLAG)
    window.location.replace(safeReturnUrl(router.query.returnUrl))
  }

  const signOut = () => {
    localStorage.removeItem(PIN_CHANGE_FLAG)
    clearCurrentSession()
    router.replace('/auth/login')
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
          {checked && token && <ChangePinForm temporary submit={submit} submitLabel="Save PIN and continue" />}
          <Button variant="subtle" color="gray" size="xs" onClick={signOut}>
            Sign out
          </Button>
        </Stack>
      </Paper>
    </Box>
  )
}
