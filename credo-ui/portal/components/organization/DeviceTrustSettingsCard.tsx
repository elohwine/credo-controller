import { useEffect, useState } from 'react'
import axios from 'axios'
import { Card, Stack, Switch, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { getOrgScopedToken } from '@/utils/organizationContext'

const ACTIONS = [
  { id: 'release_funds', label: 'Releasing money' },
  { id: 'trigger_payout', label: 'Worker payout' },
  { id: 'record_payment', label: 'Recording a payment' },
]

type Policy = { enabled: boolean; requiredActions: string[] }

/** Same organisation choice as the phone. Enrollment itself happens on the phone. */
export default function DeviceTrustSettingsCard({ orgTenantId, canEdit }: { orgTenantId: string; canEdit: boolean }) {
  const [policy, setPolicy] = useState<Policy | null>(null)
  const [saving, setSaving] = useState(false)
  const backendUrl = process.env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'

  const load = () => {
    const token = getOrgScopedToken()
    if (!token) return
    void axios
      .get(`${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/proof-vc-policy`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => setPolicy(res.data?.deviceTrust || { enabled: false, requiredActions: ACTIONS.map((item) => item.id) }))
      .catch(() => setPolicy(null))
  }

  useEffect(() => { load() }, [orgTenantId])

  const save = async (next: Policy) => {
    const token = getOrgScopedToken()
    if (!token) return
    setSaving(true)
    setPolicy(next)
    try {
      await axios.patch(
        `${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/proof-vc-policy`,
        { deviceTrust: next },
        { headers: { Authorization: `Bearer ${token}` } },
      )
      notifications.show({ title: 'Saved', message: 'Phone confirmation updated.', color: 'green' })
    } catch (err: any) {
      notifications.show({ title: 'Could not save', message: err?.response?.data?.message || 'Please try again.', color: 'red' })
      load()
    } finally {
      setSaving(false)
    }
  }

  if (!policy) return null
  return (
    <Card withBorder radius="md" p="lg">
      <Stack gap="sm">
        <Title order={4}>Phone confirmation</Title>
        <Text size="sm" c="dimmed">
          When this is on, the chosen money steps must be confirmed with fingerprint or face on an enrolled phone.
          A browser cannot complete them. People enroll the phone in the Android app.
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
      </Stack>
    </Card>
  )
}
