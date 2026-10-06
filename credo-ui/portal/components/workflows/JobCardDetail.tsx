import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
    Drawer, Tabs, Stack, Group, Text, Divider, Button,
    ThemeIcon, Grid, Card, Center, Image, Badge, List, Select, Textarea, Alert
} from '@mantine/core';
import {
    IconFileText, IconPhoto, IconReceipt2, IconFiles, IconHistory,
    IconCheck, IconMapPin, IconCalendar, IconUser, IconCash, IconWallet
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { BRAND } from '@/lib/theme';
import { getPreferredTenantToken } from '@/utils/portalTenant';
import { getOrgScopedToken, readActiveOrganization } from '@/utils/organizationContext';
import { StageActorTimeline } from '@/components/finance/StageActorTimeline';
import { actorsForWorkflow, feptStages, plainStepName, type WorkflowActorReport } from '@/components/finance/financeStages';
import StageProofModal from './StageProofModal';
import JobHandoffsPanel from './JobHandoffsPanel';
import JobAuditTrailPanel from './JobAuditTrailPanel';
import { buildJobAuditTrail } from '@/components/finance/jobAuditTrail';
import { jobStatusColor as getStatusColor, jobStatusLabel as getStatusLabel } from '../finance/financeStages';

type ProofStage = 'acknowledgement' | 'payout';

const PROOF_COPY: Record<ProofStage, { title: string; description: string }> = {
    acknowledgement: {
        title: 'Sign off this job',
        description: 'Review what your wallet will share, then confirm you are the person chosen to sign off. The completion record is issued after that.',
    },
    payout: {
        title: 'Release payment',
        description: 'Review what your wallet will share, then confirm you are the person chosen to release payment for this job.',
    },
};

/** Records issued by this job, in plain words. */
const RECORD_LABEL: Record<string, string> = {
    RequisitionVC: 'Job card (sent to the worker)',
    ReceiptVC: 'Material receipt record',
    ExecutionAckVC: 'Completion record',
    InvoiceVC: 'Invoice',
    PaymentReceiptVC: 'Payment receipt',
};

interface JobCardDetailProps {
    job: any;
    opened: boolean;
    onClose: () => void;
    onRefresh: () => void;
}

export default function JobCardDetail({ job, opened, onClose, onRefresh }: JobCardDetailProps) {
    const [submitting, setSubmitting] = useState(false);
    const [reassigning, setReassigning] = useState(false);
    const [nextAssignee, setNextAssignee] = useState<string | null>(null);
    const [members, setMembers] = useState<Array<{ userId: string; role: string; displayName?: string; phone?: string }>>([]);
    const [contacts, setContacts] = useState<Array<{ name: string; phone?: string }>>([]);
    const [actorReports, setActorReports] = useState<WorkflowActorReport[]>([]);
    const [actionError, setActionError] = useState<string | null>(null);
    const [inspectionOutcome, setInspectionOutcome] = useState<string | null>('passed');
    const [inspectionFindings, setInspectionFindings] = useState('');
    const [reviewOutcome, setReviewOutcome] = useState<string | null>('approved');
    const [reviewNotes, setReviewNotes] = useState('');
    const [proofStage, setProofStage] = useState<ProofStage | null>(null);
    const [proofRequest, setProofRequest] = useState<{ requestId: string; presentationRequestUrl: string } | null>(null);
    const [proofCreating, setProofCreating] = useState(false);
    const [proofError, setProofError] = useState<string | null>(null);
    // True while the job waits on related work (a purchase or quote); step buttons are disabled.
    const [held, setHeld] = useState(false);

    useEffect(() => {
        const org = readActiveOrganization();
        const token = getOrgScopedToken();
        const backend = ((window as any).__ENV?.NEXT_PUBLIC_VC_REPO as string) || 'http://localhost:3000';
        if (!org?.orgTenantId || !token) return;
        axios.get(`${backend}/api/organizations/${encodeURIComponent(org.orgTenantId)}/workflows/actors`, {
            headers: { Authorization: `Bearer ${token}` },
        }).then((res) => {
            setActorReports(Array.isArray(res.data?.workflows) ? res.data.workflows : []);
        }).catch(() => setActorReports([]));
        axios.get(`${backend}/api/organizations/${encodeURIComponent(org.orgTenantId)}/members`, {
            headers: { Authorization: `Bearer ${token}` },
        }).then((res) => {
            const rows = Array.isArray(res.data) ? res.data : [];
            setMembers(rows.filter((member: any) => member?.status !== 'inactive' && member?.userId).map((member: any) => ({
                userId: String(member.userId),
                role: String(member.role || 'member'),
                displayName: member.displayName ? String(member.displayName) : undefined,
                phone: member.phone ? String(member.phone) : undefined,
            })));
        }).catch(() => setMembers([]));
        axios.get(`${backend}/api/contacts`, {
            params: { contactScope: 'internal' },
            headers: { Authorization: `Bearer ${token}` },
        }).then((res) => {
            const rows = Array.isArray(res.data?.contacts) ? res.data.contacts : Array.isArray(res.data) ? res.data : [];
            setContacts(rows.filter((contact: any) => contact?.phone).map((contact: any) => ({
                name: String(contact.name || 'Contact'),
                phone: String(contact.phone),
            })));
        }).catch(() => setContacts([]));
    }, []);

    const activeOrgRole = String(readActiveOrganization()?.role || '').toLowerCase();
    // Only organization owners and admins can move a job to another worker.
    const canReassign = ['owner', 'admin'].includes(activeOrgRole);

    const state = job?.output || {};
    const input = state.workflowInput || job?.input || {};

    const assigneeId = String(state?.assignment?.assigneeId || state?.assigneeId || input.assigneeId || '');
    const assigneeName = (() => {
        if (!assigneeId) return undefined;
        const member = members.find((m) => m.userId === assigneeId);
        if (!member) return undefined;
        const name = String(member.displayName || '').trim();
        if (name && !/^(organization owner|team member)$/i.test(name)) return name;
        if (member.phone) return member.phone;
        const role = String(member.role || '').toLowerCase();
        if (role === 'owner') return 'Organization owner';
        if (role === 'field_worker') return 'Field worker';
        return undefined;
    })();

    const pauseReason = String(state?.pauseReason || '').toLowerCase();
    const waitingFor: Record<string, string> = {
        await_site_inspection: 'Site inspection before the job can start',
        await_risk_assessment: 'The worker’s safety check before starting',
        await_worker_start: 'The worker to start the job',
        await_arrival: 'The worker to confirm arrival (location or site code)',
        await_evidence_before: 'Before photos from the worker',
        await_evidence_after: 'The worker to finish and take after photos',
        await_evidence_receipt: 'Receipts from the worker',
        await_completion_review: 'A review of the finished work',
        await_acknowledgement: 'Sign-off from the sign-off person (confirmed from their wallet)',
        await_payout_release: 'Payment release from the payout person (confirmed from their wallet)',
    };

    const issuedRecords: Array<{ type: string; label: string; recipientStage?: string; offerId?: string }> = Object.entries(
        (state?.issuedCredentials && typeof state.issuedCredentials === 'object' ? state.issuedCredentials : {}) as Record<string, any>,
    ).map(([type, info]) => ({
        type,
        label: RECORD_LABEL[type] || type.replace(/VC$/, '').replace(/([a-z])([A-Z])/g, '$1 $2'),
        recipientStage: plainStepName(info?.recipientStage),
        offerId: info?.offerId ? String(info.offerId) : undefined,
    }));

    const resumeWithOrgToken = async (payload: Record<string, unknown>) => {
        setActionError(null);
        const credoBackend = ((window as any).__ENV?.NEXT_PUBLIC_VC_REPO as string) || 'http://localhost:3000';
        const token = getOrgScopedToken() || getPreferredTenantToken();
        if (!token) throw new Error('Switch to the organization before recording this step');
        try {
            await axios.post(`${credoBackend}/workflows/runs/${job.id}/resume`, payload, {
                headers: { Authorization: `Bearer ${token}` },
            });
        } catch (error: any) {
            const message = error?.response?.data?.error || error?.message || 'Step could not be recorded';
            setActionError(String(message));
            throw error;
        }
    };

    // A job that stopped on an error (for example a message that could not be sent) can be run again
    // from the step that failed. Steps already done are not repeated.
    const handleRetry = async () => {
        setSubmitting(true);
        setActionError(null);
        const credoBackend = ((window as any).__ENV?.NEXT_PUBLIC_VC_REPO as string) || 'http://localhost:3000';
        const token = getOrgScopedToken() || getPreferredTenantToken();
        if (!token) { setSubmitting(false); return; }
        try {
            const { data } = await axios.post(`${credoBackend}/workflows/runs/${job.id}/retry`, {}, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (data?.error) throw new Error(String(data.error));
            notifications.show({ title: 'Job resumed', message: 'The job carried on from where it stopped.', color: 'teal' });
        } catch (error: any) {
            setActionError(String(error?.response?.data?.error || error?.message || 'The job could not be resumed.'));
        } finally {
            onRefresh();
            setSubmitting(false);
        }
    };

    const handleSiteInspection = async () => {
        if (!inspectionOutcome) return;
        setSubmitting(true);
        try {
            await resumeWithOrgToken({
                siteInspection: {
                    outcome: inspectionOutcome,
                    accessConfirmed: inspectionOutcome !== 'failed',
                    findings: inspectionFindings,
                },
            });
            setInspectionFindings('');
            onRefresh();
        } catch {
            onRefresh();
        } finally {
            setSubmitting(false);
        }
    };

    const handleCompletionReview = async () => {
        if (!reviewOutcome) return;
        setSubmitting(true);
        try {
            await resumeWithOrgToken({ completionReview: { outcome: reviewOutcome, notes: reviewNotes } });
            setReviewNotes('');
        } catch {
            // The message is shown in the card; refresh so a held review is visible.
        } finally {
            onRefresh();
            setSubmitting(false);
        }
    };

    // Sign-off and payout: prove from the wallet first, then the server moves the job.
    const openProof = async (stage: ProofStage) => {
        const credoBackend = ((window as any).__ENV?.NEXT_PUBLIC_VC_REPO as string) || 'http://localhost:3000';
        const token = getOrgScopedToken() || getPreferredTenantToken();
        if (!token) {
            notifications.show({ title: 'Switch to the organization', message: 'This step is done as the organization.', color: 'orange' });
            return;
        }
        setProofStage(stage);
        setProofRequest(null);
        setProofError(null);
        setProofCreating(true);
        try {
            const { data } = await axios.post(`${credoBackend}/workflows/runs/${job.id}/proof/request`, { stage }, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (data?.error) throw new Error(String(data.error));
            setProofRequest({ requestId: String(data.requestId), presentationRequestUrl: String(data.presentationRequestUrl) });
        } catch (error: any) {
            setProofError(String(error?.response?.data?.error || error?.message || 'This step could not be prepared.'));
        } finally {
            setProofCreating(false);
        }
    };

    const handleReassign = async () => {
        if (!job?.id || !nextAssignee) return;
        setReassigning(true);
        try {
            const credoBackend = ((window as any).__ENV?.NEXT_PUBLIC_VC_REPO as string) || 'http://localhost:3000';
            const token = getOrgScopedToken() || getPreferredTenantToken();
            if (!token) throw new Error('Switch to the organization before reassigning this job');
            let assigneeUserId = nextAssignee;
            if (nextAssignee.startsWith('contact:')) {
                const org = readActiveOrganization();
                if (!org?.orgTenantId) throw new Error('Switch to the organization before reassigning this job');
                const invited = await axios.post(
                    `${credoBackend}/api/organizations/${encodeURIComponent(org.orgTenantId)}/members/invite`,
                    { phone: nextAssignee.slice('contact:'.length), role: 'field_worker' },
                    { headers: { Authorization: `Bearer ${token}` } },
                );
                assigneeUserId = String(invited.data?.targetUserId || '');
                if (!assigneeUserId) throw new Error('That contact could not be added to the team.');
            }
            await axios.post(`${credoBackend}/workflows/runs/${job.id}/reassign`, {
                assigneeUserId,
            }, { headers: { Authorization: `Bearer ${token}` } });
            onRefresh();
        } catch (err) {
            console.error('Failed to reassign job:', err);
        } finally {
            setReassigning(false);
        }
    };

    // Each capture is its own sealed record: live photo, device location, device time and a
    // server-sealed time. Before and after are shown as a pair so a reviewer can compare them.
    const evidence: any[] = [];
    if (state?.evidenceBefore) evidence.push({ ...state.evidenceBefore, phase: 'before' });
    if (state?.evidenceAfter) evidence.push({ ...state.evidenceAfter, phase: 'after' });
    if (state?.evidenceReceipt) evidence.push({ ...state.evidenceReceipt, phase: 'receipt' });

    if (Array.isArray(state?.evidence)) {
        evidence.push(...state.evidence);
    } else if (state?.evidence && !state.evidenceBefore && !state.evidenceAfter && !state.evidenceReceipt) {
        // Older runs kept a single generic evidence object.
        evidence.push(state.evidence);
    }

    const receipts = Array.isArray(state?.receipts) ? state.receipts : [];

    const isReceiptEvidence = (e: any) => String(e?.type || e?.phase || '').toLowerCase() === 'receipt';
    const manualReceipts = evidence.filter(isReceiptEvidence);
    const photoEvidence = evidence.filter((e: any) => !isReceiptEvidence(e));
    const vcReceipts = receipts; // Digital receipts attached from supplier records
    const beforePhoto = photoEvidence.find((e: any) => String(e?.phase || '').toLowerCase() === 'before');
    const afterPhoto = photoEvidence.find((e: any) => String(e?.phase || '').toLowerCase() === 'after');
    const evidenceTime = (e: any) => e?.capturedAt || e?.deviceCapturedAt || e?.timestamp;
    const formatTime = (value?: string) => {
        if (!value) return undefined;
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? undefined : d.toLocaleString();
    };
    const minutesBetween = (a?: string, b?: string) => {
        if (!a || !b) return undefined;
        const ms = new Date(b).getTime() - new Date(a).getTime();
        if (Number.isNaN(ms) || ms < 0) return undefined;
        const mins = Math.round(ms / 60000);
        if (mins < 60) return `${mins} min`;
        const hours = Math.floor(mins / 60);
        return `${hours} h ${mins % 60} min`;
    };
    const workDuration = minutesBetween(evidenceTime(beforePhoto), evidenceTime(afterPhoto));
    const PHASE_LABEL: Record<string, string> = { before: 'Before work', after: 'After work', receipt: 'Receipt' };

    const attachmentThumbs = (ev: any): Array<{ src?: string; label: string }> => {
        const extras = Array.isArray(ev?.attachments) ? ev.attachments : [];
        return extras
            .map((item: any, index: number) => ({
                src: typeof item?.photoUri === 'string' ? item.photoUri : undefined,
                label: item?.label || `Photo ${index + 2}`,
            }))
            .filter((item: { src?: string }) => item.src);
    };

    const renderEvidenceCard = (ev: any, fallbackLabel: string) => (
        <Card withBorder radius="md" p={0}>
            {ev?.photoUri ? (
                <Image src={ev.photoUri} height={140} alt={fallbackLabel} fit="cover" />
            ) : (
                <Center h={140} bg="gray.1">
                    <Stack align="center" gap={4}>
                        <IconPhoto size={28} color="gray" />
                        <Text size="xs" c="dimmed">{ev ? 'Record kept without a photo' : 'Not taken yet'}</Text>
                    </Stack>
                </Center>
            )}
            {attachmentThumbs(ev).length > 0 && (
                <Group gap={6} px="sm" pt="sm">
                    {attachmentThumbs(ev).map((thumb, index) => (
                        <Image key={index} src={thumb.src} w={56} h={56} radius="sm" alt={thumb.label} fit="cover" />
                    ))}
                </Group>
            )}
            <Stack gap={4} p="md">
                <Group justify="space-between">
                    <Text size="sm" fw={600}>{PHASE_LABEL[String(ev?.phase || '').toLowerCase()] || fallbackLabel}</Text>
                    {ev?.evidenceHash && (
                        <Badge size="xs" color="green" variant="light">Sealed</Badge>
                    )}
                </Group>
                {ev && (
                    <>
                        <Text size="xs" c="dimmed">Taken: {formatTime(ev.deviceCapturedAt) || formatTime(ev.capturedAt) || 'time not recorded'}</Text>
                        {ev.capturedAt && ev.deviceCapturedAt && (
                            <Text size="xs" c="dimmed">Recorded by the system: {formatTime(ev.capturedAt)}</Text>
                        )}
                        <Text size="xs" c="dimmed">
                            {ev.gps?.lat != null
                                ? `Location: ${Number(ev.gps.lat).toFixed(5)}, ${Number(ev.gps.lng).toFixed(5)}`
                                : 'Location: not shared'}
                        </Text>
                        {ev.notes && <Text size="xs">{String(ev.notes)}</Text>}
                    </>
                )}
            </Stack>
        </Card>
    );

    const isAwaitingEvidence = job?.status === 'paused';
    const isCompleted = job?.status === 'completed' || state?.workflowStage === 'RECONCILED' || state?.workflowStage === 'ACKNOWLEDGED';

    return (
        <Drawer
            opened={opened}
            onClose={onClose}
            position="right"
            size="xl"
            title={
                <Group gap="md">
                    <Text fw={700} size="xl" style={{ color: BRAND.dark }}>
                        {input.poNumber || `Job: ${job?.id?.substring(0, 8)}`}
                    </Text>
                    <Badge color={isCompleted ? 'green' : getStatusColor(String(job?.status || ''), state?.workflowStage)}>
                        {getStatusLabel(String(job?.status || ''), state?.workflowStage, pauseReason)}
                    </Badge>
                </Group>
            }
            padding="xl"
        >
            <Tabs defaultValue="details" color={BRAND.curious}>
                <Tabs.List mb="md">
                    <Tabs.Tab value="details" leftSection={<IconFileText size={16} />}>Details</Tabs.Tab>
                    <Tabs.Tab value="photos" leftSection={<IconPhoto size={16} />}>Photos ({photoEvidence.length})</Tabs.Tab>
                    <Tabs.Tab value="receipts" leftSection={<IconReceipt2 size={16} />}>Receipts ({manualReceipts.length + vcReceipts.length})</Tabs.Tab>
                    <Tabs.Tab value="documents" leftSection={<IconFiles size={16} />}>Records ({issuedRecords.length})</Tabs.Tab>
                    <Tabs.Tab value="history" leftSection={<IconHistory size={16} />}>History</Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="history">
                    <JobAuditTrailPanel trail={buildJobAuditTrail(job, members)} />
                </Tabs.Panel>

                <Tabs.Panel value="details">
                    <Stack gap="lg">
                        <Card withBorder radius="md">
                            <Text fw={600} mb="xs">Progress</Text>
                            <StageActorTimeline
                                stages={feptStages(String(state?.workflowStage || state?.stage || job?.status || ''), state)}
                                actors={actorsForWorkflow(actorReports, ['field', 'fept'])}
                                people={members}
                                assigneeName={assigneeName}
                            />
                            {waitingFor[pauseReason] && job?.status === 'paused' && (
                                <Text size="sm" c="dimmed" mt="sm">Waiting for: {waitingFor[pauseReason]}</Text>
                            )}
                            {job?.status === 'failed' && (
                                <Alert color="red" variant="light" mt="sm" title="This job stopped on an error">
                                    <Text size="sm">{String(job?.error || 'Something went wrong on the last step.')}</Text>
                                    <Button size="xs" mt="sm" color="red" variant="light" loading={submitting} onClick={handleRetry}>
                                        Try again from where it stopped
                                    </Button>
                                </Alert>
                            )}
                        </Card>

                        {job?.id && (
                            <JobHandoffsPanel
                                runId={String(job.id)}
                                refreshKey={`${job?.status}:${pauseReason}:${String(job?.updatedAt || '')}`}
                                onChanged={onRefresh}
                                onHoldChange={setHeld}
                            />
                        )}

                        {/* Check status lives in the Progress timeline above; this card only adds what the timeline cannot show. */}
                        {(state?.checkpoints?.risk_assessment?.data?.hazards?.length > 0 || state?.checkpointBlocks?.length > 0) && (
                            <Card withBorder radius="md">
                                <Text fw={600} mb="xs">Safety notes and holds</Text>
                                <Stack gap={6}>
                                    {state?.checkpoints?.risk_assessment?.data?.hazards?.length > 0 && (
                                        <Text size="xs" c="dimmed">
                                            Hazards: {state.checkpoints.risk_assessment.data.hazards.join(', ')} · Controls: {state.checkpoints.risk_assessment.data.controls}
                                        </Text>
                                    )}
                                    {(state?.checkpointBlocks || []).slice(-2).map((block: any, idx: number) => {
                                        const cpStatus = String(state?.checkpoints?.[String(block.checkpoint || '')]?.status || '');
                                        const resolved = ['completed', 'waived'].includes(cpStatus);
                                        return (
                                            <Alert key={idx} color={resolved ? 'gray' : 'orange'} variant="light">
                                                {resolved ? 'Earlier hold (now cleared): ' : 'Job on hold: '}{block.reason}
                                            </Alert>
                                        );
                                    })}
                                </Stack>
                            </Card>
                        )}

                        {job?.status === 'paused' && pauseReason === 'await_site_inspection' && (
                            <Card withBorder radius="md">
                                <Text fw={600} mb="xs">Record site inspection</Text>
                                <Text size="xs" c="dimmed" mb="sm">
                                    Inspection happens before the job starts. A failed inspection keeps the job on hold.
                                </Text>
                                <Select
                                    label="Outcome"
                                    value={inspectionOutcome}
                                    onChange={setInspectionOutcome}
                                    data={[
                                        { value: 'passed', label: 'Passed' },
                                        { value: 'passed_with_notes', label: 'Passed with notes' },
                                        { value: 'failed', label: 'Failed - hold the job' },
                                    ]}
                                />
                                <Textarea mt="sm" label="Findings" value={inspectionFindings} onChange={(e) => setInspectionFindings(e.currentTarget.value)} />
                                <Button mt="sm" size="xs" loading={submitting} disabled={held} onClick={handleSiteInspection}>Record inspection</Button>
                            </Card>
                        )}

                        {job?.status === 'paused' && pauseReason === 'await_completion_review' && (
                            <Card withBorder radius="md">
                                <Text fw={600} mb="xs">Review the finished work</Text>
                                <Text size="xs" c="dimmed" mb="sm">
                                    Check the AFTER photos and receipts. Approve to release customer sign-off; ask for rework to hold the job.
                                </Text>
                                <Select
                                    label="Outcome"
                                    value={reviewOutcome}
                                    onChange={setReviewOutcome}
                                    data={[
                                        { value: 'approved', label: 'Approved' },
                                        { value: 'approved_with_notes', label: 'Approved with notes' },
                                        { value: 'rework_required', label: 'Rework required - hold the job' },
                                    ]}
                                />
                                <Textarea mt="sm" label="Notes" value={reviewNotes} onChange={(e) => setReviewNotes(e.currentTarget.value)} />
                                <Button mt="sm" size="xs" loading={submitting} disabled={held} onClick={handleCompletionReview}>Record review</Button>
                            </Card>
                        )}

                        {actionError && <Alert color="red" variant="light">{actionError}</Alert>}

                        {(state?.ack || state?.payment) && (
                            <Card withBorder radius="md">
                                <Text fw={600} mb="xs">Sign-off and payment</Text>
                                <Stack gap={6}>
                                    {state?.ack && (
                                        <Group justify="space-between">
                                            <Text size="sm">Signed off {state.ack.acknowledgedAt ? new Date(state.ack.acknowledgedAt).toLocaleString() : ''}</Text>
                                            <Badge size="sm" color={state.ack.isVerifiable ? 'green' : 'gray'}>
                                                {state.ack.isVerifiable ? 'Confirmed from wallet' : 'Recorded'}
                                            </Badge>
                                        </Group>
                                    )}
                                    {state?.payment && (
                                        <Group justify="space-between">
                                            <Text size="sm">
                                                Payment released {state.payment.amount ? `· ${state.payment.currency || ''} ${state.payment.amount}` : ''}
                                            </Text>
                                            <Badge size="sm" color={state.payment.isVerifiable ? 'green' : 'gray'}>
                                                {state.payment.isVerifiable ? 'Confirmed from wallet' : 'Recorded'}
                                            </Badge>
                                        </Group>
                                    )}
                                </Stack>
                            </Card>
                        )}

                        <Card withBorder radius="md">
                            <Text fw={600} mb="xs">Client</Text>
                            <Text size="sm" c="dimmed">Name</Text>
                            <Text size="md" mb="sm">{input.clientName || 'N/A'}</Text>

                            <Text size="sm" c="dimmed">Location</Text>
                            <Group gap="xs" mb="sm">
                                <IconMapPin size={16} color={BRAND.curious} />
                                <Text size="md">{input.location || 'N/A'}</Text>
                            </Group>
                        </Card>

                        <Card withBorder radius="md">
                            <Text fw={600} mb="xs">The work</Text>
                            <Text size="sm" c="dimmed">What needs doing</Text>
                            <Text size="md" mb="sm">{input.description || 'N/A'}</Text>

                            <Grid>
                                <Grid.Col span={6}>
                                    <Text size="sm" c="dimmed">Field worker</Text>
                                    <Group gap="xs">
                                        <IconUser size={16} color={BRAND.curious} />
                                        <Text size="md">
                                            {!assigneeId ? 'Nobody yet' : assigneeName || `Team member · ${assigneeId.slice(0, 6)}`}
                                        </Text>
                                    </Group>
                                    {job?.status === 'paused' && canReassign && (
                                        <Stack gap="xs" mt="sm">
                                            <Select
                                                label="Move this job to someone else"
                                                placeholder="Choose a member"
                                                value={nextAssignee}
                                                onChange={setNextAssignee}
                                                data={[
                                                    ...members.map((member) => {
                                                        const role = String(member.role || 'member').replace(/_/g, ' ');
                                                        const stored = String(member.displayName || '').trim();
                                                        const generic = !stored || /^(organization owner|team member)$/i.test(stored);
                                                        const who = !generic
                                                            ? stored
                                                            : member.phone
                                                                ? member.phone
                                                                : role === 'owner'
                                                                    ? 'Organization owner'
                                                                    : `Team member · ${member.userId.slice(0, 6)}`;
                                                        return { value: member.userId, label: `${who} (${role})` };
                                                    }),
                                                    ...contacts.map((contact) => ({
                                                        value: `contact:${contact.phone}`,
                                                        label: `${contact.name} (saved contact)`,
                                                    })),
                                                ]}
                                            />
                                            <Button size="xs" variant="light" loading={reassigning} disabled={!nextAssignee} onClick={handleReassign}>
                                                Move job
                                            </Button>
                                        </Stack>
                                    )}
                                </Grid.Col>
                                <Grid.Col span={6}>
                                    <Text size="sm" c="dimmed">Scheduled Date</Text>
                                    <Group gap="xs">
                                        <IconCalendar size={16} color={BRAND.curious} />
                                        <Text size="md">{input.scheduledDate || 'N/A'}</Text>
                                    </Group>
                                </Grid.Col>
                            </Grid>
                        </Card>
                    </Stack>
                </Tabs.Panel>

                <Tabs.Panel value="photos">
                    <Stack gap="md">
                        <Text size="xs" c="dimmed">
                            Photos are taken live on the worker’s phone, one step at a time: before any work, then after the work is finished.
                            Each photo is sealed with its time and location when it is taken.
                        </Text>
                        <Grid>
                            <Grid.Col span={6}>{renderEvidenceCard(beforePhoto, 'Before work')}</Grid.Col>
                            <Grid.Col span={6}>{renderEvidenceCard(afterPhoto, 'After work')}</Grid.Col>
                        </Grid>
                        {workDuration && (
                            <Text size="xs" c="dimmed">Time between the before and after photos: {workDuration}</Text>
                        )}
                        {photoEvidence.filter((e: any) => e !== beforePhoto && e !== afterPhoto).length > 0 && (
                            <Grid>
                                {photoEvidence.filter((e: any) => e !== beforePhoto && e !== afterPhoto).map((ev: any, idx: number) => (
                                    <Grid.Col span={6} key={idx}>{renderEvidenceCard(ev, 'Photo')}</Grid.Col>
                                ))}
                            </Grid>
                        )}
                    </Stack>
                </Tabs.Panel>

                <Tabs.Panel value="receipts">
                    <Stack gap="lg">
                        {/* SECTION 1: Trusted Supplier VCs */}
                        <Card withBorder radius="md">
                            <Group justify="space-between" mb="md">
                                <Text fw={600}>Digital receipts from suppliers</Text>
                                <Badge color="green" variant="light">Checked</Badge>
                            </Group>

                            {vcReceipts.length === 0 ? (
                                <Text size="sm" c="dimmed" fs="italic">No digital receipts from suppliers on this job yet.</Text>
                            ) : (
                                <List spacing="sm">
                                    {vcReceipts.map((vc: any, idx: number) => (
                                        <List.Item key={idx} icon={<ThemeIcon color="green" size={24} radius="xl"><IconCheck size={16} /></ThemeIcon>}>
                                            <Group justify="space-between" align="start">
                                                <div>
                                                    <Text size="sm" fw={500}>{vc.supplierName || 'Verified Supplier'}</Text>
                                                    <Text size="xs" c="dimmed">Supplier reference: {String(vc.issuerDID || '').slice(-8) || '—'}</Text>
                                                </div>
                                                <Text size="sm" fw={700}>${vc.amount}</Text>
                                            </Group>
                                        </List.Item>
                                    ))}
                                </List>
                            )}
                        </Card>

                        {/* SECTION 2: Manual Receipts */}
                        <Card withBorder radius="md">
                            <Text fw={600} mb="md">Receipt photos</Text>
                            <Grid>
                                {manualReceipts.map((ev: any, idx: number) => (
                                    <Grid.Col span={6} key={idx}>{renderEvidenceCard(ev, 'Receipt')}</Grid.Col>
                                ))}
                            </Grid>
                            {manualReceipts.length === 0 && (
                                <Text size="sm" c="dimmed" fs="italic">No receipt photos on this job yet.</Text>
                            )}
                        </Card>
                    </Stack>
                </Tabs.Panel>

                <Tabs.Panel value="documents">
                    <Card withBorder radius="md" p="md">
                        <Text fw={600} mb="xs">Records issued by this job</Text>
                        <Text size="xs" c="dimmed" mb="sm">
                            Each finished step issues a record to the person who did it. Records live in their wallet and can be checked later.
                        </Text>
                        {issuedRecords.length === 0 ? (
                            <Text size="sm" c="dimmed" fs="italic">No records issued yet. The job card is issued when a worker is assigned.</Text>
                        ) : (
                            <Stack gap={6}>
                                {issuedRecords.map((record) => (
                                    <Group key={record.type} justify="space-between">
                                        <Group gap="xs">
                                            <ThemeIcon size="sm" color="green" variant="light" radius="xl"><IconCheck size={12} /></ThemeIcon>
                                            <Text size="sm">{record.label}</Text>
                                        </Group>
                                        <Text size="xs" c="dimmed">{record.recipientStage ? `to: ${record.recipientStage}` : 'issued'}</Text>
                                    </Group>
                                ))}
                            </Stack>
                        )}
                    </Card>
                </Tabs.Panel>
            </Tabs>

            <Divider my="xl" />

            <Group justify="flex-end">
                <Button variant="default" onClick={onClose}>Close</Button>
                {job?.status === 'paused' && pauseReason === 'await_acknowledgement' && (
                    <Button
                        style={{ backgroundColor: BRAND.curious }}
                        leftSection={<IconWallet size={16} />}
                        onClick={() => openProof('acknowledgement')}
                        loading={proofCreating && proofStage === 'acknowledgement'}
                        disabled={held}
                    >
                        Sign off job
                    </Button>
                )}
                {job?.status === 'paused' && pauseReason === 'await_payout_release' && (
                    <Button
                        color="teal"
                        leftSection={<IconCash size={16} />}
                        onClick={() => openProof('payout')}
                        loading={proofCreating && proofStage === 'payout'}
                        disabled={held}
                    >
                        Release payment
                    </Button>
                )}
            </Group>

            {proofStage && (
                <StageProofModal
                    opened={Boolean(proofStage)}
                    onClose={() => { setProofStage(null); setProofRequest(null); setProofError(null); }}
                    title={PROOF_COPY[proofStage].title}
                    description={PROOF_COPY[proofStage].description}
                    requestUrl={proofRequest?.presentationRequestUrl || null}
                    requestId={proofRequest?.requestId || null}
                    review={{
                        workflowRunId: String(job?.id || ''),
                        proofStage,
                    }}
                    creating={proofCreating}
                    error={proofError}
                />
            )}
        </Drawer>
    );
}
