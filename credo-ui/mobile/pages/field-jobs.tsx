import React, { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, Group, Loader, Paper, Stack, Text, Title } from '@mantine/core';
import { IconActivity, IconArrowLeft, IconCamera, IconPlayerPlay, IconRefresh } from '@tabler/icons-react';
import { useRouter } from 'next/router';
import AppShellMobile from '@/components/layout/AppShellMobile';
import api from '@/lib/api';
import { getActiveOrgId, getContextMode, getPreferredToken, getWalletToken, isEmployeeOrgRole } from '@/lib/auth';

type RunRow = {
  id: string;
  status?: string;
  output?: { workflowStage?: string; stage?: string; workflowInput?: any };
  input?: any;
  createdAt?: string;
};

const FEPT_LABELS: Record<string, string> = {
  REQUEST_CREATED: 'New',
  APPROVAL_PENDING: 'Waiting for approval',
  APPROVED: 'Approved',
  ASSIGNED: 'Ready to start',
  IN_PROGRESS: 'In progress',
  EVIDENCE_CAPTURED: 'Waiting for sign-off',
  ACKNOWLEDGED: 'Signed off',
  PAYMENT_TRIGGERED: 'Payment released',
  RECEIPT_ISSUED: 'Receipt issued',
  RECONCILED: 'Closed',
  COMPLETED: 'Completed',
  DISPUTED: 'Under review',
  CANCELLED: 'Cancelled',
  REVOKED: 'Cancelled',
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
        setAccessReason('Switch to your organization to see the jobs assigned to you.');
        setRuns([]);
        return;
      }

      if (!isEmployeeOrgRole()) {
        setHasAccess(false);
        setAccessReason('Jobs are available to team members of the organization.');
        setRuns([]);
        return;
      }

      if (!hasFeptEnabled) {
        setHasAccess(false);
        setAccessReason('This organization has not set up field jobs yet.');
        setRuns([]);
        return;
      }

      if (!walletToken || !preferredToken) {
        setHasAccess(false);
        setAccessReason('Your session has expired. Please sign in to the organization again.');
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
        setAccessReason('No jobs assigned to you right now.');
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
      setAccessReason(err.response?.data?.message || err.message || 'Could not load your jobs.');
      setRuns([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAssignedRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openJob = (run: RunRow) => {
    const runId = normalizeRunId(run.id);
    if (!runId) return;
    const orgId = getActiveOrgId();
    router.push(`/finance?tab=field&runId=${encodeURIComponent(runId)}${orgId ? `&orgTenantId=${encodeURIComponent(orgId)}` : ''}`);
  };

  return (
    <AppShellMobile>
      <Stack gap="md" px="md" pt="md" pb={40}>
        <Group justify="space-between" align="center">
          <Group gap="xs">
            <Button variant="subtle" size="xs" leftSection={<IconArrowLeft size={14} />} onClick={() => router.push('/')}>
              Back
            </Button>
            <Title order={3}>My jobs</Title>
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
            <Text fw={600}>No jobs yet</Text>
            <Text size="sm" c="dimmed" mt={4}>{accessReason || 'When a job is assigned to you, it will show up here.'}</Text>
          </Paper>
        )}

        {hasAccess && !loading && runs.map((run) => {
          const stage = toStage(run);
          const stageLabel = FEPT_LABELS[stage] || stage || 'Unknown';
          const input = run.output?.workflowInput || run.input || {};
          const location = input.location || 'Field site';
          const summary = input.description || input.reference || run.id;
          const runId = normalizeRunId(run.id);
          const canStart = Boolean(runId) && new Set(['ASSIGNED', 'REQUEST_CREATED', 'APPROVED']).has(stage);
          const canCaptureEvidence = Boolean(runId) && new Set(['IN_PROGRESS']).has(stage);

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
                <Text size="xs" c="dimmed">Job ID: {run.id}</Text>

                <Group grow mt="xs">
                  {canStart && (
                    <Button
                      leftSection={<IconPlayerPlay size={14} />}
                      onClick={() => openJob(run)}
                    >
                      Start job
                    </Button>
                  )}
                  {canCaptureEvidence && (
                    <Button
                      variant="light"
                      leftSection={<IconCamera size={14} />}
                      onClick={() => openJob(run)}
                    >
                      Add photos
                    </Button>
                  )}
                  {runId && !canStart && !canCaptureEvidence && (
                    <Button variant="light" onClick={() => openJob(run)}>
                      Open job
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
