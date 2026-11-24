import { useEffect, useState, useContext, type ReactNode } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Anchor, Badge, Group, Paper, SimpleGrid, Stack, Text, Title, UnstyledButton } from '@mantine/core';
import { IconBeach, IconChevronRight, IconChecklist, IconReceipt, IconReceipt2, IconUsers } from '@tabler/icons-react';
import Layout from '@/components/Layout';
import { formatCurrency } from '@/lib/theme';
import { EnvContext } from '@/pages/_app';
import { requestStatusWords } from '@/lib/requestCatalog';
import { getOrgScopedToken, getPersonalToken, readActiveOrganization } from '@/utils/organizationContext';
import { PRODUCT_NAME } from '../../../../src/config/productEdition';
import { usePortalOperations } from '@/lib/operations';
import { useRequireOrgContext } from '@/lib/portalContext';
import { PeopleDirectory } from '../../../shared/people/PeopleDirectory';
import { StatTile } from '../../../shared/StatTile';

/** A time-off or expense request from the platform request engine. */
interface HrRequest {
  id: string;
  title?: string;
  amount?: number | null;
  currency?: string | null;
  status?: string;
}

const WAITING_STATUSES = new Set(['submitted', 'pending', 'in_review', 'under_review']);

function RequestList({ title, empty, items, render }: { title: string; empty: string; items: HrRequest[]; render: (item: HrRequest) => ReactNode }) {
  return (
    <Paper withBorder radius="md" p="md">
      <Text fw={600} size="sm" mb="xs">{title}</Text>
      {items.length === 0 ? (
        <Text size="sm" c="dimmed" py="sm">{empty}</Text>
      ) : (
        <Stack gap={0}>
          {items.slice(0, 5).map((item) => (
            <UnstyledButton
              key={item.id}
              component={Link}
              href={`/requests?request=${encodeURIComponent(item.id)}`}
              py={8}
              style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}
            >
              <Group justify="space-between" wrap="nowrap" gap="sm">
                <Text size="sm" lineClamp={1}>{render(item)}</Text>
                <Badge variant="light" color="gray" size="sm" style={{ flexShrink: 0 }}>{requestStatusWords(item.status).label}</Badge>
              </Group>
            </UnstyledButton>
          ))}
        </Stack>
      )}
    </Paper>
  );
}

/**
 * The team directory is the single place to manage employee details and app access.
 * Payroll and people requests remain separate workflows within HR operations.
 */
export default function HRHub() {
  useRequireOrgContext('/inbox');
  const router = useRouter();
  const env = useContext(EnvContext);
  const backendUrl = env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';
  const { api, notify } = usePortalOperations();

  const [leaveRequests, setLeaveRequests] = useState<HrRequest[]>([]);
  const [expenseClaims, setExpenseClaims] = useState<HrRequest[]>([]);
  const [lastRun, setLastRun] = useState<{ period: string; status: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const org = readActiveOrganization();
        const token = (org?.orgTenantId ? getOrgScopedToken() : null) || getPersonalToken();
        if (!token) return;
        const headers = { Authorization: `Bearer ${token}` };
        const requestsOf = async (requestType: string): Promise<HrRequest[]> => {
          const res = await fetch(`${backendUrl}/api/platform/requests?requestType=${encodeURIComponent(requestType)}&limit=20`, { headers });
          if (!res.ok) return [];
          const data = await res.json();
          return Array.isArray(data?.items) ? data.items : [];
        };
        const latestRun = async () => {
          const res = await fetch(`${backendUrl}/api/payroll/runs`, { headers });
          const data = res.ok ? await res.json() : [];
          return Array.isArray(data) && data.length ? data[0] : null;
        };
        const [leaveData, expenseData, run] = await Promise.all([
          requestsOf('hr.leave'),
          requestsOf('finance.expense_claim'),
          latestRun().catch(() => null),
        ]);
        setLeaveRequests(leaveData);
        setExpenseClaims(expenseData);
        setLastRun(run);
      } catch (err: any) {
        setError(err.message || 'Could not load HR requests');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [backendUrl]);

  const pendingLeave = leaveRequests.filter((l) => WAITING_STATUSES.has(String(l.status))).length;
  const pendingExpenses = expenseClaims.filter((e) => WAITING_STATUSES.has(String(e.status))).length;
  const org = readActiveOrganization();

  return (
    <Layout>
      <Head>
        <title>{`Team | ${PRODUCT_NAME} Portal`}</title>
      </Head>

      <Stack gap="lg" p={{ base: 'sm', sm: 'lg' }}>
        <div>
          <Title order={2}>Team</Title>
          <Text size="sm" c="dimmed" mt={4}>
            The people who work for {org?.name || 'this organisation'}: their details, what they can do in the app, and what is waiting on them.
          </Text>
        </div>

        {error && <Text c="red" size="sm">{error}</Text>}

        <SimpleGrid cols={{ base: 1, xs: 3 }} spacing="sm">
          <StatTile label="Time off waiting" value={loading ? '…' : pendingLeave} icon={IconBeach} alert={pendingLeave > 0} color="orange" hint="Needs a decision" onClick={() => void router.push('/hr/operations')} />
          <StatTile label="Expenses waiting" value={loading ? '…' : pendingExpenses} icon={IconReceipt2} alert={pendingExpenses > 0} color="orange" hint="Needs a decision" onClick={() => void router.push('/hr/operations')} />
          <StatTile
            label="Last payroll"
            value={loading ? '…' : lastRun?.period || 'None yet'}
            icon={IconReceipt}
            hint={lastRun ? (lastRun.status === 'draft' ? 'Calculated, payslips not sent' : 'Payslips sent') : 'Run the first pay period'}
            onClick={() => void router.push('/payroll')}
          />
        </SimpleGrid>

        <Paper withBorder radius="md" p={{ base: 'sm', sm: 'lg' }}>
          <Group gap="xs" mb="sm">
            <IconUsers size={18} stroke={1.6} />
            <Title order={4}>People</Title>
          </Group>
          <PeopleDirectory
            api={api}
            orgTenantId={org?.orgTenantId || ''}
            surface="portal"
            role={String(org?.role || '').toLowerCase()}
            notify={notify}
            onOpenJob={(runId) => { window.location.href = `/finance/job-cards?runId=${encodeURIComponent(runId)}`; }}
          />
        </Paper>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          <RequestList title="Recent time off" empty="No time off asked for yet." items={leaveRequests} render={(req) => req.title || 'Time off'} />
          <RequestList
            title="Recent expense claims"
            empty="No expenses claimed yet."
            items={expenseClaims}
            render={(claim) => `${claim.title || 'Expense claim'}${claim.amount ? ` · ${formatCurrency(claim.amount, claim.currency || 'USD')}` : ''}`}
          />
        </SimpleGrid>
        <Group gap="lg">
          <Anchor component={Link} href="/requests?tab=people" size="sm">
            <Group gap={4}><IconChecklist size={14} /> All staff requests <IconChevronRight size={14} /></Group>
          </Anchor>
          <Anchor component={Link} href="/hr/operations" size="sm">
            <Group gap={4}>Ask for time off or claim an expense <IconChevronRight size={14} /></Group>
          </Anchor>
        </Group>
      </Stack>
    </Layout>
  );
}
