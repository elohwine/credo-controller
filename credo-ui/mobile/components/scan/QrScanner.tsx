/**
 * QR Scanner — uses @capacitor-mlkit/barcode-scanning on native,
 * falls back to a text-paste input for web dev mode.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Stack, Text, Button, TextInput, Alert, Loader, Center } from '@mantine/core';
import { IconAlertCircle, IconQrcode } from '@tabler/icons-react';
import { Capacitor } from '@capacitor/core';

interface QrScannerProps {
  onResult: (value: string) => void;
  onCancel: () => void;
  hint?: string;
}

export default function QrScanner({ onResult, onCancel, hint }: QrScannerProps) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devInput, setDevInput] = useState('');
  const isNative = Capacitor.isNativePlatform();
  const scannerListenerRef = useRef<{ remove: () => Promise<void> } | null>(null);

  const cleanupScanner = useCallback(async () => {
    try {
      const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning');
      if (scannerListenerRef.current) {
        await scannerListenerRef.current.remove().catch(() => {});
        scannerListenerRef.current = null;
      }
      await BarcodeScanner.removeAllListeners().catch(() => {});
      await BarcodeScanner.stopScan().catch(() => {});
    } catch {
      // Ignore cleanup errors.
    }
  }, []);

  const formatNativeScannerError = (err: any): string => {
    const raw = String(err?.message || err || '').trim();
    if (!raw) return 'Unable to start camera scanner.';

    const lower = raw.toLowerCase();
    if (lower.includes('permission')) return 'Camera permission is required to scan QR codes.';
    if (lower.includes('cancelled')) return 'Scan was cancelled.';
    if (lower.includes('io.capawesome.capacitorjs.plugins.mlkit.barcodescanning')) {
      return 'Camera failed to launch. Close other camera apps, grant camera permission, and try again.';
    }
    if (lower.includes('lambda$startscan')) {
      return 'Camera failed to launch. Please retry scanning.';
    }

    return raw;
  };

  const startNativeScan = useCallback(async () => {
    setError(null);
    setScanning(true);
    try {
      // Dynamic import to avoid breaking SSR/static export
      const { BarcodeScanner, BarcodeFormat } = await import('@capacitor-mlkit/barcode-scanning');

      const supportStatus = await BarcodeScanner.isSupported().catch(() => ({ supported: true }));
      if (supportStatus?.supported === false) {
        throw new Error('Barcode scanning is not supported on this device.');
      }

      // Prefer plugin-provided scan UI first (more stable on some Android devices).
      try {
        const oneShot = await BarcodeScanner.scan({
          formats: [BarcodeFormat.QrCode],
          autoZoom: true,
        } as any);
        const first = oneShot?.barcodes?.[0]?.rawValue;
        if (first) {
          setScanning(false);
          onResult(first);
          return;
        }
      } catch {
        // Fall back to the live startScan flow below.
      }

      // Ensure stale listeners/scans are not left active between attempts.
      await cleanupScanner();

      const permissions = await BarcodeScanner.checkPermissions().catch(() => ({ camera: 'prompt' as const }));
      const currentCameraPermission = permissions?.camera;

      // Request camera permission
      const { camera } = currentCameraPermission === 'granted' || currentCameraPermission === 'limited'
        ? permissions
        : await BarcodeScanner.requestPermissions();
      if (camera !== 'granted' && camera !== 'limited') {
        throw new Error('Camera permission denied');
      }

      // Start listening for scans
      const listener = await BarcodeScanner.addListener('barcodesScanned', async (event: any) => {
        const value = event?.barcodes?.[0]?.rawValue;
        if (!value) return;
        setScanning(false);
        await cleanupScanner();
        onResult(value);
      });
      scannerListenerRef.current = listener as any;

      try {
        await BarcodeScanner.startScan({ formats: [BarcodeFormat.QrCode] });
      } catch {
        // Some Android devices/plugin versions fail on strict format filters.
        // Retry with plugin defaults before surfacing an error.
        await BarcodeScanner.startScan();
      }
    } catch (err: any) {
      setError(formatNativeScannerError(err));
      setScanning(false);
    }
  }, [cleanupScanner, onResult]);

  useEffect(() => {
    if (isNative) {
      startNativeScan();
    }
    return () => {
      // Cleanup if unmounted during scan
      if (isNative) {
        void cleanupScanner();
      }
    };
  }, [cleanupScanner, isNative, startNativeScan]);

  // Web / dev fallback
  if (!isNative) {
    return (
      <Stack gap="md" p="md">
        <Alert icon={<IconQrcode size={16} />} color="blue" radius="sm">
          {hint ?? 'Running in browser — paste the QR content below to test.'}
        </Alert>
        {error && (
          <Alert icon={<IconAlertCircle size={16} />} color="red" radius="sm">
            {error}
          </Alert>
        )}
        <TextInput
          label="QR / credential offer URI"
          placeholder="openid-credential-offer://... or paste VP token"
          value={devInput}
          onChange={(e) => setDevInput(e.target.value)}
          size="md"
        />
        <Button
          fullWidth
          size="lg"
          disabled={!devInput.trim()}
          onClick={() => onResult(devInput.trim())}
        >
          Submit
        </Button>
        <Button variant="subtle" color="gray" fullWidth onClick={onCancel}>
          Cancel
        </Button>
      </Stack>
    );
  }

  // Native: show loading while scanner is active (screen is transparent)
  return (
    <Center style={{ minHeight: 200 }}>
      <Stack align="center" gap="md">
        {scanning && <Loader color="white" size="lg" />}
        {error && (
          <Stack gap="sm" align="center">
            <Alert icon={<IconAlertCircle size={16} />} color="red">
              {error}
            </Alert>
            <TextInput
              label="Paste QR content instead"
              placeholder="openid4vp://... or openid-credential-offer://..."
              value={devInput}
              onChange={(e) => setDevInput(e.currentTarget.value)}
              size="sm"
            />
            <Button disabled={!devInput.trim()} onClick={() => onResult(devInput.trim())}>
              Submit Manually
            </Button>
            <Button onClick={startNativeScan}>Try again</Button>
            <Button variant="subtle" color="gray" onClick={onCancel}>
              Cancel
            </Button>
          </Stack>
        )}
      </Stack>
    </Center>
  );
}
