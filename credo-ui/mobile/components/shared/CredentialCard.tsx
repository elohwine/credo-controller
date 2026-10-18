import React from 'react';
import { Paper, Group, Text, Box, ActionIcon, ThemeIcon, Stack } from '@mantine/core';
import { IconShieldCheck, IconChevronRight, IconCalendar } from '@tabler/icons-react';
import dayjs from 'dayjs';
import StatusBadge from './StatusBadge';
import { formatCredentialType, formatIssuerName } from '@/lib/format';
import { formatTxnTime } from '@/lib/inboxAttention';

export interface CredentialCardProps {
    id: string;
    type: string;
    issuer: string;
    issuedAt: string;
    expiresAt?: string;
    claims?: Record<string, any>;
    status?: 'valid' | 'archived' | 'expired' | 'withdrawn' | 'replaced';
    /** Title shown instead of the type name (for example "Job card · FR-12"). */
    title?: string;
    onClick?: () => void;
}

export default function CredentialCard({
    type,
    issuer,
    issuedAt,
    expiresAt,
    claims = {},
    status = 'valid',
    title,
    onClick
}: CredentialCardProps) {
    const label = title || formatCredentialType(type);
    const issuerName = formatIssuerName(issuer);
    const expired = expiresAt ? dayjs(expiresAt).isBefore(dayjs()) : false;
    const displayStatus = status === 'withdrawn' || status === 'replaced' || status === 'archived'
        ? status
        : expired ? 'expired' : status;

    // A card that is no longer live gets its own colour, whatever its type, so it cannot be
    // mistaken for one that still works. Grey is expired, amber is replaced, red is withdrawn.
    const getGradient = () => {
        if (displayStatus === 'expired' || displayStatus === 'archived') {
            return 'linear-gradient(135deg, #495057 0%, #868e96 100%)';
        }
        if (displayStatus === 'replaced') {
            return 'linear-gradient(135deg, #8a5a12 0%, #c48a2a 100%)';
        }
        if (displayStatus === 'withdrawn') {
            return 'linear-gradient(135deg, #7f1d1d 0%, #c92a2a 100%)';
        }
        const t = type.toLowerCase();
        if (t.includes('id') || t.includes('identity') || t.includes('passport')) {
            return 'linear-gradient(135deg, #0a3d62 0%, #1565a0 100%)';
        }
        if (t.includes('receipt') || t.includes('payment') || t.includes('invoice')) {
            return 'linear-gradient(135deg, #0e5c3d 0%, #128f5b 100%)';
        }
        if (t.includes('employee') || t.includes('employment') || t.includes('staff') || t.includes('job')) {
            return 'linear-gradient(135deg, #5f3dc4 0%, #862e9c 100%)';
        }
        return 'linear-gradient(135deg, #343a40 0%, #495057 100%)';
    };

    return (
        <Paper
            p="lg"
            radius="xl"
            onClick={onClick}
            style={{
                cursor: onClick ? 'pointer' : 'default',
                minHeight: 140,
                position: 'relative',
                overflow: 'hidden',
                color: '#ffffff',
                background: getGradient(),
                boxShadow: '0 12px 28px rgba(0,0,0,0.12)',
                border: '1px solid rgba(255,255,255,0.2)',
            }}
        >
            {/* Background Glass Ornament */}
            <Box style={{
                position: 'absolute',
                top: '-10%',
                right: '-5%',
                width: '40%',
                height: '60%',
                background: 'rgba(255,255,255,0.1)',
                borderRadius: '50%',
                filter: 'blur(30px)',
                zIndex: 1
            }} />

            <Stack gap="md" style={{ position: 'relative', zIndex: 2 }}>
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <Box style={{ flex: 1 }}>
                        <Text fw={800} size="xl" lh={1.1} c="#ffffff" style={{ letterSpacing: '-0.02em' }}>
                            {label}
                        </Text>
                        <Text size="xs" fw={500} c="rgba(255,255,255,0.8)" mt={2}>
                            Issued by {issuerName}
                        </Text>
                    </Box>
                    <ThemeIcon size={32} radius="lg" variant="white" color="white" style={{ background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(4px)' }}>
                        <IconShieldCheck size={18} color="#ffffff" stroke={2.5} />
                    </ThemeIcon>
                </Group>

                <Group justify="space-between" align="flex-end" mt="auto">
                    <Box>
                        <Group gap={4} align="center">
                            <IconCalendar size={12} color="rgba(255,255,255,0.7)" />
                            <Text size="10px" fw={600} c="rgba(255,255,255,0.7)" tt="uppercase" style={{ letterSpacing: '0.05em' }}>
                                Issued On
                            </Text>
                        </Group>
                        <Text size="sm" fw={700} c="#ffffff">
                            {formatTxnTime(issuedAt)}
                        </Text>
                    </Box>

                    <Box style={{ textAlign: 'right' }}>
                        <StatusBadge status={displayStatus} onColor />
                    </Box>
                </Group>
            </Stack>

            {onClick && (
                <Group gap={0} justify="center" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>
                    <IconChevronRight size={20} />
                </Group>
            )}
        </Paper>
    );
}
