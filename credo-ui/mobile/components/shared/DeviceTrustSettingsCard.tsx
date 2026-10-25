import React, { useCallback, useEffect, useState } from 'react'
import { Button, Group, Paper, PasswordInput, Stack, Switch, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import api from '@/lib/api'
import { getPreferredToken, getWalletToken } from '@/lib/auth'
import { deviceTrustAvailable, enrollThisPhone, rememberedDeviceKeyId, revokeRememberedPhone } from '@/lib/deviceTrust'

const ACTIONS = [
  { id: 'release_funds', label: 'Releasing money' },
  { id: 'trigger_payout', label: 'Worker payout' },
  { id: 'record_payment', label: 'Recording a payment' },
]

type Policy = { enabled: boolean; requiredActions: string[] }

/** Organisation choice: which money steps need fingerprint or face on an enrolled phone. */
export default function DeviceTrustSettingsCard({ orgTenantId, canEdit }: { orgTenantId: string | null; canEdit: boolean }) {
  const [policy, setPolicy] = useState<Policy | null>(null)
  const [saving, setSaving] = useState(false)
  const [enrolled, setEnrolled] = useState(false)
  const [enrollmentPin, setEnrollmentPin] = useState('')

  const headers = () => {
    const token = getPreferredToken()
    return token ? { Authorization: `Bearer ${token}` } : undefined
  }

  const load = useCallback(async () => {
    if (!orgTenantId) return
    try {
      const res = await api.get(`/api/organizations/${encodeURIComponent(orgTenantId)}/proof-vc-policy`, { headers: headers() })
      setPolicy(res.data?.deviceTrust || { enabled: false, requiredActions: ACTIONS.map((item) => item.id) })
    } catch {
      setPolicy(null)
    }
    setEnrolled(Boolean(rememberedDeviceKeyId()))
  }, [orgTenantId])

  useEffect(() => { void load() }, [load])

  const save = async (next: Policy) => {
    if (!orgTenantId) return
    setSaving(true)
    setPolicy(next)
    try {
      await api.patch(`/api/organizations/${encodeURIComponent(orgTenantId)}/proof-vc-policy`, { deviceTrust: next }, { headers: headers() })
      notifications.show({ title: 'Saved', message: 'Phone confirmation updated.', color: 'green' })
    } catch (err: any) {
      notifications.show({ title: 'Could not save', message: err?.response?.data?.message || 'Please try again.', color: 'red' })
      void load()
    } finally {
      setSaving(false)
    }
  }

  const enroll = async () => {
    if (!getWalletToken()) {
      notifications.show({ title: 'Sign in first', message: 'Use your personal wallet before enrolling this phone.', color: 'yellow' })
      return
    }
    try {
      await enrollThisPhone('This phone — money steps', enrollmentPin)
      setEnrollmentPin('')
      setEnrolled(true)
      notifications.show({ title: 'Phone enrolled', message: 'Fingerprint or face will confirm money steps.', color: 'green' })
    } catch (err: any) {
      notifications.show({ title: 'Could not enroll', message: err?.message || 'This phone could not create a secure key.', color: 'red' })
    }
  }

  if (!policy) return null
  return (
    <Paper p="md" radius="md" withBorder>
      <Stack gap="sm">
        <Text fw={700}>Phone confirmation</Text>
        <Text size="xs" c="dimmed">
          Money steps can ask for fingerprint or face on the enrolled phone. A browser cannot complete those steps.
          The platform card and the organisation card are still required.
        </Text>
        <Switch
          label="Ask before releasing money"
          checked={policy.enabled}
          disabled={!canEdit || saving}
          onChange={(event) => void save({ ...policy, enabled: event.currentTarget.checked })}
        />
        {policy.enabled && ACTIONS.map((action) => (
          <Switch
            key={action.id}
            label={action.label}
            checked={policy.requiredActions.includes(action.id)}
            disabled={!canEdit || saving}
            onChange={(event) => {
              const requiredActions = event.currentTarget.checked
                ? [...policy.requiredActions, action.id]
                : policy.requiredActions.filter((item) => item !== action.id)
              void save({ ...policy, requiredActions })
            }}
          />
        ))}
        <Group>
          {deviceTrustAvailable() && !enrolled && <PasswordInput label="Confirm your personal account PIN" value={enrollmentPin} inputMode="numeric" onChange={(event) => setEnrollmentPin(event.currentTarget.value)} />}
          {deviceTrustAvailable() && !enrolled && <Button size="xs" onClick={() => void enroll()}>Enroll this phone</Button>}
          {enrolled && (
            <Button size="xs" variant="default" onClick={() => void revokeRememberedPhone().then(() => setEnrolled(false))}>
              Remove this phone
            </Button>
          )}
          {!deviceTrustAvailable() && <Text size="xs" c="dimmed">Enrollment is available in the Android app.</Text>}
        </Group>
      </Stack>
    </Paper>
  )
}
