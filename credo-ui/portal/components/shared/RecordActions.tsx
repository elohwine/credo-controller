import React, { useState } from 'react'
import axios from 'axios'
import { Badge, Button, Drawer, Group, Loader, Modal, Stack, Text, Textarea } from '@mantine/core'
import { IconDownload, IconHistory, IconX } from '@tabler/icons-react'

import { feedback } from '@/lib/feedback'
import { EXPORT_MIME, exportFileName, saveExport } from '@/lib/exportFile'
import { getOrgScopedToken } from '@/utils/organizationContext'
import {
  RECORD_ACTION_LABELS,
  RECORD_CANCEL_CONSEQUENCE,
  RECORD_KIND_WORDS,
  recordCancelKey,
  recordCancelPath,
  recordCancelTitle,
  recordExportName,
  recordHistoryPath,
  type RecordHistoryRow,
  type RecordKind,
} from '../../../shared/recordHistory'

interface RecordActionsProps {
  kind: RecordKind
  id: string
  backendUrl: string
  /** Show Cancel. The server still checks who may cancel. */
  canCancel?: boolean
  onCancelled?: () => void
  size?: 'xs' | 'compact-xs' | 'sm'
}

/** History, Export and Cancel for any record, through the one `/api/records` path (jobs: their audit). */
export default function RecordActions({ kind, id, backendUrl, canCancel, onCancelled, size = 'xs' }: RecordActionsProps) {
  const [historyOpen, setHistoryOpen] = useState(false)
  const [rows, setRows] = useState<RecordHistoryRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [cancelling, setCancelling] = useState(false)

  const headers = () => {
    const token = getOrgScopedToken()
    if (!token) {
      feedback.warn('Switch to the organisation first.', { title: 'Organisation needed' })
      return null
    }
    return { Authorization: `Bearer ${token}` }
  }

  const openHistory = async () => {
    const auth = headers()
    if (!auth) return
    setHistoryOpen(true)
    setLoading(true)
    try {
      const { data } = await axios.get(`${backendUrl}${recordHistoryPath(kind, id)}`, { headers: auth })
      if (data?.error) throw new Error(String(data.error))
      setRows(Array.isArray(data?.rows) ? data.rows : [])
    } catch (error: any) {
      setHistoryOpen(false)
      feedback.fromError(error, { title: 'Could not open the history' })
    } finally {
      setLoading(false)
    }
  }

  const exportHistory = async () => {
    const auth = headers()
    if (!auth) return
    try {
      const { data } = await axios.get(`${backendUrl}${recordHistoryPath(kind, id, 'csv')}`, {
        headers: auth,
        responseType: 'text',
      })
      await saveExport(exportFileName(recordExportName(kind, id), 'csv'), EXPORT_MIME.csv, String(data || ''))
    } catch (error: any) {
      feedback.fromError(error, { title: 'Could not export the history' })
    }
  }

  const cancel = async () => {
    if (kind === 'job') return
    const auth = headers()
    if (!auth) return
    setCancelling(true)
    try {
      const { data } = await axios.post(
        `${backendUrl}${recordCancelPath(kind, id)}`,
        { reason: reason.trim() || undefined },
        { headers: { ...auth, 'x-idempotency-key': recordCancelKey(kind, id) } },
      )
      if (data?.error) throw new Error(String(data.error))
      feedback.success(`The ${RECORD_KIND_WORDS[kind]} was cancelled.`, { title: 'Cancelled' })
      setConfirmOpen(false)
      setReason('')
      onCancelled?.()
    } catch (error: any) {
      feedback.fromError(error, { title: 'Could not cancel' })
    } finally {
      setCancelling(false)
    }
  }

  return (
    <>
      <Group gap="xs" wrap="wrap" onClick={(event) => event.stopPropagation()}>
        <Button size={size} variant="light" leftSection={<IconHistory size={14} />} onClick={() => void openHistory()}>
          {RECORD_ACTION_LABELS.history}
        </Button>
        <Button size={size} variant="subtle" leftSection={<IconDownload size={14} />} onClick={() => void exportHistory()}>
          {RECORD_ACTION_LABELS.export}
        </Button>
        {canCancel && kind !== 'job' && (
          <Button size={size} variant="subtle" color="red" leftSection={<IconX size={14} />} onClick={() => setConfirmOpen(true)}>
            {RECORD_ACTION_LABELS.cancel}
          </Button>
        )}
      </Group>

      <Drawer opened={historyOpen} onClose={() => setHistoryOpen(false)} position="right" size="md" title={RECORD_ACTION_LABELS.history}>
        {loading && <Loader size="sm" />}
        {!loading && rows && rows.length === 0 && <Text size="sm" c="dimmed">Nothing has happened on this yet.</Text>}
        {!loading && rows && rows.length > 0 && (
          <Stack gap="sm">
            {rows.map((row) => (
              <Stack key={row.id} gap={2}>
                <Group justify="space-between" wrap="nowrap">
                  <Text size="sm" fw={500}>{row.event}</Text>
                  <Badge variant="light" color={row.status === 'attention' ? 'orange' : 'green'}>
                    {row.status === 'attention' ? 'Needs a look' : 'Done'}
                  </Badge>
                </Group>
                <Text size="xs" c="dimmed">
                  {new Date(row.occurredAt).toLocaleString()}
                  {row.person ? ` · ${row.person}` : ''}
                  {row.confirmation ? ` · ${row.confirmation}` : ''}
                </Text>
                {row.evidence.map((item) => (
                  <Text key={`${row.id}-${item.label}`} size="xs" c="dimmed">
                    {item.label}: {item.reference}
                  </Text>
                ))}
              </Stack>
            ))}
          </Stack>
        )}
      </Drawer>

      {kind !== 'job' && (
        <Modal opened={confirmOpen} onClose={() => setConfirmOpen(false)} title={recordCancelTitle(kind)} centered>
          <Stack>
            <Text size="sm">{RECORD_CANCEL_CONSEQUENCE[kind]}</Text>
            <Textarea
              label="Why (optional)"
              value={reason}
              onChange={(event) => setReason(event.currentTarget.value)}
              maxLength={500}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setConfirmOpen(false)}>
                Keep it
              </Button>
              <Button color="red" loading={cancelling} onClick={() => void cancel()}>
                {RECORD_ACTION_LABELS.cancel}
              </Button>
            </Group>
          </Stack>
        </Modal>
      )}
    </>
  )
}
