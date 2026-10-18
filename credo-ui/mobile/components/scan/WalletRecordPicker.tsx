/**
 * "Use a record from my wallet": one button that lists matching records from this person's
 * wallet and hands the chosen one back. Shared by the job evidence steps (receipts and
 * confirmations) and the purchase follow-up cards (Mark as bought / delivered / paid), so a
 * wallet record stands in for a photo the same way everywhere.
 */
import React, { useState } from 'react';
import { Box, Button, Group, Modal, Paper, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconShieldCheck } from '@tabler/icons-react';
import { decodeJwtPayload, getWalletToken } from '@/lib/auth';
import api from '@/lib/api';

/** Plain name for a record type: "ReceiptVC" → "Receipt". */
export function walletRecordLabel(vc: any): string {
  return String(vc?.vc_type || vc?.type || 'Record').replace(/VC$/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
}

export const EVIDENCE_RECORD_TYPES = /performance|receipt|work|delivery|job/i;
export const RECEIPT_RECORD_TYPES = /receipt|invoice|bill|payment/i;

export default function WalletRecordPickerButton({
  onSelect,
  matching = EVIDENCE_RECORD_TYPES,
  label = 'Use a record from my wallet',
  size = 'lg',
  variant = 'filled',
}: {
  onSelect: (vc: any) => void;
  /** Which record types are offered. */
  matching?: RegExp;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'filled' | 'light';
}) {
  const [opened, setOpened] = useState(false);
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const token = getWalletToken();
      if (!token) return;
      const payload = decodeJwtPayload(token);
      const walletId = payload?.tenantId ?? payload?.sub;
      if (!walletId) return;
      const res = await api.get(`/api/wallet/${walletId}/credentials/list?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const items = Array.isArray(res.data?.items) ? res.data.items : Array.isArray(res.data) ? res.data : [];
      setRecords(items.filter((item: any) => matching.test(String(item.vc_type || item.type || ''))));
      setOpened(true);
    } catch {
      notifications.show({ title: 'Wallet', message: 'Could not load records from your wallet.', color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button variant={variant} color="teal" size={size} leftSection={<IconShieldCheck size={20} />} onClick={load} loading={loading}>
        {label}
      </Button>
      <Modal opened={opened} onClose={() => setOpened(false)} title="Choose a record" centered radius="lg">
        <Stack gap="sm">
          {records.length === 0 ? (
            <Text size="sm" c="dimmed" ta="center" py="xl">No matching records in your wallet yet. Take a photo instead.</Text>
          ) : (
            records.map((vc) => (
              <Paper
                key={vc.id}
                withBorder
                p="sm"
                radius="md"
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  setOpened(false);
                  onSelect(vc);
                }}
              >
                <Group justify="space-between">
                  <Box>
                    <Text fw={600} size="sm">{vc.vc_type || vc.type}</Text>
                    <Text size="xs" c="dimmed">{vc.issuer_name || 'Issued to you'}</Text>
                  </Box>
                  <IconShieldCheck size={20} color="teal" />
                </Group>
              </Paper>
            ))
          )}
        </Stack>
      </Modal>
    </>
  );
}
