import React, { useEffect, useMemo, useState } from 'react';
import { Badge, Box, Button, Card, Group, Loader, Paper, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconActivity, IconArrowLeft, IconCamera, IconCheck, IconPlayerPlay, IconRefresh } from '@tabler/icons-react';
import { useRouter } from 'next/router';
import AppShellMobile from '@/components/layout/AppShellMobile';
import api from '@/lib/api';
import { getActiveOrgId, getContextMode, getOrgToken, getPreferredToken, getWalletToken, isEmployeeOrgRole } from '@/lib/auth';

type RunRow = {
  id: string;
  status?: string;
  output?: { workflowStage?: string; stage?: string; workflowInput?: any };
  input?: any;
  createdAt?: string;
};

const FEPT_LABELS: Record<string, string> = {
  REQUEST_CREATED: 'Request Created',
  APPROVAL_PENDING: 'Approval Pending',
  APPROVED: 'Approved',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In Progress',
  EVIDENCE_CAPTURED: 'Evidence Captured',
  ACKNOWLEDGED: 'Acknowledged',
  PAYMENT_TRIGGERED: 'Payment Triggered',
  RECEIPT_ISSUED: 'Receipt Issued',
  RECONCILED: 'Reconciled',
  COMPLETED: 'Completed',
  DISPUTED: 'Disputed',
  CANCELLED: 'Cancelled',
  REVOKED: 'Revoked',
};

function toStage(run: RunRow): string {
  return String(run.output?.workflowStage || run.output?.stage || run.status || '').toUpperCase();
}

function isFieldWorkflow(run: RunRow): boolean {
  const stage = toStage(run);
  return Boolean(FEPT_LABELS[stage]);
}

function normalizeRunId(value: unknown): string | null {
  const runId = String(value ?? '').trim();
  if (!runId) return null;

  const lowered = runId.toLowerCase();
  if (lowered === 'undefined' || lowered === 'null' || lowered === 'nan') return null;

  return runId;
}

export default function FieldJobsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [hasAccess, setHasAccess] = useState(true);
  const [accessReason, setAccessReason] = useState('');

  const hasFeptEnabled = useMemo(() => {
    try {
      const raw = localStorage.getItem('credoActiveWorkflowTypes');
      const workflows = raw ? JSON.parse(raw) : [];
      return Array.isArray(workflows) && workflows.some((w: any) => {
        const v = String(w || '').toLowerCase();
        return v.includes('field') || v.includes('fept');
      });
    } catch {
      return false;
    }
  }, []);

  const loadAssignedRuns = async () => {
    setLoading(true);
    try {
      const contextMode = getContextMode();
      const activeOrgId = getActiveOrgId();
      const walletToken = getWalletToken();
      const preferredToken = getPreferredToken();

      if (contextMode !== 'org' || !activeOrgId) {
        setHasAccess(false);
        setAccessReason('Switch to an organization context to access assigned FEPT jobs.');
        setRuns([]);
        return;
      }

      if (!isEmployeeOrgRole()) {
        setHasAccess(false);
        setAccessReason('FEPT jobs are available to organization employees only.');
        setRuns([]);
        return;
      }

      if (!hasFeptEnabled) {
        setHasAccess(false);
        setAccessReason('This organization does not have FEPT flow activated.');
        setRuns([]);
        return;
      }

      if (!walletToken || !preferredToken) {
        setHasAccess(false);
        setAccessReason('Missing active session. Please refresh your org session.');
        setRuns([]);
        return;
      }

      // Source of assignment truth for worker visibility.
      const offersRes = await api.get('/api/wallet/credentials/pending-offers', {
        headers: { Authorization: `Bearer ${walletToken}` },
      });
      const offers = Array.isArray(offersRes.data?.offers)
        ? offersRes.data.offers
        : (Array.isArray(offersRes.data) ? offersRes.data : []);

      const assignedRunIds = new Set(
        offers
          .filter((o: any) => String(o?.sourceType || '').toLowerCase() === 'workflow_assignment' || String(o?.credentialType || '').toLowerCase() === 'fieldtask')
          .map((o: any) => String(o?.workflowRunId || o?.claims?.workflowRunId || ''))
          .filter((id: string) => id.length > 0)
      );

      if (assignedRunIds.size === 0) {
        setHasAccess(true);
        setAccessReason('No assigned FEPT jobs right now.');
        setRuns([]);
        return;
      }

      // Wallet-context workflow list is already scoped to assigned runs server-side.
      const runRes = await api.get('/workflows/runs', {
        params: { limit: 100 },
        headers: { Authorization: `Bearer ${walletToken}` },
      });
      const listed = Array.isArray(runRes.data) ? runRes.data as RunRow[] : [];
      const assignedRuns = listed
        .filter((run) => assignedRunIds.has(String(run.id || '')))
        .filter(isFieldWorkflow);

      setHasAccess(true);
      setAccessReason('');
      setRuns(assignedRuns);
    } catch (err: any) {
      setHasAccess(false);
      setAccessReason(err.response?.data?.message || err.message || 'Failed to load assigned FEPT jobs.');
      setRuns([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAssignedRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startAssignedJob = async (run: RunRow) => {
    const runId = String(run.id || '');
    if (!runId) return;

    setActionLoading(runId);
    try {
      const tokenCandidates = [getWalletToken(), getOrgToken(), getPreferredToken()]
        .filter((token): token is string => typeof token === 'string' && token.length > 0)
        .filter((token, index, list) => list.indexOf(token) === index);

      let completed = false;
      let lastError: any = null;
      for (const token of tokenCandidates) {
        try {
          await api.post(`/workflows/runs/${encodeURIComponent(runId)}/resume`, {}, {
            headers: {
              Authorization: `Bearer ${token}`,
              'x-idempotency-key': `start-job:${runId}`,
            },
          });
          completed = true;
          break;
        } catch (err: any) {
          lastError = err;
        }
      }

      if (!completed) throw lastError || new Error('Unable to start this job with current credentials');

      notifications.show({
        title: 'Job Updated',
        message: 'Field workflow step was resumed successfully.',
        color: 'green',
        icon: <IconCheck size={16} />,
      });

      await loadAssignedRuns();
    } catch (err: any) {
      notifications.show({
        title: 'Action failed',
        message: err.response?.data?.error || err.response?.data?.message || err.message,
        color: 'red',
      });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <AppShellMobile>
      <Stack gap="md" px="md" pt="md" pb={40}>
        <Group justify="space-between" align="center">
          <Group gap="xs">
            <Button variant="subtle" size="xs" leftSection={<IconArrowLeft size={14} />} onClick={() => router.push('/')}>
              Back
            </Button>
            <Title order={3}>My Assigned FEPT Jobs</Title>
          </Group>
          <Button variant="light" size="xs" leftSection={<IconRefresh size={14} />} onClick={() => void loadAssignedRuns()} loading={loading}>
            Refresh
          </Button>
        </Group>

        {!hasAccess && (
          <Paper p="md" withBorder radius="md">
            <Text fw={600}>View unavailable</Text>
            <Text size="sm" c="dimmed" mt={4}>{accessReason}</Text>
          </Paper>
        )}

        {hasAccess && loading && (
          <Group justify="center" py="xl"><Loader /></Group>
        )}

        {hasAccess && !loading && runs.length === 0 && (
          <Paper p="md" withBorder radius="md">
            <Text fw={600}>No active assignments</Text>
            <Text size="sm" c="dimmed" mt={4}>{accessReason || 'You are not currently assigned to any FEPT job in this organization.'}</Text>
          </Paper>
        )}

        {hasAccess && !loading && runs.map((run) => {
          const stage = toStage(run);
          const stageLabel = FEPT_LABELS[stage] || stage || 'Unknown';
          const input = run.output?.workflowInput || run.input || {};
          const location = input.location || 'Field site';
          const summary = input.description || input.reference || run.id;
          const runId = normalizeRunId(run.id);
          const canStart = new Set(['ASSIGNED', 'REQUEST_CREATED', 'APPROVED']).has(stage);
          const canCaptureEvidence = runId && new Set(['IN_PROGRESS', 'EVIDENCE_CAPTURED']).has(stage);

          return (
            <Card key={run.id} withBorder radius="md" p="md">
              <Stack gap="xs">
                <Group justify="space-between" align="center">
                  <Group gap="xs">
                    <IconActivity size={16} />
                    <Text fw={700}>{summary}</Text>
                  </Group>
                  <Badge color="blue" variant="light">{stageLabel}</Badge>
                </Group>
                <Text size="sm" c="dimmed">Location: {location}</Text>
                <Text size="xs" c="dimmed">Run ID: {run.id}</Text>

                <Group grow mt="xs">
                  {canStart && (
                    <Button
                      leftSection={<IconPlayerPlay size={14} />}
                      loading={actionLoading === run.id}
                      onClick={() => void startAssignedJob(run)}
                    >
                      Start Job
                    </Button>
                  )}
                  {canCaptureEvidence && (
                    <Button
                      variant="light"
                      leftSection={<IconCamera size={14} />}
                      onClick={() => {
                        if (!runId) return;
                        router.push(`/finance?tab=field&runId=${encodeURIComponent(runId)}`);
                      }}
                    >
                      Capture Evidence
                    </Button>
                  )}
                </Group>
              </Stack>
            </Card>
          );
        })}
      </Stack>
    </AppShellMobile>
  );
}
