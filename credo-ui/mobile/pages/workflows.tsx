import React, { useState, useEffect, useCallback } from 'react';
import {
    Stack, Title, Text, Box, Paper, SimpleGrid, Group, ActionIcon, Button, Loader, Center, Alert,
    Drawer, TextInput, Badge, Tabs, ThemeIcon, Timeline, Divider, ScrollArea
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
    IconSettings, IconAlertCircle, IconArrowLeft, IconPlayerPlay, IconRefresh,
    IconCheck, IconClock, IconX, IconActivity
} from '@tabler/icons-react';
import { useRouter } from 'next/router';
import AppShellMobile from '@/components/layout/AppShellMobile';
import ErrorAlert from '@/components/shared/ErrorAlert';
import api from '@/lib/api';
import { getActiveOrgId, getContextMode, getPreferredToken, getUserRole } from '@/lib/auth';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

// ---- Types ----
interface WorkflowTemplate {
    id: string;
    name: string;
    workflowType?: string;
    sector?: string;
    enabled?: boolean;
    steps?: { description: string }[];
    initiation?: { mode?: string; description?: string; inputSchema?: any };
    paymentModes?: string[];
    credentialPolicy?: { outputVCs?: string[] };
}

interface WorkflowRun {
    runId: string;
    workflowId: string;
    workflowName?: string;
    status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
    startedAt?: string;
    completedAt?: string;
    error?: string;
    steps?: { action: string; status: string; output?: any }[];
}

function isPlainObject(value: unknown): value is Record<string, any> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeTemplate(input: any): WorkflowTemplate {
    const initiation = isPlainObject(input?.initiation) ? input.initiation : {};
    const inputSchema = isPlainObject(initiation.inputSchema) ? initiation.inputSchema : {};
    const properties = isPlainObject(inputSchema.properties) ? inputSchema.properties : {};
    const required = Array.isArray(inputSchema.required) ? inputSchema.required : [];

    return {
        id: String(input?.id || ''),
        name: String(input?.name || input?.id || 'Workflow Template'),
        workflowType: input?.workflowType,
        sector: input?.sector,
        enabled: Boolean(input?.enabled),
        steps: Array.isArray(input?.steps) ? input.steps : [],
        initiation: {
            mode: initiation.mode,
            description: initiation.description,
            inputSchema: {
                ...inputSchema,
                properties,
                required,
            },
        },
        paymentModes: Array.isArray(input?.paymentModes) ? input.paymentModes : [],
        credentialPolicy: {
            ...(isPlainObject(input?.credentialPolicy) ? input.credentialPolicy : {}),
            outputVCs: Array.isArray(input?.credentialPolicy?.outputVCs)
                ? input.credentialPolicy.outputVCs
                : [],
        },
    };
}

const RUN_STATUS_COLOR: Record<string, string> = {
    pending: 'orange', running: 'blue', paused: 'yellow', completed: 'green', failed: 'red',
};

export default function WorkflowsPage() {
    const router = useRouter();
    const tenantId = getActiveOrgId();
    const role = getUserRole();
    const isIssuer = getContextMode() === 'org' && ['owner', 'admin', 'issuer'].includes(role ?? '');

    const [tab, setTab] = useState<string>('templates');
    const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
    const [runs, setRuns] = useState<WorkflowRun[]>([]);
    // features removed (migration 062) - derive from templates instead
    const [loading, setLoading] = useState(true);
    const [runsLoading, setRunsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Execution state
    const [selected, setSelected] = useState<WorkflowTemplate | null>(null);
    const [isExecuting, setIsExecuting] = useState(false);
    const [formData, setFormData] = useState<Record<string, string>>({});

    // Run detail
    const [selectedRun, setSelectedRun] = useState<WorkflowRun | null>(null);

    // ---- Fetch org workflow configuration (portal-aligned) ----
    const fetchWorkflowConfig = useCallback(async () => {
        if (!tenantId) { setLoading(false); return; }
        setLoading(true); setError(null);
        try {
            const token = getPreferredToken();
            const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

            const res = await api.get(`/api/organizations/${tenantId}/workflows`, { headers });
            const data = res.data || {};
            const normalizedTemplates = (Array.isArray(data.templates) ? data.templates : [])
                .map((t: any) => normalizeTemplate(t))
                .filter((t: WorkflowTemplate) => t.enabled);
            setTemplates(normalizedTemplates);
            // features removed (migration 062) - no longer returned by backend
        } catch (err: any) {
            setError(err.response?.data?.message || err.message || 'Failed to load workflows');
        } finally {
            setLoading(false);
        }
    }, [tenantId]);

    // ---- Fetch workflow runs ----
    const fetchRuns = useCallback(async () => {
        if (!tenantId) return;
        setRunsLoading(true);
        try {
            const res = await api.get('/workflows/runs', { params: { limit: 25 } });
            setRuns(res.data || []);
        } catch {
            // Non-critical — runs list may not be available yet
        } finally {
            setRunsLoading(false);
        }
    }, [tenantId]);

    useEffect(() => {
        if (!isIssuer) {
            router.replace('/');
            return;
        }
        fetchWorkflowConfig();
        fetchRuns();
    }, [fetchWorkflowConfig, fetchRuns, isIssuer, router]);

    if (!isIssuer) return null;

    // ---- Execute a template ----
    const handleExecute = async () => {
        if (!selected || !tenantId) return;
        setIsExecuting(true);
        try {
            // 1. Instantiate template → get workflowId
            const instRes = await api.post(`/workflow-templates/tenant/${selected.id}/instantiate`, {
                tenantId, name: selected.name
            });
            const workflowId = instRes.data?.workflowId;
            if (!workflowId) throw new Error('Template instantiation did not return a workflow ID');

            // 2. Execute
            const execRes = await api.post(`/workflows/${workflowId}/execute`, formData);

            notifications.show({
                title: 'Workflow Executed',
                message: execRes.data?.status === 'completed' ? 'Completed successfully' : `Run started (${execRes.data?.runId})`,
                color: 'green',
            });

            setSelected(null);
            setFormData({});
            fetchRuns(); // Refresh runs list
        } catch (err: any) {
            notifications.show({ title: 'Execution failed', message: err.response?.data?.error || err.message, color: 'red' });
        } finally {
            setIsExecuting(false);
        }
    };

    // ---- Fetch individual run status ----
    const handleViewRun = async (run: WorkflowRun) => {
        try {
            const res = await api.get(`/workflows/runs/${run.runId}`);
            setSelectedRun(res.data);
        } catch {
            setSelectedRun(run); // Fallback to list data
        }
    };

    const properties = isPlainObject(selected?.initiation?.inputSchema?.properties)
        ? selected?.initiation?.inputSchema?.properties
        : {};
    const selectedRequiredFields = Array.isArray(selected?.initiation?.inputSchema?.required)
        ? selected?.initiation?.inputSchema?.required
        : [];
    const selectedSteps = Array.isArray(selected?.steps) ? selected.steps : [];
    const requiresInput = Object.keys(properties).length > 0;

    return (
        <AppShellMobile>
            <Stack gap="md" px="md" pt="md" pb={80}>
                <Group justify="space-between" align="center">
                    <Group gap="xs">
                        <ActionIcon variant="subtle" onClick={() => router.back()}><IconArrowLeft size={20} /></ActionIcon>
                        <Title order={3}>Workflows</Title>
                    </Group>
                    <ActionIcon variant="subtle" color="gray" onClick={() => { fetchWorkflowConfig(); fetchRuns(); }} loading={loading}>
                        <IconRefresh size={18} />
                    </ActionIcon>
                </Group>

                <Tabs value={tab} onChange={(v) => setTab(v ?? 'templates')}>
                    <Tabs.List grow>
                        <Tabs.Tab value="templates">Templates {templates.length > 0 ? `(${templates.length})` : ''}</Tabs.Tab>
                        <Tabs.Tab value="runs" rightSection={runs.length > 0 ? <Badge size="xs" circle color="blue">{runs.length}</Badge> : undefined}>
                            Recent Runs
                        </Tabs.Tab>
                    </Tabs.List>
                </Tabs>

                {error && <ErrorAlert message={error} />}

                {loading ? (
                    <Center py="xl"><Loader color="credentis" /></Center>
                ) : tab === 'templates' ? (
                    templates.length === 0 ? (
                        <Center py="xl">
                            <Stack align="center" gap="xs">
                                <ThemeIcon size={56} radius="xl" color="gray" variant="light"><IconSettings size={28} /></ThemeIcon>
                                <Text fw={600}>No Active Templates</Text>
                                <Text size="sm" c="dimmed" ta="center">Select capabilities to build your trust infrastructure.</Text>
                                <Button size="sm" mt="xs" onClick={() => router.push('/settings/org')}>
                                    Configure Capabilities
                                </Button>
                            </Stack>
                        </Center>
                    ) : (
                        <Stack gap="sm">
                            {templates.map(tmpl => (
                                <Paper key={tmpl.id} p="md" radius="lg" withBorder onClick={() => { setSelected(tmpl); setFormData({}); }} style={{ cursor: 'pointer' }}>
                                    <Group justify="space-between" align="flex-start" mb={4}>
                                        <Box style={{ flex: 1 }}>
                                            <Text fw={700} size="sm">{tmpl.name}</Text>
                                            <Text size="xs" c="dimmed">{tmpl.workflowType} · {tmpl.sector}</Text>
                                        </Box>
                                        <ThemeIcon size={28} radius="md" color="credentis" variant="light"><IconPlayerPlay size={14} /></ThemeIcon>
                                    </Group>
                                    {Array.isArray(tmpl.paymentModes) && tmpl.paymentModes.length > 0 && (
                                        <Badge size="xs" color="green" variant="light" mr={4}>pay: {tmpl.paymentModes.join(', ')}</Badge>
                                    )}
                                    {(Array.isArray(tmpl.credentialPolicy?.outputVCs) ? tmpl.credentialPolicy?.outputVCs : []).map((vc) => (
                                        <Badge key={vc} size="xs" color="blue" variant="light" mr={4}>{vc}</Badge>
                                    ))}
                                    {Array.isArray(tmpl.steps) && (
                                        <Text size="xs" c="dimmed" mt={4}>{tmpl.steps.length} step{tmpl.steps.length !== 1 ? 's' : ''}</Text>
                                    )}
                                </Paper>
                            ))}
                        </Stack>
                    )
                ) : (
                    /* Runs tab */
                    runsLoading ? (
                        <Center py="xl"><Loader color="credentis" /></Center>
                    ) : runs.length === 0 ? (
                        <Center py="xl">
                            <Stack align="center" gap="xs">
                                <ThemeIcon size={56} radius="xl" color="gray" variant="light"><IconActivity size={28} /></ThemeIcon>
                                <Text fw={600}>No Runs Yet</Text>
                                <Text size="sm" c="dimmed" ta="center">Execute a workflow template to see runs here.</Text>
                            </Stack>
                        </Center>
                    ) : (
                        <Stack gap="sm">
                            {runs.map(run => (
                                <Paper key={run.runId} p="md" radius="lg" withBorder onClick={() => handleViewRun(run)} style={{ cursor: 'pointer' }}>
                                    <Group justify="space-between" align="center">
                                        <Box>
                                            <Text fw={600} size="sm">{run.workflowName || run.workflowId}</Text>
                                            <Text size="xs" c="dimmed">{run.startedAt ? dayjs(run.startedAt).fromNow() : '—'}</Text>
                                        </Box>
                                        <Badge color={RUN_STATUS_COLOR[run.status] || 'gray'} size="sm">{run.status}</Badge>
                                    </Group>
                                    {run.error && <Text size="xs" c="red" mt={4}>{run.error}</Text>}
                                </Paper>
                            ))}
                        </Stack>
                    )
                )}
            </Stack>

            {/* ── Execute Template Drawer ── */}
            <Drawer opened={!!selected} onClose={() => setSelected(null)} position="bottom" size="auto" radius="lg" title={selected?.name || 'Execute Workflow'}>
                <Stack gap="md" pb="lg">
                    <Text size="sm" c="dimmed">{selected?.initiation?.description || 'Provide details and execute.'}</Text>

                    {selectedSteps.length > 0 && (
                        <Box>
                            <Text size="xs" fw={600} mb={4}>Steps</Text>
                            <Timeline active={-1} bulletSize={16} lineWidth={2}>
                                {selectedSteps.map((s, i) => (
                                    <Timeline.Item key={i} title={<Text size="xs">{s.description}</Text>} />
                                ))}
                            </Timeline>
                        </Box>
                    )}

                    <Divider />

                    {requiresInput ? (
                        Object.entries(properties).map(([key, prop]: any) => (
                            <TextInput
                                key={key}
                                label={prop.title || key}
                                description={prop.description}
                                placeholder={prop.default ? String(prop.default) : undefined}
                                required={selectedRequiredFields.includes(key)}
                                value={formData[key] || ''}
                                onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                            />
                        ))
                    ) : (
                        <Alert color="blue" variant="light">This workflow requires no input. Execute directly.</Alert>
                    )}

                    <Button size="lg" color="credentis" fullWidth loading={isExecuting} onClick={handleExecute} leftSection={<IconPlayerPlay size={18} />}>
                        Execute
                    </Button>
                </Stack>
            </Drawer>

            {/* ── Run Detail Drawer ── */}
            <Drawer opened={!!selectedRun} onClose={() => setSelectedRun(null)} position="bottom" size="auto" radius="lg" title="Run Details">
                {selectedRun && (
                    <Stack gap="md" pb="lg">
                        <Group justify="space-between">
                            <Text fw={700}>{selectedRun.workflowName || selectedRun.workflowId}</Text>
                            <Badge color={RUN_STATUS_COLOR[selectedRun.status] || 'gray'} size="lg">{selectedRun.status}</Badge>
                        </Group>

                        <SimpleGrid cols={2}>
                            <Box><Text size="xs" c="dimmed">Started</Text><Text size="sm">{selectedRun.startedAt ? dayjs(selectedRun.startedAt).format('DD MMM HH:mm') : '—'}</Text></Box>
                            <Box><Text size="xs" c="dimmed">Completed</Text><Text size="sm">{selectedRun.completedAt ? dayjs(selectedRun.completedAt).format('DD MMM HH:mm') : '—'}</Text></Box>
                        </SimpleGrid>

                        {selectedRun.error && <Alert color="red" variant="light">{selectedRun.error}</Alert>}

                        {selectedRun.steps && selectedRun.steps.length > 0 && (
                            <Box>
                                <Text size="xs" fw={600} mb={4}>Step History</Text>
                                <Timeline active={selectedRun.steps.length - 1} bulletSize={20} lineWidth={2}>
                                    {selectedRun.steps.map((step, i) => (
                                        <Timeline.Item
                                            key={i}
                                            title={<Text size="sm" fw={500}>{step.action}</Text>}
                                            bullet={step.status === 'completed' ? <IconCheck size={12} /> : step.status === 'failed' ? <IconX size={12} /> : <IconClock size={12} />}
                                            color={step.status === 'completed' ? 'green' : step.status === 'failed' ? 'red' : 'blue'}
                                        >
                                            <Text size="xs" c="dimmed">{step.status}</Text>
                                        </Timeline.Item>
                                    ))}
                                </Timeline>
                            </Box>
                        )}
                    </Stack>
                )}
            </Drawer>
        </AppShellMobile>
    );
}
