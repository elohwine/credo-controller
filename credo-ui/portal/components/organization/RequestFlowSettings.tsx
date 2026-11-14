import React, { useCallback, useEffect, useState } from 'react'
import axios from 'axios'
import { Badge, Button, Card, Group, Loader, NumberInput, Stack, Switch, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  financeApprovalOf,
  requestFlowStepsLine,
  requestFlowThenLine,
  sameFinanceApproval,
  staffCardDefaultLine,
  stepsForFinance,
  withFinance,
  type FinanceApproval,
  type RequestFlow,
} from '../../../shared/requestFlowSettings'

type Props = {
  orgTenantId: string
  canEdit: boolean
  backendUrl: string
  getToken: () => string | null
}

/** "Who approves requests" — the approvals of each kind of request members can raise. */
export default function RequestFlowSettings({ orgTenantId, canEdit, backendUrl, getToken }: Props) {
  const [flows, setFlows] = useState<RequestFlow[] | null>(null)
  const [drafts, setDrafts] = useState<Record<string, FinanceApproval>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)

  const authHeaders = () => {
    const token = getToken()
    return token ? { Authorization: 'Bearer ' + token } : undefined
  }

  const load = useCallback(async () => {
    if (!orgTenantId) return
    setLoading(true)
    try {
      const res = await axios.get<{ flows: RequestFlow[] }>(
        `${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/workflows/request-flows`,
        { headers: authHeaders() },
      )
      const list = Array.isArray(res.data?.flows) ? res.data.flows : []
      setFlows(list)
      setDrafts(Object.fromEntries(list.map((flow) => [flow.requestType, financeApprovalOf(flow)])))
    } catch {
      setFlows(null)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendUrl, orgTenantId])

  useEffect(() => {
    void load()
  }, [load])

  const save = async (flow: RequestFlow) => {
    const draft = drafts[flow.requestType] || financeApprovalOf(flow)
    setSaving(flow.requestType)
    try {
      const res = await axios.put<RequestFlow>(
        `${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/workflows/request-flows/steps`,
        { requestType: flow.requestType, steps: stepsForFinance(draft) },
        { headers: authHeaders() },
      )
      const updated = res.data
      setFlows((current) => (current || []).map((entry) => (entry.requestType === flow.requestType ? updated : entry)))
      setDrafts((current) => ({ ...current, [flow.requestType]: financeApprovalOf(updated) }))
      notifications.show({ title: 'Saved', message: `${flow.label}: ${requestFlowStepsLine(updated)}`, color: 'green' })
    } catch (err: any) {
      notifications.show({ title: 'Could not save', message: err?.response?.data?.message || 'Please try again.', color: 'red' })
    } finally {
      setSaving(null)
    }
  }

  if (!flows || flows.length === 0) {
    return loading ? <Loader size="sm" /> : null
  }

  return (
    <Stack gap="sm">
      <Stack gap={2}>
        <Title order={4}>Who approves requests</Title>
        <Text size="sm" c="dimmed">
          The usual approver decides first. Finance can approve next, for every request or from an amount up. An
          approval set to need the staff card is decided only by sharing it from the wallet, with the request and
          amount on the share screen.
        </Text>
      </Stack>
      {flows.map((flow) => {
        const draft = drafts[flow.requestType] || financeApprovalOf(flow)
        const changed = !sameFinanceApproval(draft, financeApprovalOf(flow))
        const thenLine = requestFlowThenLine(flow)
        const busy = !canEdit || saving === flow.requestType
        return (
          <Card key={flow.requestType} withBorder radius="md" padding="md">
            <Stack gap="xs">
              <Stack gap={2}>
                <Group gap={6}>
                  <Text fw={600}>{flow.label}</Text>
                  {flow.customised && <Badge size="xs" variant="light">Own steps</Badge>}
                </Group>
                <Text size="sm" c="dimmed">{requestFlowStepsLine(flow)}</Text>
                {thenLine && <Text size="sm" c="dimmed">{thenLine}</Text>}
              </Stack>
              <Stack gap={2}>
                <Switch
                  label="Usual approver needs the staff card"
                  checked={Boolean(draft.reviewCard)}
                  disabled={busy}
                  onChange={(event) =>
                    setDrafts((current) => ({ ...current, [flow.requestType]: { ...draft, reviewCard: event.currentTarget.checked } }))
                  }
                />
                {!draft.reviewCard && <Text size="xs" c="dimmed">{staffCardDefaultLine(flow)}</Text>}
              </Stack>
              <Group align="end" gap="md">
                <Switch
                  label="Finance approves too"
                  checked={draft.on}
                  disabled={busy}
                  onChange={(event) =>
                    setDrafts((current) => ({ ...current, [flow.requestType]: withFinance(draft, event.currentTarget.checked) }))
                  }
                />
                {draft.on && (
                  <Switch
                    label="Finance needs the staff card"
                    checked={Boolean(draft.financeCard)}
                    disabled={busy}
                    onChange={(event) =>
                      setDrafts((current) => ({ ...current, [flow.requestType]: { ...draft, financeCard: event.currentTarget.checked } }))
                    }
                  />
                )}
                {draft.on && (
                  <NumberInput
                    size="xs"
                    w={180}
                    label="Only from this amount"
                    placeholder="Every request"
                    min={0}
                    decimalScale={2}
                    value={draft.amountAtLeast ?? ''}
                    disabled={busy}
                    onChange={(value) =>
                      setDrafts((current) => ({
                        ...current,
                        [flow.requestType]: { ...draft, amountAtLeast: value === '' ? undefined : Number(value) },
                      }))
                    }
                  />
                )}
                {changed && (
                  <Button size="xs" loading={saving === flow.requestType} disabled={!canEdit} onClick={() => void save(flow)}>
                    Save
                  </Button>
                )}
              </Group>
            </Stack>
          </Card>
        )
      })}
    </Stack>
  )
}
