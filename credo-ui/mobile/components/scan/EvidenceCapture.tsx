/**
 * EvidenceCapture — photo + GPS + SHA-256 hash using Capacitor Camera + Geolocation
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
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCamera, IconAlertCircle, IconCheck, IconMapPin, IconShieldCheck } from '@tabler/icons-react';
import { Capacitor } from '@capacitor/core';
import { decodeJwtPayload, getWalletToken } from '@/lib/auth';
import api from '@/lib/api';

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
}

interface EvidenceCaptureProps {
  onCapture: (payload: EvidencePayload) => Promise<void> | void;
  onCancel: () => void;
  workflowLabel?: string;
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

export default function EvidenceCapture({ onCapture, onCancel, workflowLabel }: EvidenceCaptureProps) {
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setImageDataUrl(photo.dataUrl);

      // Get GPS concurrently
      try {
        const { Geolocation } = await import('@capacitor/geolocation');
        const pos = await Geolocation.getCurrentPosition({ timeout: 8000 });
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      } catch {
        // GPS optional — continue without it
        setGps(null);
      }
    } catch (err: any) {
      setError(err?.message ?? 'Camera failed');
    } finally {
      setLoading(false);
    }
  };

  const handleAttach = async () => {
    if (!imageDataUrl) return;
    setLoading(true);
    try {
      const hash = await sha256Hex(imageDataUrl);
      const mimeType = imageDataUrl.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
      await Promise.resolve(onCapture({
        imageBase64: imageDataUrl.split(',')[1] ?? imageDataUrl,
        mimeType,
        gpsLat: gps?.lat ?? null,
        gpsLng: gps?.lng ?? null,
        timestamp: new Date().toISOString(),
        sha256: hash,
        notes,
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
      notifications.show({ title: 'Wallet Error', message: 'Could not load VCs', color: 'red' });
    } finally {
      setVcLoading(false);
    }
  };

  const handleSelectVc = async (vc: any) => {
    setVcModalOpen(false);
    await Promise.resolve(onCapture({
      timestamp: new Date().toISOString(),
      notes: notes || `Attached ${vc.vc_type || vc.type}`,
      performanceVc: /performance/i.test(vc.vc_type || vc.type) ? vc : undefined,
      receiptVc: /receipt/i.test(vc.vc_type || vc.type) ? vc : undefined,
    }));
  };

  return (
    <Stack gap="md" p="md">
      {workflowLabel && (
        <Text size="sm" c="dimmed">
          Attaching evidence to: <strong>{workflowLabel}</strong>
        </Text>
      )}

      {error && (
        <Alert icon={<IconAlertCircle size={16} />} color="red" radius="sm">
          {error}
        </Alert>
      )}

      <Alert color="teal" icon={<IconShieldCheck size={20} />} title="Secured Operation Mode">
        <Text size="xs">Prioritize verified records for cryptographically proven performance. Manual photos are available as fallback.</Text>
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
        Use Verified Record
      </Button>

      <Divider label="OR MANUAL FALLBACK" labelPosition="center" />

      {/* Preview */}
      {imageDataUrl ? (
        <Box>
          <Image
            src={imageDataUrl}
            alt="Captured evidence"
            radius="md"
            style={{ maxHeight: 260, objectFit: 'cover' }}
          />
          <Group gap="xs" mt="xs">
            {gps ? (
              <Badge
                size="sm"
                color="green"
                leftSection={<IconMapPin size={10} />}
              >
                GPS: {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
              </Badge>
            ) : (
              <Badge size="sm" color="gray">
                No GPS
              </Badge>
            )}
            <Badge size="sm" color="blue">
              {new Date().toLocaleTimeString()}
            </Badge>
          </Group>
        </Box>
      ) : (
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
                Tap to take fallback photo
              </Text>
            </Stack>
          )}
        </Center>
      )}

      <Textarea
        label="Notes (optional)"
        placeholder="Describe what the evidence shows..."
        rows={3}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        radius="sm"
      />

      <Stack gap="xs">
        {imageDataUrl && (
          <>
            <Button
              fullWidth
              size="lg"
              leftSection={<IconCheck size={18} />}
              onClick={handleAttach}
              loading={loading}
            >
              Attach Manual Evidence
            </Button>
            <Button
              variant="light"
              color="gray"
              fullWidth
              leftSection={<IconCamera size={16} />}
              onClick={capturePhoto}
              disabled={loading}
            >
              Retake
            </Button>
          </>
        )}
        <Button variant="subtle" color="gray" fullWidth onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
      </Stack>

      <Modal opened={vcModalOpen} onClose={() => setVcModalOpen(false)} title="Select Verified Evidence" centered radius="lg">
        <Stack gap="sm">
          {availableVcs.length === 0 ? (
            <Text size="sm" c="dimmed" ta="center" py="xl">No suitable records found in wallet.</Text>
          ) : (
            availableVcs.map((vc) => (
              <Paper key={vc.id} withBorder p="sm" radius="md" style={{ cursor: 'pointer' }} onClick={() => handleSelectVc(vc)}>
                <Group justify="space-between">
                  <Box>
                    <Text fw={600} size="sm">{vc.vc_type || vc.type}</Text>
                    <Text size="xs" c="dimmed">{vc.issuer_name || 'Verified Issuer'}</Text>
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
