import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Stack, Text, Title, Badge, Paper, Group, Button, Skeleton, ThemeIcon, Divider, Drawer, Loader,
} from '@mantine/core';
import { IconFileText, IconBuilding, IconChevronRight, IconRefresh } from '@tabler/icons-react';
import { useRouter } from 'next/router';
import AppShellMobile from '@/components/layout/AppShellMobile';
import EmptyState from '@/components/shared/EmptyState';
import JobAuditTrailPanel from '@/components/shared/JobAuditTrailPanel';
import { StageActorTimeline } from '@/components/shared/StageActorTimeline';
import { assertRequestDetail, requestExperienceForRow, type RequestExperience } from '../../shared/requestExperience';
import { getPersonalWalletToken, getWalletToken, isAuthenticated } from '@/lib/auth';
import api from '@/lib/api';
import { formatTxnTime } from '@/lib/inboxAttention';
import { trailFromRequest } from '@/lib/jobAuditTrail';
import { requestKindLabel, requestKindLine, requestListBucket, requestStatusWords } from '@/lib/requestCatalog';

/**
 * One row in "My requests": a request raised to one of my organisations (request engine) or to
 * another organisation (quote, bill, service). Both apps show the same list.
 */
interface MyRequestRow {
  id: string;
  source: 'org' | 'business';
  kind: string;
  title: string;
  line: string;
  orgName: string;
  orgTenantId?: string;
  status: string;
  createdAt: string;
  declineReason?: string;
  experience?: RequestExperience;
}

function toOrgRow(request: any): MyRequestRow {
  const context = request?.context || (() => {
    try { return JSON.parse(request?.context_json || '{}'); } catch { return {}; }
  })();
  return {
    id: String(request.id),
    source: 'org',
    kind: String(request.request_type || ''),
    title: String(request.title || requestKindLabel(request.request_type)),
    line: requestKindLine(request.request_type, context) || requestKindLabel(request.request_type),
    orgName: String(request.org_name || ''),
    orgTenantId: request.org_tenant_id ? String(request.org_tenant_id) : undefined,
    status: String(request.status || 'submitted'),
    experience: request.experience,
    createdAt: String(request.created_at || request.createdAt || new Date().toISOString()),
  };
}

function toBusinessRow(request: any): MyRequestRow {
  const payload = (request?.payload || {}) as Record<string, any>;
  const title = String(payload.title || payload.description || payload.serviceName || requestKindLabel(request.requestType));
  return {
    id: String(request.id),
    source: 'business',
    kind: String(request.requestType || ''),
    title,
    line: requestKindLabel(request.requestType),
    orgName: String(request.targetOrgName || request.contactName || 'Organisation'),
    orgTenantId: request.targetOrgTenantId ? String(request.targetOrgTenantId) : undefined,
    status: String(request.status || 'pending'),
    createdAt: String(request.createdAt || new Date().toISOString()),
    declineReason: request.rejectionReason ? String(request.rejectionReason) : undefined,
  };
}

function RequestCard({ row, onClick }: { row: MyRequestRow; onClick: () => void }) {
  const status = requestStatusWords(row.status);
  const sentAt = formatTxnTime(row.createdAt);
  return (
    <Paper component="button" type="button" p="sm" radius="md" withBorder onClick={onClick} style={{ cursor: 'pointer', width: '100%', textAlign: 'left' }}>
      <Group wrap="nowrap" gap="sm">
        <ThemeIcon size={32} radius="md" variant="light" color={status.color}>
          <IconFileText size={17} />
        </ThemeIcon>
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Group gap="xs" wrap="nowrap">
            <Text size="sm" fw={600} lineClamp={1} style={{ flex: 1 }}>{row.title}</Text>
            <Badge size="xs" variant="light" color={status.color} styles={{ root: { maxWidth: 100 }, label: { overflow: 'hidden', textOverflow: 'ellipsis' } }}>
              {status.label}
            </Badge>
          </Group>
          {row.line && row.line !== row.title && (
            <Text size="xs" c="dimmed" lineClamp={1} mt={3}>{row.line}</Text>
          )}
          <Group gap={4} mt={3} wrap="nowrap">
            <IconBuilding size={12} color="#94a3b8" />
            <Text size="xs" c="dimmed" lineClamp={1} style={{ flex: 1 }}>{row.orgName}</Text>
            <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>· Sent {sentAt || '—'}</Text>
          </Group>
        </Box>
        <IconChevronRight size={18} color="#94a3b8" />
      </Group>
    </Paper>
  );
}

export default function MyRequestsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<MyRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [selected, setSelected] = useState<MyRequestRow | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [detailError, setDetailError] = useState('');
  const detailAttempt = useRef(0);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login?redirect=/my-requests');
      return;
    }
    setCheckingAuth(false);
  }, [router]);

  useEffect(() => {
    if (checkingAuth) return;
    void loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkingAuth]);

  const loadRequests = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const token = getPersonalWalletToken() || getWalletToken();
      if (!token) {
        router.push('/login');
        return;
      }
      const headers = { Authorization: `Bearer ${token}` };
      const [mineResult, outboundResult] = await Promise.allSettled([
        api.get('/api/platform/requests/mine', { headers, params: { limit: 100 } }),
        api.get('/workflow-requests/outbound', { headers }),
      ]);
      const mine = mineResult.status === 'fulfilled' ? mineResult.value : null;
      const outbound = outboundResult.status === 'fulfilled' ? outboundResult.value : null;
      if (!mine || !outbound) {
        setLoadError(!mine && !outbound ? 'Could not load your requests. Try again.'
          : `Could not load ${!mine ? 'organisation' : 'business'} requests. This list is incomplete; try again.`);
      }
      const orgRows = (Array.isArray(mine?.data?.items) ? mine!.data.items : []).map(toOrgRow);
      const businessList = Array.isArray(outbound?.data) ? outbound!.data : Array.isArray(outbound?.data?.requests) ? outbound!.data.requests : [];
      const businessRows = businessList.map(toBusinessRow);
      setRows([...orgRows, ...businessRows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    } catch (error) {
      console.error('Failed to load requests:', error);
      setLoadError('Could not load your requests. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const openRow = async (row: MyRequestRow) => {
    const attempt = ++detailAttempt.current;
    setSelected(row);
    setDetail(null);
    setDetailError('');
    const token = getPersonalWalletToken() || getWalletToken();
    if (!token) return;
    setDetailLoading(true);
    try {
      const path = row.source === 'org' ? `/api/platform/requests/mine/${encodeURIComponent(row.id)}`
        : `/workflow-requests/${encodeURIComponent(row.id)}`;
      const res = await api.get(path, { headers: { Authorization: `Bearer ${token}` } });
      if (detailAttempt.current !== attempt) return;
      assertRequestDetail(res.data, row.id);
      setDetail(res.data || null);
    } catch {
      if (detailAttempt.current === attempt) setDetailError('Could not load this request. Close it and try again.');
    } finally {
      if (detailAttempt.current === attempt) setDetailLoading(false);
    }
  };

  const trail = useMemo(() => (detail && selected?.source === 'org' ? trailFromRequest(detail, Array.isArray(detail.people) ? detail.people : []) : null), [detail, selected?.source]);
  const progress = selected ? requestExperienceForRow(detail || selected) : null;
  const whoDid = Object.fromEntries((progress?.stages || []).flatMap((stage) => {
    const actor = detail?.people?.find((person: { userId: string }) => person.userId === stage.actorUserId);
    return actor?.displayName ? [[stage.key, actor.displayName]] : [];
  }));

  const open = rows.filter((row) => requestListBucket(row.kind, row.status) === 'waiting');
  const done = rows.filter((row) => requestListBucket(row.kind, row.status) === 'done');
  const other = rows.filter((row) => requestListBucket(row.kind, row.status) === 'closed');

  if (checkingAuth || loading) {
    return (
      <AppShellMobile>
        <Box p="md">
          <Skeleton height={40} mb="md" />
          <Skeleton height={100} mb="sm" />
          <Skeleton height={100} mb="sm" />
          <Skeleton height={100} />
        </Box>
      </AppShellMobile>
    );
  }

  const section = (label: string, list: MyRequestRow[], divider: boolean) =>
    list.length > 0 && (
      <Box>
        {loadError && <Alert color="red" m="md" title="Requests could not be fully loaded">{loadError}</Alert>}
        {divider && <Divider my="md" />}
        <Text size="sm" fw={600} mb="sm" c="dimmed">{label} ({list.length})</Text>
        <Stack gap="sm">
          {list.map((row) => (
            <RequestCard key={`${row.source}:${row.id}`} row={row} onClick={() => void openRow(row)} />
          ))}
        </Stack>
      </Box>
    );

  return (
    <AppShellMobile>
      <Box>
        <Box
          p="md"
          style={{
            background: 'light-dark(color-mix(in srgb, var(--mantine-color-white) 74%, transparent), color-mix(in srgb, var(--mantine-color-dark-6) 78%, transparent))',
            borderBottom: '1px solid rgba(148,163,184,0.2)',
            backdropFilter: 'blur(12px) saturate(150%)',
          }}
        >
          <Group justify="space-between" align="center">
            <Box>
              <Title order={3}>My requests</Title>
              <Text size="sm" c="dimmed">Everything you asked for, and where it is.</Text>
            </Box>
            <Button variant="subtle" size="xs" leftSection={<IconRefresh size={14} />} onClick={() => void loadRequests()}>
              Refresh
            </Button>
          </Group>
        </Box>

        {rows.length === 0 ? (
          <Box p="md">
            <EmptyState
              icon={<IconFileText size={26} />}
              title="Nothing asked for yet"
              description="Use Request on Home to ask for time off, an expense, a payout, a record sent again, or a quote from a business."
            />
            <Group justify="center" mt="sm">
              <Button onClick={() => router.push('/')}>Go to Home</Button>
            </Group>
          </Box>
        ) : (
          <Stack gap="md" p="md">
            {section('Waiting', open, false)}
            {section('Done', done, open.length > 0)}
            {section('Declined or closed', other, open.length > 0 || done.length > 0)}
          </Stack>
        )}

        <Box style={{ height: 80 }} />
      </Box>

      <Drawer
        opened={Boolean(selected)}
        onClose={() => { detailAttempt.current += 1; setSelected(null); setDetailLoading(false); }}
        position="bottom"
        size="80%"
        radius="lg"
        title={<Text fw={700}>{selected?.title || 'Request'}</Text>}
      >
        {selected && (
          <Stack gap="md">
            <Group gap="xs">
              <Badge variant="light" color={requestStatusWords(selected.status).color}>{requestStatusWords(selected.status).label}</Badge>
              <Text size="sm" c="dimmed">{selected.orgName}</Text>
            </Group>
            {selected.line && <Text size="sm">{selected.line}</Text>}
            {selected.declineReason && <Text size="sm" c="red">Declined: {selected.declineReason}</Text>}
            {detail?.description && <Text size="sm">{detail.description}</Text>}
            {detailLoading && <Group justify="center"><Loader size="sm" /></Group>}
            {detailError && <Alert color="red">{detailError}</Alert>}
            {!detailLoading && !detailError && progress && (
              <StageActorTimeline
                stages={progress.stages}
                whoDid={whoDid}
                title="Request progress"
                help={{ title: 'Request progress', points: [
                  "This shows the request's own review and fulfilment, not every payment or record in related work.",
                  'History below records who acted and when. Skipped steps are not recorded as completed.',
                  'An approval does not mean a credential was issued or accepted.',
                ] }}
              />
            )}
            {selected.source === 'org' && trail && <JobAuditTrailPanel trail={trail} compact embedded subject="request" />}
            {selected.source === 'business' && (
              <Text size="sm" c="dimmed">
                {requestListBucket(selected.kind, selected.status) === 'waiting'
                  ? 'The organisation has it. Their answer arrives in your inbox.'
                  : 'Anything they sent back is in your inbox and your records.'}
              </Text>
            )}
            {selected.source === 'business' && selected.orgTenantId && (
              <Button variant="light" onClick={() => router.push(`/organizations/${encodeURIComponent(selected.orgTenantId!)}?source=discover`)}>
                Open the organisation
              </Button>
            )}
          </Stack>
        )}
      </Drawer>
    </AppShellMobile>
  );
}
