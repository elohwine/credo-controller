import React from 'react';
import { Box, Text, Group, Badge, useMantineColorScheme, useMantineTheme } from '@mantine/core';

export type CredentialKind = 'identity' | 'payment' | 'org' | 'general';

export interface WalletCard {
    id: string;
    label: string;       // e.g. "Verified Holder", "Invoice INV-D038C612"
    ref?: string;        // e.g. DID last segment, invoice ref
    status: 'valid' | 'expired' | 'pending';
    kind: CredentialKind;
    issueDate?: string;
    meta?: string;       // e.g. "Due today", "Issued 12 Aug 2026"
}

/** Plain-language credential type from raw VC credential type array/string */
export function deriveCardKind(typeLabel: string): CredentialKind {
    const n = String(typeLabel || '').toLowerCase();
    if (/(receipt|invoice|payment|transaction|quote)/.test(n)) return 'payment';
    if (/(id|identity|kyc|membership|passport|national|holder)/.test(n)) return 'identity';
    if (/(employment|staff|org|company|business|worker|payroll)/.test(n)) return 'org';
    return 'general';
}

const KIND_COLORS: Record<CredentialKind, { bg: string; bgDark: string; label: string; accent: string }> = {
    identity: {
        bg: 'linear-gradient(145deg, #0e4a4a 0%, #0c2f3b 100%)',
        bgDark: 'linear-gradient(145deg, #0a3535 0%, #081e27 100%)',
        label: 'Identity',
        accent: '#2dd4bf',
    },
    payment: {
        bg: 'linear-gradient(145deg, #0a3d2d 0%, #0c2f1e 100%)',
        bgDark: 'linear-gradient(145deg, #072b1f 0%, #061814 100%)',
        label: 'Payment',
        accent: '#34d399',
    },
    org: {
        bg: 'linear-gradient(145deg, #3d2a00 0%, #2e1f00 100%)',
        bgDark: 'linear-gradient(145deg, #2a1d00 0%, #1a1100 100%)',
        label: 'Organisation',
        accent: '#fbbf24',
    },
    general: {
        bg: 'linear-gradient(145deg, #1e293b 0%, #0f172a 100%)',
        bgDark: 'linear-gradient(145deg, #0f172a 0%, #070d17 100%)',
        label: 'Document',
        accent: '#94a3b8',
    },
};

const STATUS_BADGE: Record<WalletCard['status'], { color: string; label: string }> = {
    valid: { color: '#fff', label: 'VALID' },
    expired: { color: '#f87171', label: 'EXPIRED' },
    pending: { color: '#fbbf24', label: 'PENDING' },
};

interface CredentialPreviewCardProps {
    card: WalletCard;
    onClick?: () => void;
}

export default function CredentialPreviewCard({ card, onClick }: CredentialPreviewCardProps) {
    const { colorScheme } = useMantineColorScheme();
    const isDark = colorScheme === 'dark';
    const colors = KIND_COLORS[card.kind];
    const statusStyle = STATUS_BADGE[card.status];

    return (
        <Box
            onClick={onClick}
            style={{
                width: 168,
                minHeight: 112,
                flexShrink: 0,
                background: isDark ? colors.bgDark : colors.bg,
                borderRadius: 16,
                padding: '14px 16px',
                cursor: onClick ? 'pointer' : 'default',
                boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                border: `1px solid ${colors.accent}22`,
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                userSelect: 'none',
            }}
            className="credential-preview-card"
        >
            {/* Top row — kind label + status badge */}
            <Group justify="space-between" align="center" mb={8}>
                <Text
                    size="9px"
                    fw={700}
                    tt="uppercase"
                    lts="1.5px"
                    style={{ color: colors.accent }}
                >
                    {colors.label}
                </Text>
                <Box
                    style={{
                        background: 'rgba(255,255,255,0.12)',
                        borderRadius: 6,
                        padding: '2px 7px',
                    }}
                >
                    <Text size="9px" fw={700} style={{ color: statusStyle.color }}>
                        {statusStyle.label}
                    </Text>
                </Box>
            </Group>

            {/* Card name */}
            <Box style={{ flex: 1 }}>
                <Text
                    fw={700}
                    size="sm"
                    lineClamp={2}
                    style={{ color: '#fff', lineHeight: 1.3 }}
                >
                    {card.label}
                </Text>
                {card.ref && (
                    <Text
                        size="xs"
                        mt={3}
                        style={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace', fontSize: 10 }}
                    >
                        {card.ref}
                    </Text>
                )}
            </Box>

            {/* Bottom — meta info */}
            {card.meta && (
                <Text size="10px" mt={6} style={{ color: colors.accent }}>
                    {card.meta}
                </Text>
            )}
        </Box>
    );
}
