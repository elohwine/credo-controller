import { PRODUCT_NAME } from '@/utils/orgProfile'
import React, { useState } from 'react';
import QRCode from 'react-qr-code';
import {
    Anchor,
    Box,
    Button,
    Collapse,
    Divider,
    Group,
    Paper,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { IconClipboard, IconDeviceMobile } from '@tabler/icons-react';

interface CredentialOfferCardProps {
    /** The credential offer URI for QR code */
    offerUri: string;
    /** Optional deep link for mobile wallets */
    deepLink?: string;
    /** Credential type name for display */
    credentialType?: string;
    /** Optional claims to preview */
    claims?: Record<string, any>;
    /** Opening a wallet is not evidence of acceptance. */
    onOpenWallet?: () => void;
    /** Optional calculation results for finance workflows */
    financeResult?: {
        subtotal?: number | string;
        taxAmount?: number | string;
        discountAmount?: number | string;
        grandTotal?: number | string;
    };
    /** Whether to show compact view */
    compact?: boolean;
}

const BUTTON_COPY_TEXT_DEFAULT = 'Copy link';
const BUTTON_COPY_TEXT_COPIED = 'Copied!';

function FinanceRow({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
    return (
        <Group justify="space-between" wrap="nowrap">
            <Text size="sm" c={strong ? undefined : 'dimmed'} fw={strong ? 700 : undefined}>
                {label}
            </Text>
            <Text size="sm" ff="monospace" fw={strong ? 700 : undefined}>
                {value}
            </Text>
        </Group>
    );
}

/**
 * Unified offer card shown by every issuance flow (generic documents,
 * quote/invoice/receipt workflows): QR code, copy link, open on this device
 * and an optional finance calculation summary.
 */
export default function CredentialOfferCard({
    offerUri,
    deepLink,
    credentialType = 'Credential',
    claims,
    onOpenWallet,
    financeResult,
    compact = false,
}: CredentialOfferCardProps) {
    const [copyText, setCopyText] = useState(BUTTON_COPY_TEXT_DEFAULT);
    const [copyError, setCopyError] = useState<string | null>(null);
    const [showLink, setShowLink] = useState(false);
    const link = deepLink || offerUri;

    const handleCopy = async () => {
        try {
            setCopyError(null);
            await navigator.clipboard.writeText(link);
            setCopyText(BUTTON_COPY_TEXT_COPIED);
            setTimeout(() => setCopyText(BUTTON_COPY_TEXT_DEFAULT), 3000);
        } catch (err) {
            setCopyError('Could not copy the link. Select and copy it below.');
        }
    };

    return (
        <Paper shadow="md" radius="lg" p="xl" withBorder maw={compact ? 384 : 448} mx="auto" ta="center">
            <Title order={3} mb={4}>
                {credentialType}
            </Title>
            <Text size="sm" c="dimmed" mb="lg">
                Scan the QR code with your phone, or open the link on this device
            </Text>

            {/* White backing keeps the QR code scannable in dark mode. */}
            <Group justify="center" mb="lg">
                <Box bg="white" p="sm" style={{ borderRadius: 'var(--mantine-radius-md)', lineHeight: 0 }}>
                    <QRCode value={link} viewBox="0 0 256 256" style={{ height: 200, width: 200 }} />
                </Box>
            </Group>

            {financeResult && (
                <Paper p="md" radius="md" mb="lg" ta="left" bg="var(--mantine-color-default-hover)">
                    <Text size="sm" fw={600} mb="xs">
                        Calculation
                    </Text>
                    <Stack gap={4}>
                        {financeResult.subtotal && <FinanceRow label="Subtotal:" value={financeResult.subtotal} />}
                        {financeResult.taxAmount && <FinanceRow label="Tax:" value={financeResult.taxAmount} />}
                        {financeResult.discountAmount && (
                            <FinanceRow label="Discount:" value={`-${financeResult.discountAmount}`} />
                        )}
                        {financeResult.grandTotal && (
                            <>
                                <Divider my={4} />
                                <FinanceRow label="Total:" value={financeResult.grandTotal} strong />
                            </>
                        )}
                    </Stack>
                </Paper>
            )}

            <Stack gap="sm" mb="lg">
                <Button
                    component="a"
                    href={link}
                    onClick={() => onOpenWallet?.()}
                    size="md"
                    leftSection={<IconDeviceMobile size={20} />}
                >
                    Open on this device
                </Button>
                <Button variant="default" size="md" onClick={handleCopy} leftSection={<IconClipboard size={20} />}>
                    {copyText}
                </Button>
            </Stack>

            {copyError && (
                <Text role="alert" size="sm" c="red" mb="sm">
                    {copyError}
                </Text>
            )}

            <Box ta="left" mb="md">
                <Anchor component="button" type="button" size="sm" c="dimmed" onClick={() => setShowLink((v) => !v)}>
                    {showLink || copyError ? 'Hide link' : 'Show link'}
                </Anchor>
                <Collapse expanded={showLink || !!copyError}>
                    <TextInput
                        mt="xs"
                        size="sm"
                        label="Link"
                        readOnly
                        value={link}
                        onFocus={(e) => e.currentTarget.select()}
                    />
                </Collapse>
            </Box>

            <Divider mb="md" />
            <Group justify="center" gap="xs">
                <Text size="sm" c="dimmed">
                    Secured by {PRODUCT_NAME}
                </Text>
                <img src="/brand-logo.svg" alt={PRODUCT_NAME} style={{ height: 15, width: 'auto' }} />
            </Group>
        </Paper>
    );
}
