import React, { useState, useEffect, useCallback, useContext, useRef } from 'react';
import axios from 'axios';
import { notifications } from '@mantine/notifications';
import { useRouter } from 'next/router';
import {
    Title, Text, Group, Paper, Button, ActionIcon, Box
} from '@mantine/core';
import { IconRefresh, IconPlus } from '@tabler/icons-react';
import { BRAND } from '@/lib/theme';
import JobCardDetail from './JobCardDetail';
import NewJobModal from './NewJobModal';
import { EnvContext } from '@/pages/_app';
import { getPreferredTenantToken } from '@/utils/portalTenant';
import { readActiveOrganization } from '@/utils/organizationContext';
import { endPortalTask, getPortalTask } from '@/lib/portalContext';
import { usePortalOperations } from '@/lib/operations';
import { IncomingJobs } from '../../../shared/operations/IncomingJobs';
import { JobAttention } from '../../../shared/operations/JobAttention';
import { JobBoard } from '../../../shared/operations/JobBoard';

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
    const [selectedJob, setSelectedJob] = useState<JobCard | null>(null);
    const [showNewJob, setShowNewJob] = useState(false);
    const [canCreate, setCanCreate] = useState(false);
    const [memberNames, setMemberNames] = useState<Record<string, string>>({});
    const [teamMembers, setTeamMembers] = useState<Array<{ userId: string; role: string; displayName?: string; phone?: string; status?: string }>>([]);
    const { api: operations, notify } = usePortalOperations();

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
            setTeamMembers(rows.filter((m: any) => m?.userId).map((m: any) => ({
                userId: String(m.userId),
                role: String(m.role || 'member'),
                displayName: m.displayName ? String(m.displayName) : undefined,
                phone: m.phone ? String(m.phone) : undefined,
                status: m.status ? String(m.status) : undefined,
            })));
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

    const router = useRouter();
    const openedFromQuery = useRef<string | null>(null);

    // A stuck job may be older than the 50 runs on the board: load it by itself when it is not there.
    const openJobById = async (runId: string) => {
        const loaded = jobs.find((job) => String(job.id) === runId);
        if (loaded) {
            setSelectedJob(loaded);
            return;
        }
        const token = localStorage.getItem('credoOrgToken') || getPreferredTenantToken();
        if (!token) return;
        try {
            const credoBackend = env.NEXT_PUBLIC_VC_REPO || 'http://localhost:3000';
            const res = await axios.get(`${credoBackend}/workflows/runs/${encodeURIComponent(runId)}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setSelectedJob({ ...res.data, authToken: token, authContext: 'org' });
        } catch {
            notify('That job could not be opened. Refresh the list and try again.', 'error');
        }
    };

    // `/finance/job-cards?runId=…` opens that job. If it is older than the loaded board, fetch it.
    useEffect(() => {
        if (!router.isReady || loading) return;
        const runId = String(router.query.runId || '').trim();
        if (!runId) return;
        const match = jobs.find((job) => String(job.id) === runId);
        if (match) {
            setSelectedJob((current) => (current && String(current.id) === runId ? current : match));
            return;
        }
        if (openedFromQuery.current === runId) return;
        openedFromQuery.current = runId;
        void openJobById(runId);
    }, [router.isReady, router.query.runId, jobs, loading]);

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

            <Paper withBorder radius="md" p="md" mb="md">
                <Title order={4} fw={500} mb="xs">Needs attention</Title>
                <JobAttention
                    api={operations}
                    surface="portal"
                    members={teamMembers}
                    notify={notify}
                    refreshKey={jobs.length}
                    onOpenJob={(runId) => void openJobById(runId)}
                />
            </Paper>

            {canCreate && (
                <Paper withBorder radius="md" p="md" mb="md">
                    <Title order={4} fw={500} mb="xs">Jobs mailbox</Title>
                    <IncomingJobs
                        api={operations}
                        surface="portal"
                        members={teamMembers}
                        notify={notify}
                        mailboxOnly
                        onStarted={() => setTimeout(fetchJobs, 800)}
                    />
                </Paper>
            )}

            <JobBoard
                api={operations}
                surface="portal"
                names={memberNames}
                members={teamMembers}
                canBook={canCreate}
                canExport={canCreate}
                notify={notify}
                refreshKey={jobs.length}
                onOpenJob={(runId) => void openJobById(runId)}
            />

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
