import { PRODUCT_NAME } from '@/utils/orgProfile'
import { useEffect, useState, useContext } from 'react';
import Head from 'next/head';
import Layout from '@/components/Layout';
import { Alert, Badge, Box, Button, Group, NumberInput, Paper, SimpleGrid, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { IconAlertCircle, IconClipboardList, IconFilter, IconRefresh, IconShieldCheck, IconUser, IconWorld } from '@tabler/icons-react';
import { StatTile } from '../../../shared/StatTile';
import { EnvContext } from '@/pages/_app';
import { getOrgScopedToken } from '@/utils/organizationContext';
import { getPreferredTenantToken } from '@/utils/portalTenant';


interface AuditLog {
  id: string;
  tenantId: string;
  actorDid?: string;
  actionType: string;
  resourceId?: string;
  details?: object;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

const actionColor = (action: string) => {
  if (action.includes('create') || action.includes('issue')) return 'green';
  if (action.includes('delete') || action.includes('revoke')) return 'red';
  if (action.includes('update') || action.includes('approve')) return 'blue';
  return 'gray';
};

const ActionBadge: React.FC<{ action: string }> = ({ action }) => (
  <Badge variant="light" color={actionColor(action)} size="sm" tt="none">
    {action}
  </Badge>
);

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [limit, setLimit] = useState(100);
  const [resourceId, setResourceId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const env = useContext(EnvContext);
  const backendUrl = env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      if (resourceId) params.set('resourceId', resourceId);

      const token = getOrgScopedToken() || getPreferredTenantToken() || localStorage.getItem('walletToken') || '';
      const url = resourceId
        ? `${backendUrl}/workflows/runs/${encodeURIComponent(resourceId)}/audit`
        : `${backendUrl}/api/audit/logs?${params.toString()}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Failed to load audit logs');
      const data = await res.json();
      setLogs(
        resourceId
          ? (data.rows || []).map((row: any) => ({
              id: row.id,
              tenantId: '',
              actorDid: row.person,
              actionType: row.event,
              resourceId,
              details: { status: row.status, stage: row.stage, evidence: row.evidence, confirmation: row.confirmation },
              createdAt: row.occurredAt,
            }))
          : data || [],
      );
    } catch (err: any) {
      setError(err.message || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Layout>
      <Head>
        <title>{`Audit Logs | ${PRODUCT_NAME} Portal`}</title>
      </Head>
      <Stack gap="lg" p={{ base: 'sm', sm: 'lg' }}>
        {/* Header */}
        <div>
          <Title order={2}>Audit Logs</Title>
          <Text size="sm" c="dimmed" mt={4}>Tamper-aware operational trail across platform actions</Text>
        </div>

        {/* Stats */}
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
          <StatTile label="Total Logs" value={logs.length} icon={IconClipboardList} />
          <StatTile label="Unique Actors" value={new Set(logs.map(l => l.actorDid).filter(Boolean)).size} icon={IconUser} />
          <StatTile label="Unique Resources" value={new Set(logs.map(l => l.resourceId).filter(Boolean)).size} icon={IconShieldCheck} />
          <StatTile label="Unique IPs" value={new Set(logs.map(l => l.ipAddress).filter(Boolean)).size} icon={IconWorld} />
        </SimpleGrid>

        {/* Filters */}
        <Paper withBorder radius="md" p="lg">
          <Group gap="xs" mb="md">
            <Box c="dimmed" style={{ display: 'flex' }}><IconFilter size={18} /></Box>
            <Title order={4}>Filter Logs</Title>
          </Group>
          <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
            <TextInput
              label="Resource ID (optional)"
              value={resourceId}
              onChange={(e) => setResourceId(e.currentTarget.value)}
              placeholder="e.g. RUN-2026-01"
            />
            <NumberInput
              label="Limit"
              value={limit}
              onChange={(value) => setLimit(Number(value))}
              min={10}
              max={500}
              allowDecimal={false}
            />
            <Group align="flex-end">
              <Button onClick={fetchLogs} loading={loading} leftSection={<IconRefresh size={16} />}>
                Refresh Logs
              </Button>
            </Group>
          </SimpleGrid>
        </Paper>

        {error && (
          <Alert color="red" variant="light" icon={<IconAlertCircle size={18} />}>{error}</Alert>
        )}

        {/* Table */}
        <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
          <Table.ScrollContainer minWidth={720}>
            <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
              <Table.Thead bg="var(--mantine-color-default-hover)">
                <Table.Tr>
                  <Table.Th>Time</Table.Th>
                  <Table.Th>Action</Table.Th>
                  <Table.Th>Resource</Table.Th>
                  <Table.Th>Actor</Table.Th>
                  <Table.Th>IP</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {logs.map((log) => (
                  <Table.Tr key={log.id}>
                    <Table.Td><Text size="xs" c="dimmed">{new Date(log.createdAt).toLocaleString()}</Text></Table.Td>
                    <Table.Td><ActionBadge action={log.actionType} /></Table.Td>
                    <Table.Td><Text size="sm" ff="monospace">{log.resourceId || '—'}</Text></Table.Td>
                    <Table.Td><Text size="sm" c="dimmed">{log.actorDid ? `${log.actorDid.substring(0, 20)}...` : '—'}</Text></Table.Td>
                    <Table.Td><Text size="xs" c="dimmed">{log.ipAddress || '—'}</Text></Table.Td>
                  </Table.Tr>
                ))}
                {logs.length === 0 && !loading && (
                  <Table.Tr>
                    <Table.Td colSpan={5}>
                      <Text ta="center" size="sm" c="dimmed" py="xl">No audit logs found</Text>
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      </Stack>
    </Layout>
  );
}
