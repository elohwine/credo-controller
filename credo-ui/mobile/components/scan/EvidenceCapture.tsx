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
import React, { useState } from 'react';
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
  Modal,
  Paper,
  ActionIcon,
  UnstyledButton,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCamera, IconAlertCircle, IconCheck, IconMapPin, IconShieldCheck, IconPlus, IconX, IconFileText } from '@tabler/icons-react';
import { Capacitor } from '@capacitor/core';
import { decodeJwtPayload, getWalletToken } from '@/lib/auth';
import api from '@/lib/api';

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
  gps: { lat: number; lng: number } | null;
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
}

async function sha256Hex(dataUrl: string): Promise<string> {
  const base64 = dataUrl.split(',')[1] ?? dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export default function EvidenceCapture({ onCapture, onCancel, workflowLabel, evidenceStage = 'before' }: EvidenceCaptureProps) {
  const [shots, setShots] = useState<CapturedShot[]>([]);
  const [records, setRecords] = useState<AttachedRecord[]>([]);
  const [activeShotId, setActiveShotId] = useState<string | null>(null);
  const [workFinished, setWorkFinished] = useState(false);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      title: 'Receipts',
      helper: 'Add a receipt for parts or materials used on this job.',
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

  const capturePhoto = async () => {
    setError(null);
    setLoading(true);
    try {
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
      const photo = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
      });

      if (!photo.dataUrl) throw new Error('No image returned');
      let gps: { lat: number; lng: number } | null = null;
      try {
        const { Geolocation } = await import('@capacitor/geolocation');
        const pos = await Geolocation.getCurrentPosition({ timeout: 8000 });
        gps = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      } catch {
        gps = null;
      }
      const shot: CapturedShot = {
        id: `${Date.now()}-${shots.length}`,
        dataUrl: photo.dataUrl,
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
    } catch (err: any) {
      setError(err?.message ?? 'Failed to process image');
    } finally {
      setLoading(false);
    }
  };

  const [vcModalOpen, setVcModalOpen] = useState(false);
  const [availableVcs, setAvailableVcs] = useState<any[]>([]);
  const [vcLoading, setVcLoading] = useState(false);

  const fetchWalletVcs = async () => {
    setVcLoading(true);
    try {
      const token = getWalletToken();
      if (!token) return;
      const payload = decodeJwtPayload(token);
      const walletId = payload?.tenantId ?? payload?.sub;
      if (!walletId) return;

      const res = await api.get(`/api/wallet/${walletId}/credentials/list?limit=100`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const items = Array.isArray(res.data?.items) ? res.data.items : (Array.isArray(res.data) ? res.data : []);
      // Filter for relevant ones
      const relevant = items.filter((item: any) => {
        const type = String(item.vc_type || item.type || '');
        return /performance|receipt|work|delivery|job/i.test(type);
      });
      setAvailableVcs(relevant);
      setVcModalOpen(true);
    } catch (err: any) {
      notifications.show({ title: 'Wallet', message: 'Could not load records from your wallet.', color: 'red' });
    } finally {
      setVcLoading(false);
    }
  };

  const handleSelectVc = (vc: any) => {
    const label = String(vc.vc_type || vc.type || 'Record').replace(/VC$/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
    setRecords((current) => [...current, { id: String(vc.id || `${Date.now()}`), label, vc }]);
    setVcModalOpen(false);
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
      </Alert>

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

          {/* VC Selection */}
          <Button
            variant="filled"
            color="teal"
            size="lg"
            leftSection={<IconShieldCheck size={20} />}
            onClick={fetchWalletVcs}
            loading={vcLoading}
          >
            Use a record from my wallet
          </Button>

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
            {currentStage.button}{shots.length + records.length > 1 ? ` (${shots.length + records.length})` : ''}
          </Button>
        )}
        <Button variant="subtle" color="gray" fullWidth onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
      </Stack>
      )}

      <Modal opened={vcModalOpen} onClose={() => setVcModalOpen(false)} title="Choose a record" centered radius="lg">
        <Stack gap="sm">
          {availableVcs.length === 0 ? (
            <Text size="sm" c="dimmed" ta="center" py="xl">No matching records in your wallet yet. Take a photo instead.</Text>
          ) : (
            availableVcs.map((vc) => (
              <Paper key={vc.id} withBorder p="sm" radius="md" style={{ cursor: 'pointer' }} onClick={() => handleSelectVc(vc)}>
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
    </Stack>
  );
}
