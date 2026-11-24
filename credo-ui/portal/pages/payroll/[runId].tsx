import React, { useState, useEffect, useContext } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import Link from 'next/link';
import { Anchor, Badge, Button, Center, Group, Loader, Paper, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { IconArrowLeft, IconBuildingBank, IconCash, IconFileCheck, IconSend, IconUsers, IconWallet } from '@tabler/icons-react';
import { StatTile } from '../../../shared/StatTile';
import { EnvContext } from '@/pages/_app';
import { getOrgScopedToken } from '@/utils/organizationContext';

interface Payslip {
    id: string;
    employeeId: string;
    period: string;
    grossAmount: number;
    netAmount: number;
    currency: string;
    deductions: {
        nssa: number;
        paye: number;
        aids_levy: number;
        other: number;
    };
    payslipVcId?: string;
    status: string;
}

interface PayrollRun {
    id: string;
    period: string;
    status: string;
    totalGross: number;
    totalNet: number;
    totalNssa?: number;
    totalPaye?: number;
    totalAidsLevy?: number;
    runVcId?: string;
    createdAt: string;
}

const STATUS_LOOK: Record<string, { label: string; color: string }> = {
    draft: { label: 'Calculated', color: 'gray' },
    completed: { label: 'Payslips sent', color: 'teal' },
    issued: { label: 'Sent', color: 'teal' },
    pending: { label: 'Pending', color: 'orange' },
};

function StatusBadge({ status }: { status: string }) {
    const look = STATUS_LOOK[status] || { label: status.charAt(0).toUpperCase() + status.slice(1), color: 'gray' };
    return <Badge variant="light" color={look.color} size="sm">{look.label}</Badge>;
}

export default function PayrollRunDetailPage() {
    const router = useRouter();
    const { runId } = router.query;
    const [run, setRun] = useState<PayrollRun | null>(null);
    const [payslips, setPayslips] = useState<Payslip[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [names, setNames] = useState<Record<string, string>>({});
    const env = useContext(EnvContext);
    const backendUrl = env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
    const payrollFetch = (path: string, init: RequestInit = {}) => {
        const token = getOrgScopedToken();
        return fetch(`${backendUrl}${path}`, {
            ...init,
            headers: { ...(init.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        });
    };

    useEffect(() => {
        if (runId) {
            fetchRunDetails();
        }
    }, [runId]);

    const fetchRunDetails = async () => {
        setIsLoading(true);
        try {
            const res = await payrollFetch(`/api/payroll/runs/${runId}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data?.message || 'Payroll run not found');
            setRun(data.run);
            setPayslips(data.payslips || []);
            const people = await payrollFetch('/api/payroll/employees').then((r) => (r.ok ? r.json() : [])).catch(() => []);
            if (Array.isArray(people)) {
                setNames(Object.fromEntries(people.map((p: any) => [p.id, [p.firstName, p.lastName].filter(Boolean).join(' ') || p.staffNumber || 'Staff member'])));
            }
        } catch (error) {
            console.error('Failed to fetch run details:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleIssuePayslips = async () => {
        setIsProcessing(true);
        try {
            const res = await payrollFetch(`/api/payroll/runs/${runId}/issue`, {
                method: 'POST'
            });
            if (res.ok) {
                fetchRunDetails();
            }
        } catch (error) {
            console.error('Failed to issue payslips:', error);
        } finally {
            setIsProcessing(false);
        }
    };

    const formatCurrency = (amount: number, currency: string = 'USD') => {
        return new Intl.NumberFormat('en-US', { 
            style: 'currency', 
            currency, 
            minimumFractionDigits: 2 
        }).format(amount);
    };

    if (isLoading) {
        return (
            <Layout title="Payroll">
                <Center mih={320}><Loader /></Center>
            </Layout>
        );
    }

    if (!run) {
        return (
            <Layout title="Payroll">
                <Stack align="center" py="xl" gap="sm">
                    <Title order={4}>Pay period not found</Title>
                    <Anchor component={Link} href="/payroll" size="sm">Back to payroll</Anchor>
                </Stack>
            </Layout>
        );
    }

    const totalDeductions = (run.totalGross || 0) - (run.totalNet || 0);
    const money = { fontVariantNumeric: 'tabular-nums' as const };

    return (
        <Layout title={`Payroll ${run.period}`}>
            <Stack gap="lg" p={{ base: 'sm', sm: 'lg' }}>
                <Anchor component={Link} href="/payroll" size="sm">
                    <Group gap={4}><IconArrowLeft size={14} /> Payroll</Group>
                </Anchor>
                <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
                    <div>
                        <Group gap="sm">
                            <Title order={2}>Pay period {run.period}</Title>
                            <StatusBadge status={run.status} />
                        </Group>
                        <Text size="sm" c="dimmed" mt={4}>Calculated {new Date(run.createdAt).toLocaleString()}</Text>
                    </div>
                    {run.status === 'draft' && (
                        <Button leftSection={<IconSend size={16} />} loading={isProcessing} onClick={handleIssuePayslips}>Send payslips</Button>
                    )}
                </Group>

                <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm">
                    <StatTile label="Gross pay" value={formatCurrency(run.totalGross)} icon={IconCash} />
                    <StatTile label="Net pay" value={formatCurrency(run.totalNet)} icon={IconWallet} />
                    <StatTile label="Deductions" value={formatCurrency(totalDeductions)} icon={IconBuildingBank} hint={`NSSA ${formatCurrency(run.totalNssa || 0)} · PAYE ${formatCurrency(run.totalPaye || 0)} · AIDS levy ${formatCurrency(run.totalAidsLevy || 0)}`} />
                    <StatTile label="People paid" value={payslips.length} icon={IconUsers} hint={run.runVcId ? 'Signed pay record kept' : undefined} />
                </SimpleGrid>

                <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
                    <Group px="md" py="sm" justify="space-between" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
                        <Text fw={600} size="sm">Payslips</Text>
                        <Text size="xs" c="dimmed">{payslips.length} people</Text>
                    </Group>
                    <Table.ScrollContainer minWidth={760}>
                        <Table verticalSpacing="sm" highlightOnHover>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Person</Table.Th>
                                    <Table.Th ta="right">Gross</Table.Th>
                                    <Table.Th ta="right">NSSA</Table.Th>
                                    <Table.Th ta="right">PAYE</Table.Th>
                                    <Table.Th ta="right">AIDS levy</Table.Th>
                                    <Table.Th ta="right">Net</Table.Th>
                                    <Table.Th>Status</Table.Th>
                                    <Table.Th>Payslip</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {payslips.length === 0 ? (
                                    <Table.Tr>
                                        <Table.Td colSpan={8}><Center py="xl"><Text size="sm" c="dimmed">No payslips in this pay period.</Text></Center></Table.Td>
                                    </Table.Tr>
                                ) : payslips.map((slip) => (
                                    <Table.Tr key={slip.id}>
                                        <Table.Td><Text size="sm" fw={500}>{names[slip.employeeId] || 'Staff member'}</Text></Table.Td>
                                        <Table.Td ta="right" style={money}>{formatCurrency(slip.grossAmount, slip.currency)}</Table.Td>
                                        <Table.Td ta="right" c="dimmed" style={money}>{formatCurrency(slip.deductions?.nssa || 0, slip.currency)}</Table.Td>
                                        <Table.Td ta="right" c="dimmed" style={money}>{formatCurrency(slip.deductions?.paye || 0, slip.currency)}</Table.Td>
                                        <Table.Td ta="right" c="dimmed" style={money}>{formatCurrency(slip.deductions?.aids_levy || 0, slip.currency)}</Table.Td>
                                        <Table.Td ta="right" fw={600} style={money}>{formatCurrency(slip.netAmount, slip.currency)}</Table.Td>
                                        <Table.Td><StatusBadge status={slip.status} /></Table.Td>
                                        <Table.Td>
                                            {slip.payslipVcId
                                                ? <Group gap={4} c="teal" wrap="nowrap"><IconFileCheck size={16} /><Text size="xs">In their app</Text></Group>
                                                : <Text size="xs" c="dimmed">Not sent</Text>}
                                        </Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                </Paper>
            </Stack>
        </Layout>
    );
}
