import React, { useState, useContext, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Layout from '@/components/Layout'
import { PhoneField } from '../../../shared/PhoneField'
import { EnvContext } from '@/pages/_app'
import axios from 'axios'
import {
  Container,
  Paper,
  Title,
  PasswordInput,
  Button,
  Text,
  Anchor,
  Stack,
  Alert,
  Checkbox,
  Divider,
  Group,
  Modal,
  Code,
  CopyButton,
  ActionIcon,
  Tooltip,
} from '@mantine/core'
import { IconAlertCircle, IconCheck, IconWallet, IconCopy, IconQrcode } from '@tabler/icons-react'
import QRCode from 'react-qr-code'
import { applyPersonalLogin } from '@/lib/personalSession'
import { PIN_CHANGE_FLAG } from '../../../shared/security/AccountSecurity'
import { PRODUCT_NAME } from '@/utils/orgProfile'
import { BrandMark } from '../../../shared/BrandMark'

/** Only a path inside this site; anything else (another site, `//host`) goes home. */
function safeReturnUrl(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\')
    ? value
    : '/'
}

export default function LoginPage() {
  const router = useRouter()
  const env = useContext(EnvContext)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // SSI Login state
  const [ssiLoading, setSsiLoading] = useState(false)
  const [ssiModalOpen, setSsiModalOpen] = useState(false)
  const [authRequest, setAuthRequest] = useState<string | null>(null)
  const walletAttempt = useRef(0)
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(
    () => () => {
      walletAttempt.current++
      if (pollTimer.current) clearTimeout(pollTimer.current)
    },
    [],
  )

  const [form, setForm] = useState({
    identifier: '',
    pin: '',
    rememberMe: false,
  })

  const holderBackend = env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'

  useEffect(() => {
    if (!router.isReady || typeof window === 'undefined') return

    const hasPersonalSession = Boolean(localStorage.getItem('authToken') || localStorage.getItem('walletToken'))

    if (hasPersonalSession) {
      router.replace('/')
      return
    }

    setAuthChecked(true)
  }, [router])

  if (!authChecked) {
    return null
  }

  // PIN-based login (Web2 fallback)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const identifier = form.identifier.trim()
    const email = identifier.includes('@') ? identifier : undefined
    const phone = email ? undefined : identifier
    if (!identifier) {
      setError('Please enter phone or email')
      setLoading(false)
      return
    }

    try {
      // Use SSI Auth PIN login - no PII stored, just hash lookup
      const response = await axios.post(`${holderBackend}/api/ssi/auth/login/pin`, {
        phone,
        email,
        pin: form.pin,
      })

      console.log('[Login] Success:', response.data)
      setSuccess(true)

      // Store auth token and wallet info
      applyPersonalLogin(response.data, identifier)

      // Redirect to shop or dashboard; a temporary PIN must be replaced first.
      const returnUrl = safeReturnUrl(router.query.returnUrl)
      if (response.data?.mustChangePin) {
        localStorage.setItem(PIN_CHANGE_FLAG, '1')
        router.replace(`/auth/change-pin?returnUrl=${encodeURIComponent(returnUrl)}`)
        return
      }
      localStorage.removeItem(PIN_CHANGE_FLAG)
      setTimeout(() => {
        router.push(returnUrl)
      }, 1000)
    } catch (err: any) {
      console.error('[Login] Error:', err)
      setError(err.response?.data?.message || err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  // SSI Login - Step 1: Get authorization request
  const handleWalletLogin = async () => {
    const attempt = ++walletAttempt.current
    if (pollTimer.current) clearTimeout(pollTimer.current)
    setSsiLoading(true)
    setError(null)
    try {
      const response = await axios.post(`${holderBackend}/api/wallet/auth/login-wallet`)
      if (attempt !== walletAttempt.current) return
      setAuthRequest(response.data.authorizationRequest)
      setSsiModalOpen(true)

      // The poll token never leaves this page; it is the only way to collect the session.
      pollForVerification(response.data.loginId, response.data.pollToken, attempt)
    } catch (err: any) {
      if (attempt !== walletAttempt.current) return
      console.error('[SSI Login] Error:', err)
      setError(err.response?.data?.message || 'Could not start phone sign-in. Please try again.')
    } finally {
      setSsiLoading(false)
    }
  }

  // Poll for SSI login verification
  const pollForVerification = async (loginId: string, pollToken: string, attempt: number) => {
    const maxAttempts = 150 // 5 minutes at 2s intervals, the sign-in lifetime
    let attempts = 0

    const poll = async () => {
      if (attempt !== walletAttempt.current) return
      if (attempts >= maxAttempts) {
        setError('Login timed out. Please try again.')
        setSsiModalOpen(false)
        return
      }

      try {
        const response = await axios.get(
          `${holderBackend}/api/wallet/auth/login-wallet/${encodeURIComponent(loginId)}`,
          { headers: { 'x-login-poll-token': pollToken } },
        )
        if (attempt !== walletAttempt.current) return

        if (response.data.status === 'verified') {
          applyPersonalLogin(response.data)

          setSuccess(true)
          setSsiModalOpen(false)

          const returnUrl = safeReturnUrl(router.query.returnUrl)
          setTimeout(() => router.push(returnUrl), 1000)
          return
        }
      } catch (err: any) {
        if (attempt !== walletAttempt.current) return
        // A rejected, used or expired sign-in will not recover by polling.
        setError(
          err.response?.data?.details || err.response?.data?.message || 'Phone sign-in failed. Please try again.',
        )
        setSsiModalOpen(false)
        return
      }

      attempts++
      pollTimer.current = setTimeout(poll, 2000)
    }

    poll()
  }

  return (
    <Layout title="Login">
      <Container size="xs" py="xl">
        <Paper shadow="md" p="xl" radius="md" withBorder>
          <Stack align="center" gap={4} mb="lg">
            <span style={{ color: '#2188CA', display: 'flex' }}>
              <BrandMark size={48} />
            </span>
            <Title order={2} ta="center">
              Sign in to {PRODUCT_NAME}
            </Title>
            <Text size="sm" c="dimmed" ta="center">
              Jobs, your team and client payments in one place.
            </Text>
          </Stack>

          {success ? (
            <Alert icon={<IconCheck size={16} />} title="Login Successful!" color="green">
              Redirecting...
            </Alert>
          ) : (
            <form onSubmit={handleSubmit}>
              <Stack gap="md">
                {router.query.sessionExpired === '1' && (
                  <Alert icon={<IconAlertCircle size={16} />} title="Please sign in again" color="yellow">
                    Your previous session has ended. Sign in with your phone or PIN to continue.
                  </Alert>
                )}
                {error && (
                  <Alert icon={<IconAlertCircle size={16} />} title="Error" color="red">
                    {error}
                  </Alert>
                )}

                <PhoneField
                  surface="portal"
                  label="Phone or email"
                  allowEmail
                  placeholder="77 123 4567"
                  required
                  value={form.identifier}
                  onChange={(identifier) => setForm({ ...form, identifier })}
                />

                <PasswordInput
                  label="PIN"
                  placeholder="Account PIN"
                  required
                  maxLength={6}
                  value={form.pin}
                  onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                />

                <Checkbox
                  label="Remember me"
                  checked={form.rememberMe}
                  onChange={(e) => setForm({ ...form, rememberMe: e.currentTarget.checked })}
                />

                <Button type="submit" fullWidth loading={loading} mt="md">
                  Sign In
                </Button>

                <Divider label="or" labelPosition="center" my="md" />

                {/* SSI Login - Present your Identity VC */}
                <Button
                  variant="outline"
                  fullWidth
                  leftSection={<IconWallet size={18} />}
                  loading={ssiLoading}
                  onClick={handleWalletLogin}
                >
                  Sign in with your phone
                </Button>

                <Text ta="center" size="sm" c="dimmed">
                  New here?{' '}
                  <Anchor component={Link} href="/auth/register">
                    Create an account
                  </Anchor>
                </Text>
                <Text ta="center" size="xs" c="dimmed">
                  Joining a team? Open the invite link your manager sent you.
                </Text>
              </Stack>
            </form>
          )}
        </Paper>
      </Container>

      {/* SSI Login Modal - Show QR code for wallet scan */}
      <Modal
        opened={ssiModalOpen}
        onClose={() => {
          walletAttempt.current++
          if (pollTimer.current) clearTimeout(pollTimer.current)
          setSsiModalOpen(false)
        }}
        title={
          <Group gap="xs">
            <IconWallet size={24} />
            <Text fw={600}>Sign in with your phone</Text>
          </Group>
        }
        centered
        size="md"
      >
        <Stack align="center" gap="lg">
          <Text ta="center" size="sm" c="dimmed">
            {`Scan this code with the ${PRODUCT_NAME} phone app to sign in.`}
          </Text>

          {authRequest && (
            <>
              <Paper withBorder p="md" radius="md" bg="white">
                <QRCode value={`credentis://device-login?request=${encodeURIComponent(authRequest)}`} size={200} />
              </Paper>
              <Button component="a" href={`credentis://device-login?request=${encodeURIComponent(authRequest)}`}>
                Open {PRODUCT_NAME} on this device
              </Button>

              <Text ta="center" size="xs" c="dimmed">
                Or copy the link and open it on your phone
              </Text>

              <Group gap="xs" wrap="nowrap" style={{ maxWidth: '100%' }}>
                <Code
                  block
                  style={{
                    fontSize: '10px',
                    maxWidth: '280px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {authRequest.slice(0, 60)}...
                </Code>
                <CopyButton value={`credentis://device-login?request=${encodeURIComponent(authRequest)}`}>
                  {({ copied, copy }) => (
                    <Tooltip label={copied ? 'Copied!' : 'Copy'}>
                      <ActionIcon color={copied ? 'teal' : 'gray'} onClick={copy}>
                        <IconCopy size={16} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </CopyButton>
              </Group>
            </>
          )}

          <Text ta="center" size="sm" c="blue">
            Waiting for your phone...
          </Text>
        </Stack>
      </Modal>
    </Layout>
  )
}
