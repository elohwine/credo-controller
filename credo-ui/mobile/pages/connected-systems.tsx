/**
 * Read-only view of what the organisation's own software sends to people's wallets: the record
 * types it may send and the records sent recently. Types and systems are set up on the website.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { Alert, Badge, Button, Group, Loader, Paper, SegmentedControl, Stack, Text, Title } from '@mantine/core'
import { IconPlugConnected, IconRefresh } from '@tabler/icons-react'
import { useRouter } from 'next/router'
import AppShellMobile from '@/components/layout/AppShellMobile'
import api from '@/lib/api'
import {
  CREDENTIS_CONTEXT_CHANGED_EVENT,
  getActiveOrgId,
  getContextMode,
  getContextTokenStrict,
  getOrgRoleClaim,
  getTaskContext,
} from '@/lib/auth'

type RecordType = {
  id: string
  credentialType: string
  label: string
  description: string | null
  version: number
  fields: Array<{ key: string; label: string; required?: boolean }>
  status: 'active' | 'superseded' | 'retired'
}

type SentRecord = {
  id: string
  status: string
  label: string
  credentialType: string
  recordTypeVersion: number
  externalReference: string | null
  clientName: string
  createdAt: string
}

// Same words as the website's "Recently sent" list.
const STATUS_COLOR: Record<string, string> = {
  pending: 'blue',
  accepted: 'teal',
  processing: 'gray',
  failed: 'red',
  expired: 'orange',
  withdrawn: 'gray',
  resolved: 'gray',
}
const STATUS_LABEL: Record<string, string> = {
  pending: 'Waiting for person',
  accepted: 'In wallet',
  processing: 'Sending',
  failed: 'Not sent',
  expired: 'Expired',
  withdrawn: 'Withdrawn',
  resolved: 'Closed',
}

function sentAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function ConnectedSystemsPage() {
  const router = useRouter()
  const [view, setView] = useState<'sent' | 'types'>('sent')
  const [allowed, setAllowed] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [types, setTypes] = useState<RecordType[]>([])
  const [records, setRecords] = useState<SentRecord[]>([])

  const currentAuth = () => {
    if (getContextMode() !== 'org' || getTaskContext()) return null
    const orgId = getActiveOrgId()
    const token = getContextTokenStrict()
    return orgId && token ? { orgId, headers: { Authorization: `Bearer ${token}` } } : null
  }

  const load = useCallback(async () => {
    const auth = currentAuth()
    const manager = ['owner', 'admin'].includes(String(getOrgRoleClaim() || '').toLowerCase())
    setAllowed(Boolean(auth) && manager)
    setError('')
    if (!auth || !manager) {
      setTypes([])
      setRecords([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [typesRes, recordsRes] = await Promise.all([
        api.get('/api/organizations/connected-systems/record-types', { headers: auth.headers }),
        api.get('/api/organizations/connected-systems/records?limit=30', { headers: auth.headers }),
      ])
      if (currentAuth()?.orgId !== auth.orgId) return
      setTypes(Array.isArray(typesRes.data?.types) ? typesRes.data.types : [])
      setRecords(Array.isArray(recordsRes.data?.records) ? recordsRes.data.records : [])
    } catch (e: any) {
      if (currentAuth()?.orgId === auth.orgId) {
        setError(e?.response?.data?.message || 'Could not load connected systems. Try again.')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (getTaskContext()) {
      void router.replace('/inbox')
      return
    }
    void load()
    window.addEventListener(CREDENTIS_CONTEXT_CHANGED_EVENT, load)
    return () => window.removeEventListener(CREDENTIS_CONTEXT_CHANGED_EVENT, load)
  }, [load, router])

  return (
    <AppShellMobile>
      <Stack gap="md" p="md" style={{ maxWidth: '100%', overflowX: 'hidden' }}>
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <div style={{ minWidth: 0 }}>
            <Title order={3}>Connected systems</Title>
            <Text size="sm" c="dimmed">
              Records your own software sends to people&apos;s wallets.
            </Text>
          </div>
          <Button variant="subtle" size="compact-sm" onClick={() => void load()} aria-label="Refresh" leftSection={<IconRefresh size={14} />}>
            Refresh
          </Button>
        </Group>

        {!allowed ? (
          <Alert color="gray" icon={<IconPlugConnected size={18} />}>
            Only owners and admins of an organisation can see this. Switch to an organisation you manage.
          </Alert>
        ) : (
          <>
            <SegmentedControl
              fullWidth
              value={view}
              onChange={(value) => setView(value as 'sent' | 'types')}
              data={[
                { value: 'sent', label: `Recently sent${records.length ? ` (${records.length})` : ''}` },
                { value: 'types', label: `Record types${types.length ? ` (${types.length})` : ''}` },
              ]}
            />
            {error && <Alert color="red">{error}</Alert>}
            {loading ? (
              <Group justify="center" py="xl">
                <Loader size="sm" />
              </Group>
            ) : view === 'sent' ? (
              records.length === 0 ? (
                <Text size="sm" c="dimmed" ta="center" py="lg">
                  Nothing sent yet. When your software sends a record it shows here.
                </Text>
              ) : (
                <Stack gap="xs">
                  {records.map((record) => (
                    <Paper key={record.id} withBorder radius="md" p="sm">
                      <Group justify="space-between" wrap="nowrap" gap="xs" align="flex-start">
                        <Text fw={600} size="sm" lineClamp={1} style={{ minWidth: 0 }}>
                          {record.label || record.credentialType}
                        </Text>
                        <Badge size="sm" variant="light" color={STATUS_COLOR[record.status] || 'gray'} style={{ flexShrink: 0 }}>
                          {STATUS_LABEL[record.status] || record.status}
                        </Badge>
                      </Group>
                      <Text size="xs" c="dimmed" lineClamp={1} mt={2}>
                        {[record.clientName, record.externalReference, sentAt(record.createdAt)].filter(Boolean).join(' · ')}
                      </Text>
                    </Paper>
                  ))}
                </Stack>
              )
            ) : types.length === 0 ? (
              <Text size="sm" c="dimmed" ta="center" py="lg">
                No record types yet. Add one on the Credentis website under Connected systems.
              </Text>
            ) : (
              <Stack gap="xs">
                {types.map((type) => (
                  <Paper key={type.id} withBorder radius="md" p="sm">
                    <Group justify="space-between" wrap="nowrap" gap="xs">
                      <Text fw={600} size="sm" lineClamp={1} style={{ minWidth: 0 }}>
                        {type.label}
                      </Text>
                      <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                        Version {type.version}
                      </Text>
                    </Group>
                    {type.description && (
                      <Text size="xs" c="dimmed" lineClamp={2} mt={2}>
                        {type.description}
                      </Text>
                    )}
                    <Text size="xs" mt={4} lineClamp={2}>
                      {type.fields.map((field) => field.label).join(', ')}
                    </Text>
                  </Paper>
                ))}
              </Stack>
            )}
            <Text size="xs" c="dimmed">
              To add a record type or connect a system, use the Credentis website.
            </Text>
          </>
        )}
      </Stack>
    </AppShellMobile>
  )
}
