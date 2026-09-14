import React from 'react';
import { Box, Card, Group, Stack, Text, ThemeIcon, Title, Badge, useMantineColorScheme, useMantineTheme } from '@mantine/core';
import {
    IconCreditCard, IconShieldCheck, IconReceipt, IconClipboardText, IconActivity, IconChevronRight, IconLock
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

export interface AuditEntry {
    id: string;
    ref: string;
    title: string;
    summary: string;
    context: 'organization' | 'personal' | 'guest' | 'service';
    occurredAt: string;
    flowType: 'PAYMENT' | 'WORKFLOW' | 'FIELD_EXECUTION' | 'CREDENTIAL' | 'SYSTEM';
    actionHash?: string;
}

interface AuditTrailFeedProps {
    entries: AuditEntry[];
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
    'payment.received': <IconCreditCard size={18} />,
    'payment.settled': <IconCreditCard size={18} />,
    'credential.issued': <IconId size={18} />,
    'credential.verified': <IconShieldCheck size={18} />,
    'receipt.issued': <IconReceipt size={18} />,
    'workflow.approved': <IconClipboardText size={18} />,
    'default': <IconActivity size={18} />
};

const ACTION_COLORS: Record<string, string> = {
    'payment.received': 'teal',
    'credential.issued': 'indigo',
    'credential.verified': 'blue',
    'workflow.approved': 'green',
    'default': 'gray'
};

function IconId({ size }: { size: number }) {
    return <IconShieldCheck size={size} />; // Fallback or import correct one
}

export default function AuditTrailFeed({ entries }: AuditTrailFeedProps) {
    const theme = useMantineTheme();
    const { colorScheme } = useMantineColorScheme();
    const isDark = colorScheme === 'dark';

    const glassStyle = {
        background: isDark ? 'rgba(26, 27, 30, 0.4)' : 'rgba(255, 255, 255, 0.4)',
        backdropFilter: 'blur(8px)',
        border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
        borderRadius: theme.radius.md,
    };

    if (entries.length === 0) {
        return (
            <Card p="md" radius="lg" style={glassStyle} withBorder>
                <Text size="sm" c="dimmed" ta="center">No recent activity found.</Text>
            </Card>
        );
    }

    return (
        <Stack gap="xs">
            <Group justify="space-between" px="xs">
                <Text size="xs" fw={700} tt="uppercase" c="dimmed" lts="1px">
                    Proof of Action Trail
                </Text>
                <Badge size="xs" variant="dot" color="teal">Live</Badge>
            </Group>

            {entries.map((entry) => {
                const color = entry.flowType === 'PAYMENT' ? 'teal' :
                    entry.flowType === 'CREDENTIAL' ? 'indigo' :
                        entry.flowType === 'WORKFLOW' ? 'blue' : 'gray';

                return (
                    <Card key={entry.id} p="sm" radius="md" style={glassStyle} withBorder shadow="xs">
                        <Group gap="sm" wrap="nowrap" align="flex-start">
                            <ThemeIcon size={32} radius="md" variant="light" color={color}>
                                {entry.flowType === 'PAYMENT' ? <IconCreditCard size={18} /> :
                                    entry.flowType === 'CREDENTIAL' ? <IconShieldCheck size={18} /> :
                                        entry.flowType === 'WORKFLOW' ? <IconClipboardText size={18} /> : <IconActivity size={18} />}
                            </ThemeIcon>

                            <Box style={{ flex: 1, minWidth: 0 }}>
                                <Group justify="space-between" wrap="nowrap" mb={2}>
                                    <Text size="sm" fw={700} truncate>
                                        {entry.title}
                                    </Text>
                                    <Text size="xs" c="dimmed">
                                        {entry.occurredAt}
                                    </Text>
                                </Group>

                                <Text size="xs" c="dimmed" lineClamp={1}>
                                    {entry.summary}
                                </Text>

                                {entry.actionHash && (
                                    <Group gap={4} mt={6}>
                                        <IconLock size={10} color={theme.colors.teal[6]} />
                                        <Text size="10px" ff="monospace" c="teal.6" fw={700}>
                                            PROOF: {entry.actionHash.substring(0, 12)}...
                                        </Text>
                                    </Group>
                                )}
                            </Box>

                            <IconChevronRight size={14} color={isDark ? theme.colors.dark[4] : theme.colors.gray[4]} style={{ marginTop: 4 }} />
                        </Group>
                    </Card>
                );
            })}
        </Stack>
    );
}
