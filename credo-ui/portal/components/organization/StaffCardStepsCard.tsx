import { useEffect, useState } from 'react'
import axios from 'axios'
import { Badge, Card, Group, NumberInput, Select, Stack, Switch, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { getOrgScopedToken } from '@/utils/organizationContext'
import {
  STEP_ASSURANCE_MODES,
  stepAssuranceModeLabel,
  stepAssuranceView,
  withStepMode,
  type StepAssuranceSetting,
  type StepAssuranceView,
} from '../../../shared/stepAssurance'

/** Which steps need the staff card from the wallet. Same choice as the phone (Settings → Records). */
export default function StaffCardStepsCard({ orgTenantId, canEdit }: { orgTenantId: string; canEdit: boolean }) {
  const [view, setView] = useState<StepAssuranceView | null>(null)
  const [saving, setSaving] = useState(false)
  const backendUrl = process.env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'
  const url = `${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/proof-vc-policy`

  const load = () => {
    const token = getOrgScopedToken()
    if (!token) return
    void axios
      .get(url, { headers: { Authorization: 'Bearer ' + token } })
      .then((res) => setView(stepAssuranceView(res.data)))
      .catch(() => setView(null))
  }

  useEffect(() => { load() }, [orgTenantId])

  const save = async (setting: StepAssuranceSetting) => {
    const token = getOrgScopedToken()
    if (!token) return
    setSaving(true)
    try {
      const res = await axios.patch(url, { stepAssurance: setting }, { headers: { Authorization: 'Bearer ' + token } })
      setView(stepAssuranceView(res.data))
      notifications.show({ title: 'Saved', message: 'Staff card steps updated.', color: 'green' })
    } catch (err: any) {
      notifications.show({ title: 'Could not save', message: err?.response?.data?.message || 'Please try again.', color: 'red' })
      load()
    } finally {
      setSaving(false)
    }
  }

  if (!view) return null
  const limitOn = view.setting.cardRequiredAbove !== null
  return (
    <Card withBorder radius="md" p="lg" data-testid="staff-card-steps">
      <Stack gap="sm">
        <Title order={4}>Staff card steps</Title>
        <Text size="sm" c="dimmed">
          Signing in is enough for most steps. For money and sign-off, the person shares their staff card from the
          wallet. The share names this record and amount, so it cannot be reused on another one.
        </Text>
        {view.steps.map((step) => (
          <Group key={step.actionKey} justify="space-between" wrap="nowrap" gap="sm">
            <Text size="sm">{step.label}</Text>
            {step.locked ? (
              <Badge variant="light" color="indigo">{stepAssuranceModeLabel(step.mode)} · always</Badge>
            ) : (
              <Select
                size="xs"
                w={220}
                allowDeselect={false}
                disabled={!canEdit || saving}
                value={step.mode}
                data={STEP_ASSURANCE_MODES.map((mode) => ({ value: mode.value, label: mode.label }))}
                onChange={(value) => value && void save(withStepMode(view.setting, step.actionKey, value as any))}
              />
            )}
          </Group>
        ))}
        <Switch
          label="Require the staff card on large amounts"
          description="Steps set to “Staff card offered” need the card above this amount."
          checked={limitOn}
          disabled={!canEdit || saving}
          onChange={(event) =>
            void save({ ...view.setting, cardRequiredAbove: event.currentTarget.checked ? view.suggestedLimit : null })
          }
        />
        {limitOn && (
          <NumberInput
            label="Amount (in the record's currency)"
            min={0}
            w={220}
            disabled={!canEdit || saving}
            defaultValue={view.setting.cardRequiredAbove ?? view.suggestedLimit}
            onBlur={(event) => {
              const amount = Number(event.currentTarget.value.replace(/[^0-9.]/g, ''))
              if (Number.isFinite(amount) && amount !== view.setting.cardRequiredAbove) {
                void save({ ...view.setting, cardRequiredAbove: amount })
              }
            }}
          />
        )}
      </Stack>
    </Card>
  )
}
