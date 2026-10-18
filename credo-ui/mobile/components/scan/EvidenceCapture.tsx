/**
 * EvidenceCapture — live photo + GPS + SHA-256 hash using Capacitor Camera + Geolocation.
 *
 * Progressive proof-of-work rules (see docs/SGK_FEPT_GAP_MAP.md "Evidence"):
 * - Live camera only (no gallery): the photo is taken on the job, not uploaded later.
 * - Location and time are fixed at the moment of capture, and the image is hashed on the device.
 *   The server adds its own sealed time when the step is recorded.
 * - Before / after / receipt are separate steps chosen by the job, not by the worker; the worker
 *   must confirm the work is finished before after photos are accepted.
 * - "Use a record from my wallet" only applies to receipts and confirmations, where a digital
 *   record can replace a photo. Before and after photos are always taken live.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Stack,
  Button,
  Text,
  Box,
  Alert,
  Loader,
  Center,
  Image,
  Badge,
  Group,
  Textarea,
  Divider,
  Paper,
  ActionIcon,
  UnstyledButton,
} from '@mantine/core';
import { IconCamera, IconAlertCircle, IconCheck, IconMapPin, IconShieldCheck, IconPlus, IconX, IconFileText } from '@tabler/icons-react';
import { captureLivePhotoDataUrl, sha256Hex } from '@/lib/evidenceHash';
import { clearCameraPending, clearPhotoDraft, loadPhotoDraft, markCameraPending, savePhotoDraft } from '@/lib/photoDraft';
import { purchaseReceiptLine, type PurchaseReceipt } from '@/lib/jobAuditTrail';
import WalletRecordPickerButton, { walletRecordLabel } from './WalletRecordPicker';

export type EvidenceStage = 'before' | 'after' | 'receipt' | 'acknowledgement';

export interface EvidenceAttachment {
  imageBase64?: string;
  mimeType?: string;
  gpsLat?: number | null;
  gpsLng?: number | null;
  timestamp: string;
  sha256?: string;
  notes?: string;
  /** Set when this item is a document rather than a photo. */
  label?: string;
}

export interface EvidencePayload {
  imageBase64?: string;
  mimeType?: string;
  gpsLat?: number | null;
  gpsLng?: number | null;
  timestamp: string;
  sha256?: string;
  notes: string;
  performanceVc?: any;
  receiptVc?: any;
  evidenceStage?: EvidenceStage;
  /** Extra photos taken in the same step, after the first. */
  attachments?: EvidenceAttachment[];
}

interface CapturedShot {
  id: string;
  dataUrl: string;
  capturedAt: string;
  gps: { lat: number; lng: number; accuracy?: number } | null;
}

interface AttachedRecord {
  id: string;
  label: string;
  vc: any;
}

interface EvidenceCaptureProps {
  onCapture: (payload: EvidencePayload) => Promise<void> | void;
  onCancel: () => void;
  workflowLabel?: string;
  evidenceStage?: EvidenceStage;
  /** Receipts only: the worker bought nothing for this job, so there is no receipt to add. */
  onNoReceipt?: () => Promise<void> | void;
  /** Receipts only: receipts that came back from "Buy materials", offered instead of a photo. */
  purchaseReceipts?: PurchaseReceipt[];
  onUsePurchaseReceipts?: () => Promise<void> | void;
  /** Keeps photos on the phone until the step is saved, even if Android closes the app. */
  draftKey?: string;
}

export default function EvidenceCapture({
  onCapture,
  onCancel,
  workflowLabel,
  evidenceStage = 'before',
  onNoReceipt,
  purchaseReceipts = [],
  onUsePurchaseReceipts,
  draftKey,
}: EvidenceCaptureProps) {
  const [shots, setShots] = useState<CapturedShot[]>(() => (draftKey ? loadPhotoDraft(draftKey) : []));
  const [draftNotKept, setDraftNotKept] = useState(false);
  const draftLoaded = useRef(draftKey);
  const [records, setRecords] = useState<AttachedRecord[]>([]);
  const [activeShotId, setActiveShotId] = useState<string | null>(null);
  const [workFinished, setWorkFinished] = useState(false);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [askingLocation, setAskingLocation] = useState(false);
  useEffect(() => {
    if (!draftKey) return;
    if (draftLoaded.current !== draftKey) {
      draftLoaded.current = draftKey;
      setShots(loadPhotoDraft(draftKey));
      return;
    }
    setDraftNotKept(!savePhotoDraft(draftKey, shots));
  }, [draftKey, shots]);
  const activeShot = shots.find((shot) => shot.id === activeShotId) || shots[0] || null;

  const stageMeta: Record<EvidenceStage, { title: string; helper: string; button: string }> = {
    before: {
      title: 'Before photos',
      helper: 'Take a photo of the site before any work starts so everyone can see the starting condition.',
      button: 'Save before photo',
    },
    after: {
      title: 'After photos',
      helper: 'Only once the work is finished: take a photo of the result from the same spot as the before photo so the two can be compared.',
      button: 'Save after photo',
    },
    receipt: {
      title: 'Receipts for materials',
      helper: 'Add the receipts for parts or materials bought for this job. Bought nothing? Say so and carry on to the work.',
      button: 'Save receipt',
    },
    acknowledgement: {
      title: 'Confirmation',
      helper: 'Add the customer or site confirmation before the job is closed.',
      button: 'Save confirmation',
    },
  };

  const currentStage = stageMeta[evidenceStage] ?? stageMeta.before;
  // Before and after photos are always taken live; a wallet record can only stand in for a receipt or confirmation.
  const isPhotoOnlyStage = evidenceStage === 'before' || evidenceStage === 'after';
  const needsFinishedConfirmation = evidenceStage === 'after' && !workFinished;

  const locationRequired = evidenceStage === 'before' || evidenceStage === 'after';

  const readLocation = async (): Promise<{ lat: number; lng: number; accuracy?: number }> => {
    const { Geolocation } = await import('@capacitor/geolocation');
    let permission = await Geolocation.checkPermissions();
    const granted = (status?: string) => status === 'granted';
    if (!granted(permission.location) && !granted(permission.coarseLocation)) {
      setAskingLocation(true);
      permission = await Geolocation.requestPermissions();
      setAskingLocation(false);
    }
    if (!granted(permission.location) && !granted(permission.coarseLocation)) {
      throw new Error('Location is off for this app. Allow location so the photo shows where it was taken.');
    }
    const pos = await Promise.race([
      Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Location timed out. Turn location on and try the photo again.')), 16000)),
    ]);
    return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
  };

  const capturePhoto = async () => {
    setError(null);
    setLoading(true);
    try {
      let gps: { lat: number; lng: number; accuracy?: number } | null = null;
      if (locationRequired) {
        gps = await readLocation();
      } else {
        try { gps = await readLocation(); } catch { gps = null; }
      }
      if (draftKey && typeof window !== 'undefined') {
        markCameraPending(draftKey, `${window.location.pathname}${window.location.search}`, gps);
      }
      let dataUrl: string;
      try {
        dataUrl = await captureLivePhotoDataUrl();
      } finally {
        clearCameraPending();
      }
      const shot: CapturedShot = {
        id: `${Date.now()}-${shots.length}`,
        dataUrl,
        capturedAt: new Date().toISOString(),
        gps,
      };
      setShots((current) => [...current, shot]);
      setActiveShotId(shot.id);
    } catch (err: any) {
      setError(err?.message ?? 'Camera failed');
    } finally {
      setLoading(false);
    }
  };

  const toAttachment = async (shot: CapturedShot): Promise<EvidenceAttachment> => {
    const mimeType = shot.dataUrl.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
    return {
      imageBase64: shot.dataUrl.split(',')[1] ?? shot.dataUrl,
      mimeType,
      gpsLat: shot.gps?.lat ?? null,
      gpsLng: shot.gps?.lng ?? null,
      timestamp: shot.capturedAt,
      sha256: await sha256Hex(shot.dataUrl),
    };
  };

  const handleAttach = async () => {
    if (shots.length === 0 && records.length === 0) return;
    setLoading(true);
    try {
      const [primary, ...rest] = shots;
      const primaryAttachment = primary ? await toAttachment(primary) : undefined;
      const attachments = await Promise.all(rest.map((shot) => toAttachment(shot)));
      const record = records[0]?.vc;
      const recordType = String(record?.vc_type || record?.type || '');
      await Promise.resolve(onCapture({
        imageBase64: primaryAttachment?.imageBase64,
        mimeType: primaryAttachment?.mimeType,
        gpsLat: primaryAttachment?.gpsLat ?? null,
        gpsLng: primaryAttachment?.gpsLng ?? null,
        timestamp: primaryAttachment?.timestamp || new Date().toISOString(),
        sha256: primaryAttachment?.sha256,
        notes,
        attachments,
        performanceVc: /performance/i.test(recordType) ? record : undefined,
        receiptVc: record && !/performance/i.test(recordType) ? record : undefined,
        evidenceStage,
      }));
      if (draftKey) clearPhotoDraft(draftKey);
    } catch (err: any) {
      setError(`${err?.message ?? 'The photo could not be sent.'} Your photos are kept on this phone; tap save to try again.`);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectVc = (vc: any) => {
    setRecords((current) => [...current, { id: String(vc.id || `${Date.now()}`), label: walletRecordLabel(vc), vc }]);
  };

  return (
    <Stack gap="md" p="md">
      {workflowLabel && (
        <Text size="sm" c="dimmed">
          Attaching {currentStage.title.toLowerCase()} to: <strong>{workflowLabel}</strong>
        </Text>
      )}

      <Alert color="blue" variant="light" title={currentStage.title} icon={<IconShieldCheck size={18} />}>
        <Text size="xs">{currentStage.helper}</Text>
        {locationRequired && (
          <Text size="xs" mt={6}>This photo needs this phone’s location. You will be asked to allow it before the camera opens.</Text>
        )}
      </Alert>

      {draftNotKept && (
        <Alert color="yellow" variant="light" radius="sm">
          This phone is low on space, so these photos are only kept while this screen is open. Save them before leaving.
        </Alert>
      )}

      {error && (
        <Alert icon={<IconAlertCircle size={16} />} color="red" radius="sm">
          {error}
        </Alert>
      )}

      {needsFinishedConfirmation && (
        <Paper withBorder p="md" radius="md">
          <Stack gap="sm">
            <Text size="sm" fw={600}>Is the work finished?</Text>
            <Text size="xs" c="dimmed">
              After photos are the proof the job is done. Take them only when there is nothing left to do on site.
            </Text>
            <Button size="md" color="teal" onClick={() => setWorkFinished(true)}>
              Yes, the work is finished
            </Button>
            <Button variant="subtle" color="gray" onClick={onCancel}>Not yet, go back</Button>
          </Stack>
        </Paper>
      )}

      {!isPhotoOnlyStage && !needsFinishedConfirmation && (
        <>
          <Alert color="teal" icon={<IconShieldCheck size={20} />} title="Two ways to add this">
            <Text size="xs">If you already have a matching record in your wallet, use it. Otherwise take a photo.</Text>
          </Alert>

          <WalletRecordPickerButton onSelect={handleSelectVc} />

          <Divider label="OR TAKE A PHOTO" labelPosition="center" />
        </>
      )}

      {/* Attached photos and documents, with add and remove before saving. */}
      {needsFinishedConfirmation ? null : shots.length === 0 && records.length === 0 ? (
        <Center
          style={{
            height: 120,
            background: '#f1f5f9',
            borderRadius: 12,
            border: '2px dashed #cbd5e1',
            cursor: 'pointer',
          }}
          onClick={capturePhoto}
        >
          {loading ? (
            <Loader />
          ) : (
            <Stack align="center" gap="xs">
              <IconCamera size={32} color="#94a3b8" />
              <Text size="xs" c="dimmed">
                Tap to take a photo
              </Text>
            </Stack>
          )}
        </Center>
      ) : (
        <Stack gap="xs">
          <Group gap={8} wrap="wrap">
            {shots.map((shot, index) => (
              <Box key={shot.id} style={{ position: 'relative', width: 72, height: 72 }}>
                <UnstyledButton onClick={() => setActiveShotId(shot.id)} style={{ width: 72, height: 72 }}>
                  <Image
                    src={shot.dataUrl}
                    alt={`Photo ${index + 1}`}
                    w={72}
                    h={72}
                    radius="md"
                    style={{ objectFit: 'cover', outline: shot.id === activeShot?.id ? '2px solid var(--mantine-color-blue-6)' : undefined }}
                  />
                </UnstyledButton>
                <ActionIcon
                  size="xs"
                  variant="filled"
                  color="dark"
                  radius="xl"
                  aria-label={`Remove photo ${index + 1}`}
                  style={{ position: 'absolute', top: 2, right: 2 }}
                  onClick={() => {
                    setShots((current) => current.filter((item) => item.id !== shot.id));
                    if (activeShotId === shot.id) setActiveShotId(null);
                  }}
                >
                  <IconX size={10} />
                </ActionIcon>
              </Box>
            ))}
            {records.map((record) => (
              <Paper key={record.id} withBorder radius="md" p={6} w={120} style={{ position: 'relative' }}>
                <Group gap={6} wrap="nowrap">
                  <IconFileText size={16} />
                  <Text size="xs" lineClamp={2}>{record.label}</Text>
                </Group>
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  color="gray"
                  aria-label={`Remove ${record.label}`}
                  style={{ position: 'absolute', top: 2, right: 2 }}
                  onClick={() => setRecords((current) => current.filter((item) => item.id !== record.id))}
                >
                  <IconX size={10} />
                </ActionIcon>
              </Paper>
            ))}
            <UnstyledButton
              onClick={capturePhoto}
              disabled={loading}
              aria-label="Add another photo"
              style={{
                width: 72,
                height: 72,
                borderRadius: 8,
                border: '2px dashed #cbd5e1',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
              }}
            >
              {loading ? <Loader size="xs" /> : <IconPlus size={16} color="#94a3b8" />}
              <Text size="xs" c="dimmed">Add</Text>
            </UnstyledButton>
          </Group>
          {activeShot && (
            <Box>
              <Image src={activeShot.dataUrl} alt="Selected photo" radius="md" h={140} fit="cover" />
              <Group gap="xs" mt="xs">
                {activeShot.gps ? (
                  <Badge size="sm" color="green" leftSection={<IconMapPin size={10} />}>
                    GPS: {activeShot.gps.lat.toFixed(5)}, {activeShot.gps.lng.toFixed(5)}
                  </Badge>
                ) : (
                  <Badge size="sm" color="gray">No GPS</Badge>
                )}
                <Badge size="sm" color="blue">Taken {new Date(activeShot.capturedAt).toLocaleTimeString()}</Badge>
                <Badge size="sm" color="gray" variant="light">Live photo</Badge>
              </Group>
            </Box>
          )}
        </Stack>
      )}

      {!needsFinishedConfirmation && (
      <Textarea
        label="Notes (optional)"
        placeholder="Anything worth noting about this photo..."
        rows={3}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        radius="sm"
      />
      )}

      {!needsFinishedConfirmation && (
      <Stack gap="xs">
        {(shots.length > 0 || records.length > 0) && (
          <Button
            fullWidth
            size="lg"
            leftSection={<IconCheck size={18} />}
            onClick={handleAttach}
            loading={loading}
          >
            {loading ? 'Sending to the job…' : currentStage.button}{!loading && shots.length + records.length > 1 ? ` (${shots.length + records.length})` : ''}
          </Button>
        )}
        {evidenceStage === 'receipt' && onUsePurchaseReceipts && purchaseReceipts.length > 0 && shots.length === 0 && records.length === 0 && (
          <Paper p="sm" radius="md" withBorder>
            <Stack gap={6}>
              <Text size="sm" fw={600}>Receipts from buying materials</Text>
              {purchaseReceipts.map((receipt, index) => (
                <Group key={index} gap={8} wrap="nowrap" align="center">
                  {receipt.photoUri ? (
                    <Image src={receipt.photoUri} alt={purchaseReceiptLine(receipt)} w={48} h={48} radius="sm" style={{ objectFit: 'cover' }} />
                  ) : (
                    <IconFileText size={20} />
                  )}
                  <Text size="xs">{purchaseReceiptLine(receipt)}</Text>
                </Group>
              ))}
              <Button
                fullWidth
                color="teal"
                disabled={loading}
                onClick={async () => {
                  setLoading(true);
                  setError(null);
                  try {
                    await onUsePurchaseReceipts();
                  } catch (err: any) {
                    setError(err?.message || 'Could not use these receipts');
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                Use these receipts
              </Button>
            </Stack>
          </Paper>
        )}
        {evidenceStage === 'receipt' && onNoReceipt && shots.length === 0 && records.length === 0 && (
          <Button
            variant="light"
            color="gray"
            fullWidth
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              setError(null);
              try {
                await onNoReceipt();
              } catch (err: any) {
                setError(err?.message || 'Could not carry on');
              } finally {
                setLoading(false);
              }
            }}
          >
            No materials bought – carry on
          </Button>
        )}
        <Button variant="subtle" color="gray" fullWidth onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
      </Stack>
      )}

    </Stack>
  );
}
