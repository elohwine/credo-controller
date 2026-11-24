import React, { useState, useEffect, useContext } from 'react';
import Layout from '@/components/Layout';
import { EnvContext } from '@/pages/_app';
import { Badge, Box, Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import {
    IconBolt,
    IconChartBar,
    IconClock,
    IconCpu,
    IconDatabase,
    IconFileCertificate,
    IconGauge,
    IconServer,
    IconShieldCheck,
    IconWallet,
} from '@tabler/icons-react';
import { StatTile } from '../../../shared/StatTile';

interface HealthCheck {
    status: string;
    checks: {
        database: boolean;
        agent: boolean;
        memory: boolean;
    };
    details: {
        heapUsagePercent: number;
        uptime?: number;
    };
}

interface Metrics {
    system: {
        uptime: number;
        memory: { heapUsed: number; heapTotal: number; rss: number };
    };
    database: {
        totalSize: number;
        tableStats: { name: string; rowCount: number }[];
    };
    business: {
        credentials: { totalIssued: number; last24h: number };
        wallets: { totalRegistered: number };
        tenants: { total: number; active: number };
    };
}

const StatusRow = ({ label, ok, okLabel, badLabel, icon }: { label: string; ok: boolean; okLabel: string; badLabel: string; icon: React.ReactNode }) => (
    <Group justify="space-between" wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
            <Box c="dimmed" style={{ display: 'flex' }}>{icon}</Box>
            <Text size="sm">{label}</Text>
        </Group>
        <Badge variant="light" color={ok ? 'green' : 'red'} tt="none">{ok ? okLabel : badLabel}</Badge>
    </Group>
);

export default function MetricsPage() {
    const [health, setHealth] = useState<HealthCheck | null>(null);
    const [metrics, setMetrics] = useState<Metrics | null>(null);
    const env = useContext(EnvContext);
    const backendUrl = env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';

    useEffect(() => {
        if (!env.NEXT_PUBLIC_BACKEND_URL) return;
        fetchHealth();
        fetchMetrics();
        const interval = setInterval(() => {
            fetchHealth();
            fetchMetrics();
        }, 5000);
        return () => clearInterval(interval);
    }, [env.NEXT_PUBLIC_BACKEND_URL]);

    const fetchHealth = async () => {
        try {
            const res = await fetch(`${backendUrl}/health`);
            const data = await res.json().catch(() => null);
            setHealth(data?.checks && data?.details ? data : null);
        } catch (error) {
            console.warn('Failed to fetch health:', error);
        }
    };

    const fetchMetrics = async () => {
        try {
            const res = await fetch(`${backendUrl}/metrics/json`);
            const data = await res.json().catch(() => null);
            setMetrics(res.ok && data?.system && data?.database && data?.business ? data : null);
        } catch (error) {
            console.warn('Failed to fetch metrics:', error);
        }
    };

    const formatBytes = (bytes?: number) =>
        typeof bytes === 'number' && Number.isFinite(bytes) ? (bytes / 1024 / 1024).toFixed(1) + ' MB' : '—';

    const formatUptime = (seconds: number) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours}h ${minutes}m`;
    };

    return (
        <Layout title="System Metrics">
            <Stack gap="lg" p={{ base: 'sm', sm: 'lg' }}>
                <div>
                    <Title order={2}>System Metrics</Title>
                    <Text size="sm" c="dimmed" mt={4}>
                        Real-time system health and performance monitoring
                    </Text>
                </div>

                {/* Health Status */}
                {health && (
                    <Stack gap="sm">
                        <Group gap="xs">
                            <Box c="dimmed" style={{ display: 'flex' }}><IconShieldCheck size={20} /></Box>
                            <Title order={4}>System Health</Title>
                        </Group>
                        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
                            <Paper withBorder radius="md" p="md">
                                <Stack gap="sm">
                                    <StatusRow label="Overall Status" ok={health.status === 'healthy'} okLabel="Healthy" badLabel={health.status === 'degraded' ? 'Under strain' : 'Issues detected'} icon={<IconServer size={18} />} />
                                    <StatusRow label="Database" ok={health.checks.database} okLabel="Connected" badLabel="Disconnected" icon={<IconDatabase size={18} />} />
                                    <StatusRow label="Agent Status" ok={health.checks.agent} okLabel="Active" badLabel="Down" icon={<IconShieldCheck size={18} />} />
                                </Stack>
                            </Paper>
                            <SimpleGrid cols={{ base: 1, xs: 3 }} spacing="sm">
                                <StatTile
                                    label="Memory Usage"
                                    value={`${health.details.heapUsagePercent}%`}
                                    hint={metrics ? `${formatBytes(metrics.system.memory.heapUsed)} used` : undefined}
                                    icon={IconCpu}
                                    alert={health.details.heapUsagePercent > 90}
                                />
                                <StatTile
                                    label="Database size"
                                    value={metrics ? formatBytes(metrics.database.totalSize) : '—'}
                                    icon={IconGauge}
                                />
                                <StatTile
                                    label="Uptime"
                                    value={formatUptime(metrics?.system.uptime ?? health.details.uptime ?? 0)}
                                    icon={IconClock}
                                />
                            </SimpleGrid>
                        </SimpleGrid>
                    </Stack>
                )}

                {/* System Metrics */}
                {metrics && (
                    <Stack gap="sm">
                        <Title order={4}>Usage</Title>
                        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
                            <StatTile label="People signed up" value={metrics.business?.wallets?.totalRegistered ?? 0} icon={IconWallet} />
                            <StatTile
                                label="Signed records issued"
                                value={metrics.business?.credentials?.totalIssued ?? 0}
                                hint={`${metrics.business?.credentials?.last24h ?? 0} in the last 24 hours`}
                                icon={IconFileCertificate}
                            />
                            <StatTile label="Organisations" value={metrics.business?.tenants?.total ?? 0} icon={IconBolt} />
                        </SimpleGrid>

                        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg" mt="sm">
                            <Paper p="lg" radius="md" withBorder>
                                <Group gap="xs" mb="md">
                                    <Box c="dimmed" style={{ display: 'flex' }}><IconChartBar size={18} /></Box>
                                    <Text fw={500} size="lg">System Resources</Text>
                                </Group>
                                <Stack gap="xs">
                                    <Group justify="space-between">
                                        <Text size="sm" c="dimmed">Heap Used</Text>
                                        <Text size="sm" fw={500}>{formatBytes(metrics.system.memory?.heapUsed)}</Text>
                                    </Group>
                                    <Group justify="space-between">
                                        <Text size="sm" c="dimmed">Heap Total</Text>
                                        <Text size="sm" fw={500}>{formatBytes(metrics.system.memory?.heapTotal)}</Text>
                                    </Group>
                                    <Group justify="space-between">
                                        <Text size="sm" c="dimmed">RSS Memory</Text>
                                        <Text size="sm" fw={500}>{formatBytes(metrics.system.memory?.rss)}</Text>
                                    </Group>
                                    <Group justify="space-between">
                                        <Text size="sm" c="dimmed">Uptime</Text>
                                        <Text size="sm" fw={500}>{formatUptime(metrics.system.uptime)}</Text>
                                    </Group>
                                </Stack>
                            </Paper>

                            <Paper p="lg" radius="md" withBorder>
                                <Group gap="xs" mb="md">
                                    <Box c="dimmed" style={{ display: 'flex' }}><IconDatabase size={18} /></Box>
                                    <Text fw={500} size="lg">Database Metrics</Text>
                                </Group>
                                <Stack gap="xs">
                                    <Group justify="space-between">
                                        <Text size="sm" c="dimmed">Size on disk</Text>
                                        <Text size="sm" fw={500}>{formatBytes(metrics.database.totalSize)}</Text>
                                    </Group>
                                    {(metrics.database.tableStats || []).map((t) => (
                                        <Group key={t.name} justify="space-between">
                                            <Text size="sm" c="dimmed">{t.name.replace(/_/g, ' ')}</Text>
                                            <Text size="sm" fw={500}>{t.rowCount.toLocaleString()} rows</Text>
                                        </Group>
                                    ))}
                                </Stack>
                            </Paper>
                        </SimpleGrid>
                    </Stack>
                )}
            </Stack>
        </Layout>
    );
}
