import React, { useState } from 'react';
import {
    Box, Stack, Text, Group, ThemeIcon, UnstyledButton,
    useMantineColorScheme, useMantineTheme, Badge, Grid, Card,
    Divider,
} from '@mantine/core';
import {
    IconScan, IconPlus, IconCurrencyDollar, IconArrowUpRight,
    IconQrcode, IconRotate, IconBuildingBank, IconInbox,
    IconUsers, IconSearch, IconSettings, IconActivity, IconShieldCheck,
} from '@tabler/icons-react';
import { useRouter } from 'next/router';
import { isEmployeeOrgRole, getActiveOrgId, getUserRole } from '@/lib/auth';
import QRCode from 'react-qr-code';

interface ActionCenterProps {
    contextMode: 'personal' | 'org';
    inboxCount: number;
    pendingOfferCount: number;
    proofCount: number;
    assignedFieldTaskCount?: number;
    orgLabel?: string | null;
    activeWorkflowTypes?: string[];
    userName?: string | null;
    userAccountId?: string | null;      // Internal account / tenant ID for QR
    expiringCount?: number;
}

/* ─── Zone 1 helpers ──────────────────────────────────────────────── */

function truncateId(id: string | null | undefined, maxLen = 16): string {
    if (!id) return '';
    const clean = id.replace(/^did:[^:]+:/i, ''); // strip "did:psr:" prefix silently
    if (clean.length <= maxLen) return clean;
    return `${clean.slice(0, 6)}…${clean.slice(-6)}`;
}

function getInitial(name: string | null | undefined): string {
    return (name || 'U').charAt(0).toUpperCase();
}

/* ─── Zone 1 — Identity Card ──────────────────────────────────────── */

function IdentityCard({
    userName,
    userAccountId,
    proofCount,
    expiringCount = 0,
    isDark,
}: {
    userName?: string | null;
    userAccountId?: string | null;
    proofCount: number;
    expiringCount?: number;
    isDark: boolean;
}) {
    const [flipped, setFlipped] = useState(false);
    const displayName = userName || 'My Account';
    const shortId = truncateId(userAccountId);
    const qrValue = userAccountId || displayName;

    return (
        <Box
            style={{ perspective: '1000px', width: '100%', height: 160 }}
            onClick={() => setFlipped((f) => !f)}
        >
            <Box
                style={{
                    position: 'relative',
                    width: '100%',
                    height: '100%',
                    transformStyle: 'preserve-3d',
                    transition: 'transform 0.55s cubic-bezier(0.4, 0, 0.2, 1)',
                    transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                    cursor: 'pointer',
                    borderRadius: 20,
                }}
            >
                {/* ── Front face ── */}
                <Box
                    style={{
                        position: 'absolute',
                        inset: 0,
                        backfaceVisibility: 'hidden',
                        WebkitBackfaceVisibility: 'hidden',
                        background: isDark
                            ? 'linear-gradient(135deg, #0d3535 0%, #0a2433 100%)'
                            : 'linear-gradient(135deg, #0f4a4a 0%, #0c2f3b 100%)',
                        borderRadius: 20,
                        padding: '18px 20px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                        border: '1px solid rgba(45, 212, 191, 0.18)',
                    }}
                >
                    {/* Top row */}
                    <Group justify="space-between" align="flex-start">
                        {/* Avatar */}
                        <Box
                            style={{
                                width: 48,
                                height: 48,
                                borderRadius: '50%',
                                background: 'linear-gradient(135deg, #2dd4bf 0%, #0891b2 100%)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 20,
                                fontWeight: 700,
                                color: '#fff',
                                flexShrink: 0,
                            }}
                        >
                            {getInitial(userName)}
                        </Box>

                        {/* Verified badge */}
                        <Box
                            style={{
                                background: 'rgba(45, 212, 191, 0.15)',
                                border: '1px solid rgba(45, 212, 191, 0.35)',
                                borderRadius: 20,
                                padding: '4px 10px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                            }}
                        >
                            <Box
                                style={{
                                    width: 7,
                                    height: 7,
                                    borderRadius: '50%',
                                    background: '#2dd4bf',
                                    flexShrink: 0,
                                }}
                            />
                            <Text size="xs" fw={600} style={{ color: '#2dd4bf' }}>
                                Verified
                            </Text>
                        </Box>
                    </Group>

                    {/* Bottom — name + id + summary */}
                    <Box>
                        <Text fw={800} size="lg" style={{ color: '#fff', lineHeight: 1.2 }}>
                            {displayName}
                        </Text>
                        {shortId && (
                            <Text
                                size="10px"
                                mt={2}
                                mb={8}
                                style={{ color: 'rgba(255,255,255,0.45)', fontFamily: 'monospace' }}
                            >
                                {shortId}
                            </Text>
                        )}
                        <Group gap={4} align="center">
                            <Text size="xs" style={{ color: 'rgba(255,255,255,0.6)' }}>
                                {proofCount > 0
                                    ? `${proofCount} saved document${proofCount !== 1 ? 's' : ''}`
                                    : 'No documents yet'}
                                {expiringCount > 0 ? ` · ${expiringCount} expiring soon` : ''}
                            </Text>
                            <Text
                                size="10px"
                                ml="auto"
                                style={{ color: 'rgba(255,255,255,0.3)', cursor: 'pointer' }}
                            >
                                tap to show QR ↺
                            </Text>
                        </Group>
                    </Box>
                </Box>

                {/* ── Back face (QR) ── */}
                <Box
                    style={{
                        position: 'absolute',
                        inset: 0,
                        backfaceVisibility: 'hidden',
                        WebkitBackfaceVisibility: 'hidden',
                        transform: 'rotateY(180deg)',
                        background: '#fff',
                        borderRadius: 20,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 10,
                        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                    }}
                >
                    <QRCode value={qrValue} size={110} fgColor="#0c2f3b" bgColor="#fff" />
                    <Text size="xs" c="dimmed" ta="center">
                        Show this to share your account
                    </Text>
                </Box>
            </Box>
        </Box>
    );
}

/* ─── Zone 1 — Organisation Card ──────────────────────────────────── */

function OrganisationCard({
    orgLabel,
    inboxCount,
    isDark,
}: {
    orgLabel?: string | null;
    inboxCount: number;
    isDark: boolean;
}) {
    const [flipped, setFlipped] = useState(false);
    const orgId = getActiveOrgId();
    const role = getUserRole();
    const displayName = orgLabel || 'My Organisation';
    const shortId = truncateId(orgId);
    const qrValue = orgId || displayName;

    return (
        <Box
            style={{ perspective: '1000px', width: '100%', height: 160 }}
            onClick={() => setFlipped((f) => !f)}
        >
            <Box
                style={{
                    position: 'relative',
                    width: '100%',
                    height: '100%',
                    transformStyle: 'preserve-3d',
                    transition: 'transform 0.55s cubic-bezier(0.4, 0, 0.2, 1)',
                    transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                    cursor: 'pointer',
                    borderRadius: 20,
                }}
            >
                {/* ── Front face ── */}
                <Box
                    style={{
                        position: 'absolute',
                        inset: 0,
                        backfaceVisibility: 'hidden',
                        WebkitBackfaceVisibility: 'hidden',
                        background: isDark
                            ? 'linear-gradient(135deg, #3d2a00 0%, #1a1100 100%)'
                            : 'linear-gradient(135deg, #5c3f00 0%, #2f2000 100%)',
                        borderRadius: 20,
                        padding: '18px 20px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                        border: '1px solid rgba(251, 191, 36, 0.25)',
                    }}
                >
                    {/* Top row */}
                    <Group justify="space-between" align="flex-start">
                        {/* Avatar */}
                        <Box
                            style={{
                                width: 48,
                                height: 48,
                                borderRadius: '50%',
                                background: 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 20,
                                fontWeight: 700,
                                color: '#fff',
                                flexShrink: 0,
                            }}
                        >
                            {getInitial(displayName)}
                        </Box>

                        {/* Role badge */}
                        <Box
                            style={{
                                background: 'rgba(251, 191, 36, 0.15)',
                                border: '1px solid rgba(251, 191, 36, 0.35)',
                                borderRadius: 20,
                                padding: '4px 10px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                            }}
                        >
                            <Box
                                style={{
                                    width: 7,
                                    height: 7,
                                    borderRadius: '50%',
                                    background: '#fbbf24',
                                    flexShrink: 0,
                                }}
                            />
                            <Text size="xs" fw={600} style={{ color: '#fbbf24', textTransform: 'capitalize' }}>
                                {role || 'Member'}
                            </Text>
                        </Box>
                    </Group>

                    {/* Bottom — name + id + summary */}
                    <Box>
                        <Text fw={800} size="lg" style={{ color: '#fff', lineHeight: 1.2 }}>
                            {displayName}
                        </Text>
                        {shortId && (
                            <Text
                                size="10px"
                                mt={2}
                                mb={8}
                                style={{ color: 'rgba(255,255,255,0.45)', fontFamily: 'monospace' }}
                            >
                                {shortId}
                            </Text>
                        )}
                        <Group gap={4} align="center">
                            <Text size="xs" style={{ color: 'rgba(255,255,255,0.6)' }}>
                                {inboxCount > 0
                                    ? `${inboxCount} pending task${inboxCount !== 1 ? 's' : ''}`
                                    : 'All clear'}
                            </Text>
                            <Text
                                size="10px"
                                ml="auto"
                                style={{ color: 'rgba(255,255,255,0.3)', cursor: 'pointer' }}
                            >
                                tap to show QR ↺
                            </Text>
                        </Group>
                    </Box>
                </Box>

                {/* ── Back face (QR) ── */}
                <Box
                    style={{
                        position: 'absolute',
                        inset: 0,
                        backfaceVisibility: 'hidden',
                        WebkitBackfaceVisibility: 'hidden',
                        transform: 'rotateY(180deg)',
                        background: '#fff',
                        borderRadius: 20,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 10,
                        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                    }}
                >
                    <QRCode value={qrValue} size={110} fgColor="#2f2000" bgColor="#fff" />
                    <Text size="xs" c="dimmed" ta="center">
                        Show to pair this Organisation
                    </Text>
                </Box>
            </Box>
        </Box>
    );
}

/* ─── Zone 2 — Quick Actions Row ─────────────────────────────────── */

interface QuickAction {
    icon: React.ReactNode;
    label: string;
    color: string;
    bg: string;
    route: string;
}

function QuickActions({ router }: { router: ReturnType<typeof useRouter> }) {
    const actions: QuickAction[] = [
        {
            icon: <IconScan size={24} stroke={2} color="#fff" />,
            label: 'Scan',
            color: '#2188ca',
            bg: 'linear-gradient(135deg, #2188ca 0%, #155782 100%)',
            route: '/scan',
        },
        {
            icon: <IconPlus size={24} stroke={2.5} color="#fff" />,
            label: 'Receive',
            color: '#059669',
            bg: 'linear-gradient(135deg, #059669 0%, #064e3b 100%)',
            route: '/inbox',
        },
        {
            icon: <IconCurrencyDollar size={24} stroke={2} color="#fff" />,
            label: 'Pay',
            color: '#d97706',
            bg: 'linear-gradient(135deg, #d97706 0%, #92400e 100%)',
            route: '/inbox?filter=payment',
        },
        {
            icon: <IconArrowUpRight size={24} stroke={2} color="#fff" />,
            label: 'Share',
            color: '#0d9488',
            bg: 'linear-gradient(135deg, #0d9488 0%, #0f4a4a 100%)',
            route: '/present',
        },
    ];

    return (
        <Group justify="space-between" gap={0}>
            {actions.map((action) => (
                <UnstyledButton
                    key={action.label}
                    onClick={() => router.push(action.route)}
                    style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
                >
                    <Box
                        style={{
                            width: 58,
                            height: 58,
                            borderRadius: 16,
                            background: action.bg,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: `0 4px 14px ${action.color}44`,
                            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                        }}
                    >
                        {action.icon}
                    </Box>
                    <Text size="11px" fw={500} c="dimmed">
                        {action.label}
                    </Text>
                </UnstyledButton>
            ))}
        </Group>
    );
}

/* ─── Main export ─────────────────────────────────────────────────── */

export default function ActionCenter({
    contextMode,
    inboxCount,
    pendingOfferCount,
    proofCount,
    assignedFieldTaskCount = 0,
    orgLabel,
    activeWorkflowTypes = [],
    userName,
    userAccountId,
    expiringCount = 0,
}: ActionCenterProps) {
    const theme = useMantineTheme();
    const { colorScheme } = useMantineColorScheme();
    const isDark = colorScheme === 'dark';
    const router = useRouter();

    const isOrg = contextMode === 'org';
    const isEmployee = isOrg && isEmployeeOrgRole();
    const hasFieldExecution = activeWorkflowTypes.some((workflowType) => {
        const normalizedType = String(workflowType || '').toLowerCase();
        return normalizedType.includes('field') || normalizedType.includes('fept');
    });
    const canUseFeptUi = isEmployee && hasFieldExecution;

    const glassStyle = {
        background: isDark ? 'rgba(26, 27, 30, 0.65)' : 'rgba(255, 255, 255, 0.7)',
        backdropFilter: 'blur(10px) saturate(180%)',
        border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
        borderRadius: theme.radius.lg,
        transition: 'transform 150ms ease, box-shadow 150ms ease',
    };

    return (
        <Box>
            <Stack gap="md">
                {/* ── Zone 1: Identity Card (personal) / Org Hero (org) ── */}
                {!isOrg ? (
                    <IdentityCard
                        userName={userName}
                        userAccountId={userAccountId}
                        proofCount={proofCount}
                        expiringCount={expiringCount}
                        isDark={isDark}
                    />
                ) : (
                    <OrganisationCard
                        orgLabel={orgLabel}
                        inboxCount={inboxCount}
                        isDark={isDark}
                    />
                )}

                {/* ── Zone 2: Quick Actions (4 buttons) ── */}
                <QuickActions router={router} />

                {/* ── Org-only operational tiles ─────────────────────── */}
                {isOrg && (
                    <>
                        <Divider
                            label={
                                <Group gap={4}>
                                    <IconShieldCheck size={14} color={theme.colors.teal[6]} />
                                    <Text size="xs" fw={700} c="teal">
                                        Operations
                                    </Text>
                                </Group>
                            }
                            labelPosition="center"
                        />

                        <Grid gutter="md">
                            {canUseFeptUi && (
                                <Grid.Col span={6}>
                                    <UnstyledButton onClick={() => router.push('/intake')} style={{ width: '100%', height: '100%' }}>
                                        <Card
                                            p="md"
                                            radius="lg"
                                            withBorder
                                            h="100%"
                                            style={{
                                                ...glassStyle,
                                                background: isDark ? 'rgba(20, 184, 166, 0.12)' : 'rgba(20, 184, 166, 0.05)',
                                                borderColor: isDark ? 'rgba(45, 212, 191, 0.22)' : 'rgba(45, 212, 191, 0.15)',
                                                boxShadow: '0 4px 12px rgba(45, 212, 191, 0.08)',
                                            }}
                                        >
                                            <Stack gap="xs" h="100%" justify="space-between">
                                                <Group justify="space-between" align="flex-start">
                                                    <ThemeIcon size={40} radius="md" variant="light" color="teal">
                                                        <IconInbox size={24} />
                                                    </ThemeIcon>
                                                    <Badge color="red" size="xs" variant="filled">
                                                        NEW
                                                    </Badge>
                                                </Group>
                                                <Box>
                                                    <Text fw={700} size="sm">Job Intake</Text>
                                                    <Text size="xs" c="dimmed" mt={2}>Review incoming jobs</Text>
                                                </Box>
                                            </Stack>
                                        </Card>
                                    </UnstyledButton>
                                </Grid.Col>
                            )}

                            {canUseFeptUi && assignedFieldTaskCount > 0 && (
                                <Grid.Col span={6}>
                                    <UnstyledButton onClick={() => router.push('/finance?tab=field')} style={{ width: '100%', height: '100%' }}>
                                        <Card
                                            p="md"
                                            radius="lg"
                                            withBorder
                                            h="100%"
                                            style={{
                                                ...glassStyle,
                                                background: isDark ? 'rgba(59, 130, 246, 0.12)' : 'rgba(59, 130, 246, 0.05)',
                                                borderColor: isDark ? 'rgba(59, 130, 246, 0.22)' : 'rgba(59, 130, 246, 0.15)',
                                                boxShadow: '0 4px 12px rgba(59, 130, 246, 0.08)',
                                            }}
                                        >
                                            <Stack gap="xs" h="100%" justify="space-between">
                                                <Group justify="space-between" align="flex-start">
                                                    <ThemeIcon size={40} radius="md" variant="light" color="blue">
                                                        <IconActivity size={24} />
                                                    </ThemeIcon>
                                                    <Badge color="blue" size="xs" variant="filled">
                                                        {assignedFieldTaskCount}
                                                    </Badge>
                                                </Group>
                                                <Box>
                                                    <Text fw={700} size="sm">My Field Jobs</Text>
                                                    <Text size="xs" c="dimmed" mt={2}>Assigned tasks</Text>
                                                </Box>
                                            </Stack>
                                        </Card>
                                    </UnstyledButton>
                                </Grid.Col>
                            )}

                            <Grid.Col span={canUseFeptUi ? 6 : 12}>
                                <UnstyledButton onClick={() => router.push('/organizations?activeTab=discover')} style={{ width: '100%', height: '100%' }}>
                                    <Card
                                        p="md"
                                        radius="lg"
                                        withBorder
                                        h="100%"
                                        style={{
                                            ...glassStyle,
                                            background: isDark ? 'rgba(99, 102, 241, 0.12)' : 'rgba(99, 102, 241, 0.05)',
                                            borderColor: isDark ? 'rgba(99, 102, 241, 0.22)' : 'rgba(99, 102, 241, 0.15)',
                                            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.08)',
                                        }}
                                    >
                                        <Stack gap="xs" h="100%" justify="space-between">
                                            <ThemeIcon size={40} radius="md" variant="light" color="indigo">
                                                <IconSearch size={24} />
                                            </ThemeIcon>
                                            <Box>
                                                <Text fw={700} size="sm">Find Services</Text>
                                                <Text size="xs" c="dimmed" mt={2}>Discover &amp; connect</Text>
                                            </Box>
                                        </Stack>
                                    </Card>
                                </UnstyledButton>
                            </Grid.Col>

                            <Grid.Col span={12}>
                                <UnstyledButton onClick={() => router.push('/settings/org')} style={{ width: '100%' }}>
                                    <Card
                                        p="md"
                                        radius="lg"
                                        withBorder
                                        style={{
                                            ...glassStyle,
                                            background: isDark ? 'rgba(168, 85, 247, 0.12)' : 'rgba(168, 85, 247, 0.05)',
                                            borderColor: isDark ? 'rgba(168, 85, 247, 0.22)' : 'rgba(168, 85, 247, 0.15)',
                                            boxShadow: '0 4px 12px rgba(168, 85, 247, 0.08)',
                                        }}
                                    >
                                        <Group justify="space-between" align="flex-start" wrap="nowrap">
                                            <Box style={{ minWidth: 0, flex: 1 }}>
                                                <Text fw={700} size="sm">Workflow Centre</Text>
                                                <Text size="xs" c="dimmed" mt={2}>
                                                    Configure and manage org workflows in one place.
                                                </Text>
                                            </Box>
                                            <ThemeIcon size={40} radius="md" variant="light" color="grape">
                                                <IconSettings size={24} />
                                            </ThemeIcon>
                                        </Group>
                                    </Card>
                                </UnstyledButton>
                            </Grid.Col>
                        </Grid>
                    </>
                )}
            </Stack>
        </Box>
    );
}
