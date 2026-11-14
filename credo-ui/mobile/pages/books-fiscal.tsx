/**
 * This organisation's Zoho Books connection and fiscal device. Owned by the phone app's API,
 * the same jobs as the website.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Group, Paper, Stack, Text, TextInput, Title } from '@mantine/core'
import { IconReceipt } from '@tabler/icons-react'
import { useRouter } from 'next/router'
import AppShellMobile from '@/components/layout/AppShellMobile'
import BottomSheet from '@/components/shared/BottomSheet'
import api from '@/lib/api'
import { getContextMode, getOrgRoleClaim } from '@/lib/auth'

type Status = {
  books: { configured: boolean; status: string | null; organisationName: string | null }
  fiscal: {
    device: { label: string; fiscalDayStatus: string; fiscalDayNo: number } | null
  }
  documents: Array<{
    id: string
    invoiceNo: string
    status: string
    currency: string
    total: number
    walletStatus: string | null
  }>
}

export default function BooksFiscalPage() {
  const router = useRouter()
  const allowed = getContextMode() === 'org' && ['owner', 'admin'].includes(getOrgRoleClaim() || '')
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sheet, setSheet] = useState<'device' | 'import' | null>(null)
  const [deviceId, setDeviceId] = useState('321')
  const [serial, setSerial] = useState('')
  const [invoiceId, setInvoiceId] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const response = await api.get<Status>('/api/organizations/books-fiscal')
    setStatus(response.data)
  }, [])

  useEffect(() => {
    if (!allowed) return
    load().catch((err) => setError(err?.response?.data?.message || 'Could not load books and tax receipts'))
  }, [allowed, load])

  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await work()
      await load()
      setSheet(null)
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'That did not work')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AppShellMobile>
      <Stack gap="md" p="md">
        <div>
          <Title order={3}>Books and tax receipts</Title>
          <Text size="sm" c="dimmed">Zoho Books and fiscal receipts for this organisation, on Credentis.</Text>
        </div>
        {!allowed ? (
          <Alert color="gray">Only owners and admins can connect books or a fiscal device.</Alert>
        ) : (
          <>
            {error && <Alert color="red">{error}</Alert>}
            <Paper withBorder radius="md" p="md">
              <Text fw={500}>Zoho Books</Text>
              <Text size="sm" c="dimmed" mt={4}>
                {status?.books.organisationName || status?.books.status || 'Not connected'}
              </Text>
              <Button mt="md" fullWidth h={48} disabled={busy} onClick={() => run(async () => {
                const response = await api.post<{ url: string }>('/api/organizations/books-fiscal/zoho/start')
                window.location.href = response.data.url
              })}>
                Connect Zoho
              </Button>
            </Paper>
            <Paper withBorder radius="md" p="md">
              <Group justify="space-between">
                <div>
                  <Text fw={500}>Fiscal device</Text>
                  <Text size="sm" c="dimmed">
                    {status?.fiscal.device
                      ? `${status.fiscal.device.label} · ${status.fiscal.device.fiscalDayStatus}`
                      : 'No device yet'}
                  </Text>
                </div>
                <IconReceipt size={24} />
              </Group>
              {!status?.fiscal.device ? (
                <Button mt="md" fullWidth h={48} onClick={() => setSheet('device')}>Add a device</Button>
              ) : status.fiscal.device.fiscalDayStatus === 'closed' ? (
                <Button mt="md" fullWidth h={48} disabled={busy} onClick={() => run(() => api.post('/api/organizations/books-fiscal/device/open-day').then(() => undefined))}>
                  Open fiscal day
                </Button>
              ) : (
                <Button mt="md" fullWidth h={48} variant="default" disabled={busy} onClick={() => run(() => api.post('/api/organizations/books-fiscal/device/close-day').then(() => undefined))}>
                  Close fiscal day
                </Button>
              )}
            </Paper>
            <Button fullWidth h={48} variant="light" onClick={() => setSheet('import')}>Import a Zoho invoice</Button>
            {(status?.documents || []).map((document) => (
              <Paper key={document.id} withBorder radius="md" p="md">
                <Text fw={500}>{document.invoiceNo}</Text>
                <Text size="sm" c="dimmed">{document.currency} {document.total.toFixed(2)} · {document.status}</Text>
                {document.status === 'imported' && (
                  <Button mt="sm" fullWidth h={48} disabled={busy} onClick={() => run(() => api.post(`/api/organizations/books-fiscal/documents/${document.id}/fiscalise`).then(() => undefined))}>
                    Fiscalise
                  </Button>
                )}
              </Paper>
            ))}
          </>
        )}
        <Button variant="subtle" h={48} onClick={() => router.push('/connected-systems')}>Back to connected systems</Button>
      </Stack>
      <BottomSheet opened={sheet === 'device'} onClose={() => setSheet(null)} title="Fiscal device">
        <Stack p="md" pb="xl">
          <TextInput label="Device ID" value={deviceId} onChange={(event) => setDeviceId(event.currentTarget.value)} />
          <TextInput label="Serial number" value={serial} onChange={(event) => setSerial(event.currentTarget.value)} />
          <Button h={48} disabled={busy || !serial.trim()} onClick={() => run(async () => {
            await api.post('/api/organizations/books-fiscal/device', {
              deviceId: Number(deviceId),
              serialNo: serial,
              environment: 'simulator',
            })
          })}>
            Add simulator device
          </Button>
        </Stack>
      </BottomSheet>
      <BottomSheet opened={sheet === 'import'} onClose={() => setSheet(null)} title="Import invoice">
        <Stack p="md" pb="xl">
          <TextInput label="Zoho invoice id" value={invoiceId} onChange={(event) => setInvoiceId(event.currentTarget.value)} />
          <Button h={48} disabled={busy || !invoiceId.trim()} onClick={() => run(async () => {
            await api.post('/api/organizations/books-fiscal/documents', { kind: 'invoice', documentId: invoiceId.trim() })
            setInvoiceId('')
          })}>
            Import
          </Button>
        </Stack>
      </BottomSheet>
    </AppShellMobile>
  )
}
