import React, { useState } from 'react';
import {
    Stack, Title, Text, Box, Group, Badge, Card, ThemeIcon, Button, Modal, Paper, Alert
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconMail, IconShieldCheck, IconClock, IconFileText, IconInbox } from '@tabler/icons-react';
import { useRouter } from 'next/router';
import AppShellMobile from '@/components/layout/AppShellMobile';
import api from '@/lib/api';
import { getActiveOrgId, getContextMode, getOrgToken, isEmployeeOrgRole } from '@/lib/auth';

interface IntakeItem {
    id: string;
    source: string;
    subject: string;
    amount: number;
    currency: string;
    receivedAt: string;
    sender: string;
}

const MOCK_INTAKE: IntakeItem[] = [
    {
        id: 'msg-101',
        source: 'Email / G-Workspace',
        subject: 'RE: Purchase Order PO-9821 - Eton College Refurb',
        amount: 1450.00,
        currency: 'USD',
        receivedAt: new Date(Date.now() - 3600000).toISOString(),
        sender: 'procurement@eton.edu',
    },
    {
        id: 'msg-102',
        source: 'WhatsApp Business',
        subject: 'New Maintenance Request: Window Leak at Block B',
        amount: 250.00,
        currency: 'USD',
        receivedAt: new Date(Date.now() - 7200000).toISOString(),
        sender: '+44 20 7946 0999',
    },
    {
        id: 'msg-103',
        source: 'PDF Integration',
        subject: 'Official Order: Westminster School Gate Repair',
        amount: 1200.00,
        currency: 'USD',
        receivedAt: new Date(Date.now() - 86400000).toISOString(),
        sender: 'finance-office@westminster.org.uk',
    },
];

export default function IntakePage() {
    const router = useRouter();
    const [selected, setSelected] = useState<IntakeItem | null>(null);
    const [loading, setLoading] = useState(false);

    const hasFeptEnabled = (() => {
        if (typeof window === 'undefined') return false;
        try {
            const raw = localStorage.getItem('credoActiveWorkflowTypes');
            const workflows = raw ? JSON.parse(raw) : [];
            return Array.isArray(workflows) && workflows.some((w: any) => {
                const value = String(w || '').toLowerCase();
                return value.includes('field') || value.includes('fept');
            });
        } catch {
            return false;
        }
    })();

    const canUseFeptOps = getContextMode() === 'org' && !!getActiveOrgId() && isEmployeeOrgRole() && hasFeptEnabled;

    const handlePromote = async (item: IntakeItem) => {
        setLoading(true);
        try {
            const orgToken = getOrgToken();

            // 1. Initiate workflow (tpl-fept-field-execution)
            // This implicitly "promotes" the Web2 order to a secure job card
            await api.post('/workflows/tpl-fept-field-execution/execute', {
                reference: item.subject.split(': ').pop() || item.id,
                requestId: item.id,
                amount: item.amount,
                currency: item.currency,
                assigneeId: 'agent-farai', // Default as per notification text
                description: `Promoted from ${item.source}: ${item.subject}`,
            }, {
                headers: { Authorization: `Bearer ${orgToken}` }
            });

            notifications.show({
                title: 'Job Started',
                message: 'Order converted to secured job card and assigned to Farai.',
                color: 'teal',
                icon: <IconShieldCheck size={18} />
            });

            router.push('/finance?tab=field');
        } catch (error: any) {
            notifications.show({
                title: 'Promotion Failed',
                message: error.message || 'Could not initiate secured job',
                color: 'red'
            });
        } finally {
            setLoading(false);
            setSelected(null);
        }
    };

    return (
        <AppShellMobile>
            <Box>
                {!canUseFeptOps && (
                    <Box p="md">
                        <Alert icon={<IconShieldCheck size={18} />} color="gray" title="Unavailable">
                            This FEPT operational intake view is only available to organization employees when field execution workflow is active.
                        </Alert>
                    </Box>
                )}

                {canUseFeptOps && (
                    <>
                <Box p="md" style={{
                    background: 'rgba(255,255,255,0.74)',
                    borderBottom: '1px solid rgba(148,163,184,0.2)',
                    backdropFilter: 'blur(12px) saturate(150%)',
                }}>
                    <Group justify="space-between">
                        <Box>
                            <Title order={3}>Operational Intake</Title>
                            <Text size="sm" c="dimmed">Convert incoming orders to verified job cards</Text>
                        </Box>
                        <ThemeIcon size="xl" radius="md" variant="light" color="teal">
                            <IconInbox size={24} />
                        </ThemeIcon>
                    </Group>
                </Box>

                <Stack gap="sm" p="md">
                    {MOCK_INTAKE.map(item => (
                        <Card key={item.id} withBorder radius="md" p="sm" onClick={() => setSelected(item)} style={{ cursor: 'pointer' }}>
                            <Group justify="space-between" wrap="nowrap">
                                <Box style={{ flex: 1 }}>
                                    <Group gap={6} mb={4}>
                                        <Badge size="xs" variant="light" color="indigo">{item.source}</Badge>
                                        <Text size="xs" c="dimmed">{new Date(item.receivedAt).toLocaleTimeString()}</Text>
                                    </Group>
                                    <Text fw={600} size="sm" lineClamp={1}>{item.subject}</Text>
                                    <Text size="xs" c="dimmed">{item.sender}</Text>
                                </Box>
                                <Box ta="right">
                                    <Text fw={700} c="teal">{item.amount} {item.currency}</Text>
                                    <Button size="compact-xs" variant="subtle" color="teal" mt={4}>Review</Button>
                                </Box>
                            </Group>
                        </Card>
                    ))}
                </Stack>

                <Modal opened={!!selected} onClose={() => setSelected(null)} title="Evaluate Intake Priority" centered radius="lg">
                    {selected && (
                        <Stack gap="md">
                            <Paper p="sm" withBorder radius="md" style={{ background: '#f8fafc' }}>
                                <Text size="xs" tt="uppercase" fw={700} c="dimmed">Source Metadata</Text>
                                <Text size="sm" fw={600} mt={4}>{selected.subject}</Text>
                                <Text size="xs" c="dimmed" mt={4}>Sender: {selected.sender}</Text>
                                <Text size="xs" c="dimmed">Original Ref: {selected.id}</Text>
                            </Paper>

                            <Alert icon={<IconShieldCheck size={20} />} color="teal" title="Secured Operations">
                                <Text size="xs">
                                    Starting this job will issue a verified work order and initiate an automated field execution run with secure performance records.
                                </Text>
                            </Alert>

                            <Group grow>
                                <Button variant="light" color="gray" onClick={() => setSelected(null)}>Archive</Button>
                                <Button color="teal" loading={loading} onClick={() => handlePromote(selected)}>Start Secured Job</Button>
                            </Group>
                        </Stack>
                    )}
                </Modal>

                <Box h={80} />
                    </>
                )}
            </Box>
        </AppShellMobile>
    );
}
