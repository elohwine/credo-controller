import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/router';
import { Alert, Badge, Button, Card, Collapse, Group, Image, NumberInput, Paper, Select, Stack, Text, TextInput, UnstyledButton } from '@mantine/core';
import { IconChevronDown, IconChevronRight, IconFileText, IconHourglass } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { getOrgScopedToken } from '@/utils/organizationContext';
import { getPreferredTenantToken } from '@/utils/portalTenant';
import { financePathForChainMember, purchaseReceiptLine, type PurchaseReceipt } from '@/components/finance/jobAuditTrail';
import { type WorkFamilyMember } from '@/components/finance/financeStages';
import { getPortalTask } from '@/lib/portalContext';
import { registerLinkedTaskPath, TASK_CONTEXT_KEY } from '../../../shared/taskContext';
import type { RelatedWorkLink } from '../../../shared/relatedWork';
import { jobBillingPath } from '../../../shared/relatedWork';

export function useJobBillingNavigation() {
    const router = useRouter();
    return (runId: string, linkId?: string) => {
        const path = jobBillingPath(runId, linkId);
        try {
            if (localStorage.getItem(TASK_CONTEXT_KEY)) {
                if (!getPortalTask()) throw new Error('Open the inbox item again before continuing to billing.');
                registerLinkedTaskPath(localStorage, router.asPath, path, [path]);
            }
            void router.push(path);
        } catch (error) {
            notifications.show({ title: 'Could not open client billing', message: error instanceof Error ? error.message : 'Open the job again.', color: 'red' });
        }
    };
}

export function useRelatedWorkNavigation() {
    const router = useRouter();
    return (member: { kind?: string; id?: string; label: string }, related: Array<{ kind?: string; id?: string; label: string }>) => {
        const path = financePathForChainMember(member);
        if (!path) return;
        try {
            if (localStorage.getItem(TASK_CONTEXT_KEY)) {
                if (!getPortalTask()) throw new Error('Open the inbox item again before continuing to related work.');
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

// Mirrors WorkflowHandoffService.RunHandoffsView
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
    startedAt?: string;
    steps?: Step[];
    result?: { receipts?: PurchaseReceipt[] };
    finance?: FinanceSummary;
};
type View = { available: Available[]; active: Link[]; waitingFor: Link[]; billing?: { originalAmount: number; balanceDue: number; settledAmount: number; currency: string; nextDueDate?: string; paymentLinkId?: string } };

const STATUS_LABEL: Record<Link['status'], string> = {
    running: 'In progress',
    completed: 'Done',
    failed: 'Declined',
    cancelled: 'Cancelled',
};
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
 * Work this job led to (a quote for extra work, buying materials) and what it can start now.
 * Only what the organization allows for the current step is offered.
 */
export default function JobHandoffsPanel({ runId, refreshKey, onChanged, onHoldChange }: {
    runId: string;
    refreshKey?: string;
    onChanged?: () => void;
    /** Tells the parent whether the job is currently waiting on related work (so step buttons can be disabled). */
    onHoldChange?: (held: boolean) => void;
}) {
    const [view, setView] = useState<View | null>(null);
    const [openKey, setOpenKey] = useState<string | null>(null);
    const [values, setValues] = useState<Record<string, string | number>>({});
    const [starting, setStarting] = useState(false);
    // Extra actions stay folded. The job's own step stays the one button on screen.
    const [moreOpen, setMoreOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const openRelatedWork = useRelatedWorkNavigation();
    const openBilling = useJobBillingNavigation();
    const onHoldChangeRef = useRef(onHoldChange);
    onHoldChangeRef.current = onHoldChange;
    const onChangedRef = useRef(onChanged);
    onChangedRef.current = onChanged;
    const wasHeldRef = useRef(false);

    const backend = ((typeof window !== 'undefined' && (window as any).__ENV?.NEXT_PUBLIC_VC_REPO) as string) || 'http://localhost:3000';
    const token = () => getOrgScopedToken() || getPreferredTenantToken();

    const load = useCallback(async () => {
        const t = token();
        if (!t || !runId) return;
        try {
            const { data } = await axios.get<View>(`${backend}/workflows/runs/${runId}/handoffs`, { headers: { Authorization: `Bearer ${t}` } });
            const next: View | null = data && Array.isArray((data as View).available) ? data : null;
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
    }, [backend, runId]);

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
        const t = token();
        if (!t) return;
        setStarting(true);
        setError(null);
        try {
            const { data } = await axios.post(
                `${backend}/workflows/runs/${runId}/handoffs`,
                { key: item.key, input: values },
                { headers: { Authorization: `Bearer ${t}`, 'x-idempotency-key': `handoff-${runId}-${item.key}-${JSON.stringify(values)}` } },
            );
            if (data?.error) throw new Error(data.error);
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
        <Card withBorder radius="md">
            <Text fw={600} mb="xs">Related work</Text>
            <Stack gap="sm">
                {view.billing && (
                    <Paper withBorder radius="sm" p="sm">
                        <Text size="sm" fw={600}>Client payment</Text>
                        <Text size="xs" c="dimmed">
                            Owed {view.billing.currency} {view.billing.balanceDue.toLocaleString()} · Received {view.billing.currency} {view.billing.settledAmount.toLocaleString()}
                            {view.billing.nextDueDate ? ` · Next due ${new Date(view.billing.nextDueDate).toLocaleDateString()}` : ''}
                        </Text>
                        {view.billing.paymentLinkId && <Button size="compact-xs" variant="subtle" mt={4} onClick={() => openBilling(runId, view.billing?.paymentLinkId)}>Open client billing</Button>}
                    </Paper>
                )}
                {view.waitingFor.length > 0 && (
                    <Alert color="orange" variant="light" icon={<IconHourglass size={16} />}>
                        This job is waiting for {view.waitingFor.map((link) => link.label.toLowerCase()).join(' and ')}. It continues when that is done.
                    </Alert>
                )}

                {view.active.map((link) => (
                    <Stack key={link.id} gap={4}>
                        <Group justify="space-between">
                            <Text size="sm">{link.label}</Text>
                            <Badge color={STATUS_COLOR[link.status]} variant="light">{STATUS_LABEL[link.status]}</Badge>
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
                            <Group key={`${link.id}-receipt-${index}`} gap={8} wrap="nowrap" pl="md" align="center">
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
                {view.available.map((item) => (
                    <Stack key={item.key} gap={6}>
                        {openKey === item.key ? (
                            <Card withBorder radius="sm" p="sm">
                                <Stack gap="xs">
                                    <Text size="sm" fw={600}>{item.label}</Text>
                                    <Text size="xs" c="dimmed">{item.description}</Text>
                                    {item.fields.map((field) =>
                                        field.type === 'number' ? (
                                            <NumberInput
                                                key={field.name}
                                                label={field.label}
                                                required={field.required}
                                                min={0}
                                                value={values[field.name] as number | undefined}
                                                onChange={(value) => setValues((current) => ({ ...current, [field.name]: value }))}
                                            />
                                        ) : field.type === 'select' ? (
                                            <Select
                                                key={field.name}
                                                label={field.label}
                                                required={field.required}
                                                data={field.options || []}
                                                value={String(values[field.name] ?? '') || null}
                                                onChange={(value) => setValues((current) => ({ ...current, [field.name]: value || '' }))}
                                            />
                                        ) : (
                                            <TextInput
                                                key={field.name}
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
                                    <Group gap="xs">
                                        <Button size="xs" loading={starting} onClick={() => start(item)}>Start</Button>
                                        <Button size="xs" variant="subtle" onClick={() => { setOpenKey(null); setError(null); }}>Cancel</Button>
                                    </Group>
                                </Stack>
                            </Card>
                        ) : (
                            <Button
                                size="xs"
                                variant="light"
                                onClick={() => { setOpenKey(item.key); setValues({}); setError(null); }}
                                style={{ alignSelf: 'flex-start' }}
                            >
                                {item.label}
                            </Button>
                        )}
                    </Stack>
                ))}
                </Collapse>
            </Stack>
        </Card>
    );
}
