import React, { useState, useEffect, useContext } from 'react';
import Layout from '@/components/Layout';
import { EnvContext } from '@/pages/_app';
import {
    Alert,
    Badge,
    Button,
    Group,
    Modal,
    Paper,
    Progress,
    Select,
    SimpleGrid,
    Stack,
    Text,
    TextInput,
    Textarea,
    ThemeIcon,
    Title,
} from '@mantine/core';
import { IconAlertTriangle, IconChartBar, IconCircleCheck, IconSearch, IconShieldCheck } from '@tabler/icons-react';
import { StatTile } from '../../../shared/StatTile';


interface TrustScore {
    merchantId: string;
    score: number;
    badge: string;
    drivers: Array<{
        name: string;
        score: number;
        weight: number;
        icon: string;
    }>;
}

interface Escalation {
    id: string;
    merchantId: string;
    reason: string;
    status: string;
    createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
    open: 'yellow',
    investigating: 'blue',
    resolved: 'green',
    closed: 'gray',
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => (
    <Badge variant="light" color={STATUS_COLORS[status] || STATUS_COLORS.open} size="sm" tt="none">
        {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
);

const REASON_OPTIONS = [
    { value: 'fraud', label: 'Fraud' },
    { value: 'non_delivery', label: 'Non-Delivery' },
    { value: 'counterfeit', label: 'Counterfeit' },
    { value: 'dispute', label: 'Dispute' },
];

export default function TrustPage() {
    const [merchantId, setMerchantId] = useState('merchant-001');
    const [trustScore, setTrustScore] = useState<TrustScore | null>(null);
    const [escalations, setEscalations] = useState<Escalation[]>([]);
    const [showEscalationModal, setShowEscalationModal] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [newEscalation, setNewEscalation] = useState({
        merchantId: '',
        reason: 'fraud',
        description: ''
    });

    const env = useContext(EnvContext);
    const backendUrl = env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';


    useEffect(() => {
        if (merchantId) {
            fetchTrustScore(merchantId);
        }
        fetchEscalations();
    }, [merchantId]);

    const fetchTrustScore = async (id: string) => {
        setIsLoading(true);
        try {
            const res = await fetch(`${backendUrl}/api/trust/${id}`);
            const data = await res.json();
            setTrustScore(data);
        } catch (error) {
            console.error('Failed to fetch trust score:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchEscalations = async () => {
        try {
            const res = await fetch(`${backendUrl}/api/regulator/escalations`);
            const data = await res.json();
            setEscalations(data.escalations || []);
        } catch (error) {
            console.error('Failed to fetch escalations:', error);
        }
    };

    const handleCreateEscalation = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const res = await fetch(`${backendUrl}/api/regulator/escalations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newEscalation)
            });
            if (res.ok) {
                setShowEscalationModal(false);
                fetchEscalations();
                setNewEscalation({ merchantId: '', reason: 'fraud', description: '' });
            }
        } catch (error) {
            console.error('Failed to create escalation:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const getBadgeColor = (badge: string) => {
        switch (badge) {
            case 'gold': return 'yellow';
            case 'silver': return 'gray';
            case 'bronze': return 'orange';
            default: return 'blue';
        }
    };

    const openCount = escalations.filter(e => e.status === 'open').length;

    return (
        <Layout title="Trust & Compliance">
            <Stack gap="lg" p={{ base: 'sm', sm: 'lg' }}>
                {/* Header */}
                <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
                    <div>
                        <Title order={2}>Trust & Compliance</Title>
                        <Text size="sm" c="dimmed" mt={4}>Monitor merchant trust scores and manage regulatory escalations</Text>
                    </div>
                    <Button color="red" leftSection={<IconAlertTriangle size={16} />} onClick={() => setShowEscalationModal(true)}>
                        Report Issue
                    </Button>
                </Group>

                {/* Stats */}
                <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
                    <StatTile label="Open Escalations" value={openCount} icon={IconAlertTriangle} alert={openCount > 0} color="orange" />
                    <StatTile label="Investigating" value={escalations.filter(e => e.status === 'investigating').length} icon={IconShieldCheck} />
                    <StatTile label="Resolved" value={escalations.filter(e => e.status === 'resolved').length} icon={IconCircleCheck} />
                    <StatTile label="Total Cases" value={escalations.length} icon={IconChartBar} />
                </SimpleGrid>

                <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
                    {/* Trust Score Card */}
                    <Paper withBorder radius="md" p="lg">
                        <Title order={4} mb="md">Trust Score Lookup</Title>
                        <Group gap="xs" align="flex-end" wrap="nowrap">
                            <TextInput
                                label="Merchant ID"
                                value={merchantId}
                                onChange={(e) => setMerchantId(e.currentTarget.value)}
                                style={{ flex: 1 }}
                            />
                            <Button
                                variant="light"
                                leftSection={<IconSearch size={16} />}
                                onClick={() => fetchTrustScore(merchantId)}
                                loading={isLoading && !showEscalationModal}
                            >
                                Lookup
                            </Button>
                        </Group>

                        {trustScore && (
                            <Stack gap="md" mt="lg">
                                <Group justify="space-between" align="center">
                                    <Text fw={700} lh={1} style={{ fontSize: 48, fontVariantNumeric: 'tabular-nums' }}>
                                        {trustScore.score}
                                    </Text>
                                    <Badge size="lg" variant="light" color={getBadgeColor(trustScore.badge)}>
                                        {(trustScore.badge || 'N/A').toUpperCase()}
                                    </Badge>
                                </Group>
                                <Stack gap="sm">
                                    {(trustScore.drivers || []).map((driver, idx) => (
                                        <div key={idx}>
                                            <Group justify="space-between" mb={4}>
                                                <Text size="sm">{driver.name}</Text>
                                                <Text size="sm" c="dimmed">{driver.score}%</Text>
                                            </Group>
                                            <Progress value={driver.score} size="sm" radius="xl" aria-label={driver.name} />
                                        </div>
                                    ))}
                                </Stack>
                            </Stack>
                        )}
                    </Paper>

                    {/* Recent Escalations */}
                    <Paper withBorder radius="md" p="lg">
                        <Title order={4} mb="md">Recent Escalations</Title>
                        {escalations.length === 0 ? (
                            <Text ta="center" c="dimmed" py="xl">No escalations yet</Text>
                        ) : (
                            <Stack gap="sm">
                                {escalations.slice(0, 5).map((esc) => (
                                    <Paper key={esc.id} withBorder radius="sm" p="sm">
                                        <Group justify="space-between" align="flex-start" wrap="nowrap">
                                            <div>
                                                <Text size="sm" fw={500}>{esc.merchantId}</Text>
                                                <Text size="xs" c="dimmed" mt={2}>{esc.reason}</Text>
                                            </div>
                                            <StatusBadge status={esc.status} />
                                        </Group>
                                        <Text size="xs" c="dimmed" mt="xs">{new Date(esc.createdAt).toLocaleString()}</Text>
                                    </Paper>
                                ))}
                            </Stack>
                        )}
                    </Paper>
                </SimpleGrid>

                {/* Escalation Modal */}
                <Modal
                    opened={showEscalationModal}
                    onClose={() => setShowEscalationModal(false)}
                    centered
                    title={
                        <Group gap="sm">
                            <ThemeIcon variant="light" color="red" radius="md">
                                <IconAlertTriangle size={18} />
                            </ThemeIcon>
                            <Text fw={600} size="lg">Report Escalation</Text>
                        </Group>
                    }
                >
                    <form onSubmit={handleCreateEscalation}>
                        <Stack gap="md">
                            <TextInput
                                label="Merchant ID"
                                required
                                value={newEscalation.merchantId}
                                onChange={e => setNewEscalation({ ...newEscalation, merchantId: e.currentTarget.value })}
                            />
                            <Select
                                label="Reason"
                                data={REASON_OPTIONS}
                                value={newEscalation.reason}
                                onChange={value => setNewEscalation({ ...newEscalation, reason: value || 'fraud' })}
                                allowDeselect={false}
                                comboboxProps={{ withinPortal: true }}
                            />
                            <Textarea
                                label="Description"
                                required
                                rows={4}
                                value={newEscalation.description}
                                onChange={e => setNewEscalation({ ...newEscalation, description: e.currentTarget.value })}
                            />
                            <Alert color="red" variant="light">
                                <Text size="sm"><strong>Note:</strong> Escalations are reviewed by the compliance team and may impact merchant trust scores.</Text>
                            </Alert>
                            <Group justify="flex-end" gap="sm" pt="xs">
                                <Button variant="default" onClick={() => setShowEscalationModal(false)}>Cancel</Button>
                                <Button type="submit" color="red" loading={isLoading}>Submit Escalation</Button>
                            </Group>
                        </Stack>
                    </form>
                </Modal>
            </Stack>
        </Layout>
    );
}
