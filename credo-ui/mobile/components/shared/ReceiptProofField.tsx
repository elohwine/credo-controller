/**
 * Proof of a receipt or supplier bill on a purchase follow-up card (Mark as bought, delivered,
 * paid): a live photo of the paper, or a receipt record from the wallet standing in for it.
 * The same two ways as the job's receipt step (EvidenceCapture).
 */
import React, { useState } from 'react';
import { ActionIcon, Button, Group, Image, Paper, Stack, Text } from '@mantine/core';
import { IconCamera, IconFileText, IconX } from '@tabler/icons-react';
import { captureLivePhotoDataUrl } from '@/lib/evidenceHash';
import WalletRecordPickerButton, { RECEIPT_RECORD_TYPES, walletRecordLabel } from '@/components/scan/WalletRecordPicker';

export interface ReceiptProof {
  photoUri?: string;
  record?: { id: string; type: string; label: string; issuer_name?: string };
}

/** The payload keys the server reads for an `image` field. */
export function receiptProofPayload(proof: ReceiptProof | null): { receiptImage?: string; receiptRecord?: ReceiptProof['record'] } {
  if (!proof) return {};
  return { receiptImage: proof.photoUri, receiptRecord: proof.photoUri ? undefined : proof.record };
}

export default function ReceiptProofField({
  label,
  hint,
  required,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  value: ReceiptProof | null;
  onChange: (next: ReceiptProof | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const takePhoto = async () => {
    setBusy(true);
    setError(null);
    try {
      const photoUri = await captureLivePhotoDataUrl();
      onChange({ photoUri });
    } catch (err: any) {
      setError(err?.message || 'Camera failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack gap={6}>
      <Text size="sm" fw={500}>
        {label}
        {required && <Text component="span" c="red"> *</Text>}
      </Text>
      {hint && <Text size="xs" c="dimmed">{hint}</Text>}
      {value?.photoUri ? (
        <Paper withBorder radius="md" p={6} style={{ position: 'relative' }}>
          <Image src={value.photoUri} alt={label} radius="md" h={140} fit="cover" />
          <ActionIcon size="sm" variant="filled" color="dark" radius="xl" aria-label="Remove photo" style={{ position: 'absolute', top: 10, right: 10 }} onClick={() => onChange(null)}>
            <IconX size={12} />
          </ActionIcon>
        </Paper>
      ) : value?.record ? (
        <Paper withBorder radius="md" p="sm">
          <Group justify="space-between" wrap="nowrap">
            <Group gap={6} wrap="nowrap">
              <IconFileText size={16} />
              <Text size="sm">{value.record.label}</Text>
            </Group>
            <ActionIcon size="sm" variant="subtle" color="gray" aria-label="Remove record" onClick={() => onChange(null)}>
              <IconX size={12} />
            </ActionIcon>
          </Group>
        </Paper>
      ) : (
        <Group grow>
          <Button variant="light" leftSection={<IconCamera size={18} />} onClick={takePhoto} loading={busy}>
            Take a photo
          </Button>
          <WalletRecordPickerButton
            size="sm"
            variant="light"
            label="Use a wallet record"
            matching={RECEIPT_RECORD_TYPES}
            onSelect={(vc) =>
              onChange({
                record: { id: String(vc.id || ''), type: String(vc.vc_type || vc.type || 'ReceiptVC'), label: walletRecordLabel(vc), issuer_name: vc.issuer_name },
              })
            }
          />
        </Group>
      )}
      {error && <Text size="xs" c="red">{error}</Text>}
    </Stack>
  );
}
