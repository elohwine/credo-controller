import React, { useCallback, useEffect, useState } from 'react'
import axios from 'axios'
import { Alert, Badge, Button, Group, Paper, Stack, Text, TextInput } from '@mantine/core'
import { useRouter } from 'next/router'

import { getOrgScopedToken, getPersonalToken } from '@/utils/organizationContext'

type Status = {
  books: { configured: boolean; status: string | null; organisationName: string | null }
  fiscal: {
    device: {
      label: string
      environment: string
      fiscalDayStatus: string
      fiscalDayNo: number
      registered: boolean
    } | null
  }
  documents: Array<{
    id: string
    invoiceNo: string
    status: string
    currency: string
    total: number
    hasPhone: boolean
    walletStatus: string | null
  }>
}

const backend = () => process.env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000'

/**
 * This organisation's Zoho Books connection and its fiscal device. Both live on Credentis.
 */
export default function BooksFiscalPanel() {
  const router = useRouter()
  const headers = () => ({ Authorization: `Bearer ${getOrgScopedToken() || getPersonalToken()}` })
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deviceId, setDeviceId] = useState('321')
  const [serial, setSerial] = useState('')
  const [invoiceId, setInvoiceId] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const response = await axios.get<Status>(`${backend()}/api/organizations/books-fiscal`, { headers: headers() })
    setStatus(response.data)
  }, [])

  useEffect(() => {
    load().catch((err) => setError(err?.response?.data?.message || err?.message || 'Could not load books and fiscalisation'))
  }, [load])

  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await work()
      await load()
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'That did not work')
    } finally {
      setBusy(false)
    }
  }

  const booksNote = router.query.books ? String(router.query.reason || router.query.books) : null

  return (
    <Paper withBorder p="md">
      <Text fw={600}>Books and tax receipts</Text>
      <Text size="sm" c="dimmed" mt={4} mb="md">
        Connect Zoho Books here, then fiscalise an issued invoice on this platform. The customer can receive a
        short bill card when their phone is on the invoice and you have a record type named Customer bill.
      </Text>
      {booksNote && <Alert mb="md">{booksNote === 'connected' ? 'Zoho Books is connected.' : booksNote}</Alert>}
      {error && <Alert color="red" mb="md">{error}</Alert>}
      {status && (
        <Stack gap="sm">
          <Group justify="space-between">
            <div>
              <Text size="sm">Zoho Books</Text>
              <Text size="xs" c="dimmed">
                {status.books.organisationName || status.books.status || (status.books.configured ? 'Not connected' : 'The server has no Zoho client yet')}
              </Text>
            </div>
            <Button
              disabled={busy}
              onClick={() => run(async () => {
                const response = await axios.post<{ url: string }>(`${backend()}/api/organizations/books-fiscal/zoho/start`, {}, { headers: headers() })
                window.location.href = response.data.url
              })}
            >
              Connect Zoho
            </Button>
          </Group>
          {!status.fiscal.device ? (
            <Group align="flex-end">
              <TextInput label="Device ID" value={deviceId} onChange={(event) => setDeviceId(event.currentTarget.value)} w={120} />
              <TextInput label="Serial" value={serial} onChange={(event) => setSerial(event.currentTarget.value)} w={160} />
              <Button
                disabled={busy || !serial.trim()}
                onClick={() => run(async () => {
                  await axios.post(`${backend()}/api/organizations/books-fiscal/device`, {
                    deviceId: Number(deviceId),
                    serialNo: serial,
                    environment: 'simulator',
                  }, { headers: headers() })
                })}
              >
                Add simulator device
              </Button>
            </Group>
          ) : (
            <Group justify="space-between">
              <Text size="sm">
                {status.fiscal.device.label} · day {status.fiscal.device.fiscalDayStatus}
                {status.fiscal.device.fiscalDayNo ? ` ${status.fiscal.device.fiscalDayNo}` : ''}
              </Text>
              {status.fiscal.device.fiscalDayStatus === 'closed' ? (
                <Button disabled={busy} onClick={() => run(() => axios.post(`${backend()}/api/organizations/books-fiscal/device/open-day`, {}, { headers: headers() }).then(() => undefined))}>
                  Open fiscal day
                </Button>
              ) : (
                <Button variant="default" disabled={busy} onClick={() => run(() => axios.post(`${backend()}/api/organizations/books-fiscal/device/close-day`, {}, { headers: headers() }).then(() => undefined))}>
                  Close fiscal day
                </Button>
              )}
            </Group>
          )}
          <Group align="flex-end">
            <TextInput label="Zoho invoice id" value={invoiceId} onChange={(event) => setInvoiceId(event.currentTarget.value)} style={{ flex: 1 }} />
            <Button
              disabled={busy || !invoiceId.trim()}
              onClick={() => run(async () => {
                await axios.post(`${backend()}/api/organizations/books-fiscal/documents`, {
                  kind: 'invoice',
                  documentId: invoiceId.trim(),
                }, { headers: headers() })
                setInvoiceId('')
              })}
            >
              Import
            </Button>
          </Group>
          {status.documents.map((document) => (
            <Group key={document.id} justify="space-between">
              <div>
                <Text size="sm">{document.invoiceNo}</Text>
                <Text size="xs" c="dimmed">
                  {document.currency} {document.total.toFixed(2)} · {document.status}
                  {document.walletStatus ? ` · card ${document.walletStatus}` : ''}
                  {document.hasPhone ? '' : ' · no phone on the invoice'}
                </Text>
              </div>
              <Badge variant="light">{document.status}</Badge>
              {document.status === 'imported' && (
                <Button size="xs" disabled={busy} onClick={() => run(() => axios.post(`${backend()}/api/organizations/books-fiscal/documents/${document.id}/fiscalise`, {}, { headers: headers() }).then(() => undefined))}>
                  Fiscalise
                </Button>
              )}
            </Group>
          ))}
        </Stack>
      )}
    </Paper>
  )
}
