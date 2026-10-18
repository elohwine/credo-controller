import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Alert, Badge, Button, Collapse, Group, Image, NumberInput, Paper, Select, Stack, Text, TextInput, UnstyledButton } from '@mantine/core';
import { IconChevronDown, IconChevronRight, IconFileText } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import api from '@/lib/api';
import { getPreferredToken, getTaskContext } from '@/lib/auth';
import { registerLinkedTaskPath, TASK_CONTEXT_KEY } from '../../../shared/taskContext';
import { financePathForChainMember, purchaseReceiptLine, type PurchaseReceipt } from '@/lib/jobAuditTrail';
import type { WorkFamilyMember } from '@/lib/uxCopy';
import type { RelatedWorkLink } from '../../../shared/relatedWork';

export function useRelatedWorkNavigation() {
  const router = useRouter();
  return (member: { kind?: string; id?: string; label: string }, related: Array<{ kind?: string; id?: string; label: string }>) => {
    const path = financePathForChainMember(member);
    if (!path) return;
    try {
      if (localStorage.getItem(TASK_CONTEXT_KEY)) {
        if (!getTaskContext()) throw new Error('Open the inbox item again before continuing to related work.');
        registerLinkedTaskPath(localStorage, router.asPath, path,
          related.map(financePathForChainMember).filter((path): path is string => Boolean(path)));
      }
      void router.push(path);
    } catch (error) {
      notifications.show({ title: 'Could not open related work', message: error instanceof Error ? error.message : 'Open the item from your inbox.', color: 'red' });
    }
  };
}

export function RelatedWorkLinks({ links = [] }: { links?: RelatedWorkLink[] }) {
  const open = useRelatedWorkNavigation();
  if (!links.length) return null;
  return <Group gap={6} mt={6}>{links.map((link) => (
    <Button key={`${link.kind}:${link.id}`} size="compact-xs" variant="subtle" onClick={() => open(link, links)}>
      Open {link.label}
    </Button>
  ))}</Group>;
}

// Mirrors WorkflowHandoffService.RunHandoffsView (same as portal JobHandoffsPanel).
type Field = { name: string; label: string; type: 'text' | 'number' | 'select'; required?: boolean; options?: Array<{ value: string; label: string }> };
type Available = { key: string; label: string; description: string; holdParent: boolean; startMode: 'auto' | 'manual'; fields: Field[] };
type Step = { requestId: string; label: string; status: string; statusLabel: string };
type FinanceSummary = { transactionId: string; obligationId: string; currency: string; originalAmount: number; balanceDue: number; settledAmount: number; matchStatus?: string };
type Link = {
  id: string;
  key: string;
  label: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  holdParent: boolean;
  steps?: Step[];
  result?: { receipts?: PurchaseReceipt[] };
  finance?: FinanceSummary;
};
type View = { available: Available[]; active: Link[]; waitingFor: Link[]; billing?: { originalAmount: number; balanceDue: number; settledAmount: number; currency: string; nextDueDate?: string; paymentLinkId?: string } };

const STATUS_LABEL: Record<Link['status'], string> = { running: 'In progress', completed: 'Done', failed: 'Declined', cancelled: 'Cancelled' };
const STATUS_COLOR: Record<Link['status'], string> = { running: 'blue', completed: 'teal', failed: 'red', cancelled: 'gray' };

const PILL_COLOR: Record<string, string> = { Done: 'teal', Waiting: 'orange', Next: 'gray', Declined: 'red' };

function pillOf(status: string): WorkFamilyMember['statusLabel'] {
  const key = status.toLowerCase();
  if (key === 'completed' || key === 'paid') return 'Done';
  if (key === 'rejected' || key === 'cancelled' || key === 'failed' || key === 'declined') return 'Declined';
  if (key === 'next') return 'Next';
  return 'Waiting';
}

/** Job → purchase → bill → payment. Same cards on the request page and on Related work. */
export function FamilyStrip({ chain, holdLine, onOpen }: {
  chain: WorkFamilyMember[];
  holdLine?: string;
  onOpen?: (member: WorkFamilyMember) => void;
}) {
  if (!chain.length) return null;
  return (
    <Stack gap="xs">
      <Text size="xs" c="dimmed" fw={600}>Where this fits</Text>
      <Group gap={8} wrap="wrap" align="stretch">
        {chain.map((member, index) => {
          const open = Boolean(onOpen && member.id && !member.current && member.statusLabel !== 'Next');
          const card = (
            <Paper
              withBorder
              radius="md"
              p="sm"
              bg={member.current ? 'blue.0' : undefined}
              style={{
                borderColor: member.current ? 'var(--mantine-color-blue-4)' : undefined,
                minWidth: 148,
                opacity: member.statusLabel === 'Next' ? 0.7 : 1,
              }}
            >
              <Group justify="space-between" wrap="nowrap" gap={6}>
                <Text size="sm" fw={600}>{member.label}</Text>
                {open && <IconChevronRight size={16} color="var(--mantine-color-blue-6)" />}
              </Group>
              <Group gap={6} mt={6}>
                <Badge size="xs" color={PILL_COLOR[member.statusLabel] || 'gray'} variant="light">{member.statusLabel}</Badge>
                {member.current && <Text size="xs" c="blue">You are here</Text>}
                {open && <Text size="xs" c="blue">Open</Text>}
              </Group>
            </Paper>
          );
          return (
            <Group key={`${member.kind || 'step'}-${member.id || index}`} gap={8} wrap="nowrap" align="center">
              {index > 0 && <Text size="sm" c="dimmed">→</Text>}
              {open ? (
                <UnstyledButton onClick={() => onOpen?.(member)} aria-label={`Open ${member.label}`} style={{ cursor: 'pointer' }}>
                  {card}
                </UnstyledButton>
              ) : card}
            </Group>
          );
        })}
      </Group>
      {holdLine && <Text size="sm">{holdLine}</Text>}
    </Stack>
  );
}

function stripFor(runId: string, link: Link): WorkFamilyMember[] {
  const chain: WorkFamilyMember[] = [{
    kind: 'job',
    id: runId,
    label: 'This job',
    status: link.status,
    statusLabel: link.status === 'completed' ? 'Done' : 'Waiting',
    current: true,
  }];
  for (const step of link.steps || []) {
    chain.push({
      kind: 'request',
      id: step.requestId,
      label: step.label,
      status: step.status,
      statusLabel: pillOf(step.status),
    });
  }
  return chain;
}

function holdLineFor(link: Link): string | undefined {
  if (link.status === 'completed') return 'The job continues.';
  if (link.status === 'running' && link.holdParent) return 'The job waits for this purchase.';
  return undefined;
}

function financeLine(summary: FinanceSummary): string {
  const amount = (value: number) => `${summary.currency} ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  const match = summary.matchStatus === 'disputed' ? ' · Check the difference' : '';
  return `Purchase · Owed ${amount(summary.balanceDue)} · Paid ${amount(summary.settledAmount)}${match}`;
}

/**
 * Work this job led to, and what the worker or admin can start from it right now.
 * Opening a child on "Where this fits" goes to that child's own tab (Purchases, or Money out for
 * an order / supplier bill), the same as the website; the back button returns to the job.
 */
export default function JobHandoffsPanel({ runId, refreshKey, onChanged, onHoldChange, onOpenBilling }: {
  runId: string;
  refreshKey?: string;
  onChanged?: () => void;
  /** Tells the parent whether the job is currently waiting on related work (so step buttons can be disabled). */
  onHoldChange?: (held: boolean) => void;
  onOpenBilling?: () => void;
}) {
  const [view, setView] = useState<View | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string | number>>({});
  const [starting, setStarting] = useState(false);
  // Extra actions stay folded. The job's own step stays the one button on screen.
  const [moreOpen, setMoreOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openRelatedWork = useRelatedWorkNavigation();
  const onHoldChangeRef = useRef(onHoldChange);
  onHoldChangeRef.current = onHoldChange;
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;
  const wasHeldRef = useRef(false);

  const headers = () => {
    const token = getPreferredToken();
    return token ? { Authorization: `Bearer ${token}` } : undefined;
  };

  const load = useCallback(async () => {
    if (!runId) return;
    try {
      const res = await api.get(`/workflows/runs/${encodeURIComponent(runId)}/handoffs`, { headers: headers() });
      const next: View | null = res.data && Array.isArray(res.data.available) ? res.data : null;
      setView(next);
      const held = Boolean(next && next.waitingFor.length > 0);
      onHoldChangeRef.current?.(held);
      // The hold lifted while this screen was open (someone else finished the related work):
      // the job itself has new receipts or a new step, so let the parent reload it.
      if (wasHeldRef.current && !held) onChangedRef.current?.();
      wasHeldRef.current = held;
    } catch {
      setView(null);
      onHoldChangeRef.current?.(false);
    }
  }, [runId]);

  // Reload whenever the job moves to another step so newly unlocked hand-offs show up, and
  // poll while the job is waiting on related work so the release shows without a reload.
  useEffect(() => {
    void load();
  }, [load, refreshKey]);
  useEffect(() => {
    if (!view || view.waitingFor.length === 0) return undefined;
    const timer = setInterval(() => void load(), 15000);
    return () => clearInterval(timer);
  }, [load, view]);

  const start = async (item: Available) => {
    setStarting(true);
    setError(null);
    try {
      const res = await api.post(`/workflows/runs/${encodeURIComponent(runId)}/handoffs`, { key: item.key, input: values }, { headers: headers() });
      if (res.data?.error) throw new Error(res.data.error);
      notifications.show({
        title: `${item.label} started`,
        message: item.holdParent ? 'This job continues when it is done.' : 'It is now with the right person.',
        color: 'green',
      });
      setOpenKey(null);
      setValues({});
      await load();
      onChanged?.();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Could not start this');
    } finally {
      setStarting(false);
    }
  };

  if (!view || (view.available.length === 0 && view.active.length === 0 && !view.billing)) return null;

  return (
    <Paper id={`job-related-${runId}`} p="sm" radius="md" withBorder>
      <Stack gap="xs">
        <Text size="sm" fw={700}>Related work</Text>
        {view.billing && (
          <Paper withBorder radius="sm" p="sm">
            <Text size="sm" fw={600}>Client payment</Text>
            <Text size="xs" c="dimmed">
              Owed {view.billing.currency} {view.billing.balanceDue.toLocaleString()} · Received {view.billing.currency} {view.billing.settledAmount.toLocaleString()}
              {view.billing.nextDueDate ? ` · Next due ${new Date(view.billing.nextDueDate).toLocaleDateString()}` : ''}
            </Text>
            {view.billing.paymentLinkId && onOpenBilling && <Button size="compact-xs" variant="subtle" mt={4} onClick={onOpenBilling}>Open client billing</Button>}
          </Paper>
        )}
        {view.waitingFor.length > 0 && (
          <Alert color="orange" variant="light">
            <Text size="xs">
              This job is waiting for {view.waitingFor.map((link) => link.label.toLowerCase()).join(' and ')}. It continues when that is done.
            </Text>
          </Alert>
        )}
        {view.active.map((link) => (
          <Stack key={link.id} gap={4}>
            <Group justify="space-between">
              <Text size="sm">{link.label}</Text>
              <Badge size="sm" color={STATUS_COLOR[link.status]} variant="light">{STATUS_LABEL[link.status]}</Badge>
            </Group>
            {link.finance && <Text size="xs" c={link.finance.matchStatus === 'disputed' ? 'red' : 'dimmed'}>{financeLine(link.finance)}</Text>}
            {(link.steps || []).length > 0 && (
              <FamilyStrip
                chain={stripFor(runId, link)}
                holdLine={holdLineFor(link)}
                onOpen={(member) => openRelatedWork(member, stripFor(runId, link))}
              />
            )}
            {(link.result?.receipts || []).map((receipt, index) => (
              <Group key={`${link.id}-receipt-${index}`} gap={8} wrap="nowrap" pl="sm" align="center">
                {receipt.photoUri ? (
                  <Image src={receipt.photoUri} alt={purchaseReceiptLine(receipt)} w={40} h={40} radius="sm" style={{ objectFit: 'cover' }} />
                ) : (
                  <IconFileText size={16} />
                )}
                <Text size="xs">{purchaseReceiptLine(receipt)}</Text>
              </Group>
            ))}
          </Stack>
        ))}
        {view.available.length > 0 && !openKey && (
          <UnstyledButton onClick={() => setMoreOpen((open) => !open)} aria-expanded={moreOpen}>
            <Group gap={6} justify="space-between">
              <Text size="sm" c="blue" fw={600}>More for this job</Text>
              <IconChevronDown size={16} style={{ transform: moreOpen ? 'rotate(180deg)' : undefined }} />
            </Group>
          </UnstyledButton>
        )}
        <Collapse in={moreOpen || Boolean(openKey)}>
        {view.available.map((item) =>
          openKey === item.key ? (
            <Paper key={item.key} p="xs" radius="sm" withBorder>
              <Stack gap={6}>
                <Text size="sm" fw={600}>{item.label}</Text>
                <Text size="xs" c="dimmed">{item.description}</Text>
                {item.fields.map((field) =>
                  field.type === 'number' ? (
                    <NumberInput
                      key={field.name}
                      size="sm"
                      label={field.label}
                      required={field.required}
                      min={0}
                      value={values[field.name] as number | undefined}
                      onChange={(value) => setValues((current) => ({ ...current, [field.name]: value }))}
                    />
                  ) : field.type === 'select' ? (
                    <Select
                      key={field.name}
                      size="sm"
                      label={field.label}
                      required={field.required}
                      data={field.options || []}
                      value={String(values[field.name] ?? '') || null}
                      onChange={(value) => setValues((current) => ({ ...current, [field.name]: value || '' }))}
                    />
                  ) : (
                    <TextInput
                      key={field.name}
                      size="sm"
                      label={field.label}
                      required={field.required}
                      value={String(values[field.name] ?? '')}
                      onChange={(event) => {
                        const next = event.currentTarget.value;
                        setValues((current) => ({ ...current, [field.name]: next }));
                      }}
                    />
                  ),
                )}
                {error && <Text size="xs" c="red">{error}</Text>}
                <Group gap="xs" grow>
                  <Button size="sm" loading={starting} onClick={() => start(item)}>Start</Button>
                  <Button size="sm" variant="subtle" onClick={() => { setOpenKey(null); setError(null); }}>Cancel</Button>
                </Group>
              </Stack>
            </Paper>
          ) : (
            <Button key={item.key} size="sm" variant="light" fullWidth onClick={() => { setOpenKey(item.key); setValues({}); setError(null); }}>
              {item.label}
            </Button>
          ),
        )}
        </Collapse>
      </Stack>
    </Paper>
  );
}
