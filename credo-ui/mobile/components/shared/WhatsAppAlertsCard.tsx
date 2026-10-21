import React, { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Group, Paper, Stack, Switch, Text, TextInput } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import api from '@/lib/api'
import { getPreferredToken, getUserPhone } from '@/lib/auth'

const EVENTS = [
  { id: 'task', label: 'A workflow step is waiting for me' },
  { id: 'vc_offer', label: 'An invite, staff card or record was sent to me' },
  { id: 'payment_link', label: 'A payment link was sent to me' },
  { id: 'proof_request', label: 'Someone asked me to show a record' },
  { id: 'remittance', label: 'A payment was sent to me' },
]
const DEFAULT_TEMPLATE = { name: 'credentis_inbox_update', language: 'en_US' }

type Readiness = { platformConfigured: boolean; productionEnabled: boolean; validated: boolean; selection: { enabled: boolean } | null }

/** Personal WhatsApp opt-ins for this organisation; owners/admins also switch the organisation sender on. */
export default function WhatsAppAlertsCard({ orgTenantId, canEdit }: { orgTenantId: string | null; canEdit: boolean }) {
  const [mine, setMine] = useState<Record<string, boolean>>({})
  const [readiness, setReadiness] = useState<Readiness | null>(null)
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const headers = () => {
    const token = getPreferredToken()
    return token ? { Authorization: `Bearer ${token}` } : undefined
  }
  const base = () => `/api/organizations/${encodeURIComponent(orgTenantId || '')}/notifications`

  const load = useCallback(async () => {
    if (!orgTenantId) return
    setPhone((current) => current || getUserPhone() || '')
    try {
      const res = await api.get(`${base()}/preferences`, { headers: headers() })
      setMine(Object.fromEntries((Array.isArray(res.data) ? res.data : []).map((row: any) => [row.eventType, Boolean(row.enabled)])))
    } catch {
      setMine({})
    }
    if (canEdit) {
      try {
        const res = await api.get(`${base()}/whatsapp/readiness`, { headers: headers() })
        setReadiness(res.data)
      } catch {
        setReadiness(null)
      }
    }
  }, [orgTenantId, canEdit])

  useEffect(() => { void load() }, [load])

  const run = async (key: string, action: () => Promise<string>) => {
    setBusy(key)
    try {
      notifications.show({ title: 'Done', message: await action(), color: 'green' })
    } catch (err: any) {
      notifications.show({ title: 'Not done', message: err?.response?.data?.message || err?.message || 'Please try again.', color: 'red' })
    } finally {
      setBusy(null)
      void load()
    }
  }

  const setSender = (enabled: boolean) =>
    run('sender', async () => {
      const templates = Object.fromEntries(EVENTS.map((event) => [event.id, DEFAULT_TEMPLATE]))
      await api.put(`${base()}/whatsapp`, { mode: 'platform', enabled, templates }, { headers: headers() })
      if (!enabled) return 'WhatsApp alerts are off for this organisation.'
      await api.post(`${base()}/whatsapp/validate`, {}, { headers: headers() })
      return 'WhatsApp alerts are on for this organisation.'
    })

  const savePreference = (eventType: string, enabled: boolean) =>
    run(`pref-${eventType}`, async () => {
      if (!phone.trim()) throw new Error('Enter the phone number you signed up with first.')
      await api.put(`${base()}/preferences`, { phone: phone.trim(), eventType, enabled }, { headers: headers() })
      return enabled ? 'You will get this alert on WhatsApp.' : 'Alert turned off.'
    })

  const sendTest = () =>
    run('test', async () => {
      await api.post(`${base()}/whatsapp/test`, { eventType: 'task', requestId: `mobile-${Date.now()}` }, { headers: headers() })
      return 'Test sent. Check WhatsApp in a moment.'
    })

  if (!orgTenantId) return null
  const senderOn = Boolean(readiness?.selection?.enabled && readiness?.validated)
  return (
    <Paper p="md" radius="md" withBorder>
      <Stack gap="sm">
        <Text fw={700}>WhatsApp alerts</Text>
        <Text size="xs" c="dimmed">
          A short WhatsApp message tells you something is waiting in your Credentis inbox. Nothing is approved or paid from WhatsApp.
          Reply STOP at any time to turn all alerts off.
        </Text>

        {canEdit && readiness && (
          <Paper p="sm" radius="md" withBorder>
            <Group justify="space-between" wrap="nowrap">
              <div>
                <Text size="sm" fw={600}>Send alerts for this organisation</Text>
                <Text size="xs" c="dimmed">
                  {readiness.platformConfigured ? 'From the Credentis WhatsApp number.' : 'The Credentis WhatsApp number is not set up yet.'}
                </Text>
              </div>
              <Switch
                checked={senderOn}
                disabled={!readiness.platformConfigured || busy === 'sender'}
                onChange={(event) => void setSender(event.currentTarget.checked)}
              />
            </Group>
            {!readiness.productionEnabled && <Badge mt="xs" color="yellow" variant="light">Test numbers only</Badge>}
          </Paper>
        )}

        <TextInput
          label="My WhatsApp number"
          description="The number you signed up with"
          inputMode="tel"
          placeholder="263771234567"
          value={phone}
          onChange={(event) => setPhone(event.currentTarget.value)}
        />
        {EVENTS.map((event) => (
          <Switch
            key={event.id}
            label={event.label}
            checked={Boolean(mine[event.id])}
            disabled={busy === `pref-${event.id}`}
            onChange={(e) => void savePreference(event.id, e.currentTarget.checked)}
          />
        ))}
        {canEdit && (
          <Button variant="light" loading={busy === 'test'} disabled={!senderOn || !mine.task} onClick={() => void sendTest()}>
            Send me a test message
          </Button>
        )}
      </Stack>
    </Paper>
  )
}
