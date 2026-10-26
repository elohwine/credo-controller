import React, { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { Button, Divider, PasswordInput, Stack, Text, TextInput } from '@mantine/core'
import { IconArrowLeft } from '@tabler/icons-react'
import AppShellMobile from '@/components/layout/AppShellMobile'
import ErrorAlert from '@/components/shared/ErrorAlert'
import api from '@/lib/api'
import { applyPersonalWalletContext, clearAuth, getPersonalWalletTenantId, getPersonalWalletToken } from '@/lib/auth'
import { authorizeDevice, enrollLoginDevice, hasLocalLoginKey, removeLoginDevice, supportsDeviceLogin } from '@/lib/deviceTrust'
import { friendlyRequestError } from '@/lib/requestError'
import { DeviceSecurityPanel, type AccountDevice } from '../../../shared/security/DeviceSecurityPanel'

export default function AccountSecurity() {
  const router = useRouter()
  const [pin, setPin] = useState('')
  const [label, setLabel] = useState('My Android phone')
  const [newPin, setNewPin] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [supported, setSupported] = useState(false)
  useEffect(() => { setSupported(supportsDeviceLogin()) }, [])
  const headers = () => ({ Authorization: `Bearer ${getPersonalWalletToken() || ''}` })
  const load = useCallback(async (): Promise<AccountDevice[]> => {
    const result = await api.get('/api/wallet/device-keys', { headers: headers() })
    const devices: AccountDevice[] = Array.isArray(result.data) ? result.data : result.data?.devices
    if (!Array.isArray(devices)) throw new Error('The enrolled-device response is invalid. Refresh to try again.')
    return devices.map((device) => ({
      ...device,
      ...(device.usage === 'login' ? { localLoginKey: hasLocalLoginKey(device.id) } : {}),
    }))
  }, [])
  const remove = async (id: string) => {
    await removeLoginDevice(id)
    clearAuth()
    await router.replace('/login')
  }
  const enroll = async () => {
    if (busy) return
    setBusy(true); setError(null); setMessage(null)
    try {
      await enrollLoginDevice(pin, label.trim() || 'My Android phone')
      setPin('')
      setMessage('This device is enrolled. Use Refresh below to see the verified key. You can now use this device at sign-in.')
    } catch (error) { setError(friendlyRequestError(error, 'Could not enroll this phone')) }
    finally { setBusy(false) }
  }
  const changePin = async () => {
    if (!/^\d{4,6}$/.test(newPin) || confirmation !== newPin) {
      setError('Enter matching account PINs of 4 to 6 digits.')
      return
    }
    setBusy(true); setError(null); setMessage(null)
    try {
      const result = await authorizeDevice({ purpose: 'change_pin', newPin, walletId: getPersonalWalletTenantId() || undefined })
      if (!result.token || !result.tenantId) throw new Error('The account PIN change was not confirmed.')
      applyPersonalWalletContext(result.token, result.tenantId)
      setNewPin(''); setConfirmation('')
      setMessage('Account PIN changed. Other sessions have been signed out.')
    } catch (error) { setError(friendlyRequestError(error, 'Could not change your account PIN')) }
    finally { setBusy(false) }
  }
  return <AppShellMobile>
    <Stack p="md" gap="lg">
      <Button variant="subtle" color="gray" leftSection={<IconArrowLeft size={16} />} w="fit-content" onClick={() => void router.push('/settings/')}>
        Settings
      </Button>
      <DeviceSecurityPanel load={load} remove={remove}>
        <Text size="sm">These are your personal devices, even when an organisation is selected.</Text>
        {supported ? <Stack gap="md">
          <TextInput label="Device name" value={label} maxLength={80} onChange={(event) => setLabel(event.currentTarget.value)} />
          <PasswordInput label="Confirm your current account PIN to enroll" value={pin} autoComplete="current-password" inputMode="numeric" onChange={(event) => setPin(event.currentTarget.value)} />
          <Button size="lg" loading={busy} disabled={!pin} onClick={() => void enroll()}>Enroll this device for sign-in</Button>
          <Divider />
          <Text fw={600}>Forgot your account PIN?</Text>
          <Text size="sm">An already-enrolled device can approve a new PIN. This changes your Credentis account PIN, not your phone screen lock.</Text>
          <PasswordInput label="New account PIN" inputMode="numeric" autoComplete="new-password" value={newPin} onChange={(event) => setNewPin(event.currentTarget.value)} />
          <PasswordInput label="Repeat new account PIN" inputMode="numeric" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.currentTarget.value)} />
          <Button variant="light" loading={busy} onClick={() => void changePin()}>Confirm PIN change with this device</Button>
        </Stack> : <Text>Enroll using the updated Android app on a phone with a secure screen lock (Android 11 or later).</Text>}
        {error && <ErrorAlert message={error} />}
        {message && <Text role="status" c="green">{message}</Text>}
      </DeviceSecurityPanel>
    </Stack>
  </AppShellMobile>
}
