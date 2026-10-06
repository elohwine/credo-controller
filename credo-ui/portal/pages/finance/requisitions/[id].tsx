import { useState, useEffect, useContext, useCallback } from 'react';
import { useRouter } from 'next/router';
import Layout from '../../../components/Layout';
import axios from 'axios';
import { EnvContext } from '@/pages/_app';
import { useUserRole } from '@/lib/useUserRole';
import { getPreferredTenantToken } from '@/utils/portalTenant';
import {
    Container, Title, Text, Paper, Group, Stack, Button, Badge,
    Center, Loader, Divider, Textarea, Alert
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
    IconPackage,
    IconAlertCircle,
    IconWallet,
} from '@tabler/icons-react';
import StageProofModal from '../../../components/workflows/StageProofModal';
import { DetailStatusCard, type DetailTimelineItem, WorkflowDetailBody } from '../../../components/finance/WorkflowDetailBody';
import { StageActorTimeline } from '../../../components/finance/StageActorTimeline';
import { actorsForWorkflow, requisitionEventTitle, requisitionNextStep, requisitionStages, requisitionStatusColor, requisitionStatusLabel, type WorkflowActorReport } from '../../../components/finance/financeStages';
import { getOrgScopedToken, readActiveOrganization } from '@/utils/organizationContext';

import { useRequireOrgContext } from '@/lib/portalContext';
export default function RequisitionDetailPage() {
  // Org-only surface: personal sessions are redirected (mirrors mobile /finance → /inbox).
  useRequireOrgContext('/inbox');

    const env = useContext(EnvContext);
    const router = useRouter();
    const { id } = router.query;
    const baseUrl = env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
    const { isIssuer } = useUserRole();

    const [reqData, setReqData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const [showApprovalVP, setShowApprovalVP] = useState(false);
    const [creatingApprovalRequest, setCreatingApprovalRequest] = useState(false);
    const [approvalRequestId, setApprovalRequestId] = useState<string | null>(null);
    const [approvalRequestUrl, setApprovalRequestUrl] = useState<string | null>(null);
    // Release VP modal
    const [showReleaseVP, setShowReleaseVP] = useState(false);
    const [releaseRequestId, setReleaseRequestId] = useState<string | null>(null);
    const [releaseRequestUrl, setReleaseRequestUrl] = useState<string | null>(null);
    const [creatingReleaseRequest, setCreatingReleaseRequest] = useState(false);
    // Ack VP modal
    const [showAckVP, setShowAckVP] = useState(false);
    const [ackRequestId, setAckRequestId] = useState<string | null>(null);
    const [ackRequestUrl, setAckRequestUrl] = useState<string | null>(null);
    // Error from the last wallet confirmation, shown inside the open modal.
    const [stepError, setStepError] = useState<string | null>(null);
    const [creatingAckRequest, setCreatingAckRequest] = useState(false);
    const [requisitionLifecycleNote, setRequisitionLifecycleNote] = useState('Goods/services received and confirmed.');
    const [actorReports, setActorReports] = useState<WorkflowActorReport[]>([]);

    const getToken = () =>
        typeof window !== 'undefined'
            ? getPreferredTenantToken() || localStorage.getItem('walletToken')
            : null;

    const auth = () => ({ headers: { Authorization: `Bearer ${getToken()}` } });

    const fetchRequisition = useCallback(async () => {
        if (!id) return;
        const token = getToken();
        if (!token) return;
        try {
            const { data } = await axios.get(`${baseUrl}/api/finance/requisitions/${id}`, auth());
            setReqData(data);
        } catch {
            notifications.show({ title: 'Error', message: 'Could not load requisition.', color: 'red' });
        } finally {
            setLoading(false);
        }
    }, [id, baseUrl]);

    useEffect(() => { fetchRequisition(); }, [fetchRequisition]);

    useEffect(() => {
        const org = readActiveOrganization();
        const token = getOrgScopedToken();
        if (!org?.orgTenantId || !token) return;
        axios.get(`${baseUrl}/api/organizations/${encodeURIComponent(org.orgTenantId)}/workflows/actors`, {
            headers: { Authorization: `Bearer ${token}` },
        }).then((res) => {
            setActorReports(Array.isArray(res.data?.workflows) ? res.data.workflows : []);
        }).catch(() => setActorReports([]));
    }, [baseUrl]);

    const handleOpenApprovalModal = async () => {
        setShowApprovalVP(true);
        setCreatingApprovalRequest(true);
        setApprovalRequestId(null);
        setApprovalRequestUrl(null);

        try {
            const { data } = await axios.post(
                `${baseUrl}/api/finance/requisitions/${id}/approval/request`,
                {},
                auth(),
            );
            setApprovalRequestId(data.requestId);
            setApprovalRequestUrl(data.presentationRequestUrl);
        } catch (e: any) {
            notifications.show({
                title: 'Could not start approval',
                message: e?.response?.data?.error || e?.message || 'We could not prepare this step.',
                color: 'red',
            });
            setShowApprovalVP(false);
        } finally {
            setCreatingApprovalRequest(false);
        }
    };

    const handleOpenReleaseModal = async () => {
        setShowReleaseVP(true);
        setCreatingReleaseRequest(true);
        setReleaseRequestId(null);
        setReleaseRequestUrl(null);
        try {
            const { data } = await axios.post(`${baseUrl}/api/finance/requisitions/${id}/release/request`, {}, auth());
            setReleaseRequestId(data.requestId);
            setReleaseRequestUrl(data.presentationRequestUrl);
        } catch (e: any) {
            notifications.show({ title: 'Could not start the release', message: e?.response?.data?.error || e?.message || 'We could not prepare this step.', color: 'red' });
            setShowReleaseVP(false);
        } finally {
            setCreatingReleaseRequest(false);
        }
    };

    const handleOpenAckModal = async () => {
        setShowAckVP(true);
        setCreatingAckRequest(true);
        setAckRequestId(null);
        setAckRequestUrl(null);
        try {
            const { data } = await axios.post(`${baseUrl}/api/finance/requisitions/${id}/ack/request`, {}, auth());
            setAckRequestId(data.requestId);
            setAckRequestUrl(data.presentationRequestUrl);
        } catch (e: any) {
            notifications.show({ title: 'Could not start delivery confirmation', message: e?.response?.data?.error || e?.message || 'We could not prepare this step.', color: 'red' });
            setShowAckVP(false);
        } finally {
            setCreatingAckRequest(false);
        }
    };

    if (loading) {
        return <Layout title="Requisition Details"><Center py="xl"><Loader /></Center></Layout>;
    }

    if (!reqData || !reqData.summary) {
        return <Layout title="Requisition Details"><Center py="xl"><Text>Not found.</Text></Center></Layout>;
    }

    const { summary, events } = reqData;
    const signMode = reqData.approvalSignMode === 'one' ? 'one' : 'both';

    const createdEvent = Array.isArray(events)
        ? events.find((event: any) => String(event?.eventType || '').toUpperCase() === 'REQUISITION_CREATED')
        : null;
    const releasedEvent = Array.isArray(events)
        ? events.find((event: any) => String(event?.eventType || '').toUpperCase() === 'REQUISITION_RELEASED')
        : null;

    const resolvedAmount = Number(
        summary?.paymentAmount
        ?? summary?.amount
        ?? createdEvent?.metadata?.amount
        ?? createdEvent?.amount
        ?? releasedEvent?.metadata?.amount
        ?? releasedEvent?.amount
        ?? 0,
    );
    const resolvedCurrency = String(
        summary?.currency
        || summary?.paymentCurrency
        || createdEvent?.metadata?.currency
        || createdEvent?.currency
        || releasedEvent?.metadata?.currency
        || releasedEvent?.currency
        || 'USD',
    );

    const isManagerApprovalStage = summary.status === 'REQUISITION_CREATED';
    const isFinanceApprovalStage = summary.status === 'MANAGER_APPROVED';
    const canApprove = isManagerApprovalStage || isFinanceApprovalStage;
    const canRelease = summary.status === 'APPROVED' && isIssuer;
    const canAck = ['RELEASED', 'PAID', 'RECEIPT_ISSUED'].includes(String(summary.status));

    const hasEvent = (eventType: string) =>
        Array.isArray(events) && events.some((ev: any) => String(ev?.eventType || '').toUpperCase() === eventType);

    const approvalDone = signMode === 'one'
        ? hasEvent('REQUISITION_APPROVED') || hasEvent('REQUISITION_FINANCE_APPROVED') || hasEvent('REQUISITION_MANAGER_APPROVED')
        : null;
    const confirmationSlots = signMode === 'one'
        ? [approvalDone, hasEvent('REQUISITION_RELEASED'), hasEvent('EXECUTION_ACKNOWLEDGED')]
        : [
            hasEvent('REQUISITION_MANAGER_APPROVED'),
            hasEvent('REQUISITION_FINANCE_APPROVED'),
            hasEvent('REQUISITION_RELEASED'),
            hasEvent('EXECUTION_ACKNOWLEDGED'),
        ];
    const walletConfirmationsDone = confirmationSlots.filter(Boolean).length;
    const confirmationTotal = confirmationSlots.length;
    const allConfirmed = walletConfirmationsDone === confirmationTotal || summary.status === 'RECONCILED';

    // One next step at a time (same rule as the phone app).
    const nextStep = requisitionNextStep(summary.status, signMode);
    const nextStepBlocked = nextStep.action === 'release' && !isIssuer;
    const nextStepBusy = creatingApprovalRequest || creatingReleaseRequest || creatingAckRequest;
    const runNextStep = () => {
        if (nextStep.action === 'approval' && canApprove) { void handleOpenApprovalModal(); return; }
        if (nextStep.action === 'release' && canRelease) { void handleOpenReleaseModal(); return; }
        if (nextStep.action === 'ack' && canAck) { void handleOpenAckModal(); }
    };

    const requisitionAuditItems: DetailTimelineItem[] = (Array.isArray(events) ? events : []).map((ev: any) => ({
        id: String(ev.id || `${ev.eventType}-${ev.occurredAt}`),
        title: requisitionEventTitle(ev.eventType),
        source: String(ev.source || 'workflow'),
        description: (ev.actorName || ev.actorDid || ev.approverName)
            ? `By: ${ev.actorName || ev.approverName || String(ev.actorDid || '').substring(0, 20) + '…'}`
            : undefined,
        note: ev.approverRole ? `Role: ${ev.approverRole}` : undefined,
        timestamp: ev.occurredAt ? new Date(ev.occurredAt).toLocaleString() : undefined,
        badge: {
            label: 'recorded',
            color: 'teal',
        },
    }));

    return (
        <Layout title={`Requisition ${id}`}>
            <Container size="xl" py="md">
                <Group justify="space-between" mb="lg">
                    <Title order={3}>Requisition: {summary.providerRef}</Title>
                    <Badge size="lg" color={requisitionStatusColor(summary.status)}>{requisitionStatusLabel(summary.status)}</Badge>
                </Group>

                <Group align="flex-start">
                    <Paper p="xl" radius="md" withBorder style={{ flex: 1 }}>
                        <Title order={4} mb="md">Details</Title>
                        <Stack gap="sm">
                            <Group justify="space-between"><Text fw={600}>Total amount:</Text> <Text>{resolvedCurrency} {resolvedAmount.toLocaleString()}</Text></Group>
                            <Group justify="space-between"><Text fw={600}>Created:</Text> <Text>{new Date(summary.firstEventAt).toLocaleString()}</Text></Group>
                            <Group justify="space-between"><Text fw={600}>Updates:</Text> <Text>{summary.eventCount}</Text></Group>
                        </Stack>

                        <Divider my="lg" />
                        <Title order={4} mb="xs">Next step</Title>
                        <Stack gap="sm">
                            <Text size="sm" c="dimmed">{nextStep.helper}</Text>
                            {nextStep.action === 'ack' && (
                                <Textarea
                                    label="Delivery note"
                                    placeholder="Add a short note about what was delivered"
                                    minRows={2}
                                    autosize
                                    value={requisitionLifecycleNote}
                                    onChange={(e) => setRequisitionLifecycleNote(e.currentTarget.value)}
                                />
                            )}
                            {nextStep.action && !nextStepBlocked && (
                                <Button
                                    color={nextStep.action === 'approval' ? 'indigo' : nextStep.action === 'release' ? 'yellow' : 'teal'}
                                    leftSection={nextStep.action === 'ack' ? <IconPackage size={16} /> : <IconWallet size={16} />}
                                    loading={nextStepBusy}
                                    onClick={runNextStep}
                                >
                                    {nextStep.label}
                                </Button>
                            )}
                            {nextStepBlocked && (
                                <Alert color="gray" variant="light" icon={<IconAlertCircle size={16} />}>
                                    Only the person chosen to release funds for this organization can do this step.
                                </Alert>
                            )}
                        </Stack>
                    </Paper>

                    <Paper p="xl" radius="md" withBorder style={{ flex: 1 }}>
                        <Stack gap="md">
                            <Paper p="md" radius="md" withBorder>
                                <Text size="xs" c="dimmed" fw={600} mb="sm">STEP · WHO · STATUS</Text>
                                <StageActorTimeline
                                    stages={requisitionStages(summary.status, signMode)}
                                    actors={actorsForWorkflow(actorReports, ['requisition'])}
                                />
                            </Paper>
                            <WorkflowDetailBody
                                statusCard={(
                                    <DetailStatusCard
                                        status={requisitionStatusLabel(summary.status)}
                                        amount={resolvedAmount}
                                        currency={resolvedCurrency}
                                        lines={[
                                            { text: allConfirmed ? 'All confirmations done' : 'Confirmations still pending' },
                                            { text: `Reference: ${summary.providerRef}` },
                                            { text: `Confirmations done: ${walletConfirmationsDone}/${confirmationTotal}` },
                                        ]}
                                    />
                                )}
                                sections={[]}
                                auditItems={requisitionAuditItems}
                                auditEmptyText="No history yet."
                            />
                        </Stack>
                    </Paper>
                </Group>
            </Container>


            <StageProofModal
                opened={showApprovalVP}
                onClose={() => { setShowApprovalVP(false); setStepError(null); }}
                title={isManagerApprovalStage ? 'Manager approval' : 'Finance approval'}
                description="Review what your wallet will share, then confirm you are the person chosen to approve."
                requestUrl={approvalRequestUrl}
                requestId={approvalRequestId}
                review={{ requisitionId: String(id || ''), requisitionAction: 'approve' }}
                creating={creatingApprovalRequest}
                error={stepError}
            />

            <StageProofModal
                opened={showReleaseVP}
                onClose={() => { setShowReleaseVP(false); setStepError(null); }}
                title="Release funds"
                description="Review what your wallet will share, then confirm you are the person chosen to release the money."
                requestUrl={releaseRequestUrl}
                requestId={releaseRequestId}
                review={{
                    requisitionId: String(id || ''),
                    requisitionAction: 'release',
                    amount: String(resolvedAmount || 0),
                    currency: resolvedCurrency || 'USD',
                }}
                creating={creatingReleaseRequest}
                error={stepError}
            />

            <StageProofModal
                opened={showAckVP}
                onClose={() => { setShowAckVP(false); setStepError(null); }}
                title="Confirm delivery"
                description="Review what your wallet will share, then confirm the goods or services were received."
                requestUrl={ackRequestUrl}
                requestId={ackRequestId}
                review={{
                    requisitionId: String(id || ''),
                    requisitionAction: 'ack',
                    notes: requisitionLifecycleNote.trim() || 'Goods or services received.',
                }}
                creating={creatingAckRequest}
                error={stepError}
            />

        </Layout>
    );
}
