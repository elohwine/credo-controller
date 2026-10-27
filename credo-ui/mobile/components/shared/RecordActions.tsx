import React, { useState } from 'react';
import { Badge, Button, Group, Loader, Modal, Stack, Text, Textarea } from '@mantine/core';
import { IconDownload, IconHistory, IconX } from '@tabler/icons-react';

import api from '@/lib/api';
import { getOrgToken } from '@/lib/auth';
import { EXPORT_MIME, exportFileName, saveExport } from '@/lib/exportFile';
import { feedback } from '@/lib/feedback';
import BottomSheet from '@/components/shared/BottomSheet';
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
} from '../../../shared/recordHistory';

interface RecordActionsProps {
  kind: RecordKind;
  id: string;
  /** Show Cancel. The server still checks who may cancel. */
  canCancel?: boolean;
  onCancelled?: () => void;
}

/** History (bottom sheet), Export and Cancel (dialog) for any record, through the one `/api/records` path. */
export default function RecordActions({ kind, id, canCancel, onCancelled }: RecordActionsProps) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [rows, setRows] = useState<RecordHistoryRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const headers = () => {
    const token = getOrgToken();
    if (!token) {
      feedback.warn('Open the organization first, then try again.', { title: 'Organization needed' });
      return null;
    }
    return { Authorization: `Bearer ${token}` };
  };

  const openHistory = async () => {
    const auth = headers();
    if (!auth) return;
    setHistoryOpen(true);
    setLoading(true);
    try {
      const { data } = await api.get(recordHistoryPath(kind, id), { headers: auth });
      if (data?.error) throw new Error(String(data.error));
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (error) {
      setHistoryOpen(false);
      feedback.fromError(error, { title: 'Could not open the history' });
    } finally {
      setLoading(false);
    }
  };

  const exportHistory = async () => {
    const auth = headers();
    if (!auth) return;
    try {
      const { data } = await api.get(recordHistoryPath(kind, id, 'csv'), { headers: auth, responseType: 'text' });
      await saveExport(exportFileName(recordExportName(kind, id), 'csv'), EXPORT_MIME.csv, String(data || ''));
    } catch (error) {
      feedback.fromError(error, { title: 'Could not export the history' });
    }
  };

  const cancel = async () => {
    if (kind === 'job') return;
    const auth = headers();
    if (!auth) return;
    setCancelling(true);
    try {
      const { data } = await api.post(
        recordCancelPath(kind, id),
        { reason: reason.trim() || undefined },
        { headers: { ...auth, 'x-idempotency-key': recordCancelKey(kind, id) } },
      );
      if (data?.error) throw new Error(String(data.error));
      feedback.success(`The ${RECORD_KIND_WORDS[kind]} was cancelled.`, { title: 'Cancelled' });
      setConfirmOpen(false);
      setReason('');
      onCancelled?.();
    } catch (error) {
      feedback.fromError(error, { title: 'Could not cancel' });
    } finally {
      setCancelling(false);
    }
  };

  return (
    <>
      <Group gap="xs" grow>
        <Button variant="light" radius="xl" style={{ minHeight: 48 }} leftSection={<IconHistory size={20} />} onClick={() => void openHistory()}>
          {RECORD_ACTION_LABELS.history}
        </Button>
        <Button variant="subtle" radius="xl" style={{ minHeight: 48 }} leftSection={<IconDownload size={20} />} onClick={() => void exportHistory()}>
          {RECORD_ACTION_LABELS.export}
        </Button>
        {canCancel && kind !== 'job' && (
          <Button variant="subtle" color="red" radius="xl" style={{ minHeight: 48 }} leftSection={<IconX size={20} />} onClick={() => setConfirmOpen(true)}>
            {RECORD_ACTION_LABELS.cancel}
          </Button>
        )}
      </Group>

      <BottomSheet opened={historyOpen} onClose={() => setHistoryOpen(false)} title={RECORD_ACTION_LABELS.history}>
        {loading && <Loader size="sm" />}
        {!loading && rows && rows.length === 0 && <Text size="sm" c="dimmed">Nothing has happened on this yet.</Text>}
        {!loading && rows && rows.length > 0 && (
          <Stack gap={0}>
            {rows.map((row) => (
              <Stack key={row.id} gap={2} py="sm" style={{ minHeight: 56 }}>
                <Group justify="space-between" wrap="nowrap">
                  <Text size="md" fw={500}>{row.event}</Text>
                  <Badge variant="light" color={row.status === 'attention' ? 'warning' : 'success'}>
                    {row.status === 'attention' ? 'Needs a look' : 'Done'}
                  </Badge>
                </Group>
                <Text size="sm" c="dimmed">
                  {new Date(row.occurredAt).toLocaleString()}
                  {row.person ? ` · ${row.person}` : ''}
                  {row.confirmation ? ` · ${row.confirmation}` : ''}
                </Text>
                {row.evidence.map((item) => (
                  <Text key={`${row.id}-${item.label}`} size="sm" c="dimmed">
                    {item.label}: {item.reference}
                  </Text>
                ))}
              </Stack>
            ))}
          </Stack>
        )}
      </BottomSheet>

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
              <Button variant="default" radius="xl" style={{ minHeight: 48 }} onClick={() => setConfirmOpen(false)}>
                Keep it
              </Button>
              <Button color="red" radius="xl" style={{ minHeight: 48 }} loading={cancelling} onClick={() => void cancel()}>
                {RECORD_ACTION_LABELS.cancel}
              </Button>
            </Group>
          </Stack>
        </Modal>
      )}
    </>
  );
}
