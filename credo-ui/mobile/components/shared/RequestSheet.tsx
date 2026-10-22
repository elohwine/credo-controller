import React, { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon, Alert, Badge, Box, Button, Drawer, Group, Loader, NumberInput, Select, Stack, Text,
  Textarea, TextInput, ThemeIcon, UnstyledButton,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconArrowLeft, IconBriefcase, IconCalendar, IconCash, IconChevronRight, IconCoins, IconFileText,
  IconId, IconMessage, IconReceipt, IconSearch, IconShoppingCart, IconTool,
} from '@tabler/icons-react';
import { useRouter } from 'next/router';
import { api } from '@/lib/api';
import ReceiptProofField, { receiptProofPayload, type ReceiptProof } from '@/components/shared/ReceiptProofField';
import { getPersonalWalletToken, getWalletToken } from '@/lib/auth';
import {
  EXPENSE_CATEGORIES, LEAVE_TYPES, REQUEST_GROUP_WORDS, requestGroupsIn, requestKindsFor, resendStatusWords,
  type RequestContext, type RequestKind, type RequestKindIcon, type RequestOptions, type RequestRouteKey,
} from '@/lib/requestCatalog';

/** Where each "open a screen" row goes on the phone. */
const ROUTES: Record<RequestRouteKey, string> = {
  discover: '/organizations?activeTab=discover',
  purchase_request: '/finance?tab=requisitions',
  new_job: '/intake',
  collect_payment: '/finance?tab=ar',
  my_requests: '/my-requests',
};

const ICONS: Record<RequestKindIcon, React.ReactNode> = {
  calendar: <IconCalendar size={20} />,
  receipt: <IconReceipt size={20} />,
  cash: <IconCash size={20} />,
  message: <IconMessage size={20} />,
  id: <IconId size={20} />,
  file: <IconFileText size={20} />,
  briefcase: <IconBriefcase size={20} />,
  search: <IconSearch size={20} />,
  cart: <IconShoppingCart size={20} />,
  tool: <IconTool size={20} />,
  coins: <IconCoins size={20} />,
};

const GROUP_COLORS: Record<RequestKind['group'], string> = {
  my_orgs: 'blue',
  my_records: 'teal',
  businesses: 'indigo',
  org_ops: 'grape',
};

interface RequestSheetProps {
  opened: boolean;
  onClose: () => void;
  context: RequestContext;
  /** Open straight on one row (from a Home shortcut). */
  initialKindId?: string;
}

function daysBetween(start: string, end: string): number {
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

function errorMessage(error: any, fallback: string): string {
  return String(error?.response?.data?.message || error?.response?.data?.error || error?.message || fallback);
}

/**
 * The Request sheet behind the Home "Request" button. One entry, three groups (four in
 * organisation context), context-aware. The same sheet exists on the website.
 */
export default function RequestSheet({ opened, onClose, context, initialKindId }: RequestSheetProps) {
  const router = useRouter();
  const [options, setOptions] = useState<RequestOptions | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [active, setActive] = useState<RequestKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [askOrgFor, setAskOrgFor] = useState<RequestKind | null>(null);
  const [receipt, setReceipt] = useState<ReceiptProof | null>(null);

  const walletToken = () => getPersonalWalletToken() || getWalletToken();

  useEffect(() => {
    if (!opened) return;
    setActive(null);
    setAskOrgFor(null);
    setForm({});
    setReceipt(null);
    const token = walletToken();
    if (!token) {
      setOptions(null);
      setLoadError('Sign in to see what you can ask for.');
      return;
    }
    setLoading(true);
    setLoadError('');
    api
      .get('/api/platform/requests/options', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => setOptions(res.data || null))
      .catch((error) => {
        setOptions(null);
        setLoadError(errorMessage(error, 'Could not load your options.'));
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  const rows = useMemo(() => requestKindsFor(options, context), [options, context]);
  const groups = useMemo(() => requestGroupsIn(rows), [rows]);

  // From a Home shortcut: land on the chosen row once the options are in.
  useEffect(() => {
    if (!opened || !initialKindId || loading || active) return;
    const row = rows.find((entry) => entry.id === initialKindId);
    if (row) void openRow(row);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, initialKindId, loading, rows]);

  const finish = (message: string, go?: string) => {
    notifications.show({ title: 'Sent', message, color: 'green' });
    onClose();
    if (go) void router.push(go);
  };

  const raise = async (kind: RequestKind, body: Record<string, unknown>) => {
    const token = walletToken();
    if (!token || !kind.orgTenantId) throw new Error('Sign in again to send this.');
    const idempotencyKey = `raise:${kind.id}:${kind.orgTenantId}:${JSON.stringify(body).length}:${Date.now().toString(36).slice(0, 6)}`;
    return api.post(
      '/api/platform/requests/raise',
      { orgTenantId: kind.orgTenantId, requestType: kind.id, ...body },
      { headers: { Authorization: `Bearer ${token}`, 'x-idempotency-key': idempotencyKey } },
    );
  };

  const openRow = async (kind: RequestKind) => {
    if (kind.disabledLine) return;
    if (kind.routeKey) {
      onClose();
      const extra = kind.id.startsWith('business.') ? `&ask=${encodeURIComponent(kind.id.replace('business.', ''))}` : '';
      void router.push(`${ROUTES[kind.routeKey]}${extra}`);
      return;
    }
    if (kind.recordItem) {
      await resend(kind);
      return;
    }
    setForm({});
    setActive(kind);
  };

  const resend = async (kind: RequestKind) => {
    const token = walletToken();
    if (!token || !kind.recordItem) return;
    setBusy(true);
    try {
      const res = await api.post(
        '/api/wallet/credentials/resend-mine',
        { item: kind.recordItem, orgTenantId: kind.orgTenantId },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const words = resendStatusWords(res.data?.status, kind.recordItem, res.data?.count);
      if (res.data?.status === 'ask_org' && kind.orgTenantId) {
        setAskOrgFor(kind);
        notifications.show({ title: words.title, message: res.data?.detail || words.message, color: words.color });
        return;
      }
      notifications.show({ title: words.title, message: words.message, color: words.color });
      if (res.data?.status === 'queued') {
        onClose();
        void router.push('/inbox');
      }
    } catch (error: any) {
      notifications.show({ title: 'Could not send', message: errorMessage(error, 'Try again in a moment.'), color: 'red' });
    } finally {
      setBusy(false);
    }
  };

  const askOrgForRecord = async () => {
    if (!askOrgFor?.recordItem) return;
    setBusy(true);
    try {
      await raise(
        { ...askOrgFor, id: 'platform.general' },
        {
          title: `Please send my ${askOrgFor.label.split(' · ')[0].toLowerCase()} again`,
          description: 'I no longer have this record on my phone.',
          context: { purposeCode: 'resend_record', referenceCode: askOrgFor.recordItem },
        },
      );
      finish(`${askOrgFor.orgName || 'The organisation'} has your request.`, '/my-requests');
    } catch (error: any) {
      notifications.show({ title: 'Could not send', message: errorMessage(error, 'Try again in a moment.'), color: 'red' });
    } finally {
      setBusy(false);
    }
  };

  const submitForm = async () => {
    if (!active) return;
    setBusy(true);
    try {
      if (active.id === 'hr.leave') {
        if (!form.leaveType || !form.startDate || !form.endDate) throw new Error('Pick the kind of leave and the dates.');
        const days = daysBetween(form.startDate, form.endDate);
        if (days <= 0) throw new Error('The last day must be on or after the first day.');
        const typeLabel = LEAVE_TYPES.find((entry) => entry.value === form.leaveType)?.label || 'Leave';
        await raise(active, {
          title: `${typeLabel} · ${days} day${days === 1 ? '' : 's'}`,
          description: form.reason?.trim() || undefined,
          context: { leaveType: form.leaveType, startDate: form.startDate, endDate: form.endDate, days, coverRef: form.cover?.trim() || undefined },
        });
        finish('Your manager has your leave request.', '/my-requests');
        return;
      }
      if (active.id === 'finance.expense_claim') {
        const amount = Number(form.amount);
        if (!form.description?.trim()) throw new Error('Say what the money was for.');
        if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter the amount you spent.');
        await raise(active, {
          title: form.description.trim().slice(0, 80),
          description: form.description.trim(),
          amount,
          currency: form.currency || 'USD',
          context: { categoryCode: form.category || 'other', receiptRef: form.receiptRef?.trim() || undefined, merchantRef: form.merchant?.trim() || undefined },
          ...receiptProofPayload(receipt),
        });
        finish('Your manager has your expense claim.', '/my-requests');
        return;
      }
      if (active.id === 'finance.payout_request') {
        const job = active.payoutJob;
        if (!job) throw new Error('This job is no longer waiting for a payout.');
        await raise(active, {
          title: `Payout for job ${job.reference}`,
          description: form.note?.trim() || undefined,
          amount: job.amount,
          currency: job.currency,
          context: { workflowRunId: job.workflowRunId },
        });
        finish('The payout person has your request.', '/my-requests');
        return;
      }
      if (!form.title?.trim()) throw new Error('Give your request a short title.');
      const purchase = active.id === 'procurement.requisition';
      const estimatedAmount = Number(form.amount);
      if (purchase && (!Number.isFinite(estimatedAmount) || estimatedAmount <= 0)) throw new Error('Enter a positive estimated amount.');
      await raise(active, {
        title: form.title.trim().slice(0, 120),
        description: form.description?.trim() || undefined,
        ...(purchase && { amount: estimatedAmount, currency: form.currency || 'USD' }),
        context: purchase ? {} : { purposeCode: 'general' },
      });
      finish(`${active.orgName || 'The organisation'} has your request.`, '/my-requests');
    } catch (error: any) {
      notifications.show({ title: 'Not sent', message: errorMessage(error, 'Try again in a moment.'), color: 'red' });
    } finally {
      setBusy(false);
    }
  };

  const renderForm = () => {
    if (!active) return null;
    const to = active.orgName ? `To ${active.orgName}` : '';
    if (active.id === 'hr.leave') {
      const days = form.startDate && form.endDate ? daysBetween(form.startDate, form.endDate) : 0;
      return (
        <Stack gap="sm">
          {to && <Text size="sm" c="dimmed">{to}. Your manager decides.</Text>}
          <Select label="Kind of leave" data={LEAVE_TYPES} value={form.leaveType || null} onChange={(value) => setForm({ ...form, leaveType: value || '' })} required />
          <Group grow>
            <TextInput type="date" label="First day" value={form.startDate || ''} onChange={(e) => setForm({ ...form, startDate: e.currentTarget.value })} required />
            <TextInput type="date" label="Last day" value={form.endDate || ''} onChange={(e) => setForm({ ...form, endDate: e.currentTarget.value })} required />
          </Group>
          {days > 0 && <Text size="sm">{days} day{days === 1 ? '' : 's'}</Text>}
          <TextInput label="Who covers for you (optional)" value={form.cover || ''} onChange={(e) => setForm({ ...form, cover: e.currentTarget.value })} />
          <Textarea label="Reason (optional)" minRows={2} value={form.reason || ''} onChange={(e) => setForm({ ...form, reason: e.currentTarget.value })} />
        </Stack>
      );
    }
    if (active.id === 'finance.expense_claim') {
      return (
        <Stack gap="sm">
          {to && <Text size="sm" c="dimmed">{to}. Your manager decides; finance pays you back.</Text>}
          <Textarea label="What was it for" minRows={2} value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.currentTarget.value })} required />
          <Group grow>
            <NumberInput label="Amount" min={0} decimalScale={2} value={form.amount ? Number(form.amount) : ''} onChange={(value) => setForm({ ...form, amount: String(value ?? '') })} required />
            <Select label="Currency" data={['USD', 'ZWG', 'ZAR']} value={form.currency || 'USD'} onChange={(value) => setForm({ ...form, currency: value || 'USD' })} />
          </Group>
          <Select label="Category" data={EXPENSE_CATEGORIES} value={form.category || null} onChange={(value) => setForm({ ...form, category: value || '' })} />
          <TextInput label="Where you paid (optional)" value={form.merchant || ''} onChange={(e) => setForm({ ...form, merchant: e.currentTarget.value })} />
          <TextInput label="Receipt number (optional)" value={form.receiptRef || ''} onChange={(e) => setForm({ ...form, receiptRef: e.currentTarget.value })} />
          <ReceiptProofField
            label="Receipt (optional)"
            hint="Take a photo of the slip, or attach a receipt record from your wallet. Your manager sees it before deciding."
            value={receipt}
            onChange={setReceipt}
          />
        </Stack>
      );
    }
    if (active.id === 'finance.payout_request') {
      const job = active.payoutJob;
      return (
        <Stack gap="sm">
          <Alert color="blue" variant="light">
            Job {job?.reference} is signed off and waiting for its payment{job?.amount ? ` of ${job.currency || ''} ${job.amount}` : ''}.
            This sends a reminder to the person who releases it.
          </Alert>
          <Textarea label="Add a note (optional)" minRows={2} value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.currentTarget.value })} />
        </Stack>
      );
    }
    return (
      <Stack gap="sm">
        {to && <Text size="sm" c="dimmed">{to}.</Text>}
        <TextInput label="What do you need" value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.currentTarget.value })} required />
        {active.id === 'procurement.requisition' && (
          <Group grow>
            <NumberInput label="Estimated amount" min={0} decimalScale={2} value={form.amount ? Number(form.amount) : ''} onChange={(value) => setForm({ ...form, amount: String(value ?? '') })} required />
            <Select label="Currency" data={['USD', 'ZWG', 'ZAR']} value={form.currency || 'USD'} onChange={(value) => setForm({ ...form, currency: value || 'USD' })} />
          </Group>
        )}
        <Textarea label="Details (optional)" minRows={3} value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.currentTarget.value })} />
      </Stack>
    );
  };

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="bottom"
      size="88%"
      radius="lg"
      padding="md"
      title={
        active ? (
          <Group gap="xs">
            <ActionIcon variant="subtle" onClick={() => setActive(null)} aria-label="Back">
              <IconArrowLeft size={18} />
            </ActionIcon>
            <Text fw={700}>{active.label}</Text>
          </Group>
        ) : (
          <Text fw={700}>Request</Text>
        )
      }
    >
      {active ? (
        <Stack gap="md">
          {renderForm()}
          <Button onClick={() => void submitForm()} loading={busy} fullWidth>Send</Button>
        </Stack>
      ) : (
        <Stack gap="lg">
          {loading && (
            <Group justify="center" py="md"><Loader size="sm" /></Group>
          )}
          {!loading && loadError && (
            <Alert color="orange" variant="light">{loadError}</Alert>
          )}
          {askOrgFor && (
            <Alert color="blue" variant="light" title="Ask the organisation" withCloseButton onClose={() => setAskOrgFor(null)}>
              <Stack gap="xs">
                <Text size="sm">{askOrgFor.orgName || 'The organisation'} sends this record from its side. Send them a request now.</Text>
                <Button size="xs" onClick={() => void askOrgForRecord()} loading={busy}>Ask {askOrgFor.orgName || 'them'}</Button>
              </Stack>
            </Alert>
          )}
          {!loading && !loadError && groups.length === 0 && (
            <Text size="sm" c="dimmed">Nothing to ask for right now.</Text>
          )}
          {groups.map((group) => (
            <Box key={group}>
              <Text size="xs" fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: '0.05em' }}>{REQUEST_GROUP_WORDS[group].title}</Text>
              <Text size="xs" c="dimmed" mb="xs">{REQUEST_GROUP_WORDS[group].line}</Text>
              <Stack gap={6}>
                {rows.filter((row) => row.group === group).map((row) => (
                  <UnstyledButton
                    key={`${row.id}:${row.orgTenantId || ''}:${row.payoutJob?.workflowRunId || ''}`}
                    onClick={() => void openRow(row)}
                    disabled={busy || Boolean(row.disabledLine)}
                    style={{ opacity: row.disabledLine ? 0.6 : 1 }}
                  >
                    <Group wrap="nowrap" gap="sm" p="xs" style={{ borderRadius: 12, border: '1px solid var(--mantine-color-default-border)' }}>
                      <ThemeIcon size={38} radius="md" variant="light" color={GROUP_COLORS[row.group]}>
                        {ICONS[row.icon]}
                      </ThemeIcon>
                      <Box style={{ flex: 1, minWidth: 0 }}>
                        <Text size="sm" fw={600} truncate>{row.label}</Text>
                        <Text size="xs" c="dimmed" lineClamp={2}>{row.line}</Text>
                      </Box>
                      {row.disabledLine ? (
                        <Badge size="xs" variant="light" color="gray">{row.disabledLine}</Badge>
                      ) : (
                        <IconChevronRight size={16} color="var(--mantine-color-dimmed)" />
                      )}
                    </Group>
                  </UnstyledButton>
                ))}
              </Stack>
            </Box>
          ))}
          <Button variant="light" fullWidth onClick={() => { onClose(); void router.push(ROUTES.my_requests); }}>
            See my requests
          </Button>
        </Stack>
      )}
    </Drawer>
  );
}
