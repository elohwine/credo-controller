import React, { useState, useEffect, useCallback, useContext } from 'react';
import axios from 'axios';
import { useRouter } from 'next/router';
import {
    Title, Text, Group, Paper, Badge, Button,
    Stack, Select, Grid, Card, ActionIcon, Box, Divider
} from '@mantine/core';
import { IconBriefcase, IconMapPin, IconCalendar, IconUser, IconEye, IconRefresh, IconPlus } from '@tabler/icons-react';
import { BRAND } from '@/lib/theme';
import JobCardDetail from './JobCardDetail';
import NewJobModal from './NewJobModal';
import { EnvContext } from '@/pages/_app';
import { getPreferredTenantToken } from '@/utils/portalTenant';
import { readActiveOrganization } from '@/utils/organizationContext';
import { jobStatusColor as getStatusColor, jobStatusLabel as getStatusLabel } from '../finance/financeStages';

interface JobCard {
    id: string;
    status: string;
    workflowId: string;
    input?: any;
    output?: any;
    created_at: string;
    updated_at: string;
    authToken?: string;
    authContext?: 'personal' | 'org';
}

const FEPT_STAGES = new Set([
    'ASSIGNED',
    'IN_PROGRESS',
    'EVIDENCE_CAPTURED',
    'ACKNOWLEDGED',
    'PAYMENT_TRIGGERED',
    'RECEIPT_ISSUED',
    'RECONCILED',
    'COMPLETED',
    'DISPUTED',
    'CANCELLED',
    'REVOKED',
]);


export default function JobCardsBoard() {
    const env = useContext(EnvContext);
    const [jobs, setJobs] = useState<JobCard[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<string | null>('all');
    const [selectedJob, setSelectedJob] = useState<JobCard | null>(null);
    const [showNewJob, setShowNewJob] = useState(false);
    const [canCreate, setCanCreate] = useState(false);
    const [memberNames, setMemberNames] = useState<Record<string, string>>({});

    useEffect(() => {
        const role = String(readActiveOrganization()?.role || '').toLowerCase();
        setCanCreate(['owner', 'admin', 'dispatcher', 'manager'].includes(role));
    }, []);

    // People are shown by name, never by id.
    useEffect(() => {
        const org = readActiveOrganization();
        const token = localStorage.getItem('credoOrgToken') || getPreferredTenantToken();
        if (!org?.orgTenantId || !token) return;
        const credoBackend = env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000';
        axios.get(`${credoBackend}/api/organizations/${encodeURIComponent(org.orgTenantId)}/members`, {
            headers: { Authorization: `Bearer ${token}` },
        }).then((res) => {
            const rows = Array.isArray(res.data) ? res.data : [];
            const names: Record<string, string> = {};
            for (const m of rows) {
                if (!m?.userId) continue;
                const name = String(m.displayName || '').trim();
                const generic = !name || /^(organization owner|team member)$/i.test(name);
                const userId = String(m.userId);
                const role = String(m.role || '').toLowerCase();
                names[userId] = !generic
                    ? name
                    : m.phone
                        ? String(m.phone)
                        : role === 'owner'
                            ? 'Organization owner'
                            : role === 'field_worker'
                                ? 'Field worker'
                                : `Team member · ${userId.slice(0, 6)}`;
            }
            setMemberNames(names);
        }).catch(() => { /* names stay as fallbacks */ });
    }, [env.NEXT_PUBLIC_VC_REPO]);

    const fetchJobs = useCallback(async () => {
        setLoading(true);
        try {
            const credoBackend = env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000';

            const contextMode = localStorage.getItem('credoContextMode') === 'org' ? 'org' : 'personal';
            const preferredToken = getPreferredTenantToken();
            const walletToken = localStorage.getItem('walletToken');
            const orgToken = localStorage.getItem('credoOrgToken');

            const orderedCandidates = contextMode === 'org'
                ? [
                    { token: orgToken, context: 'org' as const },
                    { token: preferredToken, context: 'org' as const },
                    { token: walletToken, context: 'personal' as const },
                ]
                : [
                    { token: walletToken, context: 'personal' as const },
                    { token: preferredToken, context: 'personal' as const },
                    { token: orgToken, context: 'org' as const },
                ];

            const candidates = orderedCandidates.filter((entry, index, list) => {
                if (!entry.token) return false;
                return list.findIndex((candidate) => candidate.token === entry.token) === index;
            });

            if (candidates.length === 0) {
                setJobs([]);
                return;
            }

            const responses = await Promise.all(candidates.map(async ({ token, context }) => {
                try {
                    const res = await axios.get(`${credoBackend}/workflows/runs?limit=50`, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    const rows = Array.isArray(res.data) ? res.data : [];
                    return rows.map((row: any) => ({
                        ...row,
                        authToken: token,
                        authContext: context,
                    }));
                } catch {
                    return [];
                }
            }));

            const mergedRows = responses.flat();
            const byRunId = new Map<string, any>();
            for (const row of mergedRows) {
                const runId = String(row.id || '').trim();
                if (!runId || byRunId.has(runId)) continue;
                byRunId.set(runId, row);
            }

            const dedupedRows = Array.from(byRunId.values());
            const feJobs = dedupedRows.filter((job: any) => {
                const workflowId = String(job.workflowId || job.workflow_id || '').toLowerCase();
                const output = job.output || {};
                const stage = String(output.workflowStage || output.stage || '').toUpperCase();
                return workflowId.includes('field') || workflowId.includes('fept') || FEPT_STAGES.has(stage);
            });

            setJobs(feJobs);
            // Keep the open drawer in step with the refreshed list so actions show their result immediately.
            setSelectedJob((current) => {
                if (!current) return current;
                const fresh = feJobs.find((job: any) => String(job.id) === String(current.id));
                return fresh || current;
            });
        } catch (err) {
            console.error('Failed to fetch job cards:', err);
        } finally {
            setLoading(false);
        }
    }, [env.NEXT_PUBLIC_VC_REPO]);

    useEffect(() => {
        fetchJobs();
    }, [fetchJobs]);

    // `/finance/job-cards?runId=…` opens that job straight away (inbox and finance links land here).
    const router = useRouter();
    useEffect(() => {
        if (!router.isReady) return;
        const runId = String(router.query.runId || '').trim();
        if (!runId || jobs.length === 0) return;
        const match = jobs.find((job) => String(job.id) === runId);
        if (match) setSelectedJob((current) => (current && String(current.id) === runId ? current : match));
    }, [router.isReady, router.query.runId, jobs]);

    const filteredJobs = jobs.filter(j =>
        statusFilter === 'all' ||
        j.status === statusFilter ||
        (String(j.output?.workflowStage || '').toLowerCase() === statusFilter)
    );

    return (
        <Box>
            <Group justify="space-between" mb="lg">
                <div>
                    <Title order={2} style={{ color: BRAND.dark }}>Job Cards</Title>
                    <Text size="sm" c="dimmed">Create field jobs, follow progress, sign off and release payment</Text>
                </div>
                <Group>
                    <Select
                        placeholder="Filter by status"
                        value={statusFilter}
                        onChange={setStatusFilter}
                        data={[
                            { value: 'all', label: 'All jobs' },
                            { value: 'pending', label: 'Pending' },
                            { value: 'assigned', label: 'Assigned' },
                            { value: 'paused', label: 'In progress' },
                            { value: 'completed', label: 'Completed' },
                            { value: 'reconciled', label: 'Closed' },
                        ]}
                    />
                    <ActionIcon variant="light" size="lg" onClick={fetchJobs} loading={loading}>
                        <IconRefresh size={18} />
                    </ActionIcon>
                    {canCreate && (
                        <Button leftSection={<IconPlus size={16} />} style={{ backgroundColor: BRAND.curious }} onClick={() => setShowNewJob(true)}>
                            New job
                        </Button>
                    )}
                </Group>
            </Group>

            <NewJobModal
                opened={showNewJob}
                onClose={() => setShowNewJob(false)}
                onCreated={() => setTimeout(fetchJobs, 800)}
            />

            <Grid>
                {filteredJobs.map(job => {
                    const state = job.output || {};
                    const input = state.workflowInput || job.input || {};
                    const title = input.poNumber || `Job: ${job.id.substring(0, 8)}`;
                    const client = input.clientName || 'Unknown Client';
                    const location = input.location || 'Pending Location';
                    const assigneeId = String(state.assignment?.assigneeId || state.assigneeId || input.assigneeId || '');
                    const assignee = assigneeId
                        ? memberNames[assigneeId] || `Team member · ${assigneeId.slice(0, 6)}`
                        : 'Nobody yet';

                    return (
                        <Grid.Col key={job.id} span={{ base: 12, md: 6, lg: 4 }}>
                            <Card shadow="sm" padding="lg" radius="md" withBorder>
                                <Group justify="space-between" mb="xs">
                                    <Group gap="xs">
                                        <div style={{ backgroundColor: BRAND.curious, color: 'white', padding: '6px', borderRadius: '50%' }}>
                                            <IconBriefcase size={16} />
                                        </div>
                                        <div>
                                            <Text fw={600} size="md" style={{ color: BRAND.dark }}>{title}</Text>
                                            <Text size="xs" c="dimmed">{client}</Text>
                                        </div>
                                    </Group>
                                    <Badge color={getStatusColor(job.status, state.workflowStage)} variant="light">
                                        {getStatusLabel(job.status, state.workflowStage, String(state.pauseReason || '').toLowerCase())}
                                    </Badge>
                                </Group>

                                <Divider my="sm" />

                                <Stack gap="xs" mb="lg">
                                    <Text size="sm" lineClamp={2}>{input.description || 'No description provided'}</Text>

                                    <Group gap={6} mt="xs">
                                        <IconMapPin size={14} color={BRAND.viking} />
                                        <Text size="xs" c="dimmed">{location}</Text>
                                    </Group>

                                    <Group gap={6}>
                                        <IconUser size={14} color={BRAND.viking} />
                                        <Text size="xs" c="dimmed">Assigned to: {assignee}</Text>
                                    </Group>

                                    <Group gap={6}>
                                        <IconCalendar size={14} color={BRAND.viking} />
                                        <Text size="xs" c="dimmed">Scheduled: {input.scheduledDate || new Date(job.created_at || (job as any).createdAt || Date.now()).toLocaleDateString()}</Text>
                                    </Group>
                                </Stack>

                                <Group grow>
                                    <Button
                                        variant="outline"
                                        color={BRAND.curious}
                                        leftSection={<IconEye size={16} />}
                                        onClick={() => setSelectedJob(job)}
                                    >
                                        View details
                                    </Button>
                                </Group>
                            </Card>
                        </Grid.Col>
                    );
                })}

                {!loading && filteredJobs.length === 0 && (
                    <Grid.Col span={12}>
                        <Paper p="xl" radius="md" withBorder ta="center" style={{ backgroundColor: '#f8fafc' }}>
                            <Text c="dimmed">No jobs here yet.{canCreate ? ' Use “New job” to create one.' : ''}</Text>
                        </Paper>
                    </Grid.Col>
                )}
            </Grid>

            {selectedJob && (
                <JobCardDetail
                    job={selectedJob}
                    opened={!!selectedJob}
                    onClose={() => setSelectedJob(null)}
                    onRefresh={fetchJobs}
                />
            )}
        </Box>
    );
}
