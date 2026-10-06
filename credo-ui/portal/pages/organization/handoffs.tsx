import React, { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import Layout from '@/components/Layout'
import { getOrgScopedToken, getPersonalToken, readActiveOrganization } from '@/utils/organizationContext'
import { useRequireOrgContext } from '@/lib/portalContext'
import {
  Alert,
  Badge,
  Card,
  Container,
  Group,
  Loader,
  MultiSelect,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  Title,
} from '@mantine/core'
import { IconAlertCircle, IconArrowRight, IconCheck, IconRoute } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'

// Mirrors WorkflowHandoffService.WorkflowHandoffSetting
type Handoff = {
  key: string
  kind: 'job' | 'request'
  label: string
  description: string
  fromLabel: string
  toLabel: string
  holdParent: boolean
  startMode: 'auto' | 'manual'
  requiredStages: string[]
  stageOptions: Array<{ id: string; label: string }>
  enabled: boolean
  conditionLabel: string
}

function decodeRole(token: string | null): string {
  try {
    const payload = JSON.parse(atob(String(token || '').split('.')[1] || ''))
    return String(payload?.orgRole || payload?.role || '').toLowerCase()
  } catch {
    return ''
  }
}

export default function OrganizationHandoffsPage() {
  useRequireOrgContext('/organization/setup')
  const [orgTenantId, setOrgTenantId] = useState('')
  const [handoffs, setHandoffs] = useState<Handoff[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [canEdit, setCanEdit] = useState(false)

  const backendUrl = process.env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'
  const getToken = () => getOrgScopedToken() || getPersonalToken()

  useEffect(() => {
    const activeOrg = readActiveOrganization()
    if (activeOrg?.orgTenantId) setOrgTenantId(activeOrg.orgTenantId)
    setCanEdit(['owner', 'admin'].includes(decodeRole(getOrgScopedToken())))
  }, [])

  const load = useCallback(async () => {
    const token = getToken()
    if (!token || !orgTenantId) return
    setLoading(true)
    setError(null)
    try {
      const res = await axios.get<{ handoffs: Handoff[] }>(
        `${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/workflows/handoffs`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      setHandoffs(res.data?.handoffs || [])
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Could not load this page')
    } finally {
      setLoading(false)
    }
  }, [backendUrl, orgTenantId])

  useEffect(() => {
    if (orgTenantId) void load()
  }, [orgTenantId, load])

  const save = async (item: Handoff, patch: Partial<Pick<Handoff, 'startMode' | 'requiredStages' | 'enabled'>>) => {
    const token = getToken()
    if (!token || !orgTenantId) return
    setSaving(item.key)
    try {
      const res = await axios.put<Handoff>(
        `${backendUrl}/api/organizations/${encodeURIComponent(orgTenantId)}/workflows/handoffs/${encodeURIComponent(item.key)}`,
        patch,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      setHandoffs((current) => current.map((entry) => (entry.key === item.key ? { ...entry, ...res.data } : entry)))
      notifications.show({ title: 'Saved', message: item.label, color: 'green', icon: <IconCheck size={16} /> })
    } catch (err: any) {
      notifications.show({
        title: 'Could not save',
        message: err?.response?.data?.message || err?.message || 'Please try again.',
        color: 'red',
      })
    } finally {
      setSaving(null)
    }
  }

  const jobs = useMemo(() => handoffs.filter((h) => h.kind === 'job'), [handoffs])
  const requests = useMemo(() => handoffs.filter((h) => h.kind === 'request'), [handoffs])

  const renderRow = (item: Handoff) => (
    <Card key={item.key} withBorder radius="md" p="md">
      <Stack gap="xs">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={2}>
            <Group gap="xs">
              <Text fw={600}>{item.label}</Text>
              {!item.enabled && (
                <Badge color="gray" variant="light">
                  Off
                </Badge>
              )}
            </Group>
            <Group gap={6}>
              <Text size="sm" c="dimmed">
                {item.fromLabel}
              </Text>
              <IconArrowRight size={14} />
              <Text size="sm" c="dimmed">
                {item.toLabel}
              </Text>
            </Group>
          </Stack>
          <Switch
            checked={item.enabled}
            disabled={!canEdit || saving === item.key}
            onChange={(event) => save(item, { enabled: event.currentTarget.checked })}
            aria-label={`Use ${item.label}`}
          />
        </Group>

        {item.kind === 'job' && (
          <Text size="sm">{item.description}</Text>
        )}
        <Text size="sm" c="dimmed">
          {item.conditionLabel}
        </Text>

        {item.enabled && (
          <Group gap="md" align="flex-end" wrap="wrap">
            <Stack gap={4}>
              <Text size="xs" fw={600}>
                How it starts
              </Text>
              <SegmentedControl
                size="xs"
                value={item.startMode}
                disabled={!canEdit || saving === item.key}
                onChange={(value) => save(item, { startMode: value as 'auto' | 'manual' })}
                data={[
                  { value: 'auto', label: 'By itself' },
                  { value: 'manual', label: 'When someone asks' },
                ]}
              />
            </Stack>
            {item.kind === 'job' && (
              <MultiSelect
                size="xs"
                label="Available after"
                placeholder="Any time"
                style={{ minWidth: 260 }}
                data={item.stageOptions.map((option) => ({ value: option.id, label: option.label }))}
                value={item.requiredStages}
                disabled={!canEdit || saving === item.key}
                onChange={(value) => save(item, { requiredStages: value })}
                clearable
              />
            )}
          </Group>
        )}
        {item.enabled && item.holdParent && (
          <Text size="xs" c="dimmed">
            The job waits while this is open and continues when it is done.
          </Text>
        )}
      </Stack>
    </Card>
  )

  return (
    <Layout title="What happens next">
      <Container size="md" py="lg">
        <Stack gap="lg">
          <Stack gap={4}>
            <Group gap="xs">
              <IconRoute size={22} />
              <Title order={2}>What happens next</Title>
            </Group>
            <Text c="dimmed" size="sm">
              When a job or request leads to the next one. Choose whether it starts by itself or when someone asks.
            </Text>
          </Stack>

          {!canEdit && (
            <Alert color="blue" variant="light">
              Only an organization owner or admin can change these.
            </Alert>
          )}
          {error && (
            <Alert color="red" icon={<IconAlertCircle size={16} />}>
              {error}
            </Alert>
          )}
          {loading && <Loader size="sm" />}

          {jobs.length > 0 && (
            <Stack gap="sm">
              <Title order={4}>During a job</Title>
              {jobs.map(renderRow)}
            </Stack>
          )}
          {requests.length > 0 && (
            <Stack gap="sm">
              <Title order={4}>After a request is approved</Title>
              {requests.map(renderRow)}
            </Stack>
          )}
        </Stack>
      </Container>
    </Layout>
  )
}
