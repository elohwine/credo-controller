import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Group, Stack, Text } from '@mantine/core';
import { sha256Hex, type FieldEvidencePayload } from '../../../shared/fieldEvidence';

export function readJobLocation(): Promise<{ lat: number; lng: number; accuracy: number }> {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Location is unavailable on this device. Use a device with location access.'));
            return;
        }
        navigator.geolocation.getCurrentPosition(
            ({ coords }) => resolve({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy }),
            (error) => reject(new Error(`Location is needed for this step. ${error.message}`)),
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
        );
    });
}

/** Browser counterpart of the native live camera; no gallery or file uploads. */
export default function LiveJobPhoto({ onCapture, requireLocation = true }: {
    onCapture: (photo: FieldEvidencePayload) => void;
    requireLocation?: boolean;
}) {
    const video = useRef<HTMLVideoElement>(null);
    const stream = useRef<MediaStream | null>(null);
    const mounted = useRef(true);
    const [cameraOpen, setCameraOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const stopCamera = () => {
        stream.current?.getTracks().forEach((track) => track.stop());
        stream.current = null;
        setCameraOpen(false);
    };

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            stream.current?.getTracks().forEach((track) => track.stop());
        };
    }, []);

    useEffect(() => {
        if (cameraOpen && video.current) video.current.srcObject = stream.current;
    }, [cameraOpen]);

    const openCamera = async () => {
        setBusy(true);
        setError('');
        try {
            if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser has no live camera. Open the job on a camera-enabled device.');
            const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
            if (!mounted.current) {
                media.getTracks().forEach((track) => track.stop());
                return;
            }
            stream.current = media;
            setCameraOpen(true);
        } catch (error) {
            if (mounted.current) setError(error instanceof Error ? error.message : 'The camera could not be opened.');
        } finally {
            if (mounted.current) setBusy(false);
        }
    };

    const capture = async () => {
        setBusy(true);
        setError('');
        try {
            const gps = requireLocation ? await readJobLocation() : undefined;
            if (!mounted.current) return;
            const source = video.current;
            if (!source?.videoWidth || !source.videoHeight) throw new Error('Wait for the live camera preview, then take the photo.');
            const canvas = document.createElement('canvas');
            const scale = Math.min(1, 1600 / source.videoWidth);
            canvas.width = Math.round(source.videoWidth * scale);
            canvas.height = Math.round(source.videoHeight * scale);
            const context = canvas.getContext('2d');
            if (!context) throw new Error('This browser could not capture a photo.');
            context.drawImage(source, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            const timestamp = new Date().toISOString();
            const sha256 = await sha256Hex(dataUrl);
            if (!mounted.current) return;
            stopCamera();
            onCapture({
                imageBase64: dataUrl.split(',')[1],
                mimeType: 'image/jpeg',
                gpsLat: gps?.lat,
                gpsLng: gps?.lng,
                timestamp,
                sha256,
                notes: '',
            });
        } catch (error) {
            if (mounted.current) setError(error instanceof Error ? error.message : 'The photo could not be captured.');
        } finally {
            if (mounted.current) setBusy(false);
        }
    };

    return <Stack gap="xs">
        {error && <Alert color="red">{error}</Alert>}
        {requireLocation && <Text size="xs" c="dimmed">Live camera and this device's location are required. Allow both when prompted.</Text>}
        {cameraOpen ? <>
            <video ref={video} autoPlay playsInline muted aria-label="Live job camera" style={{ width: '100%', maxHeight: 300 }} />
            <Group>
                <Button onClick={() => void capture()} loading={busy}>Take live photo</Button>
                <Button variant="subtle" onClick={stopCamera} disabled={busy}>Close camera</Button>
            </Group>
        </> : <Button variant="light" onClick={() => void openCamera()} loading={busy}>Open live camera</Button>}
    </Stack>;
}
