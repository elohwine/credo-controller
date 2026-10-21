import React, { useCallback, useEffect, useState } from 'react'
import axios from 'axios'
import { Alert, Badge, Button, Container, Group, Paper, Stack, Switch, Table, Text, TextInput, Title } from '@mantine/core'
import { IconBrandWhatsapp } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'

import Layout from '@/components/Layout'
import { useRequireOrgContext } from '@/lib/portalContext'
import { getOrgScopedToken, getPersonalToken, readActiveOrganization } from '@/utils/organizationContext'

const EVENTS: Array<{ id: string; label: string }> = [
  { id: 'task', label: 'A workflow step is waiting for me' },
  { id: 'vc_offer', label: 'An invite, staff card or record was sent to me' },
  { id: 'payment_link', label: 'A payment link was sent to me' },
  { id: 'proof_request', label: 'Someone asked me to show a record' },
  { id: 'remittance', label: 'A payment was sent to me' },
]
const DEFAULT_TEMPLATE = { name: 'credentis_inbox_update', language: 'en_US' }

interface Readiness {
  platformConfigured: boolean
  deliveryEnabled: boolean
  productionEnabled: boolean
  walletLinkConfigured: boolean
  validated: boolean
  selection: { mode: string; enabled: boolean; templates: Record<string, { name: string; language: string }> } | null
}
interface Delivery { id: string; eventType: string; status: string; reason: string | null; updatedAt: string }

export default function OrganizationWhatsAppPage() {
  useRequireOrgContext('/organization/setup')
  const backendUrl = process.env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'
  const [orgTenantId, setOrgTenantId] = useState('')
  const [readiness, setReadiness] = useState<Readiness | null>(null)
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [mine, setMine] = useState<Record<string, boolean>>({})
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const headers = () => ({ Authorization: `Bearer ${getOrgScopedToken() || getPersonalToken()}` })
  const base = (id: string) => `${backendUrl}/api/organizations/${encodeURIComponent(id)}/notifications`
  const message = (err: any, fallback: string) => err?.response?.data?.message || err?.message || fallback

  useEffect(() => {
    const active = readActiveOrganization()
    if (active?.orgTenantId) setOrgTenantId(active.orgTenantId)
  }, [])

  const load = useCallback(async () => {
    if (!orgTenantId) return
    setError(null)
    try {
      const [ready, prefs, sent] = await Promise.all([
        axios.get<Readiness>(`${base(orgTenantId)}/whatsapp/readiness`, { headers: headers() }),
        axios.get<Array<{ eventType: string; enabled: number }>>(`${base(orgTenantId)}/preferences`, { headers: headers() }),
        axios.get<Delivery[]>(`${base(orgTenantId)}/deliveries`, { headers: headers() }),
      ])
      setReadiness(ready.data)
      setMine(Object.fromEntries((prefs.data || []).map((row) => [row.eventType, Boolean(row.enabled)])))
      setDeliveries(sent.data || [])
    } catch (err: any) {
      setError(message(err, 'Could not load WhatsApp settings'))
    }
  }, [orgTenantId])

  useEffect(() => { void load() }, [load])

  const run = async (key: string, action: () => Promise<string>) => {
    setBusy(key)
    try {
      notifications.show({ title: 'Done', message: await action(), color: 'green' })
    } catch (err: any) {
      notifications.show({ title: 'Not done', message: message(err, 'Please try again.'), color: 'red' })
    } finally {
      setBusy(null)
      void load()
    }
  }

  const turnOn = (enabled: boolean) =>
    run('sender', async () => {
      const templates = Object.fromEntries(EVENTS.map((event) => [event.id, DEFAULT_TEMPLATE]))
      await axios.put(`${base(orgTenantId)}/whatsapp`, { mode: 'platform', enabled, templates }, { headers: headers() })
      if (!enabled) return 'WhatsApp alerts are off for this organisation.'
      const res = await axios.post(`${base(orgTenantId)}/whatsapp/validate`, {}, { headers: headers() })
      return `Connected. ${res.data.templates.length} alert types ready.`
    })

  const savePreference = (eventType: string, enabled: boolean) =>
    run(`pref-${eventType}`, async () => {
      if (!phone.trim()) throw new Error('Enter the phone number you signed up with first.')
      await axios.put(`${base(orgTenantId)}/preferences`, { phone: phone.trim(), eventType, enabled }, { headers: headers() })
      return enabled ? 'You will get this alert on WhatsApp.' : 'Alert turned off.'
    })

  const sendTest = () =>
    run('test', async () => {
      await axios.post(`${base(orgTenantId)}/whatsapp/test`, { eventType: 'task', requestId: `portal-${Date.now()}` }, { headers: headers() })
      return 'Test queued. Watch the list below for delivered / read.'
    })

  const on = Boolean(readiness?.selection?.enabled)
  return (
    <Layout title="WhatsApp alerts">
      <Container size="md" py="lg">
        <Stack gap="lg">
          <div>
            <Title order={2}>WhatsApp alerts</Title>
            <Text c="dimmed" size="sm" mt={4}>
              Short WhatsApp messages that point people to their Credentis inbox. Nothing is approved or paid from WhatsApp.
            </Text>
          </div>
          {error && <Alert color="red">{error}</Alert>}

          {readiness && (
            <Paper withBorder p="md">
              <Group gap="sm" mb="sm">
                <IconBrandWhatsapp size={20} />
                <Text fw={600}>Organisation sender</Text>
                <Badge color={on && readiness.validated ? 'teal' : 'gray'} variant="light">
                  {on && readiness.validated ? 'On' : on ? 'Not connected' : 'Off'}
                </Badge>
                {!readiness.productionEnabled && <Badge color="yellow" variant="light">Test numbers only</Badge>}
              </Group>
              {!readiness.platformConfigured && (
                <Alert color="yellow" mb="sm">The Credentis WhatsApp number is not set up on the server yet.</Alert>
              )}
              {!readiness.walletLinkConfigured && (
                <Alert color="yellow" mb="sm">The server has no HTTPS inbox link (WALLET_PUBLIC_URL).</Alert>
              )}
              <Text size="sm" mb="sm">Messages come from the shared Credentis WhatsApp number.</Text>
              <Group>
                <Button loading={busy === 'sender'} disabled={!readiness.platformConfigured} onClick={() => void turnOn(true)}>
                  {on ? 'Check connection again' : 'Turn on'}
                </Button>
                {on && (
                  <Button variant="default" loading={busy === 'sender'} onClick={() => void turnOn(false)}>Turn off</Button>
                )}
              </Group>
            </Paper>
          )}

          <Paper withBorder p="md">
            <Text fw={600} mb={4}>My alerts</Text>
            <Text size="xs" c="dimmed" mb="sm">
              Only you can turn these on. Reply STOP on WhatsApp at any time to turn them all off.
            </Text>
            <TextInput
              label="My WhatsApp number (the one I signed up with)"
              placeholder="263771234567"
              value={phone}
              onChange={(event) => setPhone(event.currentTarget.value)}
              mb="sm"
            />
            <Stack gap="xs">
              {EVENTS.map((event) => (
                <Switch
                  key={event.id}
                  label={event.label}
                  checked={Boolean(mine[event.id])}
                  disabled={busy === `pref-${event.id}`}
                  onChange={(e) => void savePreference(event.id, e.currentTarget.checked)}
                />
              ))}
            </Stack>
            <Button mt="md" variant="light" loading={busy === 'test'} disabled={!on || !mine.task} onClick={() => void sendTest()}>
              Send me a test message
            </Button>
          </Paper>

          <Paper withBorder p="md">
            <Group justify="space-between" mb="sm">
              <Text fw={600}>Recent messages</Text>
              <Button size="xs" variant="subtle" onClick={() => void load()}>Refresh</Button>
            </Group>
            {deliveries.length === 0 ? (
              <Text size="sm" c="dimmed">No messages yet.</Text>
            ) : (
              <Table striped>
                <Table.Thead>
                  <Table.Tr><Table.Th>Alert</Table.Th><Table.Th>Status</Table.Th><Table.Th>Note</Table.Th><Table.Th>When</Table.Th></Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {deliveries.map((row) => (
                    <Table.Tr key={row.id}>
                      <Table.Td>{EVENTS.find((event) => event.id === row.eventType)?.label || row.eventType}</Table.Td>
                      <Table.Td>{row.status}</Table.Td>
                      <Table.Td>{row.reason || ''}</Table.Td>
                      <Table.Td>{new Date(row.updatedAt).toLocaleString()}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Paper>
        </Stack>
      </Container>
    </Layout>
  )
}
