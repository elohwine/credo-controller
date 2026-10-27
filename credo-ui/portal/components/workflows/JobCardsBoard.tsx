import React, { useState, useEffect, useCallback, useContext } from 'react';
import axios from 'axios';
import { notifications } from '@mantine/notifications';
import { useRouter } from 'next/router';
import {
    Title, Text, Group, Paper, Badge, Button,
    Stack, Select, Grid, Card, ActionIcon, Box, Divider, SegmentedControl, Table
} from '@mantine/core';
import { IconBriefcase, IconMapPin, IconCalendar, IconUser, IconEye, IconRefresh, IconPlus } from '@tabler/icons-react';
import { BRAND } from '@/lib/theme';
import JobCardDetail from './JobCardDetail';
import NewJobModal from './NewJobModal';
import { EnvContext } from '@/pages/_app';
import { getPreferredTenantToken } from '@/utils/portalTenant';
import { readActiveOrganization } from '@/utils/organizationContext';
import { jobStatusColor as getStatusColor, jobStatusLabel as getStatusLabel } from '../finance/financeStages';
import { holdIsLive, jobHeading } from '../finance/jobAuditTrail';
import { endPortalTask, getPortalTask } from '@/lib/portalContext';

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

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

function jobInput(job: JobCard) {
    return job.output?.workflowInput || job.input || {}
}

function jobAssigneeId(job: JobCard): string {
    const state = job.output || {}
    const input = jobInput(job)
    return String(state.assignment?.assigneeId || state.assigneeId || input.assigneeId || '').trim()
}

function isUnassigned(job: JobCard): boolean {
    return !jobAssigneeId(job) && !['completed', 'cancelled'].includes(String(job.status).toLowerCase())
}

function isWaitingOverWeek(job: JobCard, now = Date.now()): boolean {
    if (jobCategory(job) !== 'pending') return false
    const createdAt = Date.parse(String(job.created_at || (job as any).createdAt || ''))
    return Number.isFinite(createdAt) && now - createdAt >= WEEK_MS
}

type JobCategory = 'pending' | 'assigned' | 'active' | 'on_hold' | 'failed' | 'completed' | 'reconciled' | 'cancelled'

function jobCategory(job: JobCard): JobCategory {
    const state = job.output || {}
    const status = String(job.status || '').toLowerCase()
    const stage = String(state.workflowStage || state.stage || '').toUpperCase()
    const pauseReason = String(state.pauseReason || '').toLowerCase()

    if (status === 'failed' || stage === 'DISPUTED') return 'failed'
    if (status === 'cancelled' || ['CANCELLED', 'REVOKED'].includes(stage)) return 'cancelled'
    if (stage === 'RECONCILED') return 'reconciled'
    if (status === 'completed' || stage === 'COMPLETED') return 'completed'
    if (
        pauseReason.startsWith('await_handoff:') ||
        (Array.isArray(state.checkpointBlocks) &&
            state.checkpointBlocks.some((hold: any) => hold?.checkpoint === 'risk_assessment' && holdIsLive(hold?.status)))
    ) return 'on_hold'
    if (isUnassigned(job)) return 'pending'
    if (stage === 'ASSIGNED') return 'assigned'
    if (['running', 'paused'].includes(status) || ['IN_PROGRESS', 'EVIDENCE_CAPTURED', 'ACKNOWLEDGED', 'PAYMENT_TRIGGERED', 'RECEIPT_ISSUED'].includes(stage)) {
        return 'active'
    }
    return 'pending'
}

function isArrived(job: JobCard): boolean {
    const output = job.output || {}
    const stage = String(output.workflowStage || output.stage || '').toUpperCase()
    return (
        stage === 'IN_PROGRESS' &&
        output.checkpoints?.arrival?.status === 'completed' &&
        !output.evidenceBefore?.evidenceHash
    )
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
    const [viewMode, setViewMode] = useState<'list' | 'cards'>('list');
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
            const task = getPortalTask();
            const taskRunId = task ? new URL(window.location.href).searchParams.get('runId') : null;

            const orderedCandidates = taskRunId
                ? [{ token: orgToken, context: 'org' as const }]
                : contextMode === 'org'
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
                    const res = await axios.get(taskRunId
                        ? `${credoBackend}/workflows/runs/${encodeURIComponent(taskRunId)}`
                        : `${credoBackend}/workflows/runs?limit=50`, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    const rows = taskRunId ? [res.data] : Array.isArray(res.data) ? res.data : [];
                    return rows.map((row: any) => ({
                        ...row,
                        authToken: token,
                        authContext: context,
                    }));
                } catch (error) {
                    if (taskRunId) throw error;
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
            notifications.show({ title: 'Could not load jobs', message: axios.isAxiosError(err)
                ? String(err.response?.data?.error || err.response?.data?.message || err.message)
                : 'The job could not be loaded. Try again.', color: 'red' });
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

    const filteredJobs = jobs.filter((job) => {
        if (statusFilter === 'all') return true
        if (statusFilter === 'waiting') return isWaitingOverWeek(job)
        if (statusFilter === 'pending') return jobCategory(job) === 'pending'
        return jobCategory(job) === statusFilter
    })
    const categoryCounts = jobs.reduce<Record<JobCategory, number>>((counts, job) => {
        counts[jobCategory(job)] += 1
        return counts
    }, { pending: 0, assigned: 0, active: 0, on_hold: 0, failed: 0, completed: 0, reconciled: 0, cancelled: 0 })
    const teamWorkload = jobs
        .filter((job) => job.authContext === 'org')
        .reduce<Record<string, { active: number; completed: number }>>((workload, job) => {
            const assigneeId = jobAssigneeId(job)
            if (!assigneeId) return workload
            const category = jobCategory(job)
            const memberWorkload = workload[assigneeId] || { active: 0, completed: 0 }
            if (['assigned', 'active', 'on_hold'].includes(category)) memberWorkload.active += 1
            if (['completed', 'reconciled'].includes(category)) memberWorkload.completed += 1
            workload[assigneeId] = memberWorkload
            return workload
        }, {})
    const workloadRows = Object.entries(teamWorkload).sort((a, b) => b[1].active - a[1].active || a[0].localeCompare(b[0]))
    const [inboxTask, setInboxTask] = useState(false);
    useEffect(() => { setInboxTask(Boolean(getPortalTask())); }, [router.asPath]);

    return (
        <Box>
            <Box style={inboxTask ? { display: 'none' } : undefined}>
            <Group justify="space-between" mb="lg">
                <div>
                    <Title order={2} style={{ color: BRAND.dark }}>Jobs</Title>
                    <Text size="sm" c="dimmed">Create field jobs, follow progress, sign off and release payment</Text>
                </div>
                <Group>
                    <Select
                        placeholder="Filter by status"
                        value={statusFilter}
                        onChange={setStatusFilter}
                        data={[
                            { value: 'all', label: 'All jobs' },
                            { value: 'pending', label: 'Pending / unassigned' },
                            { value: 'waiting', label: 'Waiting over a week' },
                            { value: 'assigned', label: 'Assigned' },
                            { value: 'active', label: 'In progress' },
                            { value: 'on_hold', label: 'On hold' },
                            { value: 'failed', label: 'Needs attention' },
                            { value: 'completed', label: 'Completed' },
                            { value: 'reconciled', label: 'Closed' },
                        ]}
                    />
                    <SegmentedControl
                        aria-label="Job list display"
                        value={viewMode}
                        onChange={(value) => setViewMode(value as 'list' | 'cards')}
                        data={[
                            { label: 'List', value: 'list' },
                            { label: 'Cards', value: 'cards' },
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

            <Grid mb="md">
                {[
                    { label: 'Pending / unassigned', count: categoryCounts.pending, color: 'gray', filter: 'pending' },
                    { label: 'Assigned', count: categoryCounts.assigned, color: 'indigo', filter: 'assigned' },
                    { label: 'In progress', count: categoryCounts.active, color: 'blue', filter: 'active' },
                    { label: 'On hold', count: categoryCounts.on_hold, color: 'orange', filter: 'on_hold' },
                    { label: 'Needs attention', count: categoryCounts.failed, color: 'red', filter: 'failed' },
                    { label: 'Completed', count: categoryCounts.completed, color: 'teal', filter: 'completed' },
                    { label: 'Closed', count: categoryCounts.reconciled, color: 'green', filter: 'reconciled' },
                ].map((item) => (
                    <Grid.Col key={item.filter} span={{ base: 6, sm: 4, lg: 3 }}>
                        <Paper
                            p="sm"
                            withBorder
                            role="button"
                            tabIndex={0}
                            aria-label={`${item.label}: ${item.count} jobs. Filter jobs.`}
                            onClick={() => setStatusFilter(item.filter)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault()
                                    setStatusFilter(item.filter)
                                }
                            }}
                            style={{ cursor: 'pointer' }}
                        >
                            <Text size="xs" c="dimmed">{item.label}</Text>
                            <Text size="xl" fw={700} c={item.color}>{item.count}</Text>
                        </Paper>
                    </Grid.Col>
                ))}
            </Grid>

            {workloadRows.length > 0 && (
                <Paper p="md" mb="md" withBorder>
                    <Group justify="space-between" mb="sm">
                        <Text fw={600}>Team workload</Text>
                        <Text size="xs" c="dimmed">Based on jobs currently loaded on this board</Text>
                    </Group>
                    <Table.ScrollContainer minWidth={420}>
                        <Table striped>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Team member</Table.Th>
                                    <Table.Th>Active jobs</Table.Th>
                                    <Table.Th>Completed</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {workloadRows.map(([userId, workload]) => (
                                    <Table.Tr key={userId}>
                                        <Table.Td>{memberNames[userId] || `Team member · ${userId.slice(0, 6)}`}</Table.Td>
                                        <Table.Td>{workload.active}</Table.Td>
                                        <Table.Td>{workload.completed}</Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                </Paper>
            )}

            {viewMode === 'list' ? (
                <Table.ScrollContainer minWidth={900}>
                    <Table striped highlightOnHover withTableBorder>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>Job / PO</Table.Th>
                                <Table.Th>Client</Table.Th>
                                <Table.Th>Description</Table.Th>
                                <Table.Th>Location</Table.Th>
                                <Table.Th>Assigned to</Table.Th>
                                <Table.Th>Scheduled</Table.Th>
                                <Table.Th>Status</Table.Th>
                                <Table.Th>Action</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {filteredJobs.map((job) => {
                                const state = job.output || {}
                                const input = jobInput(job)
                                const overdue = isWaitingOverWeek(job)
                                const arrived = isArrived(job)
                                const assigneeId = jobAssigneeId(job)
                                return (
                                    <Table.Tr
                                        key={job.id}
                                        style={overdue
                                            ? { backgroundColor: 'var(--mantine-color-grape-0)', borderLeft: '4px solid var(--mantine-color-grape-6)' }
                                            : undefined}
                                    >
                                        <Table.Td>
                                            <Text size="sm" fw={600}>{input.reference || job.id}</Text>
                                            <Text size="xs" c="dimmed">{input.poNumber ? `PO ${input.poNumber}` : 'No client PO'}</Text>
                                        </Table.Td>
                                        <Table.Td>{input.clientName || 'Unknown client'}</Table.Td>
                                        <Table.Td>{input.description || '—'}</Table.Td>
                                        <Table.Td>{input.location || '—'}</Table.Td>
                                        <Table.Td>
                                            {assigneeId ? memberNames[assigneeId] || `Team member · ${assigneeId.slice(0, 6)}` : 'Nobody yet'}
                                        </Table.Td>
                                        <Table.Td>{input.scheduledDate || '—'}</Table.Td>
                                        <Table.Td>
                                            <Badge
                                                color={overdue ? 'grape' : arrived ? 'teal' : getStatusColor(job.status, state.workflowStage)}
                                                variant="light"
                                            >
                                                {overdue
                                                    ? 'Waiting over a week'
                                                    : arrived
                                                        ? 'Arrived on site'
                                                        : getStatusLabel(job.status, state.workflowStage, String(state.pauseReason || '').toLowerCase())}
                                            </Badge>
                                        </Table.Td>
                                        <Table.Td>
                                            <Button size="xs" variant="light" onClick={() => setSelectedJob(job)}>View details</Button>
                                        </Table.Td>
                                    </Table.Tr>
                                )
                            })}
                        </Table.Tbody>
                    </Table>
                </Table.ScrollContainer>
            ) : (
            <Grid>
                {filteredJobs.map(job => {
                    const state = job.output || {};
                    const input = jobInput(job);
                    const heading = jobHeading(input);
                    const client = input.clientName || 'Unknown Client';
                    const location = input.location || 'Pending Location';
                    const assigneeId = jobAssigneeId(job);
                    const assignee = assigneeId
                        ? memberNames[assigneeId] || `Team member · ${assigneeId.slice(0, 6)}`
                        : 'Nobody yet';
                    const overdue = isWaitingOverWeek(job);
                    const arrived = isArrived(job);

                    return (
                        <Grid.Col key={job.id} span={{ base: 12, md: 6, lg: 4 }}>
                            <Card
                                shadow="sm"
                                padding="lg"
                                radius="md"
                                withBorder
                                style={overdue
                                    ? { backgroundColor: 'var(--mantine-color-grape-0)', borderLeft: '4px solid var(--mantine-color-grape-6)' }
                                    : undefined}
                            >
                                <Group justify="space-between" mb="xs">
                                    <Group gap="xs">
                                        <div style={{ backgroundColor: BRAND.curious, color: 'white', padding: '6px', borderRadius: '50%' }}>
                                            <IconBriefcase size={16} />
                                        </div>
                                        <div>
                                            <Text fw={600} size="md" style={{ color: BRAND.dark }} lineClamp={2}>{heading.title}</Text>
                                            <Text size="xs" c="dimmed">{[client, input.poNumber, input.reference].filter(Boolean).join(' · ')}</Text>
                                        </div>
                                    </Group>
                                    <Badge color={overdue ? 'grape' : arrived ? 'teal' : getStatusColor(job.status, state.workflowStage)} variant="light">
                                        {overdue
                                            ? 'Waiting over a week'
                                            : arrived
                                                ? 'Arrived on site'
                                                : getStatusLabel(job.status, state.workflowStage, String(state.pauseReason || '').toLowerCase())}
                                    </Badge>
                                </Group>

                                <Divider my="sm" />

                                <Stack gap="xs" mb="lg">
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

            </Grid>
            )}
            {!loading && filteredJobs.length === 0 && (
                <Paper p="xl" mt="md" radius="md" withBorder ta="center" style={{ backgroundColor: '#f8fafc' }}>
                    <Text c="dimmed">No jobs here yet.{canCreate ? ' Use “New job” to create one.' : ''}</Text>
                </Paper>
            )}
            </Box>

            {selectedJob && (
                <JobCardDetail
                    job={selectedJob}
                    opened={!!selectedJob}
                    onClose={() => {
                        if (getPortalTask()) {
                            endPortalTask();
                            void router.replace('/inbox');
                        } else setSelectedJob(null);
                    }}
                    onRefresh={fetchJobs}
                    initialTab={String(router.query.stage || '') === 'receipts' ? 'receipts' : 'details'}
                />
            )}
        </Box>
    );
}
