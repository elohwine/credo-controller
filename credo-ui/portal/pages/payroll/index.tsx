import { PRODUCT_NAME } from '@/utils/orgProfile'
import React, { useState, useEffect, useContext } from 'react';
import Layout from '@/components/Layout';
import QRCode from 'react-qr-code';
import { Anchor, Badge, Button, Center, Group, Modal, Paper, SimpleGrid, Stack, Table, Tabs, Text, TextInput, Title } from '@mantine/core';
import { IconBuildingBank, IconChevronRight, IconCopy, IconFileCheck, IconPlayerPlay, IconReceipt, IconSend, IconUsers, IconWallet } from '@tabler/icons-react';
import { StatTile } from '../../../shared/StatTile';
import { feedback } from '@/lib/feedback';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { EnvContext } from '@/pages/_app';
import { getOrgScopedToken } from '@/utils/organizationContext';
import { useRequireOrgContext } from '@/lib/portalContext';

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

interface Employee {
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
    baseSalary: number;
    currency: string;
    status: string;
    staffNumber?: string;
    skills?: string[];
    userId?: string;
}

interface TaxCompliance {
    id: string;
    taxType: string;
    period: string;
    amount: number;
    currency: string;
    status: string;
    referenceNumber?: string;
    complianceVcId?: string;
}

const STATUS_LOOK: Record<string, { label: string; color: string }> = {
    draft: { label: 'Calculated', color: 'gray' },
    processing: { label: 'Processing', color: 'yellow' },
    completed: { label: 'Payslips sent', color: 'teal' },
    paid: { label: 'Paid', color: 'blue' },
    pending: { label: 'Pending', color: 'orange' },
    filed: { label: 'Filed', color: 'blue' },
    confirmed: { label: 'Confirmed', color: 'teal' },
    active: { label: 'Active', color: 'teal' },
};

function StatusBadge({ status }: { status: string }) {
    const look = STATUS_LOOK[status] || { label: status.charAt(0).toUpperCase() + status.slice(1), color: 'gray' };
    return <Badge variant="light" color={look.color} size="sm">{look.label}</Badge>;
}

export default function PayrollPage() {
    const [runs, setRuns] = useState<PayrollRun[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [taxRecords, setTaxRecords] = useState<TaxCompliance[]>([]);
    const [showRunModal, setShowRunModal] = useState(false);
    const [showReofferModal, setShowReofferModal] = useState(false);
    const [reofferUri, setReofferUri] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'runs' | 'compliance'>('runs');
    const [isLoading, setIsLoading] = useState(false);
    const [newRun, setNewRun] = useState({
        period: new Date().toISOString().slice(0, 7)
    });
    useRequireOrgContext('/inbox');
    const router = useRouter();
    useEffect(() => {
        const wanted = String(router.query.tab || '');
        if (wanted === 'employees' || wanted === 'people') {
            void router.replace('/hr?tab=team');
            return;
        }
        if (wanted === 'runs' || wanted === 'compliance') setActiveTab(wanted);
    }, [router.query.tab]);
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
        if (env.NEXT_PUBLIC_BACKEND_URL) {
            fetchPayrollRuns();
            fetchEmployees();
            fetchTaxCompliance();
        }
    }, [env.NEXT_PUBLIC_BACKEND_URL]);

    const fetchPayrollRuns = async () => {
        try {
            const res = await payrollFetch(`/api/payroll/runs`);
            const data = await res.json();
            setRuns(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Failed to fetch payroll runs:', error);
        }
    };

    const fetchEmployees = async () => {
        try {
            const res = await payrollFetch(`/api/payroll/employees`);
            const data = await res.json();
            setEmployees(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Failed to fetch employees:', error);
        }
    };

    const fetchTaxCompliance = async () => {
        try {
            const res = await payrollFetch(`/api/payroll/tax-compliance`);
            const data = await res.json();
            setTaxRecords(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Failed to fetch tax compliance:', error);
            setTaxRecords([]);
        }
    };

    const handleRunPayroll = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const res = await payrollFetch(`/api/payroll/runs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newRun)
            });
            if (res.ok) {
                setShowRunModal(false);
                fetchPayrollRuns();
            }
        } catch (error) {
            console.error('Failed to run payroll:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleIssuePayslips = async (runId: string) => {
        setIsLoading(true);
        try {
            const res = await payrollFetch(`/api/payroll/runs/${runId}/issue`, {
                method: 'POST'
            });
            if (res.ok) {
                fetchPayrollRuns();
            }
        } catch (error) {
            console.error('Failed to issue payslips:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleIssueTaxCompliance = async (runId: string, taxType: string) => {
        setIsLoading(true);
        try {
            const res = await payrollFetch(`/api/payroll/runs/${runId}/tax-compliance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taxType })
            });
            if (res.ok) {
                fetchTaxCompliance();
            }
        } catch (error) {
            console.error('Failed to issue tax compliance:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleReoffer = async (runId: string) => {
        setIsLoading(true);
        try {
            const res = await payrollFetch(`/api/payroll/runs/${runId}/reoffer`, {
                method: 'POST'
            });
            if (!res.ok) {
                throw new Error(`Failed to reoffer: ${res.status}`);
            }
            const data = await res.json();
            if (data.offerUri || data.credential_offer_deeplink) {
                setReofferUri(data.offerUri || data.credential_offer_deeplink);
                setShowReofferModal(true);
            }
        } catch (error) {
            console.error('Failed to reoffer credential:', error);
            feedback.error('Could not create the payslip link. Try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const formatCurrency = (amount: number, currency: string = 'USD') => {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount);
    };

    const activePeople = employees.filter(e => e.status === 'active').length;
    const netPaid = runs.filter(r => r.status === 'completed').reduce((a, r) => a + r.totalNet, 0);
    const lastRun = runs[0];

    return (
        <Layout title="Payroll">
            <Stack gap="lg" p={{ base: 'sm', sm: 'lg' }}>
                <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
                    <div>
                        <Title order={2}>Payroll</Title>
                        <Text size="sm" c="dimmed" mt={4}>
                            Calculate each pay period, send payslips and keep NSSA and PAYE filings. People and their pay details live in{' '}
                            <Anchor component={Link} href="/hr?tab=team" size="sm">Team</Anchor>.
                        </Text>
                    </div>
                    <Button leftSection={<IconPlayerPlay size={16} />} onClick={() => setShowRunModal(true)}>Run payroll</Button>
                </Group>

                <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm">
                    <StatTile label="People on payroll" value={activePeople} icon={IconUsers} hint="Active staff records" onClick={() => void router.push('/hr?tab=team')} />
                    <StatTile
                        label="Last pay period"
                        value={lastRun?.period || '—'}
                        icon={IconReceipt}
                        alert={lastRun?.status === 'draft'}
                        color="orange"
                        hint={lastRun ? (lastRun.status === 'draft' ? 'Payslips not sent yet' : STATUS_LOOK[lastRun.status]?.label || lastRun.status) : 'No pay periods yet'}
                    />
                    <StatTile label="Net paid" value={formatCurrency(netPaid)} icon={IconWallet} hint={`${runs.filter(r => r.status === 'completed').length} completed periods`} />
                    <StatTile label="Tax filings" value={taxRecords.length} icon={IconBuildingBank} hint="NSSA and PAYE" onClick={() => setActiveTab('compliance')} />
                </SimpleGrid>

                <Tabs value={activeTab} onChange={(v) => v && setActiveTab(v as 'runs' | 'compliance')}>
                    <Tabs.List>
                        <Tabs.Tab value="runs" leftSection={<IconReceipt size={16} />}>Pay periods</Tabs.Tab>
                        <Tabs.Tab value="compliance" leftSection={<IconBuildingBank size={16} />}>Tax filings</Tabs.Tab>
                    </Tabs.List>

                    <Tabs.Panel value="runs" pt="md">
                        <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
                            <Table.ScrollContainer minWidth={760}>
                                <Table verticalSpacing="sm" highlightOnHover>
                                    <Table.Thead>
                                        <Table.Tr>
                                            <Table.Th>Period</Table.Th>
                                            <Table.Th>Status</Table.Th>
                                            <Table.Th ta="right">Gross</Table.Th>
                                            <Table.Th ta="right">Net</Table.Th>
                                            <Table.Th>Deductions</Table.Th>
                                            <Table.Th ta="right">Actions</Table.Th>
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {runs.length === 0 ? (
                                            <Table.Tr>
                                                <Table.Td colSpan={6}>
                                                    <Center py="xl"><Text size="sm" c="dimmed">No pay periods yet. Choose Run payroll to calculate the first one.</Text></Center>
                                                </Table.Td>
                                            </Table.Tr>
                                        ) : runs.map((run) => (
                                            <Table.Tr key={run.id}>
                                                <Table.Td><Text size="sm" fw={600}>{run.period}</Text></Table.Td>
                                                <Table.Td><StatusBadge status={run.status} /></Table.Td>
                                                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(run.totalGross)}</Table.Td>
                                                <Table.Td ta="right" fw={600} style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(run.totalNet)}</Table.Td>
                                                <Table.Td>
                                                    <Text size="xs" c="dimmed">
                                                        NSSA {formatCurrency(run.totalNssa || 0)} · PAYE {formatCurrency(run.totalPaye || 0)} · AIDS levy {formatCurrency(run.totalAidsLevy || 0)}
                                                    </Text>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Group gap={6} justify="flex-end" wrap="nowrap">
                                                        {run.status === 'draft' && (
                                                            <Button size="xs" leftSection={<IconSend size={14} />} loading={isLoading} onClick={() => handleIssuePayslips(run.id)}>Send payslips</Button>
                                                        )}
                                                        {run.status === 'completed' && (
                                                            <>
                                                                <Button size="xs" variant="default" disabled={isLoading} onClick={() => handleIssueTaxCompliance(run.id, 'NSSA')}>File NSSA</Button>
                                                                <Button size="xs" variant="default" disabled={isLoading} onClick={() => handleIssueTaxCompliance(run.id, 'PAYE')}>File PAYE</Button>
                                                            </>
                                                        )}
                                                        {run.runVcId && (
                                                            <Button size="xs" variant="subtle" disabled={isLoading} onClick={() => handleReoffer(run.id)}>Share</Button>
                                                        )}
                                                        <Button size="xs" variant="subtle" component={Link} href={`/payroll/${run.id}`} rightSection={<IconChevronRight size={14} />}>Details</Button>
                                                    </Group>
                                                </Table.Td>
                                            </Table.Tr>
                                        ))}
                                    </Table.Tbody>
                                </Table>
                            </Table.ScrollContainer>
                        </Paper>
                    </Tabs.Panel>

                    <Tabs.Panel value="compliance" pt="md">
                        <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
                            <Table.ScrollContainer minWidth={640}>
                                <Table verticalSpacing="sm" highlightOnHover>
                                    <Table.Thead>
                                        <Table.Tr>
                                            <Table.Th>Tax</Table.Th>
                                            <Table.Th>Period</Table.Th>
                                            <Table.Th ta="right">Amount</Table.Th>
                                            <Table.Th>Reference</Table.Th>
                                            <Table.Th>Status</Table.Th>
                                            <Table.Th>Record</Table.Th>
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {taxRecords.length === 0 ? (
                                            <Table.Tr>
                                                <Table.Td colSpan={6}>
                                                    <Center py="xl"><Text size="sm" c="dimmed">No filings yet. File NSSA or PAYE from a pay period whose payslips were sent.</Text></Center>
                                                </Table.Td>
                                            </Table.Tr>
                                        ) : taxRecords.map((tax) => (
                                            <Table.Tr key={tax.id}>
                                                <Table.Td><Text size="sm" fw={600}>{tax.taxType}</Text></Table.Td>
                                                <Table.Td>{tax.period}</Table.Td>
                                                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(tax.amount, tax.currency)}</Table.Td>
                                                <Table.Td><Text size="xs" ff="monospace" c="dimmed">{tax.referenceNumber || '—'}</Text></Table.Td>
                                                <Table.Td><StatusBadge status={tax.status} /></Table.Td>
                                                <Table.Td>
                                                    {tax.complianceVcId
                                                        ? <Group gap={4} c="teal"><IconFileCheck size={16} /><Text size="xs">Signed</Text></Group>
                                                        : <Text size="xs" c="dimmed">—</Text>}
                                                </Table.Td>
                                            </Table.Tr>
                                        ))}
                                    </Table.Tbody>
                                </Table>
                            </Table.ScrollContainer>
                        </Paper>
                    </Tabs.Panel>
                </Tabs>
            </Stack>

            <Modal opened={showRunModal} onClose={() => setShowRunModal(false)} title="Run payroll" centered>
                <form onSubmit={handleRunPayroll}>
                    <Stack gap="md">
                        <TextInput type="month" label="Pay period" required value={newRun.period} onChange={(e) => setNewRun({ ...newRun, period: e.currentTarget.value })} />
                        <Text size="sm" c="dimmed">
                            Calculates pay for everyone active on payroll, with NSSA (4.5%), PAYE and AIDS levy deducted. Nothing is sent until you choose Send payslips.
                        </Text>
                        <Group justify="flex-end">
                            <Button variant="default" onClick={() => setShowRunModal(false)}>Cancel</Button>
                            <Button type="submit" loading={isLoading}>Calculate</Button>
                        </Group>
                    </Stack>
                </form>
            </Modal>

            <Modal opened={showReofferModal && Boolean(reofferUri)} onClose={() => setShowReofferModal(false)} title="Share payslip record" centered>
                {reofferUri && (
                    <Stack gap="md" align="stretch">
                        <Text size="sm" c="dimmed">Scan with the {PRODUCT_NAME} app, or copy the link and send it.</Text>
                        <Center p="md" bg="white" style={{ borderRadius: 'var(--mantine-radius-md)' }}>
                            <QRCode value={reofferUri} size={200} />
                        </Center>
                        <Button
                            variant="light"
                            leftSection={<IconCopy size={16} />}
                            onClick={() => { void navigator.clipboard.writeText(reofferUri); feedback.success('Link copied'); }}
                        >
                            Copy link
                        </Button>
                    </Stack>
                )}
            </Modal>
        </Layout>
    );
}
