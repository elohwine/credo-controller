import React, { useCallback, useEffect, useState } from 'react'
import { Badge, NumberInput, Paper, Select, Stack, Switch, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import api from '@/lib/api'
import { getPreferredToken } from '@/lib/auth'
import {
  STEP_ASSURANCE_MODES,
  stepAssuranceModeLabel,
  stepAssuranceView,
  withStepMode,
  type StepAssuranceSetting,
  type StepAssuranceView,
} from '../../../shared/stepAssurance'

/** Which steps need the staff card from the wallet. Same choice as the website (Setup → Advanced settings). */
export default function StaffCardStepsCard({ orgTenantId, canEdit }: { orgTenantId: string | null; canEdit: boolean }) {
  const [view, setView] = useState<StepAssuranceView | null>(null)
  const [saving, setSaving] = useState(false)

  const headers = () => {
    const token = getPreferredToken()
    return token ? { Authorization: 'Bearer ' + token } : undefined
  }
  const path = orgTenantId ? `/api/organizations/${encodeURIComponent(orgTenantId)}/proof-vc-policy` : ''

  const load = useCallback(async () => {
    if (!path) return
    try {
      const res = await api.get(path, { headers: headers() })
      setView(stepAssuranceView(res.data))
    } catch {
      setView(null)
    }
  }, [path])

  useEffect(() => { void load() }, [load])

  const save = async (setting: StepAssuranceSetting) => {
    if (!path) return
    setSaving(true)
    try {
      const res = await api.patch(path, { stepAssurance: setting }, { headers: headers() })
      setView(stepAssuranceView(res.data))
      notifications.show({ title: 'Saved', message: 'Staff card steps updated.', color: 'green' })
    } catch (err: any) {
      notifications.show({ title: 'Could not save', message: err?.response?.data?.message || 'Please try again.', color: 'red' })
      void load()
    } finally {
      setSaving(false)
    }
  }

  if (!view) return null
  const limitOn = view.setting.cardRequiredAbove !== null
  return (
    <Paper withBorder radius="md" p="md" data-testid="staff-card-steps">
      <Stack gap="sm">
        <Text fw={700}>Staff card steps</Text>
        <Text size="sm" c="dimmed">
          Signing in is enough for most steps. For money and sign-off, the person shares their staff card from the
          wallet. The share names this record and amount, so it cannot be reused on another one.
        </Text>
        {view.steps.map((step) => (
          <Stack key={step.actionKey} gap={4}>
            <Text size="sm">{step.label}</Text>
            {step.locked ? (
              <Badge variant="light" color="indigo">{stepAssuranceModeLabel(step.mode)} · always</Badge>
            ) : (
              <Select
                size="sm"
                allowDeselect={false}
                disabled={!canEdit || saving}
                value={step.mode}
                data={STEP_ASSURANCE_MODES.map((mode) => ({ value: mode.value, label: mode.label }))}
                onChange={(value) => value && void save(withStepMode(view.setting, step.actionKey, value as any))}
              />
            )}
          </Stack>
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
            inputMode="decimal"
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
    </Paper>
  )
}
