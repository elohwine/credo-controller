import React, { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import { StatCard } from '@/components/dashboard/StatCard';
import { BRAND } from '@/lib/theme';
import { 
    ChartBarIcon, 
    ServerIcon, 
    CircleStackIcon, 
    CpuChipIcon, 
    ClockIcon, 
    ShieldCheckIcon,
    WalletIcon,
    DocumentCheckIcon,
    BoltIcon
} from '@heroicons/react/24/outline';
import { SimpleGrid, Container, Title, Text, Box, Paper, Group, Stack } from '@mantine/core';

interface HealthCheck {
    status: string;
    checks: {
        database: boolean;
        agent: boolean;
        memory: boolean;
    };
    details: {
        heapUsagePercent: number;
        uptime: number;
    };
}

interface Metrics {
    system: {
        heapUsed: number;
        heapTotal: number;
        rss: number;
        uptime: number;
    };
    database: {
        connectionCount: number;
        poolSize: number;
        queryLatency: number;
    };
    business: {
        activeWallets: number;
        credentialsIssued: number;
        workflowsExecuted: number;
    };
}

export default function MetricsPage() {
    const [health, setHealth] = useState<HealthCheck | null>(null);
    const [metrics, setMetrics] = useState<Metrics | null>(null);

    useEffect(() => {
        fetchHealth();
        fetchMetrics();
        const interval = setInterval(() => {
            fetchHealth();
            fetchMetrics();
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    const fetchHealth = async () => {
        try {
            const res = await fetch('http://localhost:3000/health');
            const data = await res.json();
            setHealth(data);
        } catch (error) {
            console.error('Failed to fetch health:', error);
        }
    };

    const fetchMetrics = async () => {
        try {
            const res = await fetch('http://localhost:3000/metrics/json');
            const data = await res.json();
            setMetrics(data);
        } catch (error) {
            console.error('Failed to fetch metrics:', error);
        }
    };

    const formatBytes = (bytes: number) => {
        return (bytes / 1024 / 1024).toFixed(2) + ' MB';
    };

    const formatUptime = (seconds: number) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours}h ${minutes}m`;
    };

    return (
        <Layout title="System Metrics">
            <div className="px-4 sm:px-6 lg:px-8 py-6">
                <div className="sm:flex sm:items-center sm:justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold" style={{ color: BRAND.dark }}>System Metrics</h1>
                        <p className="mt-2 text-sm" style={{ color: BRAND.curious }}>
                            Real-time system health and performance monitoring
                        </p>
                    </div>
                </div>

                {/* Health Status */}
                {health && (
                    <Box mt="xl">
                        <Title order={3} mb="md" className="text-gray-900 flex items-center">
                            <ShieldCheckIcon className="h-6 w-6 mr-2 text-indigo-600" />
                            System Health
                        </Title>
                        <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="lg">
                            <StatCard
                                title="Overall Status"
                                value={health.status === 'healthy' ? 'Healthy' : 'Issues Detected'}
                                icon={<ServerIcon style={{ width: 24, height: 24 }} />}
                                iconColor={health.status === 'healthy' ? 'green' : 'red'}
                                trend="100%"
                                trendLabel="uptime"
                            />
                            <StatCard
                                title="Database"
                                value={health.checks.database ? 'Connected' : 'Disconnected'}
                                icon={<CircleStackIcon style={{ width: 24, height: 24 }} />}
                                iconColor={health.checks.database ? 'blue' : 'red'}
                                trend={(metrics?.database.queryLatency || 0) + 'ms'}
                                trendLabel="latency"
                            />
                            <StatCard
                                title="Agent Status"
                                value={health.checks.agent ? 'Active' : 'Down'}
                                icon={<ShieldCheckIcon style={{ width: 24, height: 24 }} />}
                                iconColor={health.checks.agent ? 'teal' : 'red'}
                            />
                            <StatCard
                                title="Memory Usage"
                                value={`${health.details.heapUsagePercent}%`}
                                icon={<CpuChipIcon style={{ width: 24, height: 24 }} />}
                                iconColor={health.details.heapUsagePercent > 90 ? 'red' : 'orange'}
                                trend={(metrics?.system.heapUsed ? (metrics.system.heapUsed / 1024 / 1024).toFixed(0) : 0) + ' MB'}
                                trendLabel="used"
                            />
                        </SimpleGrid>
                    </Box>
                )}

                {/* System Metrics */}
                {metrics && (
                   <Box mt="xl">
                        <Title order={3} size="h4" mb="md">Business Metrics</Title>
                        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="lg" mb="xl">
                            <StatCard 
                                title="Active Wallets" 
                                value={(metrics.business?.activeWallets ?? 0).toString()} 
                                icon={<WalletIcon style={{ width: 24, height: 24 }} />} 
                                iconColor="blue"
                                trend="+12%" 
                                trendLabel="vs last month"
                                trendType="positive"
                            />
                            <StatCard 
                                title="Credentials Issued" 
                                value={(metrics.business?.credentialsIssued ?? 0).toString()} 
                                icon={<DocumentCheckIcon style={{ width: 24, height: 24 }} />} 
                                iconColor="green"
                                trend="+5%" 
                                trendLabel="this week"
                                trendType="positive"
                            />
                            <StatCard 
                                title="Workflows Executed" 
                                value={(metrics.business?.workflowsExecuted ?? 0).toString()} 
                                icon={<BoltIcon style={{ width: 24, height: 24 }} />} 
                                iconColor="orange"
                                trend="+2" 
                                trendLabel="today"
                                trendType="positive"
                            />
                        </SimpleGrid>

                        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
                             <Paper shadow="sm" p="lg" radius="md" withBorder>
                                <Group mb="md">
                                    <ChartBarIcon className="h-5 w-5 text-indigo-600" />
                                    <Text fw={500} size="lg">System Resources</Text>
                                </Group>
                                <Stack gap="xs">
                                    <Group justify="space-between">
                                        <Text size="sm" c="dimmed">Heap Used</Text>
                                        <Text size="sm" fw={500}>{formatBytes(metrics.system.heapUsed)}</Text>
                                    </Group>
                                    <Group justify="space-between">
                                        <Text size="sm" c="dimmed">Heap Total</Text>
                                        <Text size="sm" fw={500}>{formatBytes(metrics.system.heapTotal)}</Text>
                                    </Group>
                                    <Group justify="space-between">
                                        <Text size="sm" c="dimmed">RSS Memory</Text>
                                        <Text size="sm" fw={500}>{formatBytes(metrics.system.rss)}</Text>
                                    </Group>
                                    <Group justify="space-between">
                                        <Text size="sm" c="dimmed">Uptime</Text>
                                        <Text size="sm" fw={500}>{formatUptime(metrics.system.uptime)}</Text>
                                    </Group>
                                </Stack>
                            </Paper>

                            <Paper shadow="sm" p="lg" radius="md" withBorder>
                                <Group mb="md">
                                    <CircleStackIcon className="h-5 w-5 text-indigo-600" />
                                    <Text fw={500} size="lg">Database Metrics</Text>
                                </Group>
                                <Stack gap="xs">
                                    <Group justify="space-between">
                                        <Text size="sm" c="dimmed">Connections</Text>
                                        <Text size="sm" fw={500}>{metrics.database.connectionCount}</Text>
                                    </Group>
                                    <Group justify="space-between">
                                        <Text size="sm" c="dimmed">Pool Size</Text>
                                        <Text size="sm" fw={500}>{metrics.database.poolSize}</Text>
                                    </Group>
                                    <Group justify="space-between">
                                        <Text size="sm" c="dimmed">Query Latency</Text>
                                        <Text size="sm" fw={500}>{metrics.database.queryLatency}ms</Text>
                                    </Group>
                                </Stack>
                            </Paper>
                        </SimpleGrid>
                    </Box>
                )}
            </div>
        </Layout>
    );
}
