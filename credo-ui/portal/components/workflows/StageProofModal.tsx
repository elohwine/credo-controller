import React from 'react';
import { useRouter } from 'next/router';
import { Modal, Stack, Text, Paper, Button, Center, Loader, Alert } from '@mantine/core';
import { IconWallet, IconExternalLink, IconCopy, IconId } from '@tabler/icons-react';
import QRCode from 'react-qr-code';

interface StageProofModalProps {
    opened: boolean;
    onClose: () => void;
    title: string;
    description: string;
    requestUrl: string | null;
    /** Proof request id, carried to the review screen so the step can finish after the person shares. */
    requestId?: string | null;
    /** Extra details the review screen needs (which job or request, and which step). */
    review?: Record<string, string>;
    creating: boolean;
    error?: string | null;
}

function toWalletLink(requestUrl: string): string {
    try {
        const requestUri = new URL(requestUrl).searchParams.get('request_uri');
        if (requestUri) return `openid4vp://authorize?request_uri=${encodeURIComponent(requestUri)}`;
    } catch {
        // keep the raw request URL
    }
    return requestUrl;
}

/** QR codes hold ~2.9 KB; local-dev requests are sent by value and can be far larger. */
const MAX_QR_LINK_LENGTH = 2500;

/** The API says this when the wallet has no role card for the organization yet. */
export function isMissingRoleCardError(message?: string | null): boolean {
    return /role card/i.test(String(message || ''));
}

/** Drop the "(missing: …)" log hint the API appends so people only see the plain sentence. */
const GENERIC_STEP_ERROR = 'This step could not be completed right now. Please try again, or ask your administrator for help.';

export function plainProofError(message?: string | null): string {
    const cleaned = String(message || '').replace(/\s*\(missing:[^)]*\)\s*$/i, '').trim();
    // Raw technical dumps (JSON, stack traces, credential ids) are not for end users.
    if (cleaned.length > 240 || /[{}"]|_jwt_vc|\bTS\d+\b|Error:/.test(cleaned)) return GENERIC_STEP_ERROR;
    return cleaned;
}

/**
 * Wallet-proof step. The person reviews what will be shared before anything is sent.
 * On this device that review is the wallet page. A phone can scan, or any wallet that
 * understands the link can open it.
 */
export default function StageProofModal({
    opened, onClose, title, description, requestUrl, requestId, review, creating, error,
}: StageProofModalProps) {
    const router = useRouter();
    const walletLink = requestUrl ? toWalletLink(requestUrl) : '';
    const canShowQr = walletLink.length > 0 && walletLink.length <= MAX_QR_LINK_LENGTH;
    const missingRoleCard = isMissingRoleCardError(error);

    const reviewOnThisDevice = () => {
        if (!requestUrl || typeof window === 'undefined') return;
        const ref = `vp-review-${Date.now()}`;
        window.sessionStorage.setItem(ref, requestUrl);
        const params = new URLSearchParams({
            mode: 'approval',
            presentationRequestRef: ref,
            returnTo: router.asPath.split('#')[0] || '/finance',
        });
        if (requestId) params.set('requestId', requestId);
        for (const [key, value] of Object.entries(review || {})) {
            if (value) params.set(key, value);
        }
        void router.push(`/wallet?${params.toString()}`);
    };

    return (
        <Modal opened={opened} onClose={onClose} title={title} centered>
            <Stack align="center" py="sm">
                <Text size="sm" ta="center" c="dimmed">{description}</Text>
                {creating && <Center py="lg"><Loader /></Center>}
                {!creating && requestUrl && (
                    <>
                        <Button
                            fullWidth
                            leftSection={<IconWallet size={16} />}
                            onClick={reviewOnThisDevice}
                        >
                            Review and share on this device
                        </Button>
                        <Text size="xs" c="dimmed" ta="center">
                            You will see exactly what is shared before you confirm.
                        </Text>
                        {canShowQr ? (
                            <>
                                <Text size="xs" c="dimmed" ta="center" mt="xs">
                                    Or scan with this app, or with any other wallet, on your phone.
                                </Text>
                                <Paper p="md" radius="md" withBorder bg="white">
                                    <QRCode value={walletLink} size={160} />
                                </Paper>
                            </>
                        ) : (
                            <Text size="xs" c="dimmed" ta="center" mt="xs">
                                Scanning is not available for this link. Use the button above, or open it in a wallet on this device.
                            </Text>
                        )}
                        <Button
                            variant="subtle" color="gray" size="xs" fullWidth
                            leftSection={<IconExternalLink size={14} />}
                            onClick={() => window.open(walletLink, '_blank')}
                        >
                            Open in a wallet on this device
                        </Button>
                        <Button
                            variant="subtle" color="gray" size="xs" fullWidth
                            leftSection={<IconCopy size={14} />}
                            onClick={() => navigator.clipboard?.writeText(walletLink || requestUrl)}
                        >
                            Copy link
                        </Button>
                    </>
                )}
                {!creating && !requestUrl && !error && (
                    <Text c="red" size="sm">We could not prepare this step. Close and try again.</Text>
                )}
                {error && (
                    <Alert color="red" variant="light" w="100%">
                        <Stack gap="xs">
                            <Text size="sm">{plainProofError(error)}</Text>
                            {missingRoleCard && (
                                <Button
                                    size="xs" variant="light" color="red"
                                    leftSection={<IconId size={14} />}
                                    onClick={() => { onClose(); void router.push('/organization/actors'); }}
                                >
                                    Add my role card under Who does what
                                </Button>
                            )}
                        </Stack>
                    </Alert>
                )}
            </Stack>
        </Modal>
    );
}
