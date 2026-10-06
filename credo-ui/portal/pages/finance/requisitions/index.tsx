import { useState, useEffect, useContext, useCallback } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../../components/Layout';
import axios from 'axios';
import { EnvContext } from '@/pages/_app';
import { getPreferredTenantToken } from '@/utils/portalTenant';
import { getOrgScopedToken } from '@/utils/organizationContext';
import { requisitionStatusColor, requisitionStatusLabel } from '@/components/finance/financeStages';
import {
    Container, Title, Text, Paper, Group, Stack, Button,
    Loader, Center, SimpleGrid, ThemeIcon
} from '@mantine/core';
import { IconPlus, IconReceipt, IconRefresh } from '@tabler/icons-react';
import { FinanceListCard } from '@/components/finance/FinanceListCard';

import { useRequireOrgContext } from '@/lib/portalContext';

const fmt = (n: number, c = 'USD') =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(n);

export default function RequisitionsDashboard() {
  // Org-only surface: personal sessions are redirected (mirrors mobile /finance → /inbox).
  useRequireOrgContext('/inbox');

    const env = useContext(EnvContext);
    const router = useRouter();
    const baseUrl = env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';

    const [requisitions, setRequisitions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const getToken = () =>
        typeof window !== 'undefined'
            ? getOrgScopedToken() || getPreferredTenantToken() || localStorage.getItem('walletToken')
            : null;

    const auth = () => ({ headers: { Authorization: `Bearer ${getToken()}` } });

    const fetchRequisitions = useCallback(async () => {
        const token = getToken();
        if (!token) return;
        setLoading(true);
        try {
            const { data } = await axios.get(`${baseUrl}/api/finance/requisitions`, auth());
            setRequisitions(data || []);
        } catch {
            /* fallback */
        } finally {
            setLoading(false);
        }
    }, [baseUrl]);

    useEffect(() => { fetchRequisitions(); }, [fetchRequisitions]);

    return (
        <Layout title="Requisitions">
            <Container size="xl" py="md">
                <Group justify="space-between" mb="lg">
                    <Group gap="sm">
                        <ThemeIcon size={40} radius="md" variant="light" color="indigo">
                            <IconReceipt size={22} />
                        </ThemeIcon>
                        <div>
                            <Title order={3}>Requisitions</Title>
                            <Text size="sm" c="dimmed">Internal purchase and spending requests: approve, release money and confirm delivery.</Text>
                        </div>
                    </Group>
                    <Group>
                        <Button variant="light" leftSection={<IconRefresh size={16} />} onClick={fetchRequisitions} loading={loading}>
                            Refresh
                        </Button>
                        <Button leftSection={<IconPlus size={16} />} onClick={() => router.push('/finance/requisitions/new')}>
                            New requisition
                        </Button>
                    </Group>
                </Group>

                <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md" mb="lg">
                    <Paper p="md" radius="md" withBorder>
                        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Total</Text>
                        <Title order={2}>{requisitions.length}</Title>
                    </Paper>
                    <Paper p="md" radius="md" withBorder>
                        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Waiting for approval</Text>
                        <Title order={2} c="blue">{requisitions.filter(r => r.status === 'REQUISITION_CREATED' || r.status === 'MANAGER_APPROVED').length}</Title>
                    </Paper>
                    <Paper p="md" radius="md" withBorder>
                        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Approved or money released</Text>
                        <Title order={2} c="yellow">{requisitions.filter(r => ['APPROVED', 'RELEASED', 'PAID'].includes(r.status)).length}</Title>
                    </Paper>
                    <Paper p="md" radius="md" withBorder>
                        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Delivered or closed</Text>
                        <Title order={2} c="green">{requisitions.filter(r => ['RECONCILED', 'ACKNOWLEDGED', 'EXECUTION_ACKNOWLEDGED'].includes(r.status)).length}</Title>
                    </Paper>
                </SimpleGrid>

                {loading ? (
                    <Center py="xl"><Loader /></Center>
                ) : requisitions.length === 0 ? (
                    <Paper p="xl" radius="md" withBorder>
                        <Center>
                            <Stack align="center" gap="xs">
                                <ThemeIcon size={48} color="gray" variant="light" radius="xl">
                                    <IconReceipt size={24} />
                                </ThemeIcon>
                                <Text c="dimmed">No requisitions yet.</Text>
                            </Stack>
                        </Center>
                    </Paper>
                ) : (
                    <Stack gap="sm">
                        {requisitions.map((req) => (
                            <FinanceListCard
                                key={req.id}
                                title={req.metadata?.department ? `Requisition · ${req.metadata.department}` : `Requisition · ${req.id}`}
                                flowLabel="Requisition"
                                flowColor="indigo"
                                status={requisitionStatusLabel(req.status)}
                                statusColor={requisitionStatusColor(req.status)}
                                dateLabel={req.updatedAt ? new Date(req.updatedAt).toLocaleDateString() : undefined}
                                note={req.metadata?.notes}
                                amountLabel={fmt(req.metadata?.amount || 0, req.metadata?.currency || 'USD')}
                                onClick={() => router.push(`/finance/requisitions/${req.id}`)}
                            />
                        ))}
                    </Stack>
                )}
            </Container>
        </Layout>
    );
}
