import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { Badge, Button, Group, Paper, PasswordInput, Stack, Text, TextInput, ThemeIcon } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconArrowLeft, IconFingerprint, IconKey, IconLock } from '@tabler/icons-react'
import AppShellMobile from '@/components/layout/AppShellMobile'
import ErrorAlert from '@/components/shared/ErrorAlert'
import { milestone } from '@/components/feedback/Milestone'
import api from '@/lib/api'
import { applyPersonalWalletContext, clearAuth, getPersonalWalletTenantId, getPersonalWalletToken } from '@/lib/auth'
import {
  authorizeDevice,
  deviceTrustAvailable,
  enrollLoginDevice,
  enrollThisPhone,
  hasLocalLoginKey,
  rememberedDeviceKeyId,
  removeLoginDevice,
  supportsDeviceLogin,
} from '@/lib/deviceTrust'
import { friendlyRequestError } from '@/lib/requestError'
import { DeviceSecurityPanel, type AccountDevice } from '../../../shared/security/DeviceSecurityPanel'

type TurnOn = 'signin' | 'money'

/** One security feature: what it does, whether it is on, and the PIN-confirmed switch to turn it on. */
function SecurityFeature({
  id,
  icon,
  title,
  detail,
  on,
  available,
  unavailable,
  highlighted,
  busy,
  onTurnOn,
  extra,
}: {
  id: TurnOn
  icon: React.ReactNode
  title: string
  detail: string
  on: boolean
  available: boolean
  unavailable: string
  highlighted: boolean
  busy: boolean
  onTurnOn: (pin: string) => Promise<void>
  extra?: React.ReactNode
}) {
  const [pin, setPin] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const pinRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!highlighted || !ref.current) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ref.current.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
    if (!on && available) pinRef.current?.focus({ preventScroll: true })
  }, [highlighted, on, available])
  return (
    <Paper
      ref={ref}
      id={`security-${id}`}
      p="md"
      radius="md"
      withBorder
      className={highlighted && !on ? 'security-highlight' : undefined}
      style={{ scrollMarginTop: 'calc(72px + var(--app-safe-top))' }}
    >
      <Stack gap="sm">
        <Group gap="md" wrap="nowrap" align="flex-start">
          <ThemeIcon size={40} radius="xl" variant="light" color={on ? 'success' : 'credentis'}>{icon}</ThemeIcon>
          <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
            <Group gap="xs" justify="space-between" wrap="nowrap">
              <Text fw={500} size="md">{title}</Text>
              <Badge variant="light" color={on ? 'success' : 'gray'} radius="sm">{on ? 'On' : 'Off'}</Badge>
            </Group>
            <Text size="sm" c="dimmed">{detail}</Text>
          </Stack>
        </Group>
        {extra}
        {!on && (available ? (
          <Stack gap="sm">
            <PasswordInput
              ref={pinRef}
              label="Your PIN, to confirm it is you"
              value={pin}
              autoComplete="current-password"
              inputMode="numeric"
              onChange={(event) => setPin(event.currentTarget.value)}
            />
            <Button
              radius="xl"
              h={48}
              loading={busy}
              disabled={!pin}
              onClick={() => void onTurnOn(pin).then(() => setPin(''), () => undefined)}
            >
              Turn on
            </Button>
          </Stack>
        ) : (
          <Text size="sm" c="dimmed">{unavailable}</Text>
        ))}
      </Stack>
    </Paper>
  )
}

export default function AccountSecurity() {
  const router = useRouter()
  const [label, setLabel] = useState('My Android phone')
  const [newPin, setNewPin] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState<TurnOn | 'pin' | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [signInSupported, setSignInSupported] = useState(false)
  const [moneySupported, setMoneySupported] = useState(false)
  const [devices, setDevices] = useState<AccountDevice[]>([])
  const [panelKey, setPanelKey] = useState(0)
  const turnOn: TurnOn | null = router.query.turnOn === 'money' ? 'money' : router.query.turnOn === 'signin' ? 'signin' : null

  useEffect(() => {
    setSignInSupported(supportsDeviceLogin())
    setMoneySupported(deviceTrustAvailable())
  }, [])
  const headers = () => ({ Authorization: `Bearer ${getPersonalWalletToken() || ''}` })
  const load = useCallback(async (): Promise<AccountDevice[]> => {
    const result = await api.get('/api/wallet/device-keys', { headers: headers() })
    const list: AccountDevice[] = Array.isArray(result.data) ? result.data : result.data?.devices
    if (!Array.isArray(list)) throw new Error('Could not read your phones. Refresh to try again.')
    const next = list.map((device) => ({
      ...device,
      ...(device.usage === 'login' ? { localLoginKey: hasLocalLoginKey(device.id) } : {}),
    }))
    setDevices(next)
    return next
  }, [])
  const signInOn = devices.some((device) => !device.revokedAt && device.usage === 'login' && device.localLoginKey === true)
  const moneyKeyId = typeof window === 'undefined' ? null : rememberedDeviceKeyId()
  const moneyOn = devices.some((device) => !device.revokedAt && device.usage !== 'login' && device.id === moneyKeyId)

  const remove = async (id: string) => {
    await removeLoginDevice(id)
    clearAuth()
    await router.replace('/login')
  }
  const done = (text: string, celebrate?: string) => {
    setMessage(text)
    setPanelKey((value) => value + 1)
    if (celebrate) milestone.show({ kind: 'security_on', title: text, detail: celebrate })
    else notifications.show({ position: 'bottom-center', message: text, autoClose: 4000 })
  }
  const turnOnSignIn = async (pin: string) => {
    if (busy) return
    setBusy('signin'); setError(null); setMessage(null)
    try {
      await enrollLoginDevice(pin, label.trim() || 'My Android phone')
      done('Sign-in with this phone is on', 'Next time, tap "Sign in with this phone" and use your fingerprint, face or screen lock.')
    } catch (failure) {
      setError(friendlyRequestError(failure, 'Could not turn on sign-in with this phone'))
      throw failure
    } finally { setBusy(null) }
  }
  const turnOnMoney = async (pin: string) => {
    if (busy) return
    setBusy('money'); setError(null); setMessage(null)
    try {
      await enrollThisPhone(`${label.trim() || 'My Android phone'} — money`, pin)
      done('Fingerprint for money is on', 'This phone will ask for your fingerprint or face before money is released, paid out or recorded.')
    } catch (failure) {
      setError(friendlyRequestError(failure, 'Could not turn on fingerprint for money'))
      throw failure
    } finally { setBusy(null) }
  }
  const changePin = async () => {
    if (!/^\d{4,6}$/.test(newPin) || confirmation !== newPin) {
      setError('Enter the same new PIN twice, 4 to 6 digits.')
      return
    }
    setBusy('pin'); setError(null); setMessage(null)
    try {
      const result = await authorizeDevice({ purpose: 'change_pin', newPin, walletId: getPersonalWalletTenantId() || undefined })
      if (!result.token || !result.tenantId) throw new Error('The PIN change was not confirmed.')
      applyPersonalWalletContext(result.token, result.tenantId)
      setNewPin(''); setConfirmation('')
      done('PIN changed. You were signed out on your other phones and browsers.')
    } catch (failure) { setError(friendlyRequestError(failure, 'Could not change your PIN')) }
    finally { setBusy(null) }
  }

  return <AppShellMobile>
    <Stack p="md" gap="lg">
      <Button variant="subtle" color="gray" radius="xl" h={48} leftSection={<IconArrowLeft size={20} />} w="fit-content" onClick={() => void router.push('/settings/')}>
        Settings
      </Button>
      <DeviceSecurityPanel key={panelKey} load={load} remove={remove}>
        <Text size="sm">These are your own phones, even when an organisation is selected.</Text>
        {(signInSupported || moneySupported) && (
          <TextInput label="Name for this phone" value={label} maxLength={80} onChange={(event) => setLabel(event.currentTarget.value)} />
        )}
        <SecurityFeature
          id="signin"
          icon={<IconLock size={22} />}
          title="Sign in with this phone"
          detail="Use your fingerprint, face or screen lock instead of typing your PIN. It also signs you in on the website when you scan its code."
          on={signInOn}
          available={signInSupported}
          unavailable="Needs the Credentis Android app on a phone with a screen lock (Android 11 or later)."
          highlighted={turnOn === 'signin'}
          busy={busy === 'signin'}
          onTurnOn={turnOnSignIn}
        />
        <SecurityFeature
          id="money"
          icon={<IconFingerprint size={22} />}
          title="Confirm money with your fingerprint"
          detail="Before money is released, paid out or recorded, this phone asks for your fingerprint or face. Someone who only knows your PIN cannot do it."
          on={moneyOn}
          available={moneySupported}
          unavailable="Needs the Credentis Android app on a phone with a fingerprint or face unlock."
          highlighted={turnOn === 'money'}
          busy={busy === 'money'}
          onTurnOn={turnOnMoney}
          extra={<Text size="xs" c="dimmed">An owner chooses which money steps ask for it, in organisation settings under Record settings, Phone confirmation.</Text>}
        />
        {signInSupported && (
          <Paper p="md" radius="md" withBorder>
            <Stack gap="sm">
              <Group gap="md" wrap="nowrap">
                <ThemeIcon size={40} radius="xl" variant="light" color="credentis"><IconKey size={22} /></ThemeIcon>
                <Stack gap={2} style={{ flex: 1 }}>
                  <Text fw={500}>Forgot your PIN?</Text>
                  <Text size="sm" c="dimmed">A phone that already signs you in can set a new PIN. This is your Credentis PIN, not your phone&apos;s screen lock.</Text>
                </Stack>
              </Group>
              <PasswordInput label="New PIN" inputMode="numeric" autoComplete="new-password" value={newPin} onChange={(event) => setNewPin(event.currentTarget.value)} />
              <PasswordInput label="New PIN again" inputMode="numeric" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.currentTarget.value)} />
              <Button variant="light" radius="xl" h={48} loading={busy === 'pin'} onClick={() => void changePin()}>Set new PIN with this phone</Button>
            </Stack>
          </Paper>
        )}
        {error && <ErrorAlert message={error} />}
        {message && <Text role="status" c="success">{message}</Text>}
      </DeviceSecurityPanel>
    </Stack>
  </AppShellMobile>
}
